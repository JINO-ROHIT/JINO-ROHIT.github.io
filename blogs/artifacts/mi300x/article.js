const LDS_CAPACITY_BYTES = 64 * 1024;

export function waveState(threads, wave, mask) {
  const waves = Math.ceil(threads / 64);
  const live = Math.max(0, Math.min(64, threads - wave * 64));
  const lanes = Array.from({ length: 64 }, (_, lane) => {
    if (lane >= live) return 'empty';
    return mask === 'all' || (mask === 'half' && lane < 32) ||
      (mask === 'even' && lane % 2 === 0) ? 'active' : 'masked';
  });
  return { waves, live, active: lanes.filter(lane => lane === 'active').length, lanes };
}

// Only the four-wave, balanced-placement case described in the article.
// Inputs are allocated combined register slots, not raw VGPR source counts.
export function resourceBound(registers, ldsKib) {
  const registerGroups = Math.min(8, Math.floor(512 / registers));
  const ldsGroups = ldsKib === 0 ? Infinity : LDS_CAPACITY_BYTES / (ldsKib * 1024);
  const groups = Math.min(registerGroups, Math.floor(ldsGroups), 8);
  const limits = [];
  if (groups === registerGroups) limits.push('registers');
  if (groups === Math.floor(ldsGroups)) limits.push('LDS');
  if (groups === 8) limits.push('wave slots');
  return { groups, registerGroups, ldsGroups: Math.floor(ldsGroups), waves: groups * 4,
    percent: groups * 4 / 32 * 100, limits };
}

if (typeof document !== 'undefined') {
  const byId = id => document.getElementById(id);
  const threads = byId('threads'), wave = byId('wave-index'), mask = byId('exec-mask');
  const laneGrid = byId('lane-grid');
  for (let lane = 0; lane < 64; lane++) {
    const cell = document.createElement('span');
    cell.textContent = lane;
    laneGrid.append(cell);
  }
  function updateWave(rebuild = false) {
    const count = Number(threads.value);
    if (rebuild) {
      const previous = Math.min(Number(wave.value), Math.ceil(count / 64) - 1);
      wave.replaceChildren(...Array.from({ length: Math.ceil(count / 64) }, (_, index) => {
        const option = document.createElement('option');
        option.value = index; option.textContent = `Wavefront ${index}`;
        return option;
      }));
      wave.value = previous;
    }
    const state = waveState(count, Number(wave.value), mask.value);
    byId('wave-summary').textContent = `${count} threads form ${state.waves} ${state.waves === 1 ? 'wavefront' : 'wavefronts'}. Wavefront ${wave.value} contains ${state.live} threads; ${state.active} execute this branch.`;
    state.lanes.forEach((status, lane) => {
      laneGrid.children[lane].className = `lane-${status}`;
      laneGrid.children[lane].title = `Lane ${lane}, thread ${Number(wave.value) * 64 + lane}: ${status}`;
    });
  }
  threads.addEventListener('change', () => updateWave(true));
  wave.addEventListener('change', () => updateWave());
  mask.addEventListener('change', () => updateWave());
  updateWave(true);

  function updateBound() {
    const state = resourceBound(Number(byId('register-slots').value), Number(byId('lds-kib').value));
    const rows = Array.from({ length: 4 }, (_, index) => {
      const row = document.createElement('div'); row.className = 'simd-row';
      const label = document.createElement('span'); label.textContent = `SIMD ${index}`; row.append(label);
      for (let slot = 0; slot < 8; slot++) {
        const cell = document.createElement('i');
        if (slot < state.groups) cell.className = 'filled';
        row.append(cell);
      }
      return row;
    });
    byId('simd-slots').replaceChildren(...rows);
    byId('occupancy-summary').textContent = state.groups === 0
      ? 'No workgroup fits: the requested shared memory exceeds the compute unit’s 64 KiB capacity.'
      : `At most ${state.groups} ${state.groups === 1 ? 'workgroup fits' : 'workgroups fit'}, using ${state.waves} of 32 wave slots (${state.percent}% occupancy). Limited by ${state.limits.map(limit => limit === 'LDS' ? 'shared memory (LDS)' : limit === 'wave slots' ? 'available wave slots' : 'register capacity').join(' and ')}.`;
    byId('occupancy-detail').textContent = `Register capacity allows ${state.registerGroups} ${state.registerGroups === 1 ? 'workgroup' : 'workgroups'}. ${state.ldsGroups === Infinity ? 'No shared memory is used.' : `Shared memory allows ${state.ldsGroups} ${state.ldsGroups === 1 ? 'workgroup' : 'workgroups'}.`} Available wave slots allow 8.`;
  }
  if (byId('register-slots') && byId('lds-kib')) {
    byId('register-slots').addEventListener('change', updateBound);
    byId('lds-kib').addEventListener('change', updateBound);
    updateBound();
  }

  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      const hash = view === 'memory' ? '#trace/memory/1' : `#explore/${view}`;
      byId('architecture-atlas').src = `../projects/mi300x-explorer/dist/index.html${hash}`;
      document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    });
  });
  const article = byId('article').cloneNode(true);
  article.querySelectorAll('pre, nav, figure').forEach(element => element.remove());
  const words = article.textContent.trim().split(/\s+/).length;
  const codeLines = byId('gemm-source').textContent.split('\n').length;
  byId('read-time').textContent = `${Math.ceil(words / 210 + codeLines / 25)} min read`;
}
