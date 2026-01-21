import {
  Module,
  DependencyGraph,
  ParseResult,
  Import,
  FunctionSignature,
} from './types.js';
import * as tsParser from './typescript-parser.js';
import * as pyParser from './python-parser.js';
import {
  readFileContent,
  getLanguageFromFile,
  getFileHash,
  fileExists,
} from '../utils/file-utils.js';
import {
  ParseError,
  FileNotFoundError,
  CircularDependencyError,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export async function parseModule(entryPath: string): Promise<ParseResult> {
  const graph: DependencyGraph = {
    modules: new Map(),
    edges: new Map(),
  };

  const visited = new Set<string>();
  const visiting = new Set<string>();

  await parseModuleRecursive(entryPath, graph, visited, visiting);

  const entryModule = graph.modules.get(entryPath);
  if (!entryModule) {
    throw new ParseError(`Failed to parse entry module: ${entryPath}`);
  }

  return {
    entryModule,
    graph,
    allModules: Array.from(graph.modules.values()),
  };
}

async function parseModuleRecursive(
  modulePath: string,
  graph: DependencyGraph,
  visited: Set<string>,
  visiting: Set<string>
): Promise<void> {
  // Check if already visited
  if (visited.has(modulePath)) {
    return;
  }

  // Check for circular dependency
  if (visiting.has(modulePath)) {
    const cycle = Array.from(visiting).concat(modulePath);
    throw new CircularDependencyError(cycle);
  }

  // Mark as visiting
  visiting.add(modulePath);

  logger.debug(`Parsing module: ${modulePath}`);

  // Check if file exists
  if (!(await fileExists(modulePath))) {
    throw new FileNotFoundError(modulePath);
  }

  // Read file content
  const content = await readFileContent(modulePath);
  const hash = await getFileHash(modulePath);
  const language = getLanguageFromFile(modulePath);

  if (language === 'unknown') {
    throw new ParseError(`Unsupported file type: ${modulePath}`);
  }

  // Parse imports
  let imports: Import[];
  if (language === 'typescript') {
    imports = tsParser.extractUmoImports(content, modulePath);
  } else {
    imports = pyParser.extractUmoImports(content, modulePath);
  }

  // Parse exported functions
  let exports: FunctionSignature[];
  if (language === 'typescript') {
    exports = tsParser.extractExportedFunctions(content, modulePath);
  } else {
    exports = pyParser.extractExportedFunctions(content, modulePath);
  }

  logger.debug(
    `  Found ${imports.length} import(s) and ${exports.length} export(s)`
  );

  // Create module
  const module: Module = {
    path: modulePath,
    language,
    imports,
    exports,
    content,
    hash,
  };

  // Add to graph
  graph.modules.set(modulePath, module);

  // Add edges
  const edges = new Set<string>();
  for (const imp of imports) {
    edges.add(imp.resolvedPath);
  }
  graph.edges.set(modulePath, edges);

  // Parse dependencies
  for (const imp of imports) {
    await parseModuleRecursive(imp.resolvedPath, graph, visited, visiting);
  }

  // Mark as visited
  visiting.delete(modulePath);
  visited.add(modulePath);
}

export function topologicalSort(graph: DependencyGraph): Module[] {
  const sorted: Module[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(modulePath: string) {
    if (visited.has(modulePath)) {
      return;
    }

    if (temp.has(modulePath)) {
      throw new CircularDependencyError([modulePath]);
    }

    temp.add(modulePath);

    const edges = graph.edges.get(modulePath) || new Set();
    for (const dep of edges) {
      visit(dep);
    }

    temp.delete(modulePath);
    visited.add(modulePath);

    const module = graph.modules.get(modulePath);
    if (module) {
      sorted.push(module);
    }
  }

  for (const modulePath of graph.modules.keys()) {
    if (!visited.has(modulePath)) {
      visit(modulePath);
    }
  }

  return sorted;
}

export function validateGraph(graph: DependencyGraph): void {
  // Validate all imported modules exist
  for (const module of graph.modules.values()) {
    for (const imp of module.imports) {
      if (!graph.modules.has(imp.resolvedPath)) {
        throw new ParseError(
          `Module ${module.path} imports ${imp.modulePath}, but it was not found at ${imp.resolvedPath}`
        );
      }
    }
  }
}
