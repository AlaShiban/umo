/**
 * Type extraction from Python packages.
 * Executes a Python script to extract type information and validates coverage.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import { TypeExtractionError } from '../utils/error-handler.js';
import { PipTypeSchema } from './type-schema.js';
import { ResolvedPackage, getPipVenvDirectory } from './package-resolver.js';

export interface TypeExtractionResult {
  schema: PipTypeSchema;
  coverage: number;
}

/**
 * Get the path to the extract-types.py script
 */
function getExtractScriptPath(): string {
  // Handle both ESM and CommonJS
  const currentFile = fileURLToPath(import.meta.url);
  const srcDir = dirname(dirname(currentFile));
  const projectDir = dirname(srcDir);
  return join(projectDir, 'scripts', 'extract-types.py');
}

/**
 * Extract type information from an installed Python package.
 */
export async function extractTypes(
  pkg: ResolvedPackage,
  options: { strict?: boolean } = { strict: false }
): Promise<TypeExtractionResult> {
  logger.debug(`Extracting types from ${pkg.name}...`);

  const venvPath = getPipVenvDirectory();
  const venvPython = join(venvPath, 'bin', 'python');
  const extractScript = getExtractScriptPath();

  let result;
  try {
    // Use importName for the Python import (may differ from pip name)
    // Pass pip name as third argument for version detection
    result = await execa(venvPython, [
      extractScript,
      pkg.importName,
      pkg.sitePackagesPath,
      pkg.name // pip package name for version detection
    ], { stdio: 'pipe' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new TypeExtractionError(
      `Failed to extract types from ${pkg.name} (import: ${pkg.importName})`,
      [],
      message
    );
  }

  let schema: PipTypeSchema;
  try {
    schema = JSON.parse(result.stdout);
  } catch (error) {
    throw new TypeExtractionError(
      `Failed to parse type extraction output for ${pkg.name}`,
      [],
      result.stdout.slice(0, 500)
    );
  }

  // Check for errors in the schema
  if ('error' in schema) {
    throw new TypeExtractionError(
      `Type extraction failed: ${(schema as any).error}`,
      []
    );
  }

  // Validate type annotation coverage
  const coverage = schema.typeAnnotationCoverage || 0;
  const missing = schema.missingAnnotations || [];

  logger.debug(`Type annotation coverage: ${coverage}%`);
  logger.debug(`Missing annotations: ${missing.length}`);

  if (options.strict && missing.length > 0) {
    throw new TypeExtractionError(
      `Package ${pkg.name} lacks type annotations for ${missing.length} items`,
      missing,
      `Type annotation coverage: ${coverage}%\n\n` +
      `Missing annotations (first 10):\n` +
      missing.slice(0, 10).map(m => `  - ${m}`).join('\n') +
      (missing.length > 10 ? `\n  ... and ${missing.length - 10} more` : '')
    );
  }

  return {
    schema,
    coverage
  };
}

/**
 * Validate that a schema has sufficient type coverage.
 */
export function validateTypeCoverage(
  schema: PipTypeSchema,
  minCoverage: number = 100
): { valid: boolean; message?: string } {
  const coverage = schema.typeAnnotationCoverage || 0;

  if (coverage < minCoverage) {
    return {
      valid: false,
      message: `Type coverage ${coverage}% is below minimum ${minCoverage}%`
    };
  }

  return { valid: true };
}
