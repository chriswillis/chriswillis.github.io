import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1340, height: 1000 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + process.cwd() + '/out/app/index.html');
await p.waitForTimeout(800);
console.log('off   :', (await p.textContent('#status'))?.replace(/\s+/g,' ').trim());

const boxes = await p.$$('#controls input[type=checkbox]');
await boxes[1].check();                       // derive semantics
await p.waitForTimeout(1400);
console.log('on    :', (await p.textContent('#status'))?.replace(/\s+/g,' ').trim());
console.log('repro :', (await p.textContent('#repro'))?.trim());
const frame = p.frames().find(f => f !== p.mainFrame());
const fams = frame ? await frame.evaluate(() => [...document.querySelectorAll('*')].map(e=>e.textContent).join(' ')) : '';
for (const n of ['danger','warning','success','info']) console.log(`  ${n} in audit page:`, fams.includes(n));
await p.screenshot({ path: 'out/app-semantics.png', fullPage: false });

// a brand hue that collides with danger
await p.fill('#controls input[type=text]', 'oklch(0.55 0.18 30)');
await p.waitForTimeout(1600);
console.log('brand 30°:', (await p.textContent('#status'))?.replace(/\s+/g,' ').trim());
console.log('warns    :', (await p.textContent('#warns'))?.replace(/\s+/g,' ').trim().slice(0, 260));
await p.screenshot({ path: 'out/app-semantics-collide.png', fullPage: false });
console.log(errs.length ? '\nPAGE ERRORS:\n  ' + errs.slice(0,6).join('\n  ') : '\nno page errors');
await b.close();
