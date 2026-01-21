import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as witGenerator from '../../dist/wit/templates.js';
import * as witResolver from '../../dist/wit/resolver.js';

describe('WIT Generator', () => {
  it('should generate WIT package header', () => {
    const header = witGenerator.generateWITPackageHeader('test-module');

    assert.ok(header.includes('package umo:test-module@0.1.0'));
  });

  it('should generate WIT interface from function signatures', () => {
    const functions = [
      {
        name: 'reverseString',
        params: [{ name: 'input', type: 'string' }],
        returnType: 'string'
      },
      {
        name: 'add',
        params: [
          { name: 'a', type: 's32' },
          { name: 'b', type: 's32' }
        ],
        returnType: 's32'
      }
    ];

    const witInterface = witGenerator.generateWITInterface('api', functions);

    assert.ok(witInterface.includes('interface api {'));
    assert.ok(witInterface.includes('reverse-string: func(input: string) -> string;'));
    assert.ok(witInterface.includes('add: func(a: s32, b: s32) -> s32;'));
  });

  it('should generate WIT world with exports', () => {
    const world = witGenerator.generateWITWorld('hello', ['api'], []);

    assert.ok(world.includes('world hello {'));
    assert.ok(world.includes('export api;'));
  });

  it('should convert names to kebab-case', () => {
    assert.strictEqual(witResolver.convertToKebabCase('reverseString'), 'reverse-string');
    assert.strictEqual(witResolver.convertToKebabCase('getUserById'), 'get-user-by-id');
    assert.strictEqual(witResolver.convertToKebabCase('simple_func'), 'simple-func');
  });

  it('should generate complete WIT file', () => {
    const module = {
      path: '/test/hello.py',
      language: 'python',
      imports: [],
      exports: [
        {
          name: 'greet',
          params: [{ name: 'name', type: 'string' }],
          returnType: 'string'
        }
      ],
      content: '',
      hash: 'test'
    };

    const wit = witGenerator.generateFullWIT(module, []);

    assert.ok(wit.includes('package umo:hello@0.1.0'));
    assert.ok(wit.includes('interface api'));
    assert.ok(wit.includes('greet: func(name: string) -> string'));
    assert.ok(wit.includes('world hello'));
    assert.ok(wit.includes('export api'));
  });
});

describe('WIT Type Resolution', () => {
  it('should convert WIT type to string', () => {
    assert.strictEqual(witResolver.witTypeToString('string'), 'string');
    assert.strictEqual(witResolver.witTypeToString('s32'), 's32');
    assert.strictEqual(witResolver.witTypeToString('f64'), 'f64');
    assert.strictEqual(witResolver.witTypeToString('bool'), 'bool');
  });

  it('should sanitize WIT identifiers', () => {
    assert.strictEqual(witResolver.sanitizeWITIdentifier('Hello World'), 'hello-world');
    assert.strictEqual(witResolver.sanitizeWITIdentifier('test_func'), 'test-func');
    assert.strictEqual(witResolver.sanitizeWITIdentifier('Special@Chars!'), 'special-chars-');
  });
});
