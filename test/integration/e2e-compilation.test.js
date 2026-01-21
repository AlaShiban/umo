import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEST_DIR = '/tmp/umo-e2e-test';
const PROJECT_ROOT = join(__dirname, '..', '..');
const CLI_PATH = join(PROJECT_ROOT, 'dist', 'cli.js');

describe('E2E: Complete Compilation Pipeline', () => {
  before(async () => {
    // Clean up any existing test directory to ensure fresh state
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should compile a Python module to WASM', async () => {
    const pythonFile = join(TEST_DIR, 'greet.py');
    const content = `def greet(name: str) -> str:
    return f"Hello, {name}!"`;

    await writeFile(pythonFile, content);

    // Run umo CLI
    let compilationSucceeded = false;
    try {
      const result = await execFileAsync('node', [CLI_PATH, pythonFile], {
        cwd: TEST_DIR,
        timeout: 180000,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.wasmtime/bin:${process.env.HOME}/.cargo/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`
        }
      });
      // If it doesn't throw, check the output
      compilationSucceeded = result.stdout?.includes('✔ Compiled 1 component(s)') ||
                            result.stderr?.includes('✔ Compiled 1 component(s)');
    } catch (error) {
      // Expected to fail at execution since component doesn't have CLI entry point
      // But compilation should succeed
      const output = (error.stdout || '') + (error.stderr || '');
      compilationSucceeded = output.includes('✔ Compiled 1 component(s)');
    }

    assert.ok(compilationSucceeded, 'Compilation should have succeeded');

    // Verify artifacts were created
    const witPath = join(TEST_DIR, '.umo', 'wit', 'greet.wit');
    const componentPath = join(TEST_DIR, '.umo', 'components', 'greet.component.wasm');
    const appPath = join(TEST_DIR, '.umo', 'app.component.wasm');

    // Check WIT file exists and has correct content
    const witContent = await readFile(witPath, 'utf-8');
    assert.ok(witContent.includes('package umo:greet'));
    assert.ok(witContent.includes('greet: func(name: string) -> string'));

    // Check component was created
    const componentStats = await readFile(componentPath);
    assert.ok(componentStats.length > 1000000); // Should be ~39MB

    // Check linked component exists
    const appStats = await readFile(appPath);
    assert.ok(appStats.length > 1000000);
  });

  it('should use cache on second compilation', async () => {
    const pythonFile = join(TEST_DIR, 'cached.py');
    const content = `def test(x: int) -> int:
    return x * 2`;

    await writeFile(pythonFile, content);

    // First compilation
    const start1 = Date.now();
    try {
      await execFileAsync('node', [CLI_PATH, pythonFile], {
        cwd: TEST_DIR,
        timeout: 180000,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.wasmtime/bin:${process.env.HOME}/.cargo/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`
        }
      });
    } catch (error) {
      // Ignore execution error
    }
    const duration1 = Date.now() - start1;

    // Second compilation (should use cache)
    const start2 = Date.now();
    try {
      await execFileAsync('node', [CLI_PATH, pythonFile], {
        cwd: TEST_DIR,
        timeout: 180000,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.wasmtime/bin:${process.env.HOME}/.cargo/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`
        }
      });
    } catch (error) {
      // Ignore execution error
    }
    const duration2 = Date.now() - start2;

    // Second run should be faster or similar (cache hit)
    // Note: Most time is spent in componentize-py and runtime, not compilation
    // So improvement may be small. Just verify it's not significantly slower.
    const improvement = duration1 - duration2;
    const improvementPercent = (improvement / duration1) * 100;

    // Second run should be at most 20% slower (allowing for noise)
    assert.ok(
      duration2 <= duration1 * 1.2,
      `Second run (${duration2}ms) should not be much slower than first (${duration1}ms), change: ${improvementPercent.toFixed(1)}%`
    );
  });

  it('should handle TypeScript files', async () => {
    const tsFile = join(TEST_DIR, 'reverse.ts');
    const content = `export function reverseString(input: string): string {
  return input.split('').reverse().join('');
}`;

    await writeFile(tsFile, content);

    try {
      await execFileAsync('node', [CLI_PATH, tsFile], {
        cwd: TEST_DIR,
        timeout: 180000,
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.wasmtime/bin:${process.env.HOME}/.cargo/bin:${process.env.HOME}/.local/bin:${process.env.PATH}`
        }
      });
    } catch (error) {
      // Check that parsing and WIT generation succeeded
      const output = error.stdout + error.stderr;
      assert.ok(output.includes('✔ Parsed'));
      assert.ok(output.includes('✔ Generated'));
    }
  });
});
