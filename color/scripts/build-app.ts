/**
 * Build the explorer into one self-contained HTML file.
 *
 * Self-contained is the requirement, not a preference: the page has to work from
 * a file:// URL, from a static host, and as a published artifact, and the last of
 * those blocks external requests entirely. So the app bundle, the worker bundle
 * and all thirteen DNA files are inlined.
 *
 * The worker is built separately and as IIFE rather than ESM, because it is
 * instantiated from a Blob URL and a classic worker cannot take module syntax.
 *
 *   npx tsx scripts/build-app.ts          → out/app/index.html
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const bundle = async (entry: string, format: 'esm' | 'iife'): Promise<string> => {
  const r = await build({
    entryPoints: [entry],
    bundle: true, format, platform: 'browser', minify: true,
    write: false, target: 'es2022', legalComments: 'none',
  });
  return r.outputFiles[0]!.text;
};

const ids = (JSON.parse(readFileSync('dna/index.json', 'utf8')) as { systems: { id: string }[] }).systems.map((s) => s.id);
const dna: Record<string, unknown> = {};
for (const id of ids) dna[id] = JSON.parse(readFileSync(`dna/${id}.json`, 'utf8'));

const [app, worker] = await Promise.all([bundle('app/main.ts', 'esm'), bundle('app/fuzz-worker.ts', 'iife')]);

// Every substitution goes through a replacer FUNCTION, never a replacement
// string. A replacement string treats `$&`, `$'` and `` $` `` as patterns, and
// minified JavaScript and JSON are full of `$`: the first attempt at this
// produced a 20 MB file, because `$'` spliced the remainder of the document back
// into itself once per occurrence.
const put = (s: string, find: string | RegExp, value: string) => s.replace(find, () => value);
const closeTag = (s: string) => s.replace(/<\/script/gi, () => '<\\/script');

let html = readFileSync('app/shell.html', 'utf8');
html = put(html, /\/\*__DNA__\*\/[\s\S]*?\/\*__DNA__\*\//, JSON.stringify(dna));
// the worker lives in a <script type="text/plain">, so anything that could close
// it early has to be neutralised; the browser reads the text back unescaped
html = put(html, '/*__WORKER__*/', closeTag(worker));
html = put(html, '/*__APP__*/', closeTag(app));

mkdirSync('out/app', { recursive: true });
writeFileSync('out/app/index.html', html);

/**
 * A second variant for publishing as an artifact. The publisher wraps the file
 * in its own doctype/head/body at deploy time, so a complete document would be
 * nested inside another one; it wants the title, the styles and the body content
 * and nothing else.
 */
const pick = (re: RegExp) => html.match(re)?.[0] ?? '';
const artifact = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<style>[\s\S]*?<\/style>/),
  html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')),
].join('\n');
writeFileSync('out/app/artifact.html', artifact);

const kb = (s: string | Buffer) => `${(Buffer.byteLength(s as string) / 1024).toFixed(0)} KB`;
console.log(`out/app/index.html     ${kb(html)}  (${kb(gzipSync(html))} gzipped)  — standalone, opens from disk`);
console.log(`out/app/artifact.html  ${kb(artifact)}  — no skeleton, for publishing`);
console.log(`  app    ${kb(app)}`);
console.log(`  worker ${kb(worker)}`);
console.log(`  dna    ${kb(JSON.stringify(dna))}  — ${ids.length} systems`);
