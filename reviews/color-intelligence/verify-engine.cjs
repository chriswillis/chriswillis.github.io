// Run from repository root: node reviews/color-intelligence/verify-engine.cjs
// Executes the HTML's pure Engine/Importer scripts, not a browser simulation.
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('color-intelligence.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const context = vm.createContext({});
for (const name of ['Engine', 'Importer']) {
  const script = scripts.find(s => s.includes(`var ${name} = (function`));
  if (!script) throw new Error(`Missing ${name}`);
  vm.runInContext(script, context);
}
const {Engine, Importer} = context;
const result = {parser: {}};
for (const input of ['rgb()', 'rgb(1 2)', 'oklch(60% nope 20)', '#1234567']) {
  try { const lab = Engine.parse(input); result.parser[input] = {accepted:true, finite:lab.every(Number.isFinite), lab}; }
  catch(e) { result.parser[input] = {accepted:false, error:e.message}; }
}
const fixture = {red:['#fee','#f88','#800'], green:['#efe','#8f8','#080'], blue:['#eef','#88f','#008'], yellow:['#ffe','#ff8','#880']};
result.validImport = Importer.analyse(JSON.stringify(fixture), {}).ok;
fixture.red[1] = 'rgb()';
result.invalidImportAccepted = Importer.analyse(JSON.stringify(fixture), {}).ok;
fixture.red[1] = '#f88';
fixture.constructor = fixture.red; delete fixture.red;
try { result.constructorImport = Importer.analyse(JSON.stringify(fixture), {}).ok; }
catch(e) { result.constructorError = e.message; }
result.alphaDiscarded = Engine.dE(Engine.parse('rgba(255,0,0,0.2)'), Engine.parse('#ff0000')) === 0;
console.log(JSON.stringify(result, null, 2));
