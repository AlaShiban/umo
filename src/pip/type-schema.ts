/**
 * Type schema definitions for Python package type extraction.
 * These interfaces define the JSON format used to communicate
 * type information between Python extraction and TypeScript generation.
 */

export interface PipType {
  kind: 'primitive' | 'list' | 'dict' | 'optional' | 'tuple' | 'class' | 'any' | 'none';
  value?: string; // For primitives: 'str', 'int', 'float', 'bool'
  elementType?: PipType; // For list
  keyType?: PipType; // For dict
  valueType?: PipType; // For dict
  innerType?: PipType; // For optional
  elements?: PipType[]; // For tuple
  className?: string; // For class references
}

export interface PipParameter {
  name: string;
  type: PipType;
  optional: boolean;
  default?: string;
}

export interface PipFunction {
  name: string;
  params: PipParameter[];
  returnType: PipType;
  docstring?: string;
  isAsync: boolean;
  isMethod: boolean;
}

export interface PipProperty {
  name: string;
  type: PipType;
  readonly: boolean;
  docstring?: string;
}

export interface PipClass {
  name: string;
  constructor?: PipFunction;
  methods: PipFunction[];
  properties: PipProperty[];
  docstring?: string;
  bases?: string[];
}

export interface PipModule {
  name: string;
  path: string;
  functions: PipFunction[];
  classes: PipClass[];
  constants: { name: string; type: PipType; value?: string }[];
  docstring?: string;
}

export interface PipTypeSchema {
  package: string;
  version: string;
  modules: PipModule[];
  typeAnnotationCoverage: number; // Percentage 0-100
  missingAnnotations: string[]; // List of items without annotations
  extractedAt: string; // ISO timestamp
}

/**
 * Helper functions for working with PipType
 */
export function createPrimitiveType(value: 'str' | 'int' | 'float' | 'bool'): PipType {
  return { kind: 'primitive', value };
}

export function createListType(elementType: PipType): PipType {
  return { kind: 'list', elementType };
}

export function createDictType(keyType: PipType, valueType: PipType): PipType {
  return { kind: 'dict', keyType, valueType };
}

export function createOptionalType(innerType: PipType): PipType {
  return { kind: 'optional', innerType };
}

export function createClassType(className: string): PipType {
  return { kind: 'class', className };
}

export function createAnyType(): PipType {
  return { kind: 'any' };
}

export function createNoneType(): PipType {
  return { kind: 'none' };
}

/**
 * Convert PipType to a human-readable string for error messages
 */
export function pipTypeToString(type: PipType): string {
  switch (type.kind) {
    case 'primitive':
      return type.value || 'unknown';
    case 'list':
      return `list[${type.elementType ? pipTypeToString(type.elementType) : 'unknown'}]`;
    case 'dict':
      return `dict[${type.keyType ? pipTypeToString(type.keyType) : 'unknown'}, ${type.valueType ? pipTypeToString(type.valueType) : 'unknown'}]`;
    case 'optional':
      return `Optional[${type.innerType ? pipTypeToString(type.innerType) : 'unknown'}]`;
    case 'tuple':
      return `tuple[${type.elements?.map(pipTypeToString).join(', ') || ''}]`;
    case 'class':
      return type.className || 'unknown';
    case 'any':
      return 'Any';
    case 'none':
      return 'None';
    default:
      return 'unknown';
  }
}
