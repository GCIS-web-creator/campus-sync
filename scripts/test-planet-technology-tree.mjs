import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlanetTechnologyBranchNodes,
  getPlanetTechnologyCatalog,
  getPlanetTechnologyCatalogCount,
  getPlanetTechnologyNode,
  getPlanetTechnologyNodeState,
  getPlanetTechnologyNodesForBranch,
  PLANET_TECHNOLOGY_ROOT_ID,
} from '../lib/planet-technology-tree.ts';

test('catalog contains more than one thousand stable, unique nodes', () => {
  assert.equal(getPlanetTechnologyCatalogCount(), 1314);
  const branches = getPlanetTechnologyBranchNodes();
  assert.equal(branches.length, 13);
  const ids = new Set();
  for (const branch of branches) {
    const nodes = getPlanetTechnologyNodesForBranch(branch.branchId);
    assert.equal(nodes.length, 100);
    for (const node of nodes) {
      assert.equal(ids.has(node.id), false, 'duplicate node id: ' + node.id);
      ids.add(node.id);
    }
  }
  assert.equal(ids.size, 1300);
});

test('the foundation research is the only available starting node', () => {
  const empty = new Set();
  const root = getPlanetTechnologyNode(PLANET_TECHNOLOGY_ROOT_ID);
  assert.ok(root);
  assert.equal(getPlanetTechnologyNodeState(root, 0, empty), 'available');
  const states = getPlanetTechnologyCatalog().map(node =>
    getPlanetTechnologyNodeState(node, 1, empty),
  );
  assert.deepEqual(states.filter(state => state === 'available'), ['available']);
  const branchStates = getPlanetTechnologyBranchNodes().map(node =>
    getPlanetTechnologyNodeState(node, 1, empty),
  );
  assert.equal(branchStates.filter(state => state === 'parent_locked').length, 3);
  assert.equal(branchStates.filter(state => state === 'stage_locked').length, 10);
});

test('branches become researchable only after the foundation and civilization gate', () => {
  const purchased = new Set([PLANET_TECHNOLOGY_ROOT_ID]);
  const branches = getPlanetTechnologyBranchNodes();
  const stageOne = branches.filter(node => getPlanetTechnologyNodeState(node, 1, purchased) === 'available');
  assert.equal(stageOne.length, 3);
  assert.ok(branches.some(node => getPlanetTechnologyNodeState(node, 1, purchased) === 'stage_locked'));
});

test('a technology line is sequential and never skips its previous level', () => {
  const branch = getPlanetTechnologyBranchNodes()[0];
  const nodes = getPlanetTechnologyNodesForBranch(branch.branchId)
    .filter(node => node.themeIndex === 0)
    .sort((a, b) => (a.level || 0) - (b.level || 0));
  assert.equal(nodes.length, 10);
  const purchased = new Set([PLANET_TECHNOLOGY_ROOT_ID, branch.id]);
  assert.equal(getPlanetTechnologyNodeState(nodes[0], 1, purchased), 'available');
  assert.equal(getPlanetTechnologyNodeState(nodes[1], 1, purchased), 'parent_locked');
  purchased.add(nodes[0].id);
  assert.equal(getPlanetTechnologyNodeState(nodes[1], 1, purchased), 'available');
});

test('purchased nodes remain purchased regardless of later stage or parent state', () => {
  const root = getPlanetTechnologyNode(PLANET_TECHNOLOGY_ROOT_ID);
  assert.ok(root);
  assert.equal(getPlanetTechnologyNodeState(root, 0, new Set([root.id])), 'purchased');
});
