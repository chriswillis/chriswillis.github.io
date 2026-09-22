/**
 * OKLCH parsing and hue arithmetic. culori is the workhorse here; Color.js is
 * the oracle in tests (see spike/verify.ts).
 */
import { parse, converter, formatHex, type Color as CuloriColor } from 'culori';

export interface Oklch {
  l: number;
  c: number;
  /** Degrees in [0, 360). NaN for achromatic. */
  h: number;
}

const toOklch = converter('oklch');
const toRgb = converter('rgb');

export function parseToOklch(css: string): Oklch {
  const parsed = parse(css);
  if (!parsed) throw new Error(`Cannot parse color: ${css}`);
  const o = toOklch(parsed);
  return { l: o.l, c: o.c, h: o.h === undefined ? NaN : wrap360(o.h) };
}

export function oklchToCulori(o: Oklch): CuloriColor {
  return { mode: 'oklch', l: o.l, c: o.c, h: Number.isNaN(o.h) ? undefined : o.h };
}

export function toHex(o: Oklch): string {
  return formatHex(toRgb(oklchToCulori(o)));
}

export function wrap360(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Signed shortest angular difference a − b in (−180, 180]. */
export function hueDelta(a: number, b: number): number {
  let d = wrap360(a) - wrap360(b);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Circular mean of hue angles in degrees, in [0, 360). */
export function circularMean(hs: number[]): number {
  let x = 0;
  let y = 0;
  for (const h of hs) {
    const r = (h * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  return wrap360((Math.atan2(y, x) * 180) / Math.PI);
}

/** Population SD of hue angles around their circular mean, in degrees. */
export function circularSd(hs: number[]): number {
  const m = circularMean(hs);
  const s = hs.reduce((acc, h) => acc + hueDelta(h, m) ** 2, 0) / hs.length;
  return Math.sqrt(s);
}

/** ΔEOK: Euclidean distance in OKLab. */
export function deltaEOK(a: Oklch, b: Oklch): number {
  const ah = Number.isNaN(a.h) ? 0 : (a.h * Math.PI) / 180;
  const bh = Number.isNaN(b.h) ? 0 : (b.h * Math.PI) / 180;
  const da = a.c * Math.cos(ah) - b.c * Math.cos(bh);
  const db = a.c * Math.sin(ah) - b.c * Math.sin(bh);
  const dl = a.l - b.l;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
