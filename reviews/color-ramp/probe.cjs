const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('color-ramp.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const pals=JSON.parse(scripts.find(x=>x[1].includes('id="pals"'))[2]);
const els={}; const context={console,location:{hash:''},history:{replaceState(){}},localStorage:{getItem(){return null},setItem(){}},document:{documentElement:{},getElementById(id){return els[id]||=(id==='pals'?{textContent:JSON.stringify(pals)}:{textContent:'',innerHTML:''})}},window:{}};
vm.createContext(context);
for(const name of ['Engine','Importer']) vm.runInContext(scripts.find(x=>x[2].includes('var '+name+' = (function'))[2],context);
let ctl=scripts.find(x=>x[2].includes('var EXAMPLE ='))[2];
ctl=ctl.slice(0,ctl.indexOf('  // ---------- controls ----------'))+'\nwindow.api={st,parse,generate,exportText,hashOf,load,renderVerdict};\n})();';
vm.runInContext(ctl,context);
const {Engine,Importer}=context,{api}=context.window;
let out={parse:[],generation:[],imports:[],roundtrip:{}};
for(const input of ['oklch(60% nope 30)','oklab(0.6 nope 0)','rgb(1 2 3)junk','#1234567','rgba(255,0,0,0.2)']) {
 try{const p=api.parse(input);out.parse.push({input,accepted:!!p,finite:p&&p.every(Number.isFinite),lab:p});}catch(e){out.parse.push({input,error:e.message})}
}
for(const input of ['#D14D42','#808080','color(display-p3 1 0 0)','oklch(0.65 0.4 30)']){
 api.st.c1=input;api.st.c2=null;api.st.pal='flexoki';api.st.mode='through';
 try{const o=api.generate();api.renderVerdict(o);const lab=Engine.parse(input);out.generation.push({input,kind:o.kind,minError:Math.min(...o.cells.map(c=>Engine.dE(lab,c.lab))),anchors:o.cells.filter(c=>c.anchor).map(c=>({step:c.step,lab:c.lab,clipped:c.clipped})),verdict:els.verdict.innerHTML});}catch(e){out.generation.push({input,error:e.message})}
}
const f={red:['#fee','#f88','#800'],green:['#efe','#8f8','#080'],blue:['#eef','#88f','#008'],yellow:['#ffe','#ff8','#880']};
for(const name of ['red','constructor','__proto__']){let data=Object.assign({},f);if(name!=='red'){Object.defineProperty(data,name,{value:data.red,enumerable:true});delete data.red;} else data.red[1]='#f88 junk';try{const r=Importer.analyse(JSON.stringify(data));out.imports.push({name,ok:r.ok,error:r.error})}catch(e){out.imports.push({name,error:e.message})}}
api.st.c1='color(display-p3 1 0 0)';api.st.pal='tailwind4';let original=api.generate();out.roundtrip.before=api.st.c1;context.location.hash=api.hashOf();out.roundtrip.hash=context.location.hash;api.load();out.roundtrip.after=api.st.c1;out.roundtrip.inputDelta=Engine.dE(Engine.parse(out.roundtrip.before),Engine.parse(out.roundtrip.after));
api.st.pal='flexoki';api.st.mode='through';api.st.c1='oklch(60% 0.1 30)';api.st.c2='oklch(60.5% 0.1 40)';let pair=api.generate();out.nearLightness={inputs:[api.st.c1,api.st.c2],retainedIndices:pair.cells.filter(c=>c.anchor).map(c=>c.seedIndex),notes:pair.notes};
fs.writeFileSync('reviews/color-ramp/probe-results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
