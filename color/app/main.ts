/**
 * The explorer: a control bar over the audit page.
 *
 * The audit page is not reimplemented here. `renderAudit` already produces the
 * whole thing — components driven by the semantic tokens, contrast matrices in
 * both measures, CVD strips, corpus bands, every finding — as one self-contained
 * document, and the explorer drops that document into an iframe and regenerates
 * it whenever a control moves. So the tool and the artefact it writes can never
 * drift apart, and there is no second copy of the CSS to keep in step.
 *
 * Solving is fast enough to do it on every change: ~6 ms for the full
 * solve → tokens → audit → lint, once the dark derivation is memoised. The
 * iframe reparse is the slow part, so changes are debounced rather than the
 * solve.
 */
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { solvePair } from '../src/solver/pair.ts';
import { buildTokens } from '../src/tokens/build.ts';
import { audit } from '../src/validate/audit.ts';
import { lint } from '../src/validate/lint.ts';
import { renderAudit } from '../src/validate/render.ts';
import { toCSS, toTailwind } from '../src/tokens/emit.ts';
import { toDTCG } from '../src/tokens/dtcg.ts';
import { parseToOklch } from '../src/color/oklch.ts';
import { deriveSemanticHues, type DerivedSemantics } from '../src/tokens/semantics.ts';
import type { CentroidTable } from '../src/dna/centroids.ts';
import type { Gamut } from '../src/gamut/shell.ts';
import type { FuzzResult, Violation } from '../src/validate/fuzz.ts';

declare global {
  interface Window { __DNA__: Record<string, unknown>; __CENTROIDS__: CentroidTable; __FUZZ_WORKER__: string }
}

const RAW = window.__DNA__;
const DNA: Record<string, SystemDNA> = {};
for (const [id, v] of Object.entries(RAW)) DNA[id] = parseDNA(JSON.stringify(v));
const LIGHT = Object.keys(DNA).filter((id) => DNA[id]!.mode === 'light');
const CENTROIDS = window.__CENTROIDS__;

interface State {
  seed: string;
  reference: string;
  spacing: 'auto' | 'reference' | 'even';
  lightness: 'oklab' | 'hk';
  gamut: Gamut;
  neutrals: boolean;
  semantics: boolean;
}
const state: State = {
  seed: '#7c3aed', reference: 'tailwind-v4', spacing: 'auto',
  lightness: 'oklab', gamut: 'p3', neutrals: true, semantics: false,
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The one-line call that reproduces what is on screen. */
function repro(s: State): string {
  const bits = [`seed: '${s.seed}'`, `reference: '${s.reference}'`];
  if (s.spacing !== 'auto') bits.push(`spacing: '${s.spacing}'`);
  if (s.lightness !== 'oklab') bits.push(`lightness: '${s.lightness}'`);
  if (s.gamut !== 'p3') bits.push(`gamut: '${s.gamut}'`);
  if (s.neutrals) bits.push('neutrals: true');
  if (s.semantics) bits.push('semantics: true');
  return `palette({ ${bits.join(', ')} })`;
}

/**
 * The derivation is the slowest thing in a refresh — around 70 ms against 7 ms
 * for the whole solve, because it sweeps four hue bands and solves a ramp at
 * each position. It depends only on the reference, the gamut and the brand hue,
 * none of which change when the seed's lightness or chroma is dragged, so it is
 * memoised on those three and most seed edits cost nothing.
 */
const derivedCache = new Map<string, DerivedSemantics>();
function semanticsFor(light: SystemDNA, brandHue: number): DerivedSemantics {
  const k = `${light.id}|${state.gamut}|${brandHue.toFixed(1)}`;
  let v = derivedCache.get(k);
  if (!v) { v = deriveSemanticHues({ dna: light, centroids: CENTROIDS, brandHue, gamut: state.gamut }); derivedCache.set(k, v); }
  return v;
}

let last: { css: string; tw: string; dtcg: string } | null = null;

function solve(): { html: string; errors: number; warnings: number; infos: number; ms: number; warns: string[]; semantics: DerivedSemantics | null } {
  const t0 = performance.now();
  const light = DNA[state.reference]!;
  const dark = light.pairedWith && DNA[light.pairedWith] ? DNA[light.pairedWith] : undefined;
  const common = {
    light, ...(dark ? { dark } : {}), seed: state.seed, gamut: state.gamut,
    spacing: state.spacing, lightness: state.lightness,
  } as const;
  const pair = solvePair({ ...common, neutrals: state.neutrals });

  const families: Record<string, { light: ReturnType<typeof solvePair>['light']; dark: ReturnType<typeof solvePair>['dark'] }> = {};
  let semantics: DerivedSemantics | null = null;
  if (state.semantics) {
    semantics = semanticsFor(light, pair.light.target.hueAtPeak);
    for (const [name, hue] of Object.entries(semantics.hues)) {
      const p = solvePair({ ...common, seed: undefined, hue });
      families[name] = { light: p.light, dark: p.dark };
    }
  }

  const tokens = buildTokens(pair, { families });
  const a = audit(tokens, { reference: light, families, ramps: { light: pair.light, dark: pair.dark } });
  const l = lint(tokens, a);
  last = { css: toCSS(tokens), tw: toTailwind(tokens), dtcg: JSON.stringify(toDTCG(tokens), null, 2) };
  return {
    html: renderAudit(tokens, a, l),
    errors: l.counts.error, warnings: l.counts.warning, infos: l.counts.info,
    ms: performance.now() - t0,
    warns: [...pair.warnings, ...pair.light.warnings, ...pair.dark.warnings, ...(semantics?.warnings ?? [])],
    semantics,
  };
}

let timer: number | undefined;
function refresh(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    let r: ReturnType<typeof solve>;
    try {
      r = solve();
    } catch (e) {
      $('#status').innerHTML = `<span class="pill err">threw</span> <code>${esc((e as Error).message)}</code>`;
      return;
    }
    $<HTMLIFrameElement>('#page').srcdoc = r.html;
    $('#status').innerHTML =
      `<span class="pill ${r.errors ? 'err' : 'ok'}">${r.errors} error${r.errors === 1 ? '' : 's'}</span>` +
      `<span class="pill ${r.warnings ? 'warn' : 'ok'}">${r.warnings} warning${r.warnings === 1 ? '' : 's'}</span>` +
      `<span class="pill">${r.infos} note${r.infos === 1 ? '' : 's'}</span>` +
      `<span class="pill">${r.ms.toFixed(0)} ms</span>` +
      (r.semantics ? semanticsPills(r.semantics) : '');
    $('#warns').innerHTML = r.warns.length
      ? `<details><summary>${r.warns.length} solver note${r.warns.length === 1 ? '' : 's'}</summary><ul>${r.warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>`
      : '';
    $('#repro').textContent = repro(state);
  }, 90);
}

/**
 * What the derivation is worth, in the status line. The separation is the number
 * that matters — the closest any two of the five families come, in any of the
 * four views — and it is shown against the corpus rather than against a pass
 * mark, because there is no threshold to pass, only a distribution to sit in.
 */
function semanticsPills(d: DerivedSemantics): string {
  const cls = d.corpus.verdict === 'better than most' ? 'ok' : d.corpus.verdict === 'worse than most' ? 'warn' : '';
  const hues = Object.entries(d.hues).map(([n, h]) => `${n} ${h.toFixed(0)}°`).join(' · ');
  return `<span class="pill ${cls}" title="closest of the ten family pairs, worst of normal/protan/deutan/tritan">` +
    `ΔEOK ${d.achieved.min.toFixed(4)} — ${esc(d.corpus.verdict)}</span>` +
    `<span class="pill" title="against the conventional hues">${d.gain >= 0 ? '+' : ''}${d.gain.toFixed(4)} from placing</span>` +
    `<span class="pill" title="derived hues">${esc(hues)}</span>`;
}

// ── controls ────────────────────────────────────────────────────────────────

function control(label: string, el: HTMLElement): HTMLElement {
  const w = document.createElement('label');
  w.className = 'ctl';
  w.innerHTML = `<span>${esc(label)}</span>`;
  w.appendChild(el);
  return w;
}

function select<K extends keyof State>(key: K, options: readonly string[]): HTMLSelectElement {
  const s = document.createElement('select');
  s.innerHTML = options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  s.value = String(state[key]);
  s.onchange = () => { (state[key] as unknown as string) = s.value; refresh(); };
  return s;
}

function toggle<K extends keyof State>(key: K): HTMLInputElement {
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = Boolean(state[key]);
  c.onchange = () => { (state[key] as unknown as boolean) = c.checked; refresh(); };
  return c;
}

function buildControls(): void {
  const bar = $('#controls');

  const hex = document.createElement('input');
  hex.type = 'color';
  hex.value = '#7c3aed';
  const text = document.createElement('input');
  text.type = 'text';
  text.value = state.seed;
  text.spellcheck = false;
  const setSeed = (v: string, syncPicker: boolean) => {
    try { parseToOklch(v); } catch { text.classList.add('bad'); return; }
    text.classList.remove('bad');
    state.seed = v;
    if (syncPicker && /^#[0-9a-f]{6}$/i.test(v)) hex.value = v;
    refresh();
  };
  hex.oninput = () => { text.value = hex.value; setSeed(hex.value, false); };
  text.oninput = () => setSeed(text.value, true);

  const seedWrap = document.createElement('span');
  seedWrap.className = 'seed';
  seedWrap.append(hex, text);

  bar.append(
    control('seed', seedWrap),
    control('reference', select('reference', LIGHT)),
    control('spacing', select('spacing', ['auto', 'reference', 'even'])),
    control('lightness', select('lightness', ['oklab', 'hk'])),
    control('gamut', select('gamut', ['p3', 'srgb'])),
    control('neutrals', toggle('neutrals')),
    control('derive semantics', toggle('semantics')),
  );

  const actions = document.createElement('span');
  actions.className = 'actions';

  const rnd = document.createElement('button');
  rnd.textContent = 'random seed';
  rnd.onclick = () => {
    const l = 0.25 + Math.random() * 0.5, c = Math.random() * 0.3, h = Math.random() * 360;
    const v = `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`;
    text.value = v; setSeed(v, false);
  };
  actions.append(rnd);

  for (const [label, get] of [
    ['copy CSS', () => last?.css], ['copy Tailwind', () => last?.tw], ['copy tokens.json', () => last?.dtcg],
  ] as const) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = async () => {
      const v = get();
      if (!v) return;
      await navigator.clipboard.writeText(v).catch(() => {});
      b.textContent = 'copied';
      window.setTimeout(() => { b.textContent = label; }, 900);
    };
    actions.append(b);
  }
  bar.append(actions);
}

// ── the fuzz tab ────────────────────────────────────────────────────────────

let worker: Worker | null = null;

function startFuzz(cases: number, seed: number): void {
  if (worker) worker.terminate();
  const blob = new Blob([window.__FUZZ_WORKER__], { type: 'text/javascript' });
  worker = new Worker(URL.createObjectURL(blob));
  $('#fuzz-out').innerHTML = '<p class="quiet">starting…</p>';
  worker.onmessage = (ev: MessageEvent<{ kind: 'progress'; done: number; total: number } | { kind: 'done'; result: FuzzResult } | { kind: 'error'; message: string }>) => {
    const m = ev.data;
    if (m.kind === 'progress') {
      $('#fuzz-out').innerHTML = `<p class="quiet">${m.done} / ${m.total}…</p>`;
    } else if (m.kind === 'error') {
      $('#fuzz-out').innerHTML = `<p class="pill err">the campaign threw: ${esc(m.message)}</p>`;
    } else {
      renderFuzz(m.result);
    }
  };
  worker.postMessage({ dna: RAW, cases, seed });
}

/**
 * Violations are held in an array and referenced by index rather than serialised
 * into a data attribute. JSON inside an HTML attribute survives escaping, but it
 * is a round trip through two encodings to carry something the page already has
 * in memory, and the failure mode is silent.
 */
let shown: Violation[] = [];

function violationRow(v: Violation, i: number): string {
  const call = `palette({ seed: '${v.case.seed}', reference: '${v.case.reference}', spacing: '${v.case.spacing}', lightness: '${v.case.lightness}', gamut: '${v.case.gamut}' })`;
  return `<li class="f ${v.severity}"><div class="f-head"><span class="sev">${esc(v.kind)}</span><code>${esc(v.rule)}</code></div>` +
    `<p>${esc(v.message)}</p><p class="remedy"><code>${esc(call)}</code> ` +
    `<button data-i="${i}">open in explorer</button></p></li>`;
}

function renderFuzz(r: FuzzResult): void {
  const defects = [...r.crashes, ...r.invariants];
  shown = defects.slice(0, 40);
  const rules = Object.entries(r.byRule).filter(([, e]) => e.kind === 'finding').sort((a, b) => a[1].rate - b[1].rate);
  $('#fuzz-out').innerHTML =
    `<div class="summary"><span class="pill ${defects.length ? 'err' : 'ok'}">${defects.length} library defect${defects.length === 1 ? '' : 's'}</span>` +
    `<span class="pill">${r.campaign.cases} cases</span><span class="pill">${(r.campaign.elapsedMs / 1000).toFixed(1)}s</span>` +
    `<span class="pill">${r.campaign.perCaseMs.toFixed(1)} ms each</span><span class="pill">${r.clean} clean</span></div>` +
    (shown.length ? `<h3>crashes and invariant breaks</h3><ul class="findings">${shown.map(violationRow).join('')}</ul>` : '<p class="quiet">No crashes, no invariant breaks.</p>') +
    `<h3>lint rules, rarest first</h3><table class="rules"><tr><th>rule</th><th>severity</th><th>cases</th></tr>` +
    rules.map(([k, e]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(e.severity)}</td><td>${(100 * e.rate).toFixed(1)}%</td></tr>`).join('') +
    '</table>';

  for (const b of document.querySelectorAll<HTMLButtonElement>('#fuzz-out button[data-i]')) {
    b.onclick = () => {
      const c = shown[Number(b.dataset['i'])]?.case;
      if (!c) return;
      Object.assign(state, { seed: c.seed, reference: c.reference, spacing: c.spacing, lightness: c.lightness, gamut: c.gamut });
      location.hash = '#explore';
      buildControlsAgain();
      refresh();
    };
  }
}

function buildControlsAgain(): void {
  $('#controls').innerHTML = '';
  buildControls();
}

function buildFuzzTab(): void {
  const cases = document.createElement('input');
  cases.type = 'number'; cases.value = '400'; cases.min = '0'; cases.step = '100';
  const seed = document.createElement('input');
  seed.type = 'number'; seed.value = '1'; seed.min = '0';
  const go = document.createElement('button');
  go.textContent = 'run campaign';
  go.onclick = () => startFuzz(Number(cases.value), Number(seed.value));
  $('#fuzz-controls').append(control('random cases', cases), control('campaign seed', seed), go);
}

// ── tabs ────────────────────────────────────────────────────────────────────

function showTab(): void {
  const fuzz = location.hash === '#fuzz';
  $('#explore').hidden = fuzz;
  $('#fuzz').hidden = !fuzz;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('nav a')) {
    a.classList.toggle('on', (a.getAttribute('href') === '#fuzz') === fuzz);
  }
}

window.addEventListener('hashchange', showTab);
buildControls();
buildFuzzTab();
showTab();
refresh();
