/**
 * Test fixture for umo_modules feature
 * Validates that Python packages can be imported and used from Node.js
 *
 * Run with: node --test tests/pip-modules.test.mjs
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// Import pydash functions from umo_modules
import {
  words,
  camelCase,
  snakeCase,
  kebabCase,
  capitalize,
  trim,
  split,
  chars,
  clean,
  decapitalize,
  hasSubstr,
  endsWith,
  ensureStartsWith,
  ensureEndsWith,
  padStart,
  padEnd,
  init,
  isInitialized
} from '../umo_modules/pydash/index.js';

describe('umo_modules/pydash', () => {

  describe('Module initialization', () => {
    it('should report as initialized', () => {
      assert.strictEqual(isInitialized(), true);
    });

    it('init() should complete without error', async () => {
      await init();
      assert.strictEqual(isInitialized(), true);
    });
  });

  describe('String case conversion', () => {
    it('words() should split string into words', () => {
      const result = words('hello_world-foo bar', null);
      assert.deepStrictEqual(result, ['hello', 'world', 'foo', 'bar']);
    });

    it('words() should handle camelCase input', () => {
      const result = words('helloWorld', null);
      assert.deepStrictEqual(result, ['hello', 'World']);
    });

    it('camelCase() should convert to camelCase', () => {
      assert.strictEqual(camelCase('hello_world'), 'helloWorld');
      assert.strictEqual(camelCase('hello-world'), 'helloWorld');
      assert.strictEqual(camelCase('Hello World'), 'helloWorld');
    });

    it('snakeCase() should convert to snake_case', () => {
      assert.strictEqual(snakeCase('helloWorld'), 'hello_world');
      assert.strictEqual(snakeCase('HelloWorld'), 'hello_world');
      assert.strictEqual(snakeCase('hello-world'), 'hello_world');
    });

    it('kebabCase() should convert to kebab-case', () => {
      assert.strictEqual(kebabCase('helloWorld'), 'hello-world');
      assert.strictEqual(kebabCase('hello_world'), 'hello-world');
    });

    it('capitalize() should capitalize first letter', () => {
      assert.strictEqual(capitalize('hello', false), 'Hello');
      assert.strictEqual(capitalize('HELLO', true), 'Hello');
    });

    it('decapitalize() should lowercase first letter', () => {
      assert.strictEqual(decapitalize('Hello'), 'hello');
      assert.strictEqual(decapitalize('HELLO'), 'hELLO');
    });
  });

  describe('String manipulation', () => {
    it('trim() should remove whitespace', () => {
      assert.strictEqual(trim('  hello  ', null), 'hello');
      assert.strictEqual(trim('xxhelloxx', 'x'), 'hello');
    });

    it('split() should split string by separator', () => {
      const result = split('a,b,c', ',');
      assert.deepStrictEqual(result, ['a', 'b', 'c']);
    });

    it('chars() should split into characters', () => {
      const result = chars('hello');
      assert.deepStrictEqual(result, ['h', 'e', 'l', 'l', 'o']);
    });

    it('clean() should remove extra whitespace', () => {
      assert.strictEqual(clean('  hello   world  '), 'hello world');
    });

    it('padStart() should pad string at start', () => {
      assert.strictEqual(padStart('hello', 10, '*'), '*****hello');
    });

    it('padEnd() should pad string at end', () => {
      assert.strictEqual(padEnd('hello', 10, '*'), 'hello*****');
    });

    it('ensureStartsWith() should add prefix if missing', () => {
      assert.strictEqual(ensureStartsWith('world', 'hello '), 'hello world');
      assert.strictEqual(ensureStartsWith('hello world', 'hello '), 'hello world');
    });

    it('ensureEndsWith() should add suffix if missing', () => {
      assert.strictEqual(ensureEndsWith('hello', ' world'), 'hello world');
      assert.strictEqual(ensureEndsWith('hello world', ' world'), 'hello world');
    });
  });

  describe('String predicates', () => {
    it('hasSubstr() should detect substrings', () => {
      assert.strictEqual(hasSubstr('hello world', 'world'), true);
      assert.strictEqual(hasSubstr('hello world', 'foo'), false);
    });

    it('endsWith() should check suffix', () => {
      assert.strictEqual(endsWith('hello world', 'world', null), true);
      assert.strictEqual(endsWith('hello world', 'hello', null), false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      assert.deepStrictEqual(words('', null), []);
      assert.strictEqual(camelCase(''), '');
      assert.strictEqual(snakeCase(''), '');
      assert.strictEqual(trim('', null), '');
    });

    it('should handle single character strings', () => {
      assert.strictEqual(capitalize('a', false), 'A');
      assert.deepStrictEqual(chars('x'), ['x']);
    });

    it('should handle strings with special characters', () => {
      assert.strictEqual(snakeCase('hello-world!'), 'hello_world');
      assert.strictEqual(kebabCase('hello_world!'), 'hello-world');
    });
  });
});

// Summary output
console.log('\n📦 umo_modules/pydash test fixture');
console.log('   Tests Python-to-JS interop via WASM components');
console.log('   Validates string manipulation functions work correctly\n');
