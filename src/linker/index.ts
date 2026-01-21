import { join } from 'path';
import { CompiledComponent } from '../compiler/index.js';
import { getBuildDirectory, ensureDirectory } from '../utils/file-utils.js';
import { logger } from '../utils/logger.js';
import { composeComponents } from './composer.js';

export interface LinkedComponent {
  componentPath: string;
}

export async function linkComponents(
  components: CompiledComponent[]
): Promise<LinkedComponent> {
  logger.debug(`Linking ${components.length} component(s)`);

  const buildDir = getBuildDirectory();
  await ensureDirectory(buildDir);

  const outputPath = join(buildDir, 'app.component.wasm');

  // Extract component paths
  const componentPaths = components.map((c) => c.componentPath);

  // Compose components using wasm-tools
  await composeComponents(componentPaths, outputPath);

  return {
    componentPath: outputPath,
  };
}
