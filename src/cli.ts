#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { logger, setVerbose } from './utils/logger.js';
import { handleError, FileNotFoundError } from './utils/error-handler.js';
import { fileExists, getLanguageFromFile } from './utils/file-utils.js';

// Import pipeline modules
import { parseModule } from './parser/index.js';
import { generateWIT } from './wit/generator.js';
import { compileModules } from './compiler/index.js';
import { linkComponents } from './linker/index.js';
import { runComponent } from './runtime/index.js';

// Import pip modules
import { pipInstall } from './pip/index.js';
import { listCuratedPackages } from './pip/curated-packages.js';

interface CLIOptions {
  verbose?: boolean;
  output?: string;
  cache?: boolean;
}

interface PipInstallOptions {
  verbose?: boolean;
  force?: boolean;
  noValidate?: boolean;
}

async function main() {
  const program = new Command();

  program
    .name('umo')
    .description('Universal Modules - compile packages from any language into WASM modules importable by any other language')
    .version('0.1.0');

  // Default command: run a file
  program
    .argument('[entry]', 'Entry file to execute (Python or TypeScript)')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('-o, --output <dir>', 'Output directory for build artifacts', '.umo')
    .option('--no-cache', 'Disable compilation caching')
    .action(async (entryFile: string | undefined, options: CLIOptions) => {
      if (!entryFile) {
        program.help();
        return;
      }
      try {
        await run(entryFile, options);
      } catch (error) {
        handleError(error);
      }
    });

  // pip-install command
  program
    .command('pip-install <package>')
    .description('Install a Python package for TypeScript import')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('-f, --force', 'Force reinstall even if already installed', false)
    .option('--skip-validation', 'Skip strict type annotation validation (allows partial coverage)')
    .action(async (packageSpec: string, options: any) => {
      if (options.verbose) {
        setVerbose(true);
      }
      try {
        await pipInstall(packageSpec, {
          force: options.force,
          skipValidation: options.skipValidation
        });
      } catch (error) {
        handleError(error);
      }
    });

  // pip-list command
  program
    .command('pip-list')
    .description('List curated Python packages available for installation')
    .action(() => {
      const packages = listCuratedPackages();
      console.log('\nCurated Python packages:\n');
      for (const pkg of packages) {
        console.log(`  ${pkg.name}`);
        console.log(`    ${pkg.description}`);
        if (pkg.minVersion) {
          console.log(`    Minimum version: ${pkg.minVersion}`);
        }
        console.log();
      }
    });

  await program.parseAsync(process.argv);
}

async function run(entryFile: string, options: CLIOptions): Promise<void> {
  // Set verbose mode
  if (options.verbose) {
    setVerbose(true);
  }

  logger.info(`umo v0.1.0`);
  logger.debug(`Entry file: ${entryFile}`);
  logger.debug(`Options: ${JSON.stringify(options)}`);

  // Resolve entry file path
  const entryPath = resolve(process.cwd(), entryFile);
  logger.debug(`Resolved entry path: ${entryPath}`);

  // Check if entry file exists
  if (!(await fileExists(entryPath))) {
    throw new FileNotFoundError(entryPath);
  }

  // Detect language
  const language = getLanguageFromFile(entryPath);
  if (language === 'unknown') {
    throw new Error(
      `Unsupported file type: ${entryPath}. Supported types: .ts, .js, .py`
    );
  }
  logger.debug(`Detected language: ${language}`);

  // Phase 1: Parse and analyze
  logger.startSpinner('Parsing source files...');
  const parseResult = await parseModule(entryPath);
  logger.succeedSpinner(`Parsed ${parseResult.allModules.length} module(s)`);

  // Phase 2: Generate WIT interfaces
  logger.startSpinner('Generating WIT interfaces...');
  const witFiles = await generateWIT(parseResult.graph);
  logger.succeedSpinner(`Generated ${witFiles.length} WIT file(s)`);

  // Phase 3: Compile to WASM components
  logger.startSpinner('Compiling to WASM components...');
  const components = await compileModules(
    parseResult.allModules,
    witFiles,
    options.cache ?? true
  );
  logger.succeedSpinner(`Compiled ${components.length} component(s)`);

  // Phase 4: Link components
  logger.startSpinner('Linking components...');
  const linkedComponent = await linkComponents(components);
  logger.succeedSpinner('Components linked successfully');

  // Phase 5: Execute
  logger.stopSpinner();
  const result = await runComponent(linkedComponent);

  if (result.exitCode === 0) {
    logger.success('Execution complete!');
  } else {
    logger.error(`Execution failed with exit code: ${result.exitCode}`);
    process.exit(result.exitCode);
  }

  // Note: This MVP requires external tools (wasmtime, wasm-tools, componentize-py)
  logger.info('Note: Full component linking requires additional WASM tooling');
}

// Run the CLI
main().catch(handleError);
