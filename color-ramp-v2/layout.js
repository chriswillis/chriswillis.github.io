/* V2 output layouts. The reference palettes and original Palette DNA engine are immutable. */
var RampLayout = (function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const clone = x => JSON.parse(JSON.stringify(x));
  function labels(n, native) { return n === native.length ? native.slice() : Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0')); }
  function interpolate(points, t) {
    const x = clamp(t, 0, points.length - 1), i = Math.min(Math.floor(x), points.length - 2), f = x - i;
    return points[i].map((v, k) => v + f * (points[i + 1][k] - v));
  }
  function gamut(lab, space) {
    if (Engine.inG(...lab, space)) return lab.slice();
    const h = Math.atan2(lab[2], lab[1]), c = Math.min(Math.hypot(lab[1], lab[2]), Engine.maxC(lab[0], h, space));
    return [lab[0], c * Math.cos(h), c * Math.sin(h)];
  }
  function apply(column, config, edit) {
    config = config || { native: true };
    edit = edit || { hue: 0, chroma: 100 };
    const out = clone(column), source = column.labs, length = source.length, space = column.gamut || 'srgb';
    let clipped = 0, notes = (column.notes || []).slice(), anchorIndices = [], samples;
    if (config.native || length < 2) {
      out.steps = column.steps.slice();
      samples = source.map(p => p.slice());
      anchorIndices = (column.anchors || []).map(a => a.index);
    } else {
      const n = clamp(Math.round(config.count || length), 3, 32);
      let low = clamp(Number(config.dark) / 100, .001, .998), high = clamp(Number(config.light) / 100, low + .001, .999);
      const anchors = config.lock !== false ? (column.anchors || []).slice().sort((a, b) => b.lab[0] - a.lab[0]) : [];
      if (anchors.length) {
        const before = [low, high];
        low = Math.min(low, ...anchors.map(a => a.lab[0]));
        high = Math.max(high, ...anchors.map(a => a.lab[0]));
        if (Math.abs(low - before[0]) > 1e-6 || Math.abs(high - before[1]) > 1e-6) notes.push('The range was expanded to keep your input color. Turn off the color lock to use the requested range.');
      }
      const first = source[0][0], last = source[length - 1][0], denom = first - last;
      const lightness = Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1), ref = interpolate(source, t * (length - 1))[0];
        const position = config.spacing === 'even' || Math.abs(denom) < 1e-8 ? t : clamp((first - ref) / denom, 0, 1);
        return high + (low - high) * position;
      });
      // Protect ordered lightness even for reference palettes with local reversals.
      for (let i = 1; i < n; i++) lightness[i] = Math.min(lightness[i - 1], lightness[i]);
      const assigned = [];
      anchors.slice(0, n).forEach((a, j) => {
        const min = j ? assigned[j - 1].index + 1 : 0, max = n - (anchors.length - j);
        let index = min;
        for (let i = min; i <= max; i++) if (Math.abs(lightness[i] - a.lab[0]) < Math.abs(lightness[index] - a.lab[0])) index = i;
        if (j === 0 && Number.isInteger(config.pin)) index = clamp(config.pin, min, max);
        assigned.push({ ...a, index });
      });
      const controls = assigned.map(a => ({ index: a.index, L: a.lab[0], t: (column.anchors || []).find(x => Engine.dE(x.lab, a.lab) < 1e-6)?.index ?? a.index * (length - 1) / (n - 1) }));
      if (!controls.length || controls[0].index !== 0) controls.unshift({ index: 0, L: high, t: 0 });
      if (controls.at(-1).index !== n - 1) controls.push({ index: n - 1, L: low, t: length - 1 });
      samples = lightness.map((L, i) => {
        let t = i * (length - 1) / (n - 1);
        if (assigned.length) {
          if (controls.length === 1) { L = controls[0].L; t = controls[0].t; }
          else for (let j = 0; j < controls.length - 1; j++) {
            const a = controls[j], b = controls[j + 1];
            if (i < a.index || i > b.index) continue;
            const d = lightness[b.index] - lightness[a.index];
            const f = Math.abs(d) > 1e-8 ? (lightness[i] - lightness[a.index]) / d : (i - a.index) / (b.index - a.index);
            L = a.L + f * (b.L - a.L); t = a.t + f * (b.t - a.t); break;
          }
        }
        const anchor = assigned.find(a => a.index === i);
        if (anchor) return anchor.lab.slice();
        const p = interpolate(source, t), h = Math.atan2(p[2], p[1]), c = Math.hypot(p[1], p[2]);
        // Retain the reference's fraction of available chroma at the new lightness.
        const oldMax = Engine.maxC(p[0], h, space), newMax = Engine.maxC(L, h, space);
        const colorfulness = oldMax > 1e-6 ? Math.min(c / oldMax, 1) * newMax : 0;
        return gamut([L, colorfulness * Math.cos(h), colorfulness * Math.sin(h)], space);
      });
      anchorIndices = assigned.map(a => a.index);
      out.steps = labels(n, column.steps);
      out.range = { dark: low * 100, light: high * 100 };
    }
    out.labs = samples.map((p, i) => {
      if (column.kind === 'brand' && config.lock !== false && anchorIndices.includes(i)) return p.slice();
      if (!edit.hue && (edit.chroma === undefined || edit.chroma === 100)) return p.slice();
      const h = Math.atan2(p[2], p[1]) + (edit.hue || 0) * Math.PI / 180, c = Math.hypot(p[1], p[2]) * (edit.chroma ?? 100) / 100;
      const mapped = gamut([p[0], c * Math.cos(h), c * Math.sin(h)], space);
      if (Math.abs(Math.hypot(mapped[1], mapped[2]) - c) > 1e-5) clipped++;
      return mapped;
    });
    out.name = edit.name || column.name;
    out.anchorIndices = anchorIndices;
    out.notes = notes;
    out.clipped = clipped;
    out.modified = !config.native || !!edit.hue || (edit.chroma !== undefined && edit.chroma !== 100) || !!edit.name;
    return out;
  }
  function brand(pal, color, mode, name) {
    const M = Engine.build(pal, pal.neutral, pal.gamut), lab = Engine.parse(color), map = M.seedMap(lab);
    let labs, steps, anchors = [], notes = [];
    if (map.neutral) {
      labs = M.neutral.labs.map(p => p.slice()); steps = M.neutral.steps.slice();
      notes.push('This color is close to gray; the reference neutral ramp is used.');
    } else {
      const exact = M.loft.find(r => r.labs.some(p => Engine.dE(p, lab) < 1e-7));
      if (exact) {
        labs = exact.labs.map(p => p.slice()); steps = pal.steps.slice();
        anchors = [{ index: labs.findIndex(p => Engine.dE(p, lab) < 1e-7), lab: lab.slice() }];
      } else {
        const result = M.genAnchors([{ lab, map }], { cap: mode === 'fit' });
        labs = result.map(p => [p.L, p.a, p.b]); steps = result.map(p => String(p.step));
        anchors = result.flatMap((p, i) => p.anchor ? [{ index: i, lab: labs[i].slice() }] : []);
      }
      const a = anchors[0];
      if (a && Engine.dE(a.lab, lab) > 1e-5) notes.push('The reference gamut or fit mode adjusted your input by ΔE OK ×100 ' + Engine.dE(a.lab, lab).toFixed(2) + '.');
    }
    return { id: 'brand', name: name || 'brand', source: pal.name, kind: 'brand', gamut: pal.gamut, steps, labs, anchors, input: lab, notes, relative: map.sRaw || 1 };
  }
  // Assign roles on light once, then count the same distance from the other end on dark.
  // Positions, rather than numeric labels, also support custom and semantic step names.
  function previewIndex(column, lightIndex, background) {
    const last = column.labs.length - 1, index = clamp(Math.round(lightIndex), 0, last);
    return background === 'dark' ? last - index : index;
  }
  function previewRole(column, lightIndex, background, vision) {
    const index = previewIndex(column, lightIndex, background), lab = column.labs[index], hex = PaletteBuilder.hex(lab);
    return { index, step: column.steps[index], lightStep: column.steps[clamp(Math.round(lightIndex), 0, column.steps.length - 1)], hex, shown: PaletteBuilder.simulate(hex, vision) };
  }
  function previewRows(columns, background, vision) {
    const choices = Object.fromEntries(columns.map(c => {
      const lightIndex = PaletteBuilder.chartIndex(c, 'light', null);
      return [c.id, c.steps[previewIndex(c, lightIndex, background)]];
    }));
    return PaletteBuilder.chartRows(columns, background, vision, choices);
  }
  function suggest(refs, selected, background, vision) {
    const pool = refs.filter(c => !c.neutral && !selected.some(s => s.id === c.id)), result = [], picked = selected.slice();
    const modes = vision === 'normal' ? ['normal', 'protanopia', 'deuteranopia', 'tritanopia'] : [vision];
    while (result.length < 3 && pool.length) {
      let best = 0, max = -Infinity;
      pool.forEach((c, i) => {
        let score = Infinity;
        modes.forEach(mode => {
          const row = previewRows([c], background, mode)[0];
          previewRows(picked, background, mode).forEach(other => { score = Math.min(score, Engine.dE(row.lab, other.lab)); });
          score -= Math.max(0, 3 - row.ratio) * 2;
        });
        if (score > max) { max = score; best = i; }
      });
      const next = pool.splice(best, 1)[0]; result.push(next); picked.push(next);
    }
    return result;
  }
  return { apply, brand, labels, gamut, previewIndex, previewRole, previewRows, suggest };
})();
