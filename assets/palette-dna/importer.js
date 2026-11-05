// Palette DNA importer: parses pasted or uploaded color tokens into a palette. Needs Engine.
var Importer = (function () {
  var COLOR_RE = /(#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\))/;
  var NEUTRAL_NAME = /(^|[-_ ])(gr[ae]y|neutral|slate|zinc|stone|sand|mauve|sage|olive|base|mist|taupe|cool-?gr[ae]y|warm-?gr[ae]y|ink|paper)([-_ ]|$)/i;

  function tryColor(v) {
    if (typeof v !== 'string') return null;
    var raw = v.trim();
    if (!/^(#|(?:rgba?|hsla?|oklch|oklab|color)\()/i.test(raw)) return null;
    Engine.parse(raw);
    return { raw: raw, alpha: Engine.alphaOf(raw) };
  }
  // split "red-500", "red500", "Red_500", "oc-red-5" into ramp + step
  function splitName(n) {
    var m = String(n).match(/^(.*?)[-_. ]?(\d+(?:\.\d+)?)$/);
    return m && m[1] ? { ramp: m[1].replace(/[-_. ]+$/, ''), step: m[2] } : null;
  }

  // ---- collectors: each returns a list of { ramp, step, raw, alpha } ----
  function fromJSON(obj) {
    var out = [];
    function walk(o, path) {
      if (o == null) return;
      if (typeof o === 'string') {
        var last = path[path.length - 1], parent = path.slice(0, -1);
        if (!/^\d+(\.\d+)?$/.test(String(last)) && !splitName(last)) return;
        var c = tryColor(o); if (!c) throw new Error('Unsupported color at ' + path.join('.'));
        if (/^\d+(\.\d+)?$/.test(String(last)) && parent.length) out.push({ ramp: parent.join('-'), step: String(last), raw: c.raw, alpha: c.alpha });
        else { var sp = splitName(last); if (sp) out.push({ ramp: parent.concat([sp.ramp]).join('-'), step: sp.step, raw: c.raw, alpha: c.alpha }); }
        return;
      }
      if (Array.isArray(o)) { o.forEach(function (v, i) { walk(typeof v === 'object' && v && ('$value' in v || 'value' in v) ? (v.$value || v.value) : v, path.concat([String(i)])); }); return; }
      if (typeof o === 'object') {
        if ('$value' in o || ('value' in o && typeof o.value === 'string' && Object.keys(o).length <= 6)) { walk(o.$value !== undefined ? o.$value : o.value, path); return; }
        Object.keys(o).forEach(function (k) { if (k[0] === '$') return; walk(o[k], path.concat([k])); });
      }
    }
    walk(obj, []);
    return out;
  }
  function fromVars(text) {
    var out = [], re = /(?:--|\$|@)([A-Za-z][\w-]*?)[-_]?(\d+(?:\.\d+)?)\s*:\s*([^;\n]+)/g, m;
    while ((m = re.exec(text))) { var c = tryColor(m[3].replace(/\s*!(?:important|default)\s*$/i, '').trim()); if (!c) throw new Error('Unsupported color in ' + m[1] + m[2]); if (c) out.push({ ramp: m[1].replace(/[-_]+$/, ''), step: m[2], raw: c.raw, alpha: c.alpha }); }
    return out;
  }
  // SCSS maps: $name: ("0": #fff, "1": #eee, …) or ($key: value) pairs
  function fromMaps(text) {
    var out = [], re = /\$([A-Za-z][\w-]*)\s*:\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g, m;
    while ((m = re.exec(text))) {
      var ramp = m[1].replace(/[-_](list|map|palette|scale|colou?rs?)$/i, ''), body = m[2], er = /["']?([\w.-]+)["']?\s*:\s*((?:#[0-9a-fA-F]{3,8}\b)|(?:(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)))/g, e;
      while ((e = er.exec(body))) { var c = tryColor(e[2]); if (c) out.push({ ramp: ramp, step: e[1], raw: c.raw, alpha: c.alpha }); }
      if (body.replace(er, '').replace(/[\s,]+/g, '')) throw new Error('Invalid color map: ' + ramp);
    }
    return out;
  }
  function fromLines(text) {
    var out = [];
    text.split(/\n/).forEach(function (line) {
      var m = line.match(/^\s*["']?([A-Za-z][\w -]*?)["']?\s*[:=]\s*(.+)$/); if (!m) return;
      var vals = (m[2].match(new RegExp(COLOR_RE.source, 'gi')) || []);
      if (m[2].replace(new RegExp(COLOR_RE.source, 'gi'), '').replace(/[\s,]+/g, '')) throw new Error('Invalid color list: ' + m[1]);
      vals.forEach(function (v, i) { var c = tryColor(v); if (c) out.push({ ramp: m[1].trim(), step: String(i + 1), raw: c.raw, alpha: c.alpha }); });
    });
    return out;
  }

  function commonPrefix(names) {
    if (names.length < 2) return '';
    var parts = names.map(function (n) { return n.split('-'); }), pre = [];
    for (var i = 0; ; i++) { var t = parts[0][i]; if (t === undefined || !parts.every(function (p) { return p[i] === t && p.length > i + 1; })) break; pre.push(t); }
    return pre.length ? pre.join('-') + '-' : '';
  }

  function analyse(text, opts) {
    opts = opts || {};
    var src = String(text || '').trim(), entries = [], format = '';
    if (!src) return { ok: false, error: 'Paste a palette to begin.' };
    var json = null; try { json = JSON.parse(src); } catch (e) {}
    if (!json) src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    if (json && typeof json === 'object') { entries = fromJSON(json); format = 'JSON'; }
    if (!entries.length) { entries = fromVars(src); format = 'CSS/SCSS/LESS variables'; }
    if (!entries.length) { entries = fromMaps(src); format = 'SCSS maps'; }
    if (!entries.length) { entries = fromLines(src); format = 'one ramp per line'; }
    if (!entries.length) return { ok: false, error: 'No colors found. Use CSS variables like --red-500: #e11d48; JSON like {"red": {"500": "#e11d48"}}; or lines like red: #fee #fcc #f88 #e44.' };
    var notes = [];
    var translucent = entries.filter(function (e) { return e.alpha < 1; }).length;
    entries = entries.filter(function (e) { return e.alpha === 1; });
    if (translucent) notes.push(translucent + ' translucent color' + (translucent > 1 ? 's' : '') + ' skipped');
    if (!entries.length) return { ok: false, error: 'Every color found is translucent (alpha below 1). Import the solid scales instead, for example the non-alpha files.' };
    // group, strip a shared prefix (color-, oc-, palette-)
    var pre = commonPrefix(Array.from(new Set(entries.map(function (e) { return e.ramp.toLowerCase(); }))));
    var groups = Object.create(null), order = [], redefined = 0;
    entries.forEach(function (e) {
      var name = e.ramp.toLowerCase().replace(pre, '').replace(/^(colou?rs?|palette|base|tokens?)[-_.]/, '') || e.ramp;
      if (!groups[name]) { groups[name] = { name: name, steps: Object.create(null), keys: [] }; order.push(name); }
      if (!(e.step in groups[name].steps)) groups[name].keys.push(e.step); else redefined++;
      groups[name].steps[e.step] = e.raw;
    });
    if (redefined) notes.push(redefined + ' color' + (redefined > 1 ? 's were' : ' was') + ' defined more than once (for example a P3 block after the sRGB one); the last definition was used');
    var ramps = order.map(function (n) { return groups[n]; }).filter(function (g) { return g.keys.length >= 3; });
    var short = order.length - ramps.length; if (short) notes.push(short + ' group' + (short > 1 ? 's' : '') + ' with fewer than 3 steps skipped');
    if (!ramps.length) return { ok: false, error: 'Found colors, but no ramp has 3 or more steps.' };
    ramps.forEach(function (g) {
      var numeric = g.keys.every(function (k) { return /^\d+(\.\d+)?$/.test(k); });
      if (numeric) g.keys.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
      g.labs = g.keys.map(function (k) { return Engine.parse(g.steps[k]); });
      g.meanC = g.labs.reduce(function (s, p) { return s + Math.hypot(p[1], p[2]); }, 0) / g.labs.length;
      g.maxC = Math.max.apply(null, g.labs.map(function (p) { return Math.hypot(p[1], p[2]); }));
    });
    // light → dark: flip if most ramps start dark
    var darkFirst = ramps.filter(function (g) { return g.labs[0][0] < g.labs[g.labs.length - 1][0]; }).length;
    var flip = darkFirst > ramps.length / 2;
    if (flip) ramps.forEach(function (g) { g.keys.reverse(); g.labs.reverse(); });
    // neutrals: low chroma, or a neutral-sounding name with modest chroma
    ramps.forEach(function (g) { g.neutral = (g.meanC < 0.02 && g.maxC < 0.045) || (NEUTRAL_NAME.test(g.name) && g.meanC < 0.05); });
    var chrom = ramps.filter(function (g) { return !g.neutral; }), neus = ramps.filter(function (g) { return g.neutral; });
    // one shared step scale for chromatic ramps: the most common
    var sig = Object.create(null); chrom.forEach(function (g) { var k = g.keys.join('|'); sig[k] = (sig[k] || 0) + 1; });
    var best = Object.keys(sig).sort(function (a, b) { return sig[b] - sig[a]; })[0];
    if (!best) return { ok: false, error: 'Only neutral ramps found; at least four hued ramps are needed.' };
    var steps = best.split('|'), odd = chrom.filter(function (g) { return g.keys.join('|') !== best; });
    chrom = chrom.filter(function (g) { return g.keys.join('|') === best; });
    if (odd.length) notes.push('skipped ' + odd.map(function (g) { return g.name; }).join(', ') + ' (different steps from the rest)');
    if (chrom.length < 4) return { ok: false, error: 'Found ' + chrom.length + ' hued ramp' + (chrom.length === 1 ? '' : 's') + ' sharing one step scale; at least 4 are needed to build a surface.' };
    var neutrals = Object.create(null), neutralSteps = Object.create(null);
    neus.forEach(function (g) { neutrals[g.name] = g.keys.map(function (k) { return g.steps[k]; }); neutralSteps[g.name] = g.keys.slice(); });
    var neutral;
    if (neus.length) neutral = neus.slice().sort(function (a, b) { return a.meanC - b.meanC; })[0].name;
    else {
      // no neutral supplied: a pure grey at each step's median lightness
      neutral = 'pure gray';
      neutrals[neutral] = steps.map(function (s, k) { var Ls = chrom.map(function (g) { return g.labs[k][0]; }).sort(function (a, b) { return a - b; }); return 'oklch(' + (Ls[Math.floor(Ls.length / 2)] * 100).toFixed(1) + '% 0 none)'; });
      neutralSteps[neutral] = steps.slice();
      notes.push('no neutral ramp found, so a pure gray axis is used');
    }
    var outSrgb = 0;
    chrom.forEach(function (g) { g.labs.forEach(function (p) { if (!Engine.inG(p[0], p[1], p[2], 'srgb')) outSrgb++; }); });
    var name = (opts.name || 'My palette').trim().slice(0, 60) || 'My palette';
    var pal = {
      id: 'user-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36),
      name: name, version: 'imported', license: '—', source: 'Imported ' + new Date().toISOString().slice(0, 10) + ' · ' + format,
      steps: steps, ramps: Object.create(null), neutrals: neutrals, neutralSteps: neutralSteps, neutral: neutral,
      poles: { light: '#FFFFFF', dark: '#000000' }, poleNames: { light: 'white', dark: 'black' },
      text: { light: opts.textLight || null, dark: opts.textDark || null, basis: 'set on import' },
      gamut: outSrgb ? 'p3' : 'srgb', user: true
    };
    chrom.forEach(function (g) { pal.ramps[g.name] = g.keys.map(function (k) { return g.steps[k]; }); });
    if (flip) notes.push('steps listed dark → light, reordered');
    if (outSrgb) notes.push(outSrgb + ' color' + (outSrgb > 1 ? 's' : '') + ' outside sRGB, so P3 is the default gamut');
    // must build and loft
    var M;
    try { M = Engine.build(pal, neutral, pal.gamut); } catch (e) { return { ok: false, error: 'These ramps could not be built into a surface (' + e.message + ').' }; }
    if (M.loft.length < 3) return { ok: false, error: 'Too many ramps overlap in hue: only ' + M.loft.length + ' could be lofted.' };
    return { ok: true, pal: pal, format: format, notes: notes, nRamps: chrom.length, nSteps: steps.length, neutrals: Object.keys(neutrals), M: M };
  }
  return { analyse: function (text, opts) { try { return analyse(text, opts); } catch (e) { return { ok: false, error: 'Invalid palette: ' + e.message }; } } };
})();
