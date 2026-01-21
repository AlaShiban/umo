/**
 * Package resolution and installation for pip modules.
 * Uses uv for fast, reliable Python package installation.
 */

import { join } from 'path';
import { execa } from 'execa';
import { getBuildDirectory, ensureDirectory } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { PipInstallError } from '../utils/error-handler.js';
import {
  isCuratedPackage,
  getCuratedPackageInfo,
  validatePackageVersion,
  CuratedPackageInfo
} from './curated-packages.js';

export interface ParsedPackageSpec {
  name: string;
  version?: string;
  fullSpec: string;
}

export interface ResolvedPackage {
  name: string;
  importName: string; // Python import name (may differ from pip name)
  version: string;
  installPath: string;
  sitePackagesPath: string;
  curatedInfo: CuratedPackageInfo;
}

/**
 * Parse a package specification like "pydash" or "pydash@7.0.0" or "pydash==7.0.0"
 */
export function parsePackageSpec(spec: string): ParsedPackageSpec {
  // Handle formats: pydash, pydash@7.0.0, pydash==7.0.0, pydash>=7.0.0
  const atMatch = spec.match(/^([a-zA-Z0-9_-]+)@(.+)$/);
  if (atMatch) {
    return {
      name: atMatch[1],
      version: atMatch[2],
      fullSpec: `${atMatch[1]}==${atMatch[2]}`
    };
  }

  const pipMatch = spec.match(/^([a-zA-Z0-9_-]+)(==|>=|<=|~=|!=)(.+)$/);
  if (pipMatch) {
    return {
      name: pipMatch[1],
      version: pipMatch[3],
      fullSpec: spec
    };
  }

  // Just package name, no version
  return {
    name: spec,
    version: undefined,
    fullSpec: spec
  };
}

/**
 * Get the virtual environment directory for pip modules
 */
export function getPipVenvDirectory(): string {
  return join(getBuildDirectory(), 'pip-venv');
}

/**
 * Get the site-packages directory inside the venv
 */
async function getSitePackagesPath(venvPath: string): Promise<string> {
  const venvPython = join(venvPath, 'bin', 'python');
  const result = await execa(venvPython, [
    '-c',
    'import site; print(site.getsitepackages()[0])'
  ], { stdio: 'pipe' });
  return result.stdout.trim();
}

/**
 * Create or get the pip virtual environment
 */
async function getOrCreatePipVenv(): Promise<{ venvPath: string; sitePackages: string }> {
  const venvPath = getPipVenvDirectory();
  await ensureDirectory(venvPath);

  const venvPython = join(venvPath, 'bin', 'python');

  // Check if venv already exists
  try {
    await execa(venvPython, ['--version'], { stdio: 'pipe' });
    logger.debug(`Using existing pip venv at: ${venvPath}`);
  } catch {
    // Create new venv using uv (fast) or python3 -m venv
    logger.debug(`Creating pip virtual environment at: ${venvPath}`);
    try {
      await execa('uv', ['venv', venvPath], { stdio: 'pipe' });
    } catch {
      await execa('python3', ['-m', 'venv', venvPath], { stdio: 'pipe' });
    }
  }

  const sitePackages = await getSitePackagesPath(venvPath);
  return { venvPath, sitePackages };
}

/**
 * Well-known packages where pip name differs from import name
 * These are common packages that don't follow the hyphen-to-underscore convention
 */
const KNOWN_IMPORT_NAMES: Record<string, string> = {
  // Data formats & parsing
  'beautifulsoup4': 'bs4',
  'pyyaml': 'yaml',
  'pillow': 'PIL',
  'opencv-python': 'cv2',
  'scikit-learn': 'sklearn',
  'scikit-image': 'skimage',

  // Date/time
  'python-dateutil': 'dateutil',
  'pytz': 'pytz',

  // Web & networking
  'flask-restful': 'flask_restful',
  'python-dotenv': 'dotenv',

  // Utilities
  'typing-extensions': 'typing_extensions',
  'importlib-metadata': 'importlib_metadata',
  'importlib-resources': 'importlib_resources',
  'zipp': 'zipp',
};

/**
 * Get the Python import name for a package
 * Some packages have different pip names and import names (e.g., python-dotenv -> dotenv)
 */
function getImportName(packageName: string): string {
  const curatedInfo = getCuratedPackageInfo(packageName);
  if (curatedInfo?.importName) {
    return curatedInfo.importName;
  }

  // Check well-known import names
  const knownName = KNOWN_IMPORT_NAMES[packageName.toLowerCase()];
  if (knownName) {
    return knownName;
  }

  // Default: convert hyphens to underscores (common Python convention)
  return packageName.replace(/-/g, '_');
}

/**
 * Install a package using uv (with pip fallback)
 */
async function installWithUv(
  packageSpec: string,
  venvPath: string
): Promise<{ version: string }> {
  const venvPython = join(venvPath, 'bin', 'python');

  logger.debug(`Installing ${packageSpec} with uv...`);

  try {
    // Use uv pip install
    await execa('uv', [
      'pip',
      'install',
      '--python', venvPython,
      packageSpec
    ], { stdio: 'pipe' });
  } catch (uvError) {
    logger.debug(`uv install failed, trying pip: ${uvError instanceof Error ? uvError.message : 'unknown'}`);

    // Fallback to pip
    const venvPip = join(venvPath, 'bin', 'pip');
    try {
      await execa(venvPip, [
        'install',
        '--disable-pip-version-check',
        packageSpec
      ], { stdio: 'pipe' });
    } catch (pipError) {
      throw new PipInstallError(
        `Failed to install ${packageSpec}`,
        packageSpec,
        pipError instanceof Error ? pipError.message : 'Unknown error'
      );
    }
  }

  // Get installed version - try multiple methods
  const parsed = parsePackageSpec(packageSpec);
  const importName = getImportName(parsed.name);

  // First try __version__ attribute, then importlib.metadata
  const versionResult = await execa(venvPython, [
    '-c',
    `import ${importName}
version = getattr(${importName}, '__version__', None)
if version is None:
    try:
        from importlib.metadata import version as get_version
        version = get_version('${parsed.name}')
    except:
        version = 'unknown'
print(version)`
  ], { stdio: 'pipe' });

  return { version: versionResult.stdout.trim() };
}

/**
 * Resolve and install a Python package for use with umo.
 *
 * @param packageSpec - Package specification (e.g., "pydash" or "pydash@7.0.0")
 * @param options - Installation options
 * @returns Resolved package information
 */
export async function resolveAndInstallPackage(
  packageSpec: string,
  options: { force?: boolean; skipValidation?: boolean } = {}
): Promise<ResolvedPackage> {
  const parsed = parsePackageSpec(packageSpec);

  // Check if package is curated (unless validation is skipped)
  if (!options.skipValidation && !isCuratedPackage(parsed.name)) {
    throw new PipInstallError(
      `Package '${parsed.name}' is not in the curated packages list`,
      parsed.name,
      `Only curated packages are supported. Use --no-validate to bypass (not recommended).\n` +
      `Curated packages: pydash`
    );
  }

  const curatedInfo = getCuratedPackageInfo(parsed.name);
  if (!curatedInfo && !options.skipValidation) {
    throw new PipInstallError(
      `Package '${parsed.name}' is not curated`,
      parsed.name
    );
  }

  // Get or create venv
  const { venvPath, sitePackages } = await getOrCreatePipVenv();

  // Install the package
  const { version } = await installWithUv(parsed.fullSpec, venvPath);

  // Validate version if specified and curated
  if (curatedInfo && !options.skipValidation) {
    const versionCheck = validatePackageVersion(parsed.name, version);
    if (!versionCheck.valid) {
      throw new PipInstallError(
        versionCheck.message || 'Version validation failed',
        parsed.name
      );
    }
  }

  // Get the import name (may differ from pip name)
  const importName = getImportName(parsed.name);

  // Get the package install path (uses import name, not pip name)
  const installPath = join(sitePackages, importName);

  logger.debug(`Installed ${parsed.name}@${version} (import as ${importName}) at ${installPath}`);

  return {
    name: parsed.name,
    importName,
    version,
    installPath,
    sitePackagesPath: sitePackages,
    curatedInfo: curatedInfo || {
      name: parsed.name,
      description: 'Unknown package',
      hasCExtensions: false
    }
  };
}

/**
 * Export getImportName for use by other modules
 */
export { getImportName };
