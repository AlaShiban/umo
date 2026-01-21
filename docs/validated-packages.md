# Validated Packages

This is the full list of Python packages that have been tested with umo. These packages compile and run successfully in Node.js/TypeScript.

> **Note:** We validate that packages work with basic functionality tests, but we don't maintain full test suite translations from the original Python packages.

## Pure Python Packages (componentize-py)

These packages compile to WASM using componentize-py and run without an external runtime.

### Web & HTTP
| Package | Description |
|---------|-------------|
| flask | Web microframework |
| httpx | HTTP client library |
| jinja2 | Template engine |

### Data & Parsing
| Package | Description | Notes |
|---------|-------------|-------|
| beautifulsoup4 | HTML/XML parsing | Import as `bs4` |
| simplejson | JSON encoding/decoding | |
| toml | TOML config files | |
| markdown | Markdown to HTML | |

### Database
| Package | Description |
|---------|-------------|
| sqlalchemy | SQL toolkit and ORM |

### CLI & Display
| Package | Description |
|---------|-------------|
| click | CLI framework |
| colorama | Terminal colors |
| tabulate | Table formatting |
| pygments | Syntax highlighting |

### Date & Time
| Package | Description | Notes |
|---------|-------------|-------|
| arrow | Date/time handling | |
| python-dateutil | Date utilities | Import as `dateutil` |

### Strings & Text
| Package | Description |
|---------|-------------|
| humanize | Human-readable formatting |
| inflection | String transformations |
| slugify | URL slug generation |
| text-unidecode | Unicode to ASCII |
| chardet | Charset detection |
| inflect | Pluralization, ordinals |

### Data Structures
| Package | Description |
|---------|-------------|
| redblacktree | Self-balancing binary search tree |
| cachetools | Caching utilities (LRU, TTL) |

### Utilities
| Package | Description |
|---------|-------------|
| attrs | Class decorators |
| toolz | Functional programming |
| wrapt | Decorators |
| pydash | Python utility library (lodash-style) |
| six | Python 2/3 compatibility |
| certifi | SSL certificates |

## Native Extension Packages (Pyodide)

These packages require C/Rust extensions and use the Pyodide runtime instead of componentize-py. They have slightly larger bundle sizes but support the full package functionality.

| Package | Description |
|---------|-------------|
| pandas | Data analysis and manipulation |
| networkx | Graph/network analysis |
| numpy | Numerical computing |

## Known Incompatible Packages

These packages cannot currently be compiled due to fundamental limitations:

| Package | Reason |
|---------|--------|
| requests | Requires `_ssl` native module |
| pydantic | Rust-based core (`pydantic_core`) |
| pyyaml | C extension (`yaml._yaml`) |
| jsonschema | Rust extension (`rpds`) |
| rich | Requires `mmap` native module |
| pillow | Case sensitivity issues (`PIL` vs `pil`) |
| aiohttp | Complex async handling |

## Testing a New Package

To test if a package works:

```bash
# Install the package
umo pip-install <package-name>

# Create a test file
echo 'import { someFunction } from "./umo_modules/<package>/index.js";
console.log(someFunction());' > test.mjs

# Run it
node test.mjs
```

If you find a package that works well, please open a PR to add it to this list!
