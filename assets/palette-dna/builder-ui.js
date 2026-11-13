// Browser-only working palette; deliberately separate from shared pt.user reference imports.
var PaletteBuilderUI = (function () {
  'use strict';
  function mount(api) {
    var B=PaletteBuilder, $=function(id){return document.getElementById(id);}, KEY='pd.builder.v1';
    var state={version:1,selected:['brand'],active:'brand',records:[],edits:{},chartSteps:{},background:'light',vision:'normal',scope:'selected',next:1};
    var refs=[], brand=null, proposals=[], undo=null, generation='', invalid=false, saveError='', ready=true;
    function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function signature(){return JSON.stringify([api.st.c1,api.st.c2,api.st.s1,api.st.pal,api.st.mode]);}
    function announce(s){$('builder-status').textContent=s;}
    function checkpoint(){undo=B.clone(state);}
    function sourceColumns(){
      var cols=[brand].concat(refs.map(function(c){return state.records.find(function(r){return r.id===c.id;})||c;})), ids=new Set(cols.map(function(c){return c.id;}));
      state.records.forEach(function(c){if(!ids.has(c.id)){cols.push(c);ids.add(c.id);}});
      return cols;
    }
    function base(id){return sourceColumns().find(function(c){return c.id===id;});}
    // The ramp shape applies to every column; the brand column arrives already shaped.
    var shapeSig='', shapeMemo=new WeakMap();
    function shaped(c){
      var sh=api.st.shape;if(!sh||c.id==='brand'||typeof RampLayout==='undefined')return c;
      var sig=JSON.stringify(sh);if(sig!==shapeSig){shapeSig=sig;shapeMemo=new WeakMap();}
      var x=shapeMemo.get(c);if(!x){var r=RampLayout.apply(c,sh);x=Object.assign({},c,{steps:r.steps,labs:r.labs,shapeNotes:r.notes});shapeMemo.set(c,x);}
      return x;
    }
    function resolved(id){var c=base(id);if(!c)return null;c=shaped(c);var e=state.edits[id];return e?Object.assign(B.transform(c,e.hue,e.scale),{name:e.name||c.name,modified:true}):c;}
    function columns(){return sourceColumns().map(function(c){return resolved(c.id);});}
    function selected(){return state.selected.map(resolved).filter(Boolean);}
    function remember(id){var c=base(id);if(c&&id!=='brand'&&!state.records.some(function(x){return x.id===id;}))state.records.push(B.clone(c));}
    function scopeColumns(){var all=B.named(columns()), byId=new Map(all.map(function(c){return [c.id,c];}));return state.scope==='active'?[byId.get(state.active)].filter(Boolean):state.scope==='all'?all:state.selected.map(function(id){return byId.get(id);}).filter(Boolean);}
    function persist(){
      try{localStorage.setItem(KEY,JSON.stringify({version:1,generation:generation,state:state}));saveError='';}
      catch(e){saveError='Changes are not saved: browser storage is unavailable or full. Export your colors before leaving.';}
      $('builder-save').textContent=saveError||'Saved in this browser. Page links contain brand settings only; they do not include your custom palette.';
    }
    function restore(){
      try{
        var raw=localStorage.getItem(KEY);if(!raw)return;
        if(raw.length>1500000)throw Error('Too large');
        var saved=JSON.parse(raw), s=saved.state;
        if(saved.version!==1||!s||s.version!==1||!Array.isArray(s.records)||s.records.length>B.LIMIT||!s.records.every(B.validColumn)||
          !Array.isArray(s.selected)||s.selected.length>B.LIMIT*2||!s.selected.every(function(x){return typeof x==='string';})||
          typeof s.active!=='string'||!s.edits||typeof s.edits!=='object'||Array.isArray(s.edits)||!s.chartSteps||typeof s.chartSteps!=='object'||Array.isArray(s.chartSteps)||
          !Number.isSafeInteger(s.next)||s.next<1||s.next>1000000)throw Error('Invalid saved palette');
        if(saved.generation!==generation){announce('This link uses different brand settings. Starting with the brand only; your previous working palette remains saved until you make a change.');return false;}
        Object.keys(s.edits).forEach(function(id){var e=s.edits[id];if(!e||!Number.isFinite(e.hue)||Math.abs(e.hue)>180||!Number.isFinite(e.scale)||e.scale<0||e.scale>1.5||typeof e.name!=='string'||e.name.length>80)throw Error('Invalid edit');});
        if(Object.keys(s.edits).length>B.LIMIT||Object.keys(s.chartSteps).length>B.LIMIT*2)throw Error('Too many edits');
        s.records=s.records.filter(function(c){return c.id!=='brand'&&c.kind!=='brand';});
        state=s;state.background=s.background==='dark'?'dark':'light';state.vision=['normal','protanopia','deuteranopia','tritanopia'].indexOf(s.vision)>=0?s.vision:'normal';state.scope=['selected','active','all'].indexOf(s.scope)>=0?s.scope:'selected';
        state.selected=Array.from(new Set(s.selected)).filter(function(id){return !!base(id);});
        if(!base(state.active))state.active='brand';
        announce('Restored your working palette.');
      }catch(e){announce('The saved working palette could not be read. Showing the brand ramp; reference palettes are unchanged.');}
    }
    function refresh(o){
      var next=signature(), changed=generation&&next!==generation;
      generation=next;
      brand={id:'brand',name:api.st.name||'brand',source:o.pal.name+' · your brand',kind:'brand',gamut:o.pal.gamut,steps:o.cells.map(function(c){return String(c.step);}),labs:o.cells.map(function(c){return c.lab.slice();})};
      try{refs=B.inventory(o.pal);ready=true;}catch(e){refs=[];ready=false;announce(e.message+' Brand export is still available.');}
      // A record is a snapshot of selected/edited work, including when the reference later changes.
      refs=refs.map(function(c){return state.records.find(function(r){return r.id===c.id;})||c;});
      if(changed){proposals=[];undo=null;announce('Brand ramp updated. Accepted companions and edits were kept. Review their fit or suggest a fresh set.');}
      if(!base(state.active))state.active='brand';
      render();persist();
    }
    function renderColumns(){
      var all=columns(), cols=state.selected.map(function(id){return all.find(function(c){return c.id===id;});}).filter(Boolean).concat(all.filter(function(c){return state.selected.indexOf(c.id)<0;}));
      $('family').innerHTML='<div class="palette-columns">'+cols.map(function(c,i){
        var included=state.selected.indexOf(c.id)>=0, active=state.active===c.id;
        var kind=c.modified?'Modified':c.kind==='brand'?'Brand':c.kind==='companion'?'Added':c.neutral?'Neutral':'Reference';
        return '<article class="palette-column'+(included?' included':'')+(active?' active':'')+'">'+
          '<button type="button" class="column-open" data-action="open" data-id="'+esc(c.id)+'" aria-label="Edit '+esc(c.name)+'" aria-pressed="'+active+'" title="Open '+esc(c.name)+' to see its colors and edit it"><span class="column-colors" aria-hidden="true">'+c.labs.map(function(p){return '<span style="background:'+esc(Engine.cssColor(p[0],p[1],p[2],c.gamut||'srgb'))+'"></span>';}).join('')+'</span></button>'+
          '<div class="column-foot"><span class="column-meta"><span class="column-name">'+esc(c.name)+'</span><span class="column-kind">'+c.steps.length+' stops · '+kind+'</span></span>'+
          '<button type="button" class="column-select" data-action="select" data-id="'+esc(c.id)+'" aria-pressed="'+included+'" aria-label="'+(included?'Deselect ':'Select ')+esc(c.name)+'" title="'+(included?'Remove '+esc(c.name)+' from your palette':'Add '+esc(c.name)+' to your palette')+'"><span aria-hidden="true">'+(included?'✓':'+')+'</span></button></div></article>';
      }).join('')+'</div>';
      $('famnote').textContent=state.selected.length+' selected · '+cols.length+' available. Selected ramps appear first. Use + to include a ramp; select its colors to edit it.';
      $('builder-count').textContent=state.selected.length+' selected';
      $('builder-undo').disabled=!undo;
      $('suggest').disabled=invalid||!ready||state.records.length>=B.LIMIT;
    }
    function renderProposals(){
      $('proposals').hidden=!proposals.length;
      $('proposal-list').innerHTML=proposals.map(function(c,i){return '<article class="proposal"><div class="proposal-strip" aria-hidden="true">'+shaped(c).labs.map(function(p){return '<span style="background:'+esc(B.hex(p))+'"></span>';}).join('')+'</div><div><strong>'+esc(c.name)+'</strong><span class="note">From '+esc(c.source)+(c.clipped?' · '+c.clipped+' gamut-limited steps':'')+'</span></div><button type="button" data-accept="'+i+'" title="Add this ramp to your palette. Your existing colors stay unchanged.">Accept</button>'+(base(state.active).kind==='companion'?'<button type="button" data-replace="'+i+'" title="Swap the open companion for this suggestion.">Replace '+esc(base(state.active).name)+'</button>':'')+'</article>';}).join('');
    }
    function renderEditor(){
      var c=resolved(state.active), e=state.edits[c.id]||{hue:0,scale:1,name:c.name};
      $('edit-title').textContent=c.name;
      $('edit-source').textContent=c.source+' · '+(c.kind==='brand'?'Adjust the brand using the color controls above.':'Lightness steps stay fixed; hue and colorfulness apply to the whole ramp.')+(c.clipped?' '+c.clipped+' steps limited to the source gamut.':'')+(c.shapeNotes&&c.shapeNotes.length?' '+c.shapeNotes.join(' '):'');
      $('edit-name').value=e.name;$('edit-hue').value=e.hue;$('edit-chroma').value=Math.round(e.scale*100);
      $('edit-hue-value').textContent=e.hue+'°';$('edit-chroma-value').textContent=Math.round(e.scale*100)+'%';
      ['edit-name','edit-hue','edit-chroma'].forEach(function(id){$(id).disabled=c.kind==='brand';});
      $('edit-reset').disabled=!state.edits[c.id];$('edit-remove').disabled=c.kind==='brand';
      $('edit-remove').textContent=c.kind==='companion'?'Remove companion':'Deselect & reset';
      var ix=B.chartIndex(c,state.background,state.chartSteps[c.id]);
      $('edit-step').innerHTML='<option value="">Automatic</option>'+c.steps.map(function(s){return '<option value="'+esc(s)+'">'+esc(s)+'</option>';}).join('');
      $('edit-step').value=state.chartSteps[c.id]||'';
      $('edit-swatches').innerHTML=c.labs.map(function(p,i){var hx=B.hex(p),text=B.contrast(hx,'#FFFFFF')>B.contrast(hx,'#000000')?'#FFFFFF':'#000000';return '<button type="button" class="edit-swatch'+(i===ix?' chart-step':'')+'" data-copy-color="'+hx+'" style="background:'+hx+';color:'+text+'" aria-label="Copy '+esc(c.name)+' '+esc(c.steps[i])+' '+hx+'" title="Copy '+hx+' · '+esc(B.ok(p))+'"><span>'+esc(c.steps[i])+'</span><span>'+hx+'</span></button>';}).join('');
      $('edit-note').textContent='Click a swatch to copy its sRGB hex. Chart uses step '+c.steps[ix]+'.'+(c.labs.some(function(p){return !Engine.inG.apply(null,p.concat(['srgb']));})?' Some values are sRGB fallbacks; OKLCH export retains wide-gamut colors.':'');
    }
    function renderChart(){
      var rows=B.chartRows(selected(),state.background,state.vision,state.chartSteps), dark=state.background==='dark', bg=dark?'#181818':'#FFFFFF';
      $('preview-bg').value=state.background;$('preview-vision').value=state.vision;
      $('chart').style.backgroundColor=bg;$('chart').style.color=dark?'#F5F5F5':'#181818';
      $('chart').innerHTML='<div class="chart-caption">Illustrative series · '+(dark?'dark':'light')+' background · '+esc(state.vision==='normal'?'normal color vision':state.vision+' simulation')+'</div>'+(rows.length?rows.map(function(r,i){var v=[78,61,89,46,68,54][i%6];return '<div class="chart-row"><div class="chart-label">'+esc(r.name)+' <small>'+esc(r.step)+'</small></div><div class="chart-track"><div class="chart-bar" style="width:'+v+'%;background:'+r.shown+'"></div></div><span class="num">'+v+'</span></div>';}).join(''):'<p>Select a ramp to preview your palette.</p>');
      var pair=B.weakest(rows);
      $('pair-metric').textContent=pair?'Closest pair: '+pair.a+' / '+pair.b+' · ΔE OK ×100 '+pair.distance.toFixed(1)+' ('+(state.vision==='normal'?'normal vision':state.vision+' simulation')+'). Smaller means more similar; this is not an accessibility pass/fail score.':'Select at least two ramps to compare chart colors.';
      if(pair&&sets.length){var bench=B.setBenchmark(sets[0],state.vision);if(bench)$('pair-metric').textContent+=' For comparison, the closest pair among '+sets[0].name+'’s ten main colors is '+bench.a+' / '+bench.b+' at '+bench.distance.toFixed(1)+' in the same view.';}
      $('chart-metrics').innerHTML=rows.map(function(r){return '<tr><th scope="row">'+esc(r.name)+' · '+esc(r.step)+'</th><td class="mono">'+r.hex+(r.wide?' *':'')+'</td><td class="num">'+r.ratio.toFixed(2)+':1</td><td>'+ (r.ratio>=4.5?'Meets 4.5:1 text reference':r.ratio>=3?'Below 4.5:1; meets 3:1':'Below 3:1')+'</td></tr>';}).join('');
    }
    function renderExport(){
      var cols=scopeColumns();$('export-scope').value=state.scope;
      $('code').textContent=cols.length?B.serialize(cols,api.st.fmt):'Select at least one ramp to export.';
      $('export-summary').textContent=cols.length+' ramp'+(cols.length===1?'':'s')+' · '+(state.scope==='all'?'Includes unused references and accepted companions. Proposals are excluded.':state.scope==='active'?'Exports the open ramp, even if it is not selected.':'Only selected ramps, with your edits.')+' Names are normalized for export; duplicates receive a numeric suffix.';
      $('copy').disabled=invalid||!cols.length;$('download').disabled=$('copy').disabled;
    }
    function render(){var focused=document.activeElement, action=focused&&focused.dataset&&focused.dataset.action, id=focused&&focused.dataset&&focused.dataset.id;renderColumns();renderProposals();renderEditor();renderChart();renderExport();if(action&&id){Array.prototype.forEach.call($('family').querySelectorAll('[data-action]'),function(b){if(b.dataset.action===action&&b.dataset.id===id)b.focus();});}}
    function commit(message, focusId){render();persist();if(message)announce(message);if(focusId)$(focusId).focus();}
    function setInvalid(value){invalid=value;renderExport();$('suggest').disabled=value||!ready||state.records.length>=B.LIMIT;}
    function select(id){if(!base(id))return;checkpoint();var k=state.selected.indexOf(id);if(k<0){if(state.records.length>=B.LIMIT&&id!=='brand'&&!state.records.some(function(c){return c.id===id;})){announce('Working palette limit reached. Remove companions or reset unused edits first.');return;}remember(id);state.selected.push(id);}else state.selected.splice(k,1);commit();}
    function open(id){if(!base(id))return;state.active=id;commit('', 'edit-heading');}
    function accept(index){var p=proposals[index];if(!p)return;if(state.records.length>=B.LIMIT){announce('Working palette limit reached. Remove a companion first.');return;}checkpoint();var c=B.clone(p);c.id='companion:'+state.next++;state.records.push(c);state.selected.push(c.id);state.active=c.id;proposals.splice(index,1);commit('Added '+c.name+'. Existing colors were kept.','edit-heading');}
    function replace(index){var p=proposals[index], old=base(state.active);if(!p||!old||old.kind!=='companion')return;checkpoint();var c=B.clone(p);c.id=old.id;state.records=state.records.map(function(r){return r.id===old.id?c:r;});delete state.edits[c.id];delete state.chartSteps[c.id];proposals.splice(index,1);commit('Replaced '+old.name+'. Undo is available.','edit-heading');}
    function suggest(){if(invalid||!ready)return;var o=api.last(), map=o.seeds[0].map;proposals=B.suggest(refs,brand,selected(),map.neutral?null:map.sRaw);renderProposals();announce(proposals.length?'Review '+proposals.length+' suggestions below. They are not selected or exported until accepted.':'No distinct unused companions found. Select a reference hue or adjust your palette.');$('proposal-heading').focus();}
    var sets=typeof COLOR_SETS==='undefined'?[]:COLOR_SETS;
    function addSet(id){
      var set=sets.filter(function(x){return x.id===id;})[0];if(!set||invalid||!ready)return;
      var o=api.last(), made=B.fromSet(set,o.pal,o.M,api.st.mode==='fit').filter(function(c){return !state.records.some(function(r){return r.origin===c.origin;});});
      if(!made.length){announce(set.name+' is already in your palette. Remove its ramps to add them again.');return;}
      if(state.records.length+made.length>B.LIMIT){announce('Working palette limit reached. Remove companions first.');return;}
      checkpoint();
      made.forEach(function(c){var step=c.chartStep;delete c.chartStep;delete c.kept;c.id='companion:'+state.next++;state.records.push(c);state.selected.push(c.id);if(step)state.chartSteps[c.id]=step;});
      commit('Added '+made.length+' ramps from '+set.name+', each shaped like '+o.pal.name+' and kept through its '+set.name+' color. Undo is available.');
    }
    function edit(){
      var id=state.active,c=base(id);if(id==='brand'||!c)return;
      var hue=Number($('edit-hue').value), scale=Number($('edit-chroma').value)/100;
      if(!Number.isFinite(hue)||hue < -180||hue > 180||!Number.isFinite(scale)||scale<0||scale>1.5)return;
      if(state.records.length>=B.LIMIT&&!state.records.some(function(x){return x.id===id;})){announce('Working palette limit reached.');return;}
      checkpoint();remember(id);state.edits[id]={hue:hue,scale:scale,name:$('edit-name').value.trim().slice(0,80)||c.name};commit();
    }
    function reset(){if(!state.edits[state.active])return;checkpoint();delete state.edits[state.active];commit('Restored the column’s original or accepted colors.');}
    function remove(){var c=base(state.active);if(!c||c.id==='brand')return;checkpoint();state.selected=state.selected.filter(function(id){return id!==c.id;});state.records=state.records.filter(function(x){return x.id!==c.id;});delete state.edits[c.id];delete state.chartSteps[c.id];state.active='brand';commit(c.kind==='companion'?'Companion removed. Undo is available.':'Reference deselected and edits reset. Undo is available.','edit-heading');}
    function undoLast(){if(!undo)return;state=undo;undo=null;commit('Restored the previous working palette.','edit-heading');}
    $('family').addEventListener('click',function(e){var b=e.target.closest('[data-action]');if(!b)return;var id=b.dataset.id;if(b.dataset.action==='select')select(id);else open(id);});
    $('suggest').addEventListener('click',suggest);
    $('proposal-list').addEventListener('click',function(e){var b=e.target.closest('[data-accept]');if(b)accept(Number(b.dataset.accept));else {var r=e.target.closest('[data-replace]');if(r)replace(Number(r.dataset.replace));}});
    $('dismiss-proposals').addEventListener('click',function(){proposals=[];renderProposals();announce('Suggestions dismissed.');$('suggest').focus();});
    $('builder-undo').addEventListener('click',undoLast);
    $('colorset').innerHTML='<option value="">Add a color set…</option>'+sets.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+x.pairs.length+' colors</option>';}).join('');
    $('colorset').addEventListener('change',function(){var id=$('colorset').value;$('colorset').value='';if(id)addSet(id);});
    ['edit-name','edit-hue','edit-chroma'].forEach(function(id){$(id).addEventListener('change',edit);});
    ['edit-hue','edit-chroma'].forEach(function(id){$(id).addEventListener('input',function(){$(id+'-value').textContent=$(id).value+(id==='edit-hue'?'°':'%');});});
    $('edit-reset').addEventListener('click',reset);$('edit-remove').addEventListener('click',remove);
    $('edit-step').addEventListener('change',function(){state.chartSteps[state.active]=$('edit-step').value;commit();});
    $('edit-swatches').addEventListener('click',function(e){var b=e.target.closest('[data-copy-color]');if(!b)return;var color=b.dataset.copyColor;try{navigator.clipboard.writeText(color).then(function(){announce('Copied '+color+'.');},function(){announce('Copy this color: '+color);});}catch(err){announce('Copy this color: '+color);}});
    $('preview-bg').addEventListener('change',function(){state.background=$('preview-bg').value==='dark'?'dark':'light';commit();});
    $('preview-vision').addEventListener('change',function(){state.vision=$('preview-vision').value;commit();});
    $('export-scope').addEventListener('change',function(){state.scope=$('export-scope').value;renderExport();persist();});
    $('download').addEventListener('click',function(){if($('download').disabled)return;var format=api.st.fmt, ext=format==='json'?'json':format==='tw3'?'js':'css', type=format==='json'?'application/json':format==='tw3'?'text/javascript':'text/css';var url=URL.createObjectURL(new Blob([$('code').textContent],{type:type+';charset=utf-8'}));var a=document.createElement('a');a.href=url;a.download=B.slug(api.st.name)+'-palette.'+ext;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);$('status').textContent='Downloaded '+scopeColumns().length+' ramps.';});
    // Initialize without persisting before attempting restoration.
    var o=api.last();generation=signature();brand={id:'brand',name:api.st.name||'brand',source:o.pal.name+' · your brand',kind:'brand',gamut:o.pal.gamut,steps:o.cells.map(function(c){return String(c.step);}),labs:o.cells.map(function(c){return c.lab.slice();})};
    try{refs=B.inventory(o.pal);}catch(e){ready=false;announce(e.message);}
    var restored=restore();render();if(restored!==false)persist();else $('builder-save').textContent='Previous custom palette retained in browser storage until you make a change. Links contain brand settings only.';
    return {refresh:refresh,renderExport:renderExport,setInvalid:setInvalid,state:function(){return B.clone(state);},columns:columns,selected:selected,select:select,open:open,suggest:suggest,accept:accept,addSet:addSet,replace:replace,edit:edit,reset:reset,remove:remove,undo:undoLast,proposals:function(){return B.clone(proposals);}};
  }
  return {mount:mount};
})();
