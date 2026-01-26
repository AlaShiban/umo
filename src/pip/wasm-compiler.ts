/**
 * WASM compilation for pip packages.
 * Uses componentize-py to compile Python packages to WASM components.
 */

import { join, dirname, resolve } from 'path';
import { logger } from '../utils/logger.js';
import { getBuildDirectory, ensureDirectory, writeFileContent } from '../utils/file-utils.js';
import { executeCompiler, checkToolAvailable } from '../compiler/compiler-bridge.js';
import { CompilationError } from '../utils/error-handler.js';
import { PipTypeSchema, PipModule, PipFunction, PipType, PipClass } from './type-schema.js';
import { ResolvedPackage } from './package-resolver.js';
import { getWitWorldName } from './wit-generator.js';

/**
 * Convert kebab-case to snake_case for Python
 */
function toSnakeCase(str: string): string {
  return str.replace(/-/g, '_').toLowerCase();
}

/**
 * WIT reserved keywords that cannot be used as identifiers
 * Must match wit-generator.ts
 */
const WIT_RESERVED_KEYWORDS = new Set([
  'func', 'interface', 'world', 'package', 'import', 'export',
  'type', 'record', 'flags', 'variant', 'enum', 'union',
  'resource', 'use', 'as', 'constructor', 'static', 'own', 'borrow',
  'include', 'with', 'from',
  'result', 'option', 'list', 'tuple', 'string', 'bool',
  's8', 's16', 's32', 's64', 'u8', 'u16', 'u32', 'u64',
  'f32', 'f64', 'char', 'stream', 'future', 'error',
  'self', 'true', 'false', 'null', 'new', 'abstract', 'await'
]);

/**
 * Escape a resource/class name if it's a WIT reserved keyword
 * Must match wit-generator.ts escapeWitResourceName
 */
function escapeWitResourceName(name: string): string {
  const kebabName = toKebabCase(name);
  if (WIT_RESERVED_KEYWORDS.has(kebabName)) {
    return `${kebabName}-class`;
  }
  return kebabName;
}

/**
 * Convert PascalCase/camelCase/snake_case to kebab-case
 * Must match wit-generator.ts logic for consistency
 */
function toKebabCase(str: string): string {
  let result = str
    // Convert camelCase to kebab-case (must match wit-generator.ts - NO consecutive caps handling)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    // Convert underscores to hyphens
    .replace(/_/g, '-')
    .toLowerCase();

  // Collapse multiple consecutive hyphens
  result = result.replace(/-+/g, '-');
  // Remove leading/trailing hyphens
  result = result.replace(/^-|-$/g, '');
  // Handle digits after hyphens (WIT identifiers can't have digits after hyphens)
  result = result.replace(/-(\d)/g, '-n$1');
  // Handle leading digits
  if (/^\d/.test(result)) {
    result = 'n' + result;
  }

  return result || 'fn';
}

/**
 * Convert a PipType to Python type hint string
 */
function pipTypeToPython(type: PipType): string {
  switch (type.kind) {
    case 'primitive':
      switch (type.value) {
        case 'str':
          return 'str';
        case 'int':
          return 'int';
        case 'float':
          return 'float';
        case 'bool':
          return 'bool';
        default:
          return 'str';
      }

    case 'list':
      const elementType = type.elementType ? pipTypeToPython(type.elementType) : 'str';
      return `list[${elementType}]`;

    case 'dict':
      const keyType = type.keyType ? pipTypeToPython(type.keyType) : 'str';
      const valueType = type.valueType ? pipTypeToPython(type.valueType) : 'str';
      // For WIT compatibility, we return list of tuples
      return `list[tuple[${keyType}, ${valueType}]]`;

    case 'optional':
      const innerType = type.innerType ? pipTypeToPython(type.innerType) : 'str';
      return `${innerType} | None`;

    case 'tuple':
      const elements = type.elements?.map(pipTypeToPython).join(', ') || '';
      return `tuple[${elements}]`;

    case 'none':
      return 'None';

    case 'any':
    default:
      return 'str';
  }
}

/**
 * Reserved Python keywords that need escaping with suffix
 */
const PYTHON_RESERVED_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield'
]);

/**
 * Convert function name to WIT-compatible method name for Protocol
 * This must match how componentize-py converts WIT names to Python names
 * WIT uses kebab-case, Python Protocol uses snake_case
 */
function toWitMethodName(name: string): string {
  // Convert to kebab-case first (matching WIT naming), then to snake_case
  let result = toSnakeCase(toKebabCase(name));

  // Remove trailing underscore (Python convention for reserved words)
  result = result.replace(/_+$/, '');

  // Check if it's a Python reserved keyword - componentize-py adds _param suffix
  if (PYTHON_RESERVED_KEYWORDS.has(result)) {
    result = result + '_param';
  }

  // Check if it's a WIT reserved keyword - these get escaped in WIT to name-param
  // which then becomes name_param in Python
  if (WIT_RESERVED_KEYWORDS.has(result)) {
    result = result + '_param';
  }

  return result;
}

/**
 * Generate Python wrapper function that calls the actual package function
 * @param func - The function to generate
 * @param moduleName - The full module name (e.g., "humanize.time")
 * @param mainModuleName - Optional override for the module to call (for WASM compatibility)
 */
function generatePythonFunction(func: PipFunction, moduleName: string, mainModuleName?: string): string {
  const params = func.params
    .map(p => `${p.name}: ${pipTypeToPython(p.type)}`)
    .join(', ');

  const returnType = pipTypeToPython(func.returnType);

  // The method name in the Protocol (WIT-compatible)
  const methodName = toWitMethodName(func.name);
  // The original Python function name to call
  const pythonFuncName = func.name;

  // For WASM compatibility, use the main module if specified
  // This handles cases where submodule imports don't work but functions are re-exported
  const callModule = mainModuleName || moduleName;

  // Build the function body with JSON parsing
  const bodyLines: string[] = [];

  // Parse JSON string parameters back to Python values
  // Use kwargs to only pass non-None values, preserving Python defaults
  bodyLines.push(`        kwargs = {}`);

  for (const param of func.params) {
    const isStringType = param.type.kind === 'primitive' && param.type.value === 'str';
    const isBoolType = param.type.kind === 'primitive' && param.type.value === 'bool';
    const isIntType = param.type.kind === 'primitive' && param.type.value === 'int';
    const isFloatType = param.type.kind === 'primitive' && param.type.value === 'float';

    if (isStringType) {
      // String parameters: only add to kwargs if non-empty
      bodyLines.push(`        if ${param.name}:`);
      bodyLines.push(`            kwargs['${param.name}'] = ${param.name}`);
    } else if (isBoolType) {
      // Boolean parameters always passed (False is valid)
      bodyLines.push(`        kwargs['${param.name}'] = ${param.name}`);
    } else if (isIntType || isFloatType) {
      // Native numeric types (WIT f64/s64): pass through directly, check for 0
      // Use 'is not None' to allow 0 values
      bodyLines.push(`        if ${param.name} is not None:`);
      bodyLines.push(`            kwargs['${param.name}'] = ${param.name}`);
    } else if (param.type.kind === 'dict') {
      // Dict parameters: parse JSON then convert list of tuples to dict
      bodyLines.push(`        if ${param.name}:`);
      bodyLines.push(`            ${param.name}_parsed = json.loads(${param.name})`);
      bodyLines.push(`            kwargs['${param.name}'] = dict(${param.name}_parsed)`);
    } else {
      // Other types (list, tuple, any): parse from JSON string, only add if non-empty
      bodyLines.push(`        if ${param.name}:`);
      bodyLines.push(`            kwargs['${param.name}'] = json.loads(${param.name})`);
    }
  }

  const returnsDictConversion = func.returnType.kind === 'dict';

  if (returnsDictConversion) {
    bodyLines.push(`        result = ${callModule}.${pythonFuncName}(**kwargs)`);
    bodyLines.push(`        return list(result.items())`);
  } else {
    bodyLines.push(`        return ${callModule}.${pythonFuncName}(**kwargs)`);
  }

  const body = bodyLines.join('\n');

  return `    def ${methodName}(self${params ? ', ' + params : ''}) -> ${returnType}:
${body}
`;
}

/**
 * Generate Python wrapper class for a module
 */
function generatePythonModuleWrapper(module: PipModule, packageName: string): string {
  // Convert module name to class name
  const className = module.name
    .split('.')
    .pop()!
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('') + 'Api';

  const interfaceName = module.name.replace(/\./g, '-').toLowerCase() + '-api';

  const functions = module.functions
    .map(f => generatePythonFunction(f, module.name))
    .join('\n');

  return `class ${className}(${interfaceName.replace(/-/g, '_')}):
${functions}`;
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
}

/**
 * Methods that should be skipped when generating resource wrappers
 * These are Python special methods that don't make sense in WIT
 */
const SKIP_METHODS = new Set([
  '__init__',
  '__new__',
  '__del__',
  '__repr__',
  '__str__',
  '__eq__',
  '__ne__',
  '__lt__',
  '__le__',
  '__gt__',
  '__ge__',
  '__hash__',
  '__bool__',
  '__getattr__',
  '__setattr__',
  '__delattr__',
  '__getitem__',
  '__setitem__',
  '__delitem__',
  '__len__',
  '__iter__',
  '__next__',
  '__contains__',
  '__call__',
  '__enter__',
  '__exit__',
  '__reduce__',
  '__reduce_ex__',
  '__getstate__',
  '__setstate__',
  '__copy__',
  '__deepcopy__',
]);

/**
 * Generate Python wrapper method for a resource
 */
function generatePythonResourceMethod(method: PipFunction): string | null {
  // Skip special methods
  if (SKIP_METHODS.has(method.name)) {
    return null;
  }

  // Skip private methods (starting with _)
  if (method.name.startsWith('_')) {
    return null;
  }

  // Filter out 'self' parameter
  const params = method.params
    .filter(p => p.name !== 'self')
    .map(p => `${p.name}: ${pipTypeToPython(p.type)}`)
    .join(', ');

  const returnType = pipTypeToPython(method.returnType);
  const callArgs = method.params
    .filter(p => p.name !== 'self')
    .map(p => p.name)
    .join(', ');

  const methodName = toWitMethodName(method.name);

  // Parse JSON string parameters and convert return value for WIT compatibility
  // Try to parse as JSON, fall back to string if parsing fails
  const filteredParams = method.params.filter(p => p.name !== 'self');
  const parseStatements = filteredParams.length > 0
    ? filteredParams.map(p =>
        `        try:\n            ${p.name}_parsed = json.loads(${p.name}) if ${p.name} else ${p.name}\n        except (json.JSONDecodeError, TypeError):\n            ${p.name}_parsed = ${p.name}`
      ).join('\n') + '\n'
    : '';
  const parsedCallArgs = filteredParams
    .map(p => `${p.name}_parsed`)
    .join(', ');

  return `    def ${methodName}(self${params ? ', ' + params : ''}) -> ${returnType}:
${parseStatements}        result = self._inner.${method.name}(${parsedCallArgs || ''})
        if result is None:
            return ""
        # Handle generators by consuming to list
        if hasattr(result, '__next__'):
            result = list(result)
        return json.dumps(result) if not isinstance(result, str) else result
`;
}

/**
 * Generate Python resource wrapper class for a PipClass
 * @param cls - The PipClass to generate a wrapper for
 * @param moduleName - The Python module name (e.g., "redblacktree.redblacktree")
 * @param protocolClassName - The Protocol class name to inherit from (e.g., "BstProtocol")
 */
function generatePythonResourceClass(cls: PipClass, moduleName: string, protocolClassName: string): string {
  // The class name must match what WIT expects - PascalCase of kebab-case
  const resourceName = escapeWitResourceName(cls.name);
  const className = toPascalCase(resourceName);

  const lines: string[] = [];
  lines.push(`class ${className}(${protocolClassName}):`);
  lines.push(`    """Wrapper for ${moduleName}.${cls.name}"""`);
  lines.push(`    _inner: ${moduleName}.${cls.name}`);
  lines.push('');

  // Generate constructor
  if (cls.constructor) {
    const params = cls.constructor.params
      .filter(p => p.name !== 'self')
      .map(p => `${p.name}: ${pipTypeToPython(p.type)}`)
      .join(', ');

    // Parse JSON strings to native types before passing to underlying class
    const filteredParams = cls.constructor.params.filter(p => p.name !== 'self');
    const parseStatements = filteredParams.map(p =>
      `        ${p.name}_parsed = json.loads(${p.name}) if ${p.name} else None`
    );
    const callArgs = filteredParams
      .map(p => `${p.name}_parsed`)
      .join(', ');

    lines.push(`    def __init__(self${params ? ', ' + params : ''}):`);
    lines.push(...parseStatements);
    lines.push(`        self._inner = ${moduleName}.${cls.name}(${callArgs})`);
    lines.push('');
  } else {
    lines.push(`    def __init__(self):`);
    lines.push(`        self._inner = ${moduleName}.${cls.name}()`);
    lines.push('');
  }

  // Generate methods
  for (const method of cls.methods) {
    const methodDef = generatePythonResourceMethod(method);
    if (methodDef) {
      lines.push(methodDef);
    }
  }

  return lines.join('\n');
}

/**
 * Check if a class is exportable (not an exception class)
 */
function isExportableClass(cls: PipClass): boolean {
  const name = cls.name.toLowerCase();
  // Skip exception classes and codec/streaming infrastructure classes
  if (name.endsWith('error') || name.endsWith('exception')) return false;
  if (name.startsWith('invalid')) return false;
  if (name.startsWith('incremental')) return false;
  if (name.startsWith('stream')) return false;
  if (name === 'codec') return false;
  return true;
}

/**
 * Get exportable classes from a module (excludes exception classes)
 */
function getExportableClasses(module: PipModule): PipClass[] {
  if (!module.classes) return [];
  return module.classes.filter(isExportableClass);
}

/**
 * Check if a module has classes that can be exported as resources
 */
function hasExportableClasses(module: PipModule): boolean {
  return getExportableClasses(module).length > 0;
}

/**
 * Generate the complete Python wrapper file
 */
function generatePythonWrapper(schema: PipTypeSchema): string {
  const imports: string[] = [];
  const classes: string[] = [];

  // For WASM compatibility, only use the main (top-level) module
  // Submodule imports don't work in componentize-py's WASM environment
  // Functions are typically re-exported at the top level anyway
  const mainModuleName = schema.modules[0]?.name.split('.')[0] || schema.package.replace(/-/g, '_');

  // Filter to only main module (no submodules) for WASM compatibility
  const modulesWithContent = schema.modules.filter(m => {
    // Only include top-level modules (no dots in name)
    const isMainModule = !m.name.includes('.');
    const hasContent = m.functions.length > 0 || hasExportableClasses(m);
    return isMainModule && hasContent;
  });

  // Import the WIT protocol classes with aliases
  // componentize-py generates PascalCase class names from kebab-case interface names
  if (modulesWithContent.length > 0) {
    imports.push('from wit_world.exports import (');
    for (const module of modulesWithContent) {
      // Interface class for functions
      if (module.functions.length > 0) {
        // Must match WIT interface name: convert dots and underscores to hyphens
        const interfaceName = module.name.replace(/[._]/g, '-').toLowerCase() + '-api';
        const protocolClassName = toPascalCase(interfaceName);
        imports.push(`    ${protocolClassName} as ${protocolClassName}Protocol,`);
      }
    }
    imports.push(')');
    imports.push('');
  }

  // Import resource Protocol classes from the interface-specific module
  // componentize-py puts resource Protocols in a separate module named after the interface
  for (const module of modulesWithContent) {
    if (hasExportableClasses(module)) {
      const interfaceName = module.name.replace(/\./g, '_').toLowerCase() + '_api';
      imports.push(`from wit_world.exports.${interfaceName} import (`);
      for (const cls of getExportableClasses(module)) {
        const resourceName = escapeWitResourceName(cls.name);
        const protocolName = toPascalCase(resourceName);
        imports.push(`    ${protocolName} as ${protocolName}Protocol,`);
      }
      imports.push(')');
      imports.push('');
    }
  }

  // Import the actual package modules
  // For WASM compatibility, we only import the main module
  // componentize-py can't handle "import package.submodule" style imports
  const importedModules = new Set<string>();

  for (const module of modulesWithContent) {
    if (!importedModules.has(module.name)) {
      imports.push(`import ${module.name}`);
      importedModules.add(module.name);
    }
  }
  imports.push('import json  # For serializing method results');
  imports.push('');

  // Generate wrapper classes for functions
  // The class names must match the Protocol class names for componentize-py
  // Only process main modules (no submodules) for WASM compatibility
  for (const module of modulesWithContent) {
    if (module.functions.length > 0) {
      // Protocol class name from componentize-py (e.g., PydashFunctionsApi)
      // Must match WIT interface name: convert dots and underscores to hyphens
      const interfaceName = module.name.replace(/[._]/g, '-').toLowerCase() + '-api';
      const protocolClassName = toPascalCase(interfaceName);

      // Build set of class names for collision detection (must match wit-generator.ts logic)
      const classNames = new Set(
        getExportableClasses(module).map(c => escapeWitResourceName(c.name))
      );

      const functions = module.functions
        .map(f => {
          // Check for collision with class names (must match wit-generator.ts renaming)
          const kebabName = toKebabCase(f.name);
          if (classNames.has(kebabName)) {
            // Rename function to avoid collision, matching WIT generator
            return generatePythonFunction({ ...f, name: f.name + '_fn' }, module.name, mainModuleName);
          }
          return generatePythonFunction(f, module.name, mainModuleName);
        })
        .join('\n');

      // Inherit from the Protocol with alias, use the expected class name
      classes.push(`class ${protocolClassName}(${protocolClassName}Protocol):
${functions}`);
    }
  }

  // Generate resource wrapper classes for Python classes
  for (const module of modulesWithContent) {
    if (hasExportableClasses(module)) {
      for (const cls of getExportableClasses(module)) {
        const resourceName = escapeWitResourceName(cls.name);
        const protocolName = toPascalCase(resourceName) + 'Protocol';
        const resourceClass = generatePythonResourceClass(cls, module.name, protocolName);
        classes.push(resourceClass);
      }
    }
  }

  return `# Python wrapper for ${schema.package}
# Generated by umo pip-install

${imports.join('\n')}

${classes.join('\n\n')}
`;
}

/**
 * Generate resource modules that componentize-py expects.
 * componentize-py requires resource implementations to be in modules
 * named after each WIT interface (e.g., click_core_api.py, click_types_api.py)
 */
function generateResourceModules(schema: PipTypeSchema): { moduleName: string; content: string }[] {
  const modules: { moduleName: string; content: string }[] = [];

  // Find modules with exportable classes
  const modulesWithClasses = schema.modules.filter(hasExportableClasses);

  if (modulesWithClasses.length === 0) {
    return modules;
  }

  // Generate a separate module file for each Python module that has classes
  // Note: Each module needs its own classes; deduplication happens within each module, not globally
  for (const mod of modulesWithClasses) {
    // Module name must match the WIT interface naming: package_module_api
    // Must also match how we generate imports in generatePythonWrapper (line 463)
    const moduleName = mod.name.replace(/\./g, '_').toLowerCase() + '_api';

    // Track seen class names within this module for deduplication
    const seenClassNames = new Set<string>();

    // Collect resource class names for this module (deduplicated within module)
    const classNames: string[] = [];
    for (const cls of getExportableClasses(mod)) {
      const resourceName = escapeWitResourceName(cls.name);
      const className = toPascalCase(resourceName);

      // Skip if we've already seen this class name within this module
      if (seenClassNames.has(className)) {
        continue;
      }
      seenClassNames.add(className);
      classNames.push(className);
    }

    // Only generate module if there are classes
    if (classNames.length > 0) {
      const content = `# Resource implementations for ${moduleName}
# Generated by umo pip-install
# This module exports resource classes for componentize-py

from wrapper import ${classNames.join(', ')}

__all__ = [${classNames.map(n => `'${n}'`).join(', ')}]
`;
      modules.push({ moduleName, content });
    }
  }

  return modules;
}

/**
 * Compile a pip package to WASM using componentize-py
 */
export async function compilePipToWasm(
  schema: PipTypeSchema,
  witPath: string,
  pkg: ResolvedPackage
): Promise<string> {
  logger.debug(`Compiling ${pkg.name} to WASM...`);

  // Check if componentize-py is available
  await checkToolAvailable(
    'componentize-py',
    'componentize-py (Python to WASM Component compiler)'
  );

  // Create build directory
  const buildDir = join(getBuildDirectory(), 'pip-build', pkg.name);
  await ensureDirectory(buildDir);

  // Generate Python wrapper
  const wrapperContent = generatePythonWrapper(schema);
  const wrapperPath = join(buildDir, 'wrapper.py');
  await writeFileContent(wrapperPath, wrapperContent);

  logger.debug(`Generated wrapper: ${wrapperPath}`);

  // Generate resource modules if package has classes
  // componentize-py requires a module for each WIT interface with resources
  const resourceModules = generateResourceModules(schema);
  for (const resourceModule of resourceModules) {
    const resourceModulePath = join(buildDir, `${resourceModule.moduleName}.py`);
    await writeFileContent(resourceModulePath, resourceModule.content);
    logger.debug(`Generated resource module: ${resourceModulePath}`);
  }

  // Get WIT directory
  const witDir = dirname(witPath);

  // Step 1: Generate bindings
  const bindingsDir = join(buildDir, 'bindings');

  // Clean up existing bindings if they exist
  const { rm } = await import('fs/promises');
  try {
    await rm(bindingsDir, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  // Resolve all paths to absolute paths to avoid any cwd issues
  const resolvedWitDir = resolve(witDir);
  const resolvedBindingsDir = resolve(bindingsDir);
  const resolvedBuildDir = resolve(buildDir);
  // Use prefixed world name to avoid conflicts with actual Python package
  const worldName = getWitWorldName(pkg.importName);

  logger.debug(`WIT directory: ${resolvedWitDir}`);
  logger.debug(`Bindings directory: ${resolvedBindingsDir}`);
  logger.debug(`Build directory: ${resolvedBuildDir}`);
  logger.debug(`World name: ${worldName}`);

  const bindingsResult = await executeCompiler(
    'componentize-py',
    [
      '-d', resolvedWitDir,
      '-w', worldName,
      'bindings',
      '--world-module', 'wit_world',  // Force module name to wit_world for wrapper compatibility
      resolvedBindingsDir
    ],
    'componentize-py bindings',
    resolvedBuildDir  // Use explicit cwd for consistency
  );

  // Log bindings command output for debugging
  logger.debug(`Bindings stdout: ${bindingsResult.stdout || '(empty)'}`);
  logger.debug(`Bindings stderr: ${bindingsResult.stderr || '(empty)'}`);

  if (!bindingsResult.success) {
    throw new CompilationError(
      `Failed to generate bindings for ${pkg.name}`,
      bindingsResult.errors?.join('\n')
    );
  }

  // Check what was actually created in the bindings directory
  const { stat, readdir } = await import('fs/promises');
  try {
    const contents = await readdir(resolvedBindingsDir);
    logger.debug(`Bindings directory contents: ${contents.join(', ') || '(empty)'}`);
  } catch {
    logger.debug(`Bindings directory does not exist or is not readable`);
  }

  // Verify that wit_world was actually created
  const witWorldDir = join(resolvedBindingsDir, 'wit_world');
  try {
    const stats = await stat(witWorldDir);
    if (!stats.isDirectory()) {
      throw new CompilationError(
        `Bindings generation failed for ${pkg.name}`,
        `Expected directory at ${witWorldDir} but found a file`
      );
    }
    logger.debug(`Verified wit_world exists at: ${witWorldDir}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // List the WIT directory contents for debugging
      try {
        const witContents = await readdir(resolvedWitDir);
        logger.debug(`WIT directory contents: ${witContents.join(', ')}`);
      } catch {
        logger.debug(`WIT directory not readable`);
      }

      throw new CompilationError(
        `Bindings generation failed for ${pkg.name}`,
        `wit_world directory was not created at ${witWorldDir}. ` +
        `Bindings command output: ${bindingsResult.stdout || bindingsResult.stderr || 'none'}. ` +
        `This may indicate a componentize-py version incompatibility. ` +
        `Try updating componentize-py: pip install --upgrade componentize-py`
      );
    }
    throw err;
  }

  // Step 2: Compile to WASM
  const wasmPath = join(resolvedBuildDir, `${pkg.name}.wasm`);
  const resolvedSitePackages = resolve(pkg.sitePackagesPath);

  logger.debug(`Site packages: ${resolvedSitePackages}`);
  logger.debug(`Output WASM: ${wasmPath}`);

  const compileResult = await executeCompiler(
    'componentize-py',
    [
      '-d', resolvedWitDir,
      '-w', worldName,
      'componentize',
      '-p', resolvedBuildDir,      // For the wrapper
      '-p', resolvedBindingsDir,   // For the generated bindings (wit_world)
      '-p', resolvedSitePackages,  // For the actual package
      'wrapper',
      '-o', wasmPath
    ],
    'componentize-py componentize',
    resolvedBuildDir
  );

  if (!compileResult.success) {
    throw new CompilationError(
      `Failed to compile ${pkg.name} to WASM`,
      compileResult.errors?.join('\n')
    );
  }

  logger.debug(`Compiled WASM: ${wasmPath}`);

  return wasmPath;
}
