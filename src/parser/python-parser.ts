import { FunctionSignature, Import, Parameter, WITType } from './types.js';
import { ParseError } from '../utils/error-handler.js';
import { resolveModulePath } from '../utils/file-utils.js';

const UMO_IMPORT_REGEX = /^#\s*umo:\s*import\s+(.+)\s*$/;
const FUNCTION_DEF_REGEX =
  /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*->\s*([^:]+):/;

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
  const functions: FunctionSignature[] = [];
  const lines = sourceCode.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip private functions (starting with _)
    if (line.startsWith('def _')) {
      continue;
    }

    // Match function definitions with type hints
    const match = line.match(FUNCTION_DEF_REGEX);
    if (match) {
      try {
        const [, name, paramsStr, returnTypeStr] = match;
        const signature = parseFunctionSignature(
          name,
          paramsStr,
          returnTypeStr,
          filePath
        );
        functions.push(signature);
      } catch (error) {
        if (error instanceof Error) {
          throw new ParseError(
            `Failed to parse function at line ${i + 1} in ${filePath}: ${error.message}`
          );
        }
        throw error;
      }
    }
  }

  return functions;
}

function parseFunctionSignature(
  name: string,
  paramsStr: string,
  returnTypeStr: string,
  filePath: string
): FunctionSignature {
  const params: Parameter[] = [];

  // Parse parameters
  if (paramsStr.trim()) {
    const paramsList = paramsStr.split(',').map((p) => p.trim());

    for (const paramStr of paramsList) {
      // Skip 'self' parameter
      if (paramStr === 'self') {
        continue;
      }

      // Parse parameter: name: type
      const colonIndex = paramStr.indexOf(':');
      if (colonIndex === -1) {
        throw new ParseError(
          `Parameter in function ${name} must have a type annotation: ${paramStr}`
        );
      }

      const paramName = paramStr.substring(0, colonIndex).trim();
      const paramType = paramStr.substring(colonIndex + 1).trim();

      params.push({
        name: paramName,
        type: mapPythonTypeToWIT(paramType),
      });
    }
  }

  // Parse return type
  const returnType = mapPythonTypeToWIT(returnTypeStr.trim());

  return {
    name,
    params,
    returnType,
  };
}

function mapPythonTypeToWIT(pythonType: string): WITType {
  switch (pythonType) {
    case 'str':
      return 'string';
    case 'int':
      return 's32';
    case 'float':
      return 'f64';
    case 'bool':
      return 'bool';
    default:
      throw new ParseError(
        `Unsupported Python type: ${pythonType}. Only str, int, float, and bool are supported in MVP.`
      );
  }
}

export function convertFunctionNameToSnake(name: string): string {
  // Ensure function name is in snake_case for Python
  return name.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Python standard library modules (subset of most common ones)
const PYTHON_STDLIB = new Set([
  'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 'asyncore',
  'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex', 'bisect',
  'builtins', 'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd',
  'code', 'codecs', 'codeop', 'collections', 'colorsys', 'compileall',
  'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg',
  'cProfile', 'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime',
  'dbm', 'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'email',
  'encodings', 'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput',
  'fnmatch', 'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass',
  'gettext', 'glob', 'graphlib', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac',
  'html', 'http', 'idlelib', 'imaplib', 'imghdr', 'imp', 'importlib', 'inspect',
  'io', 'ipaddress', 'itertools', 'json', 'keyword', 'lib2to3', 'linecache',
  'locale', 'logging', 'lzma', 'mailbox', 'mailcap', 'marshal', 'math',
  'mimetypes', 'mmap', 'modulefinder', 'multiprocessing', 'netrc', 'nis',
  'nntplib', 'numbers', 'operator', 'optparse', 'os', 'ossaudiodev', 'pathlib',
  'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib',
  'poplib', 'posix', 'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd',
  'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're',
  'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched', 'secrets',
  'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal', 'site',
  'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver', 'spwd', 'sqlite3',
  'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct', 'subprocess',
  'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny', 'tarfile',
  'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading', 'time',
  'timeit', 'tkinter', 'token', 'tokenize', 'trace', 'traceback', 'tracemalloc',
  'tty', 'turtle', 'turtledemo', 'types', 'typing', 'unicodedata', 'unittest',
  'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref', 'webbrowser',
  'winreg', 'winsound', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp',
  'zipfile', 'zipimport', 'zlib', '_thread'
]);

/**
 * Extract third-party package imports from Python source code.
 * Returns a list of package names that need to be pip installed.
 */
export function extractPythonPackages(sourceCode: string): string[] {
  const packages = new Set<string>();
  const lines = sourceCode.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: import package or import package.submodule
    const importMatch = trimmed.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (importMatch) {
      const pkg = importMatch[1];
      if (!PYTHON_STDLIB.has(pkg)) {
        packages.add(pkg);
      }
      continue;
    }

    // Match: from package import ... or from package.submodule import ...
    const fromMatch = trimmed.match(/^from\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (fromMatch) {
      const pkg = fromMatch[1];
      if (!PYTHON_STDLIB.has(pkg)) {
        packages.add(pkg);
      }
    }
  }

  return Array.from(packages);
}
