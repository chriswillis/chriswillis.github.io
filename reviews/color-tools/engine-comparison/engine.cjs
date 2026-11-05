var Engine = (function () {
  var PI2 = Math.PI * 2;

  // ---------------- color math ----------------
  function s2l(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function tr(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
  function cl(v) { return Math.min(Math.max(v, 0), 1); }
  function lin2lab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function lab2lin(L, a, b) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b, s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  // linear sRGB -> linear Display P3
  var S2P = [[0.8224621, 0.177538, 0.0], [0.0331941, 0.9668058, 0.0], [0.0170827, 0.0723974, 0.9105199]];
  function inv3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
            [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  var P2S = inv3(S2P);
  function mul(m, v) { return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]]; }
  function inG(L, a, b, g) {
    var c = lab2lin(L, a, b); if (g === 'p3') c = mul(S2P, c);
    return c[0] >= -1e-4 && c[0] <= 1.0001 && c[1] >= -1e-4 && c[1] <= 1.0001 && c[2] >= -1e-4 && c[2] <= 1.0001;
  }
  function maxC(L, H, g) {
    var ca = Math.cos(H), sa = Math.sin(H), lo = 0, hi = 0.5;
    for (var n = 0; n < 30; n++) { var mid = (lo + hi) / 2; if (inG(L, mid * ca, mid * sa, g)) lo = mid; else hi = mid; }
    return lo;
  }
  function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  // CSS color parser: hex (3/4/6/8), rgb(), hsl(), oklch(), oklab(), color(srgb | srgb-linear | display-p3 …). Alpha is read but ignored.
  function num(tok, pctScale) { tok = String(tok).trim(); if (tok === 'none') return 0; if (/%$/.test(tok)) return parseFloat(tok) / 100 * pctScale; return parseFloat(tok); }
  function hue(tok) { tok = String(tok).trim(); if (tok === 'none') return 0; var v = parseFloat(tok); if (/turn$/.test(tok)) return v * 360; if (/grad$/.test(tok)) return v * 0.9; if (/rad$/.test(tok) && !/grad$/.test(tok)) return v * 180 / Math.PI; return v; }
  function args(inner) { return inner.replace(/\//g, ' / ').replace(/,/g, ' ').trim().split(/\s+/).filter(function (t) { return t && t !== '/'; }); }
  function alphaOf(s) {
    s = String(s).trim().toLowerCase();
    if (s[0] === '#') { var h = s.slice(1); if (h.length === 4) return parseInt(h[3] + h[3], 16) / 255; if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255; return 1; }
    var m = s.match(/\(([^)]*)\)/); if (!m) return 1;
    var inner = m[1];
    if (inner.indexOf('/') >= 0) return num(inner.split('/')[1], 1);
    var a = args(inner); if (/^(rgba?|hsla?)/.test(s) && a.length >= 4) return num(a[3], 1);
    return 1;
  }
  // Validate the complete value before converting; never let NaN enter a model.
  function parse(s) {
    s = String(s).trim().toLowerCase();
    if (s[0] === '#') {
      if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) throw new Error('Invalid hex color: ' + s);
    } else {
      var m = s.match(/^(rgb|rgba|hsl|hsla|oklch|oklab|color)\(([^()]*)\)$/);
      if (!m) throw new Error('Unsupported color: ' + s);
      var body = m[2], fn = m[1];
      if (fn === 'color') {
        var space = body.trim().match(/^(display-p3|srgb-linear|srgb)\s+(.+)$/);
        if (!space) throw new Error('Unsupported color space');
        body = space[2];
      }
      var parts = body.split('/'), comma = body.indexOf(',') >= 0;
      if (parts.length > 2 || (comma && (parts.length > 1 || !/^(rgb|rgba|hsl|hsla)$/.test(fn)))) throw new Error('Invalid color separators');
      var channels = comma ? body.split(',').map(function (x) { return x.trim(); }) : parts[0].trim().split(/\s+/);
      var alpha = parts.length === 2 ? parts[1].trim() : null;
      if (comma && channels.length === 4) alpha = channels.pop();
      if (channels.length !== 3) throw new Error('A color needs three components');
      var numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/;
      channels.forEach(function (v, i) {
        var isHue = (fn === 'oklch' && i === 2) || (/^hsla?$/.test(fn) && i === 0);
        var valid = isHue ? /^(?:none|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:deg|grad|rad|turn)?)$/.test(v) : numeric.test(v) || v === 'none';
        if (!valid) throw new Error('Invalid color component: ' + v);
      });
      if (alpha !== null && (!numeric.test(alpha) || !Number.isFinite(num(alpha, 1)) || num(alpha, 1) < 0 || num(alpha, 1) > 1)) throw new Error('Alpha must be between 0 and 1');
    }
    var lab = parseRaw(s);
    if (!lab.every(Number.isFinite)) throw new Error('Color components must be finite');
    return lab;
  }
  function parseRaw(s) {
    s = String(s).trim().toLowerCase(); var m, a;
    if (s[0] === '#') {
      var h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (!/^[0-9a-f]{6,8}$/.test(h)) throw new Error('bad hex ' + s);
      var c = hexRgb(h.slice(0, 6)); return lin2lab(s2l(c[0]), s2l(c[1]), s2l(c[2]));
    }
    if ((m = s.match(/^rgba?\(([^)]*)\)/))) {
      a = args(m[1]); var r = [0, 1, 2].map(function (i) { return num(a[i], 255); });
      return lin2lab(s2l(r[0]), s2l(r[1]), s2l(r[2]));
    }
    if ((m = s.match(/^hsla?\(([^)]*)\)/))) {
      a = args(m[1]); var H = ((hue(a[0]) % 360) + 360) % 360, S = num(a[1], 1) > 1 ? num(a[1], 1) / 100 : num(a[1], 1), Lh = num(a[2], 1) > 1 ? num(a[2], 1) / 100 : num(a[2], 1);
      if (/%/.test(a[1])) S = parseFloat(a[1]) / 100; if (/%/.test(a[2])) Lh = parseFloat(a[2]) / 100;
      var k = function (n) { return (n + H / 30) % 12; }, A = S * Math.min(Lh, 1 - Lh);
      var f = function (n) { return Lh - A * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); };
      return lin2lab(s2l(f(0) * 255), s2l(f(8) * 255), s2l(f(4) * 255));
    }
    if ((m = s.match(/^oklch\(([^)]*)\)/))) {
      a = args(m[1]); var L = /%$/.test(a[0]) ? parseFloat(a[0]) / 100 : parseFloat(a[0]), C = num(a[1], 0.4), Hh = hue(a[2]) * Math.PI / 180;
      return [L, C * Math.cos(Hh), C * Math.sin(Hh)];
    }
    if ((m = s.match(/^oklab\(([^)]*)\)/))) {
      a = args(m[1]); return [/%$/.test(a[0]) ? parseFloat(a[0]) / 100 : parseFloat(a[0]), num(a[1], 0.4), num(a[2], 0.4)];
    }
    if ((m = s.match(/^color\(\s*(display-p3|srgb-linear|srgb)\s+([^)]*)\)/))) {
      a = args(m[2]); var v = [0, 1, 2].map(function (i) { return num(a[i], 1); });
      if (m[1] === 'srgb') v = v.map(function (x) { return s2l(x * 255); });
      else if (m[1] === 'display-p3') v = mul(P2S, v.map(function (x) { return s2l(x * 255); }));
      return lin2lab(v[0], v[1], v[2]);
    }
    throw new Error('Unrecognised color: ' + s);
  }
  function rgb8(L, a, b) { var c = lab2lin(L, a, b); return [Math.round(tr(cl(c[0])) * 255), Math.round(tr(cl(c[1])) * 255), Math.round(tr(cl(c[2])) * 255)]; }
  function p3f(L, a, b) { var c = mul(S2P, lab2lin(L, a, b)); return [tr(cl(c[0])), tr(cl(c[1])), tr(cl(c[2]))]; }
  function p38(L, a, b) { var c = p3f(L, a, b); return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)]; }
  function hex(L, a, b) { return '#' + rgb8(L, a, b).map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('').toUpperCase(); }
  function Y(L, a, b) {
    if (inG(L, a, b, 'srgb')) { var r = rgb8(L, a, b); return 0.2126 * s2l(r[0]) + 0.7152 * s2l(r[1]) + 0.0722 * s2l(r[2]); }
    var c = lab2lin(L, a, b); return Math.max(0, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  }
  function cr(y1, y2) { return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05); }
  function cssColor(L, a, b, g) {
    if (g === 'p3' && !inG(L, a, b, 'srgb')) return 'color(display-p3 ' + p3f(L, a, b).map(function (v) { return v.toFixed(4); }).join(' ') + ')';
    return hex(L, a, b);
  }
  function oklchStr(L, a, b) {
    var C = Math.hypot(a, b), H = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    return 'oklch(' + (L * 100).toFixed(1) + '% ' + C.toFixed(3) + ' ' + (C < 5e-4 ? 'none' : H.toFixed(1)) + ')';
  }

  // ---------------- interpolants ----------------
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function locate(x, q) {
    var n = x.length; if (q <= x[0]) return 0; if (q >= x[n - 1]) return n - 2;
    var lo = 0, hi = n - 2; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (x[mid] <= q) lo = mid; else hi = mid - 1; } return lo;
  }
  function hermite(x, y, d) {
    return function (q) {
      var k = locate(x, q), h = x[k + 1] - x[k], t = (q - x[k]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y[k] + (t3 - 2 * t2 + t) * h * d[k] + (-2 * t3 + 3 * t2) * y[k + 1] + (t3 - t2) * h * d[k + 1];
    };
  }
  function linear(x, y) { return function (q) { var n = x.length; if (q <= x[0]) return y[0]; if (q >= x[n - 1]) return y[n - 1]; var k = locate(x, q); return y[k] + (q - x[k]) / (x[k + 1] - x[k]) * (y[k + 1] - y[k]); }; }
  function edge(h0, h1, m0, m1) {
    var d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (sign(d) !== sign(m0)) return 0;
    if (sign(m0) !== sign(m1) && Math.abs(d) > 3 * Math.abs(m0)) return 3 * m0;
    return d;
  }
  // matches scipy.interpolate.PchipInterpolator
  function pchip(x, y) {
    var n = x.length, h = [], m = [], d = new Array(n), i;
    if (n < 3) return linear(x, y);
    for (i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; m[i] = (y[i + 1] - y[i]) / h[i]; }
    for (i = 1; i < n - 1; i++) {
      if (sign(m[i]) !== sign(m[i - 1]) || m[i] === 0 || m[i - 1] === 0) d[i] = 0;
      else { var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
    }
    d[0] = edge(h[0], h[1], m[0], m[1]); d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
    return hermite(x, y, d);
  }
  // matches scipy.interpolate.Akima1DInterpolator (method="akima")
  function akima(x, y) {
    var n = x.length, i; if (n < 3) return linear(x, y);
    var m = new Array(n + 3);
    for (i = 0; i < n - 1; i++) m[i + 2] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
    m[1] = 2 * m[2] - m[3]; m[0] = 2 * m[1] - m[2]; m[n + 1] = 2 * m[n] - m[n - 1]; m[n + 2] = 2 * m[n + 1] - m[n];
    var dm = []; for (i = 0; i < n + 2; i++) dm[i] = Math.abs(m[i + 1] - m[i]);
    var fmax = 0; for (i = 0; i < n; i++) fmax = Math.max(fmax, dm[i + 2] + dm[i]);
    var t = [];
    for (i = 0; i < n; i++) {
      var f1 = dm[i + 2], f2 = dm[i], f12 = f1 + f2;
      t[i] = f12 > 1e-9 * fmax ? (f1 * m[i + 1] + f2 * m[i + 2]) / f12 : 0.5 * (m[i + 3] + m[i]);
    }
    return hermite(x, y, t);
  }
  // natural cubic spline
  function natural(x, y) {
    var n = x.length, i; if (n < 3) return linear(x, y);
    var h = [], a = [], b = [], c = [], r = [], M = new Array(n).fill(0);
    for (i = 0; i < n - 1; i++) h[i] = x[i + 1] - x[i];
    for (i = 1; i < n - 1; i++) { a[i] = h[i - 1]; b[i] = 2 * (h[i - 1] + h[i]); c[i] = h[i]; r[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]); }
    for (i = 2; i < n - 1; i++) { var w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; r[i] -= w * r[i - 1]; }
    for (i = n - 2; i >= 1; i--) M[i] = (r[i] - (i < n - 2 ? c[i] * M[i + 1] : 0)) / b[i];
    return function (q) {
      var k = locate(x, q), hk = h[k], A = (x[k + 1] - q) / hk, B = (q - x[k]) / hk;
      return A * y[k] + B * y[k + 1] + ((A * A * A - A) * M[k] + (B * B * B - B) * M[k + 1]) * hk * hk / 6;
    };
  }
  // periodic cubic spline (period P), same curve as scipy CubicSpline(bc_type="periodic")
  function periodic(x, y, P) {
    var n = x.length, i, j, h = [];
    for (i = 0; i < n; i++) h[i] = i < n - 1 ? x[i + 1] - x[i] : x[0] + P - x[n - 1];
    var A = [], r = [];
    for (i = 0; i < n; i++) {
      var row = new Array(n).fill(0), im = (i - 1 + n) % n, ip = (i + 1) % n;
      row[im] += h[im]; row[i] += 2 * (h[im] + h[i]); row[ip] += h[i];
      A.push(row); r.push(6 * ((y[ip] - y[i]) / h[i] - (y[i] - y[im]) / h[im]));
    }
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      var tmp = A[i]; A[i] = A[p]; A[p] = tmp; var tr2 = r[i]; r[i] = r[p]; r[p] = tr2;
      for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; if (!f) continue; for (var k = i; k < n; k++) A[j][k] -= f * A[i][k]; r[j] -= f * r[i]; }
    }
    var M = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = r[i]; for (j = i + 1; j < n; j++) s -= A[i][j] * M[j]; M[i] = s / A[i][i]; }
    var X = x.concat([x[0] + P]);
    return function (q) {
      q = ((q - x[0]) % P + P) % P + x[0];
      var k = n - 1; for (var t = 0; t < n; t++) { if (q < X[t + 1]) { k = t; break; } }
      var hk = h[k], Aa = (X[k + 1] - q) / hk, Bb = (q - X[k]) / hk, k1 = (k + 1) % n;
      return Aa * y[k] + Bb * y[k1] + ((Aa * Aa * Aa - Aa) * M[k] + (Bb * Bb * Bb - Bb) * M[k1]) * hk * hk / 6;
    };
  }
  function interp(method, x, y) { return method === 'linear' ? linear(x, y) : method === 'akima' ? akima(x, y) : method === 'cubic' ? natural(x, y) : pchip(x, y); }
  function unwrap(a) {
    var o = [a[0]];
    for (var i = 1; i < a.length; i++) {
      var dd = a[i] - a[i - 1];
      if (Math.abs(dd) >= Math.PI) { var dm = ((dd + Math.PI) % PI2 + PI2) % PI2 - Math.PI; if (dm === -Math.PI && dd > 0) dm = Math.PI; dd = dm; }
      o.push(o[i - 1] + dd);
    }
    return o;
  }
  function wrapPi(x) { return ((x + Math.PI) % PI2 + PI2) % PI2 - Math.PI; }
  function pad(arr, shift) { var n = arr.length; return arr.slice(n - 3).map(function (v) { return v - shift; }).concat(arr, arr.slice(0, 3).map(function (v) { return v + shift; })); }
  function sortDedupe(labs) {
    var s = labs.slice().sort(function (p, q) { return p[0] - q[0]; }), u = [s[0]];
    for (var i = 1; i < s.length; i++) if (s[i][0] > u[u.length - 1][0] + 1e-4) u.push(s[i]);
    return u;
  }
  // longest run of steps whose lightness strictly decreases (light → dark)
  function lis(labs) {
    var n = labs.length, best = [], prev = [], i, j;
    for (i = 0; i < n; i++) { best[i] = 1; prev[i] = -1; for (j = 0; j < i; j++) if (labs[i][0] < labs[j][0] - 1e-4 && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; } }
    var bi = 0; for (i = 1; i < n; i++) if (best[i] > best[bi]) bi = i;
    var keep = []; while (bi >= 0) { keep.unshift(bi); bi = prev[bi]; }
    return keep;
  }

  // ---------------- model ----------------
  function build(pal, neutralName, gamut) {
    var M = { pal: pal, gamut: gamut, neutralName: neutralName, steps: pal.steps };
    var pl = parse(pal.poles.light), pd = parse(pal.poles.dark), Lp = pl[0], Lk = pd[0];
    M.Lp = Lp; M.Lk = Lk; M.pl = pl; M.pd = pd;
    var neuLabs = pal.neutrals[neutralName].map(parse);
    M.neutral = { name: neutralName, raw: pal.neutrals[neutralName], labs: neuLabs, steps: (pal.neutralSteps && pal.neutralSteps[neutralName]) || pal.steps };
    var ax = sortDedupe([pl].concat(neuLabs, [pd]));
    var cAf = pchip(ax.map(function (p) { return p[0]; }), ax.map(function (p) { return p[1]; }));
    var cBf = pchip(ax.map(function (p) { return p[0]; }), ax.map(function (p) { return p[2]; }));
    M.axisAt = function (L) { return [cAf(L), cBf(L)]; };

    var R = Object.keys(pal.ramps).map(function (n, idx) {
      var labs = pal.ramps[n].map(parse), keep = lis(labs), off = [];
      for (var i = 0; i < labs.length; i++) if (keep.indexOf(i) < 0) off.push(i);
      var s = sortDedupe(keep.map(function (i) { return labs[i]; }));
      var z = s.map(function (p) { return p[0]; }), x = s.map(function (p) { return p[1]; }), y = s.map(function (p) { return p[2]; });
      var C = s.map(function (p) { return Math.hypot(p[1], p[2]); }), H = unwrap(s.map(function (p) { return Math.atan2(p[2], p[1]); }));
      return { name: n, idx: idx, raw: pal.ramps[n], labs: labs, keep: keep, off: off, z: z, x: x, y: y, C: C, H: H, f: {} };
    });
    M.R = R;
    function curveF(r, m) { if (!r.f[m]) r.f[m] = [interp(m, r.z, r.C), interp(m, r.z, r.H)]; return r.f[m]; }
    function rampPos(r, L, m) {
      var z = r.z, n = z.length, f;
      if (L < z[0]) { f = (L - Lk) / (z[0] - Lk); return [pd[1] + f * (r.x[0] - pd[1]), pd[2] + f * (r.y[0] - pd[2])]; }
      if (L > z[n - 1]) { f = (L - z[n - 1]) / (Lp - z[n - 1]); return [r.x[n - 1] + f * (pl[1] - r.x[n - 1]), r.y[n - 1] + f * (pl[2] - r.y[n - 1])]; }
      var cf = curveF(r, m || 'pchip'), c = cf[0](L), t = cf[1](L); return [c * Math.cos(t), c * Math.sin(t)];
    }
    M.rampPos = rampPos;

    // ---- hue structure on a 64-level grid ----
    var NL = 64, grid = [];
    for (var j = 0; j < NL; j++) grid.push(Lk + (Lp - Lk) * j / (NL - 1));
    var RA = grid.map(function (L) {
      var c0 = cAf(L), c1 = cBf(L);
      return R.map(function (r) { var p = rampPos(r, L), dx = p[0] - c0, dy = p[1] - c1; return [Math.hypot(dx, dy), Math.atan2(dy, dx)]; });
    });
    var theta = R.map(function (r, i) { var best = -1, k = 0; for (var jj = 0; jj < NL; jj++) if (RA[jj][i][0] > best) { best = RA[jj][i][0]; k = jj; } r.peakRel = best; return RA[k][i][1]; });
    R.forEach(function (r, i) { r.theta = theta[i]; });
    function thMod(i) { return ((theta[i] % PI2) + PI2) % PI2; }
    function crossings(keep) {
      var order = keep.slice().sort(function (a, b) { return thMod(a) - thMod(b); }), X = {};
      for (var jj = 1; jj < NL - 1; jj++) {
        for (var q = 0; q < order.length; q++) {
          var k = order[q], n = order[(q + 1) % order.length], ck = RA[jj][k][0], cn = RA[jj][n][0], cm = Math.min(ck, cn);
          if (order.length < 2 || cm < 0.006) continue;
          var expd = ((thMod(n) - thMod(k)) % PI2 + PI2) % PI2, adv = expd + wrapPi(RA[jj][n][1] - RA[jj][k][1] - expd);
          if (adv <= 0) {
            var kind = cm >= 0.03 ? 'body' : 'pole', key = k + '|' + n + '|' + kind;
            if (!X[key]) X[key] = { a: k, b: n, kind: kind, Ls: [], inv: 0 };
            X[key].Ls.push(grid[jj]); X[key].inv = Math.max(X[key].inv, -adv * 180 / Math.PI);
          }
        }
      }
      // a body crossing is structural when it persists (4+ levels) or swaps hue order by 3°+; smaller ones are local folds
      Object.keys(X).forEach(function (key) { var x = X[key]; if (x.kind === 'body' && x.Ls.length < 4 && x.inv < 3) x.kind = 'minor'; });
      return X;
    }
    var keep = R.map(function (r, i) { return i; }), interior = [];
    var X0 = crossings(keep);
    M.bodyCrossings = []; M.poleFolds = []; M.minorFolds = [];
    Object.keys(X0).forEach(function (k) { var x = X0[k]; (x.kind === 'body' ? M.bodyCrossings : x.kind === 'minor' ? M.minorFolds : M.poleFolds).push({ a: R[x.a].name, b: R[x.b].name, Lmin: Math.min.apply(null, x.Ls), Lmax: Math.max.apply(null, x.Ls), inv: x.inv }); });
    for (;;) {
      var X = crossings(keep), cnt = {}, any = false;
      Object.keys(X).forEach(function (k) { var x = X[k]; if (x.kind !== 'body') return; any = true; cnt[x.a] = (cnt[x.a] || 0) + x.Ls.length; cnt[x.b] = (cnt[x.b] || 0) + x.Ls.length; });
      if (!any) break;
      var worst = null;
      Object.keys(cnt).forEach(function (k) { k = +k; if (worst === null || cnt[k] > cnt[worst] || (cnt[k] === cnt[worst] && R[k].peakRel < R[worst].peakRel)) worst = k; });
      keep.splice(keep.indexOf(worst), 1); interior.push(worst);
    }
    // loft order starts at the ramp closest to 25° (red), so maps and wheels read the same way across palettes
    keep.sort(function (a, b) { return thMod(a) - thMod(b); });
    var start = 0, bd = 9;
    keep.forEach(function (k, q) { var d = Math.abs(wrapPi(thMod(k) - 25 * Math.PI / 180)); if (d < bd) { bd = d; start = q; } });
    keep = keep.slice(start).concat(keep.slice(0, start));
    R.forEach(function (r) { r.interior = false; });
    interior.forEach(function (i) { R[i].interior = true; });
    var LR = keep.map(function (i) { return R[i]; }), nL = LR.length;
    var thetaU = keep.map(function (i) { return theta[i]; });
    for (var q2 = 1; q2 < thetaU.length; q2++) while (thetaU[q2] <= thetaU[q2 - 1]) thetaU[q2] += PI2;
    var TH = thetaU.concat([thetaU[0] + PI2]);
    M.loft = LR; M.interior = interior.map(function (i) { return R[i]; }); M.thetaU = thetaU;
    var gaps = LR.map(function (r, q) { return { a: r.name, b: LR[(q + 1) % nL].name, deg: (TH[q + 1] - TH[q]) * 180 / Math.PI }; });
    M.gaps = gaps;

    function norm(u) { var v = (u - thetaU[0]) % PI2; if (v < 0) v += PI2; return v + thetaU[0]; }
    function seg(u) { u = norm(u); var i = nL - 1; for (var k = 0; k < nL; k++) { if (u < TH[k + 1]) { i = k; break; } } return [i, (u - TH[i]) / (TH[i + 1] - TH[i])]; }
    function angDist(a, b) { var d = ((a - b) % PI2 + PI2) % PI2; return Math.min(d, PI2 - d); }
    M.norm = norm; M.seg = seg; M.angDist = angDist;
    M.nearestLoft = function (u) { var bi = 0, bdd = 9; thetaU.forEach(function (t, i) { var d = angDist(u, t); if (d < bdd) { bdd = d; bi = i; } }); return bi; };

    M.poleFixLevels = 0;
    function level(L) {
      var c0 = cAf(L), c1 = cBf(L), rel = [], rC = [], rH = [], i;
      for (i = 0; i < nL; i++) { var p = rampPos(LR[i], L), dx = p[0] - c0, dy = p[1] - c1; rel.push([dx, dy]); rC.push(Math.hypot(dx, dy)); rH.push(Math.atan2(dy, dx)); }
      var pole = L <= Lk + 1e-9 || L >= Lp - 1e-9 || Math.max.apply(null, rC) < 1e-7;
      var lev = { L: L, cA: c0, cB: c1, rel: rel, rC: rC, pole: pole, fixed: false };
      if (!pole) {
        var Hj = rH.map(function (h, q) { return thetaU[q] + wrapPi(h - thetaU[q]); });
        for (i = 1; i < nL; i++) if (Hj[i] <= Hj[i - 1] + 1e-6) { Hj[i] = Hj[i - 1] + 1e-4; lev.fixed = true; }
        if (Hj[nL - 1] >= Hj[0] + PI2 - 1e-4) { var off = Hj[0] - thetaU[0]; Hj = thetaU.map(function (t) { return t + off; }); lev.fixed = true; }
        lev.Hn = Hj.concat([Hj[0] + PI2]); lev.pc = pchip(pad(Hj, PI2), pad(rC, 0));
      }
      return lev;
    }
    grid.forEach(function (L) { if (level(L).fixed) M.poleFixLevels++; });
    M.level = level;
    function clip(L, a, b) {
      var clipped = false, over = 0;
      if (L > 1e-3 && L < 1 - 1e-4 && !inG(L, a, b, gamut)) {
        var Ca = Math.hypot(a, b);
        if (Ca > 1e-4) { var mc = maxC(L, Math.atan2(b, a), gamut), k = mc / Ca; over = Ca - mc; a *= k; b *= k; clipped = true; }
      }
      return [a, b, clipped, over];
    }
    function relAt(i, f, u, lev, method) {
      if (lev.pole) return [0, 0];
      if (method === 'chord') { var p1 = lev.rel[i], p2 = lev.rel[(i + 1) % nL]; return [p1[0] + f * (p2[0] - p1[0]), p1[1] + f * (p2[1] - p1[1])]; }
      if (method === 'cubic') {
        if (!lev.cs) lev.cs = [periodic(thetaU, lev.rel.map(function (p) { return p[0]; }), PI2), periodic(thetaU, lev.rel.map(function (p) { return p[1]; }), PI2)];
        return [lev.cs[0](u), lev.cs[1](u)];
      }
      var Hq = lev.Hn[i] + f * (lev.Hn[i + 1] - lev.Hn[i]), C = Math.max(lev.pc(Hq), 0);
      return [C * Math.cos(Hq), C * Math.sin(Hq)];
    }
    function pointSeg(i, f, u, lev, s, method) {
      var d = relAt(i, f, u, lev, method), dx = d[0], dy = d[1];
      var c = clip(lev.L, lev.cA + s * dx, lev.cB + s * dy), r1 = LR[i], r2 = LR[(i + 1) % nL], L = lev.L;
      // extrapolated: neither neighbouring ramp has a real step this dark / this light
      var ext = L < Math.min(r1.z[0], r2.z[0]) - 1e-6 || L > Math.max(r1.z[r1.z.length - 1], r2.z[r2.z.length - 1]) + 1e-6;
      return { L: L, a: c[0], b: c[1], clipped: c[2], over: c[3], ext: ext };
    }
    M.pointSeg = pointSeg;
    M.point = function (u, L, s, method) { var sg = seg(u); return pointSeg(sg[0], sg[1], norm(u), level(L), s, method || 'pchip'); };

    // step lightness across hue (periodic PCHIP over the lofted ramps)
    var stepF = pal.steps.map(function (_, k) { return pchip(pad(thetaU, PI2), pad(LR.map(function (r) { return r.labs[k][0]; }), 0)); });
    M.genSteps = function (u, s, method) {
      u = norm(u); var near = LR[M.nearestLoft(u)];
      return stepF.map(function (f, k) {
        var L = Math.min(Math.max(f(u), Lk + 1e-4), Lp - 1e-4), p = M.point(u, L, s, method);
        p.step = pal.steps[k]; p.hex = hex(p.L, p.a, p.b); p.css = cssColor(p.L, p.a, p.b, gamut); p.inSrgb = inG(p.L, p.a, p.b, 'srgb');
        p.offNear = near.off.indexOf(k) >= 0; return p;
      });
    };

    // ---- seed colors: invert the surface ----
    // map a color to (hue position u, lightness L, saturation s); s > 1 means more vivid than the palette at that hue and lightness
    var stepLmin = Math.min.apply(null, LR.map(function (r) { return r.z[0]; })), stepLmax = Math.max.apply(null, LR.map(function (r) { return r.z[r.z.length - 1]; }));
    M.seedMap = function (lab) {
      var L0 = lab[0], L = Math.min(Math.max(L0, Lk + 1e-4), Lp - 1e-4), lev = level(L);
      var dx = lab[1] - lev.cA, dy = lab[2] - lev.cB, Crel = Math.hypot(dx, dy);
      var out = { L: L, Lseed: L0, clampedL: L !== L0, Crel: Crel, neutral: false };
      // a seed that is (almost) a real step of a lofted ramp is recognised as that step, so its own ramp comes back exactly
      var bestQ = -1, bestK = -1, bestE = 0.3, also = [];
      for (var qi = 0; qi < nL; qi++) {
        var rr = LR[qi];
        for (var qk = 0; qk < rr.keep.length; qk++) {
          var ee = dE(rr.labs[rr.keep[qk]], lab);
          if (ee < 0.6) also.push({ name: rr.name + '-' + pal.steps[rr.keep[qk]], e: ee });
          if (ee < bestE) { bestE = ee; bestQ = qi; bestK = rr.keep[qk]; }
        }
      }
      if (bestQ >= 0) {
        var sp = LR[bestQ].labs[bestK], lv2 = level(sp[0]), exact = LR[bestQ].name + '-' + pal.steps[bestK];
        return { L: sp[0], Lseed: L0, clampedL: false, Crel: Crel, neutral: false, u: thetaU[bestQ], sRaw: 1, s: 1, Csurf: Math.hypot(sp[1] - lv2.cA, sp[2] - lv2.cB), ext: false,
          exact: exact, exactE: bestE, also: also.filter(function (a) { return a.name !== exact; }).map(function (a) { return a.name; }) };
      }
      if (lev.pole || Crel < 0.012) { out.neutral = true; out.s = 0; out.sRaw = 0; return out; }
      // undo the per-level hue warp: find the segment whose level hues bracket the seed's hue
      var h = Math.atan2(dy, dx), H0 = lev.Hn[0]; h = H0 + (((h - H0) % PI2) + PI2) % PI2;
      var i = nL - 1; for (var k = 0; k < nL; k++) if (h < lev.Hn[k + 1]) { i = k; break; }
      var f = (h - lev.Hn[i]) / (lev.Hn[i + 1] - lev.Hn[i]);
      out.u = norm(TH[i] + f * (TH[i + 1] - TH[i]));
      out.Csurf = Math.max(lev.pc(h), 0);
      out.sRaw = out.Csurf > 1e-4 ? Crel / out.Csurf : Infinity; out.s = Math.min(out.sRaw, 1);
      out.ext = pointSeg(i, f, out.u, lev, out.s, 'pchip').ext;
      return out;
    };
    // a ramp shaped by the palette at hue u, scaled to saturation s, with the step nearest seedL moved onto it exactly
    M.genThrough = function (u, s, seedL) {
      u = norm(u);
      var Ls = stepF.map(function (f) { return Math.min(Math.max(f(u), Lk + 1e-4), Lp - 1e-4); }), n = Ls.length, ks = 0;
      for (var k = 1; k < n; k++) if (Math.abs(Ls[k] - seedL) < Math.abs(Ls[ks] - seedL)) ks = k;
      // rescale each side of the anchor proportionally between the anchor and that end, so lightness order can't break
      var Lt = Ls.slice(); Lt[ks] = seedL;
      var L0e = Ls[0], L1e = Ls[n - 1];
      var top = ks === 0 ? Math.max(seedL, L0e) : L0e, bot = ks === n - 1 ? Math.min(seedL, L1e) : L1e;
      for (var q0 = 0; q0 < ks; q0++) Lt[q0] = top + (Ls[q0] - L0e) / ((Ls[ks] - L0e) || 1e-9) * (seedL - top);
      for (q0 = ks + 1; q0 < n; q0++) Lt[q0] = seedL + (Ls[q0] - Ls[ks]) / ((L1e - Ls[ks]) || 1e-9) * (bot - seedL);
      if (ks === 0) for (q0 = 1; q0 < n; q0++) Lt[q0] = seedL + (Ls[q0] - Ls[0]) / ((L1e - Ls[0]) || 1e-9) * (L1e - seedL);
      if (ks === n - 1) for (q0 = 0; q0 < n - 1; q0++) Lt[q0] = L0e + (Ls[q0] - L0e) / ((Ls[n - 1] - L0e) || 1e-9) * (seedL - L0e);
      var near = LR[M.nearestLoft(u)];
      return Ls.map(function (L0, q) {
        var L = q === ks ? seedL : Math.min(Math.max(Lt[q], Lk + 1e-4), Lp - 1e-4), p = M.point(u, L, s);
        p.step = pal.steps[q]; p.hex = hex(p.L, p.a, p.b); p.css = cssColor(p.L, p.a, p.b, gamut); p.inSrgb = inG(p.L, p.a, p.b, 'srgb');
        p.offNear = near.off.indexOf(q) >= 0; p.anchor = q === ks; return p;
      });
    };

    // ---- anchored ramps (one or more seeds) ----
    // furthest distance from the neutral axis, along a direction, that stays in the gamut
    function maxRel(L, cA, cB, ux, uy) {
      if (!inG(L, cA, cB, gamut)) return 0;
      var lo = 0, hi = 0.6; for (var q = 0; q < 30; q++) { var m = (lo + hi) / 2; if (inG(L, cA + m * ux, cB + m * uy, gamut)) lo = m; else hi = m; } return lo;
    }
    function surfAt(u, L) {
      var sg = seg(u), lev = level(L), d = relAt(sg[0], sg[1], norm(u), lev, 'pchip'), C = Math.hypot(d[0], d[1]);
      var ux = C > 1e-9 ? d[0] / C : 1, uy = C > 1e-9 ? d[1] / C : 0, cm = maxRel(L, lev.cA, lev.cB, ux, uy);
      return { lev: lev, i: sg[0], f: sg[1], C: C, ux: ux, uy: uy, cmax: cm, rho: cm > 1e-6 ? C / cm : 0 };
    }
    var RHOCAP = 0.9995, KNEE = 0.98;
    // soft knee: identity below the knee, smooth compression toward (never reaching) the gamut edge above it
    function knee(x) { if (x <= KNEE) return x; var w = 1 - KNEE; return KNEE + w * (1 - Math.exp(-(x - KNEE) / w)); }
    // scale factor k such that knee(k * rA) = rS
    function kFor(rA, rS) {
      rA = Math.max(rA, 1e-6); rS = Math.min(Math.max(rS, 0), RHOCAP);
      if (rS <= KNEE) return rS / rA;
      var lo = rS / rA, hi = lo; while (knee(hi * rA) < rS && hi < 1e6) hi *= 2;
      for (var q = 0; q < 60; q++) { var m = (lo + hi) / 2; if (knee(m * rA) < rS) lo = m; else hi = m; } return (lo + hi) / 2;
    }
    M.setKnee = function (v) { KNEE = v; };
    // chroma as a share of the gamut (rho); rho' = 1 - (1 - rho)^beta is ~linear for pastels and can never reach the gamut edge
    function betaFor(rA, rS) {
      rA = Math.min(Math.max(rA, 1e-6), RHOCAP); rS = Math.min(Math.max(rS, 1e-9), RHOCAP);
      return Math.log(1 - rS) / Math.log(1 - rA);
    }
    M.genAnchors = function (seeds, opts) {
      opts = opts || {}; var uniform = opts.curve === 'uniform', cap = !!opts.cap;
      var S = seeds.filter(function (s) { return s.map && !s.map.neutral && isFinite(s.map.sRaw) && s.map.u !== undefined; });
      if (!S.length) return null;
      // one seed per lightness: drop near-duplicates, then order light → dark
      S = S.slice().sort(function (a, b) { return b.map.L - a.map.L; }).filter(function (s, j, arr) { return !j || arr[j - 1].map.L - s.map.L > 0.012; });
      var sx = 0, sy = 0; S.forEach(function (s) { sx += Math.cos(s.map.u); sy += Math.sin(s.map.u); });
      var u0 = S.length === 1 ? S[0].map.u : norm(Math.atan2(sy, sx));
      var Ls = stepF.map(function (f) { return Math.min(Math.max(f(norm(u0)), Lk + 1e-4), Lp - 1e-4); }), n = Ls.length;
      if (S.length > n) S = S.slice(0, n);
      // each seed claims the nearest free step, keeping order
      var idx = [], prev = -1;
      S.forEach(function (s, j) { var best = prev + 1, bd = 9; for (var k = prev + 1; k <= n - (S.length - j); k++) { var d = Math.abs(Ls[k] - s.map.L); if (d < bd) { bd = d; best = k; } } idx.push(best); prev = best; });
      // lightness: proportional between control points (ends stay unless a seed goes past them)
      var ck = [], cl = [];
      if (idx[0] > 0) { ck.push(0); cl.push(Math.max(Ls[0], S[0].map.L + 0.004 * idx[0])); }
      S.forEach(function (s, j) { ck.push(idx[j]); cl.push(s.map.L); });
      if (idx[idx.length - 1] < n - 1) { ck.push(n - 1); cl.push(Math.min(Ls[n - 1], S[S.length - 1].map.L - 0.004 * (n - 1 - idx[idx.length - 1]))); }
      var Lt = Ls.map(function (L0, k) {
        for (var c = 0; c < ck.length - 1; c++) if (k >= ck[c] && k <= ck[c + 1]) {
          var a = ck[c], b = ck[c + 1]; if (a === b) return cl[c];
          var den = Ls[b] - Ls[a]; return Math.abs(den) < 1e-9 ? cl[c] + (k - a) / (b - a) * (cl[c + 1] - cl[c]) : cl[c] + (L0 - Ls[a]) / den * (cl[c + 1] - cl[c]);
        }
        return L0;
      });
      // per-anchor hue position and chroma curve; interpolate between anchors along the step index
      var au = S.map(function (s) { return u0 + wrapPi(s.map.u - u0); });
      var ab = S.map(function (s, j) {
        var sf = surfAt(s.map.u, s.map.L), rS = sf.rho * s.map.sRaw;
        return uniform ? Math.log(Math.max(s.map.sRaw, 1e-6)) : Math.log(Math.max(kFor(sf.rho, rS), 1e-6));
      });
      if (cap) ab = ab.map(function (v) { return Math.min(v, 0); });
      function along(vals, k) {
        if (k <= idx[0]) return vals[0]; if (k >= idx[idx.length - 1]) return vals[vals.length - 1];
        for (var j = 0; j < idx.length - 1; j++) if (k >= idx[j] && k <= idx[j + 1]) return vals[j] + (k - idx[j]) / (idx[j + 1] - idx[j]) * (vals[j + 1] - vals[j]);
      }
      var near = LR[M.nearestLoft(u0)];
      return Lt.map(function (Lq, k) {
        var aj = idx.indexOf(k), uq = aj >= 0 ? au[aj] : along(au, k), L = aj >= 0 ? S[aj].map.L : Math.min(Math.max(Lq, Lk + 1e-4), Lp - 1e-4);
        var sf = surfAt(uq, L), lb = aj >= 0 ? ab[aj] : along(ab, k), C2;
        if (uniform) C2 = Math.exp(lb) * sf.C;
        else C2 = knee(Math.exp(lb) * sf.rho) * sf.cmax;
        var c = clip(L, sf.lev.cA + C2 * sf.ux, sf.lev.cB + C2 * sf.uy);
        var p = { L: L, a: c[0], b: c[1], clipped: c[2], ext: pointSeg(sf.i, sf.f, norm(uq), sf.lev, 1, 'pchip').ext };
        p.beyond = C2 > sf.C * 1.002 && sf.C > 1e-4; p.step = pal.steps[k]; p.hex = hex(p.L, p.a, p.b); p.css = cssColor(p.L, p.a, p.b, gamut);
        p.inSrgb = inG(p.L, p.a, p.b, 'srgb'); p.offNear = near.off.indexOf(k) >= 0; p.anchor = aj >= 0; p.seedIndex = aj >= 0 ? seeds.indexOf(S[aj]) : -1;
        return p;
      });
    };

    // nearest color on a named ramp (or the neutral): nearest real step, and nearest point along its curve
    M.nearestOnRamp = function (name, lab) {
      var labs, steps, raws, pts = [];
      var r = R.filter(function (x) { return x.name === name; })[0];
      if (r) {
        labs = r.labs; steps = pal.steps; raws = r.raw;
        var cf = curveF(r, 'pchip'), z0 = r.z[0], z1 = r.z[r.z.length - 1];
        for (var q = 0; q <= 400; q++) { var L = z0 + (z1 - z0) * q / 400, C = Math.max(cf[0](L), 0), H = cf[1](L), c = clip(L, C * Math.cos(H), C * Math.sin(H)); pts.push([L, c[0], c[1]]); }
      } else {
        labs = M.neutral.labs; steps = M.neutral.steps; raws = M.neutral.raw;
        var s = sortDedupe(labs), zz = s.map(function (p) { return p[0]; }), fa = pchip(zz, s.map(function (p) { return p[1]; })), fb = pchip(zz, s.map(function (p) { return p[2]; }));
        for (q = 0; q <= 400; q++) { L = zz[0] + (zz[zz.length - 1] - zz[0]) * q / 400; pts.push([L, fa(L), fb(L)]); }
      }
      var bk = 0, be = 1e9; labs.forEach(function (p, k) { var e = dE(p, lab); if (e < be) { be = e; bk = k; } });
      var bp = pts[0], ce = 1e9; pts.forEach(function (p) { var e = dE(p, lab); if (e < ce) { ce = e; bp = p; } });
      // which two real steps bracket the nearest point's lightness
      var lo = null, hi = null;
      labs.forEach(function (p, k) { if (p[0] >= bp[0] && (lo === null || p[0] < labs[lo][0])) lo = k; if (p[0] <= bp[0] && (hi === null || p[0] > labs[hi][0])) hi = k; });
      return { step: steps[bk], stepLab: labs[bk], stepRaw: raws[bk], stepE: be, lab: bp, e: ce, between: [lo === null ? null : steps[lo], hi === null ? null : steps[hi]] };
    };

    var ALL = [{ name: pal.poleNames.light, lab: pl, raw: pal.poles.light }, { name: pal.poleNames.dark, lab: pd, raw: pal.poles.dark }];
    R.forEach(function (r) { r.labs.forEach(function (lab, k) { ALL.push({ name: r.name + '-' + pal.steps[k], lab: lab, raw: r.raw[k] }); }); });
    neuLabs.forEach(function (lab, k) { ALL.push({ name: neutralName + '-' + M.neutral.steps[k], lab: lab, raw: M.neutral.raw[k] }); });
    M.nearest = function (L, a, b) {
      var best = null, bdd = 9;
      ALL.forEach(function (e) { var d = Math.hypot(e.lab[0] - L, e.lab[1] - a, e.lab[2] - b); if (d < bdd) { bdd = d; best = e; } });
      return { name: best.name, lab: best.lab, raw: best.raw, d: bdd * 100 };
    };

    // ---- 3D geometry (cached) ----
    var cache = { curve: {}, mesh: {}, hull: null };
    M.curve = function (r, m) {
      var key = r.idx + '|' + m; if (cache.curve[key]) return cache.curve[key];
      var N = 80, z0 = r.z[0], z1 = r.z[r.z.length - 1], cf = curveF(r, m), out = { x: [], y: [], z: [], color: [], relc: [], clipped: 0, overshoot: 0 }, cmax = 0;
      for (var q = 0; q < N; q++) {
        var L = z0 + (z1 - z0) * q / (N - 1), C = Math.max(cf[0](L), 0), H = cf[1](L), c = clip(L, C * Math.cos(H), C * Math.sin(H));
        if (c[2]) out.clipped++;
        var Cc = Math.hypot(c[0], c[1]), mc = maxC(L, H, gamut); cmax = Math.max(cmax, Cc);
        out.x.push(c[0]); out.y.push(c[1]); out.z.push(L); out.color.push(hex(L, c[0], c[1])); out.relc.push(mc > 1e-4 ? Cc / mc : 0);
      }
      out.overshoot = Math.max(cmax - Math.max.apply(null, r.C), 0);
      return (cache.curve[key] = out);
    };
    M.mesh = function (method) {
      if (cache.mesh[method]) return cache.mesh[method];
      var NU = nL > 12 ? 128 : 96, x = [], y = [], z = [], color = [], relc = [], ext = [], clipped = 0, over = 0, i, jj;
      var us = []; for (i = 0; i < NU; i++) us.push(thetaU[0] + i * PI2 / NU);
      var segs = us.map(seg);
      for (jj = 0; jj < NL; jj++) {
        var lev = level(grid[jj]);
        for (i = 0; i < NU; i++) {
          var p = pointSeg(segs[i][0], segs[i][1], us[i], lev, 1, method), C = Math.hypot(p.a, p.b), mc = maxC(p.L, Math.atan2(p.b, p.a), gamut);
          if (p.clipped) { clipped++; over = Math.max(over, p.over); }
          x.push(p.a); y.push(p.b); z.push(p.L); color.push(hex(p.L, p.a, p.b)); relc.push(mc > 1e-4 ? Math.min(C / mc, 1) : 0); ext.push(p.ext);
        }
      }
      var I = [], J = [], K = [], cI = [], cJ = [], cK = [];
      function tri(a, b, c) { if (ext[a] && ext[b] && ext[c]) { cI.push(a); cJ.push(b); cK.push(c); } else { I.push(a); J.push(b); K.push(c); } }
      for (jj = 0; jj < NL - 1; jj++) for (i = 0; i < NU; i++) {
        var p0 = jj * NU + i, q0 = jj * NU + (i + 1) % NU, r0 = (jj + 1) * NU + i, s0 = (jj + 1) * NU + (i + 1) % NU;
        tri(p0, q0, r0); tri(q0, s0, r0);
      }
      var mean = relc.reduce(function (s, v) { return s + v; }, 0) / relc.length;
      return (cache.mesh[method] = { x: x, y: y, z: z, i: I, j: J, k: K, ci: cI, cj: cJ, ck: cK, color: color, relc: relc, NU: NU, NL: NL,
        clipPct: 100 * clipped / (NL * NU), maxOver: over, meanRelC: mean });
    };
    M.hull = function () {
      if (cache.hull) return cache.hull;
      var G = 18, x = [], y = [], z = [], I = [], J = [], K = [];
      var faces = [function (u, v) { return [0, u, v]; }, function (u, v) { return [1, u, v]; }, function (u, v) { return [u, 0, v]; }, function (u, v) { return [u, 1, v]; }, function (u, v) { return [u, v, 0]; }, function (u, v) { return [u, v, 1]; }];
      faces.forEach(function (fn) {
        var base = x.length;
        for (var u = 0; u <= G; u++) for (var v = 0; v <= G; v++) {
          var c = fn(u / G, v / G); if (gamut === 'p3') c = mul(P2S, c);
          var lab = lin2lab(c[0], c[1], c[2]); x.push(lab[1]); y.push(lab[2]); z.push(lab[0]);
        }
        for (u = 0; u < G; u++) for (v = 0; v < G; v++) { var p = base + u * (G + 1) + v; I.push(p, p + 1); J.push(p + 1, p + G + 2); K.push(p + G + 1, p + G + 1); }
      });
      return (cache.hull = { x: x, y: y, z: z, i: I, j: J, k: K });
    };
    M.volume = function (method) {
      var m = M.mesh(method || 'pchip'), x = m.x, y = m.y, z = m.z, v = 0;
      function tri(i, j, k) { v += x[i] * (y[j] * z[k] - z[j] * y[k]) - y[i] * (x[j] * z[k] - z[j] * x[k]) + z[i] * (x[j] * y[k] - y[j] * x[k]); }
      for (var q = 0; q < m.i.length; q++) tri(m.i[q], m.j[q], m.k[q]);
      for (q = 0; q < m.ci.length; q++) tri(m.ci[q], m.cj[q], m.ck[q]);
      return Math.abs(v) / 6;
    };
    M.gamutVolume = function () { return gamutVolume(gamut); };
    // mean surface chroma at each lightness level (the palette's "reach" profile)
    M.reach = function (method) {
      var m = M.mesh(method || 'pchip'), out = [];
      for (var jj = 0; jj < m.NL; jj++) { var s = 0; for (var i = 0; i < m.NU; i++) { var n = jj * m.NU + i; s += Math.hypot(m.x[n], m.y[n]); } out.push([m.z[jj * m.NU], s / m.NU]); }
      return out;
    };
    M.axisCurve = grid.map(function (L) { var c = M.axisAt(L); return [c[0], c[1], L]; });

    // ---- per-ramp metrics ----
    R.forEach(function (r) {
      var k = 0; for (var q = 1; q < r.C.length; q++) if (r.C[q] > r.C[k]) k = q;
      r.peakL = r.z[k]; r.peakC = r.C[k];
      r.hueDrift = (Math.max.apply(null, r.H) - Math.min.apply(null, r.H)) * 180 / Math.PI;
      var rel = r.labs.map(function (p) { var C = Math.hypot(p[1], p[2]), mc = maxC(p[0], Math.atan2(p[2], p[1]), gamut); return mc > 1e-4 ? C / mc : 0; });
      r.meanRelC = rel.reduce(function (s, v) { return s + v; }, 0) / rel.length;
      r.outSrgb = r.labs.filter(function (p) { return !inG(p[0], p[1], p[2], 'srgb'); }).length;
      r.outGamut = r.labs.filter(function (p) { return !inG(p[0], p[1], p[2], gamut); }).length;
      r.display = r.labs.map(function (p) { return hex(p[0], p[1], p[2]); });
      r.css = r.labs.map(function (p) { return cssColor(p[0], p[1], p[2], gamut); });
    });
    M.outSrgb = R.reduce(function (s, r) { return s + r.outSrgb; }, 0);
    M.outGamut = R.reduce(function (s, r) { return s + r.outGamut; }, 0);
    M.nColors = R.reduce(function (s, r) { return s + r.labs.length; }, 0);
    return M;
  }


  var GV = {};
  function gamutVolume(g) {
    if (GV[g]) return GV[g];
    var G = 24, v = 0, signs = [1, -1, -1, 1, 1, -1];
    var faces = [function (u, w) { return [0, u, w]; }, function (u, w) { return [1, u, w]; }, function (u, w) { return [u, 0, w]; }, function (u, w) { return [u, 1, w]; }, function (u, w) { return [u, w, 0]; }, function (u, w) { return [u, w, 1]; }];
    function P(fn, u, w) { var c = fn(u / G, w / G); if (g === 'p3') c = mul(P2S, c); var lab = lin2lab(c[0], c[1], c[2]); return [lab[1], lab[2], lab[0]]; }
    function t(p, q, r) { return p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]); }
    faces.forEach(function (fn, fi) {
      var s = 0;
      for (var u = 0; u < G; u++) for (var w = 0; w < G; w++) {
        var a = P(fn, u, w), b = P(fn, u, w + 1), c = P(fn, u + 1, w), d = P(fn, u + 1, w + 1);
        s += t(a, b, c) + t(b, d, c);
      }
      v += signs[fi] * s;
    });
    return (GV[g] = Math.abs(v) / 6);
  }

  // ---------------- validation (leave-one-out) ----------------
  // pooled per-step error bands from the offline stress test: 10 palettes, 375 hold-outs (one and two ramps removed), PCHIP.
  // Made non-decreasing in gap width; ΔE_OK ×100, 2 ≈ one just-noticeable difference.
  var CAL = { gap: [25.3, 39.2, 54.0, 69.2, 96.0, 131.4], med: [0.84, 1.11, 1.35, 1.77, 1.77, 1.94], p90: [2.84, 3.72, 3.85, 4.59, 5.33, 5.33] };
  function calAt(key, gapDeg) { return linear(CAL.gap, CAL[key])(gapDeg); }
  function dE(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100; }
  // model with one lofted ramp removed; the full model's interior ramps stay out, so nothing gets promoted into its place
  function holdOut(M, rampName) {
    var pal = M.pal, p2 = {}; Object.keys(pal).forEach(function (k) { p2[k] = pal[k]; });
    p2.ramps = {}; M.loft.forEach(function (r) { if (r.name !== rampName) p2.ramps[r.name] = pal.ramps[r.name]; });
    return build(p2, M.neutralName, M.gamut);
  }
  function rotateNearest(M2, u) {
    var nr = M2.loft[M2.nearestLoft(u)];
    return nr.labs.map(function (p) {
      var c = M2.axisAt(p[0]), dx = p[1] - c[0], dy = p[2] - c[1], C = Math.hypot(dx, dy), a = c[0] + C * Math.cos(u), b = c[1] + C * Math.sin(u);
      if (!inG(p[0], a, b, M2.gamut)) { var Ca = Math.hypot(a, b); if (Ca > 1e-4) { var k = maxC(p[0], Math.atan2(b, a), M2.gamut) / Ca; a *= k; b *= k; } }
      return [p[0], a, b];
    });
  }
  function looOne(M, r) {
    var M2 = holdOut(M, r.name), u = r.theta, sg = M2.seg(u), gap = M2.gaps[sg[0]].deg;
    var dNear = Math.min.apply(null, M2.thetaU.map(function (t) { return M2.angDist(u, t); })) * 180 / Math.PI;
    var res = { ramp: r.name, gap: gap, dNear: dNear, methods: {}, M2: M2 };
    ['pchip', 'cubic', 'chord', 'nearest'].forEach(function (m) {
      var gen = m === 'nearest' ? rotateNearest(M2, u) : M2.genSteps(u, 1, m).map(function (g) { return [g.L, g.a, g.b]; });
      var steps = r.keep.map(function (k) {
        var p = gen[k], q = r.labs[k], C1 = Math.hypot(p[1], p[2]), C2 = Math.hypot(q[1], q[2]);
        var dh = Math.atan2(p[2], p[1]) - Math.atan2(q[2], q[1]); dh = ((dh + Math.PI) % PI2 + PI2) % PI2 - Math.PI;
        return { k: k, e: dE(p, q), dL: (p[0] - q[0]) * 100, dC: (C1 - C2) * 100, dH: 2 * Math.sqrt(C1 * C2) * Math.sin(Math.abs(dh) / 2) * 100 };
      });
      res.methods[m] = { steps: steps, mean: steps.reduce(function (s, x) { return s + x.e; }, 0) / steps.length, gen: gen };
    });
    res.pred = r.keep.map(function () { return calAt('med', gap); });
    return res;
  }
  function quant(a, p) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; }
  // summarise a palette's hold-outs; factor = how this palette's errors compare to the pooled calibration at the same gaps
  function summarise(rows) {
    var out = { methods: {} };
    ['pchip', 'cubic', 'chord', 'nearest'].forEach(function (m) {
      var e = []; rows.forEach(function (r) { r.methods[m].steps.forEach(function (x) { e.push(x.e); }); });
      out.methods[m] = { med: quant(e, 0.5), p90: quant(e, 0.9), within1: e.filter(function (v) { return v < 2; }).length / e.length, within2: e.filter(function (v) { return v < 4; }).length / e.length };
    });
    var obs = [], pred = [], dull = 0, vivid = 0, dark = 0, light = 0, n = 0, cL = [], cC = [], cH = [];
    rows.forEach(function (r) { r.methods.pchip.steps.forEach(function (x, i) {
      obs.push(x.e); pred.push(r.pred[i]); cL.push(Math.abs(x.dL)); cC.push(Math.abs(x.dC)); cH.push(x.dH);
      if (x.dC < -0.5) dull++; else if (x.dC > 0.5) vivid++;
      if (x.dL < -0.5) dark++; else if (x.dL > 0.5) light++; n++; }); });
    out.comp = { L: quant(cL, 0.5), C: quant(cC, 0.5), H: quant(cH, 0.5) }; out.dark = dark / n; out.light = light / n;
    out.factor = Math.min(Math.max(quant(obs, 0.5) / Math.max(quant(pred, 0.5), 0.05), 0.25), 2.5);
    out.dull = dull / n; out.vivid = vivid / n;
    out.worst = rows.slice().sort(function (a, b) { return b.methods.pchip.mean - a.methods.pchip.mean; });
    return out;
  }

  return { gamutVolume: gamutVolume, alphaOf: alphaOf, build: build, holdOut: holdOut, looOne: looOne, summarise: summarise, calAt: calAt, dE: dE, quant: quant, parse: parse, hex: hex, rgb8: rgb8, p38: p38, cssColor: cssColor, oklchStr: oklchStr, Y: Y, cr: cr, inG: inG, maxC: maxC, hexRgb: hexRgb };
})();
module.exports = Engine;
