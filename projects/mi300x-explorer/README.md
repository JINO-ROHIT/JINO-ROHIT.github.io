# Inside the MI300X

The full article is [Inside the MI300X (Part 2): From Compute Units to a Gluon GEMM](../../blogs/20_mi300x_gemm.html), with this explorer embedded as its architecture map, worked resource budgets, and a [downloadable GEMM example](../../blogs/artifacts/mi300x/gemm.py).

A static, interactive architecture atlas by Jino Rohit. Read follows the package → XCD → CU → wave → MFMA hierarchy. Explore provides component inspection and exact lane ownership for one matrix instruction. Trace illustrates a tiled matmul's memory operations.

Serve the static directory locally:

```sh
python3 -m http.server 8768 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8768`. There is no install or build step. Three.js 0.170.0 and OrbitControls are vendored under `dist/vendor/`, with their MIT license. Fonts load from Google Fonts with system fallbacks.

```sh
node --check dist/app.js
node --check dist/data.js
node test-data.mjs
```

The model describes MI300X / CDNA 3 / gfx942. Geometry, routing, particles, and animation timing are illustrative. Resource counts are sourced in the application. MFMA lane ownership is specific to `v_mfma_f32_16x16x16_f16`, default modifiers, and was checked against AMD's Matrix Instruction Calculator. The LDS calculator is a capacity bound; it does not predict occupancy or execution performance.

Deep links use `#read/package`, `#explore/mfma`, or `#trace/memory/3`. The application has no backend or stored personal data. A 2D component fallback is available if WebGL cannot initialize.

Visual interaction was inspired by [Levi Diamode's H100 explorer](https://www.levidiamode.com/projects/h100). Content, implementation, and geometry here were created for MI300X. Independent educational project; no AMD or NVIDIA affiliation.
