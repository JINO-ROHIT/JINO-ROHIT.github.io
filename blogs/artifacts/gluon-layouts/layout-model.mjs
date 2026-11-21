// Element ownership for the single-CTA BlockedLayout examples in this article.
// The numbered slots are logical values, not physical VGPR numbers.
export const matrix = { shape: [16, 32], size: [1, 2], threads: [8, 8], warps: [2, 2], order: [1, 0] };
export const loadA = { shape: [64, 32], size: [1, 8], threads: [16, 4], warps: [4, 1], order: [1, 0] };
export const loadB = { shape: [32, 64], size: [8, 1], threads: [4, 16], warps: [1, 4], order: [0, 1] };
const product = values => values.reduce((a, b) => a * b, 1);

export function coordinates(index, factors, order) {
  const result = factors.map(() => 0);
  for (const dim of order) {
    result[dim] = index % factors[dim];
    index = Math.floor(index / factors[dim]);
  }
  return result;
}

export function elements(layout, wave, lane) {
  const { shape, size, threads, warps, order } = layout;
  const base = size.map((s, d) => s * threads[d] * warps[d]);
  const repeats = shape.map((n, d) => Math.max(1, n / base[d]));
  const lc = coordinates(lane, threads, order);
  const wc = coordinates(wave, warps, order);
  const result = [], seen = new Set();
  for (let tile = 0; tile < product(repeats); tile++) {
    const tc = coordinates(tile, repeats, order);
    for (let slot = 0; slot < product(size); slot++) {
      const sc = coordinates(slot, size, order);
      const value = shape.map((n, d) => ((wc[d] * threads[d] + lc[d]) * size[d] + sc[d] + tc[d] * base[d]) % n);
      if (!seen.has(value.join(','))) {
        seen.add(value.join(',')); result.push(value);
      }
    }
  }
  return result;
}

export function owners(layout) {
  const result = new Map();
  for (let wave = 0; wave < product(layout.warps); wave++) {
    for (let lane = 0; lane < product(layout.threads); lane++) {
      elements(layout, wave, lane).forEach((coord, slot) => {
        const key = coord.join(',');
        if (!result.has(key)) result.set(key, []);
        result.get(key).push({ wave, lane, slot });
      });
    }
  }
  return result;
}
