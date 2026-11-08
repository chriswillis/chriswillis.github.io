// Run against a local repository server: node tests/palette-builder-browser.cjs http://127.0.0.1:8765
const { chromium } = require('../color/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
 const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
 try {
  const context = await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
  const page = await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.argv[2]||'http://127.0.0.1:8765')+'/palette-dna/ramp.html');
  await page.waitForFunction(()=>!!window.__paletteUI);
  assert.equal(await page.locator('.column-select[aria-pressed=true]').count(),1);
  const select=page.locator('.column-select').nth(1);await select.focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('.column-select[aria-pressed=true]').count(),2);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'select');
  await page.keyboard.press('Space');assert.equal(await page.locator('.column-select[aria-pressed=true]').count(),1);
  await page.getByRole('button',{name:'Suggest companion colors',exact:true}).click();
  assert.equal(await page.locator('.proposal').count(),3);
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Accept',exact:true}).first().click();
  assert.equal(await page.locator('.column-select[aria-pressed=true]').count(),4);
  await page.locator('#edit-name').fill('Accent');await page.locator('#edit-name').press('Tab');
  await page.locator('#edit-hue').fill('18');await page.locator('#edit-hue').dispatchEvent('change');
  const accepted=await page.evaluate(()=>JSON.stringify(window.__paletteUI.selected().slice(1)));
  await page.locator('#c1').fill('#0066AA');await page.locator('#c1').press('Enter');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__paletteUI.selected().slice(1))),accepted);
  const exported=await page.locator('#code').textContent();
  await page.locator('#preview-vision').selectOption('deuteranopia');await page.locator('#preview-bg').selectOption('dark');
  assert.equal(await page.locator('#code').textContent(),exported);
  await page.getByRole('button',{name:'Copy',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),exported);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();const download=await downloadEvent;
  assert.match(download.suggestedFilename(),/-palette.css$/);assert.equal(await fs.readFile(await download.path(),'utf8'),exported);
  await page.reload();await page.waitForFunction(()=>!!window.__paletteUI);assert.equal(await page.evaluate(()=>JSON.stringify(window.__paletteUI.selected().slice(1))),accepted);
  await page.locator('#builder-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/palette-builder-desktop.png',fullPage:false});await page.locator('.builder-workspace').screenshot({path:'/tmp/palette-builder-workspace.png'});
  await page.locator('#c1').fill('invalid');assert.equal(await page.locator('#download').isDisabled(),true);await page.locator('#c1').fill('#0066AA');await page.locator('#c1').press('Enter');
  for(const width of [320,390,760,1280]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#builder-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/palette-builder-mobile.png'});
  assert.deepEqual(errors,[]);console.log('Browser checks passed: keyboard selection, suggestions, edit preservation, copy/download equality, simulation isolation, reload, invalid input, and 320/390/760/1280px layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
