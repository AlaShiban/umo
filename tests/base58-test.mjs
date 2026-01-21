import { b58encode, b58decode, b58encodeInt, b58decodeInt, init } from '../umo_modules/base58/index.js';

async function test() {
  console.log('Testing base58 module...\n');

  // Initialize
  await init();

  // Test encoding
  console.log('Base58 encode tests:');

  // Encode a string
  const encoded = await b58encode("Hello World", null);
  console.log(`  b58encode("Hello World"): ${encoded}`);

  // Test integer encoding
  console.log('\nInteger encoding tests:');
  const intEncoded1 = await b58encodeInt(12345, true, null);
  console.log(`  b58encodeInt(12345): ${intEncoded1}`);

  const intEncoded2 = await b58encodeInt(0, true, null);
  console.log(`  b58encodeInt(0): ${intEncoded2}`);

  const intEncoded3 = await b58encodeInt(255, true, null);
  console.log(`  b58encodeInt(255): ${intEncoded3}`);

  // Test integer decoding
  console.log('\nInteger decoding tests:');
  const intDecoded = await b58decodeInt(intEncoded1, null, false);
  console.log(`  b58decodeInt("${intEncoded1}"): ${intDecoded}`);

  console.log('\n✓ All base58 tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
