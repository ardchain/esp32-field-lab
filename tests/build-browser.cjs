// End-to-end assembly checks through the same controls used by visitors.
// Test-only wrappers observe state; they never perform assembly actions.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../dist');
const out=process.env.QA_OUTPUT||'/tmp/esp32-build-qa';
const base='/esp32-field-lab/';
const origin='http://127.0.0.1:4194'+base;
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  let url;
  try{url=decodeURIComponent(req.url.split('?')[0]);}catch{res.writeHead(400);return res.end();}
  if(!url.startsWith(base)){res.writeHead(404);return res.end();}
  const file=path.resolve(root,url.slice(base.length)||'index.html');
  if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{
    res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});
    res.end(err?'':data);
  });
});
const errors=[],checks=[];
function record(label){checks.push(label);console.log('PASS '+label);}
async function instrument(context){
  await context.route('**/build.js',async route=>{
    const source=fs.readFileSync(path.join(root,'build.js'),'utf8');
    const observe=`\nconst qaMount=mountBuild;mountBuild=function(...args){const api=qaMount(...args);globalThis.__buildQa=api;return api;};\n`;
    await route.fulfill({contentType:'text/javascript',body:source+observe});
  });
  await context.route('**/scene.js',async route=>{
    const source=fs.readFileSync(path.join(root,'scene.js'),'utf8');
    const anchor="  externalSetup('board');resize();";
    assert.ok(source.includes(anchor),'Scene observation anchor');
    const observe=`\n if(buildMode){let qaFrames=0;const qaRender=renderer.render.bind(renderer);renderer.render=(...args)=>{const result=qaRender(...args);qaFrames++;return result;};globalThis.__buildSceneQa={
      frames:()=>qaFrames,
      state:()=>({running,buildState,buildSimulation,pressed,value,rotation,zoomLevel,ghosts:buildGhosts.children.length,emission:anim.led?.emissiveIntensity,geometryCount:geometries.size}),
      endpoint:id=>projectBuildEndpoint(id),
      bounds:()=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);let maxX=0,maxY=0;for(const parent of [board,circuit])parent.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera);maxX=Math.max(maxX,Math.abs(q.x));maxY=Math.max(maxY,Math.abs(q.y));}});return{maxX,maxY};},
      point:kind=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect(),candidates=[];circuit.traverse(o=>{if(o.isMesh&&o.userData.buildPart===kind)candidates.push(o);});const preferred=kind==='button'?anim.button:kind==='potentiometer'?anim.knob:null;candidates.sort((a,b)=>Number(b===preferred)-Number(a===preferred));for(const o of candidates){o.geometry.computeBoundingBox();const q=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld).project(camera),x=r.left+(q.x+1)*r.width/2,y=r.top+(1-q.y)*r.height/2;if(x<r.left||x>r.right||y<r.top||y>r.bottom)continue;const result=hit({clientX:x,clientY:y});if(result?.object.userData.buildPart===kind)return{x,y};}return null;},
      partSize:kind=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;circuit.traverse(o=>{if(!o.isMesh||o.userData.buildPart!==kind)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera);minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);}});return Math.hypot(maxX-minX,maxY-minY);},
      targets:()=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);return buildHighlightTargets.flatMap(id=>buildTargetEndpoints(id).map(buildEndpointPosition).filter(Boolean).map(p=>{const q=new THREE.Vector3(...p).applyMatrix4(world.matrixWorld).project(camera);return{id,x:q.x,y:q.y};}));}
    };}\n`;
    await route.fulfill({contentType:'text/javascript',body:source.replace(anchor,observe+anchor)});
  });
}
function collect(page,{allowWebGLFailure=false}={}){
  page.on('pageerror',e=>{errors.push(e.stack||e.message);console.error('BROWSER ERROR '+(e.stack||e.message));});
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon')){if(allowWebGLFailure&&/^THREE\.WebGLRenderer: Error creating WebGL context\.$/.test(m.text()))return;errors.push(m.text());}});
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(r.url()+': '+r.status());});
}
const state=p=>p.evaluate(()=>__buildQa.getState());
const running=p=>p.evaluate(()=>__buildQa.isRunning());
async function ready(p){await p.locator('#build-root').waitFor({state:'visible'});await p.waitForFunction(()=>!!globalThis.__buildQa);}
async function screenshot(p,name){await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
async function fits(p,label){
  const m=await p.evaluate(()=>({width:innerWidth,height:innerHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,bodyH:document.body.scrollHeight}));
  assert.ok(m.docW<=m.width,label+' no horizontal overflow '+JSON.stringify(m));
  if(m.width>760)assert.ok(m.docH<=m.height+1&&m.bodyH<=m.height+1,label+' no outer desktop scrolling '+JSON.stringify(m));
}

const S={
  led:'button[data-build-tool="led"]',resistor:'button[data-build-tool="resistor"]',wire:'button[data-build-tool="wire"]',
  select:'button[data-build-tool="select"]',delete:'button[data-build-tool="delete"]',button:'button[data-build-tool="button"]',potentiometer:'button[data-build-tool="potentiometer"]',
  use:'#build-use-contact',check:'#build-check',run:'#build-run',
  undo:'#build-undo',reset:'#build-reset',flip:'#build-flip',remove:'#build-remove',
  top:'#build-top',three:'#build-3d',back:'#build-exit',hint:'#build-hint',feedback:'#build-feedback',
};
async function activate(p,selector,touch=false){const l=p.locator(selector);if(touch)await l.tap();else await l.click();}
async function contact(p,id,{touch=false,keyboard=false,pointer=false}={}){
  if(pointer){await activate(p,`[data-build-contact="${id}"]`,touch);return;}
  if(!await p.locator('#build-contact-picker').evaluate(e=>e.open))await activate(p,'#build-open-picker',touch);
  if(id.startsWith('pin:')){
    await p.locator('#build-area').selectOption('board');await p.locator('#build-pin').selectOption(id);
  }else if(id.startsWith('bb:')){
    const [,column,row]=id.match(/^bb:([a-j])(\d+)$/);
    await p.locator('#build-area').selectOption('boardholes');await p.locator('#build-column').selectOption(column);await p.locator('#build-row').selectOption(row);
  }else{
    const [,rail,index]=id.split(':');await p.locator('#build-area').selectOption('rails');await p.locator('#build-rail').selectOption(rail);await p.locator('#build-rail-index').selectOption(index);
  }
  if(keyboard){await p.locator(S.use).focus();await p.keyboard.press('Enter');}
  else await activate(p,S.use,touch);
}
async function place(p,kind,anchor,options={}){await activate(p,S[kind],options.touch);await contact(p,anchor,options);}
async function wire(p,from,to,options={}){await activate(p,S.wire,options.touch);if(options.pointer)await activate(p,'#build-fit',options.touch);await contact(p,from,options);await contact(p,to,options);}
async function assemble(p,options={}){
  await place(p,'resistor','bb:c6',options);await place(p,'led','bb:e9',options);
  await wire(p,'pin:23','bb:a6',options);await wire(p,'bb:a10','pin:GND',options);
  const s=await state(p);assert.equal(s.parts.resistor.a,'bb:c6');assert.equal(s.parts.resistor.b,'bb:c9');
  assert.equal(s.parts.led.a,'bb:e9');assert.equal(s.parts.led.b,'bb:e10');assert.equal(s.wires.length,2);
}
async function checkAndRun(p,options={}){
  assert.equal(await p.locator(S.run).isDisabled(),true,'Unchecked circuit cannot run');
  await activate(p,S.check,options.touch);assert.equal(await p.locator(S.run).isDisabled(),false,'Correct circuit can run');
  await activate(p,S.run,options.touch);assert.equal(await running(p),true);
}
async function selectedPart(p,kind){await p.locator(`#build-viewport [data-build-part="${kind}"]`).first().click();}
const center=async locator=>{const b=await locator.boundingBox();assert.ok(b,'Visible target has a rendered box');return{x:b.x+b.width/2,y:b.y+b.height/2};};
async function canvasRaster(p,name){const bytes=await p.locator('#build-canvas-wrap').screenshot({path:path.join(out,name+'.png')});return crypto.createHash('sha256').update(bytes).digest('hex');}
async function contactDistance(p,a,b){const x=await center(p.locator(`[data-build-contact="${a}"]`)),y=await center(p.locator(`[data-build-contact="${b}"]`));return Math.hypot(x.x-y.x,x.y-y.y);}
async function intuitiveEditing(p){
  await activate(p,'#build-fit');
  const anchor=await center(p.locator('[data-build-contact="bb:c9"]'));
  const before=await contactDistance(p,'bb:a6','bb:a10'),image=await canvasRaster(p,'gesture-wheel-before');
  await p.mouse.move(anchor.x,anchor.y);await p.mouse.wheel(0,-650);
  await p.waitForFunction(()=>Number(document.querySelector('#build-zoom').value)>125);
  const after=await contactDistance(p,'bb:a6','bb:a10'),sameAnchor=await center(p.locator('[data-build-contact="bb:c9"]'));
  assert.ok(after>before*1.25,'Wheel visibly magnifies breadboard spacing');
  assert.ok(Math.hypot(sameAnchor.x-anchor.x,sameAnchor.y-anchor.y)<10,'Wheel remains anchored beneath the cursor');
  assert.notEqual(await canvasRaster(p,'gesture-wheel-after'),image,'Wheel changes the actual circuit raster');
  await p.locator('#build-zoom').focus();await p.keyboard.press('Home');
  const small=await contactDistance(p,'bb:a6','bb:a10');await p.keyboard.press('End');
  assert.ok(await contactDistance(p,'bb:a6','bb:a10')>small*3,'Zoom slider spans a useful scale range');
  await activate(p,'#build-fit');record('Ordinary wheel and visible Zoom slider change the rendered 2D scale');

  await activate(p,S.hint);await p.locator('[data-build-ghost]').first().waitFor({state:'visible'});
  assert.equal(await p.locator('#build-callout').isVisible(),true,'First hint has an anchored explanation');
  assert.ok((await p.locator('#build-callout').innerText()).trim().length>5);
  const ghost=await p.locator('[data-build-ghost]').first().boundingBox(),canvas=await p.locator('#build-canvas-wrap').boundingBox();
  assert.ok(Math.min(ghost.x+ghost.width,canvas.x+canvas.width)>Math.max(ghost.x,canvas.x)&&Math.min(ghost.y+ghost.height,canvas.y+canvas.height)>Math.max(ghost.y,canvas.y),'First hint ghost is actually in view');
  await screenshot(p,'first-visual-hint');record('First Hint immediately shows a visible ghost and anchored guidance');

  await place(p,'resistor','bb:c6',{pointer:true});await activate(p,S.select);await activate(p,'#build-fit');
  const start=await center(p.locator('[data-build-contact="bb:c6"]')),end=await center(p.locator('[data-build-contact="bb:c12"]'));
  const initialBox=await p.locator('[data-build-part="resistor"]').boundingBox(),view=await p.locator('#build-viewport').getAttribute('viewBox');
  await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:16});
  assert.ok(await p.locator('[data-build-ghost="resistor"]').count()>0,'Drag has a visible placement preview');
  await canvasRaster(p,'gesture-drag-preview');await p.mouse.up();
  assert.equal((await state(p)).parts.resistor.a,'bb:c12');assert.equal((await state(p)).parts.resistor.b,'bb:c15');
  const movedBox=await p.locator('[data-build-part="resistor"]').boundingBox();
  assert.ok(Math.abs(movedBox.y-initialBox.y)>20,'The resistor itself visibly moved');
  assert.equal(await p.locator('#build-viewport').getAttribute('viewBox'),view,'Dragging a part does not pan the breadboard');
  await canvasRaster(p,'gesture-drag-after');
  await selectedPart(p,'resistor');await p.keyboard.press('Delete');
  assert.equal((await state(p)).parts.resistor,null);assert.equal(await p.locator('[data-build-part="resistor"]').count(),0);
  await activate(p,S.undo);assert.equal((await state(p)).parts.resistor.a,'bb:c12');
  await activate(p,S.delete);await selectedPart(p,'resistor');assert.equal(await p.locator('[data-build-part="resistor"]').count(),0);
  await activate(p,S.undo);assert.equal((await state(p)).parts.resistor.a,'bb:c12');
  await activate(p,S.reset);record('Select/Move drags a component; Delete key and visible Delete tool remove it with Undo');
}
async function switchProject(p,id){
  await p.locator('#build-project').selectOption(id);
  await p.waitForFunction(id=>location.hash==='#build-'+id&&globalThis.__buildQa?.getState().project===id,id);
  assert.equal(await running(p),false);assert.equal(await p.locator(S.run).isDisabled(),true);
}
async function removeLastWire(p){
  if(!await p.locator('#build-wires').evaluate(e=>e.open))await p.locator('#build-wires summary').click();
  await p.locator('[data-build-wire-remove]').last().click();
}
async function solveWithVisibleHints(p){
  for(let step=0;step<16;step++){
    await activate(p,S.hint);const ghost=p.locator('[data-build-ghost][data-build-targets]').first();await ghost.waitFor({state:'visible'});
    const kind=await ghost.getAttribute('data-build-ghost'),targets=(await ghost.getAttribute('data-build-targets')).split(',').filter(Boolean);
    assert.ok(targets.length>=2,'Visible suggestion identifies its actual contacts');
    const before=await state(p);
    for(const target of kind==='wire'?targets.slice(0,2):targets.slice(0,1))await contact(p,target,{pointer:true});
    assert.notDeepEqual(await state(p),before,'Following the displayed ghost makes a real assembly edit');
    await activate(p,S.check);if(!await p.locator(S.run).isDisabled())return;
  }
  assert.fail('A new project should be completable by following its visible hints');
}
async function spareStripContact(p,id,state){
  const [,column,row]=id.match(/^bb:([a-j])(\d+)$/),letters=column<'f'?'abcde':'fghij';
  const used=new Set([...Object.values(state.parts).filter(Boolean).flatMap(p=>Object.values(p).filter(v=>typeof v==='string')),...state.wires.flatMap(w=>[w.from,w.to])]);
  await activate(p,S.wire);await activate(p,'#build-fit');
  for(const candidate of [...letters].map(c=>'bb:'+c+row).filter(c=>!used.has(c))){
    const point=await center(p.locator(`[data-build-contact="${candidate}"]`));
    if(await p.evaluate(({point,candidate})=>document.elementFromPoint(point.x,point.y)?.closest('[data-build-contact]')?.dataset.buildContact===candidate,{point,candidate}))return candidate;
  }
  assert.fail('A visible free contact exists in the observed strip');
}
async function projectExercises(p,blinkDraft){
  await p.locator('.top-navigation [data-nav="build"]').click();await ready(p);
  await switchProject(p,'button');await assemble(p,{pointer:true});await place(p,'button','bb:d16',{pointer:true});
  assert.deepEqual((await state(p)).parts.button,{a:'bb:d16',b:'bb:d18',c:'bb:f16',d:'bb:f18'});
  await wire(p,'pin:18','bb:a16',{pointer:true});await wire(p,'bb:a18','pin:GND2',{pointer:true});
  await activate(p,S.check);assert.equal(await p.locator(S.run).isDisabled(),true);
  assert.match(await p.locator(S.feedback).innerText(),/pressing|always LOW|direct GPIO18|permanently|opposite/i);
  await screenshot(p,'button-wrong-pair');await removeLastWire(p);await wire(p,'bb:j16','pin:GND2',{pointer:true});
  await checkAndRun(p);const buttonDraft=await state(p);await activate(p,S.three);
  await p.waitForFunction(()=>globalThis.__buildSceneQa?.state().buildState.project==='button'&&__buildSceneQa.state().emission<.1);
  await p.waitForFunction(()=>!!__buildSceneQa.point('button'));const buttonPoint=await p.evaluate(()=>__buildSceneQa.point('button'));
  await p.mouse.move(buttonPoint.x,buttonPoint.y);await p.mouse.down();
  await p.waitForFunction(()=>__buildSceneQa.state().emission>1&&__buildSceneQa.state().buildSimulation?.inputLevel==='LOW');
  await screenshot(p,'button-pressed');await p.mouse.up();
  await p.waitForFunction(()=>__buildSceneQa.state().emission<.1&&__buildSceneQa.state().buildSimulation?.inputLevel==='HIGH');
  assert.equal(await running(p),true);record('Button assembly rejects a permanently joined pair; pressing the real 3D button drives its LED');

  await switchProject(p,'potentiometer');await solveWithVisibleHints(p);await activate(p,S.run);assert.equal(await running(p),true);await screenshot(p,'dial-built-from-hints');await activate(p,S.run);
  record('A complete new dial project is built by reading visible ghost contacts, without prescribed coordinates or the contact picker');
  const hinted=await state(p),wiperWire=hinted.wires.find(w=>w.from==='pin:34'||w.to==='pin:34');assert.ok(wiperWire);
  const wiperContact=wiperWire.from==='pin:34'?wiperWire.to:wiperWire.from;
  if(!await p.locator('#build-wires').evaluate(e=>e.open))await p.locator('#build-wires summary').click();
  await p.locator(`[data-build-wire-remove="${wiperWire.id}"]`).click();
  await wire(p,'pin:35',wiperContact,{pointer:true});await activate(p,S.check);
  assert.equal(await p.locator(S.run).isDisabled(),true);assert.match(await p.locator(S.feedback).innerText(),/GPIO34/);
  await removeLastWire(p);await wire(p,'pin:34',wiperContact,{pointer:true});
  const beforeBridge=await state(p),powerWire=beforeBridge.wires.find(w=>w.from==='pin:3V3'||w.to==='pin:3V3');assert.ok(powerWire);
  const powerContact=powerWire.from==='pin:3V3'?powerWire.to:powerWire.from;
  const coveredContact='bb:j'+beforeBridge.parts.potentiometer.w.match(/\d+$/)[0];
  await activate(p,S.select);await activate(p,'#build-fit');const coveredPoint=await center(p.locator(`[data-build-contact="${coveredContact}"]`));
  assert.equal(await p.evaluate(point=>document.elementFromPoint(point.x,point.y)?.closest('[data-build-part]')?.dataset.buildPart,coveredPoint),'potentiometer','The chosen contact really lies under the dial body in Select mode');
  await wire(p,coveredContact,await spareStripContact(p,powerContact,beforeBridge),{pointer:true});
  assert.equal((await state(p)).wires.at(-1).from,coveredContact,'Wire mode reaches the formerly blocked contact without forced clicks');
  assert.ok(Number(await p.locator('[data-build-part="potentiometer"]').evaluate(e=>getComputedStyle(e).opacity))<.9);
  await activate(p,S.check);
  assert.equal(await p.locator(S.run).isDisabled(),true);assert.match(await p.locator(S.feedback).innerText(),/terminal|wiper|middle|separate/i);
  await screenshot(p,'dial-wrong-wiper');await removeLastWire(p);await activate(p,S.select);await activate(p,'#build-fit');
  assert.equal(Number(await p.locator('[data-build-part="potentiometer"]').evaluate(e=>getComputedStyle(e).opacity)),1);
  const restoredPoint=await center(p.locator(`[data-build-contact="${coveredContact}"]`));
  assert.equal(await p.evaluate(point=>document.elementFromPoint(point.x,point.y)?.closest('[data-build-part]')?.dataset.buildPart,restoredPoint),'potentiometer');
  record('Wire reaches a contact covered by the dial; Select restores ordinary body rendering and picking');
  await checkAndRun(p);const dialDraft=await state(p);
  await activate(p,S.three);await p.waitForFunction(()=>globalThis.__buildSceneQa?.state().buildState.project==='potentiometer'&&__buildSceneQa.state().emission>.5);
  await p.waitForFunction(()=>!!__buildSceneQa.point('potentiometer'));
  const potPoint=await p.evaluate(()=>__buildSceneQa.point('potentiometer')),dim=await p.evaluate(()=>__buildSceneQa.state().emission);
  await p.mouse.move(potPoint.x,potPoint.y);await p.mouse.down();await p.mouse.move(potPoint.x+130,potPoint.y,{steps:20});
  await p.waitForFunction(n=>__buildSceneQa.state().buildSimulation?.value>60&&__buildSceneQa.state().emission>n+.2,dim);
  await screenshot(p,'dial-dragged');await p.mouse.up();assert.equal(await running(p),true);
  await p.locator('#build-dial').focus();await p.keyboard.press('Home');await p.waitForFunction(()=>__buildSceneQa.state().emission<.1);
  await p.keyboard.press('End');await p.waitForFunction(()=>__buildSceneQa.state().emission>1.5);
  assert.equal(await running(p),true);record('Dial assembly rejects wrong GPIO and rail-tied wiper; real knob and accessible slider visibly control brightness');

  await switchProject(p,'button');assert.deepEqual(await state(p),buttonDraft);
  await switchProject(p,'blink');assert.deepEqual(await state(p),blinkDraft);
  await switchProject(p,'potentiometer');assert.deepEqual(await state(p),dialDraft);
  await p.reload({waitUntil:'networkidle'});await ready(p);assert.deepEqual(await state(p),dialDraft);assert.equal(await running(p),false);
  await p.locator('[data-nav="lab"]').click();await p.waitForFunction(()=>location.hash==='#potentiometer');await p.locator('#lesson-main').waitFor({state:'visible'});
  record('Three project drafts remain separate, reload unchecked, and Learn opens the matching project lesson');
}
async function mobileGestures(p){
  await activate(p,S.hint,true);
  await p.waitForFunction(()=>{
    const selectors=['#build-callout','[data-build-ghost]'];
    return selectors.every(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
  });
  await p.screenshot({path:path.join(out,'mobile-hint-in-viewport.png')});
  assert.equal(await p.locator('#build-hint-near').isVisible(),true);record('Mobile Hint brings its actual ghost and anchored explanation into the browser viewport');
  await activate(p,S.reset,true);await activate(p,'#build-fit',true);await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();
  const before=await state(p),spacing=await contactDistance(p,'bb:a6','bb:a10'),c=await center(p.locator('#build-canvas-wrap'));
  const session=await p.context().newCDPSession(p),points=d=>[{id:1,x:c.x-d,y:c.y,radiusX:3,radiusY:3},{id:2,x:c.x+d,y:c.y,radiusX:3,radiusY:3}];
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});
  for(const d of [40,50,65,80,90])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
  assert.ok(await contactDistance(p,'bb:a6','bb:a10')>spacing*1.5,'Two-finger pinch visibly magnifies the breadboard');
  assert.deepEqual(await state(p),before,'Pinch does not place or alter any component or wire');
  assert.equal(await p.evaluate(()=>visualViewport.scale),1,'Pinch controls the editor, not the whole page');
  await p.screenshot({path:path.join(out,'mobile-pinch-in-viewport.png')});await activate(p,'#build-fit',true);
  record('Real two-finger SVG pinch magnifies the editor without accidental assembly changes');
}
async function main(){
  await new Promise(r=>server.listen(4194,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle']});
  let page;
  try{
    const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(ctx);
    page=await ctx.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);
    assert.equal(await page.locator('#lesson-main').isVisible(),false);assert.deepEqual((await state(page)).parts,{led:null,resistor:null});
    await fits(page,'1366×768 empty builder');await screenshot(page,'desktop-empty');
    await page.locator(S.check).click();assert.equal(await page.locator(S.run).isDisabled(),true);record('Empty build cannot run');
    await intuitiveEditing(page);
    await assemble(page,{pointer:true});await checkAndRun(page);await screenshot(page,'desktop-success');record('Visible SVG contacts build and run Blink with ordinary pointer clicks');

    // Keyboard shortcuts must not navigate or start the hidden lesson.
    await page.locator('.build-heading p').click();await page.keyboard.press(']');await page.keyboard.press('[');await page.keyboard.press('r');await page.keyboard.press('Space');
    assert.ok(page.url().endsWith('#build-blink'));assert.equal(await page.locator('#lesson-main').isVisible(),false);
    assert.equal(await page.locator('#run-label').textContent(),'Run simulation');record('Build isolates lesson shortcuts');

    // Same saved circuit is rendered and blinking in the real 3D renderer.
    await page.locator(S.three).click();await page.locator('#build-scene3d canvas').waitFor();
    await page.waitForFunction(()=>globalThis.__buildSceneQa?.state().running===true);
    await page.waitForFunction(()=>__buildSceneQa.state().emission>1);
    await page.waitForFunction(()=>__buildSceneQa.state().emission<.1);
    const uiCircuit=await state(page);assert.deepEqual(await page.evaluate(()=>__buildSceneQa.state().buildState),{project:uiCircuit.project,parts:uiCircuit.parts,wires:uiCircuit.wires,interval:uiCircuit.interval});
    const b=await page.evaluate(()=>__buildSceneQa.bounds());assert.ok(b.maxX<1&&b.maxY<1,'3D model fits '+JSON.stringify(b));
    const before3DZoom=await page.evaluate(()=>__buildSceneQa.partSize('resistor'));
    const zoomCenter=await center(page.locator('#build-scene3d'));await page.mouse.move(zoomCenter.x,zoomCenter.y);await page.mouse.wheel(0,-1100);
    await page.waitForFunction(n=>__buildSceneQa.state().zoomLevel>1.5&&__buildSceneQa.partSize('resistor')>n*1.4,before3DZoom);
    await screenshot(page,'3d-wheel-closeup');
    await page.locator('#build-zoom').focus();await page.keyboard.press('End');
    await page.waitForFunction(()=>__buildSceneQa.state().zoomLevel>=2.9);await page.locator('#build-fit').click();
    await page.waitForFunction(n=>Math.abs(__buildSceneQa.partSize('resistor')/n-1)<.04,before3DZoom);
    record('3D wheel and Zoom slider visibly magnify well beyond the old narrow limit');
    const ledWholeSize=await page.evaluate(()=>__buildSceneQa.partSize('led'));
    await screenshot(page,'desktop-3d-running');record('3D build fits and LED actually blinks');
    await activate(page,S.select);
    const drag3=await page.evaluate(()=>({point:__buildSceneQa.point('resistor'),a:__buildSceneQa.endpoint('bb:c6'),b:__buildSceneQa.endpoint('bb:c12'),rotation:__buildSceneQa.state().rotation}));
    assert.ok(drag3.point&&drag3.a.visible&&drag3.b.visible);
    await page.mouse.move(drag3.point.x,drag3.point.y);await page.mouse.down();await page.mouse.move(drag3.point.x+drag3.b.x-drag3.a.x,drag3.point.y+drag3.b.y-drag3.a.y,{steps:18});
    await page.waitForFunction(()=>__buildSceneQa.state().ghosts>0);let dragFrame=await page.evaluate(()=>__buildSceneQa.frames());await page.waitForFunction(n=>__buildSceneQa.frames()>n,dragFrame);
    await screenshot(page,'3d-part-drag-preview');await page.mouse.up();
    assert.equal((await state(page)).parts.resistor.a,'bb:c12');assert.equal(await running(page),false);
    assert.ok(Math.abs((await page.evaluate(()=>__buildSceneQa.state().rotation))-drag3.rotation)<.01,'Dragging a 3D part does not rotate the whole board');
    assert.equal(await page.locator(S.run).isDisabled(),true);await page.locator(S.undo).click();await checkAndRun(page);
    record('Real 3D component drag shows a ghost, moves the part and invalidates Check');
    await activate(page,S.select);
    await page.waitForFunction(()=>!!__buildSceneQa.point('led'));
    const ledPoint=await page.evaluate(()=>__buildSceneQa.point('led'));await page.mouse.click(ledPoint.x,ledPoint.y);
    assert.equal(await page.locator('#build-root').getAttribute('data-tool'),'select');assert.equal(await page.locator(S.remove).isVisible(),true);
    record('Clicking the real 3D LED selects it for editing');

    // Polarity is a circuit edit and must invalidate an earlier successful Check.
    await page.locator(S.flip).click();
    assert.equal(await running(page),false);assert.equal(await page.locator(S.run).isDisabled(),true);
    await page.locator(S.check).click();assert.equal(await page.locator(S.run).isDisabled(),true);
    assert.match(await page.locator(S.feedback).innerText(),/polarity|reverse|anode|cathode|LED/i);
    assert.equal(await page.locator('#build-scene3d').getAttribute('data-focus-active'),'true');
    const focusTargets=await page.evaluate(()=>__buildSceneQa.targets());assert.ok(focusTargets.length>=2);
    assert.ok(focusTargets.every(t=>Math.abs(t.x)<1&&Math.abs(t.y)<1),'Diagnostic endpoints are framed in 3D');
    const ledFocusSize=await page.evaluate(()=>__buildSceneQa.partSize('led'));
    assert.ok(ledFocusSize>ledWholeSize*1.5,'Diagnostic close-up magnifies the LED: '+JSON.stringify({ledWholeSize,ledFocusSize}));
    const focusFrame=await page.evaluate(()=>__buildSceneQa.frames());await page.waitForFunction(n=>__buildSceneQa.frames()>n,focusFrame);
    await screenshot(page,'reversed-led-3d');await page.locator(S.top).click();
    assert.ok(await page.locator('.build-contact.is-highlighted').count()>=2);
    await screenshot(page,'reversed-led');await place(page,'led','bb:g12');
    assert.deepEqual((await state(page)).parts.led,{a:'bb:g12',b:'bb:g11'});
    await page.locator(S.undo).click();assert.equal((await state(page)).parts.led.a,'bb:e10');
    await page.locator(S.undo).click();
    assert.equal((await state(page)).parts.led.a,'bb:e9');await checkAndRun(page);record('LED flip is rejected; Undo restores an unchecked circuit');

    // An occupied physical hole cannot accept another lead even if the net matches.
    const beforeOccupied=await state(page);
    await wire(page,'pin:GND2','bb:c6');assert.deepEqual((await state(page)).wires,beforeOccupied.wires);
    assert.match(await page.locator(S.feedback).innerText(),/occupied|hole|lead/i);await page.keyboard.press('Escape');
    await wire(page,'pin:23','bb:a6');assert.equal((await state(page)).wires.length,2);await page.keyboard.press('Escape');
    record('Occupied holes and duplicate jumpers do not mutate the circuit');

    // Pointer selection and movement exercise the actual SVG hit targets.
    const beforeMove=await state(page);await selectedPart(page,'resistor');await page.locator('#build-fit').click();
    await page.locator('[data-build-contact="bb:c16"]').click();
    assert.equal((await state(page)).parts.resistor.a,'bb:c16');assert.equal(await running(page),false);
    await page.locator(S.check).click();assert.equal(await page.locator(S.run).isDisabled(),true);
    await page.locator(S.undo).click();assert.deepEqual(await state(page),beforeMove);
    await page.locator('#build-wires summary').click();
    await page.locator('[data-build-wire-select]').first().click();await page.locator(S.remove).click();
    assert.equal((await state(page)).wires.length,1);assert.equal(await page.locator(S.run).isDisabled(),true);
    await page.locator(S.undo).click();assert.deepEqual(await state(page),beforeMove);await checkAndRun(page);
    record('SVG pointer movement and wire removal invalidate Check and Undo restores the circuit');

    // Demo, displayed sketch and downloaded sketch share the explicit timing value.
    await page.getByText('Blink timing & code',{exact:true}).click();
    await page.locator('#build-interval').focus();await page.keyboard.press('ArrowRight');
    assert.equal((await state(page)).interval,550);assert.equal(await running(page),false);
    assert.equal(await page.locator(S.run).isDisabled(),true);assert.match(await page.locator('#build-code').innerText(),/INTERVAL_MS = 550;/);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#build-download').click()]);
    assert.equal(download.suggestedFilename(),'build-blink.ino');assert.match(fs.readFileSync(await download.path(),'utf8'),/INTERVAL_MS = 550;/);
    await checkAndRun(page);record('Timing edits stop the demo and synchronize visible and downloadable code');

    // Reset is reversible, and neither Reset nor Undo preserves a cached pass.
    const saved=await state(page);await page.locator(S.reset).click();
    assert.deepEqual((await state(page)).parts,{led:null,resistor:null});assert.equal((await state(page)).wires.length,0);
    assert.equal(await running(page),false);await page.locator(S.undo).click();assert.deepEqual(await state(page),saved);
    assert.equal(await page.locator(S.run).isDisabled(),true);record('Reset is undoable and stops the demonstration');

    await page.reload({waitUntil:'networkidle'});await ready(page);assert.deepEqual(await state(page),saved);
    assert.equal(await running(page),false);assert.equal(await page.locator(S.run).isDisabled(),true);record('Draft reload resumes safely, without cached success');
    for(const [width,height]of[[1024,700],[820,700],[1280,720],[1366,600]]){await page.setViewportSize({width,height});await fits(page,width+'×'+height+' builder');}
    await page.setViewportSize({width:1366,height:768});
    await page.locator(S.back).click();await page.waitForFunction(()=>location.hash==='#blink');await page.locator('#scene canvas').waitFor();
    assert.equal(await page.locator('#build-root').isVisible(),false);assert.equal(await page.locator('#build-root canvas').count(),0);
    assert.match(await page.locator('#blink-control-note').innerText(),/demo and example code.*No code is compiled/);
    assert.equal(await page.locator('#experiment-value').getAttribute('aria-describedby'),'blink-control-note');
    assert.match(await page.locator('.control-box label').innerText(),/INTERVAL_MS/);
    const lessonInterval=Number(await page.locator('#experiment-value').inputValue());
    const lessonStep=Number(await page.locator('#experiment-value').getAttribute('step'));
    await page.locator('#experiment-value').focus();await page.keyboard.press('ArrowRight');
    const expectedInterval=lessonInterval+lessonStep;
    assert.equal(Number(await page.locator('#experiment-value').inputValue()),expectedInterval);
    await page.locator('[data-tab="code"]').click();
    assert.match(await page.locator('#lesson-content pre code').innerText(),new RegExp('INTERVAL_MS = '+expectedInterval+';'));
    record('Blink lesson explains its slider beside the control and synchronizes the full sketch');
    await page.goBack();await ready(page);assert.deepEqual(await state(page),saved);
    await page.goForward();await page.locator('#lesson-main').waitFor({state:'visible'});record('Exit and browser Back/Forward preserve work and clean up renderers');
    await projectExercises(page,saved);

    // Touch completes the same task. The contact picker avoids tiny target dependence.
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(mobile);
    const m=await mobile.newPage();page=m;collect(m);await m.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(m);
    await mobileGestures(m);await assemble(m,{touch:true});await checkAndRun(m,{touch:true});await fits(m,'390px touch');await screenshot(m,'mobile-success');
    assert.ok(await m.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Mobile remains scrollable');
    await m.setViewportSize({width:320,height:844});await fits(m,'320px touch');await screenshot(m,'mobile-320');
    await activate(m,S.hint,true);assert.equal(await running(m),true,'Reading a hint does not edit a working circuit');
    await activate(m,S.three,true);await m.locator('#build-scene3d canvas').waitFor();await screenshot(m,'mobile-3d');record('390/320px touch builder and 3D remain usable');
    await activate(m,S.top,true);await activate(m,S.resistor,true);await activate(m,'#build-fit',true);
    await m.locator('[data-build-contact="bb:c16"]').tap();assert.equal((await state(m)).parts.resistor.a,'bb:c16');
    await activate(m,S.undo,true);assert.equal((await state(m)).parts.resistor.a,'bb:c6');
    await activate(m,'#build-fit',true);await screenshot(m,'mobile-fit');
    await m.getByText('Blink timing & code',{exact:true}).tap();await fits(m,'320px expanded code');
    record('Mobile SVG contacts accept touch and Fit restores the complete circuit');

    // Corrupt only this application's draft; initialization must recover cleanly.
    const draftKey=await m.evaluate(()=>Object.keys(localStorage).find(k=>{try{const v=JSON.parse(localStorage.getItem(k));return v?.parts&&Array.isArray(v.wires);}catch{return false;}}));
    assert.ok(draftKey,'Draft is stored separately from lesson progress');
    const corrupt=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(corrupt);
    await corrupt.addInitScript(key=>{try{if(!sessionStorage.getItem('qa-corrupted')){localStorage.setItem(key,'{broken');sessionStorage.setItem('qa-corrupted','1');}}catch{}},draftKey);
    const c=await corrupt.newPage();page=c;collect(c);await c.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(c);
    assert.deepEqual((await state(c)).parts,{led:null,resistor:null});assert.equal(await running(c),false);record('Malformed saved draft recovers to an empty safe build');

    // Reuse the draft assembled through the UI above; disable only WebGL in this context.
    const fallback=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(fallback);
    await fallback.addInitScript(({key,draft})=>{
      localStorage.setItem(key,JSON.stringify(draft));
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args){if(/^webgl|^experimental-webgl/.test(type))return null;return original.call(this,type,...args);};
    },{key:draftKey,draft:saved});
    const f=await fallback.newPage();page=f;collect(f,{allowWebGLFailure:true});await f.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(f);
    await activate(f,S.three,true);assert.equal(await f.locator(S.top).getAttribute('aria-pressed'),'true');
    assert.equal(await f.locator('#build-viewport').isVisible(),true);assert.equal(await f.locator('#build-scene3d').isVisible(),false);
    assert.equal(await f.locator('#build-scene3d canvas').count(),0);assert.match(await f.locator(S.feedback).innerText(),/3D is unavailable/i);
    await checkAndRun(f,{touch:true});await f.waitForFunction(()=>document.querySelector('.build-led-bulb')?.classList.contains('is-lit'));
    await f.waitForFunction(()=>!document.querySelector('.build-led-bulb')?.classList.contains('is-lit'));
    await screenshot(f,'mobile-webgl-fallback');record('WebGL-disabled phone falls back to Top view with a working Check and blinking Run');
    assert.deepEqual(errors,[]);
    for(const name of ['failure.json','failure.png'])fs.rmSync(path.join(out,name),{force:true});
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({result:'passed',checks,errors,output:out},null,2));
    console.log(JSON.stringify({result:'passed',checks:checks.length,errors,output:out}));
  }catch(e){if(page)await screenshot(page,'failure').catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,errors},null,2));throw e;}
  finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
