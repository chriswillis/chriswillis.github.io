// Builds the two Palette DNA social images. Serve the repository root first:
//   python3 -m http.server 8000
// then, from a folder where Playwright is installed (for example color/):
//   node ../reviews/color-tools/social/capture.cjs http://localhost:8000
// Writes surface-tailwind4.png here, and og-palette-dna-ramp.png and og-palette-dna-map.png at the repository root.
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8000';
const here = __dirname, root = path.join(__dirname, '../../..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const p = await ctx.newPage();
  await p.goto(base + '/palette-dna/map.html', { waitUntil: 'networkidle' });
  await p.selectOption('#pal', 'tailwind4');
  await p.waitForTimeout(2500);
  const box = await p.locator('#plot').boundingBox();
  await p.screenshot({ path: path.join(here, 'surface-tailwind4.png'), clip: box });
  for (const [name, out] of [['ramp', 'og-palette-dna-ramp.png'], ['map', 'og-palette-dna-map.png']]) {
    const q = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
    await q.goto(`${base}/reviews/color-tools/social/${name}.html`, { waitUntil: 'networkidle' });
    if (name === 'ramp') await q.waitForFunction(() => document.body.dataset.ready === '1');
    await q.waitForTimeout(500);
    await q.screenshot({ path: path.join(root, out) });
  }
  await b.close();
})();
