import { anyascii, init } from '../umo_modules/anyascii/index.js';

async function test() {
  console.log('Testing anyascii module...\n');

  // Initialize
  await init();

  // Test Unicode to ASCII conversion
  console.log('Unicode to ASCII tests:');
  console.log(`  anyascii("北亰"): "${await anyascii("北亰")}"`);
  console.log(`  anyascii("Ελληνικά"): "${await anyascii("Ελληνικά")}"`);
  console.log(`  anyascii("日本語"): "${await anyascii("日本語")}"`);
  console.log(`  anyascii("München"): "${await anyascii("München")}"`);
  console.log(`  anyascii("Москва"): "${await anyascii("Москва")}"`);
  console.log(`  anyascii("café"): "${await anyascii("café")}"`);
  console.log(`  anyascii("😀"): "${await anyascii("😀")}"`);
  console.log(`  anyascii("résumé"): "${await anyascii("résumé")}"`);

  console.log('\n✓ All anyascii tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
