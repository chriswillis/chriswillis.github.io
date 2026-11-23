// Chart colors for Color Ramp v2: categorical sequences, and sequential and diverging scales.
// Pure functions over the Palette DNA engine, so the same code runs in the page and in node for testing.
var ChartSeq = (function () {
  'use strict';
  var SIMS = ['normal', 'protanopia', 'deuteranopia'];
  // Published sequences used only as hue orders; the colors themselves always come from the reference palette.
  var TEMPLATES = {
    tol: { name: 'Tol bright order', colors: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377'] },
    t12: { name: 'Tsitsulin 12 order', colors: ['#EBAC23', '#B80058', '#008CF9', '#006E00', '#00BBAD', '#D163E6', '#B24502', '#FF9287', '#5954D6', '#00C6F8', '#878500', '#00A76C'] }
  };
  var COLLIDE_DEG = 20;   // a reference hue this close to the brand reads as the same color
  var LINE_MIN_L = 0.5;    // on a light background, lines and dots use no step darker than this Oklab lightness
  var DULL = 0.62;        // a step darker than the ramp's most colorful one is skipped once its chroma falls under this share of the peak
  var DISTINCT = 8;       // ΔE OK ×100 that every pair must reach to count as comfortably distinct

  function make(E, B) {
    function hx(l) { return E.hex(l[0], l[1], l[2]); }
    function Y(l) { return E.Y(l[0], l[1], l[2]); }
    function ratio(a, b) { return E.cr(Y(a), Y(b)); }
    function chroma(l) { return Math.hypot(l[1], l[2]); }
    function hueDeg(l) { return (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360; }
    function hueGap(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
    function simLabs(l) { var h = hx(l); return SIMS.map(function (m) { return E.parse(m === 'normal' ? h : B.simulate(h, m)); }); }
    function apart(a, b) { var d = 1e9, w = 0; for (var i = 0; i < SIMS.length; i++) { var v = E.dE(a.sim[i], b.sim[i]); if (v < d) { d = v; w = i; } } return [d, w]; }
    function peakLab(c) { var best = c.labs[0], bc = -1; c.labs.forEach(function (l) { var ch = chroma(l); if (ch > bc) { bc = ch; best = l; } }); return best; }

    // ---- which hues take part ----
    // The brand plus every hued reference ramp, minus any ramp whose hue sits within COLLIDE_DEG of the brand.
    function sources(o) {
      var p = o.pal, bp = peakLab(o.brand), bh = hueDeg(bp), grey = chroma(bp) < 0.04, keep = [o.brand], dropped = [];
      o.brand.hue = bh;
      Object.keys(p.ramps).forEach(function (n) {
        var raw = p.ramps[n], c = { id: n, name: n, steps: p.steps.slice(0, raw.length), labs: raw.map(E.parse), gamut: 'srgb' };
        c.hue = hueDeg(peakLab(c));
        // Tone: scale the reference's chroma to the brand's own colorfulness, so companions are as soft or as vivid as the brand.
        if (o.tone && o.tone < 0.98) { var tc = B.transform(c, 0, o.tone); c.labs = tc.labs; c.tone = o.tone; }
        if (!grey && hueGap(c.hue, bh) < COLLIDE_DEG) dropped.push(n); else keep.push(c);
      });
      return { keep: keep, dropped: dropped };
    }

    // ---- hue order: fixed per brand and reference, independent of background and chart type ----
    function farthestOrder(start, rest, anchor, hw) {
      if (hw === undefined) hw = 0.5;
      var rep = function (c) { return { c: c, sim: simLabs(c.labs[Math.min(anchor, c.labs.length - 1)]) }; };
      var order = start.map(rep), pool = rest.map(rep);
      while (pool.length) {
        var bi = 0, bs = -1;
        pool.forEach(function (x, k) { var d = 1e9; order.forEach(function (q) { d = Math.min(d, (1 - hw) * E.dE(x.sim[0], q.sim[0]) + hw * apart(x, q)[0]); }); if (d > bs) { bs = d; bi = k; } });
        order.push(pool.splice(bi, 1)[0]);
      }
      return order.map(function (x) { return x.c; });
    }
    function hueOrder(o, src) {
      var brand = src[0], refs = src.slice(1), tpl = TEMPLATES[o.order];
      if (!tpl) return farthestOrder([brand], refs, o.brand.anchor, o.order === 'cvd' ? 0.85 : 0.5);
      // Template: find the slot nearest the brand's hue, rotate the published order to start there,
      // then fill each following slot with the nearest unused reference hue (skipped if none is within 35°).
      var th = tpl.colors.map(function (h) { return hueDeg(E.parse(h)); }), n = th.length, bs = 0, bd = 1e9;
      th.forEach(function (h, i) { var d = hueGap(h, brand.hue); if (d < bd) { bd = d; bs = i; } });
      var out = [brand], left = refs.slice();
      for (var i = 1; i < n; i++) {
        var h = th[(bs + i) % n], bi = -1, gd = 35;
        left.forEach(function (c, k) { var d = hueGap(c.hue, h); if (d < gd) { gd = d; bi = k; } });
        if (bi >= 0) out.push(left.splice(bi, 1)[0]);
      }
      return farthestOrder(out, left, o.brand.anchor);
    }

    // ---- which steps a hue may use for this mark and background ----
    // Bars are large: lighter half of the ramp on light, darker half on dark, never under 1.5:1. Dark steps that have
    // lost their color are skipped: past 700 in Tailwind, yellows read as dull brown and greens as olive-black.
    // Lines and dots are small, so they need vivid color. On dark: the more colorful steps that reach 3:1.
    // On light: the more colorful steps from the middle of the ramp (about 400 to 600 in Tailwind), plus a later step
    // only if it is still light, and never under 2:1. Darker steps read as muddy near-black lines. A light hue such
    // as yellow may then sit under 3:1. If a hue has no such step, the rule relaxes for that hue alone.
    function allowed(c, o, relax) {
      var key = c.id + '|' + (relax || ''), hit = o.cache[key]; if (hit) return hit;
      var small = o.mark !== 'bars', n = c.labs.length, mid = Math.floor((n - 1) / 2), pk = peakLab(c), peak = chroma(pk), pkL = pk[0], out = [], bgSim = simLabs(o.bg)[0];
      var e3 = -1, er = 1e9; c.labs.forEach(function (l, k) { var r = ratio(l, o.bg); if (r >= 3 && r < er) { er = r; e3 = k; } });
      c.labs.forEach(function (l, k) {
        var r = ratio(l, o.bg), ch = chroma(l);
        var dull = l[0] < pkL && ch < DULL * peak;
        var ok = !small ? (r >= 1.5 && (relax === 'any' || ((o.dark ? k >= mid : k <= mid) && !dull)))
          : o.dark ? (r >= 3 && (relax || ch >= 0.7 * peak))
          : relax === 'all' ? r >= 1.5 : relax === 'any' ? (r >= 2 && l[0] >= LINE_MIN_L - 0.05) : relax ? r >= 2
          : (r >= 2 && ch >= 0.7 * peak && l[0] >= LINE_MIN_L && (k <= mid + 1 || l[0] >= LINE_MIN_L + 0.05));
        if (!ok) return;
        // Edge for soft fills: the first step at 3:1, pulled one step back toward the fill so it does not outweigh it.
        var e = e3; if (e >= 0 && Math.abs(e - k) > 1) e += k > e ? 1 : -1;
        var s = simLabs(l);
        out.push({ c: c, k: k, lab: l, hex: hx(l), r: r, ch: ch, sim: s, w: E.dE(s[0], bgSim), edge: e >= 0 && e !== k && r < 3 ? hx(c.labs[e]) : null, edgeR: e >= 0 ? ratio(c.labs[e], o.bg) : 0 });
      });
      o.cache[key] = out; return out;
    }
    function options(c, o) { var a = allowed(c, o); if (!a.length) a = allowed(c, o, 'any'); if (!a.length) a = allowed(c, o, 'all'); return a; }

    // Visual weight = how far a color sits from the background in Oklab (lightness and chroma together).
    // Even mode pulls every series toward the brand's weight; big-fish mode grades the target from heavy to light.
    function wfit(x, target, o) {
      // Light lines: among the allowed vivid steps, lean toward the one that reaches 3:1.
      var vis = o.mark !== 'bars' && !o.dark ? Math.pow(Math.min(1, x.r / 3), 2) : 1;
      if (!o.even && !o.fish) return o.mark === 'bars' ? Math.min(1, x.r / 2.5) * Math.min(1, 6 / x.r) : vis;
      var s = (o.sigma || 0.3) * (o.mark === 'bars' ? 1 : 2.3), q = Math.log(x.w / target); return vis * Math.exp(-(q * q) / (2 * s * s));
    }
    function targets(base, n, o) {
      var out = [], i;
      if (!o.fish) { for (i = 0; i < n; i++) out.push(base); return out; }
      var hi = base * 1.3, lo = base * 0.7; for (i = 0; i < n; i++) out.push(n > 1 ? hi * Math.pow(lo / hi, i / (n - 1)) : hi); return out;
    }
    function score(x, seq, i, tgt, o) {
      var d = 1e9; seq.forEach(function (s, j) { if (j === i || !s) return; d = Math.min(d, apart(x, s)[0] * (Math.abs(j - i) === 1 ? 0.85 : 1)); });
      return (d === 1e9 ? 1 : d) * wfit(x, tgt, o);
    }

    // ---- the sequence for exactly n series ----
    function sequence(o, order, n) {
      var hues = []; for (var i = 0; hues.length < n && i < order.length * 3; i++) hues.push(order[i % order.length]);
      var first = options(o.brand, o); if (!first.length) return [];
      var a = o.brand.anchor, base = first.slice().sort(function (p, q) { return Math.abs(p.k - a) - Math.abs(q.k - a) || q.ch - p.ch; })[0];
      var tg = targets(base.w, hues.length, o), seq = [];
      seq[0] = o.fish ? first.slice().sort(function (p, q) { return Math.abs(Math.log(p.w / tg[0])) - Math.abs(Math.log(q.w / tg[0])); })[0] : base;
      var free = function (x, at) { return !seq.some(function (s, j) { return j !== at && s && s.c === x.c && s.k === x.k; }); };
      for (var s = 1; s < hues.length; s++) {
        var cand = options(hues[s], o).filter(function (x) { return free(x, s); }); if (!cand.length) { hues.splice(s, 1); tg.splice(s, 1); s--; continue; }
        var best = cand[0], bs = -1; cand.forEach(function (x) { var sc = score(x, seq, s, tg[s], o); if (sc > bs) { bs = sc; best = x; } }); seq[s] = best;
      }
      // Polish: each series after the first re-picks its step against all the others. Hues and order never change.
      for (var sweep = 0; sweep < 3; sweep++) for (var t = 1; t < seq.length; t++) {
        var cur = seq[t], bb = cur, bv = -1;
        options(cur.c, o).filter(function (x) { return free(x, t); }).forEach(function (x) { var sc = score(x, seq, t, tg[t], o); if (sc > bv) { bv = sc; bb = x; } });
        seq[t] = bb;
      }
      return seq;
    }
    function minPair(seq) { var out = { d: 1e9, i: 0, j: 0, w: 0 }; for (var i = 0; i < seq.length; i++) for (var j = i + 1; j < seq.length; j++) { var a = apart(seq[i], seq[j]); if (a[0] < out.d) out = { d: a[0], i: i, j: j, w: a[1] }; } return out; }
    function other(o, seq) {
      var p = o.pal, raw = p.neutrals && p.neutrals[p.neutral]; if (!raw) return null;
      var c = { id: '~' + p.neutral, name: p.neutral, steps: (p.neutralSteps && p.neutralSteps[p.neutral]) || p.steps.slice(0, raw.length), labs: raw.map(E.parse) };
      var cand = allowed(c, o, true), want = o.mark === 'bars' ? 2.2 : 3.5;
      return cand.length ? cand.slice().sort(function (a, b) { return Math.abs(a.r - want) - Math.abs(b.r - want); })[0] : null;
    }

    // o: { brand:{labs,steps,anchor,brand:true,id,name}, pal, bg, dark, mark, n, order:'far'|'cvd'|'tol'|'t12', even, fish, sigma, tone }
    function plan(o) {
      o.cache = {};
      var src = sources(o), order = hueOrder(o, src.keep), seq = sequence(o, order, o.n), cap = 1;
      for (var n = 2; n <= 12; n++) { var s = n === o.n ? seq : sequence(o, order, n); if (s.length === n && minPair(s).d >= DISTINCT) cap = n; }
      var ws = seq.map(function (x) { return x.w; });
      return { seq: seq, other: other(o, seq), dropped: src.dropped, hues: order.map(function (c) { return c.name; }), pair: seq.length > 1 ? minPair(seq) : null, cap: cap,
        spread: ws.length ? Math.max.apply(null, ws) / Math.min.apply(null, ws) : 1 };
    }
    // ================= ordered scales: sequential and diverging =================
    // Both run from the background outward: the low end (or the midpoint) sits near the background and the
    // extremes sit far from it, so they work the same way on light and on dark.
    function lerp(p, q, f) { return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]; }
    function curveOf(labs) {
      var pts = labs.slice().sort(function (a, b) { return b[0] - a[0]; }), n = pts.length;
      return { hi: pts[0][0], lo: pts[n - 1][0], at: function (L) {
        if (L >= pts[0][0]) return pts[0].slice(); if (L <= pts[n - 1][0]) return pts[n - 1].slice();
        for (var i = 0; i < n - 1; i++) if (L <= pts[i][0] && L >= pts[i + 1][0]) return lerp(pts[i], pts[i + 1], (pts[i][0] - L) / ((pts[i][0] - pts[i + 1][0]) || 1));
        return pts[n - 1].slice(); } };
    }
    // The lightness, starting from the background's side, where the curve first reaches `min` contrast against it.
    function nearL(cv, o, min) { var a = o.dark ? cv.lo : cv.hi, b = o.dark ? cv.hi : cv.lo; for (var i = 0; i <= 200; i++) { var L = a + (b - a) * i / 200; if (ratio(cv.at(L), o.bg) >= min) return L; } return a; }
    // n colors at equal perceptual distance along a curve between two lightness values.
    function evenPath(at, L0, L1, n) {
      var K = 160, pts = [], cum = [0], i; for (i = 0; i <= K; i++) pts.push(at(L0 + (L1 - L0) * i / K));
      for (i = 1; i <= K; i++) cum.push(cum[i - 1] + E.dE(pts[i - 1], pts[i]));
      var out = [], j = 0; for (i = 0; i < n; i++) { var want = n > 1 ? cum[K] * i / (n - 1) : 0; while (j < K - 1 && cum[j + 1] < want) j++; out.push(lerp(pts[j], pts[j + 1], (want - cum[j]) / ((cum[j + 1] - cum[j]) || 1))); }
      return out;
    }
    function dress(labs, o) { return labs.map(function (l) { return { lab: l, hex: hx(l), sim: simLabs(l), r: ratio(l, o.bg) }; }); }
    function adjacent(cols) {
      var m = { d: 1e9, i: 0, w: 0 }, lo = 1e9, hi = 0, dl = 1e9, mono = true, dir = 0;
      for (var i = 1; i < cols.length; i++) {
        var a = apart(cols[i - 1], cols[i]); if (a[0] < m.d) m = { d: a[0], i: i - 1, w: a[1] };
        var n = E.dE(cols[i - 1].sim[0], cols[i].sim[0]); lo = Math.min(lo, n); hi = Math.max(hi, n);
        var g = cols[i].lab[0] - cols[i - 1].lab[0]; dl = Math.min(dl, Math.abs(g) * 100); if (!dir) dir = g < 0 ? -1 : 1; else if ((g < 0 ? -1 : 1) !== dir) mono = false;
      }
      return { min: m, even: lo > 0 ? hi / lo : 1, greyStep: dl, mono: mono };
    }
    function wrapPi(x) { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; }
    // A curve that drifts in hue as it darkens: toward the naturally lighter neighbor hue at the light end and
    // the other neighbor at the dark end, passing through the brand's own hue at the brand's lightness.
    function shiftCurve(o) {
      var M = o.M, sd = o.seed, th = M.thetaU, nL = th.length, sg = M.seg(sd.u), i = sg[0], f = sg[1];
      var pi = f < 0.15 ? (i - 1 + nL) % nL : i, ni = f > 0.85 ? (i + 2) % nL : (i + 1) % nL, lim = 0.6;
      var dp = Math.max(-lim, Math.min(-0.05, wrapPi(th[pi] - sd.u))), dn = Math.min(lim, Math.max(0.05, wrapPi(th[ni] - sd.u)));
      var lightIsNext = (M.loft[ni].peakL || 0) >= (M.loft[pi].peakL || 0), dLight = lightIsNext ? dn : dp, dDark = lightIsNext ? dp : dn;
      var bc = curveOf(o.brand.labs), La = Math.min(bc.hi - 0.02, Math.max(bc.lo + 0.02, sd.L)), s = Math.min(1, sd.s || 1);
      var at = function (L) {
        var LL = Math.min(M.Lp - 2e-3, Math.max(M.Lk + 2e-3, L)), u = L >= La ? sd.u + dLight * (L - La) / ((bc.hi - La) || 1) : sd.u + dDark * (La - L) / ((La - bc.lo) || 1);
        var p = M.point(u, LL, s); return [p.L, p.a, p.b]; };
      return { hi: bc.hi, lo: bc.lo, at: at, toward: [M.loft[lightIsNext ? ni : pi].name, M.loft[lightIsNext ? pi : ni].name] };
    }
    function seqBuild(o, n, variant) {
      var cv = variant === 'shift' ? shiftCurve(o) : curveOf(o.brand.labs), L0 = nearL(cv, o, 1.15), L1 = o.dark ? cv.hi : cv.lo;
      return { cols: dress(evenPath(cv.at, L0, L1, n), o), smooth: evenPath(cv.at, L0, L1, 33).map(hx), toward: cv.toward || null };
    }
    function tonedRamp(o, name) {
      var raw = o.pal.ramps[name], c = { id: name, name: name, labs: raw.map(E.parse), gamut: 'srgb' };
      if (o.tone && o.tone < 0.98) c.labs = B.transform(c, 0, o.tone).labs; return c;
    }
    // Where a diverging arm should stop: the far side of the ramp's most colorful point, at the lightness where
    // chroma has fallen to 60% of that peak. Going further only adds near-black or near-white, where the two sides look alike.
    function farL(cv, o) {
      var K = 120, best = cv.hi, pk = -1, i, L; for (i = 0; i <= K; i++) { L = cv.hi + (cv.lo - cv.hi) * i / K; var ch = chroma(cv.at(L)); if (ch > pk) { pk = ch; best = L; } }
      var end = o.dark ? cv.hi : cv.lo; for (i = 0; i <= K; i++) { L = best + (end - best) * i / K; if (chroma(cv.at(L)) < 0.6 * pk) return L; } return end;
    }
    function divLevels(o, n, bc, pc) {
      var p = o.pal, nraw = p.neutrals && p.neutrals[p.neutral], nc = nraw ? curveOf(nraw.map(E.parse)) : null;
      var Lc = nc ? nearL(nc, o, 1.12) : (o.dark ? Math.max(bc.lo, pc.lo) : Math.min(bc.hi, pc.hi)), Lfar = o.dark ? Math.min(farL(bc, o), farL(pc, o)) : Math.max(farL(bc, o), farL(pc, o));
      var h = Math.floor(n / 2), odd = n % 2 === 1, Ls = []; for (var j = 1; j <= h; j++) Ls.push(Lc + (Lfar - Lc) * (odd ? j / h : (j - 0.5) / h));
      return { Ls: Ls, center: odd ? (nc ? nc.at(Lc) : [Lc, 0, 0]) : null, Lc: Lc, Lfar: Lfar, nc: nc };
    }
    function divBuild(o, n, partner) {
      var bc = curveOf(o.brand.labs), pc = curveOf(tonedRamp(o, partner).labs), lv = divLevels(o, n, bc, pc);
      var left = lv.Ls.map(function (L) { return pc.at(L); }).reverse(), right = lv.Ls.map(function (L) { return bc.at(L); });
      var cols = dress(left.concat(lv.center ? [lv.center] : [], right), o), h = lv.Ls.length, gap = { d: 1e9, j: 0, w: 0 };
      for (var j = 0; j < h; j++) { var a = apart(cols[h - 1 - j], cols[cols.length - h + j]); if (a[0] < gap.d) gap = { d: a[0], j: j + 1, w: a[1] }; }
      var K = 16, sm = [], k; for (k = K; k >= 1; k--) sm.push(hx(pc.at(lv.Lc + (lv.Lfar - lv.Lc) * k / K)));
      sm.push(hx(lv.nc ? lv.nc.at(lv.Lc) : lerp(pc.at(lv.Lc), bc.at(lv.Lc), 0.5))); for (k = 1; k <= K; k++) sm.push(hx(bc.at(lv.Lc + (lv.Lfar - lv.Lc) * k / K)));
      return { cols: cols, smooth: sm, gap: gap, h: h };
    }
    // Partners for a diverging scale: every reference hue at least 60° from the brand, ranked by how far the two
    // sides stay apart at matched lightness for normal, protan and deutan vision (the innermost class is ignored).
    function partners(o) {
      var bh = hueDeg(peakLab(o.brand)), out = [];
      Object.keys(o.pal.ramps).forEach(function (name) {
        var c = tonedRamp(o, name); if (hueGap(hueDeg(peakLab(c)), bh) < 60) return;
        var r = divBuild(o, 9, name), d = 1e9, h = r.h;
        for (var j = 1; j < h; j++) d = Math.min(d, apart(r.cols[h - 1 - j], r.cols[r.cols.length - h + j])[0]);
        out.push({ name: name, score: d });
      });
      return out.sort(function (a, b) { return b.score - a.score; });
    }
    // o: { kind:'seq'|'div', brand, pal, M, seed, bg, dark, n, variant:'auto'|'single'|'shift', partner:'auto'|name, tone }
    function scale(o) {
      var res, used, list = null, mk;
      if (o.kind === 'seq') {
        var canShift = !!(o.M && o.seed && !o.seed.neutral), pick = o.variant;
        if (pick === 'auto' || (pick === 'shift' && !canShift)) {
          pick = 'single';
          if (canShift && o.variant === 'auto') { var a = adjacent(seqBuild(o, o.n, 'single').cols).min.d, b = adjacent(seqBuild(o, o.n, 'shift').cols).min.d; if (b > a * 1.05) pick = 'shift'; }
        }
        used = pick; mk = function (n) { return seqBuild(o, n, pick); };
      } else {
        list = partners(o); if (!list.length) return null;
        used = o.partner !== 'auto' && list.some(function (p) { return p.name === o.partner; }) ? o.partner : list[0].name;
        mk = function (n) { return divBuild(o, n, used); };
      }
      res = mk(o.n); var st = adjacent(res.cols), cap = 2;
      for (var n = 3; n <= 12; n++) { if (adjacent(mk(n).cols).min.d >= DISTINCT) cap = n; }
      return { kind: o.kind, cols: res.cols, smooth: res.smooth, used: used, partners: list, toward: res.toward || null, gap: res.gap || null, adj: st, cap: cap };
    }
    return { plan: plan, scale: scale, simLabs: simLabs, apart: apart, SIMS: SIMS };
  }
  return { make: make, TEMPLATES: TEMPLATES, DISTINCT: DISTINCT, COLLIDE_DEG: COLLIDE_DEG };
})();
