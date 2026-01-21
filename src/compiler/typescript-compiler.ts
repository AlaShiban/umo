import { join } from 'path';
import { Module } from '../parser/types.js';
import { WITFile } from '../wit/generator.js';
import {
  getComponentsDirectory,
  writeFileContent,
  ensureDirectory,
} from '../utils/file-utils.js';
import { CompilationError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { executeCompiler, checkToolAvailable } from './compiler-bridge.js';
import { extractNpmPackages, extractOriginalImports } from '../parser/typescript-parser.js';
import { execa } from 'execa';

export interface TypeScriptCompileResult {
  componentPath: string;
  success: boolean;
}

export async function compileTypeScript(
  module: Module,
  witFile: WITFile
): Promise<TypeScriptCompileResult> {
  logger.debug(`Compiling TypeScript module: ${module.path}`);

  const componentDir = getComponentsDirectory();
  await ensureDirectory(componentDir);

  const moduleName = module.path
    .split('/')
    .pop()
    ?.replace(/\.(ts|js)$/, '') || 'module';

  const moduleDir = join(componentDir, moduleName);
  await ensureDirectory(moduleDir);

  // Detect and install third-party npm packages
  const packages = extractNpmPackages(module.content);
  if (packages.length > 0) {
    logger.debug(`Detected npm packages: ${packages.join(', ')}`);
    await installNpmPackages(packages, moduleDir);
  }

  // Step 1: Create JavaScript wrapper that implements the WIT interface
  const wrapperPath = join(moduleDir, 'index.js');
  await createJavaScriptWrapper(module, wrapperPath);

  // Step 2: If we have npm dependencies, bundle them using esbuild
  let componentizePath = 'index.js';
  if (packages.length > 0) {
    const bundlePath = join(moduleDir, 'bundle.js');
    await bundleWithEsbuild(wrapperPath, bundlePath, moduleDir);
    componentizePath = 'bundle.js';
  }

  // Step 3: Componentize using jco
  const componentPath = join(componentDir, `${moduleName}.component.wasm`);

  const jcoResult = await executeCompiler(
    'npx',
    [
      'jco',
      'componentize',
      componentizePath,  // Relative to moduleDir
      '--wit',
      witFile.witPath,
      '--world-name',
      moduleName,
      '-o',
      componentPath,
    ],
    'jco componentize',
    moduleDir
  );

  if (!jcoResult.success) {
    throw new CompilationError(
      `Failed to compile TypeScript module: ${module.path}`,
      jcoResult.errors?.join('\n')
    );
  }

  logger.debug(`Compiled TypeScript module to: ${componentPath}`);

  return {
    componentPath,
    success: true,
  };
}

async function createJavaScriptWrapper(
  module: Module,
  wrapperPath: string
): Promise<void> {
  // Generate JavaScript that implements the WIT interface
  // jco expects exports to be grouped by interface name with camelCase function names

  // Extract and include original imports (non-umo)
  const originalImports = extractOriginalImports(module.content);
  const importsSection = originalImports.length > 0
    ? originalImports.join('\n') + '\n\n'
    : '';

  const functions = module.exports.map(fn => {
    // Use the original camelCase name (jco converts from kebab-case WIT to camelCase JS)
    const jsName = fn.name;

    // Generate function implementation
    return `  ${jsName}(${fn.params.map(p => p.name).join(', ')}) {
    ${generateFunctionBody(fn, module.content)}
  }`;
  }).join(',\n');

  const wrapper = `// JavaScript wrapper for ${module.path}
// Implements WIT interface for component model

${importsSection}export const api = {
${functions}
};
`;

  await writeFileContent(wrapperPath, wrapper);
}

function generateFunctionBody(fn: any, moduleContent: string): string {
  // Extract the actual function implementation from the module content
  // For MVP, we'll inline a simplified version

  // Find the function in the source
  const functionRegex = new RegExp(
    `function\\s+${fn.name}\\s*\\([^)]*\\)\\s*(?::\\s*\\w+\\s*)?\\{([\\s\\S]*?)\\n\\}`,
    'm'
  );
  const match = moduleContent.match(functionRegex);

  if (match) {
    return match[1].trim();
  }

  // Fallback: return a placeholder
  return `throw new Error("Function ${fn.name} not implemented");`;
}

/**
 * Bundle JavaScript with dependencies using esbuild.
 * This creates a self-contained bundle that componentize-js can process.
 */
async function bundleWithEsbuild(inputPath: string, outputPath: string, cwd: string): Promise<void> {
  logger.debug(`Bundling ${inputPath} with esbuild...`);

  try {
    // Use npx esbuild to bundle the file
    await execa('npx', [
      'esbuild',
      inputPath,
      '--bundle',
      '--format=esm',
      '--platform=neutral',  // Don't include Node.js built-ins
      '--target=es2020',
      `--outfile=${outputPath}`,
    ], {
      cwd,
      stdio: 'pipe'
    });
    logger.debug(`Successfully bundled to ${outputPath}`);
  } catch (error) {
    logger.debug(`Warning: esbuild bundle had issues: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw error;
  }
}

/**
 * Install npm packages in the specified directory.
 * Uses pnpm if available, then npm as fallback.
 */
async function installNpmPackages(packages: string[], targetDir: string): Promise<void> {
  if (packages.length === 0) return;

  logger.debug(`Installing npm packages in ${targetDir}: ${packages.join(', ')}`);

  // Create a minimal package.json if it doesn't exist
  const packageJsonPath = join(targetDir, 'package.json');
  const { existsSync } = await import('fs');
  if (!existsSync(packageJsonPath)) {
    await writeFileContent(packageJsonPath, JSON.stringify({
      name: 'umo-component',
      version: '1.0.0',
      type: 'module',
      dependencies: {}
    }, null, 2));
  }

  // Try pnpm first (faster), then npm
  try {
    await execa('pnpm', ['add', ...packages], {
      cwd: targetDir,
      stdio: 'pipe'
    });
    logger.debug(`Successfully installed packages using pnpm: ${packages.join(', ')}`);
    return;
  } catch (error) {
    logger.debug(`pnpm install failed, trying npm: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  // Fall back to npm
  try {
    await execa('npm', ['install', '--save', ...packages], {
      cwd: targetDir,
      stdio: 'pipe'
    });
    logger.debug(`Successfully installed packages using npm: ${packages.join(', ')}`);
  } catch (error) {
    logger.debug(`Warning: npm install had issues: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
