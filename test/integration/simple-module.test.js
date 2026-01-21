import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { parseModule } from '../../dist/parser/index.js';
import { generateWIT } from '../../dist/wit/generator.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/umo-integration-test';

describe('Integration: Simple Module Parsing', () => {
  before(async () => {
    // Clean up any existing test directory to ensure fresh state
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should parse a simple Python module', async () => {
    const pythonFile = join(TEST_DIR, 'hello.py');
    const content = `def greet(name: str) -> str:
    return f"Hello, {name}!"

def add(a: int, b: int) -> int:
    return a + b`;

    await writeFile(pythonFile, content);

    const result = await parseModule(pythonFile);

    assert.strictEqual(result.allModules.length, 1);
    assert.strictEqual(result.entryModule.language, 'python');
    assert.strictEqual(result.entryModule.exports.length, 2);
    assert.strictEqual(result.entryModule.exports[0].name, 'greet');
    assert.strictEqual(result.entryModule.exports[1].name, 'add');
  });

  it('should parse a simple TypeScript module', async () => {
    const tsFile = join(TEST_DIR, 'utils.ts');
    const content = `export function reverseString(input: string): string {
  return input.split('').reverse().join('');
}

export function multiply(x: number, y: number): number {
  return x * y;
}`;

    await writeFile(tsFile, content);

    const result = await parseModule(tsFile);

    assert.strictEqual(result.allModules.length, 1);
    assert.strictEqual(result.entryModule.language, 'typescript');
    assert.strictEqual(result.entryModule.exports.length, 2);
    assert.strictEqual(result.entryModule.exports[0].name, 'reverseString');
    assert.strictEqual(result.entryModule.exports[1].name, 'multiply');
  });

  it('should parse modules with imports', async () => {
    const helperFile = join(TEST_DIR, 'helper.ts');
    const helperContent = `export function clean(input: string): string {
  return input.trim();
}`;

    const mainFile = join(TEST_DIR, 'main.py');
    const mainContent = `# umo: import helper.ts

def process(data: str) -> str:
    return data.upper()`;

    await writeFile(helperFile, helperContent);
    await writeFile(mainFile, mainContent);

    const result = await parseModule(mainFile);

    assert.strictEqual(result.allModules.length, 2);
    assert.strictEqual(result.entryModule.imports.length, 1);
    assert.strictEqual(result.entryModule.imports[0].modulePath, 'helper.ts');
  });

  it('should generate WIT from parsed modules', async () => {
    const pythonFile = join(TEST_DIR, 'greet.py');
    const content = `def greet(name: str) -> str:
    return f"Hello, {name}!"`;

    await writeFile(pythonFile, content);

    const parseResult = await parseModule(pythonFile);
    const witFiles = await generateWIT(parseResult.graph);

    assert.strictEqual(witFiles.length, 1);
    assert.ok(witFiles[0].content.includes('package umo:greet'));
    assert.ok(witFiles[0].content.includes('greet: func(name: string) -> string'));
  });
});

describe('Integration: Dependency Resolution', () => {
  before(async () => {
    // Clean up any existing test directory to ensure fresh state
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should detect circular dependencies', async () => {
    const file1 = join(TEST_DIR, 'circular1.py');
    const file2 = join(TEST_DIR, 'circular2.ts');

    await writeFile(file1, `# umo: import circular2.ts

def func1(x: str) -> str:
    return x`);

    await writeFile(file2, `// umo: import circular1.py

export function func2(x: string): string {
  return x;
}`);

    await assert.rejects(
      async () => await parseModule(file1),
      /Circular dependency/
    );
  });

  it('should handle transitive dependencies', async () => {
    const file1 = join(TEST_DIR, 'base.ts');
    const file2 = join(TEST_DIR, 'middle.py');
    const file3 = join(TEST_DIR, 'top.ts');

    await writeFile(file1, `export function base(x: string): string {
  return x;
}`);

    await writeFile(file2, `# umo: import base.ts

def middle(y: str) -> str:
    return y`);

    await writeFile(file3, `// umo: import middle.py

export function top(z: string): string {
  return z;
}`);

    const result = await parseModule(file3);

    assert.strictEqual(result.allModules.length, 3);

    // Check dependency graph
    const topModule = result.entryModule;
    assert.strictEqual(topModule.imports.length, 1);
  });
});
