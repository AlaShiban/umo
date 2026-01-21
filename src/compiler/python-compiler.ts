import { join } from 'path';
import { Module } from '../parser/types.js';
import { WITFile } from '../wit/generator.js';
import {
  getComponentsDirectory,
  getBuildDirectory,
  writeFileContent,
  ensureDirectory,
} from '../utils/file-utils.js';
import { CompilationError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { executeCompiler, checkToolAvailable } from './compiler-bridge.js';
import { extractPythonPackages } from '../parser/python-parser.js';
import { execa } from 'execa';

export interface PythonCompileResult {
  componentPath: string;
  success: boolean;
}

export async function compilePython(
  module: Module,
  witFile: WITFile
): Promise<PythonCompileResult> {
  logger.debug(`Compiling Python module: ${module.path}`);

  // Check if componentize-py is available
  await checkToolAvailable(
    'componentize-py',
    'componentize-py (Python to WASM Component compiler)'
  );

  // Detect and install third-party Python packages
  const packages = extractPythonPackages(module.content);
  let sitePackagesPath: string | null = null;
  if (packages.length > 0) {
    logger.debug(`Detected Python packages: ${packages.join(', ')}`);
    sitePackagesPath = await installPythonPackages(packages);
    if (sitePackagesPath) {
      logger.debug(`Python site-packages: ${sitePackagesPath}`);
    }
  }

  const componentDir = getComponentsDirectory();
  await ensureDirectory(componentDir);

  const moduleName = module.path
    .split('/')
    .pop()
    ?.replace(/\.py$/, '') || 'module';

  const componentPath = join(componentDir, `${moduleName}.component.wasm`);
  const bindingsDir = join(componentDir, 'bindings');

  // Step 1: Generate Python bindings
  logger.debug('Generating Python bindings...');
  // componentize-py -d <wit-dir> expects:
  //   wit-dir/<package>.wit (main package)
  //   wit-dir/deps/<dep>/<dep>.wit (dependencies)
  const { dirname, basename } = await import('path');
  const witFileName = basename(witFile.witPath);
  const witParentDir = dirname(witFile.witPath);
  const parentDirName = basename(witParentDir);

  // Determine the WIT directory
  let witDir: string;
  if (parentDirName === 'wit') {
    // WIT is at wit/<package>.wit - use this directory
    witDir = witParentDir;
  } else if (parentDirName === 'deps' || witParentDir.includes('/deps/')) {
    // WIT is at wit/deps/<package>/<package>.wit
    // Need to go up to find wit/ directory
    const grandParentDir = dirname(witParentDir);
    const grandParentName = basename(grandParentDir);
    if (grandParentName === 'deps') {
      witDir = dirname(grandParentDir); // wit/
    } else {
      witDir = grandParentDir; // Already at wit/
    }
  } else {
    // Default: assume parent is wit/
    witDir = witParentDir;
  }

  logger.debug(`WIT file: ${witFile.witPath}`);
  logger.debug(`WIT dir for componentize-py: ${witDir}`);
  logger.debug(`Module name: ${moduleName}`);

  const bindingsResult = await executeCompiler(
    'componentize-py',
    [
      '-d',
      witDir,
      '-w',
      moduleName,
      'bindings',
      bindingsDir,
    ],
    'componentize-py bindings'
  );

  if (!bindingsResult.success) {
    throw new CompilationError(
      `Failed to generate bindings for Python module: ${module.path}`,
      bindingsResult.errors?.join('\n')
    );
  }

  // Step 2: Create a wrapper Python file that implements the WIT interface
  const wrapperModuleName = `${moduleName}_impl`;
  const wrapperPath = join(componentDir, `${wrapperModuleName}.py`);
  await createPythonWrapper(module, wrapperPath, bindingsDir);

  // Step 3: Compile using componentize-py (run from components dir so module is found)
  // Build the componentize args, including site-packages path if we have third-party packages
  const componentizeArgs = [
    '-d',
    witDir,
    '-w',
    moduleName,
    'componentize',
  ];

  // Add python paths: first the component dir (for main_impl), then site-packages (for deps)
  // The -p flag can be specified multiple times
  componentizeArgs.push('-p', componentDir);
  if (sitePackagesPath) {
    componentizeArgs.push('-p', sitePackagesPath);
  }

  componentizeArgs.push(wrapperModuleName, '-o', componentPath);

  const result = await executeCompiler(
    'componentize-py',
    componentizeArgs,
    'componentize-py componentize',
    componentDir
  );

  if (!result.success) {
    throw new CompilationError(
      `Failed to compile Python module: ${module.path}`,
      result.errors?.join('\n')
    );
  }

  logger.debug(`Compiled Python module to: ${componentPath}`);

  return {
    componentPath,
    success: true,
  };
}

async function createPythonWrapper(
  module: Module,
  wrapperPath: string,
  bindingsDir: string
): Promise<void> {
  // Generate proper componentize-py wrapper
  // Import the protocol from generated bindings and implement it

  const imports: string[] = [];
  const classImpl: string[] = [];

  // Add import for the Api protocol
  imports.push('from wit_world.exports import Api as ApiProtocol');

  // If module has umo imports, add imports from wit_world.imports
  if (module.imports && module.imports.length > 0) {
    imports.push('from wit_world.imports import api as imports_api');
  }

  // Extract and include original Python imports (non-umo)
  const originalImports = extractOriginalImports(module.content);
  if (originalImports.length > 0) {
    imports.push('');
    imports.push(...originalImports);
  }

  imports.push('');

  // Create class that implements the interface
  classImpl.push('class Api(ApiProtocol):');

  // Add each exported function
  for (const func of module.exports) {
    const params = func.params.map(p => `${p.name}: ${mapWITTypeToPython(p.type)}`).join(', ');
    const returnType = mapWITTypeToPython(func.returnType);

    classImpl.push(`    def ${func.name}(self${params ? ', ' + params : ''}) -> ${returnType}:`);

    // Try to generate a working implementation by adapting the original code
    const impl = generateFunctionImplementation(func, module);
    classImpl.push(impl);
    classImpl.push('');
  }

  const commentedCode = '';

  const wrapper = `${imports.join('\n')}

# Original module code (for functions to call)
# Note: In MVP, cross-module calls are not yet implemented
${commentedCode}

${classImpl.join('\n')}
`;

  await writeFileContent(wrapperPath, wrapper);
}

function mapWITTypeToPython(witType: string): string {
  switch (witType) {
    case 'string':
      return 'str';
    case 's32':
      return 'int';
    case 'f64':
      return 'float';
    case 'bool':
      return 'bool';
    default:
      return 'str';
  }
}

function generateFunctionImplementation(func: any, module: Module): string {
  // For the main function, extract its body from the original code
  // Convert function calls to imports_api.snake_case() for imported functions

  // Extract the function body using regex
  const funcRegex = new RegExp(
    `def\\s+${func.name}\\s*\\([^)]*\\)\\s*->\\s*[^:]+:\\s*\\n((    [^\\n]*\\n)+)`,
    'm'
  );
  const match = module.content.match(funcRegex);

  if (match && match[1]) {
    let body = match[1];

    // Replace calls to imported functions
    // For example: myCode("hello") -> imports_api.my_code("hello")
    if (module.imports && module.imports.length > 0) {
      // Find standalone function calls (word followed by parenthesis)
      // Use negative lookbehind (?<!\.) to skip method calls like s.words()
      // Match both snake_case and camelCase identifiers
      body = body.replace(/(?<!\.)(?<![a-zA-Z0-9_])([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (match, funcName) => {
        // Skip Python builtins and common functions
        const builtins = ['print', 'str', 'int', 'float', 'len', 'range', 'list', 'dict', 'set', 'tuple', 'bool', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr', 'open', 'input', 'format', 'repr', 'abs', 'min', 'max', 'sum', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'self', 'super', 'main'];
        if (builtins.includes(funcName)) {
          return match;
        }

        // Any other standalone function call is assumed to be from imports
        // Convert camelCase to snake_case for Python imports
        const snakeName = camelToSnake(funcName);
        return `imports_api.${snakeName}(`;
      });
    }

    // The body is currently indented with 4 spaces (for module-level function)
    // We need to add 4 more spaces for class method indentation (total 8)
    body = body.split('\n').map(line => {
      if (line.trim()) {
        return '    ' + line; // Add 4 more spaces
      }
      return line;
    }).join('\n');

    return body;
  }

  // Fallback: generate a simple return statement
  return `        return "Not implemented"`;
}

function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Extract original Python imports from source code (excluding umo imports).
 * Returns import statements to include in the wrapper.
 */
function extractOriginalImports(sourceCode: string): string[] {
  const imports: string[] = [];
  const lines = sourceCode.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip umo import comments
    if (trimmed.startsWith('# umo:')) {
      continue;
    }

    // Match: import X or import X as Y or import X, Y, Z
    if (trimmed.startsWith('import ')) {
      imports.push(trimmed);
      continue;
    }

    // Match: from X import Y or from X import Y as Z
    if (trimmed.startsWith('from ')) {
      imports.push(trimmed);
    }
  }

  return imports;
}

/**
 * Get or create a virtual environment for installing Python packages.
 * Returns the path to the venv's site-packages.
 */
async function getOrCreateVenv(): Promise<{ venvPath: string; sitePackages: string }> {
  const buildDir = getBuildDirectory();
  const venvPath = join(buildDir, 'venv');

  // Check if venv already exists
  const venvPython = join(venvPath, 'bin', 'python');
  try {
    await execa(venvPython, ['--version'], { stdio: 'pipe' });
    logger.debug(`Using existing venv at: ${venvPath}`);
  } catch {
    // Create new venv using uv (fast) or python3 -m venv
    logger.debug(`Creating virtual environment at: ${venvPath}`);
    try {
      await execa('uv', ['venv', venvPath], { stdio: 'pipe' });
    } catch {
      await execa('python3', ['-m', 'venv', venvPath], { stdio: 'pipe' });
    }
  }

  // Find site-packages directory
  const result = await execa(venvPython, [
    '-c',
    'import site; print(site.getsitepackages()[0])'
  ], { stdio: 'pipe' });
  const sitePackages = result.stdout.trim();

  return { venvPath, sitePackages };
}

async function installPythonPackages(packages: string[]): Promise<string | null> {
  if (packages.length === 0) return null;

  logger.debug(`Installing Python packages: ${packages.join(', ')}`);

  // Get or create venv
  const { venvPath, sitePackages } = await getOrCreateVenv();
  const venvPip = join(venvPath, 'bin', 'pip');

  // Try uv first (faster), then venv's pip
  try {
    await execa('uv', [
      'pip',
      'install',
      '--quiet',
      '--python', join(venvPath, 'bin', 'python'),
      ...packages
    ], {
      stdio: 'pipe'
    });
    logger.debug(`Successfully installed packages using uv: ${packages.join(', ')}`);
    return sitePackages;
  } catch (error) {
    logger.debug(`uv install failed, trying venv pip: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  // Fall back to venv's pip
  try {
    await execa(venvPip, [
      'install',
      '--quiet',
      '--disable-pip-version-check',
      ...packages
    ], {
      stdio: 'pipe'
    });
    logger.debug(`Successfully installed packages using venv pip: ${packages.join(', ')}`);
    return sitePackages;
  } catch (error) {
    logger.debug(`Warning: pip install had issues: ${error instanceof Error ? error.message : 'unknown error'}`);
    return sitePackages; // Still return path in case packages were partially installed
  }
}
