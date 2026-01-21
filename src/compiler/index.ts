import { join } from 'path';
import { rm } from 'fs/promises';
import { Module } from '../parser/types.js';
import { WITFile } from '../wit/generator.js';
import { compileTypeScript } from './typescript-compiler.js';
import { compilePython } from './python-compiler.js';
import {
  getCacheDirectory,
  getComponentsDirectory,
  fileExists,
  getFileHash,
  ensureDirectory,
  readBinaryFile,
  writeBinaryFile,
} from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';

export interface CompiledComponent {
  module: Module;
  componentPath: string;
  witFile: WITFile;
}

export async function compileModules(
  modules: Module[],
  witFiles: WITFile[],
  useCache: boolean = true
): Promise<CompiledComponent[]> {
  const compiled: CompiledComponent[] = [];
  const cacheDir = getCacheDirectory();
  await ensureDirectory(cacheDir);

  // Clean components directory to avoid conflicts from previous runs
  const componentsDir = getComponentsDirectory();
  await rm(componentsDir, { recursive: true, force: true });
  await ensureDirectory(componentsDir);

  // Create a map of module path to WIT file
  const witMap = new Map<string, WITFile>();
  for (const witFile of witFiles) {
    witMap.set(witFile.modulePath, witFile);
  }

  for (const module of modules) {
    const witFile = witMap.get(module.path);
    if (!witFile) {
      throw new Error(`No WIT file found for module: ${module.path}`);
    }

    // Check cache
    if (useCache) {
      const cachedComponent = await checkCache(module, witFile, cacheDir);
      if (cachedComponent) {
        logger.debug(`Using cached component for: ${module.path}`);
        compiled.push({
          module,
          componentPath: cachedComponent,
          witFile,
        });
        continue;
      }
    }

    // Compile based on language
    let componentPath: string;
    if (module.language === 'typescript') {
      const result = await compileTypeScript(module, witFile);
      componentPath = result.componentPath;
    } else if (module.language === 'python') {
      const result = await compilePython(module, witFile);
      componentPath = result.componentPath;
    } else {
      throw new Error(`Unsupported language: ${module.language}`);
    }

    // Store in cache
    if (useCache) {
      await storeInCache(module, witFile, componentPath, cacheDir);
    }

    compiled.push({
      module,
      componentPath,
      witFile,
    });
  }

  return compiled;
}

async function checkCache(
  module: Module,
  witFile: WITFile,
  cacheDir: string
): Promise<string | null> {
  const cacheKey = await getCacheKey(module, witFile);
  const cachedPath = join(cacheDir, `${cacheKey}.wasm`);

  if (await fileExists(cachedPath)) {
    return cachedPath;
  }

  return null;
}

async function storeInCache(
  module: Module,
  witFile: WITFile,
  componentPath: string,
  cacheDir: string
): Promise<void> {
  const cacheKey = await getCacheKey(module, witFile);
  const cachedPath = join(cacheDir, `${cacheKey}.wasm`);

  // Copy component to cache (binary copy for WASM files)
  const content = await readBinaryFile(componentPath);
  await writeBinaryFile(cachedPath, content);
  logger.debug(`Stored component in cache: ${cachedPath}`);
}

async function getCacheKey(module: Module, witFile: WITFile): Promise<string> {
  // Create a cache key based on module hash and WIT content
  const { createHash } = await import('crypto');
  const hash = createHash('sha256');
  hash.update(module.hash);
  hash.update(witFile.content);
  return hash.digest('hex').substring(0, 16);
}
