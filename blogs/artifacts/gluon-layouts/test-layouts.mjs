import assert from 'node:assert/strict';
import { matrix, loadA, loadB, elements, owners } from './layout-model.mjs';

// Check full coverage, unique ownership, and bounds for every illustrated layout.
const layouts = [matrix, { ...matrix, order: [0, 1] }, loadA, loadB,
  ...[1, 2].flatMap(s => [256 * s, 1024].map(n => ({ shape: [n], size: [s], threads: [64], warps: [4], order: [0] })))];
for (const layout of layouts) {
  const mapping = owners(layout);
  assert.equal(mapping.size, layout.shape.reduce((a, b) => a * b, 1));
  for (const [key, entries] of mapping) {
    assert.equal(entries.length, 1, `duplicate owner for ${key}`);
    key.split(',').map(Number).forEach((value, dim) => assert(value >= 0 && value < layout.shape[dim]));
  }
}
// Hand-worked coordinates printed in the text and diagrams.
assert.deepEqual(elements(matrix, 3, 17), [[10, 18], [10, 19]]);
assert.deepEqual(elements({ ...matrix, order: [0, 1] }, 3, 17), [[9, 20], [9, 21]]);
assert.deepEqual(elements(loadA, 2, 17), Array.from({length: 8}, (_, i) => [36, 8 + i]));
assert.deepEqual(elements(loadB, 2, 17), Array.from({length: 8}, (_, i) => [8 + i, 36]));
assert.deepEqual(elements({shape:[1024],size:[1],threads:[64],warps:[4],order:[0]},0,0), [[0],[256],[512],[768]]);
// A flat load followed by reshape covers the same matrix, with different ownership.
const flatMatrix = {shape:[512],size:[2],threads:[64],warps:[4],order:[0]};
const flatCoords = (w,l) => elements(flatMatrix,w,l).map(([i])=>[Math.floor(i/32),i%32]);
assert.deepEqual(flatCoords(3,17), [[13,2],[13,3]]);
for (const lane of [16,17,18]) assert.deepEqual(elements(matrix,3,lane), [[10,16+(lane-16)*2],[10,17+(lane-16)*2]]);
const flatAddresses = [], parentAddresses = [];
for (let w=0;w<4;w++) for (let l=0;l<64;l++) {
  flatCoords(w,l).forEach(([r,c])=>flatAddresses.push(r*73+c*2));
  elements(matrix,w,l).forEach(([r,c])=>parentAddresses.push(r*73+c*2));
}
assert.deepEqual(flatAddresses.sort((a,b)=>a-b), parentAddresses.sort((a,b)=>a-b));
// A smaller tensor can replicate across waves; it does not shrink the launch.
const replicated = owners({shape:[64],size:[1],threads:[64],warps:[4],order:[0]});
assert.equal(replicated.size, 64);
assert([...replicated.values()].every(value => value.length === 4));
// Final vector-add example: all valid indices appear once, tail positions are masked.
const add = {shape:[512],size:[2],threads:[64],warps:[4],order:[0]};
const written = [];
for (let pid=0; pid<2; pid++) for (let w=0; w<4; w++) for (let l=0; l<64; l++) {
  for (const [local] of elements(add,w,l)) if (pid*512+local<700) written.push(pid*512+local);
}
assert.equal(new Set(written).size, 700);
assert.equal(written.length, 700);
assert.deepEqual(elements(add,1,29).map(([i])=>512+i), [698,699]);
assert.deepEqual(elements(add,1,30).map(([i])=>512+i), [700,701]);
console.log('All illustrated layouts: coverage, ownership, worked coordinates, replication, and tail masks passed.');
