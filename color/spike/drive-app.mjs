import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1340, height: 980 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('file://' + process.cwd() + '/out/app/index.html');
await p.waitForTimeout(900);
console.log('status:', (await p.textContent('#status'))?.replace(/\s+/g,' ').trim());
console.log('repro :', (await p.textContent('#repro'))?.trim());
const frame = p.frames().find(f => f !== p.mainFrame());
console.log('iframe rendered h1:', frame ? await frame.textContent('h1').catch(()=>'(none)') : '(no iframe)');
// change a control
await p.selectOption('#controls select >> nth=0', 'radix-light');
await p.waitForTimeout(700);
console.log('after switching reference:', (await p.textContent('#status'))?.replace(/\s+/g,' ').trim());
await p.screenshot({ path: 'out/app-explore.png', fullPage: false });
// fuzz tab
await p.click('nav a[href="#fuzz"]');
await p.waitForTimeout(200);
await p.fill('#fuzz-controls input[type=number] >> nth=0', '120');
await p.click('#fuzz-controls button');
await p.waitForFunction(() => document.querySelector('#fuzz-out .summary'), null, { timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(400);
console.log('fuzz  :', (await p.textContent('#fuzz-out .summary'))?.replace(/\s+/g,' ').trim() ?? '(none)');
await p.screenshot({ path: 'out/app-fuzz.png', fullPage: false });
if (errs.length) console.log('\nPAGE ERRORS:\n  ' + errs.slice(0,6).join('\n  '));
else console.log('\nno page errors');
await b.close();
