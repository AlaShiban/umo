import { FunctionSignature, Module } from '../parser/types.js';
import { convertToKebabCase, witTypeToString } from './resolver.js';

export function generateWITPackageHeader(packageName: string): string {
  return `package umo:${packageName}@0.1.0;\n`;
}

export function generateWITInterface(
  interfaceName: string,
  functions: FunctionSignature[]
): string {
  const lines: string[] = [`interface ${interfaceName} {`];

  for (const func of functions) {
    const funcName = convertToKebabCase(func.name);
    const params = func.params
      .map((p) => `${convertToKebabCase(p.name)}: ${witTypeToString(p.type)}`)
      .join(', ');
    const returnType = witTypeToString(func.returnType);

    lines.push(`  ${funcName}: func(${params}) -> ${returnType};`);
  }

  lines.push('}');
  return lines.join('\n');
}

export function generateWITWorld(
  worldName: string,
  exports: string[],
  imports: string[]
): string {
  const lines: string[] = [`\nworld ${worldName} {`];

  for (const exp of exports) {
    lines.push(`  export ${exp};`);
  }

  for (const imp of imports) {
    lines.push(`  import ${imp};`);
  }

  lines.push('}');
  return lines.join('\n');
}

export function generateFullWIT(module: Module, dependencies: Module[]): string {
  const packageName = convertToKebabCase(
    module.path.split('/').pop()?.replace(/\.(ts|js|py)$/, '') || 'module'
  );

  const parts: string[] = [];

  // Package header
  parts.push(generateWITPackageHeader(packageName));
  parts.push('');

  // Generate interface for exports
  if (module.exports.length > 0) {
    const exportInterface = generateWITInterface('api', module.exports);
    parts.push(exportInterface);
    parts.push('');
  }

  // Generate imports from dependencies
  const worldImports: string[] = [];
  for (const dep of dependencies) {
    if (dep.exports.length > 0) {
      const depPackageName = convertToKebabCase(
        dep.path.split('/').pop()?.replace(/\.(ts|js|py)$/, '') || 'module'
      );
      // Import the api interface from the dependency package
      worldImports.push(`umo:${depPackageName}/api@0.1.0`);
    }
  }

  // Generate world
  const worldExports = module.exports.length > 0 ? ['api'] : [];
  const world = generateWITWorld(packageName, worldExports, worldImports);
  parts.push(world);

  return parts.join('\n');
}
