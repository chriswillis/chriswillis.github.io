import { loadTailwindV4 } from '../src/ingest/tailwind.ts';
import { loadRadix } from '../src/ingest/radix.ts';
import { extractRamp } from '../src/dna/extract.ts';
import { shell, exactCuspChroma } from '../src/gamut/shell.ts';
import { parseToOklch } from '../src/color/oklch.ts';
import Color from 'colorjs.io';

const tw = loadTailwindV4();
const rx = loadRadix({ mode: 'light', gamut: 'srgb' });

function table(system: Map<string, any>, fam: string) {
  const dna = extractRamp(system.get(fam)!);
  console.log(`\n${dna.system} / ${fam}  (anchor idx ${dna.anchorIndex}, peak idx ${dna.peakIndex})`);
  console.log('key    n     L      C      h       relC_s  relC_p3  Δh_anc  Δh_peak  inS  inP3  WCAG/first  WCAG/last  APCA on first  APCA on last');
  for (const s of dna.steps) {
    console.log(
      s.key.padEnd(5),
      s.n.toFixed(2),
      s.L.toFixed(3),
      s.C.toFixed(3),
      s.h.toFixed(1).padStart(6),
      s.relC.srgb.toFixed(3).padStart(7),
      s.relC.p3.toFixed(3).padStart(7),
      s.dhAnchor.toFixed(1).padStart(7),
      s.dhPeak.toFixed(1).padStart(7),
      String(s.inGamut.srgb).padStart(5),
      String(s.inGamut.p3).padStart(5),
      s.contrast.wcagVsFirst.toFixed(2).padStart(9),
      s.contrast.wcagVsLast.toFixed(2).padStart(10),
      s.contrast.apcaOnFirst.toFixed(1).padStart(12),
      s.contrast.apcaOnLast.toFixed(1).padStart(13),
    );
  }
}

for (const f of ['blue', 'yellow', 'green']) {
  table(tw, f);
  table(rx, f);
}

// ── LUT vs exact cusp ──────────────────────────────────────────────────────
console.log('\nLUT vs exact cusp chroma (sample of ramp points):');
let worst = { srgb: 0, p3: 0 };
const samples: { L: number; h: number }[] = [];
for (const [sys, fams] of [[tw, ['blue', 'yellow', 'green']], [rx, ['blue', 'yellow', 'green']]] as const) {
  for (const f of fams) for (const s of sys.get(f)!.steps) {
    const o = parseToOklch(s.css);
    samples.push({ L: o.l, h: o.h });
  }
}
for (const g of ['srgb', 'p3'] as const) {
  for (const { L, h } of samples) {
    const lut = shell(g).cuspChroma(L, h);
    const ex = exactCuspChroma(g, L, h);
    worst[g] = Math.max(worst[g], Math.abs(lut - ex));
  }
}
console.log('worst |LUT − exact| chroma:', worst);

// ── culori vs Color.js oklch conversion ────────────────────────────────────
let worstConv = 0;
for (const [sys, f] of [[tw, 'blue'], [tw, 'yellow'], [rx, 'yellow'], [rx, 'green']] as const) {
  for (const s of sys.get(f)!.steps) {
    const a = parseToOklch(s.css);
    const b = new Color(s.css).to('oklch');
    const [l, c, h] = b.coords as [number, number, number];
    const d = Math.max(Math.abs(a.l - l), Math.abs(a.c - c), Number.isNaN(a.h) || Number.isNaN(h) ? 0 : Math.abs(a.h - h));
    worstConv = Math.max(worstConv, d);
  }
}
console.log('worst culori vs Color.js oklch coord discrepancy:', worstConv.toExponential(2));
