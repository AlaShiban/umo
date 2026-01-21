import { execa } from 'execa';
import { join } from 'path';
import { existsSync } from 'fs';
import { createDefaultWASIConfig, buildWasmtimeArgs, WASIConfig } from './wasi-config.js';
import { RuntimeError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export interface ExecutionResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

async function findWasmtime(): Promise<string> {
  // Try wasmtime in PATH first
  try {
    await execa('wasmtime', ['--version'], { stdio: 'pipe' });
    return 'wasmtime';
  } catch (error) {
    // Not in PATH
  }

  // Check common installation locations
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const possiblePaths = [
    join(homeDir, '.wasmtime', 'bin', 'wasmtime'),
    join(homeDir, '.local', 'bin', 'wasmtime'),
    '/usr/local/bin/wasmtime',
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      try {
        await execa(path, ['--version'], { stdio: 'pipe' });
        return path;
      } catch (error) {
        // Try next path
      }
    }
  }

  throw new RuntimeError(
    'wasmtime is not installed or not available in PATH',
    'Please install wasmtime before using umo. Run: curl https://wasmtime.dev/install.sh -sSf | bash'
  );
}

export async function executeComponent(
  componentPath: string,
  config: WASIConfig = createDefaultWASIConfig()
): Promise<ExecutionResult> {
  logger.debug(`Executing component: ${componentPath}`);

  const wasmtimePath = await findWasmtime();

  const wasmtimeArgs = buildWasmtimeArgs(config);

  try {
    const result = await execa(
      wasmtimePath,
      [...wasmtimeArgs, componentPath, ...config.args],
      {
        stdio: [
          config.stdin || 'inherit',
          config.stdout || 'inherit',
          config.stderr || 'inherit',
        ],
        reject: false,
      }
    );

    return {
      exitCode: result.exitCode || 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new RuntimeError(
        `Failed to execute component: ${error.message}`,
        error.message
      );
    }
    throw error;
  }
}
