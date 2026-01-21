# Language Support Guide

This document describes the supported language features and limitations for umo.

## TypeScript/JavaScript

### Supported Features

**Function Declarations**:
```typescript
export function functionName(param: string): string {
  return param;
}
```

**Primitive Types**:
- `string` - UTF-8 encoded strings
- `number` - Maps to `s32` (32-bit signed integer) or `f64` (64-bit float)
- `boolean` - Boolean values

### AssemblyScript Subset

umo uses AssemblyScript to compile TypeScript to WebAssembly. This means you must write TypeScript code that is compatible with AssemblyScript.

**Supported**:
- Basic arithmetic and string operations
- Control flow (if/else, loops)
- Functions with explicit type annotations
- Basic string methods (split, join, reverse, etc.)

**Not Supported**:
- `async`/`await`
- Promises
- `any` or `unknown` types
- Complex object types (classes, interfaces with multiple properties)
- Dynamic typing
- Most DOM APIs
- Node.js APIs
- Many JavaScript built-in objects

### Import Syntax

```typescript
// Import a Python module
// umo: import helper.py

// Import another TypeScript module
// umo: import utils.ts

export function main(input: string): string {
  return helperFunction(input);
}
```

### Type Annotations Required

All exported functions MUST have type annotations for parameters and return values:

```typescript
// ✓ Correct
export function process(input: string): number {
  return input.length;
}

// ✗ Incorrect - missing type annotations
export function process(input) {
  return input.length;
}
```

## Python

### Supported Features

**Function Definitions with Type Hints**:
```python
def function_name(param: str) -> str:
    return param
```

**Primitive Types**:
- `str` - UTF-8 encoded strings
- `int` - Maps to `s32` (32-bit signed integer)
- `float` - Maps to `f64` (64-bit float)
- `bool` - Boolean values

### Import Syntax

```python
# Import a TypeScript module
# umo: import helper.ts

# Import another Python module
# umo: import utils.py

def main(input: str) -> str:
    return helper_function(input)
```

### Type Hints Required

All exported functions MUST have type hints for parameters and return values:

```python
# ✓ Correct
def process(input: str) -> int:
    return len(input)

# ✗ Incorrect - missing type hints
def process(input):
    return len(input)
```

### Function Naming

- Functions starting with `_` are considered private and not exported
- Function names are automatically converted to snake_case for cross-language compatibility

## Type Mapping

| Python Type | TypeScript Type | WIT Type | Size/Notes |
|-------------|----------------|----------|------------|
| `str` | `string` | `string` | UTF-8 encoded |
| `int` | `number` | `s32` | 32-bit signed integer |
| `float` | `number` | `f64` | 64-bit float |
| `bool` | `boolean` | `bool` | Boolean value |

## Limitations

### MVP Limitations

1. **Primitive Types Only**: Complex types (lists, dicts, objects, classes) are not supported in MVP
2. **No Async**: Asynchronous operations are not supported
3. **No External Libraries**: Cannot import npm packages or pip packages (except standard library)
4. **No Standard Library Access**: Limited access to language standard libraries
5. **Memory Limitations**: All data must fit in WebAssembly linear memory

### Future Support

Planned for future versions:

1. **Complex Types**:
   - Lists/Arrays: `list[str]` / `string[]`
   - Records/Dicts: `dict[str, int]` / `{ [key: string]: number }`
   - Tuples: `tuple[str, int]` / `[string, number]`
   - Optional types: `str | None` / `string | null`

2. **Standard Library Access**:
   - File I/O through WASI
   - Network access
   - Date/time operations

3. **External Packages**:
   - Import from npm
   - Import from PyPI
   - Package version management

## Best Practices

### 1. Keep Functions Simple

```typescript
// ✓ Good - simple, focused function
export function reverseString(input: string): string {
  return input.split('').reverse().join('');
}

// ✗ Avoid - complex logic may not be AssemblyScript-compatible
export function complexProcessing(input: string): string {
  // Complex DOM manipulation, promises, etc.
}
```

### 2. Use Type Annotations Everywhere

```python
# ✓ Good
def add(a: int, b: int) -> int:
    return a + b

# ✗ Bad
def add(a, b):
    return a + b
```

### 3. Validate Inputs

Since cross-language calls involve serialization, validate inputs:

```typescript
export function divide(a: number, b: number): number {
  if (b === 0) {
    return 0; // or throw an error
  }
  return a / b;
}
```

### 4. Use Descriptive Names

Function names should be descriptive and follow language conventions:

```typescript
// TypeScript - camelCase
export function calculateTotal(price: number): number {
  return price * 1.1;
}
```

```python
# Python - snake_case
def calculate_total(price: float) -> float:
    return price * 1.1
```

### 5. Document Cross-Language Interfaces

```typescript
/**
 * Reverses a string and adds an exclamation mark.
 *
 * Can be called from Python:
 *   result = reverse_string("hello")
 */
export function reverseString(input: string): string {
  return input.split('').reverse().join('') + '!';
}
```

## Error Handling

### Type Errors

If you use unsupported types, umo will error during parsing:

```
Error: Unsupported TypeScript type: Promise<string>.
Only string, number, and boolean are supported in MVP.
```

### Compilation Errors

If AssemblyScript or componentize-py compilation fails, umo will show the compiler output:

```
Error: Failed to compile TypeScript module: reverse.ts
Details: [AssemblyScript compiler output]
```

### Runtime Errors

Runtime errors will be reported from wasmtime:

```
Error: Execution failed with exit code: 1
[wasmtime error output]
```

## Testing Your Code

### 1. Test Locally First

Test your functions in their native language before using umo:

```typescript
// test-reverse.ts
import { reverseString } from './reverse';

console.log(reverseString('hello')); // Should print: olleh!
```

### 2. Verify Type Annotations

Ensure all exported functions have complete type annotations.

### 3. Check AssemblyScript Compatibility

For TypeScript, verify your code uses only AssemblyScript-compatible features.

### 4. Start Simple

Begin with simple functions and gradually add complexity as you understand the limitations.

## Examples

### Example 1: String Processing

**utils.ts**:
```typescript
export function uppercase(input: string): string {
  return input.toUpperCase();
}

export function concat(a: string, b: string): string {
  return a + b;
}
```

**main.py**:
```python
# umo: import utils.ts

def main() -> str:
    result = concat(uppercase("hello"), " world")
    print(result)  # Output: HELLO world
    return result
```

### Example 2: Math Operations

**math_utils.py**:
```python
def add(a: int, b: int) -> int:
    return a + b

def multiply(a: int, b: int) -> int:
    return a * b
```

**calculator.ts**:
```typescript
// umo: import math_utils.py

export function calculate(x: number, y: number): number {
  return multiply(add(x, y), 2);
}
```

### Example 3: Boolean Logic

**validator.ts**:
```typescript
export function isValid(input: string): boolean {
  return input.length > 0;
}
```

**processor.py**:
```python
# umo: import validator.ts

def process(input: str) -> str:
    if is_valid(input):
        return f"Valid: {input}"
    else:
        return "Invalid input"
```

## Troubleshooting

### "Unsupported type" Error

Make sure you're only using primitive types (string, number, boolean).

### "Function must have type annotation" Error

Add type annotations to all parameters and return values.

### "AssemblyScript compilation failed"

Check that your TypeScript code only uses AssemblyScript-compatible features.

### "componentize-py failed"

Ensure your Python code has proper type hints and uses supported features.

## Getting Help

If you encounter issues:
1. Check this guide for language limitations
2. Review the examples in `test/fixtures/`
3. Check the main README troubleshooting section
4. Open an issue on GitHub with a minimal reproduction case
