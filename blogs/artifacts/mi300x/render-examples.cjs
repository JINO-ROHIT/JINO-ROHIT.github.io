// Regenerate the article's explanatory SVGs: node render-examples.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor/rough.js'), 'utf8'), context);
const font = fs.readFileSync(path.join(__dirname, 'fonts/Virgil.woff2')).toString('base64');
const license = fs.readFileSync(path.join(__dirname, 'fonts/LICENSE.md'), 'utf8').replaceAll('--', '—');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const colors = { pink: '#ffe3e3', yellow: '#fff3bf', green: '#d3f9d8', blue: '#d0ebff', purple: '#e5dbff', ink: '#51453b' };
class Sketch {
  constructor(name, height, title, subtitle, description) {
    this.name = name; this.height = height; this.seed = 410; this.gen = context.rough.generator();
    this.parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}" viewBox="0 0 1100 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(description)}</desc>`,
      `<!-- Unmodified Virgil font: https://github.com/excalidraw/virgil\n${license}\n-->`,
      `<defs><style>@font-face{font-family:Virgil;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-style:normal}text{font-family:Virgil,cursive;font-weight:400}</style></defs><rect width="1100" height="${height}" fill="#fffaf3"/>`];
    this.text(40, 52, 32, title);
    if (subtitle) this.text(41, 92, 21, subtitle, '#76685c');
  }
  draw(shape) {
    this.parts.push(...this.gen.toPaths(shape).map(p => `<path d="${p.d}" fill="${p.fill || 'none'}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`));
  }
  rect(x, y, w, h, fill, stroke = colors.ink) {
    this.draw(this.gen.rectangle(x, y, w, h, { fill, fillStyle: 'solid', stroke, strokeWidth: 1.7, roughness: 1.05, seed: this.seed++ }));
  }
  line(x1, y1, x2, y2, color = '#877565') {
    this.draw(this.gen.line(x1, y1, x2, y2, { stroke: color, strokeWidth: 1.7, roughness: .8, seed: this.seed++ }));
  }
  arrow(x1, y1, x2, y2, color) {
    this.line(x1, y1, x2, y2, color);
    const a = Math.atan2(y2-y1, x2-x1), l = 11;
    this.line(x2, y2, x2-l*Math.cos(a-.5), y2-l*Math.sin(a-.5), color);
    this.line(x2, y2, x2-l*Math.cos(a+.5), y2-l*Math.sin(a+.5), color);
  }
  text(x, y, size, content, color = '#332c26', anchor = 'start') {
    this.parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${escape(content)}</text>`);
  }
  center(x, y, size, content, color) { this.text(x, y, size, content, color, 'middle'); }
  grid(x, y, w, h, cols, rows, fill, owned = []) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
    for (const [r, c] of owned) this.parts.push(`<rect x="${x+c*w/cols}" y="${y+r*h/rows}" width="${w/cols}" height="${h/rows}" fill="#9c442b" fill-opacity=".8"/>`);
    for (let i=0;i<=cols;i++) this.parts.push(`<path d="M${x+i*w/cols} ${y}v${h}" stroke="#9e8e7f" stroke-width=".9" fill="none"/>`);
    for (let i=0;i<=rows;i++) this.parts.push(`<path d="M${x} ${y+i*h/rows}h${w}" stroke="#9e8e7f" stroke-width=".9" fill="none"/>`);
    this.rect(x, y, w, h, 'none');
  }
  save() { fs.writeFileSync(path.join(__dirname, `${this.name}.svg`), this.parts.join('\n')+'\n</svg>\n'); }
}

function tileStorage() {
  const s = new Sketch('tile-storage-sketch', 630, 'One pair of operand tiles uses 8 KiB', 'FP16 inputs: each element occupies 2 bytes.', 'A 64 by 32 tile uses 4 KiB, and a 32 by 64 tile uses 4 KiB. Together they use 8 KiB before padding and additional buffers.');
  s.rect(40,135,490,345,colors.blue);s.rect(570,135,490,345,colors.pink);
  s.center(285,178,28,'A tile: 64 rows × 32 columns');s.center(815,178,28,'B tile: 32 rows × 64 columns');
  s.grid(235,205,100,200,4,8,'#e7f5ff');s.grid(715,255,200,100,8,4,'#fff5f5');
  s.center(285,449,27,'64 × 32 × 2 bytes = 4 KiB');s.center(815,449,27,'32 × 64 × 2 bytes = 4 KiB');
  s.rect(40,520,1020,73,colors.green);s.center(550,567,33,'4 KiB + 4 KiB = 8 KiB per pair');s.save();
}
function cacheReuse() {
  const s=new Sketch('cache-reuse-sketch',650,'Two output tiles can reuse the same A tile','The workgroups use the same A rows and different B columns.','Two workgroups compute output tiles C[0:64,0:64] and C[0:64,64:128]. Both require A[0:64,0:32] on the first K step. Each issues its own loads, which may benefit from caching.');
  s.rect(40,170,400,330,colors.blue);s.center(240,215,28,'Shared input region');
  s.grid(195,230,90,180,4,8,'#e7f5ff');s.center(240,448,26,'A[0:64, 0:32]');s.center(240,483,20,'Needed by both workgroups');
  s.line(440,330,520,330);s.line(520,235,520,435);s.arrow(520,235,600,235);s.arrow(520,435,600,435);
  for(const [i,y,color] of [[0,145,colors.pink],[1,345,colors.green]]){
    s.rect(600,y,460,175,color);s.center(830,y+45,27,`Workgroup ${i+1}`);
    s.center(830,y+90,26,i===0?'C[0:64, 0:64]':'C[0:64, 64:128]');
    s.center(830,y+133,21,i===0?'Output columns 0–63':'Output columns 64–127');
  }
  s.center(550,568,24,'Repeated loads may reuse cached A data.');
  s.center(550,609,20,'Ranges exclude the upper endpoint. Cache hits depend on residency and policy.','#76685c');s.save();
}
function waveGrouping() {
  const s=new Sketch('wave-grouping-sketch',660,'256 threads form four wavefronts','One workgroup on CDNA 3; each wavefront contains 64 threads.','Threads 0 through 63 form wave 0, 64 through 127 wave 1, 128 through 191 wave 2, and 192 through 255 wave 3. Wave ID is thread ID divided by 64 using integer division. Lane ID is thread ID modulo 64.');
  const fills=[colors.pink,colors.yellow,colors.green,colors.blue];
  for(let wave=0;wave<4;wave++){
    const y=125+wave*88;s.rect(40,y,1020,73,fills[wave]);
    s.text(61,y+28,25,`Wave ${wave}`);s.text(61,y+56,18,`Threads ${wave*64}–${wave*64+63}`);
    for(let lane=0;lane<64;lane++)s.parts.push(`<rect x="${265+lane*12}" y="${y+22}" width="9" height="28" rx="1" fill="#fffaf3" stroke="#a38d79" stroke-width=".7"/>`);
  }
  s.rect(40,510,1020,107,colors.purple);
  s.text(65,548,25,'wave_id = thread_id // 64');s.text(590,548,25,'lane_id = thread_id % 64');
  s.center(550,590,26,'Example: thread 130 belongs to wave 2, lane 2.');s.save();
}
function ldsBuffering() {
  const s=new Sketch('lds-buffering-sketch',650,'Two operand buffers use 16 KiB of LDS','64 × 64 output tile · K step of 32 · FP16 operands','Each buffer holds 4 KiB for A and 4 KiB for B, for 8 KiB per buffer. Reserving two complete buffers requires 16 KiB before padding and other shared allocations. The general formula is S times (BLOCK_M times BLOCK_K plus BLOCK_K times BLOCK_N) times 2 bytes.');
  for(let i=0;i<2;i++){
    const x=40+i*530;s.rect(x,140,490,285,'#fffdf8');s.center(x+245,183,29,`Buffer ${i}`);
    s.rect(x+30,211,200,101,colors.blue);s.rect(x+260,211,200,101,colors.pink);
    s.center(x+130,249,26,'A tile');s.center(x+130,285,27,'4 KiB');s.center(x+360,249,26,'B tile');s.center(x+360,285,27,'4 KiB');
    s.center(x+245,382,29,'8 KiB per buffer');
  }
  s.rect(40,465,1020,78,colors.green);s.center(550,514,32,'2 buffers × 8 KiB = 16 KiB');
  s.center(550,588,22,'LDS bytes = S × (BLOCK_M × BLOCK_K + BLOCK_K × BLOCK_N) × 2');
  s.center(550,626,19,'Operand-storage estimate; padding and other shared storage may add to it.','#76685c');s.save();
}
function occupancyBudget() {
  const s=new Sketch('occupancy-budget-sketch',700,'The tightest resource limit sets residency','Four waves per workgroup; 128 allocated register slots per lane; 32 KiB LDS per workgroup.','Registers allow 4 workgroups, LDS allows 2 workgroups, and 32 available wave slots allow 8 four-wave workgroups. The combined upper bound is 2 workgroups, or 8 waves out of 32, which is 25 percent occupancy. SGPR and other constraints can reduce this upper bound.');
  const xs=[40,390,740], fills=[colors.blue,colors.green,colors.purple], titles=['Registers','Shared memory (LDS)','Wave slots'];
  for(let i=0;i<3;i++){s.rect(xs[i],145,320,275,fills[i]);s.center(xs[i]+160,190,26,titles[i]);}
  s.center(200,242,22,'512 / 128 = 4 waves/SIMD');s.center(200,280,21,'4 SIMDs → 16 waves/CU');s.center(200,353,36,'4 workgroups');s.center(200,389,20,'16 waves / 4 per group');
  s.center(550,250,25,'64 KiB / 32 KiB');s.center(550,353,36,'2 workgroups');s.center(550,389,21,'The tightest limit','#386340');
  s.center(900,250,23,'32 waves / 4 per group');s.center(900,353,36,'8 workgroups');
  for(const x of [200,550,900])s.arrow(x,423,x,472);
  s.rect(40,485,1020,135,colors.yellow);s.center(550,533,31,'min(4, 2, 8) = 2 workgroups fit');s.center(550,581,28,'2 × 4 waves = 8 of 32 waves → 25% occupancy');
  s.center(550,670,20,'An upper bound for this balanced-placement model; other constraints can reduce it.','#76685c');s.save();
}
function mfmaInstruction() {
  const s=new Sketch('mfma-instruction-sketch',580,'One wave computes a small matrix product','Reading the name of one gfx942 MFMA instruction.','The instruction v_mfma_f32_16x16x16_f16 uses FP16 A and B operands, produces a 16 by 16 output with reduction dimension 16, and accumulates in FP32. D equals A times B plus C.');
  s.rect(100,128,900,75,colors.yellow);s.center(550,177,34,'v_mfma_f32_16x16x16_f16');
  for(const x of [200,550,900])s.arrow(x,206,x,247);
  const items=[['FP16 inputs','A and B elements',colors.pink],['16 × 16 output','Reduction size K = 16',colors.green],['FP32 accumulation','C and D elements',colors.blue]];
  items.forEach(([a,b,color],i)=>{const x=40+i*350;s.rect(x,260,320,145,color);s.center(x+160,310,27,a);s.center(x+160,362,23,b);});
  s.center(550,480,28,'D[16,16] = A[16,16] × B[16,16] + C[16,16]');
  s.center(550,538,22,'All 64 lanes supply fragments and share ownership of the output.','#76685c');s.save();
}
function laneOwnership(laneElements) {
  const owned=laneElements(17);
  const s=new Sketch('mfma-lane17-sketch',725,'Lane 17 owns these matrix fragments','v_mfma_f32_16x16x16_f16 · default modifiers','For lane 17, c is 1 and g is 1. Its A elements are row 1, columns 4 through 7. Its B and D elements are rows 4 through 7, column 1. A and B contain four FP16 values per lane and D contains four FP32 outputs per lane.');
  s.center(550,139,25,'c = lane % 16 = 1     g = lane // 16 = 1     t = 0, 1, 2, 3');
  const entries=[['a','A','A[c, 4g+t]',colors.blue],['b','B','B[4g+t, c]',colors.green],['d','D','D[4g+t, c]',colors.pink]];
  entries.forEach(([key,label,formula,color],i)=>{
    const x=75+i*350;s.rect(x-35,175,320,505,'#fffdf8');s.center(x+120,218,29,`${label}[16,16]`);s.center(x+120,256,24,formula);
    s.grid(x,292,240,240,16,16,color,owned[key]);
    for(const n of [0,4,8,12]){s.center(x+n*15+7.5,282,14,String(n));s.text(x-24,305+n*15,14,String(n));}
    const values=owned[key].map(([r,c])=>`${label}[${r},${c}]`);
    s.center(x+120,579,23,values.slice(0,2).join(', '));s.center(x+120,615,23,values.slice(2).join(', '));
    s.center(x+120,655,20,key==='d'?'Four FP32 outputs':'Four FP16 values','#76685c');
  });s.save();
}
function gemmTiles() {
  const s=new Sketch('gemm-tiles-sketch',680,'Small matrix instructions build a larger tile','One K step of 32: FP16 operands and an FP32 accumulator.','A program step multiplies a 64 by 32 A tile and a 32 by 64 B tile, updating a 64 by 64 FP32 accumulator. With a 16 by 16 by 16 MFMA decomposition, this is 4 times 4 times 2, or 32 wave-level matrix operations, totaling 262144 FLOPs.');
  s.grid(130,155,120,240,4,8,colors.blue);s.grid(405,215,240,120,8,4,colors.pink);s.grid(770,155,240,240,8,8,colors.green);
  s.center(190,441,27,'A[64,32]');s.center(525,441,27,'B[32,64]');s.center(890,441,27,'acc[64,64]');s.center(325,286,44,'×');s.arrow(680,275,735,275);
  s.center(550,493,25,'The accumulator stays live across the K steps.');
  s.rect(40,526,1020,115,colors.purple);s.center(550,567,25,'(64/16) × (64/16) × (32/16) = 32 wave-level MFMAs');s.center(550,613,27,'2 × 64 × 64 × 32 = 262,144 FLOPs per step');s.save();
}
(async()=>{
  const {laneElements}=await import(pathToFileURL(path.resolve(__dirname,'../../../projects/mi300x-explorer/dist/data.js')).href);
  tileStorage();cacheReuse();waveGrouping();ldsBuffering();occupancyBudget();mfmaInstruction();laneOwnership(laneElements);gemmTiles();
  console.log('Rendered eight explanatory diagrams with embedded fonts and seeded sketch strokes.');
})().catch(error=>{console.error(error);process.exit(1);});
