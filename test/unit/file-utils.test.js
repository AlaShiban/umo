import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fileUtils from '../../dist/utils/file-utils.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

const TEST_DIR = '/tmp/umo-test';

describe('File Utils', () => {
  it('should detect TypeScript files', () => {
    assert.strictEqual(fileUtils.isTypeScriptFile('test.ts'), true);
    assert.strictEqual(fileUtils.isTypeScriptFile('test.tsx'), true);
    assert.strictEqual(fileUtils.isTypeScriptFile('test.js'), true);
    assert.strictEqual(fileUtils.isTypeScriptFile('test.jsx'), true);
    assert.strictEqual(fileUtils.isTypeScriptFile('test.py'), false);
  });

  it('should detect Python files', () => {
    assert.strictEqual(fileUtils.isPythonFile('test.py'), true);
    assert.strictEqual(fileUtils.isPythonFile('test.ts'), false);
  });

  it('should get correct language from file', () => {
    assert.strictEqual(fileUtils.getLanguageFromFile('test.ts'), 'typescript');
    assert.strictEqual(fileUtils.getLanguageFromFile('test.py'), 'python');
    assert.strictEqual(fileUtils.getLanguageFromFile('test.txt'), 'unknown');
  });

  it('should resolve module paths correctly', () => {
    const currentFile = '/project/src/main.ts';
    const importPath = '../utils/helper.ts';

    const resolved = fileUtils.resolveModulePath(importPath, currentFile);

    assert.ok(resolved.includes('utils/helper.ts'));
  });

  it('should get correct file extension', () => {
    assert.strictEqual(fileUtils.getFileExtension('test.ts'), '.ts');
    assert.strictEqual(fileUtils.getFileExtension('test.py'), '.py');
    assert.strictEqual(fileUtils.getFileExtension('test.component.wasm'), '.wasm');
  });

  it('should create and read files', async () => {
    await mkdir(TEST_DIR, { recursive: true });

    const testFile = join(TEST_DIR, 'test.txt');
    const content = 'Hello, umo!';

    await fileUtils.writeFileContent(testFile, content);
    const readContent = await fileUtils.readFileContent(testFile);

    assert.strictEqual(readContent, content);

    // Cleanup
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should detect file existence', async () => {
    await mkdir(TEST_DIR, { recursive: true });
    const testFile = join(TEST_DIR, 'exists.txt');

    await writeFile(testFile, 'test');

    assert.strictEqual(await fileUtils.fileExists(testFile), true);
    assert.strictEqual(await fileUtils.fileExists(join(TEST_DIR, 'not-exists.txt')), false);

    // Cleanup
    await rm(TEST_DIR, { recursive: true, force: true });
  });
});
