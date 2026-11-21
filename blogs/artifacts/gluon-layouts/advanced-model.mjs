// CPU models for the exact, version-3 examples discussed in the article.
// Linear bases map input bits to coordinates through bitwise XOR.
export function xorBases(bases, index) {
  const out = bases[0]?.map(() => 0) ?? [0, 0];
  bases.forEach((basis, bit) => {
    if ((index >>> bit) & 1) basis.forEach((n, dim) => { out[dim] ^= n; });
  });
  return out;
}

export function linearCoordinate(parameters, reg, lane, wave) {
  const inputs = [xorBases(parameters.reg_bases, reg),
    xorBases(parameters.lane_bases, lane), xorBases(parameters.warp_bases, wave)];
  return parameters.shape.map((_, dim) => inputs.reduce((n, value) => n ^ value[dim], 0));
}

export function paddedOffset(q, pairs = [[512, 16]]) {
  return q + pairs.reduce((sum, [interval, padding]) => sum + Math.floor(q / interval) * padding, 0);
}

export function swizzledFast(slow, fast, vec = 8, perPhase = 2, maxPhase = 8) {
  const phase = Math.floor(slow / perPhase) % maxPhase;
  return (Math.floor(fast / vec) ^ phase) * vec + fast % vec;
}

// 16x16 FP32 accumulator tile, transposed=True, with four waves in a 2x2 grid.
export function mfmaOutputs(wave, lane, rows = 256, columns = 256) {
  const result = [];
  for (let rowTile = 0; rowTile < rows / 32; rowTile++) {
    for (let colTile = 0; colTile < columns / 32; colTile++) {
      for (let slot = 0; slot < 4; slot++) result.push([
        lane % 16 + Math.floor(wave / 2) * 16 + rowTile * 32,
        Math.floor(lane / 16) * 4 + (wave % 2) * 16 + colTile * 32 + slot,
      ]);
    }
  }
  return result;
}

// DotOperandLayout with that MFMA parent; kWidth groups may span multiple instructions.
export function operandValues(op, kWidth, wave, lane, nonK = 256, kSize = 64) {
  const result = [];
  const waveOffset = (op === 0 ? Math.floor(wave / 2) : wave % 2) * 16;
  for (let outer = 0; outer < nonK / 32; outer++) {
    for (let chunk = 0; chunk < kSize / (4 * kWidth); chunk++) {
      for (let slot = 0; slot < kWidth; slot++) {
        const n = lane % 16 + waveOffset + outer * 32;
        const k = Math.floor(lane / 16) * kWidth + chunk * (4 * kWidth) + slot;
        result.push(op === 0 ? [n, k] : [k, n]);
      }
    }
  }
  return result;
}
