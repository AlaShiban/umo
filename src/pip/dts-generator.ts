/**
 * TypeScript declaration generation for pip packages.
 * Generates .d.ts files from Python type schema for IDE autocomplete.
 */

import { PipTypeSchema, PipType, PipFunction, PipModule, PipClass } from './type-schema.js';

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
 * Convert a PipType to TypeScript type string
 */
function pipTypeToTypeScript(type: PipType): string {
  switch (type.kind) {
    case 'primitive':
      switch (type.value) {
        case 'str':
          return 'string';
        case 'int':
        case 'float':
          return 'number';
        case 'bool':
          return 'boolean';
        default:
          return 'string';
      }

    case 'list':
      const elementType = type.elementType ? pipTypeToTypeScript(type.elementType) : 'unknown';
      return `${elementType}[]`;

    case 'dict':
      const keyType = type.keyType ? pipTypeToTypeScript(type.keyType) : 'string';
      const valueType = type.valueType ? pipTypeToTypeScript(type.valueType) : 'unknown';
      return `Map<${keyType}, ${valueType}>`;

    case 'optional':
      const innerType = type.innerType ? pipTypeToTypeScript(type.innerType) : 'unknown';
      return `${innerType} | null`;

    case 'tuple':
      const elements = type.elements?.map(pipTypeToTypeScript).join(', ') || '';
      return `[${elements}]`;

    case 'class':
      return type.className || 'unknown';

    case 'none':
      return 'void';

    case 'any':
    default:
      return 'unknown';
  }
}

/**
 * Generate JSDoc comment from docstring
 */
function generateJSDoc(docstring: string | null | undefined, params?: { name: string; type: PipType }[]): string {
  if (!docstring && (!params || params.length === 0)) {
    return '';
  }

  const lines: string[] = ['/**'];

  if (docstring) {
    // Split docstring into lines and format
    const docLines = docstring.split('\n');
    for (const line of docLines) {
      lines.push(` * ${line}`);
    }
  }

  if (params && params.length > 0) {
    if (docstring) {
      lines.push(' *');
    }
    for (const param of params) {
      const tsType = pipTypeToTypeScript(param.type);
      lines.push(` * @param ${param.name} - ${tsType}`);
    }
  }

  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generate TypeScript declaration for a function
 */
function generateFunctionDeclaration(func: PipFunction): string {
  const jsName = toCamelCase(func.name.replace(/_/g, '-'));

  // Escape reserved JS keywords in parameter names
  const escapedParams = func.params.map(p => ({
    ...p,
    name: escapeJsParamName(p.name)
  }));

  const params = escapedParams
    .map(p => `${p.name}: ${pipTypeToTypeScript(p.type)}`)
    .join(', ');

  const returnType = pipTypeToTypeScript(func.returnType);

  // All functions are async due to WASM loading
  const jsdoc = generateJSDoc(func.docstring, escapedParams);

  return `${jsdoc}
export function ${jsName}(${params}): Promise<${returnType}>;`;
}

/**
 * Generate TypeScript declaration for a class
 */
function generateClassDeclaration(cls: PipClass): string {
  const lines: string[] = [];

  // Class JSDoc
  if (cls.docstring) {
    lines.push(generateJSDoc(cls.docstring));
  }

  lines.push(`export class ${cls.name} {`);

  // Constructor
  if (cls.constructor) {
    const params = cls.constructor.params
      .map(p => `${escapeJsParamName(p.name)}: ${pipTypeToTypeScript(p.type)}`)
      .join(', ');
    lines.push(`  constructor(${params});`);
  }

  // Properties
  for (const prop of cls.properties || []) {
    const propType = pipTypeToTypeScript(prop.type);
    const readonly = prop.readonly ? 'readonly ' : '';
    if (prop.docstring) {
      lines.push(`  /** ${prop.docstring} */`);
    }
    lines.push(`  ${readonly}${escapeJsParamName(prop.name)}: ${propType};`);
  }

  // Methods
  for (const method of cls.methods || []) {
    const params = method.params
      .map(p => `${escapeJsParamName(p.name)}: ${pipTypeToTypeScript(p.type)}`)
      .join(', ');
    const returnType = pipTypeToTypeScript(method.returnType);

    if (method.docstring) {
      lines.push(`  /** ${method.docstring} */`);
    }
    lines.push(`  ${method.name}(${params}): Promise<${returnType}>;`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate TypeScript declarations for a module
 * Note: Classes are now exported as WIT resources and handled separately
 */
function generateModuleDeclarations(module: PipModule, exportedFunctions: Set<string>): string {
  const declarations: string[] = [];

  // Generate function declarations
  for (const func of module.functions) {
    const jsName = toCamelCase(func.name);
    // Skip if we've already exported a function with this name
    if (exportedFunctions.has(jsName)) {
      continue;
    }
    exportedFunctions.add(jsName);

    declarations.push(generateFunctionDeclaration(func));
  }

  // Note: Class declarations are now re-exported from jco bindings
  // See generateResourceClassReExports()

  return declarations.join('\n\n');
}

/**
 * Generate re-export statements for resource classes from jco bindings
 */
function generateResourceClassReExports(schema: PipTypeSchema): string | null {
  const resourceClasses: string[] = [];
  let interfaceFilePath: string | null = null;

  for (const module of schema.modules) {
    if (hasExportableClasses(module)) {
      // Compute the jco interface file path
      // Pattern: pip-{package}-{module-name-kebab}-api
      const moduleNameKebab = module.name.replace(/\./g, '-').toLowerCase();
      const interfaceName = `pip-${schema.package}-${moduleNameKebab}-api`;
      interfaceFilePath = `./bindings/interfaces/${interfaceName}.js`;

      for (const cls of getExportableClasses(module)) {
        const resourceName = cls.name.toLowerCase().replace(/_/g, '-');
        const className = toPascalCase(resourceName);
        resourceClasses.push(className);
      }
    }
  }

  if (resourceClasses.length === 0 || !interfaceFilePath) {
    return null;
  }

  return `// Re-export resource classes from jco bindings
export { ${resourceClasses.join(', ')} } from '${interfaceFilePath}';`;
}

/**
 * Generate complete TypeScript declaration file content
 */
export async function generateTypeDeclarations(schema: PipTypeSchema): Promise<string> {
  const sections: string[] = [];

  // Header
  sections.push(`/**
 * TypeScript declarations for ${schema.package}
 * Generated by umo pip-install
 *
 * Python package: ${schema.package} v${schema.version}
 * Generated at: ${new Date().toISOString()}
 */`);

  // Init function
  sections.push(`
/**
 * Explicitly initialize the WASM module.
 * Call this if you want to control when initialization happens.
 * Otherwise, initialization happens lazily on first function call.
 */
export function init(): Promise<void>;

/**
 * Check if the module is initialized.
 */
export function isInitialized(): boolean;`);

  // Track exported function names to avoid duplicates (same function in multiple modules)
  const exportedFunctions = new Set<string>();

  // Generate declarations for each module
  for (const module of schema.modules) {
    if (module.functions.length === 0) {
      continue;
    }

    // Add module comment
    if (module.docstring) {
      sections.push(`\n// Module: ${module.name}\n// ${module.docstring}`);
    }

    const moduleDecl = generateModuleDeclarations(module, exportedFunctions);
    if (moduleDecl) {
      sections.push(moduleDecl);
    }
  }

  // Add resource class re-exports from jco bindings
  const classReExports = generateResourceClassReExports(schema);
  if (classReExports) {
    sections.push(classReExports);
  }

  return sections.join('\n\n');
}

/**
 * Get TypeScript type for a PipType (exported for testing)
 */
export function getTypeScriptType(type: PipType): string {
  return pipTypeToTypeScript(type);
}
