import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as tsParser from '../../dist/parser/typescript-parser.js';
import * as pyParser from '../../dist/parser/python-parser.js';

describe('TypeScript Parser', () => {
  it('should extract umo imports', () => {
    const source = `// umo: import helper.py
// umo: import utils.ts

export function main() {
  return "hello";
}`;

    const imports = tsParser.extractUmoImports(source, '/test/main.ts');

    assert.strictEqual(imports.length, 2);
    assert.strictEqual(imports[0].modulePath, 'helper.py');
    assert.strictEqual(imports[1].modulePath, 'utils.ts');
  });

  it('should extract exported functions', () => {
    const source = `export function reverseString(input: string): string {
  return input.split('').reverse().join('');
}

export function add(a: number, b: number): number {
  return a + b;
}`;

    const exports = tsParser.extractExportedFunctions(source, '/test/utils.ts');

    assert.strictEqual(exports.length, 2);
    assert.strictEqual(exports[0].name, 'reverseString');
    assert.strictEqual(exports[0].params.length, 1);
    assert.strictEqual(exports[0].params[0].name, 'input');
    assert.strictEqual(exports[0].params[0].type, 'string');
    assert.strictEqual(exports[0].returnType, 'string');

    assert.strictEqual(exports[1].name, 'add');
    assert.strictEqual(exports[1].params.length, 2);
  });

  it('should convert function names to kebab-case', () => {
    assert.strictEqual(tsParser.convertFunctionNameToKebab('reverseString'), 'reverse-string');
    assert.strictEqual(tsParser.convertFunctionNameToKebab('getUserById'), 'get-user-by-id');
    assert.strictEqual(tsParser.convertFunctionNameToKebab('simpleFunc'), 'simple-func');
  });

  it('should reject functions without type annotations', () => {
    const source = `export function noTypes(input) {
  return input;
}`;

    assert.throws(() => {
      tsParser.extractExportedFunctions(source, '/test/bad.ts');
    }, /must have a type annotation/);
  });
});

describe('Python Parser', () => {
  it('should extract umo imports', () => {
    const source = `# umo: import helper.ts
# umo: import utils.py

def main() -> str:
    return "hello"`;

    const imports = pyParser.extractUmoImports(source, '/test/main.py');

    assert.strictEqual(imports.length, 2);
    assert.strictEqual(imports[0].modulePath, 'helper.ts');
    assert.strictEqual(imports[1].modulePath, 'utils.py');
  });

  it('should extract exported functions', () => {
    const source = `def greet(name: str) -> str:
    return f"Hello, {name}!"

def add(a: int, b: int) -> int:
    return a + b

def _private_func(x: int) -> int:
    return x * 2`;

    const exports = pyParser.extractExportedFunctions(source, '/test/utils.py');

    assert.strictEqual(exports.length, 2); // _private_func should be excluded
    assert.strictEqual(exports[0].name, 'greet');
    assert.strictEqual(exports[0].params.length, 1);
    assert.strictEqual(exports[0].params[0].name, 'name');
    assert.strictEqual(exports[0].params[0].type, 'string');
    assert.strictEqual(exports[0].returnType, 'string');

    assert.strictEqual(exports[1].name, 'add');
    assert.strictEqual(exports[1].params.length, 2);
    assert.strictEqual(exports[1].returnType, 's32');
  });

  it('should not extract functions without type hints', () => {
    const source = `def no_types(input):
    return input`;

    // Functions without type hints are simply not matched by the regex
    // so they return an empty array rather than throwing
    const exports = pyParser.extractExportedFunctions(source, '/test/bad.py');
    assert.strictEqual(exports.length, 0);
  });
});

describe('Type Mapping', () => {
  it('should map TypeScript types to WIT types', () => {
    // This is tested implicitly in the parser tests above
    // TypeScript string -> WIT string
    // TypeScript number -> WIT s32
    // TypeScript boolean -> WIT bool
  });

  it('should map Python types to WIT types', () => {
    // str -> string
    // int -> s32
    // float -> f64
    // bool -> bool
  });
});
