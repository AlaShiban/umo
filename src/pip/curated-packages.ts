/**
 * Curated list of Python packages known to work with umo pip-install.
 *
 * Packages in this list have been tested for:
 * - Type annotation coverage
 * - WASM compilation compatibility
 * - No unsupported C extensions
 */

export interface CuratedPackageInfo {
  name: string;
  importName?: string; // Python import name if different from pip name (e.g., 'dotenv' for 'python-dotenv')
  description: string;
  minVersion?: string;
  maxVersion?: string;
  hasCExtensions: boolean;
  exportedModules?: string[]; // Specific modules to export (if not entire package)
  notes?: string;
  runtime?: 'componentize-py' | 'pyodide'; // Compilation runtime (default: componentize-py)
  pyodidePackage?: string; // Pyodide package name if different from pip name
}

/**
 * Whitelist of curated packages.
 * Add packages here after testing them.
 */
export const CURATED_PACKAGES: Map<string, CuratedPackageInfo> = new Map([
  ['pydash', {
    name: 'pydash',
    description: 'The kitchen sink of Python utility libraries for doing "stuff" in a functional way.',
    minVersion: '7.0.0',
    hasCExtensions: false,
    exportedModules: ['pydash', 'pydash.strings', 'pydash.arrays', 'pydash.collections'],
    notes: 'Pure Python, excellent type annotations'
  }],
  ['python-dotenv', {
    name: 'python-dotenv',
    importName: 'dotenv', // pip name is 'python-dotenv' but import is 'dotenv'
    description: 'Read key-value pairs from .env files and set them as environment variables.',
    minVersion: '1.0.0',
    hasCExtensions: false,
    exportedModules: ['dotenv'],
    notes: 'Pure Python, useful for configuration management'
  }],
  ['redblacktree', {
    name: 'redblacktree',
    description: 'Pure Python red-black tree implementation, can be used as set or dictionary.',
    minVersion: '1.0.0',
    hasCExtensions: false,
    exportedModules: ['redblacktree'],
    notes: 'Pure Python, useful for testing stateful object persistence in WASM'
  }],
  ['humanize', {
    name: 'humanize',
    description: 'Python humanize utilities - convert values into human-readable strings.',
    minVersion: '4.0.0',
    hasCExtensions: false,
    exportedModules: ['humanize', 'humanize.time', 'humanize.number', 'humanize.filesize', 'humanize.i18n', 'humanize.lists'],
    notes: 'Pure Python, useful for formatting numbers, dates, file sizes etc.'
  }],
  // Pyodide-runtime packages (require native extensions)
  ['networkx', {
    name: 'networkx',
    description: 'Graph and network analysis library with algorithms for complex networks.',
    minVersion: '3.0',
    hasCExtensions: true,
    runtime: 'pyodide',
    exportedModules: ['networkx'],
    notes: 'Requires _bz2 C extension, uses Pyodide runtime instead of componentize-py'
  }],
  ['numpy', {
    name: 'numpy',
    description: 'Fundamental package for scientific computing with Python.',
    minVersion: '1.24.0',
    hasCExtensions: true,
    runtime: 'pyodide',
    exportedModules: ['numpy'],
    notes: 'Core is C/Fortran, uses Pyodide runtime'
  }],
  ['pandas', {
    name: 'pandas',
    description: 'Data analysis and manipulation library with DataFrame support.',
    minVersion: '2.0.0',
    hasCExtensions: true,
    runtime: 'pyodide',
    exportedModules: ['pandas'],
    notes: 'Has C extensions, uses Pyodide runtime'
  }],
  ['scipy', {
    name: 'scipy',
    description: 'Scientific computing library for optimization, integration, and statistics.',
    minVersion: '1.10.0',
    hasCExtensions: true,
    runtime: 'pyodide',
    exportedModules: ['scipy'],
    notes: 'Heavy C/Fortran code, uses Pyodide runtime'
  }],
  // Add more packages as they are tested
]);

/**
 * Check if a package is in the curated list
 */
export function isCuratedPackage(packageName: string): boolean {
  return CURATED_PACKAGES.has(packageName.toLowerCase());
}

/**
 * Get info about a curated package
 */
export function getCuratedPackageInfo(packageName: string): CuratedPackageInfo | undefined {
  return CURATED_PACKAGES.get(packageName.toLowerCase());
}

/**
 * Validate package version against curated package constraints
 */
export function validatePackageVersion(
  packageName: string,
  version: string
): { valid: boolean; message?: string } {
  const info = getCuratedPackageInfo(packageName);

  if (!info) {
    return {
      valid: false,
      message: `Package '${packageName}' is not in the curated packages list. ` +
        `Only curated packages are supported to ensure type safety and WASM compatibility.`
    };
  }

  // Simple semver comparison (just major.minor.patch)
  const parseVersion = (v: string) => {
    const parts = v.replace(/^[v=^~]/, '').split('.');
    return {
      major: parseInt(parts[0] || '0', 10),
      minor: parseInt(parts[1] || '0', 10),
      patch: parseInt(parts[2] || '0', 10)
    };
  };

  const current = parseVersion(version);

  if (info.minVersion) {
    const min = parseVersion(info.minVersion);
    if (
      current.major < min.major ||
      (current.major === min.major && current.minor < min.minor) ||
      (current.major === min.major && current.minor === min.minor && current.patch < min.patch)
    ) {
      return {
        valid: false,
        message: `Package '${packageName}@${version}' is below minimum supported version ${info.minVersion}`
      };
    }
  }

  if (info.maxVersion) {
    const max = parseVersion(info.maxVersion);
    if (
      current.major > max.major ||
      (current.major === max.major && current.minor > max.minor) ||
      (current.major === max.major && current.minor === max.minor && current.patch > max.patch)
    ) {
      return {
        valid: false,
        message: `Package '${packageName}@${version}' is above maximum supported version ${info.maxVersion}`
      };
    }
  }

  return { valid: true };
}

/**
 * List all curated packages (for help output)
 */
export function listCuratedPackages(): CuratedPackageInfo[] {
  return Array.from(CURATED_PACKAGES.values());
}
