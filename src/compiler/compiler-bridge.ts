import { execa } from 'execa';
import { CompilationError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export interface CompilerResult {
  componentPath: string;
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors?: string[];
}

export async function executeCompiler(
  command: string,
  args: string[],
  description: string,
  cwd?: string
): Promise<CompilerResult> {
  try {
    logger.debug(`Executing: ${command} ${args.join(' ')}`);
    if (cwd) {
      logger.debug(`Working directory: ${cwd}`);
    }

    const result = await execa(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      reject: false,
      cwd,
    });

    if (result.exitCode !== 0) {
      logger.debug(`Compiler failed with exit code ${result.exitCode}`);
      logger.debug(`stdout: ${result.stdout}`);
      logger.debug(`stderr: ${result.stderr}`);

      return {
        componentPath: '',
        success: false,
        stdout: result.stdout,
        stderr: result.stderr,
        errors: [result.stderr || result.stdout || 'Unknown compilation error'],
      };
    }

    return {
      componentPath: '', // Will be set by caller
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new CompilationError(
        `Failed to execute ${description}: ${error.message}`,
        error.message
      );
    }
    throw error;
  }
}

export async function checkToolAvailable(
  command: string,
  toolName: string
): Promise<void> {
  try {
    await execa(command, ['--version'], { stdio: 'pipe' });
  } catch (error) {
    throw new CompilationError(
      `${toolName} is not installed or not available in PATH`,
      `Please install ${toolName} before using umo. Check the documentation for installation instructions.`
    );
  }
}
