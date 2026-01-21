import { join } from 'path';
import { rm } from 'fs/promises';
import { Module, DependencyGraph } from '../parser/types.js';
import { generateFullWIT } from './templates.js';
import {
  getWitDirectory,
  writeFileContent,
  ensureDirectory,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { convertToKebabCase } from './resolver.js';

export interface WITFile {
  modulePath: string;
  witPath: string;
  content: string;
}

export async function generateWIT(
  graph: DependencyGraph
): Promise<WITFile[]> {
  const witDir = getWitDirectory();

  // Clean WIT directory to avoid conflicts from previous runs
  await rm(witDir, { recursive: true, force: true });
  await ensureDirectory(witDir);

  // Create deps directory for dependencies
  const depsDir = join(witDir, 'deps');
  await ensureDirectory(depsDir);

  const witFiles: WITFile[] = [];

  // Determine which modules are dependencies of others
  const isDependency = new Set<string>();
  for (const edges of graph.edges.values()) {
    for (const depPath of edges) {
      isDependency.add(depPath);
    }
  }

  for (const module of graph.modules.values()) {
    const dependencies = getModuleDependencies(module, graph);
    const witContent = generateFullWIT(module, dependencies);

    const packageName = convertToKebabCase(
      module.path.split('/').pop()?.replace(/\.(ts|js|py)$/, '') || 'module'
    );

    // Main modules (that have dependencies or are standalone) go in root
    // Pure dependency modules go in deps/<package>/
    let witPath: string;
    if (isDependency.has(module.path) && dependencies.length === 0) {
      // This is a pure dependency (imported by others, has no imports itself)
      const packageDir = join(depsDir, packageName);
      await ensureDirectory(packageDir);
      witPath = join(packageDir, `${packageName}.wit`);
    } else {
      // This is a main module or has its own dependencies
      witPath = join(witDir, `${packageName}.wit`);
    }

    await writeFileContent(witPath, witContent);
    logger.debug(`Generated WIT file: ${witPath}`);

    witFiles.push({
      modulePath: module.path,
      witPath,
      content: witContent,
    });
  }

  return witFiles;
}

function getModuleDependencies(
  module: Module,
  graph: DependencyGraph
): Module[] {
  const dependencies: Module[] = [];
  const edges = graph.edges.get(module.path);

  if (edges) {
    for (const depPath of edges) {
      const depModule = graph.modules.get(depPath);
      if (depModule) {
        dependencies.push(depModule);
      }
    }
  }

  return dependencies;
}

export function getWITPathForModule(modulePath: string): string {
  const packageName = convertToKebabCase(
    modulePath.split('/').pop()?.replace(/\.(ts|js|py)$/, '') || 'module'
  );
  return join(getWitDirectory(), `${packageName}.wit`);
}
