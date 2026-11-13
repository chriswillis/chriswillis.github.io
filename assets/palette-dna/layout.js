// Ramp shapes: resample a finished ramp to a new stop count, lightness range or step spacing.
// Pure. The engine and the reference palettes stay unchanged, and a custom shape left at its
// starting values returns the source ramp exactly.
var RampLayout = (function () {
  'use strict';
  var MIN = 3, MAX = 32, EPS = 1e-9;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function pad(i) { return (i < 10 ? '0' : '') + i; }

  // A saved or linked shape → a clean one, or null (the reference's own steps).
  function normalize(s) {
    if (!s || typeof s !== 'object') return null;
    var count = Math.round(Number(s.count));
    if (!Number.isFinite(count)) return null;
    var out = { count: clamp(count, MIN, MAX), dark: null, light: null, spacing: s.spacing === 'even' ? 'even' : 'reference', lock: s.lock !== false };
    var d = Number(s.dark), l = Number(s.light);
    if (s.dark !== null && s.light !== null && Number.isFinite(d) && Number.isFinite(l)) {
      d = clamp(d, 0.1, 99.8); l = clamp(l, 0.2, 99.9);
      if (d < l) { out.dark = d; out.light = l; }
    }
    return out;
  }
  function labels(n, own) { if (n === own.length) return own.slice(); var out = []; for (var i = 1; i <= n; i++) out.push(pad(i)); return out; }
  function interp(src, t) {
    var x = clamp(t, 0, src.length - 1), i = Math.min(Math.floor(x), src.length - 2), f = x - i;
    if (f < EPS) return src[i].slice();
    return src[i].map(function (v, k) { return v + f * (src[i + 1][k] - v); });
  }
  // The source color at position t, moved to lightness L. Colorfulness keeps its share of the gamut limit.
  function sample(src, t, L, space) {
    var p = interp(src, t), same = Math.abs(L - p[0]) < EPS;
    if (same && Math.abs(t - Math.round(t)) < EPS) return p; // an authored step, unchanged
    var c = Math.hypot(p[1], p[2]);
    if (c < 1e-7) return [L, 0, 0];
    var h = Math.atan2(p[2], p[1]), now = Engine.maxC(L, h, space), was = same ? now : Engine.maxC(p[0], h, space);
    c = same ? Math.min(c, now) : was > 1e-6 ? Math.min(c / was, 1) * now : 0;
    return [L, c * Math.cos(h), c * Math.sin(h)];
  }

  // column: { steps, labs, gamut, anchors: [{ index }] }.
  // Returns { steps, labs, from, anchors: [{ index, from }], notes, shaped }, where `from` is the nearest source index.
  function apply(column, shape) {
    var labs = column.labs, len = labs.length, space = column.gamut || 'srgb', notes = [];
    var given = (column.anchors || []).map(function (a) { return a.index; });
    shape = normalize(shape);
    if (!shape || len < 2) {
      return { steps: column.steps.slice(), labs: labs.map(function (p) { return p.slice(); }), from: labs.map(function (_, i) { return i; }),
        anchors: given.map(function (i) { return { index: i, from: i }; }), notes: notes, shaped: false };
    }
    // Work light → dark. Ramps that run the other way are flipped back at the end;
    // ramps that are not ordered by lightness (some Radix scales) are sorted first.
    var order = labs.map(function (_, i) { return i; }), flipped = labs[0][0] < labs[len - 1][0];
    if (flipped) order.reverse();
    var sorted = order.every(function (ix, k) { return !k || labs[ix][0] <= labs[order[k - 1]][0] + EPS; });
    if (!sorted) {
      order = order.map(function (ix, k) { return [ix, k]; }).sort(function (a, b) { return labs[b[0]][0] - labs[a[0]][0] || a[1] - b[1]; }).map(function (x) { return x[0]; });
      notes.push('This ramp is not ordered by lightness in the reference, so its steps were sorted before reshaping.');
    }
    var src = order.map(function (ix) { return labs[ix]; }), n = shape.count;
    var hi = src[0][0], lo = src[len - 1][0], own = shape.dark === null;
    var high = own ? hi : shape.light / 100, low = own ? lo : shape.dark / 100;
    var seeds = shape.lock ? given.map(function (ix) { return order.indexOf(ix); }).filter(function (t) { return t >= 0; }).sort(function (a, b) { return a - b; }).slice(0, n) : [];
    seeds = seeds.filter(function (t, k) { return !k || src[t][0] < src[seeds[k - 1]][0] - EPS; });
    if (seeds.length) {
      var top = src[seeds[0]][0], bottom = src[seeds[seeds.length - 1]][0];
      if (top > high + EPS || bottom < low - EPS) notes.push('The lightness range was widened to keep your color.');
      high = Math.max(high, top); low = Math.min(low, bottom);
    }
    var span = hi - lo;
    function base(t, i) {
      var pos = shape.spacing === 'even' || span < 1e-8 ? i / (n - 1) : clamp((hi - interp(src, t)[0]) / span, 0, 1);
      return own && shape.spacing !== 'even' && span >= 1e-8 ? interp(src, t)[0] : high + (low - high) * pos;
    }
    // Each kept color claims the stop nearest its lightness, in order.
    var rough = [], i;
    for (i = 0; i < n; i++) rough.push(base(i * (len - 1) / (n - 1), i));
    var controls = [], prev = -1;
    seeds.forEach(function (t, j) {
      var min = prev + 1, max = n - (seeds.length - j), k = min, L = src[t][0];
      for (var q = min; q <= max; q++) if (Math.abs(rough[q] - L) < Math.abs(rough[k] - L)) k = q;
      controls.push({ i: k, t: t, L: L, seed: true }); prev = k;
    });
    if (!controls.length || controls[0].i !== 0) controls.unshift({ i: 0, t: 0, L: high });
    if (controls[controls.length - 1].i !== n - 1) controls.push({ i: n - 1, t: len - 1, L: low });
    // Between controls, positions move evenly by stop; lightness follows the chosen spacing, rescaled to meet each control.
    var ts = [], Ls = [];
    for (var s = 0; s < controls.length - 1 || (controls.length === 1 && s === 0); s++) {
      var a = controls[s], b = controls[s + 1] || a, steps = b.i - a.i;
      var ba = base(a.t, a.i), bb = base(b.t, b.i), d = bb - ba;
      for (i = a.i; i <= b.i; i++) {
        var f = steps ? (i - a.i) / steps : 0, t = a.t + f * (b.t - a.t);
        var u = Math.abs(d) > 1e-8 ? clamp((base(t, i) - ba) / d, 0, 1) : f;
        ts[i] = t; Ls[i] = i === a.i ? a.L : i === b.i ? b.L : a.L + u * (b.L - a.L);
      }
    }
    var out = [], from = [], anchors = [];
    for (i = 0; i < n; i++) {
      var c = controls.filter(function (x) { return x.seed && x.i === i; })[0];
      out.push(c ? src[c.t].slice() : sample(src, ts[i], Ls[i], space));
      from.push(order[clamp(Math.round(ts[i]), 0, len - 1)]);
      if (c) anchors.push({ index: i, from: order[c.t] });
    }
    if (flipped) { out.reverse(); from.reverse(); anchors = anchors.map(function (x) { return { index: n - 1 - x.index, from: x.from }; }).reverse(); }
    return { steps: labels(n, column.steps), labs: out, from: from, anchors: anchors, notes: notes, shaped: true };
  }
  return { MIN: MIN, MAX: MAX, normalize: normalize, apply: apply, labels: labels };
})();
