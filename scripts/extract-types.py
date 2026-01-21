#!/usr/bin/env python3
"""
Extract type information from a Python package for wastalk.
Outputs JSON schema to stdout.

Usage: python extract-types.py <package_name> <site_packages_path>
"""

import ast
import inspect
import importlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, get_type_hints, get_origin, get_args


def parse_type_annotation(annotation: Any) -> Dict[str, Any]:
    """Convert a Python type annotation to our schema format."""
    if annotation is None or annotation is type(None):
        return {"kind": "none"}

    if annotation is inspect.Parameter.empty or annotation is inspect.Signature.empty:
        return {"kind": "any"}

    # Handle string annotations (forward references)
    if isinstance(annotation, str):
        # Try to resolve common types
        type_map = {
            'str': {"kind": "primitive", "value": "str"},
            'int': {"kind": "primitive", "value": "int"},
            'float': {"kind": "primitive", "value": "float"},
            'bool': {"kind": "primitive", "value": "bool"},
            'None': {"kind": "none"},
            'Any': {"kind": "any"},
        }
        return type_map.get(annotation, {"kind": "any"})

    # Handle basic types
    if annotation is str:
        return {"kind": "primitive", "value": "str"}
    if annotation is int:
        return {"kind": "primitive", "value": "int"}
    if annotation is float:
        return {"kind": "primitive", "value": "float"}
    if annotation is bool:
        return {"kind": "primitive", "value": "bool"}

    # Handle generic types
    origin = get_origin(annotation)
    args = get_args(annotation)

    if origin is list or (hasattr(annotation, '__origin__') and annotation.__origin__ is list):
        element_type = parse_type_annotation(args[0]) if args else {"kind": "any"}
        return {"kind": "list", "elementType": element_type}

    if origin is dict or (hasattr(annotation, '__origin__') and annotation.__origin__ is dict):
        key_type = parse_type_annotation(args[0]) if len(args) > 0 else {"kind": "any"}
        value_type = parse_type_annotation(args[1]) if len(args) > 1 else {"kind": "any"}
        return {"kind": "dict", "keyType": key_type, "valueType": value_type}

    if origin is tuple:
        elements = [parse_type_annotation(arg) for arg in args] if args else []
        return {"kind": "tuple", "elements": elements}

    # Handle Optional (Union with None)
    if origin is type(None):
        return {"kind": "none"}

    # Check for Optional/Union
    try:
        from typing import Union
        if origin is Union:
            # Filter out None to get Optional[T] -> T
            non_none_args = [a for a in args if a is not type(None)]
            if len(non_none_args) == 1 and type(None) in args:
                return {"kind": "optional", "innerType": parse_type_annotation(non_none_args[0])}
            # Complex union - return any for now
            return {"kind": "any"}
    except:
        pass

    # Handle class types
    if inspect.isclass(annotation):
        return {"kind": "class", "className": annotation.__name__}

    # Handle typing special forms
    type_name = str(annotation)
    if 'Any' in type_name:
        return {"kind": "any"}

    # Default to any
    return {"kind": "any"}


def extract_function_info(func: Any, name: str) -> Optional[Dict[str, Any]]:
    """Extract information about a function."""
    try:
        sig = inspect.signature(func)
    except (ValueError, TypeError):
        return None

    # Try to get type hints
    try:
        hints = get_type_hints(func)
    except Exception:
        hints = {}

    params = []
    for param_name, param in sig.parameters.items():
        if param_name == 'self':
            continue

        # Get type from hints or annotation
        param_type = hints.get(param_name, param.annotation)
        type_info = parse_type_annotation(param_type)

        params.append({
            "name": param_name,
            "type": type_info,
            "optional": param.default is not inspect.Parameter.empty,
            "default": repr(param.default) if param.default is not inspect.Parameter.empty else None
        })

    # Get return type
    return_type = hints.get('return', sig.return_annotation)
    return_info = parse_type_annotation(return_type)

    return {
        "name": name,
        "params": params,
        "returnType": return_info,
        "docstring": inspect.getdoc(func),
        "isAsync": inspect.iscoroutinefunction(func),
        "isMethod": False
    }


def extract_class_info(cls: Any) -> Dict[str, Any]:
    """Extract information about a class."""
    methods = []
    properties = []
    constructor = None

    # Extract __init__
    if hasattr(cls, '__init__'):
        init_info = extract_function_info(cls.__init__, '__init__')
        if init_info:
            init_info['isMethod'] = True
            constructor = init_info

    # Extract methods
    for name, method in inspect.getmembers(cls, predicate=inspect.isfunction):
        if name.startswith('_') and name != '__init__':
            continue
        method_info = extract_function_info(method, name)
        if method_info:
            method_info['isMethod'] = True
            methods.append(method_info)

    # Extract properties
    for name in dir(cls):
        if name.startswith('_'):
            continue
        attr = getattr(cls, name, None)
        if isinstance(attr, property):
            # Try to get type from getter
            prop_type = {"kind": "any"}
            if attr.fget:
                try:
                    hints = get_type_hints(attr.fget)
                    if 'return' in hints:
                        prop_type = parse_type_annotation(hints['return'])
                except:
                    pass
            properties.append({
                "name": name,
                "type": prop_type,
                "readonly": attr.fset is None,
                "docstring": attr.__doc__
            })

    return {
        "name": cls.__name__,
        "constructor": constructor,
        "methods": methods,
        "properties": properties,
        "docstring": inspect.getdoc(cls),
        "bases": [base.__name__ for base in cls.__bases__ if base.__name__ != 'object']
    }


def extract_module_info(module: Any, module_name: str) -> Dict[str, Any]:
    """Extract type information from a module."""
    functions = []
    classes = []
    constants = []

    # Get the module's public API (__all__) if defined
    module_all = set(getattr(module, '__all__', []))

    for name in dir(module):
        if name.startswith('_'):
            continue

        obj = getattr(module, name, None)
        if obj is None:
            continue

        # Include items if:
        # 1. They're defined in this module (obj.__module__ == module.__name__)
        # 2. OR they're in __all__ (explicitly exported public API)
        is_defined_here = not hasattr(obj, '__module__') or obj.__module__ == module.__name__
        is_in_all = name in module_all
        if not is_defined_here and not is_in_all:
            continue

        if inspect.isfunction(obj):
            func_info = extract_function_info(obj, name)
            if func_info:
                functions.append(func_info)
        elif inspect.isclass(obj):
            class_info = extract_class_info(obj)
            classes.append(class_info)
        elif not callable(obj):
            # It's a constant
            const_type = parse_type_annotation(type(obj))
            constants.append({
                "name": name,
                "type": const_type,
                "value": repr(obj) if not isinstance(obj, (dict, list)) or len(repr(obj)) < 100 else None
            })

    return {
        "name": module_name,
        "path": getattr(module, '__file__', ''),
        "functions": functions,
        "classes": classes,
        "constants": constants,
        "docstring": inspect.getdoc(module)
    }


def count_missing_annotations(schema: Dict[str, Any]) -> List[str]:
    """Count items missing type annotations."""
    missing = []

    for module in schema.get('modules', []):
        module_name = module['name']

        for func in module.get('functions', []):
            func_name = f"{module_name}.{func['name']}"
            if func['returnType']['kind'] == 'any':
                missing.append(f"{func_name} (return type)")
            for param in func.get('params', []):
                if param['type']['kind'] == 'any':
                    missing.append(f"{func_name}.{param['name']}")

        for cls in module.get('classes', []):
            cls_name = f"{module_name}.{cls['name']}"
            for method in cls.get('methods', []):
                method_name = f"{cls_name}.{method['name']}"
                if method['returnType']['kind'] == 'any':
                    missing.append(f"{method_name} (return type)")
                for param in method.get('params', []):
                    if param['type']['kind'] == 'any':
                        missing.append(f"{method_name}.{param['name']}")

    return missing


def extract_package_types(package_name: str, site_packages_path: str, pip_name: str = None) -> Dict[str, Any]:
    """Extract type information from an installed package.

    Args:
        package_name: The Python import name (e.g., 'dotenv')
        site_packages_path: Path to site-packages directory
        pip_name: The pip package name if different from import name (e.g., 'python-dotenv')
    """
    # Add site-packages to path
    if site_packages_path not in sys.path:
        sys.path.insert(0, site_packages_path)

    # Import the main package
    try:
        main_module = importlib.import_module(package_name)
    except ImportError as e:
        return {"error": f"Failed to import {package_name}: {e}"}

    # Get package version - try __version__ first, then importlib.metadata
    version = getattr(main_module, '__version__', None)
    if version is None:
        try:
            from importlib.metadata import version as get_version
            # Try pip name first, then import name
            try:
                version = get_version(pip_name or package_name)
            except Exception:
                version = get_version(package_name)
        except Exception:
            version = 'unknown'

    modules = []

    # Extract main module
    main_info = extract_module_info(main_module, package_name)
    modules.append(main_info)

    # Try to find and extract submodules
    package_path = getattr(main_module, '__path__', None)
    if package_path:
        for path in package_path:
            path = Path(path)
            if path.exists():
                for py_file in path.glob('*.py'):
                    if py_file.name.startswith('_'):
                        continue
                    submodule_name = f"{package_name}.{py_file.stem}"
                    try:
                        # Suppress stdout/stderr during submodule import
                        # (some modules print messages before raising exceptions)
                        import io
                        old_stdout, old_stderr = sys.stdout, sys.stderr
                        sys.stdout = sys.stderr = io.StringIO()
                        try:
                            submodule = importlib.import_module(submodule_name)
                        finally:
                            sys.stdout, sys.stderr = old_stdout, old_stderr
                        sub_info = extract_module_info(submodule, submodule_name)
                        if sub_info['functions'] or sub_info['classes']:
                            modules.append(sub_info)
                    except (Exception, SystemExit) as e:
                        # Skip modules that can't be imported (including those that call sys.exit())
                        pass

    schema = {
        "package": package_name,
        "version": version,
        "modules": modules,
        "extractedAt": __import__('datetime').datetime.utcnow().isoformat() + 'Z'
    }

    # Calculate coverage
    missing = count_missing_annotations(schema)
    schema["missingAnnotations"] = missing

    total_items = 0
    for module in modules:
        for func in module.get('functions', []):
            total_items += 1 + len(func.get('params', []))
        for cls in module.get('classes', []):
            for method in cls.get('methods', []):
                total_items += 1 + len(method.get('params', []))

    coverage = ((total_items - len(missing)) / total_items * 100) if total_items > 0 else 100
    schema["typeAnnotationCoverage"] = round(coverage, 2)

    return schema


def main():
    if len(sys.argv) < 3:
        print("Usage: python extract-types.py <import_name> <site_packages_path> [pip_name]", file=sys.stderr)
        sys.exit(1)

    import_name = sys.argv[1]
    site_packages_path = sys.argv[2]
    pip_name = sys.argv[3] if len(sys.argv) > 3 else None

    schema = extract_package_types(import_name, site_packages_path, pip_name)

    print(json.dumps(schema, indent=2))


if __name__ == '__main__':
    main()
