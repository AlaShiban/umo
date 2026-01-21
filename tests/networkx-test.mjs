/**
 * Test fixture for networkx module
 * Validates that Python packages with native extensions work seamlessly
 * Tests stateful graph operations through the clean API
 *
 * Run with: node --test tests/networkx-test.mjs
 *
 * Prerequisites:
 * - Run: npm install
 * - Run: node dist/cli.js pip-install networkx --skip-validation
 */

import assert from 'node:assert';
import { describe, it, before } from 'node:test';

describe('umo_modules/networkx', () => {
  let nx;

  before(async function() {
    // Skip if networkx module not yet installed
    try {
      nx = await import('../umo_modules/networkx/index.js');
      await nx.init();
    } catch (e) {
      console.log('Skipping tests: networkx module not installed');
      console.log('Run: node dist/cli.js pip-install networkx --skip-validation');
      console.log('Error:', e.message);
      this.skip();
    }
  });

  describe('Module initialization', () => {
    it('should report as initialized after init()', () => {
      assert.strictEqual(nx.isInitialized(), true);
    });

    it('should have all expected exports', () => {
      // Core functions
      assert.ok(typeof nx.init === 'function', 'init should be a function');
      assert.ok(typeof nx.isInitialized === 'function', 'isInitialized should be a function');

      // Graph creation functions
      assert.ok(typeof nx.fromEdgelist === 'function', 'fromEdgelist should be a function');
      assert.ok(typeof nx.fromDictOfDicts === 'function', 'fromDictOfDicts should be a function');
      assert.ok(typeof nx.fromDictOfLists === 'function', 'fromDictOfLists should be a function');

      // Graph conversion functions
      assert.ok(typeof nx.toEdgelist === 'function', 'toEdgelist should be a function');
      assert.ok(typeof nx.toDictOfDicts === 'function', 'toDictOfDicts should be a function');
      assert.ok(typeof nx.toDictOfLists === 'function', 'toDictOfLists should be a function');

      // Graph manipulation functions
      assert.ok(typeof nx.relabelNodes === 'function', 'relabelNodes should be a function');
      assert.ok(typeof nx.convertNodeLabelsToIntegers === 'function', 'convertNodeLabelsToIntegers should be a function');
    });
  });

  describe('Graph creation from edge list', () => {
    it('should create a graph from edge list', async () => {
      // Create a simple triangle graph: 1-2-3-1
      const edges = [[1, 2], [2, 3], [3, 1]];
      const G = await nx.fromEdgelist(edges);

      // Convert back to edge list to verify
      const resultEdges = await nx.toEdgelist(G);
      assert.ok(Array.isArray(resultEdges), 'Result should be an array');
      assert.strictEqual(resultEdges.length, 3, 'Should have 3 edges');
    });

    it('should create a graph with string node labels', async () => {
      const edges = [['a', 'b'], ['b', 'c'], ['c', 'a']];
      const G = await nx.fromEdgelist(edges);

      const resultEdges = await nx.toEdgelist(G);
      assert.strictEqual(resultEdges.length, 3, 'Should have 3 edges');

      // Verify nodes are strings
      const nodeSet = new Set();
      for (const edge of resultEdges) {
        nodeSet.add(edge[0]);
        nodeSet.add(edge[1]);
      }
      assert.ok(nodeSet.has('a'), 'Should contain node a');
      assert.ok(nodeSet.has('b'), 'Should contain node b');
      assert.ok(nodeSet.has('c'), 'Should contain node c');
    });

    it('should create a larger graph', async () => {
      // Create a path graph: 1-2-3-4-5
      const edges = [[1, 2], [2, 3], [3, 4], [4, 5]];
      const G = await nx.fromEdgelist(edges);

      const resultEdges = await nx.toEdgelist(G);
      assert.strictEqual(resultEdges.length, 4, 'Should have 4 edges');
    });
  });

  describe('Graph creation from dictionary of lists', () => {
    it('should create a graph from adjacency dict', async () => {
      // Create graph: node 1 connected to 2,3; node 2 connected to 3
      const adjDict = {
        1: [2, 3],
        2: [1, 3],
        3: [1, 2]
      };
      const G = await nx.fromDictOfLists(adjDict);

      // Convert to dict of lists to verify
      const result = await nx.toDictOfLists(G);
      assert.ok(result, 'Should return adjacency dict');
      assert.ok('1' in result || 1 in result, 'Should have node 1');
    });

    it('should preserve graph structure', async () => {
      const adjDict = {
        'a': ['b'],
        'b': ['a', 'c'],
        'c': ['b']
      };
      const G = await nx.fromDictOfLists(adjDict);

      const result = await nx.toDictOfLists(G);

      // Node 'b' should be connected to both 'a' and 'c'
      const bNeighbors = result['b'] || result.b;
      assert.ok(Array.isArray(bNeighbors), 'b neighbors should be an array');
      assert.strictEqual(bNeighbors.length, 2, 'b should have 2 neighbors');
    });
  });

  describe('Graph creation from dictionary of dictionaries', () => {
    it('should create a weighted graph', async () => {
      // Create weighted graph with edge weights
      const adjDict = {
        1: { 2: { weight: 1.5 }, 3: { weight: 2.0 } },
        2: { 1: { weight: 1.5 }, 3: { weight: 0.5 } },
        3: { 1: { weight: 2.0 }, 2: { weight: 0.5 } }
      };
      const G = await nx.fromDictOfDicts(adjDict);

      // Convert back and verify structure
      const result = await nx.toDictOfDicts(G);
      assert.ok(result, 'Should return adjacency dict of dicts');
    });
  });

  describe('Node relabeling', () => {
    it('should relabel nodes with a mapping', async () => {
      // Create graph with string nodes (JS object keys are always strings)
      const edges = [['1', '2'], ['2', '3']];
      const G = await nx.fromEdgelist(edges);

      // Relabel nodes: '1'->a, '2'->b, '3'->c
      // Note: In JS, { 1: 'a' } becomes { '1': 'a' }, so use string keys
      const mapping = { '1': 'a', '2': 'b', '3': 'c' };
      const H = await nx.relabelNodes(G, mapping);

      // Verify new labels
      const resultEdges = await nx.toEdgelist(H);
      const nodeSet = new Set();
      for (const edge of resultEdges) {
        nodeSet.add(edge[0]);
        nodeSet.add(edge[1]);
      }

      assert.ok(nodeSet.has('a'), 'Should contain relabeled node a');
      assert.ok(nodeSet.has('b'), 'Should contain relabeled node b');
      assert.ok(nodeSet.has('c'), 'Should contain relabeled node c');
      assert.ok(!nodeSet.has('1'), 'Should not contain original node 1');
    });

    it('should preserve edge count after relabeling', async () => {
      const edges = [[1, 2], [2, 3], [3, 4], [4, 1]];
      const G = await nx.fromEdgelist(edges);

      const mapping = { 1: 'w', 2: 'x', 3: 'y', 4: 'z' };
      const H = await nx.relabelNodes(G, mapping);

      const originalEdges = await nx.toEdgelist(G);
      const relabeledEdges = await nx.toEdgelist(H);

      assert.strictEqual(relabeledEdges.length, originalEdges.length,
        'Edge count should be preserved after relabeling');
    });
  });

  describe('Convert node labels to integers', () => {
    it('should convert string labels to integers', async () => {
      // Create graph with string nodes
      const edges = [['a', 'b'], ['b', 'c'], ['c', 'a']];
      const G = await nx.fromEdgelist(edges);

      // Convert to integer labels
      const H = await nx.convertNodeLabelsToIntegers(G);

      // Verify all nodes are now integers
      const resultEdges = await nx.toEdgelist(H);
      for (const edge of resultEdges) {
        assert.strictEqual(typeof edge[0], 'number', 'Source should be number');
        assert.strictEqual(typeof edge[1], 'number', 'Target should be number');
      }
    });

    it('should start from specified first_label', async () => {
      const edges = [['x', 'y'], ['y', 'z']];
      const G = await nx.fromEdgelist(edges);

      // Convert with first_label=10
      const H = await nx.convertNodeLabelsToIntegers(G, 10);

      const resultEdges = await nx.toEdgelist(H);
      const nodeSet = new Set();
      for (const edge of resultEdges) {
        nodeSet.add(edge[0]);
        nodeSet.add(edge[1]);
      }

      // All nodes should be >= 10
      for (const node of nodeSet) {
        assert.ok(node >= 10, `Node ${node} should be >= 10`);
      }
    });
  });

  describe('Stateful operations', () => {
    it('should maintain state across multiple operations', async () => {
      // Create initial graph with string nodes (JS object keys are always strings)
      const edges = [['1', '2'], ['2', '3'], ['3', '4']];
      const G = await nx.fromEdgelist(edges);

      // First transformation: relabel
      // Note: In JS, { 1: 'start' } becomes { '1': 'start' }, so use string keys
      const mapping1 = { '1': 'start', '4': 'end' };
      const H1 = await nx.relabelNodes(G, mapping1);

      // Verify first transformation
      const h1Edges = await nx.toEdgelist(H1);
      const h1Nodes = new Set();
      for (const edge of h1Edges) {
        h1Nodes.add(edge[0]);
        h1Nodes.add(edge[1]);
      }
      assert.ok(h1Nodes.has('start'), 'Should have start node');
      assert.ok(h1Nodes.has('end'), 'Should have end node');

      // Second transformation: convert to integers
      const H2 = await nx.convertNodeLabelsToIntegers(H1);

      // Verify second transformation
      const h2Edges = await nx.toEdgelist(H2);
      for (const edge of h2Edges) {
        assert.strictEqual(typeof edge[0], 'number', 'All nodes should be numbers');
        assert.strictEqual(typeof edge[1], 'number', 'All nodes should be numbers');
      }

      // Verify edge count preserved through transformations
      assert.strictEqual(h2Edges.length, edges.length, 'Edge count should be preserved');
    });

    it('should handle multiple graphs independently', async () => {
      // Create two separate graphs
      const G1 = await nx.fromEdgelist([[1, 2], [2, 3]]);
      const G2 = await nx.fromEdgelist([['a', 'b'], ['b', 'c'], ['c', 'd']]);

      // Verify they are independent
      const g1Edges = await nx.toEdgelist(G1);
      const g2Edges = await nx.toEdgelist(G2);

      assert.strictEqual(g1Edges.length, 2, 'G1 should have 2 edges');
      assert.strictEqual(g2Edges.length, 3, 'G2 should have 3 edges');

      // Modify G1, verify G2 unchanged
      const G1Modified = await nx.relabelNodes(G1, { 1: 100, 2: 200, 3: 300 });
      const g1ModEdges = await nx.toEdgelist(G1Modified);
      const g2EdgesAfter = await nx.toEdgelist(G2);

      // G2 should still have string nodes
      const g2Nodes = new Set();
      for (const edge of g2EdgesAfter) {
        g2Nodes.add(edge[0]);
        g2Nodes.add(edge[1]);
      }
      assert.ok(g2Nodes.has('a'), 'G2 should still have node a');
      assert.ok(g2Nodes.has('d'), 'G2 should still have node d');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty edge list', async () => {
      const G = await nx.fromEdgelist([]);
      const edges = await nx.toEdgelist(G);
      assert.strictEqual(edges.length, 0, 'Empty graph should have 0 edges');
    });

    it('should handle self-loops', async () => {
      const edges = [[1, 1], [1, 2]];  // Self-loop on node 1
      const G = await nx.fromEdgelist(edges);

      const result = await nx.toEdgelist(G);
      assert.strictEqual(result.length, 2, 'Should preserve self-loop');

      // Find the self-loop
      const selfLoop = result.find(e => e[0] === e[1]);
      assert.ok(selfLoop, 'Should contain self-loop');
    });

    it('should handle disconnected components', async () => {
      // Two disconnected triangles
      const edges = [
        [1, 2], [2, 3], [3, 1],  // First triangle
        [4, 5], [5, 6], [6, 4]   // Second triangle (disconnected)
      ];
      const G = await nx.fromEdgelist(edges);

      const result = await nx.toEdgelist(G);
      assert.strictEqual(result.length, 6, 'Should have all 6 edges');

      // Verify both components exist
      const nodeSet = new Set();
      for (const edge of result) {
        nodeSet.add(edge[0]);
        nodeSet.add(edge[1]);
      }
      assert.strictEqual(nodeSet.size, 6, 'Should have 6 nodes');
    });

    it('should handle large node labels', async () => {
      const edges = [[1000000, 2000000], [2000000, 3000000]];
      const G = await nx.fromEdgelist(edges);

      const result = await nx.toEdgelist(G);
      const nodeSet = new Set();
      for (const edge of result) {
        nodeSet.add(edge[0]);
        nodeSet.add(edge[1]);
      }

      assert.ok(nodeSet.has(1000000), 'Should handle large numeric labels');
      assert.ok(nodeSet.has(3000000), 'Should handle large numeric labels');
    });
  });

  describe('Round-trip conversions', () => {
    it('should preserve structure in edgelist round-trip', async () => {
      const originalEdges = [[1, 2], [2, 3], [3, 1], [1, 4]];

      // Create graph
      const G = await nx.fromEdgelist(originalEdges);

      // Convert back to edgelist
      const resultEdges = await nx.toEdgelist(G);

      // Same number of edges
      assert.strictEqual(resultEdges.length, originalEdges.length,
        'Should have same number of edges');

      // Create sets for comparison (order may differ)
      const originalSet = new Set(originalEdges.map(e => `${e[0]}-${e[1]}`));
      const resultSet = new Set(resultEdges.map(e => `${e[0]}-${e[1]}`));

      // In undirected graph, we might get reverse edges, so check both directions
      for (const edge of originalEdges) {
        const forward = `${edge[0]}-${edge[1]}`;
        const reverse = `${edge[1]}-${edge[0]}`;
        assert.ok(resultSet.has(forward) || resultSet.has(reverse),
          `Edge ${forward} should exist`);
      }
    });

    it('should preserve structure in dict-of-lists round-trip', async () => {
      const originalDict = {
        1: [2, 3],
        2: [1, 3],
        3: [1, 2]
      };

      const G = await nx.fromDictOfLists(originalDict);
      const result = await nx.toDictOfLists(G);

      // Check that all nodes exist
      assert.ok('1' in result || 1 in result, 'Node 1 should exist');
      assert.ok('2' in result || 2 in result, 'Node 2 should exist');
      assert.ok('3' in result || 3 in result, 'Node 3 should exist');
    });
  });
});

// Summary output
console.log('\n📦 umo_modules/networkx test fixture');
console.log('   Tests graph creation, manipulation, and state');
console.log('   Uses clean JS API with native types\n');
