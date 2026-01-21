/**
 * Pyodide-based compilation for Python packages with native extensions.
 * Alternative to componentize-py for packages like networkx that require
 * C extensions (e.g., _bz2) that aren't available in WASI.
 *
 * Generates clean JavaScript wrappers that hide all Pyodide internals,
 * providing a native JS/TS developer experience.
 */

import { join } from 'path';
import { logger } from '../utils/logger.js';
import { ensureDirectory, writeFileContent, getPipModulesDirectory } from '../utils/file-utils.js';
import { PipTypeSchema, PipModule, PipFunction, PipType, PipClass } from './type-schema.js';
import { ResolvedPackage } from './package-resolver.js';

/**
 * Pyodide packages index - packages known to be available in Pyodide
 * See: https://pyodide.org/en/stable/usage/packages-in-pyodide.html
 */
const PYODIDE_PACKAGES = new Set([
  // Data science
  'numpy', 'pandas', 'scipy', 'scikit-learn', 'matplotlib',
  // Graph/network
  'networkx',
  // Compression
  'lz4', 'zstandard',
  // Crypto
  'cryptography', 'pycryptodome',
  // Parsing
  'lxml', 'beautifulsoup4', 'html5lib',
  // Utilities
  'regex', 'pyyaml', 'pillow', 'ujson',
  // Math
  'sympy', 'mpmath',
]);

/**
 * Check if a package is available in Pyodide's package repository
 */
export function isPyodidePackage(packageName: string): boolean {
  return PYODIDE_PACKAGES.has(packageName.toLowerCase());
}

/**
 * Convert snake_case/kebab-case to camelCase for JS identifiers
 */
function toCamelCase(str: string): string {
  let result = str.replace(/^[-_]+|[-_]+$/g, '');
  result = result.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
  return result;
}

/**
 * Convert to PascalCase for class names
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * JavaScript reserved keywords
 */
const JS_RESERVED_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this',
  'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'class', 'const', 'enum', 'implements', 'interface', 'let', 'package',
  'private', 'protected', 'public', 'static', 'await', 'null', 'true', 'false',
  // Additional strict mode reserved words
  'eval', 'arguments'
]);

/**
 * Escape JS reserved keyword parameter names
 */
function escapeJsParamName(name: string): string {
  if (JS_RESERVED_KEYWORDS.has(name)) {
    return name + 'Param';
  }
  return name;
}

/**
 * Escape JS reserved keyword function names
 */
function escapeJsFunctionName(name: string): string {
  if (JS_RESERVED_KEYWORDS.has(name)) {
    return name + 'Fn';
  }
  return name;
}

/**
 * Convert PipType to TypeScript type string
 */
function pipTypeToTypeScript(type: PipType): string {
  switch (type.kind) {
    case 'primitive':
      switch (type.value) {
        case 'str': return 'string';
        case 'int':
        case 'float': return 'number';
        case 'bool': return 'boolean';
        default: return 'any';
      }
    case 'list':
      const elementType = type.elementType ? pipTypeToTypeScript(type.elementType) : 'any';
      return `${elementType}[]`;
    case 'dict':
      const keyType = type.keyType ? pipTypeToTypeScript(type.keyType) : 'string';
      const valueType = type.valueType ? pipTypeToTypeScript(type.valueType) : 'any';
      return `Record<${keyType}, ${valueType}>`;
    case 'optional':
      const innerType = type.innerType ? pipTypeToTypeScript(type.innerType) : 'any';
      return `${innerType} | null`;
    case 'tuple':
      const elements = type.elements?.map(pipTypeToTypeScript).join(', ') || '';
      return `[${elements}]`;
    case 'class':
      return type.className || 'any';
    case 'none':
      return 'void';
    case 'any':
    default:
      return 'any';
  }
}

/**
 * Check if a class is exportable (not an exception class)
 */
function isExportableClass(cls: PipClass): boolean {
  const name = cls.name.toLowerCase();
  if (name.endsWith('error') || name.endsWith('exception')) return false;
  if (name.startsWith('invalid')) return false;
  if (name.startsWith('incremental')) return false;
  if (name.startsWith('stream')) return false;
  if (name === 'codec') return false;
  return true;
}

/**
 * Get exportable classes from a module
 */
function getExportableClasses(module: PipModule): PipClass[] {
  if (!module.classes) return [];
  return module.classes.filter(isExportableClass);
}

/**
 * Methods to skip (Python special methods that don't translate well)
 */
const SKIP_METHODS = new Set([
  '__init__', '__new__', '__del__', '__repr__', '__str__',
  '__eq__', '__ne__', '__lt__', '__le__', '__gt__', '__ge__',
  '__hash__', '__bool__', '__getattr__', '__setattr__', '__delattr__',
  '__getitem__', '__setitem__', '__delitem__', '__len__', '__iter__',
  '__next__', '__contains__', '__call__', '__enter__', '__exit__',
]);

/**
 * Generate JavaScript wrapper code for a Pyodide-based package.
 * Creates a clean API that hides all Pyodide internals.
 */
function generatePyodideWrapper(schema: PipTypeSchema): string {
  const packageName = schema.package;
  const importName = packageName.replace(/-/g, '_');

  // Collect all functions and classes
  const allFunctions: { func: PipFunction; moduleName: string }[] = [];
  const allClasses: { cls: PipClass; moduleName: string }[] = [];

  for (const module of schema.modules) {
    for (const func of module.functions) {
      allFunctions.push({ func, moduleName: module.name });
    }
    for (const cls of getExportableClasses(module)) {
      allClasses.push({ cls, moduleName: module.name });
    }
  }

  // Generate function wrappers
  const functionWrappers = allFunctions.map(({ func, moduleName }) => {
    const jsName = escapeJsFunctionName(toCamelCase(func.name));
    const params = func.params.map(p => escapeJsParamName(p.name));
    const paramsStr = params.join(', ');

    // Generate kwargs building code that filters undefined values and converts to Python types
    // Use _kwargs as local variable to avoid conflict with 'kwargs' parameter names
    const kwargsLines = func.params.map(p => {
      const escaped = escapeJsParamName(p.name);
      return `    if (${escaped} !== undefined) _kwargs['${p.name}'] = _toPy(${escaped});`;
    }).join('\n');

    return `
/**
 * ${func.docstring?.split('\n')[0] || `Calls ${moduleName}.${func.name}`}
 */
export async function ${jsName}(${paramsStr}) {
  const mod = await _getModule('${moduleName}');
  const _kwargs = {};
${kwargsLines}
  const result = mod.${func.name}.callKwargs(_kwargs);
  return _toJs(result);
}`;
  }).join('\n');

  // Generate class wrappers
  const classWrappers = allClasses.map(({ cls, moduleName }) => {
    const className = toPascalCase(cls.name);

    // Constructor params
    const ctorParams = cls.constructor?.params.filter(p => p.name !== 'self') || [];
    const ctorParamsStr = ctorParams.map(p => escapeJsParamName(p.name)).join(', ');
    const ctorKwargs = ctorParams.map(p => {
      const escaped = escapeJsParamName(p.name);
      return `'${p.name}': ${escaped}`;
    }).join(', ');

    // Generate methods
    const methods = (cls.methods || [])
      .filter(m => !SKIP_METHODS.has(m.name) && !m.name.startsWith('_'))
      .map(method => {
        const jsMethodName = toCamelCase(method.name);
        const methodParams = method.params.filter(p => p.name !== 'self');
        const methodParamsStr = methodParams.map(p => escapeJsParamName(p.name)).join(', ');
        const methodKwargs = methodParams.map(p => {
          const escaped = escapeJsParamName(p.name);
          return `'${p.name}': _toPy(${escaped})`;
        }).join(', ');

        const docComment = method.docstring
          ? `  /** ${method.docstring.split('\n')[0]} */\n`
          : '';

        return `${docComment}  ${jsMethodName}(${methodParamsStr}) {
    const result = this.#inner.${method.name}${methodKwargs ? `.callKwargs({ ${methodKwargs} })` : '()'};
    return _toJs(result);
  }`;
      }).join('\n\n');

    return `
/**
 * ${cls.docstring?.split('\n')[0] || cls.name}
 */
export class ${className} {
  #inner;

  /**
   * Create a new ${className} instance.
   * Note: Use the static create() method for async initialization.
   */
  constructor(${ctorParamsStr}) {
    // Store params for deferred initialization
    this.#inner = null;
    this._initParams = { ${ctorKwargs} };
  }

  /**
   * Create and initialize a ${className} instance.
   */
  static async create(${ctorParamsStr}) {
    const instance = new ${className}(${ctorParamsStr});
    await instance._ensureInit();
    return instance;
  }

  async _ensureInit() {
    if (this.#inner) return;
    const mod = await _getModule('${moduleName}');
    // Call Python constructor (no 'new' keyword needed for Pyodide)
    this.#inner = mod.${cls.name}(${ctorParams.map(p => `_toPy(this._initParams['${p.name}'])`).join(', ')});
  }

  /** Get the underlying PyProxy for use with other pandas operations */
  get _pyProxy() {
    return this.#inner;
  }

${methods}
}`;
  }).join('\n');

  return `/**
 * JavaScript bindings for ${packageName}
 * Generated by umo pip-install
 */

let _pyodide = null;
let _initialized = false;
let _initPromise = null;
let _modules = {};

/**
 * Convert Python object to JavaScript native type.
 * Handles PyProxy objects, converting them to JS equivalents.
 * Does NOT convert complex objects like Graphs or DataFrames that need to stay as PyProxy.
 */
function _toJs(obj) {
  if (obj === null || obj === undefined) return obj;

  // Check if it's a PyProxy (Pyodide Python object)
  if (obj.toJs) {
    // Don't convert objects that have Graph-like methods - they need to stay as PyProxy
    // for subsequent operations (e.g., networkx Graphs)
    if (obj.edges || obj.nodes || obj.add_edge || obj.add_node) {
      return obj;
    }

    // Don't convert DataFrame/Series-like objects - they need to stay as PyProxy
    // for subsequent pandas operations (concat, merge, etc.)
    if (obj.iloc || obj.loc || obj.head || obj.tail || obj.describe || obj.dtypes) {
      return obj;
    }

    try {
      const converted = obj.toJs({ dict_converter: Object.fromEntries });
      // If still a PyProxy after toJs, check if it should be iterated
      if (converted && converted.toJs && typeof converted[Symbol.iterator] === 'function') {
        // Only iterate if it's a view/iterator type (not a complex object)
        const typeName = converted.type || '';
        if (typeName.includes('View') || typeName.includes('Iterator') || typeName.includes('Generator')) {
          const items = [];
          for (const item of converted) {
            items.push(item.toJs ? item.toJs({ dict_converter: Object.fromEntries }) : item);
          }
          return items;
        }
      }
      return converted;
    } catch {
      // Try manual iteration if toJs fails and it's an iterator type
      const typeName = obj.type || '';
      if (typeof obj[Symbol.iterator] === 'function' &&
          (typeName.includes('View') || typeName.includes('Iterator') || typeName.includes('Generator'))) {
        const items = [];
        for (const item of obj) {
          items.push(item.toJs ? item.toJs({ dict_converter: Object.fromEntries }) : item);
        }
        return items;
      }
      return obj.toJs();
    }
  }

  return obj;
}

/**
 * Convert JavaScript object to Python native type.
 * Handles objects, arrays, and primitives.
 * Preserves PyProxy objects (e.g., DataFrames) inside arrays.
 * Extracts inner PyProxy from wrapper classes (via _pyProxy getter).
 */
function _toPy(obj) {
  if (obj === null || obj === undefined) return obj;

  // Already a PyProxy, return as-is
  if (obj.toJs) return obj;

  // If object has _pyProxy getter (wrapper class), extract the inner PyProxy
  if (obj._pyProxy && obj._pyProxy.toJs) {
    return obj._pyProxy;
  }

  // Handle arrays specially - convert to Python list while preserving PyProxy items
  if (Array.isArray(obj)) {
    const pyList = _pyodide.runPython('list()');
    for (const item of obj) {
      // If item has _pyProxy, use it; if item is a PyProxy, use it; otherwise convert
      let pyItem;
      if (item && item._pyProxy && item._pyProxy.toJs) {
        pyItem = item._pyProxy;
      } else if (item && item.toJs) {
        pyItem = item;
      } else {
        pyItem = _pyodide.toPy(item);
      }
      pyList.append(pyItem);
    }
    return pyList;
  }

  // Use Pyodide's toPy for other complex types (objects)
  if (typeof obj === 'object') {
    return _pyodide.toPy(obj);
  }

  return obj;
}

/**
 * Initialize the runtime (internal).
 */
async function _init() {
  if (_pyodide) return _pyodide;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import to avoid bundler issues
    const { loadPyodide } = await import('pyodide');
    _pyodide = await loadPyodide();
    await _pyodide.loadPackage('${packageName}');
    _initialized = true;
    return _pyodide;
  })();

  return _initPromise;
}

/**
 * Get a Python module (internal).
 */
async function _getModule(name) {
  if (_modules[name]) return _modules[name];
  const py = await _init();
  _modules[name] = py.pyimport(name);
  return _modules[name];
}

/**
 * Explicitly initialize the module.
 * Call this if you want to control when initialization happens.
 * Otherwise, initialization happens lazily on first use.
 */
export async function init() {
  await _init();
}

/**
 * Check if the module is initialized.
 */
export function isInitialized() {
  return _initialized;
}
${functionWrappers}
${classWrappers}
`;
}

/**
 * Generate TypeScript declarations for a Pyodide-based package
 */
function generatePyodideDts(schema: PipTypeSchema): string {
  const packageName = schema.package;

  // Collect all functions and classes
  const functionDecls: string[] = [];
  const classDecls: string[] = [];

  for (const module of schema.modules) {
    // Functions
    for (const func of module.functions) {
      const jsName = escapeJsFunctionName(toCamelCase(func.name));
      const params = func.params
        .map(p => `${escapeJsParamName(p.name)}?: ${pipTypeToTypeScript(p.type)}`)
        .join(', ');
      const returnType = pipTypeToTypeScript(func.returnType);

      const docLines = func.docstring?.split('\n').slice(0, 3).join('\n * ') || '';
      const docComment = docLines ? `/**\n * ${docLines}\n */\n` : '';
      functionDecls.push(`${docComment}export function ${jsName}(${params}): Promise<${returnType}>;`);
    }

    // Classes
    for (const cls of getExportableClasses(module)) {
      const className = toPascalCase(cls.name);

      const lines: string[] = [];
      const docLine = cls.docstring?.split('\n')[0] || cls.name;
      lines.push(`/**\n * ${docLine}\n */`);
      lines.push(`export class ${className} {`);

      // Constructor
      const ctorParams = cls.constructor?.params.filter(p => p.name !== 'self') || [];
      const ctorParamStr = ctorParams
        .map(p => `${escapeJsParamName(p.name)}?: ${pipTypeToTypeScript(p.type)}`)
        .join(', ');
      lines.push(`  constructor(${ctorParamStr});`);
      lines.push(`  static create(${ctorParamStr}): Promise<${className}>;`);

      // Methods
      for (const method of (cls.methods || [])) {
        if (SKIP_METHODS.has(method.name) || method.name.startsWith('_')) continue;

        const jsMethodName = toCamelCase(method.name);
        const methodParams = method.params.filter(p => p.name !== 'self');
        const paramStr = methodParams
          .map(p => `${escapeJsParamName(p.name)}?: ${pipTypeToTypeScript(p.type)}`)
          .join(', ');
        const returnType = pipTypeToTypeScript(method.returnType);

        if (method.docstring) {
          const methodDoc = method.docstring.split('\n')[0];
          lines.push(`  /** ${methodDoc} */`);
        }
        lines.push(`  ${jsMethodName}(${paramStr}): ${returnType};`);
      }

      lines.push('}');
      classDecls.push(lines.join('\n'));
    }
  }

  return `/**
 * TypeScript declarations for ${packageName}
 * Generated by umo pip-install
 *
 * Python package: ${packageName} v${schema.version}
 * Generated at: ${new Date().toISOString()}
 */

/**
 * Explicitly initialize the module.
 * Call this if you want to control when initialization happens.
 * Otherwise, initialization happens lazily on first use.
 */
export function init(): Promise<void>;

/**
 * Check if the module is initialized.
 */
export function isInitialized(): boolean;

${functionDecls.join('\n\n')}

${classDecls.join('\n\n')}
`;
}

/**
 * Result of Pyodide compilation
 */
export interface PyodideCompilationResult {
  indexJs: string;
  dtsContent: string;
  outputDir: string;
}

/**
 * Compile a Python package using Pyodide runtime.
 * This is an alternative to compilePipToWasm for packages with native extensions.
 */
export async function compileToPyodide(
  schema: PipTypeSchema,
  pkg: ResolvedPackage
): Promise<PyodideCompilationResult> {
  logger.debug(`Compiling ${pkg.name} with Pyodide runtime...`);

  // Check if package is available in Pyodide
  if (!isPyodidePackage(pkg.name)) {
    logger.warn(`Package ${pkg.name} may not be available in Pyodide's package repository`);
  }

  // Generate JavaScript wrapper
  const indexJs = generatePyodideWrapper(schema);

  // Generate TypeScript declarations
  const dtsContent = generatePyodideDts(schema);

  // Prepare output directory
  const outputDir = join(getPipModulesDirectory(), pkg.name);
  await ensureDirectory(outputDir);

  logger.debug(`Generated Pyodide wrapper for ${pkg.name}`);

  return {
    indexJs,
    dtsContent,
    outputDir
  };
}

/**
 * Write Pyodide-compiled package to umo_modules
 */
export async function writePyodideOutput(
  pkg: ResolvedPackage,
  schema: PipTypeSchema,
  result: PyodideCompilationResult
): Promise<string> {
  const { outputDir, indexJs, dtsContent } = result;

  // Write index.js
  await writeFileContent(join(outputDir, 'index.js'), indexJs);

  // Write index.d.ts
  await writeFileContent(join(outputDir, 'index.d.ts'), dtsContent);

  // Write package.json (no peerDependencies - pyodide is bundled internally)
  const packageJson = {
    name: `@umo_modules/${pkg.name}`,
    version: pkg.version,
    type: 'module',
    main: 'index.js',
    types: 'index.d.ts',
    files: ['index.js', 'index.d.ts'],
    umo: {
      pythonPackage: pkg.name,
      pythonVersion: pkg.version,
      runtime: 'pyodide',
      compiledAt: new Date().toISOString(),
      modules: schema.modules.map(m => m.name)
    }
  };
  await writeFileContent(join(outputDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  return outputDir;
}
