# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**umo (Universal Modules)** compiles packages from any language into WebAssembly modules that can be imported natively by any other language. The primary feature is `umo pip-install` which lets you import Python packages directly in JavaScript with full TypeScript support.

## Common Commands

```bash
# Build TypeScript to dist/
npm run build

# Development mode with watch
npm run dev

# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run single test file
node --test test/unit/parser.test.js

# Run the CLI
node dist/cli.js pip-install humanize

# Check required tools are installed
node scripts/check-tools.js
```

## Architecture

The system is a **multi-phase compilation pipeline**:

```
Python Package → Type Extraction → WIT Generation → WASM Compilation → JS Bindings
```

### Key Source Directories

- **`src/pip/`** - Primary feature: pip package installation pipeline
  - `package-resolver.ts` - Parses package specs, installs via `uv`
  - `type-extractor.ts` - Calls `scripts/extract-types.py` to get Python type info
  - `wit-generator.ts` - Converts Python types to WIT interfaces
  - `wasm-compiler.ts` - Calls `componentize-py` to compile to WASM
  - `js-generator.ts` - Calls `jco transpile` to generate JS bindings
  - `dts-generator.ts` - Generates TypeScript declarations

- **`src/parser/`** - Module parsing and dependency resolution
  - Language-specific extractors for TypeScript and Python
  - DFS traversal with circular dependency detection

- **`src/compiler/`** - WASM compilation with SHA256-based caching

- **`src/wit/`** - WIT (WebAssembly Interface Types) generation

- **`src/linker/`** - Component composition using `wasm-tools`

- **`src/runtime/`** - WASM execution via `wasmtime` CLI

### Output Directories

- **`umo_modules/`** - Compiled universal modules (JS bindings, .d.ts, WASM)
- **`.umo/`** - Build artifacts, WIT files, pip cache (venv, componentize-py output)

### External Tools

The pipeline orchestrates these tools via `execa`:
- `componentize-py` - Python to WASM compilation
- `jco` - WASM to JS transpilation
- `wasmtime` - WASM execution
- `wasm-tools` - Component composition
- `uv` - Fast Python package installation

## Type System

WIT (WebAssembly Interface Types) is the lingua franca between languages:

| Python | TypeScript | WIT |
|--------|------------|-----|
| `str` | `string` | `string` |
| `int` | `number` | `s32` |
| `float` | `number` | `f64` |
| `bool` | `boolean` | `bool` |

**Resources** (WIT feature) enable stateful Python classes to work in JS - see `redblacktree` package for an example.

## Testing

- Framework: Node.js built-in `test` module
- Tests run sequentially (concurrency disabled)
- Test fixtures in `test/fixtures/`
- Integration tests in `tests/` directory test pip module functionality

## Key Files

- `scripts/extract-types.py` - Critical Python script that extracts type hints from packages
- `src/pip/curated-packages.ts` - Whitelist of tested packages (humanize, redblacktree, pydash)

## Pip Package Compatibility

When testing new Python packages with `umo pip-install`, many will fail. Common failure patterns:

### Compilation Failures

| Issue | Examples | Cause |
|-------|----------|-------|
| Underscore in package name | `text-unidecode`, `more-itertools` | WIT world specifier rejects `_` |
| Reserved WIT keywords | `parse` (`result`), `pyparsing` (`char`) | Function/class names conflict with WIT keywords |
| Duplicate names | `toolz`, `semver`, `markdown2` | Multiple functions/classes with same name after kebab-case conversion |
| Kebab-case violations | `validators` (`rfc-1034`), `chardet` | Parameter names with numbers/hyphens |
| Class export issues | `emoji`, `ftfy`, `colorama` | Complex class hierarchies fail WIT generation |

### Runtime Failures

| Issue | Examples | Cause |
|-------|----------|-------|
| Missing stdlib codecs | `idna` (needs `punycode`) | WASM Python lacks some codecs |
| Missing data files | `anyascii` (needs `_data` submodule) | Package data not bundled in WASM |
| Type conversion | `base58` (bytes vs string) | WIT type marshalling issues |

### Good Package Candidates

Packages likely to work:
- Pure Python (no C extensions)
- Simple function names (no numbers, hyphens in identifiers)
- No underscores in package name
- Don't rely on special stdlib modules (codecs, fractions)
- Don't depend on package data files
- Good type annotations

### Validated Working Packages

Beyond the curated list, these have been tested:
- **`inflect`** - Pluralization, ordinals, articles (`Engine` class)
- **`cachetools`** - LRU cache implementations (`Lrucache` class)

Test files: `tests/inflect-test.mjs`, `tests/cachetools-test.mjs`

## High-Profile Package Analysis

### Working Packages (after fixes implemented)

The following packages compile and install successfully:

**Web & HTTP:**
- ✅ **flask** - Web microframework
- ✅ **httpx** - HTTP client library

**Data & Parsing:**
- ✅ **beautifulsoup4** - HTML/XML parsing (import as `bs4`)
- ✅ **simplejson** - JSON encoding/decoding
- ✅ **toml** - TOML config files
- ✅ **markdown** - Markdown to HTML conversion
- ✅ **jinja2** - Template engine

**Database:**
- ✅ **sqlalchemy** - SQL toolkit and ORM

**CLI & Display:**
- ✅ **click** - CLI framework
- ✅ **colorama** - Terminal colors
- ✅ **tabulate** - Table formatting
- ✅ **pygments** - Syntax highlighting

**Date/Time:**
- ✅ **arrow** - Date/time handling
- ✅ **python-dateutil** - Date utilities (import as `dateutil`)

**Strings & Text:**
- ✅ **humanize** - Human-readable formatting
- ✅ **inflection** - String transformations
- ✅ **slugify** - URL slug generation
- ✅ **text-unidecode** - Unicode to ASCII
- ✅ **chardet** - Charset detection
- ✅ **inflect** - Pluralization

**Utilities:**
- ✅ **attrs** - Class decorators
- ✅ **toolz** - Functional programming
- ✅ **wrapt** - Decorators
- ✅ **six** - Python 2/3 compatibility
- ✅ **certifi** - SSL certificates
- ✅ **cachetools** - Caching utilities

### Packages Blocked by Native Extensions

These packages fail because they depend on C/Rust extensions that can't compile to WASM:
- ❌ **requests** - Needs `_ssl` native module for SSL support
- ❌ **pydantic** - Needs `pydantic_core._pydantic_core` (Rust-based)
- ❌ **numpy** - Entire package is C extensions
- ❌ **networkx** - Needs `_bz2` (C extension)
- ❌ **pyyaml** - Needs `yaml._yaml` (C extension)
- ❌ **jsonschema** - Needs `rpds` (Rust extension)
- ❌ **rich** - Needs `mmap` (native module)

### Packages with Other Failures

- ❌ **pillow** - World name case sensitivity (`PIL` vs `pil`)
- ❌ **aiohttp** - Complex async, component index out of bounds
- ❌ **pendulum** - Component index out of bounds
- ❌ **boltons** - Uses `socket.gethostname` at import time
- ❌ **more-itertools** - Missing `raise_` method in wrapper

### Fixes Implemented

The following fixes were made to enable high-profile packages:

| Fix | Location | Description |
|-----|----------|-------------|
| Reserved keywords | `wit-generator.ts:70-82` | Added `include`, `with`, `from`, `self`, `true`, `false`, `null`, `new`, `abstract`, `await` |
| Double underscore | `wit-generator.ts:96` | Collapse multiple hyphens: `context__self` → `context-self` |
| Numbers in identifiers | `wit-generator.ts:106-111` | Prefix digits after hyphens: `handle-401` → `handle-n401` |
| Name collision | `wit-generator.ts:359-374` | Rename functions that collide with class names: `session()` → `session-fn()` |
| Resource keywords | `wit-generator.ts:261-267` | Escape reserved class names: `option` → `option-class` |
| Method-resource collision | `wit-generator.ts:223-226` | Rename methods matching resource: `group.group()` → `group.group-method()` |
| Resource deduplication | `wit-generator.ts:326-343` | Skip duplicate classes/methods within same interface |
| Constructor param dedup | `wit-generator.ts:280-298` | Handle duplicate parameter names: `resolver, resolver` → `resolver, resolver2` |
| None type | `wit-generator.ts:54-57` | Use `option<string>` instead of invalid `unit` type |
| Consistent naming | `wasm-compiler.ts:52-68` | Match `toKebabCase` logic with wit-generator.ts |
| World name kebab-case | `wasm-compiler.ts:645,666` | Convert `more_itertools` → `more-itertools` for componentize-py |
| Multiple resource modules | `wasm-compiler.ts:536-589` | Generate separate module file per interface |
| Function collision renaming | `wasm-compiler.ts:491-506` | Apply same renaming in Python wrapper as WIT |
| Import name mapping | `package-resolver.ts:114-156` | Map pip names to import names (beautifulsoup4→bs4, etc.) |

### Remaining Limitations

1. **Native Extensions**: Packages using C/Rust extensions (numpy, pydantic, requests with SSL) cannot compile to WASM
2. **Complex Dependencies**: Some packages fail due to complex import chains
3. **Missing stdlib modules**: WASM Python lacks some stdlib modules (_ssl, mmap, certain codecs)
4. **Case sensitivity**: World names are lowercased but some packages use uppercase import names
5. **Python keyword methods**: Methods like `raise_` need special handling

### Testing High-Profile Packages

```bash
# Packages that work
node dist/cli.js pip-install click --skip-validation
node dist/cli.js pip-install jinja2 --skip-validation
node dist/cli.js pip-install flask --skip-validation
node dist/cli.js pip-install beautifulsoup4 --skip-validation
node dist/cli.js pip-install sqlalchemy --skip-validation

# Packages blocked by native extensions
node dist/cli.js pip-install requests --skip-validation   # fails: _ssl
node dist/cli.js pip-install pydantic --skip-validation   # fails: pydantic_core
node dist/cli.js pip-install networkx --skip-validation   # fails: _bz2
```

## Development Notes

- Clear `.umo/` directory when modifying compilation logic
- Type extraction is central - changes ripple through code generation
- Python packages must have type hints for full functionality
- Cache invalidation uses SHA256 of module content + WIT
- Use `--skip-validation` flag to test non-curated packages
