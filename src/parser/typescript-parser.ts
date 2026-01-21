import * as ts from 'typescript';
import { FunctionSignature, Import, Parameter, WITType } from './types.js';
import { ParseError } from '../utils/error-handler.js';
import { resolveModulePath } from '../utils/file-utils.js';

const UMO_IMPORT_REGEX = /^\/\/\s*umo:\s*import\s+(.+)\s*$/;

export function extractUmoImports(
  sourceCode: string,
  currentFilePath: string
): Import[] {
  const imports: Import[] = [];
  const lines = sourceCode.split('\n');

  for (const line of lines) {
    const match = line.trim().match(UMO_IMPORT_REGEX);
    if (match) {
      const importPath = match[1].trim();
      const resolvedPath = resolveModulePath(importPath, currentFilePath);
      imports.push({
        modulePath: importPath,
        resolvedPath,
      });
    }
  }

  return imports;
}

export function extractExportedFunctions(
  sourceCode: string,
  filePath: string
): FunctionSignature[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const functions: FunctionSignature[] = [];

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some(
        (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
      );

      if (hasExport) {
        try {
          const signature = extractFunctionSignature(node, sourceFile);
          functions.push(signature);
        } catch (error) {
          if (error instanceof Error) {
            throw new ParseError(
              `Failed to parse function ${node.name.text} in ${filePath}: ${error.message}`
            );
          }
          throw error;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function extractFunctionSignature(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile
): FunctionSignature {
  if (!node.name) {
    throw new ParseError('Function must have a name');
  }

  const name = node.name.text;
  const params: Parameter[] = [];

  // Extract parameters
  for (const param of node.parameters) {
    if (!ts.isIdentifier(param.name)) {
      throw new ParseError(
        `Parameter in function ${name} must have a simple identifier name`
      );
    }

    if (!param.type) {
      throw new ParseError(
        `Parameter ${param.name.text} in function ${name} must have a type annotation`
      );
    }

    const paramName = param.name.text;
    const paramType = mapTypeScriptTypeToWIT(param.type, sourceFile);

    params.push({
      name: paramName,
      type: paramType,
    });
  }

  // Extract return type
  if (!node.type) {
    throw new ParseError(`Function ${name} must have a return type annotation`);
  }

  const returnType = mapTypeScriptTypeToWIT(node.type, sourceFile);

  return {
    name,
    params,
    returnType,
  };
}

function mapTypeScriptTypeToWIT(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile
): WITType {
  const typeText = typeNode.getText(sourceFile);

  switch (typeText) {
    case 'string':
      return 'string';
    case 'number':
      // For MVP, we'll default to s32 for integers
      // In the future, we could inspect usage to determine int vs float
      return 's32';
    case 'boolean':
      return 'bool';
    default:
      throw new ParseError(
        `Unsupported TypeScript type: ${typeText}. Only string, number, and boolean are supported in MVP.`
      );
  }
}

export function convertFunctionNameToKebab(name: string): string {
  // Convert camelCase to kebab-case for WIT
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// Node.js built-in modules
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  // Node.js prefixed versions
  'node:assert', 'node:async_hooks', 'node:buffer', 'node:child_process',
  'node:cluster', 'node:console', 'node:constants', 'node:crypto', 'node:dgram',
  'node:diagnostics_channel', 'node:dns', 'node:domain', 'node:events',
  'node:fs', 'node:http', 'node:http2', 'node:https', 'node:inspector',
  'node:module', 'node:net', 'node:os', 'node:path', 'node:perf_hooks',
  'node:process', 'node:punycode', 'node:querystring', 'node:readline',
  'node:repl', 'node:stream', 'node:string_decoder', 'node:sys', 'node:timers',
  'node:tls', 'node:trace_events', 'node:tty', 'node:url', 'node:util',
  'node:v8', 'node:vm', 'node:wasi', 'node:worker_threads', 'node:zlib',
]);

/**
 * Extract third-party npm packages from TypeScript/JavaScript source code.
 * Returns a list of package names that need to be npm installed.
 */
export function extractNpmPackages(sourceCode: string): string[] {
  const packages = new Set<string>();

  // Match: import X from "package" or import { X } from "package"
  const importRegex = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(sourceCode)) !== null) {
    const modulePath = match[1];
    const pkg = getPackageName(modulePath);
    if (pkg && !NODE_BUILTINS.has(modulePath) && !isRelativePath(modulePath)) {
      packages.add(pkg);
    }
  }

  // Match: require("package")
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(sourceCode)) !== null) {
    const modulePath = match[1];
    const pkg = getPackageName(modulePath);
    if (pkg && !NODE_BUILTINS.has(modulePath) && !isRelativePath(modulePath)) {
      packages.add(pkg);
    }
  }

  return Array.from(packages);
}

/**
 * Get the package name from an import path.
 * Handles scoped packages like @org/package.
 */
function getPackageName(importPath: string): string | null {
  if (importPath.startsWith('@')) {
    // Scoped package: @org/package or @org/package/subpath
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  } else {
    // Regular package: package or package/subpath
    const parts = importPath.split('/');
    return parts[0];
  }
}

function isRelativePath(path: string): boolean {
  return path.startsWith('.') || path.startsWith('/');
}

/**
 * Extract original import statements from TypeScript source code (excluding umo imports).
 * Returns import statements to include in the wrapper.
 */
export function extractOriginalImports(sourceCode: string): string[] {
  const imports: string[] = [];
  const lines = sourceCode.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip umo import comments
    if (trimmed.startsWith('// umo:')) {
      continue;
    }

    // Match import statements
    if (trimmed.startsWith('import ')) {
      imports.push(trimmed);
    }
  }

  return imports;
}
