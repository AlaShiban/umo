# Troubleshooting Guide

This guide helps you resolve common issues when using umo.

## Installation Issues

### "command not found: wasmtime"

**Problem**: wasmtime is not installed or not in PATH.

**Solution**:
```bash
# Install wasmtime
curl https://wasmtime.dev/install.sh -sSf | bash

# Add to PATH (usually done automatically)
export PATH="$HOME/.wasmtime/bin:$PATH"

# Verify installation
wasmtime --version
```

### "command not found: wasm-tools"

**Problem**: wasm-tools is not installed.

**Solution**:
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-tools
cargo install wasm-tools

# Verify installation
wasm-tools --version
```

### "command not found: componentize-py"

**Problem**: componentize-py is not installed.

**Solution**:
```bash
# Install componentize-py
pip install componentize-py

# Or with pip3
pip3 install componentize-py

# Verify installation
componentize-py --version
```

### "command not found: asc"

**Problem**: AssemblyScript compiler is not installed.

**Solution**:
```bash
# Install globally
npm install -g assemblyscript

# Or install in project
npm install assemblyscript

# Verify installation
asc --version
```

## Parsing Errors

### "Unsupported file type"

**Problem**: umo doesn't recognize the file extension.

**Supported extensions**: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`

**Solution**: Ensure your file has a supported extension.

### "Failed to parse function"

**Problem**: Function signature is invalid or missing type annotations.

**Example Error**:
```
Error: Parameter input in function processData must have a type annotation
```

**Solution**:
```typescript
// ✗ Wrong - missing type
export function processData(input) {
  return input;
}

// ✓ Correct - with type annotation
export function processData(input: string): string {
  return input;
}
```

### "Unsupported type"

**Problem**: Using a type not supported in MVP.

**Example Error**:
```
Error: Unsupported TypeScript type: Array<string>.
Only string, number, and boolean are supported in MVP.
```

**Solution**: Use only primitive types (string, number, boolean) in MVP.

### "Circular dependency detected"

**Problem**: Modules import each other in a circular manner.

**Example Error**:
```
Error: Circular dependency detected: main.py → utils.ts → main.py
```

**Solution**: Restructure your code to remove circular dependencies:
- Extract shared code to a separate module
- Use dependency injection
- Refactor to make dependencies one-directional

## Compilation Errors

### "AssemblyScript compilation failed"

**Problem**: TypeScript code uses features not supported by AssemblyScript.

**Common causes**:
- Using `async`/`await`
- Using DOM APIs
- Using Node.js APIs
- Using dynamic typing
- Using complex objects

**Solution**: Rewrite code using AssemblyScript-compatible features. See [language-support.md](./language-support.md) for details.

**Example**:
```typescript
// ✗ Wrong - async not supported
export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

// ✓ Correct - synchronous operation
export function processData(input: string): string {
  return input.toUpperCase();
}
```

### "componentize-py failed"

**Problem**: Python code has issues or missing type hints.

**Common causes**:
- Missing type hints
- Using unsupported Python features
- Syntax errors

**Solution**:
```python
# ✗ Wrong - missing type hints
def process(data):
    return data.upper()

# ✓ Correct - with type hints
def process(data: str) -> str:
    return data.upper()
```

### "Cache error"

**Problem**: Corruption in the build cache.

**Solution**:
```bash
# Clear the cache
rm -rf .umo/

# Run again
umo ./main.py
```

## Linking Errors

### "No WIT file found for module"

**Problem**: WIT generation failed for a module.

**Solution**:
1. Check that the module has exported functions
2. Verify all functions have proper type annotations
3. Run with `--verbose` to see detailed error messages:
   ```bash
   umo --verbose ./main.py
   ```

### "Module imports X but it was not found"

**Problem**: Imported file doesn't exist or path is incorrect.

**Solution**:
- Verify the import path is correct (relative to current file)
- Check file extension is included
- Ensure the imported file exists

**Example**:
```python
# ✗ Wrong - missing file extension
# umo: import utils

# ✓ Correct - with extension
# umo: import utils.ts
```

## Runtime Errors

### "Execution failed with exit code: 1"

**Problem**: Runtime error occurred during execution.

**Solution**:
1. Run with `--verbose` to see detailed error output
2. Check wasmtime output for specific error messages
3. Verify all function calls match expected signatures

### "Memory access out of bounds"

**Problem**: WASM memory access violation.

**Common causes**:
- String manipulation errors
- Array index out of bounds
- Null pointer dereference

**Solution**:
- Add bounds checking in your code
- Validate inputs before processing
- Use defensive programming practices

### "Function not found"

**Problem**: Trying to call a function that doesn't exist or isn't exported.

**Solution**:
- Verify the function is exported (has `export` keyword in TS or is not private in Python)
- Check function naming matches (camelCase in TS, snake_case in Python)
- Ensure the module is imported correctly

## Performance Issues

### "Compilation is very slow"

**Problem**: Python compilation includes entire CPython runtime.

**Expected**: First compilation takes 5-10 seconds for Python modules.

**Solutions**:
- Use caching (enabled by default)
- Compile once, run many times
- Consider using TypeScript for performance-critical modules

**Check cache is working**:
```bash
# First run - will be slow
umo ./main.py

# Second run - should be fast (using cache)
umo ./main.py
```

### "Large output files"

**Problem**: WASM component files are very large (30-50MB for Python).

**Expected**: This is normal for Python components (includes CPython runtime).

**Mitigations**:
- TypeScript components are much smaller (typically < 1MB)
- Use TypeScript for modules that need to be small
- Cache components to avoid recompilation

## Development Issues

### "Changes not reflected"

**Problem**: Code changes don't appear in output.

**Solution**:
```bash
# Clear cache and rebuild
rm -rf .umo/
umo ./main.py
```

### "Cannot read file"

**Problem**: Permission denied or file locked.

**Solution**:
- Check file permissions: `ls -la <file>`
- Close any programs that might have the file open
- Run with appropriate permissions

### "ENOSPC: no space left on device"

**Problem**: Disk is full.

**Solution**:
- Free up disk space
- Clear umo cache: `rm -rf .umo/`
- Clear npm cache: `npm cache clean --force`

## TypeScript-Specific Issues

### "Property 'X' does not exist on type 'Y'"

**Problem**: Using JavaScript features not available in AssemblyScript.

**Solution**: Stick to AssemblyScript-compatible code. See [AssemblyScript documentation](https://www.assemblyscript.org/).

### "Cannot find module"

**Problem**: TypeScript module resolution issues.

**Solution**:
- Use relative imports with file extensions
- Don't use npm packages (not supported in MVP)

## Python-Specific Issues

### "Type hint syntax error"

**Problem**: Invalid Python type hint syntax.

**Solution**:
```python
# ✗ Wrong - old-style annotation
def func(x):
    # type: (str) -> str
    return x

# ✓ Correct - modern type hints
def func(x: str) -> str:
    return x
```

### "Function not exported"

**Problem**: Private functions (starting with `_`) are not exported.

**Solution**:
```python
# ✗ Wrong - private function (starts with _)
def _process(data: str) -> str:
    return data

# ✓ Correct - public function
def process(data: str) -> str:
    return data
```

## Getting More Help

### Enable Verbose Logging

```bash
umo --verbose ./main.py
```

This will show:
- Detailed parsing information
- Compilation commands and output
- Linking steps
- Runtime execution details

### Check Tool Versions

```bash
# Check all required tools
wasmtime --version
wasm-tools --version
componentize-py --version
asc --version
node --version
```

### Minimal Reproduction

Create a minimal example that reproduces the issue:

**reverse.ts**:
```typescript
export function reverse(s: string): string {
  return s.split('').reverse().join('');
}
```

**main.py**:
```python
# umo: import reverse.ts

def main() -> str:
    return reverse("test")
```

Run:
```bash
umo --verbose main.py
```

### Report an Issue

If you still have issues:

1. Create a minimal reproduction case
2. Run with `--verbose` and capture output
3. Note your environment:
   - OS and version
   - Node.js version
   - Python version
   - Tool versions (wasmtime, wasm-tools, etc.)
4. Open an issue on GitHub with all this information

## Common Patterns and Solutions

### Pattern: Sharing Constants

**Problem**: Want to share constant values between languages.

**Solution**: Define constants as functions that return values:

```typescript
// constants.ts
export function getMaxLength(): number {
  return 100;
}
```

```python
# main.py
# umo: import constants.ts

def validate(input: str) -> bool:
    return len(input) <= get_max_length()
```

### Pattern: Error Handling

**Problem**: How to handle errors across languages.

**Solution**: Use return values to indicate success/failure:

```typescript
// Returns empty string on error
export function process(input: string): string {
  if (input.length === 0) {
    return "";
  }
  return input.toUpperCase();
}
```

### Pattern: Multiple Return Values

**Problem**: Need to return multiple values.

**Solution**: Not supported in MVP. Workarounds:
- Make multiple function calls
- Encode values in a string (e.g., "value1,value2")
- Wait for complex types support in future versions

## Debug Checklist

When things go wrong, check:

- [ ] All required tools are installed and in PATH
- [ ] File extensions are correct (.ts, .py)
- [ ] All functions have type annotations
- [ ] Only primitive types are used
- [ ] Import paths are correct and include extensions
- [ ] No circular dependencies
- [ ] Functions are exported (not private)
- [ ] Code uses only supported language features
- [ ] Cache is not corrupted (try clearing it)

## Still Stuck?

1. Read the [README.md](../README.md)
2. Check [language-support.md](./language-support.md)
3. Look at examples in `test/fixtures/`
4. Open an issue with a minimal reproduction case
