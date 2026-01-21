/**
 * Main orchestrator for pip module installation.
 * Coordinates the pipeline: install → extract types → generate WIT → compile → generate JS/TS
 */

import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { logger } from '../utils/logger.js';
import { ensureDirectory, getPipModulesDirectory, writeFileContent } from '../utils/file-utils.js';
import { resolveAndInstallPackage, ResolvedPackage } from './package-resolver.js';
import { extractTypes, TypeExtractionResult } from './type-extractor.js';
import { generateWITForPip } from './wit-generator.js';
import { compilePipToWasm } from './wasm-compiler.js';
import { generateJSBindings } from './js-generator.js';
import { generateTypeDeclarations } from './dts-generator.js';
import { compileToPyodide, writePyodideOutput } from './pyodide-compiler.js';
import { PipTypeSchema } from './type-schema.js';

export interface PipInstallOptions {
  force?: boolean;
  skipValidation?: boolean;
}

export interface PipInstallResult {
  packageName: string;
  version: string;
  outputDir: string;
  files: string[];
}

/**
 * Install a Python package for TypeScript import.
 * This is the main entry point for the pip-install command.
 */
export async function pipInstall(
  packageSpec: string,
  options: PipInstallOptions = {}
): Promise<PipInstallResult> {
  logger.info(`Installing pip package: ${packageSpec}`);

  // Phase 1: Resolve and install the package
  logger.startSpinner('Installing Python package...');
  const resolvedPackage = await resolveAndInstallPackage(packageSpec, options);
  logger.succeedSpinner(`Installed ${resolvedPackage.name}@${resolvedPackage.version}`);

  // Phase 2: Extract type information
  logger.startSpinner('Extracting type information...');
  const typeResult = await extractTypes(resolvedPackage);
  logger.succeedSpinner(`Extracted types from ${typeResult.schema.modules.length} module(s)`);
  logger.info(`Type annotation coverage: ${typeResult.coverage.toFixed(2)}%`);

  // Check if this package uses Pyodide runtime
  const usePyodide = resolvedPackage.curatedInfo?.runtime === 'pyodide';

  if (usePyodide) {
    // Pyodide compilation path (for packages with native extensions)
    return await pipInstallPyodide(resolvedPackage, typeResult.schema);
  }

  // Standard componentize-py compilation path
  return await pipInstallComponentizePy(resolvedPackage, typeResult.schema);
}

/**
 * Install a package using Pyodide runtime (for native extension packages)
 */
async function pipInstallPyodide(
  resolvedPackage: ResolvedPackage,
  schema: PipTypeSchema
): Promise<PipInstallResult> {

  // Phase 3: Generate JavaScript bindings and write output files
  logger.startSpinner('Generating bindings...');
  const pyodideResult = await compileToPyodide(schema, resolvedPackage);
  const outputDir = await writePyodideOutput(resolvedPackage, schema, pyodideResult);
  logger.succeedSpinner('Done');

  const files = [
    join(outputDir, 'index.js'),
    join(outputDir, 'index.d.ts'),
    join(outputDir, 'package.json')
  ];

  // Add pyodide to user's package.json
  const addedDeps = await addDependenciesToPackageJson({ 'pyodide': '^0.27.0' });

  logger.info(`\nUsage:`);
  logger.info(`  import { ... } from './umo_modules/${resolvedPackage.name}/index.js';`);
  if (addedDeps.length > 0) {
    logger.info(`\nAdded to package.json: ${addedDeps.join(', ')}`);
    logger.info(`Run: npm install`);
  }

  return {
    packageName: resolvedPackage.name,
    version: resolvedPackage.version,
    outputDir,
    files
  };
}

/**
 * Install a package using componentize-py (standard WASM component path)
 */
async function pipInstallComponentizePy(
  resolvedPackage: ResolvedPackage,
  schema: PipTypeSchema
): Promise<PipInstallResult> {
  // Phase 3: Generate WIT interface
  logger.startSpinner('Generating WIT interface...');
  const witPath = await generateWITForPip(schema, resolvedPackage);
  logger.succeedSpinner('Generated WIT interface');

  // Phase 4: Compile to WASM
  logger.startSpinner('Compiling to WASM (this may take a while)...');
  const wasmPath = await compilePipToWasm(schema, witPath, resolvedPackage);
  logger.succeedSpinner('Compiled to WASM');

  // Phase 5: Generate JS bindings and TypeScript declarations
  logger.startSpinner('Generating bindings...');
  const { indexJs, bindingsDir } = await generateJSBindings(wasmPath, schema, resolvedPackage);
  const dtsContent = await generateTypeDeclarations(schema);

  // Phase 6: Write output files
  const outputDir = await writeOutputFiles(resolvedPackage, schema, {
    indexJs,
    dtsContent,
    wasmPath,
    bindingsDir
  });
  logger.succeedSpinner('Done');

  const files = [
    join(outputDir, 'index.js'),
    join(outputDir, 'index.d.ts'),
    join(outputDir, `${resolvedPackage.name}.wasm`),
    join(outputDir, 'package.json')
  ];

  // Add preview2-shim to user's package.json
  const addedDeps = await addDependenciesToPackageJson({ '@bytecodealliance/preview2-shim': '^0.17.0' });

  logger.info(`\nUsage:`);
  logger.info(`  import { ... } from './umo_modules/${resolvedPackage.name}/index.js';`);
  if (addedDeps.length > 0) {
    logger.info(`\nAdded to package.json: ${addedDeps.join(', ')}`);
    logger.info(`Run: npm install`);
  }

  return {
    packageName: resolvedPackage.name,
    version: resolvedPackage.version,
    outputDir,
    files
  };
}

/**
 * Add dependencies to the user's package.json if not already present.
 * Returns list of newly added packages.
 */
async function addDependenciesToPackageJson(deps: Record<string, string>): Promise<string[]> {
  const packageJsonPath = join(process.cwd(), 'package.json');
  const added: string[] = [];

  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (!pkg.dependencies) {
      pkg.dependencies = {};
    }

    for (const [name, version] of Object.entries(deps)) {
      if (!pkg.dependencies[name]) {
        pkg.dependencies[name] = version;
        added.push(name);
      }
    }

    if (added.length > 0) {
      await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  } catch {
    // No package.json or can't read it - skip
  }

  return added;
}

/**
 * Write all output files to the umo_modules directory
 */
async function writeOutputFiles(
  pkg: ResolvedPackage,
  schema: PipTypeSchema,
  generated: {
    indexJs: string;
    dtsContent: string;
    wasmPath: string;
    bindingsDir: string;
  }
): Promise<string> {
  const pipModulesDir = getPipModulesDirectory();
  const outputDir = join(pipModulesDir, pkg.name);
  await ensureDirectory(outputDir);

  // Write index.js
  await writeFileContent(join(outputDir, 'index.js'), generated.indexJs);

  // Write index.d.ts
  await writeFileContent(join(outputDir, 'index.d.ts'), generated.dtsContent);

  // Copy WASM file
  const { copyFile } = await import('fs/promises');
  await copyFile(generated.wasmPath, join(outputDir, `${pkg.name}.wasm`));

  // Copy bindings directory
  const { cp } = await import('fs/promises');
  await cp(generated.bindingsDir, join(outputDir, 'bindings'), { recursive: true });

  // Write package.json
  const packageJson = {
    name: `@umo_modules/${pkg.name}`,
    version: pkg.version,
    type: 'module',
    main: 'index.js',
    types: 'index.d.ts',
    files: ['index.js', 'index.d.ts', `${pkg.name}.wasm`, 'bindings/'],
    umo: {
      pythonPackage: pkg.name,
      pythonVersion: pkg.version,
      compiledAt: new Date().toISOString(),
      modules: schema.modules.map(m => m.name)
    }
  };
  await writeFileContent(join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  return outputDir;
}
