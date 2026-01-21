import { Engine, init } from '../umo_modules/inflect/index.js';

async function test() {
  console.log('Testing inflect module...\n');

  // Initialize
  await init();

  // Create an engine instance
  const engine = new Engine();

  // Test plural
  console.log('Plural tests:');
  console.log(`  plural("child", 2): "${engine.plural("child", 2)}"`);
  console.log(`  plural("goose", 2): "${engine.plural("goose", 2)}"`);
  console.log(`  plural("octopus", 2): "${engine.plural("octopus", 2)}"`);
  console.log(`  plural("person", 2): "${engine.plural("person", 2)}"`);

  // Test ordinal
  console.log('\nOrdinal tests:');
  console.log(`  ordinal(1): "${engine.ordinal(1)}"`);
  console.log(`  ordinal(2): "${engine.ordinal(2)}"`);
  console.log(`  ordinal(3): "${engine.ordinal(3)}"`);
  console.log(`  ordinal(42): "${engine.ordinal(42)}"`);

  // Test indefinite article
  console.log('\nIndefinite article tests:');
  console.log(`  a("apple", 1): "${engine.a("apple", 1)}"`);
  console.log(`  a("banana", 1): "${engine.a("banana", 1)}"`);
  console.log(`  a("umbrella", 1): "${engine.a("umbrella", 1)}"`);
  console.log(`  a("university", 1): "${engine.a("university", 1)}"`);

  // Test singular noun
  console.log('\nSingular noun tests:');
  console.log(`  singularNoun("children", 1): "${engine.singularNoun("children", 1)}"`);
  console.log(`  singularNoun("geese", 1): "${engine.singularNoun("geese", 1)}"`);
  console.log(`  singularNoun("mice", 1): "${engine.singularNoun("mice", 1)}"`);

  // Test compare
  console.log('\nCompare tests:');
  console.log(`  compare("egg", "eggs"): "${engine.compare("egg", "eggs")}"`);
  console.log(`  compare("child", "children"): "${engine.compare("child", "children")}"`);

  console.log('\n✓ All inflect tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
