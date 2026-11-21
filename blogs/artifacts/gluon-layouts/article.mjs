import { matrix, owners, elements } from './layout-model.mjs';

const byId = id => document.getElementById(id);
const svg = byId('ownership-tile');
const lane = byId('layout-lane'), wave = byId('layout-wave'), order = byId('layout-order');
const colors = ['#d0ebff', '#ffe3e3', '#d3f9d8', '#e5dbff'];
const NS = 'http://www.w3.org/2000/svg';
function node(name, attributes, value) {
  const element = document.createElementNS(NS, name);
  for (const [key, val] of Object.entries(attributes)) element.setAttribute(key, val);
  if (value !== undefined) element.textContent = value;
  return element;
}
function update() {
  const layout = { ...matrix, order: order.value === 'columns' ? [1, 0] : [0, 1] };
  const selectedLane = Number(lane.value), selectedWave = Number(wave.value);
  const mapping = owners(layout);
  const selected = elements(layout, selectedWave, selectedLane);
  const cells = [];
  for (let r=0;r<16;r++) for (let c=0;c<32;c++) {
    const owner = mapping.get(`${r},${c}`)[0];
    const active = owner.wave === selectedWave && owner.lane === selectedLane;
    const rect = node('rect', {x:56+c*28,y:65+r*28,width:28,height:28,
      fill:active ? '#9a3412' : colors[owner.wave],stroke:'#ad9b88','stroke-width':.7,
      ...(active ? {class:'owned'} : {}) });
    rect.append(node('title', {}, `x[${r},${c}]: wave ${owner.wave}, lane ${owner.lane}, logical slot ${owner.slot}`));
    cells.push(rect);
  }
  const labels = [];
  for (const r of [0,4,8,12,15]) labels.push(node('text',{x:40,y:84+r*28,'font-size':17,'text-anchor':'end'},r));
  for (const c of [0,8,16,24,31]) labels.push(node('text',{x:70+c*28,y:49,'font-size':17,'text-anchor':'middle'},c));
  labels.push(node('text',{x:56,y:550,'font-size':23}, `Wave ${selectedWave}, lane ${selectedLane}: ${selected.map(([r,c])=>`x[${r},${c}]`).join(' and ')}`));
  svg.replaceChildren(node('title',{},'Ownership of a sixteen by thirty-two tensor tile'),
    node('desc',{},`The selected thread owns ${selected.map(c=>`[${c}]`).join(' and ')}. Each color identifies one wave. Use the controls above to change the selection.`),
    ...cells,...labels);
  byId('lane-number').textContent = selectedLane;
  byId('layout-result').textContent = `Wave ${selectedWave}, lane ${selectedLane} owns ${selected.map(([r,c])=>`x[${r},${c}]`).join(' and ')}. Order is [${layout.order.join(', ')}].`;
}
if (svg && lane && wave && order) {
  lane.addEventListener('input',update);
  wave.addEventListener('change',update);
  order.addEventListener('change',update);
  update();
}

const buildImage = byId('layout-build-image');
if (buildImage) {
  const controls = byId('layout-build-controls');
  const play = byId('layout-build-play');
  const steps = [...controls.querySelectorAll('[data-build-step]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const views = [
    { file: '07-thread-patch.svg',
      alt: 'One thread owns a one-row, two-column patch containing two values.',
      text: 'size_per_thread=[1,2]: one thread owns one row and two columns—two values.' },
    { file: '07-wave-patches.svg',
      alt: 'An eight-by-eight grid of 64 lanes. Every outlined lane contains two value cells, so one wave covers eight rows and sixteen columns of values.',
      text: 'threads_per_warp=[8,8]: arrange 64 two-value lane patches in an 8 × 8 grid. One wave covers 8 × 16 values.' },
    { file: '07-wave-tiles.svg',
      alt: 'Four waves form two rows and two columns of wave tiles. Each wave covers eight by sixteen values. Outlined pairs identify individual lanes. The whole base tile is sixteen by thirty-two.',
      text: 'warps_per_cta=[2,2]: arrange four 8 × 16 wave tiles in a 2 × 2 grid. The base tile covers 16 × 32 values.' },
  ];
  let current = 0, timer = null;
  function stop() {
    clearTimeout(timer); timer = null;
    play.textContent = 'Play steps'; play.setAttribute('aria-pressed', 'false');
  }
  function show(index) {
    current = index;
    const view = views[index], src = `./artifacts/gluon-layouts/${view.file}`;
    buildImage.src = src; buildImage.alt = view.alt;
    byId('layout-build-link').href = src;
    byId('layout-build-status').textContent = view.text;
    steps.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  function advance() {
    show(current + 1);
    if (current === views.length - 1) stop();
    else timer = setTimeout(advance, 3000);
  }
  steps.forEach((button, i) => button.addEventListener('click', () => { stop(); show(i); }));
  play.addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    show(0); play.textContent = 'Pause'; play.setAttribute('aria-pressed', 'true');
    timer = setTimeout(advance, 3000);
  });
  buildImage.addEventListener('load', () => {
    if (!reducedMotion.matches) buildImage.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 220 });
  });
  function respectMotionPreference() {
    if (reducedMotion.matches) stop();
    play.hidden = reducedMotion.matches;
  }
  reducedMotion.addEventListener('change', respectMotionPreference);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  controls.hidden = false;
  respectMotionPreference();
  show(0);
}
