#!/usr/bin/env node

import { run } from 'node:test';
import { spec as specReporter } from 'node:test/reporters';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function findTestFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await findTestFiles(fullPath, files);
    } else if (entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log('🧪 Running umo tests...\n');

// Find all test files
const testFiles = await findTestFiles(__dirname);

console.log(`Found ${testFiles.length} test files:\n`);
testFiles.forEach(file => {
  const relative = file.replace(__dirname, '');
  console.log(`  - ${relative}`);
});
console.log('');

// Run tests sequentially to avoid race conditions
const stream = run({
  files: testFiles,
  concurrency: false,
  timeout: 60000
});

stream.compose(specReporter).pipe(process.stdout);

// Handle completion
let failed = false;
const failures = [];

stream.on('test:fail', (data) => {
  failed = true;
  failures.push(data);
});

stream.on('end', () => {
  if (failed) {
    console.log('\n❌ Tests failed\n');
    // Print failure details
    for (const failure of failures) {
      console.log(`\n--- ${failure.name} ---`);
      if (failure.details?.error) {
        console.log('Error:', failure.details.error.message || failure.details.error);
        if (failure.details.error.cause) {
          console.log('Cause:', failure.details.error.cause);
        }
      }
    }
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
});
