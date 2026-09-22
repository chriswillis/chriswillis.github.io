import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2 });
await p.goto('file:///home/claude/dna-spike/out/audit/radix-violet.html');
await p.waitForTimeout(400);
await p.screenshot({ path: '/home/claude/dna-spike/out/fig12_audit.png', clip: { x: 0, y: 0, width: 1280, height: 1600 } });
await b.close();
console.log('ok');
