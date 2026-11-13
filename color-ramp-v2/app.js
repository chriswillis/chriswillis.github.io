/* Color Ramp v2: browser-local palette projects, output layouts, and a unified preview/export path. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), B = PaletteBuilder, clone = B.clone;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const KEY = 'color-ramp.studio.v2';
  const baseLayout = () => ({ native: true, count: 11, dark: 18, light: 98, spacing: 'reference', lock: true, pin: null });
  function fresh() {
    const refs = B.inventory(PALETTES.find(p => p.id === 'tailwind4'));
    return { version: 2, title: 'Untitled palette', seed: '#4F6EF7', palette: 'tailwind4', mode: 'through', layout: baseLayout(), overrides: {}, edits: {}, selected: ['brand', refs.find(c => c.name === 'orange').id, refs.find(c => c.name === 'slate').id], active: 'brand', imported: [], background: 'light', vision: 'normal', format: 'oklch', exportScope: 'selected', view: 'selected', scope: 'all' };
  }
  let state = fresh(), history = [], future = [], gesture = null, proposals = [], search = '', invalid = false, frame = null, toastTimer;
  let nativeKey = '', nativeBrand = null, referenceKey = '', references = [], resolvedCache = new Map(), importResult = null;
  function palette() { return PALETTES.concat(state.imported).find(p => p.id === state.palette); }
  function opaque(value) { try { const p = Engine.parse(value); return p.every(Number.isFinite) && Engine.alphaOf(value) === 1 ? p : null; } catch { return null; } }
  function isLayout(x) { return x && typeof x.native === 'boolean' && Number.isInteger(x.count) && x.count >= 3 && x.count <= 32 && Number.isFinite(x.dark) && Number.isFinite(x.light) && x.dark >= .1 && x.light <= 99.9 && x.dark < x.light && ['reference', 'even'].includes(x.spacing) && typeof x.lock === 'boolean' && (x.pin === null || Number.isInteger(x.pin) && x.pin >= 0 && x.pin < 32); }
  function validPalette(p) {
    if (!p || typeof p.id !== 'string' || p.id.length > 180 || !p.id.startsWith('user-') || typeof p.name !== 'string' || p.name.length > 60 || !Array.isArray(p.steps) || p.steps.length < 3 || p.steps.length > 64 || !p.steps.every(s => typeof s === 'string' && s.length <= 60) || new Set(p.steps).size !== p.steps.length || !p.ramps || !p.neutrals || !['srgb', 'p3'].includes(p.gamut) || !p.poles || !opaque(p.poles.light) || !opaque(p.poles.dark)) return false;
    const names = Object.keys(p.ramps);
    if (names.length < 4 || names.length > 90) return false;
    try { B.inventory(p); const m = Engine.build(p, p.neutral, p.gamut); return m.loft.length >= 3; } catch { return false; }
  }
  function validate(value) {
    if (!value || value.version !== 2 || typeof value.title !== 'string' || value.title.length > 70 || typeof value.seed !== 'string' || !opaque(value.seed) || !Array.isArray(value.imported) || value.imported.length > 12 || !value.imported.every(validPalette)) throw Error('This is not a valid Color Ramp v2 project.');
    const all = PALETTES.concat(value.imported), pal = all.find(p => p.id === value.palette);
    if (!pal || !isLayout(value.layout) || !['through', 'fit'].includes(value.mode)) throw Error('The project’s reference or ramp settings are invalid.');
    const ids = new Set(['brand', ...B.inventory(pal).map(c => c.id)]);
    if (!Array.isArray(value.selected) || value.selected.length < 1 || value.selected.length > 96 || !value.selected.every(id => typeof id === 'string' && ids.has(id)) || !ids.has(value.active)) throw Error('The project contains an unavailable ramp.');
    if (!value.overrides || typeof value.overrides !== 'object' || Array.isArray(value.overrides) || Object.keys(value.overrides).length > 96 || !Object.entries(value.overrides).every(([id, x]) => ids.has(id) && isLayout(x))) throw Error('Invalid per-ramp shapes.');
    if (!value.edits || typeof value.edits !== 'object' || Array.isArray(value.edits) || Object.keys(value.edits).length > 96 || !Object.entries(value.edits).every(([id, e]) => ids.has(id) && e && typeof e.name === 'string' && e.name.length <= 60 && Number.isFinite(e.hue) && Math.abs(e.hue) <= 180 && Number.isFinite(e.chroma) && e.chroma >= 0 && e.chroma <= 150)) throw Error('Invalid color edits.');
    const clean = clone(value); clean.selected = [...new Set(clean.selected)];
    clean.background = value.background === 'dark' ? 'dark' : 'light';
    clean.vision = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'].includes(value.vision) ? value.vision : 'normal';
    clean.format = ['oklch', 'css', 'tw4', 'tw3', 'json'].includes(value.format) ? value.format : 'oklch';
    clean.exportScope = ['selected', 'active', 'all'].includes(value.exportScope) ? value.exportScope : 'selected';
    clean.view = value.view === 'library' ? 'library' : 'selected'; clean.scope = value.scope === 'active' ? 'active' : 'all';
    return clean;
  }
  try { const raw = localStorage.getItem(KEY); if (raw && raw.length < 1500000) state = validate(JSON.parse(raw)); } catch { /* A fresh project remains usable when storage is unavailable or invalid. */ }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2700); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); $('save-state').textContent = 'Saved locally'; } catch { $('save-state').textContent = 'Not saved'; } }
  function checkpoint() { history.push(clone(state)); if (history.length > 60) history.shift(); future = []; }
  function change(fn) { checkpoint(); fn(); proposals = []; render(); persist(); }
  function beginGesture() { if (!gesture) gesture = clone(state); }
  function endGesture() { if (!gesture) return; if (JSON.stringify(gesture) !== JSON.stringify(state)) { history.push(gesture); if (history.length > 60) history.shift(); future = []; } gesture = null; render(); persist(); }
  function schedule() { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { frame = null; render(); }); }
  function clearInvalid() { invalid = false; $('seed-error').hidden = true; $('seed').setAttribute('aria-invalid', 'false'); }
  function undo() { endGesture(); if (!history.length) return; future.push(clone(state)); state = history.pop(); clearInvalid(); proposals = []; render(); persist(); toast('Previous change restored.'); }
  function redo() { if (!future.length) return; history.push(clone(state)); state = future.pop(); clearInvalid(); proposals = []; render(); persist(); toast('Change reapplied.'); }
  function sources() {
    const pal = palette(), signature = JSON.stringify([state.palette, state.seed, state.mode]);
    if (nativeKey !== signature) { nativeBrand = RampLayout.brand(pal, state.seed, state.mode, 'brand'); nativeKey = signature; }
    if (referenceKey !== pal.id) { references = B.inventory(pal); referenceKey = pal.id; }
    return [nativeBrand, ...references];
  }
  function configFor(id) { return state.overrides[id] || state.layout; }
  function resolve(source) {
    const cfg = configFor(source.id), e = state.edits[source.id] || { name: source.name, hue: 0, chroma: 100 };
    const signature = JSON.stringify([source.id === 'brand' ? nativeKey : referenceKey, source.id, cfg, e]);
    if (!resolvedCache.has(signature)) { if (resolvedCache.size > 600) resolvedCache.clear(); resolvedCache.set(signature, RampLayout.apply(source, cfg, e)); }
    return resolvedCache.get(signature);
  }
  function columns() { return sources().map(resolve); }
  function active() { return resolve(sources().find(c => c.id === state.active) || sources()[0]); }
  function selected() { const cols = columns(); return state.selected.map(id => cols.find(c => c.id === id)).filter(Boolean); }
  function editFor(id) { const source = sources().find(c => c.id === id); return state.edits[id] || { name: source?.name || 'brand', hue: 0, chroma: 100 }; }
  function targetConfig() { return state.scope === 'active' ? configFor(state.active) : state.layout; }
  function mutableConfig() { if (state.scope === 'active') { if (!state.overrides[state.active]) state.overrides[state.active] = clone(state.layout); return state.overrides[state.active]; } return state.layout; }
  function customize(fn) { const cfg = mutableConfig(); if (cfg.native) { const c = active(); cfg.count = Math.max(3, Math.min(32, c.steps.length)); cfg.dark = Math.max(.1, +(c.labs.at(-1)[0] * 100).toFixed(1)); cfg.light = Math.min(99.9, +(c.labs[0][0] * 100).toFixed(1)); } cfg.native = false; fn(cfg); cfg.count = Math.max(3, Math.min(32, Math.round(cfg.count))); if (cfg.pin !== null && cfg.pin >= cfg.count) cfg.pin = null; }
  function setValue(id, value) { if (document.activeElement !== $(id)) $(id).value = value; }
  function renderControls() {
    const pal = palette(), col = active(), cfg = targetConfig(), e = editFor(state.active);
    setValue('project-name', state.title); setValue('seed', state.seed); $('color-picker').value = B.hex(Engine.parse(state.seed)).toLowerCase();
    const options = PALETTES.concat(state.imported).map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
    if ($('system').innerHTML !== options) $('system').innerHTML = options; $('system').value = state.palette;
    $('reference-meta').textContent = pal.steps.length + ' stops · ' + (pal.license || 'Imported');
    document.querySelectorAll('#fit-mode [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    $('shape-scope').value = state.scope;
    document.querySelectorAll('#layout-mode [data-native]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.native === 'true') === cfg.native)));
    $('custom-controls').classList.toggle('inactive', cfg.native);
    const count = cfg.native ? sources().find(c => c.id === state.active).steps.length : cfg.count;
    setValue('stop-count', count); setValue('stops-range', count);
    setValue('dark', cfg.native ? +(col.labs.at(-1)[0] * 100).toFixed(1) : cfg.dark); setValue('dark-range', cfg.native ? col.labs.at(-1)[0] * 100 : cfg.dark);
    setValue('light', cfg.native ? +(col.labs[0][0] * 100).toFixed(1) : cfg.light); setValue('light-range', cfg.native ? col.labs[0][0] * 100 : cfg.light);
    $('spacing').value = cfg.spacing; $('color-lock').checked = cfg.lock;
    $('anchor-position').innerHTML = '<option value="">Anchor: automatic</option>' + Array.from({ length: Math.max(3, count) - 2 }, (_, i) => '<option value="' + (i + 1) + '">Anchor: stop ' + (i + 2) + '</option>').join('');
    $('anchor-position').value = cfg.pin === null ? '' : String(cfg.pin);
    $('anchor-position').disabled = !cfg.lock;
    $('edit-title').textContent = col.name; $('edit-kind').textContent = col.kind === 'brand' ? 'BRAND' : col.modified ? 'EDITED' : 'REFERENCE';
    setValue('ramp-name', e.name); setValue('hue', e.hue); setValue('chroma', e.chroma);
    $('hue-value').value = e.hue + '°'; $('chroma-value').value = e.chroma + '%';
    $('color-adjustments').hidden = col.kind === 'brand';
    $('edit-hint').textContent = col.kind === 'brand' ? 'Select a companion ramp to fine-tune its hue and colorfulness.' : 'Hue and colorfulness apply to this ramp. Shape controls follow the scope above.';
    $('undo').disabled = !history.length; $('redo').disabled = !future.length;
    document.querySelectorAll('#background-toggle [data-background]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.background === state.background)));
    $('vision').value = state.vision;
    $('export-open').disabled = invalid; $('copy-ramp').disabled = invalid; $('suggest').disabled = invalid;
    document.body.classList.toggle('invalid', invalid);
  }
  function renderRamp() {
    const c = active(); $('active-name').textContent = c.name; $('active-dot').style.background = B.hex(c.labs[Math.floor(c.labs.length / 2)]);
    $('ramp-meta').textContent = c.steps.length + ' stops · ' + (configFor(c.id).native ? 'reference shape' : 'custom shape');
    $('ramp').innerHTML = c.labs.map((p, i) => {
      const hex = B.hex(p), text = B.contrast(hex, '#fffFFF') >= B.contrast(hex, '#000000') ? '#FFFFFF' : '#000000', anchor = c.anchorIndices.includes(i);
      return '<button class="swatch" role="listitem" data-color="' + hex + '" style="background:' + Engine.cssColor(...p, c.gamut) + ';color:' + text + '" aria-label="Copy ' + esc(c.name + ' ' + c.steps[i] + ', ' + hex) + (anchor ? ', input anchor' : '') + '" title="' + esc(B.ok(p)) + '"><span class="step">' + esc(c.steps[i]) + '</span>' + (anchor ? '<span class="anchor-ring" aria-hidden="true"></span>' : '') + '<span class="swatch-bottom"><span class="lightness">L ' + (p[0] * 100).toFixed(0) + '%</span><span class="hex">' + hex + '</span></span></button>';
    }).join('');
    if (c.kind === 'brand' && c.anchorIndices.length) {
      const i = c.anchorIndices[0], delta = Engine.dE(c.labs[i], c.input);
      $('anchor-note').innerHTML = icon('check') + (delta < .00001 ? 'Your color, kept at step ' : 'Input approximated at step ') + esc(c.steps[i]) + (delta < .00001 ? '.' : ' · ΔE ' + delta.toFixed(2));
    } else $('anchor-note').textContent = c.kind === 'brand' ? 'Reference neutral shape · ' + c.steps.length + ' stops' : (c.labs.at(-1)[0] * 100).toFixed(1) + '% – ' + (c.labs[0][0] * 100).toFixed(1) + '% lightness · ' + c.source;
    const notes = [...(c.notes || [])]; if (c.clipped) notes.push(c.clipped + ' stops were limited to the source gamut.');
    if (state.overrides[c.id]) notes.push('This ramp has its own shape override. Reset to reference clears it.');
    $('ramp-notice').hidden = !notes.length; $('ramp-notice').textContent = notes.join(' ');
  }
  function colors(c, cls) { return '<span class="' + cls + '">' + c.labs.map(p => '<i style="background:' + Engine.cssColor(...p, c.gamut || 'srgb') + '"></i>').join('') + '</span>'; }
  function renderPalette() {
    const cols = columns(); $('selected-count').textContent = state.selected.length; $('library-count').textContent = cols.length - 1;
    document.querySelectorAll('#library-tabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    $('search-box').hidden = state.view !== 'library';
    const shown = state.view === 'selected' ? selected() : cols.filter(c => c.id !== 'brand' && c.name.toLowerCase().includes(search.toLowerCase()));
    $('palette-grid').innerHTML = shown.length ? shown.map(c => {
      const included = state.selected.includes(c.id), overridden = !!state.overrides[c.id];
      return '<article class="palette-card' + (state.active === c.id ? ' active' : '') + '"><button class="card-open" data-open="' + esc(c.id) + '" aria-label="Edit ' + esc(c.name) + '" aria-pressed="' + (state.active === c.id) + '">' + colors(c, 'card-colors') + '<span class="card-meta"><strong>' + esc(c.name) + '</strong><small>' + c.steps.length + ' STOPS</small></span></button><div class="card-foot"><span>' + (c.id === 'brand' ? 'Your starting color' : overridden ? 'Custom shape' : c.modified ? 'Color adjusted' : c.neutral ? 'Neutral reference' : 'Reference color') + '</span>' + (c.id === 'brand' ? '<span class="included">✓ Included</span>' : '<button data-select="' + esc(c.id) + '" aria-label="' + (included ? 'Remove ' : 'Add ') + esc(c.name) + '">' + (included ? '✓ Included −' : '+ Add ramp') + '</button>') + '</div></article>';
    }).join('') : '<div class="empty-state">No matching colors. Try another name.</div>';
    $('browse').hidden = state.view === 'library';
    $('suggestions').hidden = !proposals.length;
    $('proposal-grid').innerHTML = proposals.map(c => '<article class="proposal">' + colors(c, 'card-colors') + '<div class="proposal-info"><strong>' + esc(c.name) + '</strong><button data-accept="' + esc(c.id) + '">+ Add</button></div></article>').join('');
  }
  function renderPreview() {
    const cols = selected(), rows = RampLayout.previewRows(cols, state.background, state.vision), dark = state.background === 'dark', bg = dark ? '#181818' : '#FFFFFF';
    $('preview-surface').classList.toggle('dark', dark);
    const brand = cols.find(c => c.id === 'brand') || cols[0], row = rows.find(r => r.id === brand.id);
    const role = i => RampLayout.previewRole(brand, i, state.background, state.vision);
    const surface = role(0), text = role(brand.steps.length - 1), muted = role(Math.max(0, brand.steps.length - 3)), border = role(Math.min(2, brand.steps.length - 1)), pale = surface.shown;
    const contrastWhite = B.contrast(row.shown, '#FFFFFF'), contrastBlack = B.contrast(row.shown, '#000000'), foreground = contrastWhite >= contrastBlack ? '#FFFFFF' : '#000000';
    const labelText = B.contrast(pale, row.shown) >= 4.5 ? row.shown : B.contrast(pale, text.shown) >= 4.5 ? text.shown : B.contrast(pale, '#000000') >= B.contrast(pale, '#FFFFFF') ? '#000000' : '#FFFFFF';
    $('component-preview').innerHTML = '<div class="preview-caption"><span>A LITTLE INTERFACE INSPIRATION</span><span class="tiny-dots">•••</span></div><span class="demo-label" data-step="' + esc(surface.step) + '" style="background:' + pale + ';color:' + labelText + '"><i style="background:' + labelText + '"></i> A FRESH PERSPECTIVE</span><h3 data-step="' + esc(text.step) + '" style="color:' + text.shown + '">Ideas look better<br>in your colors.</h3><p data-step="' + esc(muted.step) + '" style="color:' + muted.shown + '">From the first spark to the final detail,<br>make something that feels like you.</p><div class="demo-buttons"><button data-demo="primary" data-step="' + esc(row.step) + '" style="background:' + row.shown + ';color:' + foreground + '">Make something ' + icon('arrow') + '</button><button data-demo="secondary" data-step="' + esc(border.step) + '" style="color:' + text.shown + ';border-color:' + border.shown + '">A closer look</button></div><div class="demo-info" data-step="' + esc(surface.step) + '" style="background:' + pale + ';color:' + labelText + '">' + icon('check') + 'A little consistency goes a long way.</div>';
    $('preview-step-note').textContent = (dark ? 'Dark' : 'Light') + ' preview · Surface ' + brand.name + '-' + surface.step + ' · Accent ' + brand.name + '-' + row.step + (dark ? ' · Mirrored from the light-side positions.' : ' · Dark uses the matching positions from the opposite end.');
    const groups = [[56, 38, 74], [84, 65, 50], [63, 82, 40], [88, 68, 51], [70, 48, 82], [55, 72, 60]];
    $('chart').innerHTML = groups.map(values => '<span class="bar-group">' + rows.slice(0, 6).map((r, i) => '<i style="height:' + values[i % 3] + '%;background:' + r.shown + '" title="' + esc(r.name + ' · ' + r.step) + '"></i>').join('') + '</span>').join('');
    $('chart-legend').innerHTML = rows.slice(0, 6).map(r => '<span><i style="background:' + r.shown + '"></i>' + esc(r.name) + '</span>').join('');
    const pair = B.weakest(rows), ratio = B.contrast(row.shown, foreground);
    $('contrast-note').innerHTML = '<i></i>' + (state.vision === 'normal' ? 'Previewing original sRGB colors' : esc(state.vision) + ' simulation') + ' · Button text ' + ratio.toFixed(1) + ':1';
    $('metrics').innerHTML = rows.map(r => '<tr><td>' + esc(r.name) + ' <span class="mono">' + esc(r.step) + '</span></td><td><i class="color-dot" style="background:' + r.hex + '"></i>' + r.hex + (r.wide ? ' *' : '') + '</td><td>' + r.ratio.toFixed(2) + ':1</td><td>' + (r.ratio >= 4.5 ? 'Meets 4.5:1 text reference' : r.ratio >= 3 ? 'Meets 3:1 graphic reference' : 'Below 3:1') + '</td></tr>').join('');
    $('metrics-panel').querySelector('.hint').textContent = 'Chart colors and component accents use the same preview steps. Dark mirrors each light-side position from the opposite end of its ramp. Contrast uses the original displayed sRGB values on ' + bg + '. 4.5:1 is a normal-text reference; 3:1 is a large-text and graphic reference. ' + (pair ? 'Closest pair: ' + pair.a + ' / ' + pair.b + ' · ΔE OK ×100 ' + pair.distance.toFixed(1) + '. ' : '') + '* Wide-gamut value shown as an sRGB fallback. Simulations and distances do not certify accessibility.';
  }
  function exportColumns() { return state.exportScope === 'active' ? [active()] : state.exportScope === 'all' ? columns() : selected(); }
  function renderExport() { if (!$('export-dialog').open) return; const cols = exportColumns(); $('export-scope').value = state.exportScope; $('export-format').value = state.format; $('export-code').textContent = B.serialize(cols, state.format); $('export-summary').textContent = cols.length + ' ramps · ' + cols.reduce((n, c) => n + c.steps.length, 0) + ' colors · unique names generated automatically.'; $('export-copy').disabled = invalid; $('export-download').disabled = invalid; }
  function render() { sources(); renderControls(); renderRamp(); renderPalette(); renderPreview(); renderExport(); }
  function copy(text) { try { navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard.'), () => { $('export-code').focus(); toast('Copy is unavailable in this browser. Use Download instead.'); }); } catch { toast('Copy is unavailable. Use Download instead.'); } }
  function download(text, filename, type) { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function openDialog(id) { $(id).showModal(); }
  function setSystem(id) { const p = PALETTES.concat(state.imported).find(p => p.id === id); if (!p) return; state.palette = id; state.active = 'brand'; state.selected = ['brand']; state.edits = {}; state.overrides = {}; proposals = []; referenceKey = ''; nativeKey = ''; resolvedCache.clear(); }
  $('project-name').addEventListener('input', () => { beginGesture(); state.title = $('project-name').value.slice(0, 70); }); $('project-name').addEventListener('change', endGesture);
  function seedInput(value, immediate) {
    const lab = opaque(value); invalid = !lab; $('seed-error').hidden = !invalid; $('seed-error').textContent = invalid ? 'Enter a complete opaque hex, RGB, HSL, OKLCH, or Display P3 color.' : ''; $('seed').setAttribute('aria-invalid', String(invalid));
    if (!invalid) { beginGesture(); state.seed = value; proposals = []; }
    if (immediate) { render(); endGesture(); } else schedule();
  }
  $('seed').addEventListener('input', () => seedInput($('seed').value, false)); $('seed').addEventListener('change', () => seedInput($('seed').value, true));
  $('color-picker').addEventListener('input', () => { $('seed').value = $('color-picker').value.toUpperCase(); seedInput($('seed').value, false); }); $('color-picker').addEventListener('change', endGesture);
  $('system').addEventListener('change', () => { change(() => setSystem($('system').value)); toast('Reference changed. Undo restores your previous palette.'); });
  $('fit-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) change(() => { state.mode = b.dataset.mode; }); });
  $('shape-scope').addEventListener('change', () => { state.scope = $('shape-scope').value; renderControls(); persist(); });
  $('layout-mode').addEventListener('click', e => { const b = e.target.closest('[data-native]'); if (!b) return; change(() => { const cfg = mutableConfig(); if (cfg.native && b.dataset.native === 'false') { const c = active(); cfg.count = Math.max(3, Math.min(32, c.steps.length)); cfg.dark = Math.max(.1, +(c.labs.at(-1)[0] * 100).toFixed(1)); cfg.light = Math.min(99.9, +(c.labs[0][0] * 100).toFixed(1)); } cfg.native = b.dataset.native === 'true'; }); });
  function shapeInput(id, fn) { $(id).addEventListener('input', () => { beginGesture(); const value = Number($(id).value); if (Number.isFinite(value)) customize(cfg => fn(cfg, value)); proposals = []; schedule(); }); $(id).addEventListener('change', endGesture); }
  ['stop-count', 'stops-range'].forEach(id => shapeInput(id, (c, v) => { c.count = v; }));
  ['dark', 'dark-range'].forEach(id => shapeInput(id, (c, v) => { c.dark = Math.max(.1, Math.min(c.light - .1, v)); }));
  ['light', 'light-range'].forEach(id => shapeInput(id, (c, v) => { c.light = Math.min(99.9, Math.max(c.dark + .1, v)); }));
  $('stop-minus').addEventListener('click', () => change(() => customize(c => { c.count = (c.native ? active().steps.length : c.count) - 1; })));
  $('stop-plus').addEventListener('click', () => change(() => customize(c => { c.count = (c.native ? active().steps.length : c.count) + 1; })));
  $('spacing').addEventListener('change', () => change(() => customize(c => { c.spacing = $('spacing').value; })));
  $('color-lock').addEventListener('change', () => change(() => customize(c => { c.lock = $('color-lock').checked; })));
  $('anchor-position').addEventListener('change', () => change(() => customize(c => { c.pin = $('anchor-position').value === '' ? null : Number($('anchor-position').value); })));
  $('reset-shape').addEventListener('click', () => change(() => { if (state.scope === 'active') delete state.overrides[state.active]; else { state.layout = baseLayout(); state.overrides = {}; } toast('Reference shape restored.'); }));
  function editInput(id, field, numeric) { $(id).addEventListener('input', () => { beginGesture(); const e = { ...editFor(state.active) }; e[field] = numeric ? Number($(id).value) : $(id).value.slice(0, 60); state.edits[state.active] = e; proposals = []; schedule(); }); $(id).addEventListener('change', endGesture); }
  editInput('ramp-name', 'name', false); editInput('hue', 'hue', true); editInput('chroma', 'chroma', true);
  $('palette-grid').addEventListener('click', e => { const open = e.target.closest('[data-open]'), select = e.target.closest('[data-select]'); if (select) change(() => { const id = select.dataset.select; if (state.selected.includes(id)) state.selected = state.selected.filter(x => x !== id); else state.selected.push(id); }); else if (open) { state.active = open.dataset.open; render(); persist(); } });
  $('library-tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; renderPalette(); persist(); } });
  $('browse').addEventListener('click', () => { state.view = 'library'; search = ''; $('search').value = ''; renderPalette(); $('search').focus(); persist(); });
  $('search').addEventListener('input', () => { search = $('search').value; renderPalette(); });
  $('suggest').addEventListener('click', () => { proposals = RampLayout.suggest(columns().filter(c => c.id !== 'brand'), selected(), state.background, state.vision); renderPalette(); if (!proposals.length) toast('Every available color is already in your palette.'); });
  $('dismiss-suggestions').addEventListener('click', () => { proposals = []; renderPalette(); });
  $('proposal-grid').addEventListener('click', e => { const b = e.target.closest('[data-accept]'); if (!b) return; const remaining = proposals.filter(c => c.id !== b.dataset.accept); checkpoint(); if (!state.selected.includes(b.dataset.accept)) state.selected.push(b.dataset.accept); proposals = remaining; state.view = 'selected'; render(); persist(); toast('Companion added to your palette.'); });
  $('background-toggle').addEventListener('click', e => { const b = e.target.closest('[data-background]'); if (b) change(() => { state.background = b.dataset.background; }); });
  $('vision').addEventListener('change', () => change(() => { state.vision = $('vision').value; }));
  $('metrics-toggle').addEventListener('click', () => { $('metrics-panel').hidden = !$('metrics-panel').hidden; $('metrics-toggle').setAttribute('aria-expanded', String(!$('metrics-panel').hidden)); });
  $('ramp').addEventListener('click', e => { const b = e.target.closest('[data-color]'); if (b) copy(b.dataset.color); });
  $('component-preview').addEventListener('click', e => { const b = e.target.closest('[data-demo]'); if (!b) return; if (b.dataset.demo === 'primary') { openDialog('export-dialog'); renderExport(); } else { $('metrics-panel').hidden = false; $('metrics-toggle').setAttribute('aria-expanded', 'true'); toast('Contrast details are open below the preview.'); } });
  $('copy-ramp').addEventListener('click', () => { if (!invalid) copy(B.serialize([active()], 'oklch')); });
  $('export-open').addEventListener('click', () => { openDialog('export-dialog'); renderExport(); });
  $('export-format').addEventListener('change', () => { state.format = $('export-format').value; renderExport(); persist(); }); $('export-scope').addEventListener('change', () => { state.exportScope = $('export-scope').value; renderExport(); persist(); });
  $('export-copy').addEventListener('click', () => { if (!invalid) copy($('export-code').textContent); });
  $('export-download').addEventListener('click', () => { if (invalid) return; const ext = state.format === 'json' ? 'json' : state.format === 'tw3' ? 'js' : 'css'; download($('export-code').textContent, B.slug(state.title) + '.' + ext, state.format === 'json' ? 'application/json' : 'text/plain'); toast('Palette downloaded.'); });
  $('save-project').addEventListener('click', () => { if (invalid) { toast('Finish entering your color before saving.'); return; } download(JSON.stringify(state, null, 2), B.slug(state.title) + '.ramp.json', 'application/json'); toast('Editable project saved.'); });
  $('mobile-save-project').addEventListener('click', () => $('save-project').click());
  $('open-project').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async () => { const f = $('project-file').files[0]; if (!f) return; try { if (f.size > 1500000) throw Error('Choose a project smaller than 1.5 MB.'); const next = validate(JSON.parse(await f.text())); checkpoint(); state = next; nativeKey = ''; referenceKey = ''; resolvedCache.clear(); proposals = []; invalid = false; $('seed-error').hidden = true; render(); persist(); toast('Project restored, including all shapes and edits.'); } catch (e) { toast(e.message || 'This project could not be opened.'); } $('project-file').value = ''; });
  $('undo').addEventListener('click', undo); $('redo').addEventListener('click', redo);
  document.addEventListener('keydown', e => { const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); e.shiftKey ? redo() : undo(); } });
  document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
  $('help-open').addEventListener('click', () => openDialog('help-dialog'));
  function previewImport() { importResult = Importer.analyse($('import-text').value, { name: $('import-name').value }); if (importResult.ok && !validPalette(importResult.pal)) importResult = { ok: false, error: 'Use 4–90 colored ramps with 3–64 complete steps.' }; $('import-status').textContent = importResult.ok ? importResult.nRamps + ' colored ramps · ' + importResult.nSteps + ' steps. ' + importResult.notes.join(' · ') : importResult.error; $('import-add').disabled = !importResult.ok; }
  $('import-open').addEventListener('click', () => { openDialog('import-dialog'); previewImport(); }); $('import-text').addEventListener('input', previewImport); $('import-name').addEventListener('input', previewImport);
  $('import-add').addEventListener('click', () => { previewImport(); if (!importResult?.ok) return; if (state.imported.length >= 12) { toast('This project already has 12 imported references.'); return; } const p = importResult.pal; change(() => { state.imported.push(p); setSystem(p.id); }); $('import-dialog').close(); toast('Your reference palette is ready.'); });
  $('import-file-button').addEventListener('click', () => $('token-file').click());
  $('token-file').addEventListener('change', async () => { const f = $('token-file').files[0]; if (!f) return; try { if (f.size > 500000) throw Error('Choose a token file smaller than 500 KB.'); $('import-text').value = await f.text(); if ($('import-name').value === 'My palette') $('import-name').value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 60); previewImport(); } catch (e) { $('import-status').textContent = e.message; } $('token-file').value = ''; });
  window.ColorRampV2 = { state: () => clone(state), columns, active, selected, validate, undo, redo, project: () => JSON.stringify(state, null, 2), load: value => { state = validate(value); nativeKey = ''; referenceKey = ''; resolvedCache.clear(); clearInvalid(); proposals = []; render(); persist(); } };
  render(); persist();
})();
