const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const between = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Source section missing: ${start}`);
  return html.slice(a, b);
};
const fn = name => {
  const re = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const start = html.search(re);
  assert.ok(start >= 0, `Function missing: ${name}`);
  const end = html.indexOf('\n}', start);
  return html.slice(start, end + 2);
};
function environment(initial) {
  const nodes = new Map(), storage = new Map(initial == null ? [] : [['huxing-design-v1', initial]]);
  const classList = () => {
    const set = new Set();
    return {add:(...v)=>v.forEach(x=>set.add(x)), remove:(...v)=>v.forEach(x=>set.delete(x)), contains:x=>set.has(x)};
  };
  const node = () => ({innerHTML:'', textContent:'', style:{}, dataset:{}, hidden:false, classList:classList(), setAttribute(){}});
  const context = vm.createContext({
    console:{error(){}}, AbortController, setTimeout:()=>0, clearTimeout(){},
    window:{}, COARSE:false, tr:zh=>zh, nm:x=>x,
    document:{body:node(), querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}},
    localStorage:{getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,v)}
  });
  const run = code => vm.runInContext(code, context);
  run(`const $ = s => document.querySelector(s);`);
  run(between('const WALLS =', 'const PX_MM'));
  run(between('let state = load()', '/* ======================= 几何工具'));
  run(between('const area =', '/* ======================= 颜色'));
  run(between('function hex2rgb(', 'function buildDefs('));
  run(between("const ST = 'stroke=", 'function renderWalls()'));
  run(between('const esc =', 'function renderPanel()'));
  run(fn('overviewPanel') + '\n' + fn('updateHeader'));
  run(`function renderAll(){renderRooms();renderFurn();overviewPanel();updateHeader();renderSaveStatus();}`);
  run(fn('importPlan') + '\nlet importRequest=0;\n' + fn('importFile'));
  run(between("let viewMode = '2d'", "document.querySelectorAll('.menu-pop"));
  run(`function applyView(){} function setTool(t){ui.tool=t;} function toast(msg){$('#toast').textContent=msg;}`);
  return {context, storage, nodes, run, json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}

test('classic and module JavaScript parse', () => {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const [,attributes,code] of scripts) {
    if (attributes.includes('importmap')) { JSON.parse(code); continue; }
    new vm.Script(code.replace(/^import .*;$/gm,''));
  }
});

test('default and legacy exports round-trip without losing design data', () => {
  const e=environment();
  assert.equal(e.run('state.furniture.length'),46);
  const before=e.json('state');
  e.run('const legacy=JSON.parse(snap());delete legacy.schemaVersion;state=fixState(legacy)');
  assert.deepEqual(e.json('state'),before);
  assert.equal(e.run('importPlan(snap())'),true);
  assert.deepEqual(JSON.parse(e.storage.get('huxing-design-v1')),before);
  const sparse=e.json('fixState({furniture:[]})');
  assert.equal(Object.keys(sparse.rooms).length,13);
});

const invalidCases = {
  'partial room':'s.rooms.master={name:"missing material"}',
  'unknown material':'s.rooms.master.mat="missing"',
  'non-string material':'s.rooms.master.mat=["wood"]',
  'unknown room':'s.rooms.missing={name:"x",mat:"wood"}',
  'event attribute in ID':'s.furniture[0].id=\'x" onpointerover="alert(1)\'',
  'duplicate ID':'s.furniture[1].id=s.furniture[0].id',
  'unknown furniture type':'s.furniture[0].type="unknown"',
  'attribute in color':'s.furniture[0].color=\'#fff" onload="alert(1)\'',
  'negative dimension':'s.furniture[0].w=-1',
  'oversized dimension':'s.furniture[0].d=20001',
  'string coordinate':'s.furniture[0].cx="100"',
  'null coordinate':'s.furniture[0].cx=null',
  'out-of-range coordinate':'s.furniture[0].cy=1000001',
  'unsupported version':'s.schemaVersion=999',
  'malformed measure':'s.measures=[{a:{x:0,y:0},b:{x:"bad",y:0}}]',
  'wrong collection type':'s.demolished={}',
  'unknown wall':'s.demolished=["w9999"]',
  'bearing wall':'s.demolished=["w"+WALLS.findIndex(w=>w[4]==="b")]',
  'exterior wall':'s.demolished=["w"+WALLS.findIndex(w=>w[4]==="e")]',
  'too many furniture items':'s.furniture=Array.from({length:501},(_,i)=>({...s.furniture[0],id:"f"+i}))',
  'prototype room key':'s.rooms=JSON.parse(\'{"__proto__":{"name":"x","mat":"wood"}}\')'
};
for (const [name, edit] of Object.entries(invalidCases)) {
  test(`rejects ${name} without changing state, selection, history or saved plan`, () => {
    const e=environment();e.run('save();ui.sel={kind:"furn",id:state.furniture[0].id};const s=JSON.parse(snap());'+edit);
    const before=e.run('snap()'), stored=e.storage.get('huxing-design-v1'), sel=e.json('ui.sel');
    assert.throws(()=>e.run('importPlan(JSON.stringify(s))'));
    assert.equal(e.run('snap()'),before);assert.equal(e.storage.get('huxing-design-v1'),stored);
    assert.deepEqual(e.json('ui.sel'),sel);assert.equal(e.run('undoStack.length'),0);
  });
}

test('invalid JSON and nonfinite numbers are rejected', () => {
  const e=environment();
  assert.throws(()=>e.run('importPlan("{")'));
  assert.throws(()=>e.run('parsePlan(snap().replace(/"cx":-?[0-9.]+/, \'"cx":1e999\'))'), /furniture.cx/);
  assert.throws(()=>e.run('const s=defaultState();s.furniture[0].rot=NaN;fixState(s)'));
});

test('safe text is escaped and unknown properties are not retained', () => {
  const e=environment();
  e.run(`const s=defaultState();s.furniture[0].name='<img src=x onerror=alert(1)>';s.furniture[0].onclick='bad';s.extra='bad';state=fixState(s);renderFurn()`);
  const markup=e.nodes.get('#gFurn').innerHTML;
  assert.ok(markup.includes('&lt;img'));
  assert.ok(!markup.includes('<img'));
  assert.equal(e.run('"onclick" in state.furniture[0] || "extra" in state'),false);
});

test('valid import adds one undo entry and undo/redo restore plans', () => {
  const e=environment();e.run('save();ui.sel={kind:"furn",id:state.furniture[0].id};const s=defaultState();s.furniture=[];s.demolished=["w26"];s.measures=[{a:{x:0,y:0},b:{x:100,y:100}}]');
  const before=e.run('snap()');e.run('importPlan(JSON.stringify(s))');
  assert.equal(e.run('undoStack.length'),1);assert.equal(e.run('ui.sel'),null);
  const after=e.run('snap()');e.run('undo()');assert.equal(e.run('snap()'),before);
  e.run('redo()');assert.equal(e.run('snap()'),after);
});

test('render failure rolls back import before any storage or history write', () => {
  const e=environment();e.run('save();const originalRender=renderAll;let first=true;renderAll=()=>{if(first){first=false;throw Error("render failure")}originalRender()}');
  const before=e.run('snap()');assert.throws(()=>e.run('importPlan(JSON.stringify({furniture:[]}))'),/render failure/);
  assert.equal(e.run('snap()'),before);assert.equal(e.storage.get('huxing-design-v1'),before);
  assert.equal(e.run('undoStack.length'),0);
});

test('storage failure keeps edits in memory and exposes retry and export; retry clears warning', () => {
  const e=environment();e.run('save();const originalSet=localStorage.setItem;localStorage.setItem=()=>{throw Error("quota")}');
  assert.equal(e.run('importPlan(JSON.stringify({furniture:[]}))'),false);
  assert.equal(e.run('state.furniture.length'),0);
  assert.equal(e.run('storageStatus'),'error');assert.equal(e.nodes.get('#retrySave').hidden,false);
  assert.equal(e.nodes.get('#saveExport').hidden,false);
  assert.equal(JSON.parse(e.storage.get('huxing-design-v1')).furniture.length,46);
  e.run('localStorage.setItem=originalSet;save()');
  assert.equal(e.run('storageStatus'),'saved');assert.equal(e.nodes.get('#retrySave').hidden,true);
  assert.equal(JSON.parse(e.storage.get('huxing-design-v1')).furniture.length,0);
});

test('corrupt cached data is kept and backed up before first successful save', () => {
  const raw='{"furniture":[],"rooms":{"master":{"name":"bad"}}}';
  const e=environment(raw);assert.equal(e.run('storageStatus'),'recovery');
  assert.equal(e.run('state.furniture.length'),46);assert.equal(e.storage.get('huxing-design-v1'),raw);
  e.run('save()');assert.equal(e.storage.get('huxing-design-v1-recovery'),raw);
  assert.equal(e.run('storageStatus'),'saved');
});

test('failed recovery backup does not overwrite corrupt original data', () => {
  const raw='bad json',e=environment(raw);
  e.run('const originalSet=localStorage.setItem;localStorage.setItem=(key,value)=>{if(key===RECOVERY_STORE)throw Error("quota");originalSet(key,value)}');
  assert.equal(e.run('save()'),false);assert.equal(e.storage.get('huxing-design-v1'),raw);
  assert.equal(e.run('recoveryRaw'),raw);assert.equal(e.nodes.get('#exportRecovery').hidden,false);
});

test('file read errors and excessive file size do not mutate state', async () => {
  const e=environment(),before=e.run('snap()');
  await e.run('importFile({size:1,text:()=>Promise.reject(Error("read failed"))})');
  assert.ok(e.nodes.get('#toast').textContent.includes('read failed'));
  await e.run('importFile({size:PLAN_LIMITS.bytes+1,text:()=>{throw Error("must not read")}})');
  assert.ok(e.nodes.get('#toast').textContent.includes('2 MB'));assert.equal(e.run('snap()'),before);
});

test('out-of-order file reads cannot replace a newer import', async () => {
  const e=environment();
  const first=e.run('let finish;importFile({size:1,text:()=>new Promise(r=>finish=r)})');
  await e.run('importFile({size:1,text:()=>Promise.resolve(JSON.stringify({furniture:[]}))})');
  e.run('finish(JSON.stringify(defaultState()))');await first;
  assert.equal(e.run('state.furniture.length'),0);assert.equal(e.run('undoStack.length'),1);
});

test('3D enter failure clears busy/switching and permits retry', async () => {
  const e=environment();e.run('let recovered=0;window.View3D={enter:async()=>{throw Error("WebGL")},recover:()=>recovered++}');
  await e.run('setView("3d")');assert.equal(e.run('viewMode'),'2d');assert.equal(e.run('switching'),false);
  assert.equal(e.run('document.body.classList.contains("busy")'),false);
  assert.equal(e.run('recovered'),1);
  e.run('window.View3D.enter=async()=>{}');await e.run('setView("3d")');
  assert.equal(e.run('viewMode'),'3d');assert.equal(e.run('switching'),false);
});

test('3D exit failure also returns to an editable 2D view', async () => {
  const e=environment();e.run('viewMode="3d";window.View3D={exit:async()=>{throw Error("exit")},recover(){}}');
  await e.run('setView("2d")');assert.equal(e.run('viewMode'),'2d');assert.equal(e.run('switching'),false);
});

test('late failure from an interrupted transition cannot cancel a new retry', async () => {
  const e=environment();
  const first=e.run('let rejectFirst;window.View3D={enter:()=>new Promise((r,j)=>rejectFirst=j),recover(){}};setView("3d")');
  e.run('recover3DView();let resolveSecond;window.View3D.enter=()=>new Promise(r=>resolveSecond=r)');
  const second=e.run('setView("3d")');e.run('rejectFirst(Error("old transition"))');await first;
  assert.equal(e.run('switching'),true);assert.equal(e.run('viewMode'),'3d');
  e.run('resolveSecond()');await second;assert.equal(e.run('switching'),false);
});

test('failed WebGL constructor does not set initialized flag', () => {
  const e=environment();e.run('let inited=false,initEvents,renderer;const THREE={WebGLRenderer:class{constructor(){throw Error("no WebGL")}}}');
  e.run(fn('init'));assert.throws(()=>e.run('init()'),/no WebGL/);
  assert.equal(e.run('inited'),false);
});

test('render-loop errors reject a pending transition instead of leaving it unresolved', async () => {
  const e=environment();e.run(`let raf=0,anim={t0:0,dur:100,fn(){},res(){},rej:null},fly=null;
    const clock={getDelta:()=>.01},performance={now:()=>10},clamp01=x=>x;
    const opt={mode:'orbit'},doors=[],orbit={update(){}},camera={},scene={};
    const renderer={render(){throw Error('render failure')}},labelRenderer={render(){}};
    function updateSel(){} function requestAnimationFrame(){return 1} function cancelAnimationFrame(){}
  `);
  e.run(fn('loop'));
  const pending=e.run('new Promise((r,j)=>anim.rej=j)');e.run('loop()');
  await assert.rejects(pending,/render failure/);assert.equal(e.run('raf'),0);
});

test('partial 3D initialization cleanup releases listeners, observer, renderer and cached materials', () => {
  const e=environment();
  e.run(`let calls=[];const mark=name=>()=>calls.push(name);
    let transitionEpoch=0,active=true,raf=1,anim=null,fly={},inited=false;
    let initEvents={abort:mark('abort')},resize3D={disconnect:mark('disconnect')};
    let orbit={dispose:mark('orbit')},walkCtl={unlock:mark('unlock'),dispose:mark('walk')};
    let ground={material:{dispose:mark('ground')}},glassMat={dispose:mark('glass')};
    let renderer={dispose:mark('renderer'),domElement:{remove:mark('canvas')}};
    let labelRenderer={domElement:{remove:mark('labels')}},camera={};
    let scene={traverse:fn=>fn({geometry:{dispose:mark('geometry')}})};
    let envTarget={dispose:mark('environment')},envTex={};
    const matCache=new Map([['m',{dispose:mark('material')}]]),keys={KeyW:true},opt={mode:'walk'};
    function stopTouchWalk(){}function cancelAnimationFrame(){}
  `);
  e.run(fn('recover'));e.run('recover()');
  for(const name of ['abort','disconnect','orbit','walk','renderer','canvas','labels','geometry','material','environment']){
    assert.equal(e.run(`calls.includes('${name}')`),true,name);
  }
  assert.equal(e.run('active'),false);assert.equal(e.run('raf'),0);
  assert.equal(e.run('matCache.size'),0);assert.equal(e.run('renderer'),undefined);
  assert.equal(e.run('Object.keys(keys).length'),0);
});
