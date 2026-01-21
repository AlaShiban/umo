import { LinkedComponent } from '../linker/index.js';
import { executeComponent, ExecutionResult } from './wasmtime-bridge.js';
import { createDefaultWASIConfig } from './wasi-config.js';
import { logger } from '../utils/logger.js';

export async function runComponent(
  linked: LinkedComponent,
  entryFunction: string = 'main'
): Promise<ExecutionResult> {
  logger.debug('Starting execution...');

  const config = createDefaultWASIConfig();
  // Invoke the entry function using WAVE syntax
  config.invoke = `${entryFunction}()`;

  const result = await executeComponent(linked.componentPath, config);

  if (result.exitCode !== 0) {
    logger.error(`Execution failed with exit code: ${result.exitCode}`);
  }

  return result;
}
