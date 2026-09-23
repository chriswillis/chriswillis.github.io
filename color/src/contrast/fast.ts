/**
 * Hot-path contrast on culori. Replicates Color.js 0.7.1 exactly (tested in
 * test/oracle.test.ts): WCAG 2.1 from XYZ-D65 Y; APCA 0.0.98G from unclamped
 * sRGB with the signed 2.4 power, soft black clamp, noise gate and offsets.
 */
import { converter } from 'culori';
import type { Oklch } from '../color/oklch.ts';

const toXyz = converter('xyz65');
const toRgb = converter('rgb');

function culori(o: Oklch) {
  return { mode: 'oklch' as const, l: o.l, c: o.c, h: Number.isNaN(o.h) ? undefined : o.h };
}

/** Relative luminance Y (XYZ D65), as Color.js `.luminance`. */
export function luminanceY(o: Oklch): number {
  return toXyz(culori(o)).y;
}

export function wcag21Fast(a: Oklch, b: Oklch): number {
  let y1 = Math.max(luminanceY(a), 0);
  let y2 = Math.max(luminanceY(b), 0);
  if (y2 > y1) [y1, y2] = [y2, y1];
  return (y1 + 0.05) / (y2 + 0.05);
}

// APCA 0.0.98G constants (as in colorjs.io/src/contrast/APCA.js)
const normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
const blkThrs = 0.022, blkClmp = 1.414, loClip = 0.1, deltaYmin = 0.0005;
const scaleBoW = 1.14, loBoWoffset = 0.027, scaleWoB = 1.14, loWoBoffset = 0.027;

const fclamp = (Y: number) => (Y >= blkThrs ? Y : Y + (blkThrs - Y) ** blkClmp);
const lin = (v: number) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), 2.4);

/** "Screen luminance" as APCA defines it (sRGB, 2.4 power, unclamped). */
export function apcaY(o: Oklch): number {
  const c = toRgb(culori(o));
  return lin(c.r) * 0.2126729 + lin(c.g) * 0.7151522 + lin(c.b) * 0.072175;
}

/** APCA Lc with `fg` as text on `bg`. Signed: positive for dark-on-light. */
export function apcaFast(fg: Oklch, bg: Oklch): number {
  return apcaFromY(apcaY(fg), apcaY(bg));
}

export function apcaFromY(lumTxt: number, lumBg: number): number {
  const Ytxt = fclamp(lumTxt);
  const Ybg = fclamp(lumBg);
  let C: number;
  if (Math.abs(Ybg - Ytxt) < deltaYmin) C = 0;
  else if (Ybg > Ytxt) C = (Ybg ** normBG - Ytxt ** normTXT) * scaleBoW;
  else C = (Ybg ** revBG - Ytxt ** revTXT) * scaleWoB;
  let Sapc: number;
  if (Math.abs(C) < loClip) Sapc = 0;
  else if (C > 0) Sapc = C - loBoWoffset;
  else Sapc = C + loWoBoffset;
  return Sapc * 100;
}
