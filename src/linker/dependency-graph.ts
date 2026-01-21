import { Module, DependencyGraph } from '../parser/types.js';
import { CircularDependencyError } from '../utils/error-handler.js';

export function getCompilationOrder(graph: DependencyGraph): Module[] {
  const sorted: Module[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(modulePath: string, path: string[] = []) {
    if (visited.has(modulePath)) {
      return;
    }

    if (temp.has(modulePath)) {
      throw new CircularDependencyError([...path, modulePath]);
    }

    temp.add(modulePath);

    const edges = graph.edges.get(modulePath) || new Set();
    for (const dep of edges) {
      visit(dep, [...path, modulePath]);
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
