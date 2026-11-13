import assert from 'node:assert/strict';
import { laneElements, ldsFootprint, STAGES, TRACE_STEPS, COMPONENTS } from './dist/data.js';

// Known default-modifier coordinates from AMD's gfx942 matrix calculator.
assert.deepEqual(laneElements(0), {
  a: [[0,0],[0,1],[0,2],[0,3]],
  b: [[0,0],[1,0],[2,0],[3,0]],
  d: [[0,0],[1,0],[2,0],[3,0]],
});
assert.deepEqual(laneElements(63).d, [[12,15],[13,15],[14,15],[15,15]]);
// Each of the 256 coordinates in each operand has exactly one owner.
for (const matrix of ['a','b','d']) {
  const coordinates = Array.from({length:64},(_,lane)=>laneElements(lane)[matrix]).flat();
  assert.equal(coordinates.length,256);
  assert.equal(new Set(coordinates.map(([r,c])=>`${r},${c}`)).size,256);
  assert(coordinates.every(([r,c])=>r>=0&&r<16&&c>=0&&c<16));
}
assert.deepEqual(ldsFootprint(128,128,32,2),{bytes:32768,kib:32,capacity:65536,groups:2,fits:true});
assert.equal(ldsFootprint(128,128,64,2).groups,1);
assert.equal(ldsFootprint(256,256,128,4).fits,false);
assert(STAGES.every(stage=>COMPONENTS[stage.info]));
assert(TRACE_STEPS.every(step=>step.path.every(component=>COMPONENTS[component])));
console.log('MFMA coordinate ownership and LDS capacity checks passed.');
