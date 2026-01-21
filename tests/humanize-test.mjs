/**
 * Test humanize package - Node.js WASM version
 */

import {
  init,
  intcomma,
  intword,
  naturalsize,
  ordinal,
  apnumber,
  // fractional, // SKIPPED: 'fractions' module not available in WASM
  scientific,
  metric,
  naturalList
} from '../umo_modules/humanize/index.js';

await init();

// Test intcomma - format numbers with commas
console.log("=== Intcomma Tests ===");
console.log(`intcomma(100) = ${intcomma(100)}`);
console.log(`intcomma(1000) = ${intcomma(1000)}`);
console.log(`intcomma(1000000) = ${intcomma(1000000)}`);
console.log(`intcomma(1234567.25) = ${intcomma(1234567.25)}`);

// Test intword - convert large numbers to words
console.log("\n=== Intword Tests ===");
console.log(`intword(100) = ${intword(100)}`);
console.log(`intword(12400) = ${intword(12400)}`);
console.log(`intword(1000000) = ${intword(1000000)}`);
console.log(`intword(1200000000) = ${intword(1200000000)}`);

// Test naturalsize - format file sizes
console.log("\n=== Naturalsize Tests ===");
console.log(`naturalsize(300) = ${naturalsize(300)}`);
console.log(`naturalsize(3000) = ${naturalsize(3000)}`);
console.log(`naturalsize(3000000) = ${naturalsize(3000000)}`);
console.log(`naturalsize(3000000000) = ${naturalsize(3000000000)}`);

// Test ordinal - convert to ordinal
console.log("\n=== Ordinal Tests ===");
console.log(`ordinal(1) = ${ordinal(1)}`);
console.log(`ordinal(2) = ${ordinal(2)}`);
console.log(`ordinal(3) = ${ordinal(3)}`);
console.log(`ordinal(11) = ${ordinal(11)}`);
console.log(`ordinal(111) = ${ordinal(111)}`);
console.log(`ordinal(1002) = ${ordinal(1002)}`);

// Test apnumber - Associated Press style
console.log("\n=== Apnumber Tests ===");
console.log(`apnumber(0) = ${apnumber(0)}`);
console.log(`apnumber(5) = ${apnumber(5)}`);
console.log(`apnumber(9) = ${apnumber(9)}`);
console.log(`apnumber(10) = ${apnumber(10)}`);

// Test fractional - convert to fractions
// SKIPPED: 'fractions' module not available in WASM
console.log("\n=== Fractional Tests (SKIPPED - fractions module not available in WASM) ===");
// console.log(`fractional(0.5) = ${fractional(0.5)}`);
// console.log(`fractional(0.3) = ${fractional(0.3)}`);
// console.log(`fractional(1.3) = ${fractional(1.3)}`);
// console.log(`fractional(1) = ${fractional(1)}`);

// Test scientific - scientific notation
// Note: explicitly passing precision=2 to match Python default
console.log("\n=== Scientific Tests ===");
console.log(`scientific(500, 2) = ${scientific(500, 2)}`);
console.log(`scientific(0.3, 2) = ${scientific(0.3, 2)}`);
console.log(`scientific(-1000, 2) = ${scientific(-1000, 2)}`);

// Test metric - metric SI unit-prefix
// Note: explicitly passing precision=3 to match Python default
console.log("\n=== Metric Tests ===");
console.log(`metric(1500, 'V', 3) = ${metric(1500, 'V', 3)}`);
console.log(`metric(2e8, 'W', 3) = ${metric(2e8, 'W', 3)}`);
console.log(`metric(220e-6, 'F', 3) = ${metric(220e-6, 'F', 3)}`);

// Test naturalList - natural list formatting
console.log("\n=== Natural List Tests ===");
console.log(`naturalList(['one', 'two', 'three']) = ${naturalList(['one', 'two', 'three'])}`);
console.log(`naturalList(['one', 'two']) = ${naturalList(['one', 'two'])}`);
console.log(`naturalList(['one']) = ${naturalList(['one'])}`);

console.log("\n=== All tests completed ===");
