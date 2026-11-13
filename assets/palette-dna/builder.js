// Palette builder: pure computations. Reference palettes and the shared engine stay unchanged.
var PaletteBuilder = (function () {
  'use strict';
  var LIMIT = 96, STEPS = 64;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'color'; }
  function hex(p) { return Engine.hex(p[0], p[1], p[2]); }
  function ok(p) { var c = Math.hypot(p[1], p[2]), h = (Math.atan2(p[2], p[1]) * 180 / Math.PI + 360) % 360; return 'oklch(' + (p[0] * 100).toFixed(2) + '% ' + c.toFixed(4) + ' ' + (c < 0.0005 ? 'none' : h.toFixed(2)) + ')'; }
  function validColumn(c) {
    return c && typeof c.id === 'string' && c.id.length < 500 && typeof c.name === 'string' && c.name.length <= 80 &&
      typeof c.source === 'string' && c.source.length <= 200 && ['reference','companion','brand'].indexOf(c.kind) >= 0 &&
      Array.isArray(c.steps) && c.steps.length > 0 && c.steps.length <= STEPS && c.steps.every(function(s) { return typeof s === 'string' && s.length <= 60; }) &&
      new Set(c.steps).size === c.steps.length && Array.isArray(c.labs) && c.labs.length === c.steps.length && c.labs.every(function(p) { return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 1.01 && Math.abs(p[1]) < 1 && Math.abs(p[2]) < 1; });
  }
  function inventory(pal) {
    var cols = [];
    ['ramps', 'neutrals'].forEach(function(group) {
      Object.keys(pal[group]).forEach(function(name) {
        var steps = group === 'neutrals' && pal.neutralSteps && pal.neutralSteps[name] || pal.steps;
        var c = { id: 'ref:' + JSON.stringify([pal.id, group, name]), name: name, source: pal.name, kind: 'reference', neutral: group === 'neutrals', gamut: pal.gamut, steps: steps.slice(), labs: pal[group][name].map(Engine.parse) };
        if (!validColumn(c)) throw new Error('Palette columns must have 1–64 complete, uniquely named steps.');
        cols.push(c);
      });
    });
    if (cols.length > LIMIT) throw new Error('The builder supports up to 96 reference columns.');
    return cols;
  }
  function transform(c, hue, scale) {
    hue = clamp(Number(hue) || 0, -180, 180); scale = clamp(Number(scale), 0, 1.5); if (!Number.isFinite(scale)) scale = 1;
    var out = clone(c), a = hue * Math.PI / 180, clipped = 0;
    out.labs = c.labs.map(function(p) {
      if (hue === 0 && scale === 1) return p.slice();
      var h = Math.atan2(p[2], p[1]) + a, C = Math.hypot(p[1], p[2]) * scale, cap = Engine.maxC(p[0], h, c.gamut || 'srgb');
      if (C > cap) { C = cap; clipped++; }
      return [p[0], C * Math.cos(h), C * Math.sin(h)];
    });
    out.clipped = clipped;
    return out;
  }
  // Published Machado, Oliveira & Fernandes matrices at severity 1.0, applied in LINEAR sRGB.
  // https://doi.org/10.1109/TVCG.2009.113; coefficients also documented in QGIS qgsprevieweffect.cpp.
  var matrices = {
    protanopia: [[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]],
    deuteranopia: [[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.011820,.042940,.968881]],
    tritanopia: [[1.255528,-.076749,-.178779],[-.078411,.930809,.147602],[.004733,.691367,.303900]]
  };
  function simulate(hx, mode) {
    if (!matrices[mode]) return hx;
    var rgb = Engine.hexRgb(hx).map(function(v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return '#' + matrices[mode].map(function(row) {
      var v = clamp(row.reduce(function(sum, x, i) { return sum + x * rgb[i]; }, 0), 0, 1);
      v = v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055;
      return Math.round(v * 255).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }
  function contrast(a, b) {
    // Measure the rounded sRGB values actually displayed, including export fallback clipping.
    function y(h) { var r = Engine.hexRgb(h).map(function(v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126*r[0]+.7152*r[1]+.0722*r[2]; }
    return Engine.cr(y(a), y(b));
  }
  function chartIndex(c, background, chosen) {
    var ix = c.steps.indexOf(chosen); if (ix >= 0) return ix;
    var target = background === 'dark' ? .72 : .56, best = 0, score = Infinity;
    c.labs.forEach(function(p, i) { var penalty = Math.abs(p[0]-target) + Math.max(0, 3 - contrast(hex(p), background === 'dark' ? '#181818' : '#FFFFFF')) * .15; if (penalty < score) { score = penalty; best = i; } });
    return best;
  }
  function chartRows(cols, background, mode, choices) {
    var bg = background === 'dark' ? '#181818' : '#FFFFFF';
    return cols.map(function(c) {
      var k = chartIndex(c, background, choices && choices[c.id]), hx = hex(c.labs[k]), shown = simulate(hx, mode);
      return { id:c.id, name:c.name, step:c.steps[k], hex:hx, shown:shown, lab:Engine.parse(shown), ratio:contrast(hx,bg), wide:!Engine.inG.apply(null,c.labs[k].concat(['srgb'])) };
    });
  }
  function weakest(rows) {
    var pair = null;
    rows.forEach(function(a,i) { rows.slice(i+1).forEach(function(b) { var d = Engine.dE(a.lab,b.lab); if (!pair || d < pair.distance) pair = { a:a.name, b:b.name, distance:d }; }); });
    return pair;
  }
  function suggest(refs, brand, existing, relative) {
    // A conservative chroma adjustment (75–110%) preserves each authored hue and L progression.
    var scale = Number.isFinite(relative) && relative > 0 ? clamp(1 + .25 * (relative-1), .75, 1.10) : 1;
    var selected = [brand].concat(existing.filter(function(c){return c.id !== 'brand';})), chosen = [];
    var candidates = refs.filter(function(c) { return !c.neutral && !existing.some(function(x) { return x.id === c.id || x.origin === c.id; }); }).map(function(c) { var x=transform(c,0,scale); x.origin=c.id; x.kind='companion'; x.name=c.name+' companion'; return x; });
    while (chosen.length < 3 && candidates.length) {
      var best=-1, score=-1;
      candidates.forEach(function(c,i) {
        var d=Infinity;
        ['normal','protanopia','deuteranopia','tritanopia'].forEach(function(mode) {
          var row=chartRows([c],'light',mode,{})[0];
          chartRows(selected,'light',mode,{}).forEach(function(other) { d=Math.min(d,Engine.dE(row.lab,other.lab)); });
        });
        if (d > score) { score=d; best=i; }
      });
      // Only skip near-identical candidates. This is deduplication, not an accessibility threshold.
      if (score < .5) break;
      var next=candidates.splice(best,1)[0]; chosen.push(next); selected.push(next);
    }
    return chosen;
  }
  // A color set (see colorsets.js) → one full ramp per color, shaped by the model M of palette pal.
  // Each color is kept as an anchor, with its lighter pair as a second anchor where the two differ enough in lightness.
  function fromSet(set, pal, M, cap) {
    return set.pairs.map(function(pair) {
      var seeds = [pair.color].concat(pair.tint ? [pair.tint] : []).map(function(x) { var lab = Engine.parse(x); return { lab: lab, map: M.seedMap(lab) }; });
      var gen = seeds.some(function(s) { return !s.map.neutral; }) ? M.genAnchors(seeds, { cap: !!cap }) : null;
      var c = { name: (set.prefix || set.name) + ' ' + pair.name, source: set.name + ' · shaped like ' + pal.name, kind: 'companion', origin: 'set:' + set.id + ':' + pair.name, gamut: pal.gamut, chartStep: null, kept: 0 };
      if (gen) {
        c.steps = gen.map(function(p) { return String(p.step); }); c.labs = gen.map(function(p) { return [p.L, p.a, p.b]; });
        gen.forEach(function(p) { if (p.anchor) { c.kept++; if (p.seedIndex === 0) c.chartStep = String(p.step); } });
      } else { c.steps = M.neutral.steps.slice(); c.labs = M.neutral.labs.map(function(p) { return p.slice(); }); c.neutralFallback = true; }
      return c;
    });
  }
  // The closest pair among a set's own colors, under the same simulation the chart preview uses.
  function setBenchmark(set, mode) {
    return weakest(set.pairs.map(function(pair) { return { name: pair.name, lab: Engine.parse(simulate(pair.color.toUpperCase(), mode)) }; }));
  }
  function named(cols) {
    var used = new Set();
    return cols.map(function(c) { var x = Object.assign({},c), base=slug(c.name), n=base, i=2; while(used.has(n)) n=base+'-'+i++; used.add(n); x.exportName=n; return x; });
  }
  function serialize(cols, fmt) {
    cols=cols.every(function(c){return c.exportName;})?cols:named(cols);
    var wide=false, tokens=Object.create(null), blocks=[];
    cols.forEach(function(c) {
      var steps=Object.create(null), lines=[];
      c.steps.forEach(function(step,i) {
        var p=c.labs[i], hx=hex(p), color=ok(p), p3=!Engine.inG.apply(null,p.concat(['srgb'])); wide=wide||p3;
        var tokenStep=slug(step), base=tokenStep, n=2;
        while(Object.prototype.hasOwnProperty.call(steps,tokenStep)) tokenStep=base+'-'+n++;
        steps[tokenStep]={$value:hx}; if(p3) steps[tokenStep].$extensions={oklch:color};
        if(fmt==='tw3') lines.push('    '+JSON.stringify(tokenStep)+": '"+hx+"',");
        else lines.push('  --'+(fmt==='tw4'?'color-':'')+c.exportName+'-'+tokenStep+': '+(fmt==='oklch'||fmt==='tw4'?color:hx)+';');
      });
      if(fmt==='json') { tokens[c.exportName]=Object.assign({$type:'color'},steps); }
      else if(fmt==='tw3') blocks.push('  '+JSON.stringify(c.exportName)+': {\n'+lines.join('\n')+'\n  },');
      else blocks.push(lines.join('\n'));
    });
    if(fmt==='json') return JSON.stringify(tokens,null,2)+'\n';
    if(fmt==='tw3') return '// Add to theme.extend.colors in tailwind.config.js\n{\n'+blocks.join('\n')+'\n}\n';
    return (wide&&fmt==='css'?'/* sRGB fallbacks; use CSS OKLCH for wide-gamut values. */\n':'')+(fmt==='tw4'?'@theme {\n':':root {\n')+blocks.join('\n')+'\n}\n';
  }
  return { LIMIT:LIMIT, clone:clone, slug:slug, hex:hex, ok:ok, inventory:inventory, validColumn:validColumn, transform:transform, simulate:simulate, contrast:contrast, chartIndex:chartIndex, chartRows:chartRows, weakest:weakest, suggest:suggest, fromSet:fromSet, setBenchmark:setBenchmark, named:named, serialize:serialize };
})();
