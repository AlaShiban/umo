import { Lrucache, init } from '../umo_modules/cachetools/index.js';

async function test() {
  console.log('Testing cachetools module...\n');

  // Initialize
  await init();

  // Test LRU Cache (Least Recently Used)
  console.log('LRU Cache tests:');

  // Create an LRU cache with maxsize=3
  const cache = new Lrucache(3, null);

  // Add items using setdefault
  console.log('Adding items to cache with setdefault...');
  console.log(`  setdefault("key1", "value1"): ${cache.setdefault("key1", "value1")}`);
  console.log(`  setdefault("key2", "value2"): ${cache.setdefault("key2", "value2")}`);
  console.log(`  setdefault("key3", "value3"): ${cache.setdefault("key3", "value3")}`);

  // Retrieve items with get
  console.log('\nRetrieving items with get:');
  console.log(`  get("key1"): ${cache.get("key1", null)}`);
  console.log(`  get("key2"): ${cache.get("key2", null)}`);
  console.log(`  get("key3"): ${cache.get("key3", null)}`);
  console.log(`  get("nonexistent", "DEFAULT"): ${cache.get("nonexistent", "DEFAULT")}`);

  // Add a 4th item - LRU should evict key1 (least recently used)
  console.log('\nAdding key4 (cache is at capacity, should evict LRU):');
  cache.setdefault("key4", "value4");

  // key1 should be evicted, key2-4 should remain
  console.log(`  get("key1", "EVICTED"): ${cache.get("key1", "EVICTED")}`);
  console.log(`  get("key2"): ${cache.get("key2", null)}`);
  console.log(`  get("key3"): ${cache.get("key3", null)}`);
  console.log(`  get("key4"): ${cache.get("key4", null)}`);

  // Test pop - removes and returns value
  console.log('\nPop test:');
  const popped = cache.pop("key2", "default");
  console.log(`  pop("key2"): ${popped}`);
  console.log(`  get("key2", "GONE"): ${cache.get("key2", "GONE")}`);

  // Test clear
  console.log('\nClear test:');
  cache.clear();
  console.log(`  get("key3", "CLEARED"): ${cache.get("key3", "CLEARED")}`);
  console.log(`  get("key4", "CLEARED"): ${cache.get("key4", "CLEARED")}`);

  console.log('\n✓ All cachetools tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
