import { execa } from 'execa';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { LinkError } from '../utils/error-handler.js';

async function findWac(): Promise<string> {
  // Try wac in PATH first
  try {
    await execa('wac', ['--version'], { stdio: 'pipe' });
    return 'wac';
  } catch (error) {
    // Not in PATH
  }

  // Check common installation locations
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const possiblePaths = [
    join(homeDir, '.cargo', 'bin', 'wac'),
    join(homeDir, '.local', 'bin', 'wac'),
    '/usr/local/bin/wac',
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

  throw new LinkError(
    'wac is not installed or not available in PATH',
    'Please install wac before using umo. Run: cargo install wac-cli'
  );
}

export async function composeComponents(
  componentPaths: string[],
  outputPath: string
): Promise<void> {
  logger.debug(`Composing ${componentPaths.length} components`);
  logger.debug(`Output: ${outputPath}`);

  // For MVP with single component, just copy it to output
  if (componentPaths.length === 1) {
    logger.debug(`Single component - copying to output: ${componentPaths[0]}`);
    const { readFile, writeFile } = await import('fs/promises');
    const content = await readFile(componentPaths[0]);
    await writeFile(outputPath, content);
    return;
  }

  // For multiple components, find wac
  const wacPath = await findWac();

  // Compose components using wac plug
  // The strategy: plug dependencies (exports) into the socket (imports)
  // wac plug --plug <dependency> <socket> -o <output>

  if (componentPaths.length === 2) {
    // Simple case: one dependency and one main component
    // The component with imports is the socket, components with exports are plugs
    // The array order depends on compilation order (entry point first, then dependencies)
    // So componentPaths[0] is socket/main (imports), componentPaths[1] is plug/dependency (exports)
    const socketComponent = componentPaths[0];      // socket (main with imports)
    const plugComponent = componentPaths[1];        // plug (dependency with exports)

    logger.debug(`Composing: plugging ${plugComponent} into ${socketComponent}`);

    try {
      await execa(
        wacPath,
        [
          'plug',
          '--plug',
          plugComponent,     // dependency component with exports
          socketComponent,   // main component with imports (socket)
          '-o',
          outputPath,
        ],
        { stdio: 'inherit' }
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new LinkError(
          'Failed to compose components',
          error.message
        );
      }
      throw error;
    }
  } else {
    // For more complex cases, need topological sort and iterative composition
    logger.warn(`Multi-component linking with ${componentPaths.length} components not fully implemented`);
    throw new LinkError(
      'Complex multi-component linking not yet supported',
      `Linking ${componentPaths.length} components requires iterative composition`
    );
  }
}
