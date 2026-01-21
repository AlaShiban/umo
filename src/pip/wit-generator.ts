/**
 * WIT interface generation for pip packages.
 * Converts Python type schema to WebAssembly Interface Types.
 */

import { join } from 'path';
import { logger } from '../utils/logger.js';
import { getBuildDirectory, ensureDirectory, writeFileContent } from '../utils/file-utils.js';
import { PipTypeSchema, PipType, PipFunction, PipModule, PipClass, pipTypeToString } from './type-schema.js';
import { ResolvedPackage } from './package-resolver.js';

/**
 * Convert a Python type to WIT type syntax
 */
function pipTypeToWIT(type: PipType): string {
  switch (type.kind) {
    case 'primitive':
      switch (type.value) {
        case 'str':
          return 'string';
        case 'int':
          return 's64';
        case 'float':
          return 'f64';
        case 'bool':
          return 'bool';
        default:
          return 'string'; // Fallback
      }

    case 'list':
      const elementType = type.elementType ? pipTypeToWIT(type.elementType) : 'string';
      return `list<${elementType}>`;

    case 'dict':
      // WIT doesn't have a native dict type, use list of tuples
      const keyType = type.keyType ? pipTypeToWIT(type.keyType) : 'string';
      const valueType = type.valueType ? pipTypeToWIT(type.valueType) : 'string';
      return `list<tuple<${keyType}, ${valueType}>>`;

    case 'optional':
      const innerType = type.innerType ? pipTypeToWIT(type.innerType) : 'string';
      return `option<${innerType}>`;

    case 'tuple':
      const elements = type.elements?.map(pipTypeToWIT).join(', ') || '';
      return `tuple<${elements}>`;

    case 'class':
      // For now, treat classes as strings (JSON serialization)
      // Full class/resource support will be added later
      return 'string';

    case 'none':
      // WIT doesn't have 'unit' type. For return types, we omit it.
      // For nested contexts (tuples), use option<string> as a placeholder.
      return 'option<string>';

    case 'any':
    default:
      // For untyped values, use string as a fallback (JSON serialization)
      return 'string';
  }
}

/**
 * WIT reserved keywords that cannot be used as identifiers
 * See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md
 */
const WIT_RESERVED_KEYWORDS = new Set([
  // WIT keywords
  'func', 'interface', 'world', 'package', 'import', 'export',
  'type', 'record', 'flags', 'variant', 'enum', 'union',
  'resource', 'use', 'as', 'constructor', 'static', 'own', 'borrow',
  'include', 'with', 'from',  // file inclusion and import keywords
  // Built-in types
  'result', 'option', 'list', 'tuple', 'string', 'bool',
  's8', 's16', 's32', 's64', 'u8', 'u16', 'u32', 'u64',
  'f32', 'f64', 'char', 'stream', 'future', 'error',
  // Additional reserved identifiers
  'self', 'true', 'false', 'null', 'new', 'abstract', 'await'
]);

/**
 * Convert a string to kebab-case for WIT identifiers
 */
function toKebabCase(str: string): string {
  let result = str
    // Convert camelCase to kebab-case
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    // Convert underscores to hyphens
    .replace(/_/g, '-')
    .toLowerCase();

  // Collapse multiple consecutive hyphens into one (handles __ -> -- case)
  result = result.replace(/-+/g, '-');

  // Remove trailing hyphen (from trailing underscore in Python)
  result = result.replace(/-$/, '');

  // Remove leading hyphen (from leading underscore in Python)
  result = result.replace(/^-/, '');

  // WIT identifiers can't have digits immediately after hyphens
  // handle-401 -> handle-n401, float-to-255 -> float-to-n255
  result = result.replace(/-(\d)/g, '-n$1');

  // WIT identifiers can't start with a digit
  if (/^\d/.test(result)) {
    result = 'n' + result;
  }

  // If the result is empty or just hyphens, add a suffix
  if (!result || result === '-') {
    return 'fn';
  }

  return result;
}

/**
 * Escape a parameter name if it's a WIT reserved keyword
 */
function escapeWitIdentifier(name: string): string {
  const kebabName = toKebabCase(name);
  if (WIT_RESERVED_KEYWORDS.has(kebabName)) {
    return `${kebabName}-param`;
  }
  return kebabName;
}

/**
 * Generate a WIT function signature
 */
function generateWITFunction(func: PipFunction): string {
  const name = escapeWitIdentifier(func.name);

  // Track seen parameter names to deduplicate
  const seenNames = new Map<string, number>();

  const params = func.params
    .map(p => {
      let paramName = escapeWitIdentifier(p.name);

      // Handle duplicate parameter names
      const count = seenNames.get(paramName) || 0;
      seenNames.set(paramName, count + 1);
      if (count > 0) {
        paramName = `${paramName}${count + 1}`;
      }

      return `${paramName}: ${pipTypeToWIT(p.type)}`;
    })
    .join(', ');

  const returnType = pipTypeToWIT(func.returnType);

  // Handle void return
  if (func.returnType.kind === 'none') {
    return `  ${name}: func(${params});`;
  }

  return `  ${name}: func(${params}) -> ${returnType};`;
}

/**
 * Methods that should be skipped when generating WIT resources
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
 * Generate a WIT method signature for a resource
 * Similar to generateWITFunction but formatted for resource methods
 * @param resourceName - the name of the containing resource (for collision detection)
 */
function generateWITResourceMethod(method: PipFunction, resourceName: string): string | null {
  // Skip special methods
  if (SKIP_METHODS.has(method.name)) {
    return null;
  }

  // Skip private methods (starting with _)
  if (method.name.startsWith('_')) {
    return null;
  }

  let name = escapeWitIdentifier(method.name);

  // If method name matches resource name, rename to avoid collision
  if (name === resourceName) {
    name = `${name}-method`;
  }

  // Track seen parameter names to deduplicate
  const seenNames = new Map<string, number>();

  // Filter out 'self' parameter for methods
  const params = method.params
    .filter(p => p.name !== 'self')
    .map(p => {
      let paramName = escapeWitIdentifier(p.name);

      // Handle duplicate parameter names
      const count = seenNames.get(paramName) || 0;
      seenNames.set(paramName, count + 1);
      if (count > 0) {
        paramName = `${paramName}${count + 1}`;
      }

      return `${paramName}: ${pipTypeToWIT(p.type)}`;
    })
    .join(', ');

  const returnType = pipTypeToWIT(method.returnType);

  // Handle void return
  if (method.returnType.kind === 'none') {
    return `    ${name}: func(${params});`;
  }

  return `    ${name}: func(${params}) -> ${returnType};`;
}

/**
 * Escape a resource/class name if it's a WIT reserved keyword
 */
function escapeWitResourceName(name: string): string {
  const kebabName = toKebabCase(name);
  if (WIT_RESERVED_KEYWORDS.has(kebabName)) {
    return `${kebabName}-class`;
  }
  return kebabName;
}

/**
 * Generate a WIT resource definition for a Python class
 */
function generateWITResource(cls: PipClass): string {
  const resourceName = escapeWitResourceName(cls.name);

  const lines: string[] = [];
  lines.push(`  resource ${resourceName} {`);

  // Generate constructor if present
  if (cls.constructor) {
    // Track seen parameter names to deduplicate
    const seenParamNames = new Map<string, number>();

    // Filter out 'self' parameter and deduplicate names
    const params = cls.constructor.params
      .filter(p => p.name !== 'self')
      .map(p => {
        let paramName = escapeWitIdentifier(p.name);

        // Handle duplicate parameter names
        const count = seenParamNames.get(paramName) || 0;
        seenParamNames.set(paramName, count + 1);
        if (count > 0) {
          paramName = `${paramName}${count + 1}`;
        }

        return `${paramName}: ${pipTypeToWIT(p.type)}`;
      })
      .join(', ');

    lines.push(`    constructor(${params});`);
  } else {
    // Default constructor with no parameters
    lines.push(`    constructor();`);
  }

  // Generate methods (deduplicate by name - first definition wins)
  const seenMethodNames = new Set<string>();
  for (const method of cls.methods) {
    // Get the method name to check for duplicates
    const methodName = escapeWitIdentifier(method.name);
    // Apply resource collision rename if needed
    const finalName = methodName === resourceName ? `${methodName}-method` : methodName;

    // Skip if we've already seen this method name
    if (seenMethodNames.has(finalName)) {
      continue;
    }
    seenMethodNames.add(finalName);

    const methodDef = generateWITResourceMethod(method, resourceName);
    if (methodDef) {
      lines.push(methodDef);
    }
  }

  lines.push(`  }`);

  return lines.join('\n');
}

/**
 * Generate WIT interface for a module
 */
function generateWITInterface(module: PipModule): string {
  const interfaceName = toKebabCase(module.name.replace(/\./g, '-')) + '-api';

  const parts: string[] = [];

  // Build set of class names (as kebab-case) for collision detection
  // Also deduplicate classes by kebab-case name (multiple Python classes may map to same WIT resource)
  const seenResourceNames = new Map<string, PipClass>();
  const exportableClasses = (module.classes || []).filter(cls => {
    // Skip exception classes - they don't make sense as WIT resources
    const name = cls.name.toLowerCase();
    // Skip exception classes and codec/streaming infrastructure classes
    if (name.endsWith('error') || name.endsWith('exception')) return false;
    if (name.startsWith('invalid')) return false;
    if (name.startsWith('incremental')) return false;  // IncrementalEncoder/Decoder
    if (name.startsWith('stream')) return false;       // StreamReader/Writer
    if (name === 'codec') return false;

    // Deduplicate by kebab-case name
    const kebabName = escapeWitResourceName(cls.name);
    if (seenResourceNames.has(kebabName)) {
      return false; // Skip duplicate
    }
    seenResourceNames.set(kebabName, cls);
    return true;
  });

  const classNames = new Set(exportableClasses.map(c => escapeWitResourceName(c.name)));

  // Generate resources for classes
  if (exportableClasses.length > 0) {
    const resources = exportableClasses
      .map(generateWITResource)
      .join('\n\n');
    if (resources) {
      parts.push(resources);
    }
  }

  // Generate functions (rename collisions with classes by adding -fn suffix)
  if (module.functions.length > 0) {
    const functions = module.functions
      .map(f => {
        const kebabName = toKebabCase(f.name);
        if (classNames.has(kebabName)) {
          // Rename function to avoid collision with class/resource name
          return generateWITFunction({ ...f, name: f.name + '_fn' });
        }
        return generateWITFunction(f);
      })
      .join('\n');
    if (functions) {
      parts.push(functions);
    }
  }

  return `interface ${interfaceName} {
${parts.join('\n\n')}
}`;
}

/**
 * Check if a module has exportable content (functions or classes)
 */
function hasExportableContent(module: PipModule): boolean {
  return module.functions.length > 0 || (module.classes && module.classes.length > 0);
}

/**
 * Generate the complete WIT file for a pip package
 */
function generateWITContent(schema: PipTypeSchema): string {
  const packageName = toKebabCase(schema.package);

  // Generate interfaces for each module with exportable content
  const interfaces = schema.modules
    .filter(hasExportableContent)
    .map(generateWITInterface)
    .join('\n\n');

  // Generate world with all exports
  const exports = schema.modules
    .filter(hasExportableContent)
    .map(m => `  export ${toKebabCase(m.name.replace(/\./g, '-'))}-api;`)
    .join('\n');

  return `// WIT interface for ${schema.package} v${schema.version}
// Generated by umo pip-install

package pip:${packageName}@0.1.0;

${interfaces}

world ${packageName} {
${exports}
}
`;
}

/**
 * Generate WIT file for a pip package and return the path
 */
export async function generateWITForPip(
  schema: PipTypeSchema,
  pkg: ResolvedPackage
): Promise<string> {
  logger.debug(`Generating WIT for ${pkg.name}...`);

  // Create WIT directory for pip modules
  const witDir = join(getBuildDirectory(), 'pip-wit', pkg.name);
  await ensureDirectory(witDir);

  // Generate WIT content
  const witContent = generateWITContent(schema);

  // Write WIT file
  const witPath = join(witDir, `${pkg.name}.wit`);
  await writeFileContent(witPath, witContent);

  logger.debug(`Generated WIT file: ${witPath}`);

  return witPath;
}

/**
 * Get the WIT type for documentation purposes
 */
export function getWITTypeString(type: PipType): string {
  return pipTypeToWIT(type);
}
