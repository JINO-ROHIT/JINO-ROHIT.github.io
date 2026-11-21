import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linearCoordinate, xorBases, paddedOffset, swizzledFast, mfmaOutputs, operandValues } from './advanced-model.mjs';
import { elements, owners } from './layout-model.mjs';
const catalog = JSON.parse(readFileSync(new URL('./kernel-layouts.json', import.meta.url)));
const defs = catalog.layouts;
const page = readFileSync(new URL('../../21_gluon_layouts.html', import.meta.url), 'utf8');
assert.equal(catalog.layout_classes.length, 7);
assert(!/version\s*=\s*4/.test(page));
const A = defs.linearA.parameters, B = defs.linearB.parameters;
// The introductory linear layout must exactly match the familiar blocked layout.
const vector = {reg_bases:[[1]],lane_bases:[[2],[4],[8],[16],[32],[64]],warp_bases:[[128],[256]],block_bases:[],shape:[512]};
const blockedVector = {shape:[512],size:[2],threads:[64],warps:[4],order:[0]};
for(let w=0;w<4;w++) for(let l=0;l<64;l++) for(let r=0;r<2;r++) {
  assert.deepEqual(linearCoordinate(vector,r,l,w),elements(blockedVector,w,l)[r]);
}
assert.deepEqual(xorBases(vector.lane_bases,5),[10]);
assert.deepEqual(linearCoordinate(vector,1,5,2),[267]);
const swapped = {...vector,lane_bases:[[2],[8],[4],[16],[32],[64]]};
assert.deepEqual(linearCoordinate(swapped,0,2,0),[8]);
assert.deepEqual(linearCoordinate(swapped,0,4,0),[4]);
const swappedIndices = new Set();
for(let w=0;w<4;w++) for(let l=0;l<64;l++) for(let r=0;r<2;r++) swappedIndices.add(linearCoordinate(swapped,r,l,w)[0]);
assert.equal(swappedIndices.size,512);
// Overlapping masks explain why the operation is XOR rather than integer addition.
const overlap = {...vector,lane_bases:[[2],[6],[8],[16],[32],[64]]};
assert.deepEqual(linearCoordinate(overlap,0,1,0),[2]);
assert.deepEqual(linearCoordinate(overlap,0,2,0),[6]);
assert.deepEqual(linearCoordinate(overlap,0,3,0),[4]);
assert.equal(2 ^ 6,4);
assert.equal(2 + 6,8);
assert.deepEqual(linearCoordinate(overlap,0,4,0),[8]);
const overlapIndices=new Set();
for(let w=0;w<4;w++) for(let l=0;l<64;l++) for(let r=0;r<2;r++) overlapIndices.add(linearCoordinate(overlap,r,l,w)[0]);
assert.equal(overlapIndices.size,512);
assert.deepEqual([5,2,1].map((n,i)=>n.toString(2).padStart([6,2,1][i],'0')),['000101','10','1']);
assert.equal((256 ^ 10 ^ 1).toString(2).padStart(9,'0'),'100001011');
assert.equal((4 ^ 32 ^ 2).toString(2).padStart(8,'0'),'00100110');
assert.equal((1 ^ 8 ^ 0).toString(2).padStart(6,'0'),'001001');
for (const p of [A, B]) {
  const seen = new Set();
  for (let w=0;w<4;w++) for (let l=0;l<64;l++) for (let r=0;r<64;r++) {
    const coord = linearCoordinate(p,r,l,w);
    assert(coord.every((v,d)=>v>=0 && v<p.shape[d]));
    seen.add(coord.join(','));
  }
  assert.equal(seen.size,16384);
}
assert.deepEqual(linearCoordinate(A,9,17,2),[38,9]);
assert.deepEqual(linearCoordinate(B,9,17,2),[9,38]);
assert.deepEqual(linearCoordinate(A,0,0,1),[1,0]);
// Both the row remapping and padding examples are derived from the source snapshot.
for (const key of ['paddedA','paddedB']) {
  const p = defs[key].parameters, coords = new Set(), physical = new Set();
  for (let q=0;q<16384;q++) {
    coords.add(xorBases(p.offset_bases,q).join(','));
    physical.add(paddedOffset(q,p.interval_padding_pairs));
  }
  assert.equal(coords.size,16384); assert.equal(physical.size,16384);
}
assert.deepEqual(xorBases(defs.paddedA.parameters.offset_bases,64),[16,0]);
assert.deepEqual(xorBases(defs.paddedA.parameters.offset_bases,512),[1,0]);
assert.equal(paddedOffset(511),511); assert.equal(paddedOffset(512),528);
assert.equal(paddedOffset(1024),1056);
for (let row=0;row<256;row++) {
  const positions = Array.from({length:64},(_,k)=>swizzledFast(row,k));
  assert.equal(new Set(positions).size,64);
  assert(positions.every(k=>k>=0&&k<64));
  positions.forEach((p,k)=>assert.equal(swizzledFast(row,p),k));
}
assert.equal(swizzledFast(2,0),8); assert.equal(swizzledFast(2,8),0);
assert.equal(swizzledFast(4,0),16); assert.equal(swizzledFast(16,0),0);
assert.equal(swizzledFast(37,23,1,1,1),23);
const output = new Set();
for (let w=0;w<4;w++) for (let l=0;l<64;l++) {
  const values=mfmaOutputs(w,l); assert.equal(values.length,256);
  values.forEach(c=>output.add(c.join(',')));
}
assert.equal(output.size,65536);
assert.deepEqual(mfmaOutputs(0,17).slice(0,4),[[1,4],[1,5],[1,6],[1,7]]);
for (const width of [4,8]) for (const op of [0,1]) {
  const uses=new Map();
  for (let w=0;w<4;w++) for (let l=0;l<64;l++) {
    const values=operandValues(op,width,w,l); assert.equal(values.length,128);
    for (const coord of values) {const key=coord.join(',');uses.set(key,(uses.get(key)||0)+1);}
  }
  assert.equal(uses.size,16384); assert([...uses.values()].every(n=>n===2));
}
assert.deepEqual(operandValues(0,4,0,17).slice(0,4),[[1,4],[1,5],[1,6],[1,7]]);
assert.deepEqual(operandValues(0,8,0,17).slice(0,8),Array.from({length:8},(_,i)=>[1,8+i]));
const p = defs.storeC.parameters;
const store = {shape:[256,256],size:p.size_per_thread,threads:p.threads_per_warp,warps:p.warps_per_cta,order:p.order};
assert.equal(owners(store).size,65536);
assert.equal(elements(store,2,17).length,256);
assert.deepEqual(elements(store,2,17).slice(0,8),Array.from({length:8},(_,i)=>[4,136+i]));
assert.equal(defs.mfma3.parameters.version,3);
console.log('Linear bases, XOR overlaps, swizzling, padding, MFMA, both operand widths, and output store ownership passed.');
