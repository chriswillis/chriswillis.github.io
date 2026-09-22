import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseTailwindThemeCss } from '../src/ingest/tailwind.ts';
import { datasetPaletteInput, DATASET_IDS } from '../src/ingest/dataset.ts';
import { parseToOklch, circularMean, circularSd } from '../src/color/oklch.ts';
const require = createRequire(import.meta.url);
const tw = parseTailwindThemeCss(readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8'));
console.log('=== Tailwind v4 neutrals, as authored ===');
for (const f of ['slate', 'gray', 'zinc', 'neutral', 'stone']) {
  const ok = Object.entries(tw[f]!).map(([k, v]) => ({ k, o: parseToOklch(v) }));
  const hs = ok.filter((x) => x.o.c > 0.001 && Number.isFinite(x.o.h)).map((x) => x.o.h);
  console.log(f.padEnd(8), 'L:', ok.map((x) => x.o.l.toFixed(3)).join(' '));
  console.log('        ', 'C:', ok.map((x) => x.o.c.toFixed(3)).join(' '));
  console.log('        ', 'h:', ok.map((x) => (Number.isNaN(x.o.h) ? '  --' : x.o.h.toFixed(0).padStart(4))).join(' '), ` | tint ${hs.length ? circularMean(hs).toFixed(0) + '°±' + circularSd(hs).toFixed(0) : 'none'}  maxC ${Math.max(...ok.map((x) => x.o.c)).toFixed(3)}`);
}
console.log('\n=== neutral families per system (dropped at ingest today) ===');
for (const id of DATASET_IDS) {
  const { colors, neutrals } = datasetPaletteInput(id);
  const info = neutrals.filter((n) => colors[n] && Object.keys(colors[n]!).length > 2).map((n) => {
    const ok = Object.values(colors[n]!).map(parseToOklch);
    const hs = ok.filter((o) => o.c > 0.001 && Number.isFinite(o.h)).map((o) => o.h);
    return `${n}(${ok.length}st maxC ${Math.max(...ok.map((o) => o.c)).toFixed(3)}${hs.length ? ` tint ${circularMean(hs).toFixed(0)}°±${circularSd(hs).toFixed(0)}` : ''})`;
  });
  console.log(id.padEnd(13), info.length ? info.join('  ') : 'none');
}
