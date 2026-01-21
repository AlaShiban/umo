#!/usr/bin/env node

const { execSync } = require('child_process');

function checkCommand(command, name, installInstructions) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    console.log(`✓ ${name} is installed`);
    return true;
  } catch (error) {
    console.error(`✗ ${name} is not installed`);
    console.error(`  Install with: ${installInstructions}`);
    return false;
  }
}

console.log('\nChecking external dependencies for wastalk...\n');

const checks = [
  {
    command: 'wasmtime',
    name: 'wasmtime',
    install: 'curl https://wasmtime.dev/install.sh -sSf | bash'
  },
  {
    command: 'wasm-tools',
    name: 'wasm-tools',
    install: 'cargo install wasm-tools'
  },
  {
    command: 'componentize-py',
    name: 'componentize-py',
    install: 'pip install componentize-py'
  }
];

const results = checks.map(({ command, name, install }) =>
  checkCommand(command, name, install)
);

const allInstalled = results.every(r => r);

if (!allInstalled) {
  console.error('\n⚠️  Some external tools are missing. wastalk may not work correctly.');
  console.error('Please install the missing tools before running wastalk.\n');
} else {
  console.log('\n✓ All external dependencies are installed!\n');
}
