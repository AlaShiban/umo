/**
 * Test pandas Pyodide integration
 *
 * Tests basic pandas functionality using Pyodide runtime.
 */

import * as pd from '../umo_modules/pandas/index.js';

async function testPandas() {
  console.log('Testing pandas integration...\n');

  // Test 1: Basic initialization
  console.log('1. Testing module initialization...');
  await pd.init();
  console.log('   Module initialized:', pd.isInitialized());

  // Test 2: isna/isnull functions
  console.log('\n2. Testing isna/isnull...');
  const isNaResult = await pd.isna(null);
  console.log('   isna(null):', isNaResult);

  // Test 3: DataFrame creation
  console.log('\n3. Testing DataFrame creation...');
  const df = await pd.DataFrame.create({
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'city': ['NYC', 'LA', 'Chicago']
  });
  console.log('   DataFrame created successfully');

  // Test 4: concat function
  console.log('\n4. Testing concat...');
  const df1 = await pd.DataFrame.create({ 'A': [1, 2], 'B': [3, 4] });
  const df2 = await pd.DataFrame.create({ 'A': [5, 6], 'B': [7, 8] });
  const concatenated = await pd.concat([df1, df2]);
  console.log('   Concatenated DataFrame created');

  // Test 5: cut function for binning
  console.log('\n5. Testing cut (binning)...');
  const ages = [22, 27, 33, 42, 55, 68];
  const bins = [0, 18, 30, 50, 70, 100];
  const labels = ['kid', 'young', 'adult', 'middle', 'senior'];
  const ageGroups = await pd.cut(ages, bins, true, labels);
  console.log('   Age groups created');

  // Test 6: merge function
  console.log('\n6. Testing merge...');
  const dfLeft = await pd.DataFrame.create({
    'key': ['A', 'B', 'C'],
    'value1': [1, 2, 3]
  });
  const dfRight = await pd.DataFrame.create({
    'key': ['A', 'B', 'D'],
    'value2': [4, 5, 6]
  });
  const merged = await pd.merge(dfLeft, dfRight, 'inner', 'key');
  console.log('   Merged DataFrame created');

  // Test 7: date_range function
  console.log('\n7. Testing dateRange...');
  const dates = await pd.dateRange('2024-01-01', '2024-01-10');
  console.log('   Date range created');

  // Test 8: getDummies function (one-hot encoding)
  console.log('\n8. Testing getDummies (one-hot encoding)...');
  const categories = ['apple', 'banana', 'apple', 'orange', 'banana'];
  const dummies = await pd.getDummies(categories);
  console.log('   One-hot encoding created');

  console.log('\n=== All pandas tests passed! ===\n');
}

testPandas().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
