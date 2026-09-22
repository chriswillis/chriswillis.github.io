/**
 * Phase 4 — render the audit on real components.
 *
 * A contrast number is a claim about something you can look at, and the cheapest
 * way to check a claim like that is to look. This builds one self-contained HTML
 * page: the semantic tokens driving actual buttons, inputs, cards, tables and
 * text at real sizes, in both modes side by side, next to the contrast matrix,
 * the colour-vision simulations and every lint finding.
 *
 * The components are styled *only* from the semantic tokens. If `surface/hover`
 * is indistinguishable from `surface/normal`, the button on this page does not
 * appear to respond, which is the point — the page fails the same way the
 * palette does.
 */
import type { TokenSet, Mode } from '../tokens/build.ts';
import { toCSS } from '../tokens/emit.ts';
import { simulate, DEFICIENCIES, type Audit } from './audit.ts';
import type { LintResult, Finding } from './lint.ts';
import { converter } from 'culori';
import type { Oklch } from '../color/oklch.ts';

const toRgb = converter('rgb');
const hexOf = (c: Oklch): string => {
  const r = toRgb({ mode: 'oklch', l: c.l, c: c.c, h: Number.isFinite(c.h) ? c.h : undefined });
  const q = (v: number | undefined) => Math.min(255, Math.max(0, Math.round((v ?? 0) * 255)));
  return `#${[q(r.r), q(r.g), q(r.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The demo UI, styled entirely from the semantic tokens. */
const COMPONENTS = `
<div class="demo">
  <div class="row">
    <button class="btn solid">Continue</button>
    <button class="btn solid hover">Hovered</button>
    <button class="btn outline">Cancel</button>
    <button class="btn outline focus">Focused</button>
    <button class="btn solid" disabled>Disabled</button>
  </div>
  <div class="card">
    <div class="card-head">
      <span class="dot"></span>
      <strong>Quarterly review</strong>
      <span class="badge">In progress</span>
    </div>
    <p>Body text at 16px, on the component surface. It has to clear 4.5:1 and Lc&nbsp;60 to be a body text token at all, which is what <code>content/normal</code> is held to.</p>
    <p class="subtle">Secondary text at 14px — <code>content/subtle</code>, held to the same contrast, quieter by role rather than by legibility.</p>
    <div class="field">
      <label for="x">Label</label>
      <input id="x" type="text" value="Input value" />
    </div>
    <a href="#0">A link in the ramp's own colour</a>
  </div>
  <table>
    <thead><tr><th>Region</th><th>Revenue</th><th>Change</th></tr></thead>
    <tbody>
      <tr><td>North</td><td class="num">1,284</td><td class="num">+4.2%</td></tr>
      <tr class="hover"><td>South</td><td class="num">982</td><td class="num">−1.1%</td></tr>
      <tr><td>East</td><td class="num">1,510</td><td class="num">+9.8%</td></tr>
    </tbody>
  </table>
  <div class="row small">
    <span class="chip">surface/normal</span>
    <span class="chip hover">surface/hover</span>
    <span class="chip active">surface/active</span>
  </div>
</div>`;

const COMPONENT_CSS = `
.demo { background: var(--color-background-page); color: var(--color-content-normal); padding: 24px; border-radius: 12px; display: grid; gap: 20px; }
.demo .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.btn { font: inherit; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
.btn.solid { background: var(--color-background-solid); color: var(--color-content-on-solid); }
.btn.solid.hover { background: var(--color-background-solid-hover); }
.btn.solid[disabled] { background: var(--color-surface-active); color: var(--color-content-disabled); cursor: not-allowed; }
.btn.outline { background: var(--color-surface-normal); color: var(--color-content-normal); border-color: var(--color-border-normal); }
.btn.outline.focus { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
.card { background: var(--color-surface-normal); border: 1px solid var(--color-border-subtle); border-radius: 12px; padding: 18px; display: grid; gap: 12px; }
.card-head { display: flex; align-items: center; gap: 10px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-indicator-normal); }
.badge { margin-left: auto; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: var(--color-background-subtle); color: var(--color-content-subtle); border: 1px solid var(--color-border-subtle); }
.card p { margin: 0; font-size: 16px; line-height: 1.55; }
.card p.subtle { font-size: 14px; color: var(--color-content-subtle); }
.card code { background: var(--color-background-subtle); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
.field { display: grid; gap: 5px; }
.field label { font-size: 13px; color: var(--color-content-subtle); }
.field input { font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 8px; background: var(--color-background-page); color: var(--color-content-normal); border: 1px solid var(--color-border-normal); }
.field input:focus { outline: 2px solid var(--color-border-focus); outline-offset: 1px; }
.demo a { color: var(--color-content-subtle); text-underline-offset: 3px; }
.demo table { width: 100%; border-collapse: collapse; font-size: 14px; }
.demo th { text-align: left; font-weight: 600; color: var(--color-content-subtle); border-bottom: 1px solid var(--color-border-normal); padding: 8px 10px; }
.demo td { padding: 8px 10px; border-bottom: 1px solid var(--color-border-subtle); }
.demo tr.hover td { background: var(--color-surface-hover); }
.demo td.num { text-align: right; font-variant-numeric: tabular-nums; }
.chip { font-size: 12px; padding: 5px 10px; border-radius: 6px; background: var(--color-surface-normal); border: 1px solid var(--color-border-subtle); }
.chip.hover { background: var(--color-surface-hover); }
.chip.active { background: var(--color-surface-active); }
`;

function matrixTable(a: Audit, mode: Mode, measure: 'wcag' | 'apca'): string {
  const m = a.matrix[mode];
  if (!m) return '';
  const head = `<tr><th></th>${m.keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr>`;
  const rows = m.cells.map((row, i) => {
    const cells = row.map((c, j) => {
      if (i === j) return '<td class="self"></td>';
      const ok = measure === 'wcag' ? c.bodyWcag : c.bodyApca;
      const big = measure === 'wcag' ? c.wcag >= 3 : Math.abs(c.apca) >= 45;
      const v = measure === 'wcag' ? c.wcag.toFixed(1) : Math.abs(c.apca).toFixed(0);
      const cls = ok ? 'body' : big ? 'large' : 'none';
      const dis = c.bodyWcag !== c.bodyApca ? ' dis' : '';
      return `<td class="${cls}${dis}" title="${esc(m.keys[i]!)} on ${esc(m.keys[j]!)}: ${c.wcag.toFixed(2)}:1, Lc ${c.apca.toFixed(0)}">${v}</td>`;
    }).join('');
    return `<tr><th>${esc(m.keys[i]!)}</th>${cells}</tr>`;
  }).join('');
  return `<table class="matrix">${head}${rows}</table>`;
}

function cvdStrip(set: TokenSet, mode: Mode): string {
  const brand = set.primitives.find((p) => p.kind === 'chromatic')?.family;
  const ramp = set.primitives.filter((p) => p.family === brand && p.values[mode]);
  const row = (label: string, map: (c: Oklch) => Oklch) =>
    `<div class="strip"><span>${esc(label)}</span><div>${ramp.map((p) => `<i style="background:${hexOf(map(p.values[mode]!.oklch))}" title="${esc(p.step)}"></i>`).join('')}</div></div>`;
  return [row('as seen', (c) => c), ...DEFICIENCIES.map((k) => row(k, (c) => simulate(c, k)))].join('');
}

function findingsList(l: LintResult): string {
  if (!l.findings.length) return '<p class="quiet">No findings.</p>';
  const item = (f: Finding) => `
    <li class="f ${f.severity}">
      <div class="f-head"><span class="sev">${f.severity}</span><code>${esc(f.rule)}</code><span class="quiet">${esc(String(f.mode))}</span></div>
      <p>${esc(f.message)}</p>
      ${f.remedy ? `<p class="remedy">${esc(f.remedy)}</p>` : ''}
    </li>`;
  return `<ul class="findings">${l.findings.map(item).join('')}</ul>`;
}

function band(label: string, value: number, b: { p10: number; median: number; p90: number; min: number; max: number }, digits = 3): string {
  const span = Math.max(1e-9, b.max - b.min);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - b.min) / span) * 100))}%`;
  return `
    <div class="band">
      <div class="band-label">${esc(label)}<b>${value.toFixed(digits)}</b></div>
      <div class="band-track">
        <span class="p10-90" style="left:${pos(b.p10)};right:calc(100% - ${pos(b.p90)})"></span>
        <span class="median" style="left:${pos(b.median)}"></span>
        <span class="you" style="left:${pos(value)}"></span>
      </div>
      <div class="band-scale"><span>${b.min.toFixed(digits)}</span><span>corpus p10–p90, median marked</span><span>${b.max.toFixed(digits)}</span></div>
    </div>`;
}

export interface RenderOptions {
  title?: string;
  /** Include the full step×step matrices. Default true. */
  matrices?: boolean;
}

export function renderAudit(set: TokenSet, a: Audit, l: LintResult, opts: RenderOptions = {}): string {
  const title = opts.title ?? `${set.name} — audit`;
  const tokenCss = toCSS(set, { comments: false });
  const u = a.uniformity['light'];
  const cv = a.cvd['light'];
  const h = a.headroom['light'];
  const modes = set.modes;

  const standing = cv?.standing && cv.betweenFamilies.deutan.pairs > 0
    ? `<p>Under deuteranopia, ${cv.betweenFamilies.deutan.collapsed.length} of ${cv.betweenFamilies.deutan.pairs} family pairs become indistinguishable (${(cv.betweenFamilies.deutan.rate * 100).toFixed(1)}%) — lower than ${cv.standing.beats} of the ${cv.standing.of} reference systems${cv.standing.ties ? `, level with ${cv.standing.ties}` : ''}.</p>`
    : '<p class="quiet">Only one family in this set, so there is no between-family check to run. That is the check that usually bites: within a single ramp, colour-vision deficiency barely moves anything, because a one-hue ramp is mostly a lightness ramp.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${tokenCss}
:root {
  --ink: #16161a; --paper: #fbfbfd; --rule: #e3e3ea; --quiet: #6b6b78;
  --ok: #15803d; --warn: #b45309; --err: #b91c1c;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --ink: #ececf1; --paper: #131316; --rule: #2b2b33; --quiet: #9a9aa8; --ok: #4ade80; --warn: #fbbf24; --err: #f87171; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 40px 16px 80px; }
h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 44px 0 12px; letter-spacing: -0.005em; }
h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--quiet); margin: 22px 0 10px; font-weight: 600; }
p { margin: 0 0 12px; max-width: 72ch; }
.quiet { color: var(--quiet); }
.lede { color: var(--quiet); margin-bottom: 28px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.summary { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
.pill { font-size: 13px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--rule); }
.pill.err { color: var(--err); border-color: currentColor; }
.pill.warn { color: var(--warn); border-color: currentColor; }
.pill.ok { color: var(--ok); border-color: currentColor; }
.modes { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 900px) { .modes { grid-template-columns: 1fr 1fr; } }
.mode-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--quiet); margin-bottom: 8px; }
${COMPONENT_CSS}
table.matrix { border-collapse: collapse; font: 11px/1 ui-monospace, monospace; }
table.matrix th { color: var(--quiet); font-weight: 500; padding: 3px 5px; }
table.matrix td { padding: 4px 5px; text-align: right; border: 1px solid var(--paper); }
table.matrix td.body { background: color-mix(in oklab, var(--ok) 22%, transparent); }
table.matrix td.large { background: color-mix(in oklab, var(--warn) 18%, transparent); }
table.matrix td.none { background: color-mix(in oklab, var(--quiet) 8%, transparent); color: var(--quiet); }
table.matrix td.self { background: var(--rule); }
table.matrix td.dis { outline: 1.5px solid var(--err); outline-offset: -1.5px; }
.legend { display: flex; gap: 14px; font-size: 12px; color: var(--quiet); margin: 8px 0 0; flex-wrap: wrap; }
.legend i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
.strip { display: flex; align-items: center; gap: 12px; margin-bottom: 5px; }
.strip > span { width: 66px; font-size: 12px; color: var(--quiet); text-align: right; }
.strip > div { display: flex; flex: 1; border-radius: 5px; overflow: hidden; }
.strip i { flex: 1; height: 26px; }
.band { margin: 0 0 18px; max-width: 620px; }
.band-label { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
.band-track { position: relative; height: 8px; background: color-mix(in oklab, var(--quiet) 12%, transparent); border-radius: 4px; }
.band-track span { position: absolute; top: 0; bottom: 0; }
.p10-90 { background: color-mix(in oklab, var(--quiet) 28%, transparent); border-radius: 4px; }
.median { width: 2px; background: var(--quiet); }
.you { width: 3px; background: var(--ink); border-radius: 2px; top: -4px; bottom: -4px; }
.band-scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--quiet); margin-top: 4px; }
ul.findings { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
li.f { border: 1px solid var(--rule); border-left-width: 3px; border-radius: 8px; padding: 12px 14px; }
li.f.error { border-left-color: var(--err); }
li.f.warning { border-left-color: var(--warn); }
li.f.info { border-left-color: var(--quiet); }
.f-head { display: flex; gap: 10px; align-items: center; font-size: 12px; margin-bottom: 6px; }
.sev { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; font-size: 11px; }
li.f.error .sev { color: var(--err); } li.f.warning .sev { color: var(--warn); } li.f.info .sev { color: var(--quiet); }
li.f p { margin: 0; font-size: 14px; }
li.f p.remedy { color: var(--quiet); margin-top: 5px; font-size: 13px; }
footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--quiet); }
</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="lede">
    ${set.primitives.length} primitives and ${set.semantics.length} semantic tokens from
    ${esc(set.provenance.referenceName)}${set.provenance.seedStep ? `, seeded at step ${esc(set.provenance.seedStep)}` : ''}.
    Dark mode ${esc(set.provenance.darkReference?.kind ?? 'n/a')}. Every number below is measured on the emitted 8-bit colour,
    not the intended one, and every band is the distribution across ${a.corpus.ramps} ramps in ${a.corpus.systems} shipping systems.
  </p>
  <div class="summary">
    <span class="pill ${l.counts.error ? 'err' : 'ok'}">${l.counts.error} error${l.counts.error === 1 ? '' : 's'}</span>
    <span class="pill ${l.counts.warning ? 'warn' : 'ok'}">${l.counts.warning} warning${l.counts.warning === 1 ? '' : 's'}</span>
    <span class="pill">${l.counts.info} note${l.counts.info === 1 ? '' : 's'}</span>
  </div>

  <h2>The tokens, driving real components</h2>
  <p class="quiet">Styled only from the semantic layer. If a state is indistinguishable in the palette, it is indistinguishable here.</p>
  <div class="modes">
    ${modes.map((m) => `<div><div class="mode-label">${esc(m)}</div><div class="${m === 'dark' ? 'dark' : ''}" data-theme="${esc(m)}">${COMPONENTS}</div></div>`).join('')}
  </div>

  <h2>Contrast matrix</h2>
  <p class="quiet">Every ordered pair of steps. Green clears body text, amber clears large text only, grey clears neither; a red outline marks the pairs where WCAG&nbsp;2.1 and APCA disagree about which of those it is.</p>
  <div class="modes">
    ${modes.map((m) => `<div><div class="mode-label">${esc(m)} — WCAG 2.1</div>${matrixTable(a, m, 'wcag')}</div>`).join('')}
    ${modes.map((m) => `<div><div class="mode-label">${esc(m)} — APCA |Lc|</div>${matrixTable(a, m, 'apca')}</div>`).join('')}
  </div>
  <div class="legend">
    <span><i style="background:color-mix(in oklab, var(--ok) 22%, transparent)"></i>body text</span>
    <span><i style="background:color-mix(in oklab, var(--warn) 18%, transparent)"></i>large text only</span>
    <span><i style="background:color-mix(in oklab, var(--quiet) 8%, transparent)"></i>neither</span>
    <span><i style="outline:1.5px solid var(--err);outline-offset:-1.5px"></i>the two measures disagree</span>
    ${modes.map((m) => `<span>${esc(m)}: ${((a.matrix[m]?.usable.disagree ?? 0) * 100).toFixed(1)}% of pairs disagree</span>`).join('')}
  </div>

  <h2>Colour-vision deficiency</h2>
  <p class="quiet">Machado, Oliveira &amp; Fernandes (2009) at full severity. A simulation answers "can these two be told apart", not "what does this look like".</p>
  <div class="modes">
    ${modes.map((m) => `<div><div class="mode-label">${esc(m)}</div>${cvdStrip(set, m)}</div>`).join('')}
  </div>
  ${standing}

  <h2>Where this palette sits in the corpus</h2>
  ${u ? band('step spacing, coefficient of variation (lower is more even)', u.cv, a.corpus.stepUniformityCv, 3) : ''}
  ${u ? band('smallest gap between consecutive steps, ΔEOK (higher is safer)', u.min, a.corpus.smallestStep, 4) : ''}
  ${cv ? band('smallest adjacent gap under deuteranopia, ΔEOK', cv.within.deutan.minAdjacent, a.corpus.cvd.deutan.minAdjacent, 4) : ''}
  ${h ? band('mean relative chroma against the sRGB shell', h.meanRelCSrgb, a.corpus.relCSrgb, 3) : ''}
  ${h ? band('share of steps sitting on the sRGB shell', h.onShellSrgb, a.corpus.atShellSrgb, 3) : ''}

  <h2>Findings</h2>
  ${findingsList(l)}

  <footer>
    ${esc(a.corpus.source)}. Generated by palette-dna${set.provenance.generatedAt ? ` · ${esc(set.provenance.generatedAt)}` : ''}.
    Nothing on this page has been repaired: a harness that fixes what it finds is a generator with extra steps.
  </footer>
</main>
</body>
</html>`;
}
