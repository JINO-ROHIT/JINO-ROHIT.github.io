import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SOURCES, STAGES, COMPONENTS, TRACE_STEPS, laneElements, ldsFootprint } from './data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { mode: 'read', stage: 'package', mask: 'all', blockSize: 256, k: 0, lane: 0, matrixMode: 'math', tile: { m: 128, n: 128, k: 32, stages: 2 }, exploded: false, rotating: false, traceStep: 0, playing: false, selected: null };
let renderer, scene, camera, controls, activeModel, models = {}, clock;
let cameraGoal = new THREE.Vector3(12, 13, 17), targetGoal = new THREE.Vector3();
let movingCamera = true, traceTimer, scrollFrame, resizeObserver, visibility = true;
const container = $('#scene'), labelContainer = $('#model-labels');
const allLabels = [], selectables = [], raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const palette = { compute: 0xc47159, computeLight: 0xdba48d, teal: 0x568c80, memory: 0x88aa97, io: 0xb9ad91, dark: 0x4c6256, base: 0xcbd1bf, paper: 0xf5f3ed, inactive: 0xc4c9bd };
const VIEWPOINTS = {
  package: [14, 15, 18], xcd: [10, 13, 15], cu: [11, 14, 16], wave: [7, 12, 11], mfma: [4, 17, 16], memory: [9, 15, 17],
};

function sourceLink(key) { return SOURCES[key] || SOURCES.architecture; }

function setHash() {
  const hash = `#${state.mode}/${state.stage}${state.mode === 'trace' ? `/${state.traceStep + 1}` : ''}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function renderNavigation() {
  for (const target of [$('#level-picker'), $('#chapter-rail')]) {
    for (const [index, stage] of STAGES.entries()) {
      const button = document.createElement('button');
      button.dataset.level = stage.id;
      button.setAttribute('aria-label', `Level ${index + 1}: ${stage.short}`);
      if (target.id === 'chapter-rail') button.innerHTML = `<span>${String(index + 1).padStart(2, '0')} ${stage.short.toUpperCase()}</span>`;
      else button.textContent = stage.short;
      target.append(button);
    }
  }
  for (const [index, step] of TRACE_STEPS.entries()) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.dataset.trace = index;
    button.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span>${step.title}`;
    li.append(button); $('#trace-steps').append(li);
  }
}

function setMode(mode, { updateHash = true } = {}) {
  if (!['read', 'explore', 'trace'].includes(mode)) return;
  stopTrace();
  state.mode = mode;
  document.body.dataset.mode = mode;
  $('#story').hidden = mode !== 'read';
  $('#explore-panel').hidden = mode !== 'explore';
  $('#trace-panel').hidden = mode !== 'trace';
  $$('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
    if (button.closest('.mode-switch')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  if (controls) {
    controls.enableZoom = mode !== 'read';
    renderer.domElement.style.touchAction = mode === 'read' ? 'pan-y' : 'none';
  }
  if (mode === 'trace') { setStage('memory', { updateHash: false }); setTraceStep(state.traceStep); }
  else { setStage(state.stage, { updateHash: false }); }
  if (mode !== 'read') window.scrollTo({ top: 0, behavior: 'instant' });
  if (mode === 'read') requestAnimationFrame(() => scrollToStage(state.stage, false));
  if (updateHash) setHash();
}

function setStage(id, { updateHash = true } = {}) {
  const stage = STAGES.find(x => x.id === id);
  if (!stage) return;
  const changed = state.stage !== id;
  state.stage = id;
  $$('#level-picker [data-level], #chapter-rail [data-level]').forEach(button => {
    button.classList.toggle('active', button.dataset.level === id);
    button.setAttribute('aria-current', button.dataset.level === id ? 'step' : 'false');
  });
  $('#scene-number').textContent = String(STAGES.indexOf(stage) + 1).padStart(2, '0');
  $('#scene-kicker').textContent = state.mode === 'trace' ? 'TRACE / A TILED MATMUL' : stage.kicker;
  $('#scene-title').textContent = state.mode === 'trace' ? 'From memory to matrix arithmetic.' : stage.title;
  $('#breadcrumb').replaceChildren();
  const levels = ['package', ...(['xcd', 'cu', 'wave', 'mfma'].includes(id) ? ['xcd'] : []), ...(['cu', 'wave', 'mfma'].includes(id) ? ['cu'] : []), ...(['wave', 'mfma'].includes(id) ? ['wave'] : []), ...(id === 'mfma' ? ['mfma'] : []), ...(id === 'memory' ? ['memory'] : [])];
  [...new Set(levels)].forEach((level, index) => {
    if (index) { const separator = document.createElement('span'); separator.textContent = '/'; $('#breadcrumb').append(separator); }
    const button = document.createElement('button'); button.dataset.level = level;
    button.textContent = STAGES.find(s => s.id === level).short.toUpperCase(); $('#breadcrumb').append(button);
  });
  $('#explode').hidden = id !== 'package';
  if (models[id]) {
    for (const [key, model] of Object.entries(models)) model.group.visible = key === id;
    activeModel = models[id];
    if (changed) resetCamera();
  }
  if (changed || !state.selected) showDetail(stage.info);
  renderExploreControls();
  updateModel();
  renderFallback();
  if (updateHash) setHash();
}

function navigateStage(id) {
  if (state.mode === 'trace') setMode('explore');
  setStage(id);
  if (state.mode === 'read') scrollToStage(id);
}

function scrollToStage(id, smooth = true) {
  document.getElementById(id)?.scrollIntoView({ behavior: smooth && !reducedMotion ? 'smooth' : 'instant', block: 'start' });
}

function showDetail(key, overrides = {}) {
  const info = { ...(COMPONENTS[key] || COMPONENTS.package), ...overrides };
  state.selected = { key, ...info };
  const source = sourceLink(info.source);
  const detail = $('#component-detail');
  detail.replaceChildren();
  const category = document.createElement('span'); category.className = 'detail-category'; category.textContent = info.category;
  const title = document.createElement('h2'); title.textContent = info.title;
  const description = document.createElement('p'); description.textContent = info.text;
  const metrics = document.createElement('div'); metrics.className = 'detail-metrics';
  info.metrics?.forEach(value => { const metric = document.createElement('span'); metric.textContent = value; metrics.append(metric); });
  detail.append(category, title, description, metrics);
  if (info.next) { const button = document.createElement('button'); button.className = 'detail-action'; button.dataset.level = info.next; button.textContent = `Explore ${STAGES.find(s => s.id === info.next)?.short || info.next} →`; detail.append(button); }
  const link = document.createElement('a'); link.className = 'detail-source'; link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = `${source.name} ↗`; detail.append(link);
  $('#hover-label').textContent = info.title;
}

function inspect(info) {
  if (state.mode === 'read') setMode('explore');
  showDetail(info.key, info);
}

function renderExploreControls() {
  const panel = $('#explore-controls');
  if (state.stage === 'wave') {
    panel.innerHTML = `<div class="wave-controls"><label>Block size <select data-control="block-size">${[64, 128, 256, 512].map(n => `<option ${n === state.blockSize ? 'selected' : ''}>${n}</option>`).join('')}</select></label><div class="counts"><strong>${state.blockSize / 64} AMD waves</strong><span>${state.blockSize / 32} NVIDIA warps</span></div></div><div class="segmented" aria-label="Execution mask">${[['all','All lanes'],['first','0–31'],['second','32–63']].map(([mask, text]) => `<button data-mask="${mask}" class="${state.mask === mask ? 'active' : ''}" aria-pressed="${state.mask === mask}">${text}</button>`).join('')}</div><p class="small-note">One wave, shown as an 8 × 8 logical grid. Masked lanes retain state but do not participate in the illustrated vector instruction.</p>`;
  } else if (state.stage === 'mfma') {
    panel.innerHTML = `<div class="segmented" aria-label="Matrix visualization"><button data-matrix-mode="math" class="${state.matrixMode === 'math' ? 'active' : ''}" aria-pressed="${state.matrixMode === 'math'}">K slice</button><button data-matrix-mode="lane" class="${state.matrixMode === 'lane' ? 'active' : ''}" aria-pressed="${state.matrixMode === 'lane'}">Lane ownership</button></div><div class="range-heading"><label for="explore-matrix-slider">${state.matrixMode === 'math' ? 'K slice' : 'Wave lane'}</label><output id="explore-matrix-value">${state.matrixMode === 'math' ? `k = ${state.k}` : `lane ${state.lane}`}</output></div><input id="explore-matrix-slider" type="range" data-control="${state.matrixMode === 'math' ? 'k-slice' : 'mfma-lane'}" min="0" max="${state.matrixMode === 'math' ? 15 : 63}" value="${state.matrixMode === 'math' ? state.k : state.lane}" /><p class="small-note">${state.matrixMode === 'math' ? 'A highlighted column and B highlighted row form one mathematical outer product.' : ownershipText()}</p><p class="small-note">Click a matrix cell to find the lane that owns it for this instruction. Default modifiers; logical coordinates, not physical placement.</p>`;
  } else if (state.stage === 'memory') {
    panel.innerHTML = `<div class="tile-calculator"><span class="control-title">FP16 TILE / LDS CAPACITY</span><div class="tile-inputs">${Object.entries({ m: [64,128,256], n: [64,128,256], k: [16,32,64,128], stages: [1,2,3,4] }).map(([key, values]) => `<label>${key === 'stages' ? 'Stages' : key.toUpperCase()}<select data-tile="${key}">${values.map(value => `<option ${state.tile[key] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`).join('')}</div><div class="capacity-track"><div data-capacity-fill></div></div><div class="capacity-text"><strong data-capacity-used></strong><span data-capacity-bound></span></div><p class="small-note">LDS capacity only. Padding, other shared allocations, registers, wave limits and barriers are excluded.</p></div><button class="inline-action" data-start-trace>Trace the data movement <span>↗</span></button>`;
    updateCapacity();
  } else {
    panel.replaceChildren();
    const note = document.createElement('p'); note.className = 'small-note';
    note.textContent = state.stage === 'package' ? 'Use Explode to separate the XCDs from their I/O dies. Actual die spacing and component placement are schematic.' : 'Select a component in the model to see its role. Use the breadcrumbs above the model to climb back up.';
    panel.append(note);
  }
}

function ownershipText() {
  const group = Math.floor(state.lane / 16), column = state.lane % 16;
  return `Lane ${state.lane}: A[${column}, ${group * 4}:${group * 4 + 4}], B[${group * 4}:${group * 4 + 4}, ${column}], D[${group * 4}:${group * 4 + 4}, ${column}]. Ranges exclude the upper endpoint.`;
}

function updateCapacity() {
  const { m, n, k, stages } = state.tile;
  const capacity = ldsFootprint(m, n, k, stages);
  for (const fill of [$('#lds-fill'), ...$$('[data-capacity-fill]')]) { if (!fill) continue; fill.style.width = `${Math.min(100, capacity.kib / 64 * 100)}%`; fill.classList.toggle('over', !capacity.fits); }
  for (const element of [$('#lds-used'), ...$$('[data-capacity-used]')]) if (element) element.textContent = `${capacity.kib} KiB / 64 KiB`;
  for (const element of [$('#lds-bound'), ...$$('[data-capacity-bound]')]) if (element) { element.textContent = capacity.fits ? `At most ${capacity.groups} workgroup${capacity.groups === 1 ? '' : 's'} by LDS capacity` : 'Exceeds one CU’s LDS capacity'; element.style.color = capacity.fits ? 'var(--teal)' : 'var(--accent)'; }
}

function updateWave() {
  $('#amd-wave-total').textContent = `${state.blockSize / 64} wave${state.blockSize === 64 ? '' : 's'}`;
  $('#nvidia-warp-total').textContent = `${state.blockSize / 32} NVIDIA warps`;
  $('#block-size').value = state.blockSize;
  $$('[data-mask]').forEach(button => { const active = button.dataset.mask === state.mask; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#mask-description').textContent = state.mask === 'all' ? 'All lanes are active. This is thread grouping, not a cycle timing model.' : `${state.mask === 'first' ? 'Lanes 0–31' : 'Lanes 32–63'} are active; the other 32 lanes are masked for this illustrated instruction.`;
  updateModel();
  renderFallback();
}

function updateMatrix() {
  $('#k-value').textContent = `k = ${state.k}`; $('#k-slice').value = state.k;
  $('#lane-value').textContent = `lane ${state.lane}`; $('#mfma-lane').value = state.lane;
  $('#lane-ownership').textContent = ownershipText();
  $('#lane-control').hidden = state.matrixMode !== 'lane';
  $('#k-slice').hidden = state.matrixMode !== 'math';
  $('#k-slice').previousElementSibling.hidden = state.matrixMode !== 'math';
  $$('[data-matrix-mode]').forEach(button => { const active = button.dataset.matrixMode === state.matrixMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const control = $('[data-control="k-slice"], [data-control="mfma-lane"]');
  if (control) control.value = state.matrixMode === 'math' ? state.k : state.lane;
  if ($('#explore-matrix-value')) $('#explore-matrix-value').textContent = state.matrixMode === 'math' ? `k = ${state.k}` : `lane ${state.lane}`;
  updateModel();
}

function setTraceStep(index) {
  state.traceStep = (Number(index) + TRACE_STEPS.length) % TRACE_STEPS.length;
  const step = TRACE_STEPS[state.traceStep];
  $$('[data-trace]').forEach(button => { const active = Number(button.dataset.trace) === state.traceStep; button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'step' : 'false'); });
  $('#trace-tag').textContent = `STEP ${String(state.traceStep + 1).padStart(2, '0')} / ${step.tag}`;
  $('#trace-title').textContent = step.title; $('#trace-description').textContent = step.text; $('#trace-instruction').textContent = step.instruction;
  updateTraceModel();
  if (state.mode === 'trace') setHash();
}

function playTrace() {
  if (state.playing) { stopTrace(); return; }
  state.playing = true; $('#trace-play').innerHTML = 'Pause trace <span>Ⅱ</span>';
  traceTimer = setInterval(() => setTraceStep(state.traceStep + 1), 3400);
}

function stopTrace() { clearInterval(traceTimer); state.playing = false; $('#trace-play').innerHTML = 'Play trace <span>▶</span>'; }

function setupEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button, a.descent-link');
    if (!button) return;
    if (button.dataset.mode) setMode(button.dataset.mode);
    if (button.dataset.level) navigateStage(button.dataset.level);
    if (button.dataset.openStage) navigateStage(button.dataset.openStage);
    if (button.hasAttribute('data-mask')) { state.mask = button.dataset.mask; updateWave(); renderExploreControls(); }
    if (button.hasAttribute('data-matrix-mode')) { state.matrixMode = button.dataset.matrixMode; renderExploreControls(); updateMatrix(); }
    if (button.hasAttribute('data-trace')) { stopTrace(); setTraceStep(button.dataset.trace); }
    if (button.hasAttribute('data-start-trace')) { state.traceStep = 0; setMode('trace'); }
    if (button.hasAttribute('data-close')) button.closest('dialog').close();
    if (button.classList.contains('descent-link')) { event.preventDefault(); navigateStage('xcd'); }
  });
  document.addEventListener('change', event => {
    const element = event.target;
    if (element.id === 'block-size' || element.dataset.control === 'block-size') { state.blockSize = Number(element.value); updateWave(); renderExploreControls(); }
    const tileKey = element.dataset.tile || ({ 'tile-m': 'm', 'tile-n': 'n', 'tile-k': 'k', 'tile-stages': 'stages' })[element.id];
    if (tileKey) { state.tile[tileKey] = Number(element.value); $(`#tile-${tileKey}`).value = element.value; updateCapacity(); }
  });
  document.addEventListener('input', event => {
    const control = event.target.dataset.control || event.target.id;
    if (control === 'k-slice') { state.k = Number(event.target.value); updateMatrix(); }
    if (control === 'mfma-lane') { state.lane = Number(event.target.value); updateMatrix(); }
  });
  const openDialog = (buttonId, dialogId) => { $(buttonId).addEventListener('click', () => { stopTrace(); $(dialogId).showModal(); }); };
  openDialog('#sources-open', '#sources-dialog'); openDialog('#footer-sources', '#sources-dialog'); openDialog('#compare-open', '#compare-dialog'); openDialog('#help-open', '#help-dialog');
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
  $('#explode').addEventListener('click', () => { state.exploded = !state.exploded; $('#explode').setAttribute('aria-pressed', String(state.exploded)); updateModel(); });
  $('#rotate').addEventListener('click', () => { state.rotating = !state.rotating; $('#rotate').setAttribute('aria-pressed', String(state.rotating)); if (controls) controls.autoRotate = state.rotating && !reducedMotion; });
  $('#reset-camera').addEventListener('click', resetCamera);
  $('#start-trace').addEventListener('click', () => { state.traceStep = 0; setMode('trace'); });
  $('#trace-play').addEventListener('click', playTrace); $('#trace-reset').addEventListener('click', () => { stopTrace(); setTraceStep(0); });
  $('#share-view').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('#share-status').textContent = 'Link copied.'; } catch { $('#share-status').textContent = 'Copy the address in your browser to share this view.'; } });
  window.addEventListener('scroll', () => {
    if (scrollFrame || state.mode !== 'read') return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      const line = innerWidth < 761 ? innerHeight * .73 : innerHeight * .45;
      const active = $$('.chapter').find(chapter => { const rect = chapter.getBoundingClientRect(); return rect.top <= line && rect.bottom > line; });
      if (active && active.dataset.stage !== state.stage) setStage(active.dataset.stage);
    });
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { visibility = !document.hidden; if (!visibility) stopTrace(); });
  document.addEventListener('keydown', event => {
    if ($('dialog[open]') || /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '?') $('#help-dialog').showModal();
    if (event.key.toLowerCase() === 'r') resetCamera();
    if (/^[1-6]$/.test(event.key)) navigateStage(STAGES[Number(event.key) - 1].id);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const direction = event.key === 'ArrowRight' ? 1 : -1; if (state.mode === 'trace') { stopTrace(); setTraceStep(state.traceStep + direction); } else navigateStage(STAGES[Math.max(0, Math.min(5, STAGES.findIndex(s => s.id === state.stage) + direction))].id); }
    if (event.code === 'Space' && state.mode === 'trace') { event.preventDefault(); playTrace(); }
  });
  window.addEventListener('hashchange', readHash);
}

function readHash() {
  const [mode, stage, step] = location.hash.slice(1).split('/');
  if (!['read', 'explore', 'trace'].includes(mode) || !STAGES.some(s => s.id === stage)) return;
  setStage(stage, { updateHash: false });
  if (step && Number(step) >= 1 && Number(step) <= 6) state.traceStep = Number(step) - 1;
  setMode(mode, { updateHash: false });
}

// Three.js scenes use schematic component placement, not a reverse-engineered floorplan.
function material(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .08, ...options }); }

function box(parent, dimensions, position, color, info, { edges = true, shadow = true } = {}) {
  const geometry = new THREE.BoxGeometry(...dimensions);
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
  if (edges) { const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x405343, transparent: true, opacity: .18 })); mesh.add(line); }
  if (info) { mesh.userData.info = typeof info === 'string' ? { key: info } : info; selectables.push(mesh); }
  return mesh;
}

function label(parent, position, text, emphasis = false) {
  const anchor = new THREE.Object3D(); anchor.position.set(...position); parent.add(anchor);
  const element = document.createElement('div'); element.className = `model-label${emphasis ? ' emphasis' : ''}`; element.textContent = text; labelContainer.append(element);
  allLabels.push({ anchor, element, parentModel: parent.userData.stage || state.stage });
}

function textFace(parent, text, position, size, color = '#f8f4e9') {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 96;
  const context = canvas.getContext('2d'); context.clearRect(0, 0, 192, 96); context.font = '500 32px monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, 96, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  face.rotation.x = -Math.PI / 2; face.position.set(...position); parent.add(face); return face;
}

function instancedGrid(parent, { cols, rows, width, depth, y, gap = .04, color = palette.compute, info, offsetX = 0, offsetZ = 0, height = .12, disabled = [] }) {
  const cellW = width / cols, cellD = depth / rows;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cellW - gap, height, cellD - gap), material(0xffffff), cols * rows);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < cols * rows; i++) { dummy.position.set(offsetX + (i % cols - (cols - 1) / 2) * cellW, y, offsetZ + (Math.floor(i / cols) - (rows - 1) / 2) * cellD); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(disabled.includes(i) ? palette.inactive : color)); }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.receiveShadow = true; parent.add(mesh);
  if (info) { mesh.userData.getInfo = info; selectables.push(mesh); }
  return mesh;
}

function makeModel(id) { const group = new THREE.Group(); group.userData.stage = id; group.visible = false; scene.add(group); const model = { group }; models[id] = model; return model; }

function buildPackage() {
  const model = makeModel('package'), root = model.group; model.xcds = [];
  box(root, [15.2, .22, 11.4], [0, -.1, 0], 0xa7b49a, 'package');
  box(root, [14.7, .15, 10.9], [0, .07, 0], 0x6a806b, 'package');
  // Contact pads and traces are illustration, not published package wiring.
  const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.025,.12), material(0xc7ae73, { metalness: .55 }), 120);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 120; i++) { const edge = Math.floor(i / 30), t = (i % 30 - 14.5) * .45; dummy.position.set(edge < 2 ? t : (edge === 2 ? -7.15 : 7.15), .16, edge < 2 ? (edge === 0 ? -5.1 : 5.1) : t * .67); dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix); } root.add(pads);
  let chip = 0;
  for (let iz = 0; iz < 2; iz++) for (let ix = 0; ix < 2; ix++) {
    const x = (ix - .5) * 5.05, z = (iz - .5) * 3.9;
    box(root, [4.82, .36, 3.65], [x, .38, z], palette.io, { key: 'iod', title: `I/O die ${iz * 2 + ix}` });
    for (let pair = 0; pair < 2; pair++) {
      const dieIndex = chip;
      const die = new THREE.Group(); die.userData.stage = 'package'; die.position.set(x + (pair - .5) * 2.32, .68, z); die.userData.baseY = .68; root.add(die); model.xcds.push(die);
      box(die, [2.13, .18, 3.23], [0, 0, 0], palette.computeLight, { key: 'xcd', title: `XCD ${chip}`, next: 'xcd' });
      instancedGrid(die, { cols: 5, rows: 8, width: 1.83, depth: 2.45, y: .12, gap: .035, height: .025, disabled: [38,39], info: index => index >= 38 ? { key: 'xcd', title: 'Disabled CU (illustrative position)', metrics: ['40 physical', '38 active per XCD'] } : { key: 'cu', title: `CU ${index} on XCD ${dieIndex}`, next: 'cu' } });
      box(die,[1.85,.035,.3],[0,.12,1.43],0x7d9782,'l2',{edges:false,shadow:false});
      textFace(die, `XCD ${chip}`, [0,.15,1.42],1.25);
      chip++;
    }
  }
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 4; i++) {
    const x = side * 6.22, z = (i - 1.5) * 2.36;
    const memory = new THREE.Group(); memory.userData.stage = 'package'; root.add(memory); memory.position.set(x,.22,z);
    box(memory,[1.3,.13,1.85],[0,0,0],0xc6d1c0,'hbm');
    for (let layer = 0; layer < 6; layer++) box(memory,[1.13,.085,1.62],[0,.11+layer*.093,0],layer===5?0x556c61:0x789584,'hbm',{shadow:false});
    textFace(memory,'HBM',[0,.64,0],1.1);
  }
  label(root,[-6.22,1.2,-3.5],'HBM3 · 8 stacks');
  label(model.xcds[0],[0,.65,0],'XCD · 38 active CUs',true);
  label(root,[2.6,.8,4.1],'4 I/O dies beneath');
}

function buildXCD() {
  const model = makeModel('xcd'), root = model.group;
  box(root,[11.9,.3,9],[0,0,0],palette.computeLight,'xcd');
  const cells = instancedGrid(root,{ cols:8, rows:5, width:10.8, depth:6.2, y:.3, gap:.16, height:.22, disabled:[38,39], info:i=>i>=38?{key:'xcd',title:`Physical CU ${i} · disabled`,text:'MI300X enables 38 of the 40 physical CUs on each XCD. The two disabled positions shown here are illustrative, not a published fuse map.',metrics:['40 physical','38 active']}:{key:'cu',title:`Compute Unit ${i}`,next:'cu'} });
  for(let i=0;i<40;i++) { const x=(i%8-3.5)*1.35,z=(Math.floor(i/8)-2)*1.24; textFace(root,String(i),[x,.42,z],.68,i>=38?'#6c7468':'#fff6e9'); }
  box(root,[10.8,.18,.55],[0,.28,3.75],palette.teal,'l2');
  for(let i=0;i<4;i++) box(root,[2.5,.16,.45],[(i-1.5)*2.7,.27,-3.83],0xc6c2a8,{key:'xcd',title:`Asynchronous Compute Engine ${i}`,text:'An XCD has four ACEs that send compute workgroups to its compute units. This diagram groups them for readability; it does not reconstruct internal routing.',metrics:['4 ACEs / XCD'],source:'architecture'});
  label(root,[0,.7,3.8],'L2 · 4 MB shared by the XCD');
  label(root,[-3.6,.9,-2.5],'CU 0 → inspect',true);
  model.cells=cells;
}

function buildCU() {
  const model=makeModel('cu'),root=model.group;
  box(root,[13.2,.2,10.3],[0,0,0],0xd3d4c4,'cu');
  box(root,[11.8,.28,1.1],[0,.28,-4],0xb7b9a1,'sgpr');
  label(root,[0,.65,-4],'SALU / SGPRs · uniform values');
  for(let i=0;i<4;i++){
    const x=(i%2-.5)*5.9,z=(Math.floor(i/2)-.5)*3.0;
    box(root,[5.35,.2,2.63],[x,.2,z],0xbec9b6,'valu');
    box(root,[2.55,.26,1.98],[x-1.12,.43,z],palette.teal,'vgpr');
    box(root,[1.55,.24,1.25],[x+1.18,.42,z-.34],palette.computeLight,'valu');
    instancedGrid(root,{cols:4,rows:2,width:1.34,depth:.9,offsetX:x+1.18,offsetZ:z-.34,y:.57,gap:.08,height:.035,color:palette.compute,info:()=>({key:'valu',title:`Vector execution · SIMD domain ${i}`})});
    box(root,[1.55,.24,.45],[x+1.18,.43,z+.72],palette.compute,{key:'matrix',title:`Matrix execution · domain ${i}`,next:'mfma'});
    label(root,[x-1.12,.85,z],`VGPRs · domain ${i}`);
  }
  box(root,[11.8,.28,1.05],[0,.35,3.9],palette.teal,'lds');
  label(root,[0,.8,3.9],'LDS · 64 KiB',true);
  label(root,[4.2,1,-1.9],'Vector + matrix pipelines');
}

function buildWave() {
  const model=makeModel('wave'),root=model.group;
  box(root,[9.45,.22,9.45],[0,-.05,0],0xd2d6c8,'wave');
  model.cells=instancedGrid(root,{cols:8,rows:8,width:8.7,depth:8.7,y:.18,gap:.13,height:.17,color:palette.teal,info:lane=>({key:'wave',title:`Lane ${lane}`,text:`This is lane ${lane} of the first 64-thread wave in a ${state.blockSize}-thread block. Its block-local thread ID is ${lane}. In later waves, the thread ID is wave_index × 64 + lane. ${isLaneActive(lane)?'This lane is active in the selected mask.':'This lane is masked for the illustrated vector instruction.'}`,metrics:[`Lane ${lane}`,isLaneActive(lane)?'Active':'Masked',`${state.blockSize/64} waves / block`],source:'isa'})});
  model.faces=[];
  for(let lane=0;lane<64;lane++){const x=(lane%8-3.5)*8.7/8,z=(Math.floor(lane/8)-3.5)*8.7/8;model.faces.push(textFace(root,String(lane),[x,.275,z],.85));}
  label(root,[0,.45,-5.2],'64 logical lanes · one wave',true);
  label(root,[0,.45,5.2],'8 × 8 is a drawing convention');
}

function buildMFMA() {
  const model=makeModel('mfma'),root=model.group;model.grids={};
  for(const [index,id]of ['a','b','d'].entries()){
    const x=(index-1)*5.0;
    box(root,[4.6,.15,4.6],[x,0,0],0xcdd2c2,'mfma');
    model.grids[id]=instancedGrid(root,{cols:16,rows:16,width:4.4,depth:4.4,offsetX:x,y:.14,gap:.025,height:.07,color:0xb7c7b2,info:cell=>{
      const row=Math.floor(cell/16),col=cell%16,lane=id==='a'?Math.floor(col/4)*16+row:Math.floor(row/4)*16+col;
      return{key:'mfma',title:`${id.toUpperCase()}[${row}, ${col}] · lane ${lane}`,text:`For gfx942 v_mfma_f32_16x16x16_f16 with default modifiers, lane ${lane} owns this ${id==='d'?'FP32 accumulator':'FP16 operand'} element. Select Lane ownership to inspect the lane's four values in each matrix.`,metrics:[`Row ${row}`,`Column ${col}`,`Lane ${lane}`],matrixLane:lane,source:'matrix'};
    }});
    label(root,[x,.45,-2.9],`${id==='d'?'D = A × B + C':id.toUpperCase()} · 16 × 16${id==='d'?' · FP32':' · FP16'}`,id==='d');
    label(root,[x,.35,2.85],id==='a'?'rows M · columns K':id==='b'?'rows K · columns N':'rows M · columns N');
  }
  textFace(root,'×',[-2.5,.14,0],.62,'#6f7b69');textFace(root,'→',[2.5,.14,0],.65,'#6f7b69');
}

function buildMemory() {
  const model=makeModel('memory'),root=model.group;model.nodes={};
  box(root,[15.8,.17,8.0],[0,-.1,0],0xd6d9cc,'hbm');
  const nodes=[
    ['hbm',-6,1.45,'HBM3','192 GB',palette.dark,1.1],
    ['llc',-3.1,1.45,'Infinity Cache','256 MB',palette.io,.65],
    ['l2',-.25,1.45,'L2 / XCD','4 MB',palette.memory,.5],
    ['l1',2.55,1.45,'Vector L1 / CU','32 KiB',palette.memory,.4],
    ['vgpr',5.45,1.45,'VGPRs / CU','512 KiB',palette.teal,.32],
    ['lds',1.15,-2.1,'LDS / CU','64 KiB',palette.teal,.45],
    ['matrix',5.45,-2.1,'MFMA','matrix compute',palette.compute,.5],
  ];
  for(const[key,x,z,title,size,color,height]of nodes){
    const group=new THREE.Group();group.position.set(x,0,z);group.userData.stage='memory';root.add(group);
    const mesh=box(group,[2.05,height,1.8],[0,height/2,0],color,key);
    if(key==='hbm')for(let i=1;i<6;i++)box(group,[2.05,.02,1.8],[0,i*.17,0],0xb2c1ae,null,{edges:false,shadow:false});
    label(group,[0,height+.45,0],title,key==='matrix');
    label(group,[0,.2,1.3],size);
    model.nodes[key]={group,mesh,position:new THREE.Vector3(x,height+.25,z)};
  }
  model.flow=new THREE.Group();root.add(model.flow);
  model.particles=[];
  for(let i=0;i<18;i++){const sphere=new THREE.Mesh(new THREE.SphereGeometry(.07,7,5),new THREE.MeshBasicMaterial({color:0xb45138}));sphere.visible=false;root.add(sphere);model.particles.push(sphere);}
}

function updateTraceModel(){
  const model=models.memory;if(!model)return;
  const tracing=state.mode==='trace',step=TRACE_STEPS[state.traceStep];
  for(const[key,node]of Object.entries(model.nodes)){node.mesh.material.transparent=true;node.mesh.material.opacity=tracing&&!step.highlight.includes(key)?.3:1;}
  for(const child of [...model.flow.children]){child.geometry?.dispose();child.material?.dispose();model.flow.remove(child);}
  const path=tracing?step.path:['hbm','llc','l2','l1','vgpr'];
  const points=[];
  for(let i=0;i<path.length;i++){
    const point=model.nodes[path[i]].position.clone();point.y+=.45;
    if(i){const previous=model.nodes[path[i-1]].position.clone();previous.y+=.45;const mid=previous.clone().lerp(point,.5);mid.y+=.45;points.push(mid);}
    points.push(point);
  }
  model.curve=points.length>1?new THREE.CatmullRomCurve3(points):null;
  if(model.curve){
    const geometry=new THREE.BufferGeometry().setFromPoints(model.curve.getPoints(80));
    const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:tracing?0xb45138:0x708d78,dashSize:.11,gapSize:.1,transparent:true,opacity:tracing?.8:.45}));line.computeLineDistances();model.flow.add(line);
    for(const t of [.25,.6,.88]){const position=model.curve.getPoint(t),direction=model.curve.getTangent(t).normalize();const arrow=new THREE.Mesh(new THREE.ConeGeometry(.1,.26,5),new THREE.MeshBasicMaterial({color:tracing?0xb45138:0x708d78}));arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);arrow.position.copy(position);model.flow.add(arrow);}
  }
  model.particles.forEach((particle,index)=>{
    particle.visible=tracing&&!!model.curve&&!reducedMotion;
    if(model.curve)particle.position.copy(model.curve.getPoint(index/model.particles.length));
  });
}

function isLaneActive(lane){return state.mask==='all'||(state.mask==='first'?lane<32:lane>=32);}

function updateModel(){
  if(models.package){for(const die of models.package.xcds)die.userData.targetY=die.userData.baseY+(state.exploded?1.95:0);}
  if(models.wave){
    for(let lane=0;lane<64;lane++){models.wave.cells.setColorAt(lane,new THREE.Color(isLaneActive(lane)?palette.teal:palette.inactive));models.wave.faces[lane].material.opacity=isLaneActive(lane)?1:.38;}
    models.wave.cells.instanceColor.needsUpdate=true;
  }
  if(models.mfma){
    const owned=laneElements(state.lane);
    for(const[id,mesh]of Object.entries(models.mfma.grids)){
      const cells=new Set(owned[id].map(([row,col])=>row*16+col));
      for(let cell=0;cell<256;cell++){
        const row=Math.floor(cell/16),col=cell%16;
        const highlighted=state.matrixMode==='lane'?cells.has(cell):(id==='a'?col===state.k:id==='b'?row===state.k:true);
        const color=highlighted?(id==='d'?palette.compute:palette.teal):(id==='d'?0xd7c3b1:0xc1ccba);
        mesh.setColorAt(cell,new THREE.Color(color));
      }
      mesh.instanceColor.needsUpdate=true;
    }
  }
  updateTraceModel();
}

function resetCamera(){
  cameraGoal.fromArray(VIEWPOINTS[state.stage]||VIEWPOINTS.package);
  if(innerWidth<761)cameraGoal.multiplyScalar(1.03);
  targetGoal.set(0,state.stage==='package'&&state.exploded?.65:0,0);
  movingCamera=true;
  if(controls)controls.autoRotate=state.rotating&&!reducedMotion;
}

function raycast(event){
  const bounds=container.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);
  const visible=selectables.filter(mesh=>{let object=mesh;while(object){if(!object.visible)return false;object=object.parent;}return true;});
  const hit=raycaster.intersectObjects(visible,false)[0];
  if(!hit)return null;
  const info=hit.object.userData.getInfo?hit.object.userData.getInfo(hit.instanceId):hit.object.userData.info;
  return info;
}

function initRenderer(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(palette.paper,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    container.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden','true');
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);renderer.domElement.hidden=true;$('#fallback').hidden=false;renderFallback();});
    scene=new THREE.Scene();scene.fog=new THREE.Fog(palette.paper,40,85);
    camera=new THREE.PerspectiveCamera(36,1,.1,140);camera.position.copy(cameraGoal);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=8;controls.maxDistance=48;controls.maxPolarAngle=Math.PI/2.05;controls.autoRotateSpeed=.35;controls.enableZoom=state.mode!=='read';controls.enablePan=false;
    controls.addEventListener('start',()=>{movingCamera=false;});
    scene.add(new THREE.HemisphereLight(0xffffff,0xa3ac91,2.4));
    const sun=new THREE.DirectionalLight(0xfffaf0,3.2);sun.position.set(-8,18,10);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-20,right:20,top:18,bottom:-18,near:.5,far:65});sun.shadow.normalBias=.07;sun.shadow.bias=-.0002;scene.add(sun);
    const fill=new THREE.DirectionalLight(0xffffff,1.1);fill.position.set(9,8,-10);scene.add(fill);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.ShadowMaterial({color:0x526045,opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.25;ground.receiveShadow=true;scene.add(ground);
    buildPackage();buildXCD();buildCU();buildWave();buildMFMA();buildMemory();
    let down;
    renderer.domElement.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};});
    renderer.domElement.addEventListener('pointerup',event=>{
      if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      const info=raycast(event);if(!info)return;
      if(info.matrixLane!==undefined){state.lane=info.matrixLane;state.matrixMode='lane';updateMatrix();}
      inspect(info);renderExploreControls();
    });
    renderer.domElement.addEventListener('pointermove',event=>{const info=raycast(event);renderer.domElement.style.cursor=info?'pointer':'grab';if(info)$('#hover-label').textContent=info.title||COMPONENTS[info.key]?.title||'Select a component';});
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
    clock=new THREE.Clock();renderer.setAnimationLoop(animate);
    $('#renderer-status').hidden=true;
    return true;
  }catch(error){
    console.warn('3D renderer unavailable; using the schematic fallback.',error.message);
    $('#renderer-status').hidden=true;$('#fallback').hidden=false;renderFallback();return false;
  }
}

function resize(){
  if(!renderer)return;const{width,height}=container.getBoundingClientRect();if(width<1||height<1)return;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();resetCamera();
}

const projected=new THREE.Vector3();
function animate(){
  if(!visibility)return;
  const delta=Math.min(clock.getDelta(),.05),time=clock.elapsedTime;
  if(movingCamera){const t=reducedMotion?1:1-Math.exp(-delta*5);camera.position.lerp(cameraGoal,t);controls.target.lerp(targetGoal,t);if(camera.position.distanceTo(cameraGoal)<.015)movingCamera=false;}
  if(models.package)for(const die of models.package.xcds){const goal=die.userData.targetY??die.userData.baseY;die.position.y=THREE.MathUtils.lerp(die.position.y,goal,reducedMotion?1:1-Math.exp(-delta*6));}
  if(state.mode==='trace'&&state.playing&&models.memory?.curve){models.memory.particles.forEach((particle,i)=>particle.position.copy(models.memory.curve.getPoint((time*.18+i/18)%1)));}
  controls.update();
  for(const item of allLabels){
    const visible=item.parentModel===state.stage;
    item.element.hidden=!visible;if(!visible)continue;
    const original=item.element.dataset.fullText||item.element.textContent;
    item.element.dataset.fullText=original;
    if(innerWidth<761){
      if(state.stage==='mfma'&&original.startsWith('rows ')){item.element.hidden=true;continue;}
      if(state.stage==='cu'&&/VGPRs · domain [123]/.test(original)){item.element.hidden=true;continue;}
      item.element.textContent=original
        .replace('D = A × B + C · 16 × 16 · FP32','D · FP32')
        .replace('A · 16 × 16 · FP16','A · FP16').replace('B · 16 × 16 · FP16','B · FP16')
        .replace('Infinity Cache','LLC').replace('Vector L1 / CU','L1 / CU')
        .replace('SALU / SGPRs · uniform values','SALU / SGPRs')
        .replace('Vector + matrix pipelines','VALU / MFMA').replace('VGPRs · domain 0','VGPRs')
        .replace('XCD · 38 active CUs','XCD · 38 CUs').replace('4 I/O dies beneath','4 I/O dies');
    }else item.element.textContent=original;
    item.anchor.getWorldPosition(projected);projected.project(camera);
    if(projected.z>1||Math.abs(projected.x)>1.06||Math.abs(projected.y)>1.1){item.element.hidden=true;continue;}
    item.element.style.left=`${(projected.x*.5+.5)*container.clientWidth}px`;item.element.style.top=`${(-projected.y*.5+.5)*container.clientHeight}px`;
  }
  renderer.render(scene,camera);
}

function renderFallback(){
  const fallback=$('#fallback');if(fallback.hidden)return;
  const keys=state.stage==='package'?Array.from({length:8},()=> 'xcd'):state.stage==='xcd'?Array.from({length:40},(_,i)=>i<38?'cu':'xcd'):state.stage==='cu'?['sgpr','vgpr','valu','matrix','lds','l1']:state.stage==='wave'?Array.from({length:64},()=> 'wave'):state.stage==='mfma'?['mfma','matrix','vgpr']:['hbm','llc','l2','l1','vgpr','lds','matrix'];
  fallback.replaceChildren();const title=document.createElement('p');title.className='fallback-title';title.textContent=`${STAGES.find(s=>s.id===state.stage).short} · interactive schematic`;fallback.append(title);
  const grid=document.createElement('div');grid.className='fallback-grid';
  keys.forEach((key,i)=>{const button=document.createElement('button');button.textContent=state.stage==='package'?`XCD ${i}`:state.stage==='xcd'?i<38?`CU ${i}`:'Disabled':state.stage==='wave'?`Lane ${i}`:COMPONENTS[key].title;if(state.stage==='wave'){button.style.backgroundColor=isLaneActive(i)?'#88aa97':'#c4c9bd';button.setAttribute('aria-label',`Lane ${i}, ${isLaneActive(i)?'active':'masked'}`);}button.addEventListener('click',()=>inspect({key}));grid.append(button);});
  const note=document.createElement('p');note.className='fallback-note';note.textContent='3D rendering is unavailable in this browser. The guide, component details, lane controls, and resource calculator remain available.';fallback.append(grid,note);
}

renderNavigation();setupEvents();updateCapacity();
const [initialMode,initialStage,initialStep]=location.hash.slice(1).split('/');
if(STAGES.some(s=>s.id===initialStage))state.stage=initialStage;
if(Number(initialStep)>=1&&Number(initialStep)<=6)state.traceStep=Number(initialStep)-1;
state.mode=['read','explore','trace'].includes(initialMode)?initialMode:'read';
initRenderer();setMode(state.mode);updateWave();updateMatrix();
// A stable read-only state snapshot is useful when embedding or validating the explorer.
window.mi300xExplorer={getState:()=>structuredClone(state),setStage:navigateStage,setMode,setTraceStep};
