export const SOURCES = {
  architecture: { name: 'AMD · MI300 microarchitecture', url: 'https://rocm.docs.amd.com/en/latest/reference/gpu-arch/mi300.html' },
  specifications: { name: 'AMD · Hardware specifications', url: 'https://rocm.docs.amd.com/en/docs-6.3.3/reference/gpu-arch-specs.html' },
  product: { name: 'AMD · MI300X specifications', url: 'https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html' },
  cu: { name: 'AMD · Compute unit performance model', url: 'https://rocm.docs.amd.com/projects/rocprofiler-compute/en/latest/conceptual/cdna/compute-unit.html' },
  matrix: { name: 'AMD · Matrix Instruction Calculator', url: 'https://github.com/ROCm/amd_matrix_instruction_calculator' },
  isa: { name: 'AMD · MI300 ISA reference', url: 'https://www.amd.com/content/dam/amd/en/documents/instinct-tech-docs/instruction-set-architectures/amd-instinct-mi300-cdna3-instruction-set-architecture.pdf' },
  partition: { name: 'AMD · GPU partitioning', url: 'https://rocm.docs.amd.com/projects/amdsmi/en/docs-7.14.0/conceptual/partition.html' },
};

export const STAGES = [
  { id: 'package', short: 'Package', kicker: 'THE ACCELERATOR PACKAGE', title: 'Eight dies. One device.', info: 'package' },
  { id: 'xcd', short: 'XCD', kicker: 'ONE ACCELERATOR COMPLEX DIE', title: '38 active compute units.', info: 'xcd' },
  { id: 'cu', short: 'CU', kicker: 'INSIDE A COMPUTE UNIT', title: 'The home of a workgroup.', info: 'cu' },
  { id: 'wave', short: 'Wave', kicker: 'ONE 64-THREAD WAVEFRONT', title: 'One instruction. Active lanes.', info: 'wave' },
  { id: 'mfma', short: 'MFMA', kicker: 'MATRIX FUSED MULTIPLY-ADD', title: 'A tile shared by 64 lanes.', info: 'mfma' },
  { id: 'memory', short: 'Memory', kicker: 'THE MEMORY HIERARCHY', title: 'Bring the data to the math.', info: 'hbm' },
];

export const COMPONENTS = {
  package: { title: 'MI300X accelerator', category: 'PACKAGE / CDNA 3', text: 'Eight XCD compute dies are stacked over four I/O dies. In SPX mode, their resources form one logical GPU. This scene is a conceptual organization of the package.', metrics: ['8 XCDs', '4 I/O dies', '304 active CUs', 'gfx942'], source: 'architecture', next: 'xcd' },
  xcd: { title: 'Accelerator Complex Die', category: 'COMPUTE CHIPLET', text: 'Each XCD contains 40 physical CUs with 38 active, plus a shared 4 MB L2 cache. Two XCDs sit above each I/O die. Disabled CU positions in this model are illustrative.', metrics: ['38 active CUs', '4 MB L2 / XCD', '32 KiB vector L1 / CU'], source: 'architecture', next: 'cu' },
  iod: { title: 'I/O die', category: 'MEMORY AND FABRIC INFRASTRUCTURE', text: 'The four I/O dies provide memory controllers, fabric connectivity, and the last-level cache infrastructure. Two XCD compute dies are stacked above each I/O die.', metrics: ['4 I/O dies', 'N6 process', '2 XCDs above each'], source: 'architecture' },
  hbm: { title: 'HBM3 memory', category: 'DEVICE MEMORY', text: 'Eight HBM3 stacks provide the advertised 192 GB device-memory capacity and up to 5.3 TB/s peak memory bandwidth. Physical address placement and traffic depend on the memory partition mode and workload.', metrics: ['8 stacks', '192 GB total', '5.3 TB/s peak'], source: 'product', next: 'memory' },
  cu: { title: 'Compute Unit', category: 'WORKGROUP EXECUTION', text: 'All waves of a workgroup are scheduled on one CU. Scalar, vector, memory, and matrix operations use its execution pipelines and local resources. The positions here describe roles rather than a physical floorplan.', metrics: ['64 KiB LDS', '512 KiB VGPR file', '4 matrix cores'], source: 'specifications', next: 'wave' },
  valu: { title: 'Vector execution', category: 'VALU / SIMD DOMAINS', text: 'Vector instructions operate on per-lane values in active lanes of a wave. A CU has four SIMD scheduling and vector-register domains. Wave width alone does not specify how many cycles an instruction takes.', metrics: ['64-lane waves', '4 SIMD domains'], source: 'cu', next: 'wave' },
  vgpr: { title: 'Vector registers', category: 'VGPR FILE', text: 'VGPRs hold values that may differ by lane, such as loaded tensor elements and intermediate results. MI300X provides 512 KiB of vector-register storage per CU. Actual allocation and live values affect residency.', metrics: ['512 KiB / CU', 'Per-lane values'], source: 'specifications' },
  sgpr: { title: 'Scalar execution and registers', category: 'SALU / SGPR FILE', text: 'Scalar instructions operate on wave-uniform values, including control and common address calculations. SGPRs hold a value shared by the wave, rather than a separate value for every lane.', metrics: ['12.5 KiB SGPR file / CU', 'Wave-uniform state'], source: 'specifications' },
  lds: { title: 'Local Data Share', category: 'SOFTWARE-MANAGED SCRATCHPAD', text: 'A CU provides 64 KiB of LDS for workgroups to share and reuse data. HIP declares shared storage with __shared__. Synchronization and memory layouts are still the kernel programmer’s responsibility.', metrics: ['64 KiB / CU', '32 banks', '4 bytes / bank'], source: 'specifications', next: 'memory' },
  matrix: { title: 'Matrix cores', category: 'MFMA EXECUTION', text: 'Four matrix cores per CU execute cooperative matrix arithmetic. MI300X has 1,216 matrix cores in total. An MFMA instruction consumes operands and produces accumulators distributed across a 64-lane wave.', metrics: ['4 matrix cores / CU', '1,216 / device', 'MFMA'], source: 'product', next: 'mfma' },
  wave: { title: '64-thread wavefront', category: 'CDNA 3 EXECUTION GROUP', text: 'Threads of a workgroup are grouped consecutively into 64-lane waves. An execution mask determines which lanes participate in vector instructions. The 8 × 8 arrangement is a readable diagram, not physical placement.', metrics: ['64 lanes', '64-bit EXEC mask'], source: 'isa' },
  mfma: { title: '16 × 16 × 16 MFMA', category: 'COOPERATIVE MATRIX INSTRUCTION', text: 'v_mfma_f32_16x16x16_f16 multiplies FP16 operands and accumulates into FP32. One wave owns 256 output values, four per lane. The grids show logical coordinates, not a physical array of arithmetic units.', metrics: ['FP16 A / B', 'FP32 accumulators', '8,192 FLOPs / instruction'], source: 'matrix' },
  llc: { title: 'Infinity Cache / LLC', category: 'LAST-LEVEL CACHE', text: 'The MI300X package provides 256 MB of last-level Infinity Cache in the I/O-die infrastructure. It can reduce HBM traffic when the workload reuses cached data.', metrics: ['256 MB / device'], source: 'specifications' },
  l2: { title: 'XCD L2 cache', category: 'CACHE SHARED WITHIN AN XCD', text: 'Each XCD has a 4 MB L2 cache shared by its CUs. Eight XCDs provide 32 MB total, distributed across the package. This is not one monolithic 32 MB cache next to every CU.', metrics: ['4 MB / XCD', '32 MB device total'], source: 'architecture' },
  l1: { title: 'Vector L1 cache', category: 'PER-CU DATA CACHE', text: 'Each MI300X CU has a 32 KiB vector L1 data cache. It serves vector memory accesses according to instruction cache policies. LDS is separate software-managed storage.', metrics: ['32 KiB / CU', 'Vector data cache'], source: 'specifications' },
};

export const TRACE_STEPS = [
  { title: 'Fetch a global tile', tag: 'GLOBAL MEMORY', text: 'A vector memory load requests operand elements from global memory. Caches can satisfy the request; otherwise it reaches HBM. The cache levels shown are a conceptual hierarchy, not a guaranteed miss sequence.', instruction: 'global_load_* → VGPRs', source: 'isa', highlight: ['hbm', 'llc', 'l2', 'l1', 'vgpr'], path: ['hbm', 'llc', 'l2', 'l1', 'vgpr'] },
  { title: 'Stage the tile in LDS', tag: 'REGISTER → SCRATCHPAD', text: 'For this conventional staging path, lanes first hold the global-load results in VGPRs, then write them into LDS using data-share instructions. This example does not assume Hopper TMA or a direct-to-LDS copy.', instruction: 'ds_write_* : VGPRs → LDS', source: 'isa', highlight: ['vgpr', 'lds'], path: ['vgpr', 'lds'] },
  { title: 'Make the tile visible', tag: 'WAIT AND SYNCHRONIZE', text: 'The kernel waits for outstanding LDS operations as required, then synchronizes the workgroup before consumers read values produced by other waves. Exact waits and barriers depend on the kernel and compiler.', instruction: 'wait for LDS writes → workgroup barrier', source: 'isa', highlight: ['lds'], path: ['lds'] },
  { title: 'Load register fragments', tag: 'SCRATCHPAD → REGISTERS', text: 'Each lane reads the operand elements it needs from LDS into registers. Their layout must match the selected MFMA instruction, and the LDS access pattern affects bank conflicts.', instruction: 'ds_read_* : LDS → operand VGPRs', source: 'matrix', highlight: ['lds', 'vgpr'], path: ['lds', 'vgpr'] },
  { title: 'Execute the matrix instruction', tag: 'COOPERATIVE WAVE MATH', text: 'The 64 lanes supply fragments for an MFMA operation. For the illustrated 16 × 16 × 16 instruction, each lane supplies four FP16 values from each operand and owns four FP32 accumulator values.', instruction: 'v_mfma_f32_16x16x16_f16', source: 'matrix', highlight: ['vgpr', 'matrix'], path: ['vgpr', 'matrix'] },
  { title: 'Store the output tile', tag: 'EPILOGUE AND GLOBAL STORE', text: 'After completing the K loop and any epilogue, lanes write the output to global memory. Real kernels can rearrange values, cast precision, or fuse operations before these stores.', instruction: 'global_store_* : output registers → memory', source: 'isa', highlight: ['matrix', 'vgpr', 'l1', 'l2', 'llc', 'hbm'], path: ['matrix', 'vgpr', 'l1', 'l2', 'llc', 'hbm'] },
];

// Default modifiers for gfx942 v_mfma_f32_16x16x16_f16.
// Formula checked against AMD's Matrix Instruction Calculator.
export function laneElements(lane) {
  const group = Math.floor(lane / 16), column = lane % 16;
  return { a: Array.from({ length: 4 }, (_, t) => [column, group * 4 + t]), b: Array.from({ length: 4 }, (_, t) => [group * 4 + t, column]), d: Array.from({ length: 4 }, (_, t) => [group * 4 + t, column]) };
}

export function ldsFootprint(m, n, k, stages) {
  const bytes = stages * (m * k + k * n) * 2;
  return { bytes, kib: bytes / 1024, capacity: 65536, groups: Math.floor(65536 / bytes), fits: bytes <= 65536 };
}
