/**
 * JavaScript bindings generation for pip packages.
 * Uses jco to transpile WASM components and generates runtime wrappers.
 */

import { join } from 'path';
import { logger } from '../utils/logger.js';
import { getBuildDirectory, ensureDirectory } from '../utils/file-utils.js';
import { executeCompiler } from '../compiler/compiler-bridge.js';
import { CompilationError } from '../utils/error-handler.js';
import { PipTypeSchema, PipModule, PipFunction, PipType, PipClass } from './type-schema.js';
import { ResolvedPackage } from './package-resolver.js';

/**
 * JavaScript reserved keywords that can't be used as parameter names
 */
const JS_RESERVED_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this',
  'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'class', 'const', 'enum', 'implements', 'interface', 'let', 'package',
  'private', 'protected', 'public', 'static', 'await', 'null', 'true', 'false'
]);

/**
 * Escape a parameter name if it's a JS reserved keyword
 */
function escapeJsParamName(name: string): string {
  if (JS_RESERVED_KEYWORDS.has(name)) {
    return name + 'Value';
  }
  return name;
}

/**
 * Convert kebab-case to camelCase for JS identifiers
 */
function toCamelCase(str: string): string {
  // Remove leading and trailing hyphens
  let result = str.replace(/^-+|-+$/g, '');
  // Convert hyphens followed by letters to uppercase
  result = result.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return result;
}

/**
 * Convert a module name to a JS class/object name
 */
function toJsClassName(moduleName: string): string {
  return moduleName
    .split('.')
    .pop()!
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('') + 'Api';
}

/**
 * Convert kebab-case to PascalCase for resource class names
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
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
 * Check if a module has exportable classes (resources)
 */
function hasExportableClasses(module: PipModule): boolean {
  return getExportableClasses(module).length > 0;
}

/**
 * Methods to skip when generating JS wrappers (Python special methods)
 */
const JS_SKIP_METHODS = new Set([
  '__init__', '__new__', '__del__', '__repr__', '__str__',
  '__eq__', '__ne__', '__lt__', '__le__', '__gt__', '__ge__',
  '__hash__', '__bool__', '__getattr__', '__setattr__', '__delattr__',
  '__getitem__', '__setitem__', '__delitem__', '__len__', '__iter__',
  '__next__', '__contains__', '__call__', '__enter__', '__exit__',
  '__reduce__', '__reduce_ex__', '__getstate__', '__setstate__',
  '__copy__', '__deepcopy__'
]);

/**
 * Generate a JavaScript wrapper class for a resource
 * Handles JSON serialization/deserialization for native JS types
 */
function generateJSResourceClass(cls: PipClass, jcoClassName: string): string {
  const resourceName = cls.name.toLowerCase().replace(/_/g, '-');
  const className = toPascalCase(resourceName);

  const lines: string[] = [];
  lines.push(`/**`);
  lines.push(` * ${cls.docstring || `Wrapper class for ${cls.name}`}`);
  lines.push(` */`);
  lines.push(`export class ${className} {`);
  lines.push(`  #inner;`);
  lines.push(``);

  // Constructor
  if (cls.constructor && cls.constructor.params.length > 0) {
    const params = cls.constructor.params
      .filter(p => p.name !== 'self')
      .map(p => escapeJsParamName(p.name));
    const serializedArgs = params
      .map(p => `JSON.stringify(${p})`)
      .join(', ');

    lines.push(`  constructor(${params.join(', ')}) {`);
    lines.push(`    this.#inner = new _${jcoClassName}(${serializedArgs});`);
    lines.push(`  }`);
  } else {
    lines.push(`  constructor() {`);
    lines.push(`    this.#inner = new _${jcoClassName}();`);
    lines.push(`  }`);
  }

  // Methods
  for (const method of cls.methods || []) {
    // Skip special methods and private methods
    if (JS_SKIP_METHODS.has(method.name) || method.name.startsWith('_')) {
      continue;
    }

    const jsMethodName = toCamelCase(method.name.replace(/_/g, '-'));
    const params = method.params
      .filter(p => p.name !== 'self')
      .map(p => escapeJsParamName(p.name));

    // Serialize parameters to JSON strings
    const serializedArgs = params
      .map(p => `JSON.stringify(${p})`)
      .join(', ');

    lines.push(``);
    if (method.docstring) {
      lines.push(`  /** ${method.docstring} */`);
    }
    lines.push(`  ${jsMethodName}(${params.join(', ')}) {`);
    lines.push(`    const result = this.#inner.${jsMethodName}(${serializedArgs});`);
    lines.push(`    try { return JSON.parse(result); } catch { return result; }`);
    lines.push(`  }`);
  }

  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Check if a module is a main (top-level) module, not a submodule
 * For WASM compatibility, we only process main modules
 */
function isMainModule(module: PipModule): boolean {
  return !module.name.includes('.');
}

/**
 * Generate the runtime wrapper that provides a nice API
 */
function generateRuntimeWrapper(schema: PipTypeSchema): string {
  const imports: string[] = [];
  const functionExports: string[] = [];
  const classExports: string[] = [];

  // Collect all API imports needed (for functions and classes)
  const apiImports = new Set<string>();

  // Track exported function names to avoid duplicates (same function in multiple modules)
  const exportedFunctions = new Set<string>();

  // Collect resource classes to export
  const resourceClasses: string[] = [];

  // For WASM compatibility, only process main modules (no submodules)
  const mainModules = schema.modules.filter(isMainModule);

  // Generate wrapper code for each main module
  for (const module of mainModules) {
    // Collect resource classes from this module
    if (hasExportableClasses(module)) {
      const interfaceName = module.name.replace(/\./g, '-').toLowerCase() + '-api';
      const jcoApiName = toCamelCase(interfaceName);
      apiImports.add(jcoApiName);

      for (const cls of getExportableClasses(module)) {
        const resourceName = cls.name.toLowerCase().replace(/_/g, '-');
        const className = toPascalCase(resourceName);
        resourceClasses.push(className);
      }
    }

    if (module.functions.length === 0) continue;

    const interfaceName = module.name.replace(/\./g, '-').toLowerCase() + '-api';
    const jcoApiName = toCamelCase(interfaceName);
    apiImports.add(jcoApiName);

    // Generate function wrappers
    for (const func of module.functions) {
      const jsName = toCamelCase(func.name.replace(/_/g, '-'));

      // Skip if we've already exported a function with this name
      if (exportedFunctions.has(jsName)) {
        continue;
      }
      exportedFunctions.add(jsName);

      // Escape reserved JS keywords in parameter names
      const escapedParams = func.params.map(p => ({
        ...p,
        escapedName: escapeJsParamName(p.name)
      }));
      const params = escapedParams.map(p => p.escapedName).join(', ');
      // The method name in jco bindings is camelCase
      const jcoMethodName = toCamelCase(func.name.replace(/_/g, '-'));

      // Generate conversion code for parameters
      // For string-typed WIT params that accept any JSON value, we serialize
      const convertedParams: string[] = [];

      for (const param of escapedParams) {
        const type = param.type;
        // Check primitive types
        const isStringPrimitive = type.kind === 'primitive' && type.value === 'str';
        const isBoolPrimitive = type.kind === 'primitive' && type.value === 'bool';
        const isIntPrimitive = type.kind === 'primitive' && type.value === 'int';
        const isFloatPrimitive = type.kind === 'primitive' && type.value === 'float';
        // Types that need JSON serialization (converted to string in WIT)
        // Note: int/float are native WIT types (s64/f64), not JSON serialized
        const needsJsonSerialize = ['list', 'dict', 'tuple', 'any'].includes(type.kind);

        if (needsJsonSerialize) {
          // Serialize to JSON string for WASM binding, handle undefined -> empty string
          convertedParams.push(`${param.escapedName} != null ? JSON.stringify(${param.escapedName}) : ''`);
        } else if (isStringPrimitive) {
          // String parameters pass through, but handle null/undefined
          convertedParams.push(`String(${param.escapedName} ?? '')`);
        } else if (isBoolPrimitive) {
          // Boolean parameters pass through, default false for undefined
          convertedParams.push(`Boolean(${param.escapedName})`);
        } else if (isIntPrimitive || isFloatPrimitive) {
          // Native numeric types (WIT s64/f64): pass through directly
          // Use nullish coalescing to handle undefined
          convertedParams.push(`${param.escapedName} ?? 0`);
        } else {
          // Optional types - JSON stringify if not null/undefined
          convertedParams.push(`${param.escapedName} != null ? JSON.stringify(${param.escapedName}) : ''`);
        }
      }

      // Generate result conversion - try JSON parse for string results
      let resultConversion: string;
      const returnType = func.returnType;
      const isStringReturn = returnType.kind === 'primitive' && returnType.value === 'str';
      if (returnType.kind === 'dict') {
        resultConversion = 'new Map(result)';
      } else if (isStringReturn) {
        // String return type - just return as-is
        resultConversion = 'result';
      } else {
        // For other return types, return as-is (already converted by Python wrapper)
        resultConversion = 'result';
      }

      // jco bindings export functions synchronously, no need for async
      functionExports.push(`
/**
 * ${func.docstring || `Calls ${module.name}.${func.name}`}
 */
export function ${jsName}(${params}) {
  const result = ${jcoApiName}.${jcoMethodName}(${convertedParams.join(', ')});
  return ${resultConversion};
}`);
    }
  }

  // Build the imports statement
  const importsList = Array.from(apiImports).join(', ');

  // Build class wrapper definitions
  // Generate wrapper classes that handle JSON serialization for native JS types
  let classWrappers = '';
  let jcoClassImports = '';
  if (resourceClasses.length > 0) {
    const apiNamespace = Array.from(apiImports)[0]; // Get the API namespace name

    // Import jco classes with underscore prefix (use : for destructuring rename)
    const jcoImports = resourceClasses.map(c => `${c}: _${c}`).join(', ');
    jcoClassImports = `const { ${jcoImports} } = ${apiNamespace};\n`;

    // Generate wrapper classes for each resource (main modules only)
    const wrapperClasses: string[] = [];
    for (const module of mainModules) {
      if (hasExportableClasses(module)) {
        for (const cls of getExportableClasses(module)) {
          const resourceName = cls.name.toLowerCase().replace(/_/g, '-');
          const jcoClassName = toPascalCase(resourceName);
          wrapperClasses.push(generateJSResourceClass(cls, jcoClassName));
        }
      }
    }
    classWrappers = wrapperClasses.join('\n\n');
  }

  return `/**
 * JavaScript bindings for ${schema.package}
 * Generated by umo pip-install
 */

import { ${importsList} } from './bindings/bindings.js';

${jcoClassImports}
/**
 * Initialize the module (no-op, module loads synchronously).
 * Provided for API compatibility.
 */
export async function init() {
  // jco bindings load synchronously, nothing to do
}

/**
 * Check if the module is initialized (always true).
 */
export function isInitialized() {
  return true;
}
${functionExports.join('\n')}

${classWrappers}`;
}

/**
 * Generate JavaScript bindings for a compiled WASM component
 */
export async function generateJSBindings(
  wasmPath: string,
  schema: PipTypeSchema,
  pkg: ResolvedPackage
): Promise<{ indexJs: string; bindingsDir: string }> {
  logger.debug(`Generating JS bindings for ${pkg.name}...`);

  // Check if jco is available (via npx)
  try {
    await executeCompiler('npx', ['@bytecodealliance/jco', '--version'], 'jco version check');
  } catch {
    throw new CompilationError(
      'jco is not available. Please install @bytecodealliance/jco',
      'Run: npm install -D @bytecodealliance/jco'
    );
  }

  // Create output directory
  const buildDir = join(getBuildDirectory(), 'pip-build', pkg.name);
  const bindingsDir = join(buildDir, 'jco-bindings');
  await ensureDirectory(bindingsDir);

  // Run jco transpile (using npx)
  const transpileResult = await executeCompiler(
    'npx',
    [
      '@bytecodealliance/jco',
      'transpile',
      wasmPath,
      '-o', bindingsDir,
      '--name', 'bindings',
      '--map', `pip:${pkg.name.replace(/-/g, '-')}/*=*`
    ],
    'jco transpile'
  );

  if (!transpileResult.success) {
    throw new CompilationError(
      `Failed to transpile ${pkg.name} WASM to JS`,
      transpileResult.errors?.join('\n')
    );
  }

  logger.debug(`Transpiled to: ${bindingsDir}`);

  // Generate our runtime wrapper
  const indexJs = generateRuntimeWrapper(schema);

  return {
    indexJs,
    bindingsDir
  };
}
