// Run: node --test tests/color-intelligence.test.cjs
// Exercise shipped inline code, not a second implementation of its algorithms.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../color-intelligence.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const source = name => scripts.find(m => m[2].includes(`var ${name} = (function`))[2];
const palettes = JSON.parse(scripts.find(m => m[1].includes('id="palettes"'))[2]);
function harness() {
  const c = vm.createContext({});
  vm.runInContext(source('Engine'), c); vm.runInContext(source('Importer'), c);
  return c;
}
function fn(name) {
  const m = html.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}', 'm'));
  assert.ok(m, `Function ${name} exists`); return m[0];
}
const fixture = () => ({red:['#fee','#f88','#800'],green:['#efe','#8f8','#080'],blue:['#eef','#88f','#008'],yellow:['#ffe','#ff8','#880']});
test('all executable inline scripts compile', () => {
  for (const [,attrs,body] of scripts) if (!attrs.includes('application/json') && body.trim()) new vm.Script(body);
});
test('strict syntax, finite coordinates, supported valid forms, and built-ins', () => {
  const {Engine} = harness();
  for (const value of ['rgb()', 'rgb(1 2)', 'rgb(1foo 2 3)', 'rgb(1 2 3)junk', '#1234567', '#12345', 'oklch(60% nope 20)', 'rgb(1 2 3 / nope)', 'rgb(1 2 3 / 2)', 'color(display-p3 1 0)', 'rgb(1e999 0 0)']) assert.throws(() => Engine.parse(value), value);
  for (const value of ['#abc','#abcd','#abcdef','#abcdef80','rgb(255, 0, 0)','rgba(255,0,0,0.5)','rgb(100% 0% 0% / 50%)','hsl(0.5turn 50% 50%)','oklch(60% 0.1 30)','oklch(50% 0 none)','oklab(50% 0.1 0.2)','color(display-p3 1 0 0)']) assert.ok(Engine.parse(value).every(Number.isFinite), value);
  for (const pal of palettes) for (const ramp of Object.values(pal.ramps).concat(Object.values(pal.neutrals))) for (const value of ramp) assert.ok(Engine.parse(value).every(Number.isFinite));
});
test('imports validate entire values and allow inherited-looking names safely', () => {
  const {Importer} = harness();
  assert.equal(Importer.analyse(JSON.stringify(fixture())).ok,true);
  for (const invalid of ['rgb()', '#1234567', '#f88 junk', '#f88/*junk*/', 'nonsense']) {
    const f=fixture(); f.red[1]=invalid;
    assert.equal(Importer.analyse(JSON.stringify(f)).ok,false,invalid);
  }
  for (const name of ['constructor','__proto__','toString']) {
    const f=fixture(); Object.defineProperty(f,name,{value:f.red,enumerable:true}); delete f.red;
    assert.equal(Importer.analyse(JSON.stringify(f)).ok,true,name);
  }
  const vars = Object.entries(fixture()).flatMap(([n,cs])=>cs.map((v,i)=>`--${n}-${i}: ${v};`)).join('\n');
  assert.equal(Importer.analyse(':root {\n'+vars+'\n}').ok,true);
  assert.equal(Importer.analyse(vars.replace('#f88','#f88 junk')).ok,false);
  const lines = Object.entries(fixture()).map(([n,cs])=>`${n}: ${cs.join(' ')}`).join('\n');
  assert.equal(Importer.analyse(lines).ok,true);
  assert.equal(Importer.analyse(lines+' junk').ok,false);
  const maps=Object.entries(fixture()).map(([n,cs])=>`$${n}: (${cs.map((v,i)=>`"${i}": ${v}`).join(', ')});`).join('\n');
  assert.equal(Importer.analyse(maps).ok,true);
  assert.equal(Importer.analyse(maps.replace('#f88','#f88 junk')).ok,false);
});
function uiHarness() {
  const c=harness(), elements={};
  c.$=id=>elements[id] ||= {value:'',innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}},querySelector(){return {focus(){}};}};
  c.P={seeds:[],pi:0,seedLocked:false,u:1,L:0.62,s:1,seedMode:'fit'};
  c.esc=String; c.COLOR_TOKEN=/(#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\))/g;
  for(const name of ['prim','seedActive','through','parseSeeds','setSeeds']) vm.runInContext(fn(name),c);
  c.seedsChanged=()=>{};
  return c;
}
test('seed submission is atomic, opaque, and bounded to six', () => {
  const c=uiHarness(); c.setSeeds('#abcdef',false); const previous=c.P.seeds;
  for(const input of ['#f00, rgb()', '#f00 junk', '#f00, rgba(0,0,0,0.2)', 'rgb(255,0,0,0.2)', '#1234567', Array(7).fill('#abc').join(',')]) {
    c.setSeeds(input,false); assert.equal(c.P.seeds,previous,input);
  }
  c.setSeeds('rgb(255, 0, 0), oklch(50% 0 none)',false);
  assert.equal(c.P.seeds.length,2);
});
test('inspect every seeded step without changing the generated ramp; contrast selects a qualifying step', () => {
  for(const mode of ['fit','through']) {
    const c=uiHarness(); c.PM=c.Engine.build(palettes[0],palettes[0].neutral,'srgb'); c.pal=palettes[0];
    c.setSeeds('#FDE68A, #D97706, #78350F',false);
    c.P.seeds.forEach(seed=>seed.map=c.PM.seedMap(seed.lab));
    c.P.seedLocked=true; c.P.seedMode=mode;
    Object.assign(c.P,{u:c.P.seeds[0].map.u,L:c.P.seeds[0].map.L,s:c.P.seeds[0].map.s,target:4.5});
    c.P.gen=c.PM.genAnchors(c.P.seeds,{cap:mode==='fit'});
    const ramp=c.P.gen, values=JSON.stringify(ramp);
    c.Yof=p=>c.Engine.Y(...p); c.band=()=>({p90:5,med:2,f:1}); c.VAL={summary:null};
    c.badge=()=>''; c.renderGen=c.renderPickCompare=c.renderSeed=c.drawOverlay=()=>{};
    c.flash=(btn,msg)=>btn.textContent=msg;
    vm.runInContext(fn('contrastSample'),c); vm.runInContext(fn('resultStatus'),c); vm.runInContext(fn('update'),c); vm.runInContext(fn('fitPick'),c);
    for(let i=0;i<ramp.length;i++) {
      c.update(i);
      assert.equal(c.P.pt,ramp[i]); assert.equal(c.P.hex,ramp[i].hex);
      assert.equal(c.$('voklch').textContent,c.Engine.oklchStr(ramp[i].L,ramp[i].a,ramp[i].b));
      assert.equal(c.P.gen,ramp); assert.equal(JSON.stringify(c.P.gen),values); assert.equal(c.P.seedLocked,true);
    }
    for(const onLight of [true,false]) {
      c.fitPick(onLight); const p=c.P.pt,bg=onLight?c.PM.pl:c.PM.pd;
      assert.ok(c.Engine.cr(c.Engine.Y(p.L,p.a,p.b),c.Yof(bg))>=4.5);
      assert.equal(c.P.gen,ramp); assert.equal(c.P.seedLocked,true);
    }
    c.update(c.P.inspected); assert.equal(c.P.gen,ramp);
    const selected=c.P.pt; c.P.target=100; c.fitPick(true);
    assert.equal(c.P.pt,selected); assert.equal(c.$('fitp').textContent,'No qualifying step');
    c.clampL=L=>Math.min(c.PM.Lp,Math.max(c.PM.Lk,L)); vm.runInContext(fn('unlockSeed'),c); c.unlockSeed();
    assert.equal(c.P.L,c.clampL(selected.L)); assert.equal(c.P.inspected,null); assert.equal(c.P.seedLocked,false);
  }
});
test('import preview invalidates immediately and commit revalidates current input', () => {
  const c=uiHarness(); c.clearTimeout=()=>{}; c.setTimeout=()=>1;
  c.BUILTIN=palettes; c.PALS=[]; c.fillPalSelect=()=>{}; c.loadPalette=id=>c.loaded=id;
  c.saveUser=()=>true;
  const listeners={}; const base=c.$;
  c.$=id=>{const e=base(id);e.addEventListener=(event,handler)=>listeners[id+':'+event]=handler; e.close=()=>{};return e;};
  const start=html.indexOf('  var impLast = null'),end=html.indexOf('  function removeUser',start);
  vm.runInContext(html.slice(start,end),c);
  c.$('impt').value=JSON.stringify(fixture()); c.$('impn').value='A'; c.previewImport();
  assert.equal(c.$('impok').disabled,false);
  c.$('impn').value='B'; c.schedulePreview(); assert.equal(c.impLast,null);assert.equal(c.$('impok').disabled,true);
  listeners['impok:click'](); assert.equal(c.PALS[0].name,'B');
  c.$('impt').value=JSON.stringify(fixture()); c.previewImport();
  c.$('impt').value='invalid'; listeners['impok:click'](); assert.equal(c.PALS.length,1);
  c.$('impt').value=JSON.stringify(fixture());c.previewImport();
  assert.equal(c.impLast.pal.text.light,null);assert.equal(c.impLast.pal.text.dark,null);
  c.saveUser=()=>false; listeners['impok:click']();assert.equal(c.PALS.length,1);assert.match(c.$('impp').textContent,/Could not save/);
});
test('comparison inverse maps known ramp colors and clears absent/neutral comparisons', () => {
  const c=uiHarness(), pal=palettes.find(p=>p.id==='tailwind3');
  assert.ok(pal);
  const model=c.Engine.build(pal,pal.neutral,'srgb');
  c.CMP={M:model,pal}; c.M=model;
  const red=model.loft.findIndex(r=>r.name==='red'); assert.ok(red>=0);
  const generated=model.genSteps.bind(model); let used;
  model.genSteps=(u,s)=>{used={u,s};return generated(u,s);};
  vm.runInContext(fn('renderPickCompare'),c);
  for(const L of [0.4,0.65,0.85]) {
    const point=model.point(model.thetaU[red],L,0.7);
    c.P.s=0.1; // Deliberately unrelated to the picked color.
    c.renderPickCompare(point);
    assert.ok(model.angDist(used.u,model.thetaU[red])<0.001,`red coordinate at ${L}`);
    assert.ok(Math.abs(used.s-0.7)<0.01);
    assert.equal(c.$('gcmpwrap').hidden,false);
  }
  const vivid=c.Engine.parse('oklch(60% 0.4 30)');c.renderPickCompare({L:vivid[0],a:vivid[1],b:vivid[2]});
  assert.equal(used.s,1);assert.match(c.$('pkbwhere').textContent,/capped/);
  const axis=model.axisAt(0.6); c.renderPickCompare({L:0.6,a:axis[0],b:axis[1]});
  assert.equal(c.$('gcmpwrap').hidden,true);assert.equal(c.$('gcmp').innerHTML,'');assert.match(c.$('pkbwhere').textContent,/neutral/);
  c.CMP.M=null;c.renderPickCompare({L:0.6,a:0.1,b:0.1});
  for(const id of ['gcmpwrap','pkcmp'])assert.equal(c.$(id).hidden,true);
  for(const id of ['gcmpname','pkcmpname','pkbwhere'])assert.equal(c.$(id).textContent,'');
});
test('contrast diagnostics remain independent of sample foreground', () => {
  const c=uiHarness(); c.badge=r=>r<3?'fails':'AA';vm.runInContext(fn('contrastSample'),c);
  for(const color of ['#FFFFFF','#000000']) {
    const output=c.contrastSample(color,color,'test background',1);
    assert.match(output,/<span class="preview" style="color:/);
    assert.match(output,/<small>On test background: 1.00:1 · fails<\/small>/);
    assert.doesNotMatch(output,/<small[^>]*style=/);
  }
});

test('error reference eligibility excludes transformed, extrapolated and unsupported results', () => {
  const c=uiHarness();
  c.PM=c.Engine.build(palettes[0],palettes[0].neutral,'srgb');
  c.VAL={summary:{},key:'current'}; c.vkey=()=> 'current';
  c.band=()=>({d:12,gap:60});
  vm.runInContext(fn('resultStatus'),c);
  const u=(c.PM.thetaU[1]+c.PM.thetaU[2])/2, p=c.PM.point(u,0.65,1);
  assert.equal(c.resultStatus(p,u).calibrated,true);
  c.P.s=0.7; assert.match(c.resultStatus(p,u).text,/saturation/); c.P.s=1;
  assert.match(c.resultStatus({...p,clipped:true},u).text,/clipped/);
  assert.match(c.resultStatus({...p,ext:true},u).text,/Extrapolated/);
  c.band=()=>({d:1,gap:60}); assert.equal(c.resultStatus(p,u).calibrated,false);
  c.band=()=>({d:12,gap:140}); assert.equal(c.resultStatus(p,u).calibrated,false);
  c.band=()=>({d:12,gap:60}); c.VAL.key='old'; assert.equal(c.resultStatus(p,u).calibrated,false);
  c.VAL.key='current'; c.P.hold={}; assert.equal(c.resultStatus(p,u).calibrated,false);
  c.P.hold=null; c.P.seedLocked=true; c.P.seeds=[{map:{neutral:false}}]; assert.match(c.resultStatus(p,u).text,/Seed-shaped/);
});
