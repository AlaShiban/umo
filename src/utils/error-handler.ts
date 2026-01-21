import { logger } from './logger.js';

export class WastalkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'WastalkError';
  }
}

export class ParseError extends WastalkError {
  constructor(message: string, details?: string) {
    super(message, 'PARSE_ERROR', details);
    this.name = 'ParseError';
  }
}

export class CompilationError extends WastalkError {
  constructor(message: string, details?: string) {
    super(message, 'COMPILATION_ERROR', details);
    this.name = 'CompilationError';
  }
}

export class LinkError extends WastalkError {
  constructor(message: string, details?: string) {
    super(message, 'LINK_ERROR', details);
    this.name = 'LinkError';
  }
}

export class RuntimeError extends WastalkError {
  constructor(message: string, details?: string) {
    super(message, 'RUNTIME_ERROR', details);
    this.name = 'RuntimeError';
  }
}

export class FileNotFoundError extends WastalkError {
  constructor(filePath: string) {
    super(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND',
      `The file at ${filePath} does not exist. Please check the path and try again.`
    );
    this.name = 'FileNotFoundError';
  }
}

export class CircularDependencyError extends WastalkError {
  constructor(cycle: string[]) {
    super(
      `Circular dependency detected: ${cycle.join(' → ')}`,
      'CIRCULAR_DEPENDENCY',
      'Circular dependencies are not allowed in umo. Please restructure your imports.'
    );
    this.name = 'CircularDependencyError';
  }
}

export class PipInstallError extends WastalkError {
  constructor(
    message: string,
    public readonly packageName: string,
    details?: string
  ) {
    super(message, 'PIP_INSTALL_ERROR', details);
    this.name = 'PipInstallError';
  }
}

export class TypeExtractionError extends WastalkError {
  constructor(
    message: string,
    public readonly missingAnnotations: string[] = [],
    details?: string
  ) {
    super(message, 'TYPE_EXTRACTION_ERROR', details);
    this.name = 'TypeExtractionError';
  }
}

export function handleError(error: unknown): never {
  if (error instanceof WastalkError) {
    logger.error(error.message);
    if (error.details) {
      console.error(`\n${error.details}\n`);
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    logger.error(`Unexpected error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  logger.error('An unknown error occurred');
  console.error(error);
  process.exit(1);
}
