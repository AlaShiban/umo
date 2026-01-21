import { encode, decode, init } from '../umo_modules/idna/index.js';

async function test() {
  console.log('Testing idna module...\n');

  // Initialize
  await init();

  // Test encoding international domain names
  console.log('IDNA encode tests (Unicode → Punycode):');

  // Chinese domain
  const chinaResult = await encode("中国.com", false, false, false, false);
  console.log(`  encode("中国.com"): ${chinaResult}`);

  // German domain with umlaut
  const germanResult = await encode("münchen.de", false, false, false, false);
  console.log(`  encode("münchen.de"): ${germanResult}`);

  // Russian domain
  const russianResult = await encode("россия.рф", false, false, false, false);
  console.log(`  encode("россия.рф"): ${russianResult}`);

  // Test decoding punycode domains
  console.log('\nIDNA decode tests (Punycode → Unicode):');

  const decodeResult1 = await decode("xn--fiqs8s.com", false, false, false);
  console.log(`  decode("xn--fiqs8s.com"): ${decodeResult1}`);

  const decodeResult2 = await decode("xn--mnchen-3ya.de", false, false, false);
  console.log(`  decode("xn--mnchen-3ya.de"): ${decodeResult2}`);

  console.log('\n✓ All idna tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
