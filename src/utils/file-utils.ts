import { readFile, writeFile, mkdir, access, stat } from 'fs/promises';
import { constants } from 'fs';
import { dirname, join, resolve, extname } from 'path';
import { createHash } from 'crypto';
import { FileNotFoundError } from './error-handler.js';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readFileContent(filePath: string): Promise<string> {
  const exists = await fileExists(filePath);
  if (!exists) {
    throw new FileNotFoundError(filePath);
  }
  return readFile(filePath, 'utf-8');
}

export async function writeFileContent(
  filePath: string,
  content: string
): Promise<void> {
  await ensureDirectory(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
}

export async function readBinaryFile(filePath: string): Promise<Buffer> {
  const exists = await fileExists(filePath);
  if (!exists) {
    throw new FileNotFoundError(filePath);
  }
  return readFile(filePath);
}

export async function writeBinaryFile(
  filePath: string,
  content: Buffer
): Promise<void> {
  await ensureDirectory(dirname(filePath));
  await writeFile(filePath, content);
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function getFileExtension(filePath: string): string {
  return extname(filePath).toLowerCase();
}

export function isTypeScriptFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx';
}

export function isPythonFile(filePath: string): boolean {
  return getFileExtension(filePath) === '.py';
}

export function resolveModulePath(
  importPath: string,
  currentFilePath: string
): string {
  const currentDir = dirname(currentFilePath);
  return resolve(currentDir, importPath);
}

export async function getFileHash(filePath: string): Promise<string> {
  const content = await readFileContent(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function getLanguageFromFile(filePath: string): 'typescript' | 'python' | 'unknown' {
  if (isTypeScriptFile(filePath)) {
    return 'typescript';
  }
  if (isPythonFile(filePath)) {
    return 'python';
  }
  return 'unknown';
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function getBuildDirectory(): string {
  return join(process.cwd(), '.umo');
}

export function getCacheDirectory(): string {
  return join(getBuildDirectory(), 'cache');
}

export function getWitDirectory(): string {
  return join(getBuildDirectory(), 'wit');
}

export function getComponentsDirectory(): string {
  return join(getBuildDirectory(), 'components');
}

export function getPipModulesDirectory(): string {
  return join(process.cwd(), 'umo_modules');
}

export function getPipCacheDirectory(): string {
  return join(getCacheDirectory(), 'pip');
}
