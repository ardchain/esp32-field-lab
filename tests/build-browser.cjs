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
const errors=[],checks=[],guideTranscripts={};
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
      camera:()=>({position:camera.position.toArray(),center:cameraCenter.toArray(),direction:viewDirection.toArray(),frustum:[camera.left,camera.right,camera.top,camera.bottom],yaw:rotation,worldYaw:world.rotation.y}),
      cameraMoving:()=>Math.abs(rotation-targetRotation)>.001||viewDirection.distanceTo(targetDirection)>.01,
      dragLocksCamera:()=>buildDragLocksView(),
      state:()=>({running,buildState,buildSimulation,pressed,value,rotation,zoomLevel,ghosts:buildGhosts.children.length,emission:anim.led?.emissiveIntensity,geometryCount:geometries.size}),
      endpoint:id=>projectBuildEndpoint(id),
      wireEnd:(id,end)=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);const g=buildWireHandles.children.find(g=>g.userData.buildWireEnd?.id===id&&g.userData.buildWireEnd?.end===end);if(!g)return null;const q=g.getWorldPosition(new THREE.Vector3()).project(camera),r=renderer.domElement.getBoundingClientRect();return{x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2,anchor:g.userData.buildWireEnd.anchor};},
      wirePoint:id=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect(),c=[];circuit.traverse(o=>{if(o.isMesh&&o.userData.buildWire===id)c.push(o);});for(const o of c)for(const t of [.35,.5,.65]){o.geometry.computeBoundingBox();const q=o.geometry.parameters.path?.getPointAt(t)||o.geometry.boundingBox.getCenter(new THREE.Vector3());q.applyMatrix4(o.matrixWorld).project(camera);const x=r.left+(q.x+1)*r.width/2,y=r.top+(1-q.y)*r.height/2;if(x<r.left||x>r.right||y<r.top||y>r.bottom)continue;if(hit({clientX:x,clientY:y})?.object.userData.buildWire===id)return{x,y};}return null;},
      copper:()=>buildCopper.children.map(m=>m.userData.buildCopper),
      blankPoint:()=>{const r=renderer.domElement.getBoundingClientRect();for(const u of [.95,.05,.85,.15])for(const v of [.1,.9,.25,.75]){const e={clientX:r.x+r.width*u,clientY:r.y+r.height*v};if(!hit(e))return{x:e.clientX,y:e.clientY};}return null;},
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
async function ready(p,{guided=false,preserve=false}={}){await p.locator('#build-root').waitFor({state:'visible'});await p.waitForFunction(()=>!!globalThis.__buildQa);const toggle=p.locator(guided?'#build-guided':'#build-free');if(!preserve&&await toggle.count()&&await toggle.isVisible())await toggle.click();}
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
async function activate(p,selector,touch=false){const l=p.locator(selector);if(!await l.isVisible()){const details=l.locator('xpath=ancestor::details[1]');if(await details.count()&&!await details.evaluate(e=>e.open)){const summary=details.locator(':scope > summary');if(touch)await summary.tap();else await summary.click();}}if(touch)await l.tap();else await l.click();}
async function contact(p,id,{touch=false,keyboard=false,pointer=false}={}){
  if(pointer){const target=p.locator(`[data-build-contact="${id}"]`);await target.scrollIntoViewIfNeeded();const point=await center(target),canvas=await p.locator('#build-canvas-wrap').boundingBox();assert.ok(point.x>=canvas.x&&point.x<=canvas.x+canvas.width&&point.y>=canvas.y&&point.y<=canvas.y+canvas.height,'Requested contact is visibly inside the editor: '+id);if(touch)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);return;}
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
async function selectedPart(p,kind){const part=p.locator(`#build-viewport [data-build-part="${kind}"]`).first();if(await p.locator('#build-root').getAttribute('data-tool')!=='delete'&&await part.evaluate(e=>e.classList.contains('is-selected')))return;await part.click();}
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
  const suggested=(await p.locator('[data-build-ghost="resistor"]').getAttribute('data-build-targets')).split(',');
  const ghostBody=await center(p.locator('[data-build-ghost="resistor"]'));await p.mouse.click(ghostBody.x,ghostBody.y);
  assert.deepEqual([(await state(p)).parts.resistor.a,(await state(p)).parts.resistor.b],suggested,'Clicking the drawn ghost body places its complete displayed footprint');
  await activate(p,S.select);await activate(p,'#build-fit');
  const from=await center(p.locator('[data-build-contact="bb:c6"]')),to=await center(p.locator('[data-build-contact="bb:c12"]')),start=await center(p.locator('[data-build-part="resistor"]')),end={x:start.x+to.x-from.x,y:start.y+to.y-from.y};
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
async function switchProject(p,id,{guided=false}={}){
  await activate(p,'#build-project');await activate(p,`#build-project-options [data-project-id="${id}"]`);
  await p.waitForFunction(id=>location.hash==='#build-'+id&&globalThis.__buildQa?.getState().project===id,id);
  const toggle=p.locator(guided?'#build-guided':'#build-free');if(await toggle.count()&&await toggle.isVisible())await toggle.click();
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
  const spare=await spareStripContact(p,powerContact,beforeBridge);
  assert.ok(Number(await p.locator('[data-build-part="potentiometer"]').evaluate(e=>getComputedStyle(e).opacity))<.9,'Explicit Wire mode exposes the covered contact');
  await wire(p,coveredContact,spare,{pointer:true});
  assert.equal((await state(p)).wires.at(-1).from,coveredContact,'Wire mode reaches the formerly blocked contact without forced clicks');
  assert.equal(Number(await p.locator('[data-build-part="potentiometer"]').evaluate(e=>getComputedStyle(e).opacity)),1,'Committing returns to ordinary opaque editing');
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
function physicalContactsAreUnique(circuit){
  const contacts=[...Object.values(circuit.parts).filter(Boolean).flatMap(part=>Object.values(part).filter(v=>typeof v==='string')),...circuit.wires.flatMap(w=>[w.from,w.to])];
  assert.equal(new Set(contacts).size,contacts.length,'Every physical contact still holds only one lead');
}
async function wireRetryExercises(p){
  await place(p,'led','bb:e6',{pointer:true});await place(p,'resistor','bb:c8',{pointer:true});
  await wire(p,'pin:23','bb:d8',{pointer:true});await wire(p,'pin:GND','rail:L+:16',{pointer:true});
  const original=await state(p),busy=new Set([...Object.values(original.parts).flatMap(part=>Object.values(part).filter(v=>typeof v==='string')),...original.wires.flatMap(w=>[w.from,w.to])]);
  await activate(p,S.wire);await activate(p,'#build-fit');
  await contact(p,'bb:e6',{pointer:true});
  const chosen=await p.locator('.build-contact.is-first').getAttribute('data-build-contact');
  assert.ok(chosen&&!busy.has(chosen),'Occupied LED lead resolves to a genuinely free starting contact');
  assert.notEqual(chosen,'bb:e6');assert.notEqual(await p.locator(S.feedback).getAttribute('data-tone'),'error');
  const relocationText=await p.locator(S.feedback).innerText();assert.match(relocationText,/E6/i);assert.match(relocationText,new RegExp(chosen.slice(3),'i'),'The remapped contact is explicitly explained');
  await contact(p,'bb:e6',{pointer:true});assert.equal(await p.locator('.build-contact.is-first').count(),0,'Clicking the same requested source again cancels');

  await activate(p,S.wire);await contact(p,'pin:GND',{pointer:true});await contact(p,'rail:L+:16',{pointer:true});
  assert.equal((await state(p)).wires.length,2,'Already connected nets do not receive another redundant wire');
  assert.equal(await p.locator('.build-contact.is-first').count(),0,'Already-connected attempt releases its pending source');
  assert.match(await p.locator(S.feedback).innerText(),/already connected/i);assert.notEqual(await p.locator(S.feedback).getAttribute('data-tone'),'error');
  await screenshot(p,'wire-duplicate-recovered');

  // An ordinary next click begins a new wire; no Escape, tool reselection or Reset.
  await contact(p,'bb:a11',{pointer:true});const target=await center(p.locator('[data-build-contact="bb:e6"]'));await p.mouse.move(target.x,target.y);
  const ghost=p.locator('[data-build-ghost="wire"][data-build-targets]');await ghost.waitFor({state:'visible'});
  const preview=(await ghost.getAttribute('data-build-targets')).split(',');
  await contact(p,'bb:e6',{pointer:true});const added=(await state(p)).wires.at(-1);
  assert.deepEqual([added.from,added.to],preview,'Click commits the same free physical contacts shown by the preview');
  assert.equal((await state(p)).wires.length,3);physicalContactsAreUnique(await state(p));
  await activate(p,S.undo);assert.deepEqual(await state(p),original);
  record('Occupied starts, duplicate attempts and ordinary retries recover without Reset; preview and committed contacts agree');

  await activate(p,S.check);assert.equal(await p.locator(S.run).isDisabled(),true);assert.equal(await p.locator(S.feedback).getAttribute('data-tone'),'error');
  await activate(p,S.hint);assert.notEqual(await p.locator(S.feedback).getAttribute('data-tone'),'error','A valid hint clears the stale failure');
  assert.equal(await p.locator('#build-inline-feedback').isVisible(),false);
  const firstGhost=(await p.locator('[data-build-ghost="wire"][data-build-targets]').getAttribute('data-build-targets')).split(',');
  for(const id of firstGhost)await contact(p,id,{pointer:true});
  await p.waitForFunction(old=>{const g=document.querySelector('[data-build-ghost="wire"][data-build-targets]');return g&&g.dataset.buildTargets!==old;},firstGhost.join(','));
  const nextGhost=(await p.locator('[data-build-ghost="wire"][data-build-targets]').getAttribute('data-build-targets')).split(',');
  await screenshot(p,'wire-guidance-next-step');
  for(const id of nextGhost)await contact(p,id,{pointer:true});
  await checkAndRun(p);const complete=await state(p);physicalContactsAreUnique(complete);
  assert.deepEqual(complete.parts,original.parts,'The user’s custom component positions are retained');
  for(const w of original.wires)assert.ok(complete.wires.some(v=>JSON.stringify(v)===JSON.stringify(w)),'Every original wire is retained');
  await screenshot(p,'custom-draft-completed-without-reset');
  record('The reported custom draft completes through automatically advancing hints without resetting, moving parts or deleting original wires');
  await activate(p,S.run);await activate(p,S.wire);await activate(p,'#build-fit');await contact(p,'bb:j25',{pointer:true});
  assert.equal(await p.locator('.build-contact.is-first').count(),1);assert.equal(await p.locator(S.run).isDisabled(),false,'An uncommitted wire does not invalidate the checked circuit');
  await activate(p,S.run);assert.equal(await running(p),true);assert.equal(await p.locator('.build-contact.is-first').count(),0);
  assert.equal(await p.locator('[data-build-ghost="wire"]').count(),0);assert.equal(await p.locator('#build-root').getAttribute('data-tool'),'select');
  assert.deepEqual(await state(p),complete,'Starting Run discards only the unfinished gesture');
  record('Run clears an unfinished wire and enters Select without altering the checked circuit');
}
async function wireBodyPoint(p,id){
  return p.locator(`[data-build-wire="${id}"]`).evaluate(g=>{
    const path=[...g.querySelectorAll('path')].at(-1),length=path.getTotalLength();
    for(const t of [.35,.5,.65,.2,.8]){const q=path.getPointAtLength(length*t).matrixTransform(path.getScreenCTM());if(document.elementFromPoint(q.x,q.y)?.closest('[data-build-wire]')===g)return{x:q.x,y:q.y};}
    return null;
  });
}
async function settleScene(p){
  let previous=null,stable=0;
  for(let i=0;i<35;i++){
    const frame=await p.evaluate(()=>__buildSceneQa.frames());await p.waitForFunction(n=>__buildSceneQa.frames()>n,frame);
    const next=await p.evaluate(()=>__buildSceneQa.endpoint('bb:b7'));
    if(previous&&Math.hypot(next.x-previous.x,next.y-previous.y)<.15)stable++;else stable=0;
    if(stable>=3)return;previous=next;
  }
  assert.fail('3D contact coordinates should settle before a precise drag');
}
async function selectDrawnWire(p,id,{three=false,touch=false}={}){
  if(three){await p.waitForFunction(id=>!!__buildSceneQa.wirePoint(id),id);const point=await p.evaluate(id=>__buildSceneQa.wirePoint(id),id);await p.mouse.click(point.x,point.y);}
  else{const g=p.locator(`[data-build-wire="${id}"]`);if(await g.evaluate(e=>e.classList.contains('is-selected')))return;const point=await wireBodyPoint(p,id);assert.ok(point,'The committed wire has a visible body to select');if(touch){await p.evaluate(()=>{globalThis.__touchTarget=null;document.addEventListener('pointerdown',e=>{globalThis.__touchTarget={x:e.clientX,y:e.clientY,target:e.target.outerHTML.slice(0,500)};},{once:true,capture:true});});await p.touchscreen.tap(point.x,point.y);}else await p.mouse.click(point.x,point.y);assert.equal(await g.evaluate(e=>e.classList.contains('is-selected')),true,'Tapping the visible wire body must select it: '+JSON.stringify({point,target:touch?await p.evaluate(()=>__touchTarget):null}));}
  assert.ok((await state(p)).wires.some(w=>w.id===id),'First body click selects without deleting');
}
async function dragBetween(p,start,end,{touch=false,via=null,onDown=null}={}){
  if(touch){const c=await p.context().newCDPSession(p),point=(x,y)=>[{id:1,x,y,radiusX:7,radiusY:7}];await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(start.x,start.y)});if(onDown)await onDown();const points=via?[via,end]:[end];let from=start;for(const target of points){for(let i=1;i<=12;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(from.x+(target.x-from.x)*i/12,from.y+(target.y-from.y)*i/12)});from=target;}await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
  else{await p.mouse.move(start.x,start.y);await p.mouse.down();if(onDown)await onDown();if(via)await p.mouse.move(via.x,via.y,{steps:10});await p.mouse.move(end.x,end.y,{steps:14});await p.mouse.up();}
}
async function clickAt(p,point,touch=false){if(touch)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);}
async function mobileFirstBodyDrag(p){
  await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();
  const body=await center(p.locator('[data-build-part="resistor"]')),from=await endpointPoint(p,'bb:c6'),to=await endpointPoint(p,'bb:c16'),before=await p.locator('#build-canvas-wrap').boundingBox();
  await dragBetween(p,body,{x:body.x+to.x-from.x,y:body.y+to.y-from.y},{touch:true,onDown:async()=>{const after=await p.locator('#build-canvas-wrap').boundingBox();assert.ok(Math.abs(after.y-before.y)<=1&&Math.abs(after.height-before.height)<=1,'Selecting a part must not move the phone canvas beneath the finger: '+JSON.stringify({before,after}));}});
  assert.equal((await state(p)).parts.resistor.a,'bb:c16');
}
async function blankCanvasPoint(p,three=false){
  if(three){const point=await p.evaluate(()=>__buildSceneQa.blankPoint());assert.ok(point,'A visible empty background remains available for orbiting');return point;}
  const rect=await p.locator('#build-canvas-wrap').boundingBox();
  const point=await p.evaluate(r=>{for(const u of [.95,.05,.85,.15])for(const v of [.1,.9,.25,.75]){const x=r.x+r.width*u,y=r.y+r.height*v,e=document.elementFromPoint(x,y);if(e?.closest('#build-viewport')&&!e.closest('[data-build-contact],[data-build-part],[data-build-wire],[data-build-ghost]'))return{x,y};}return null;},rect);
  assert.ok(point,'A visible empty background remains available for panning');return point;
}
async function cancelDuringDrag(p,start,to,method,{touch=false}={}){
  let session;
  if(touch){session=await p.context().newCDPSession(p);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...start,radiusX:5,radiusY:5}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...to,radiusX:5,radiusY:5}]});}
  else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:10});}
  assert.equal(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination','The held gesture has a real pending source');
  if(method==='Escape')await p.keyboard.press('Escape');else await p.mouse.click(to.x,to.y,{button:'right'});
  assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination','Cancellation immediately removes the pending source');
  if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}else await p.mouse.up();
  assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination','The original pointer-up cannot recreate the cancelled draft');
  assert.equal(await p.locator('[data-build-ghost="wire"]').count(),0,'No stale wire preview remains after cancellation');
}
async function defaultWiringExercises(p,{three=false,touch=false}={}){
  const label=three?(touch?'3D touch':'3D mouse'):(touch?'2D touch':'2D mouse'),empty=await state(p);
  assert.equal(empty.wires.length,0);assert.equal(await p.locator('#build-root').getAttribute('data-tool'),'select');
  await activate(p,'#build-fit',touch);if(three){await activate(p,S.three,touch);await p.locator('#build-scene3d canvas').waitFor();await settleScene(p);}
  if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();
  const point=id=>endpointPoint(p,id,{three}),onDown=async()=>assert.equal(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination','Pressing the visible contact arms the new wire before any movement');
  await dragBetween(p,await point('pin:23'),await point('bb:a6'),{touch,onDown});
  let built=await state(p);assert.equal(built.wires.length,1,'A normal contact drag creates a wire without choosing Wire');assert.deepEqual([built.wires[0].from,built.wires[0].to],['pin:23','bb:a6']);
  assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  if(three){const frame=await p.evaluate(()=>__buildSceneQa.frames());await p.waitForFunction(n=>__buildSceneQa.frames()>n,frame);assert.ok(await p.evaluate(id=>!!__buildSceneQa.wirePoint(id),built.wires[0].id),'The new wire has a rendered selectable 3D body');}
  else assert.equal(await p.locator('[data-build-wire]').count(),1);
  await screenshot(p,'default-wire-'+label.replaceAll(' ','-'));await activate(p,S.undo,touch);assert.deepEqual(await state(p),empty);
  if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();if(three)await settleScene(p);
  await clickAt(p,await point('pin:18'),touch);assert.equal(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  await clickAt(p,await point('bb:j16'),touch);built=await state(p);assert.equal(built.wires.length,1);assert.deepEqual([built.wires[0].from,built.wires[0].to],['pin:18','bb:j16']);
  if(three)await settleScene(p);record(label+' default contact drag and click-click both create visible wires without selecting a tool');

  // Failed gestures must not enter history or leave an invisible half-wire.
  const bad=await blankCanvasPoint(p,three);await dragBetween(p,await point('pin:23'),bad,{touch,onDown});
  assert.deepEqual(await state(p),built);assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  const original=await point('pin:23');await dragBetween(p,original,original,{touch,onDown,via:{x:original.x+20,y:original.y+12}});
  assert.deepEqual(await state(p),built);assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  await activate(p,S.undo,touch);assert.deepEqual(await state(p),empty,'Invalid and original-endpoint drops add no Undo entries');
  if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();if(three)await settleScene(p);
  for(const method of touch?['Escape']:['Escape','right-click']){
    await clickAt(p,await point('pin:18'),touch);await clickAt(p,await point('bb:j16'),touch);const before=await state(p);if(three)await settleScene(p);
    await cancelDuringDrag(p,await point('pin:23'),await point('bb:a6'),method,{touch});assert.deepEqual(await state(p),before);
    await activate(p,S.undo,touch);assert.deepEqual(await state(p),empty,'A cancelled drag adds no Undo entry');
    if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();if(three)await settleScene(p);
  }
  const beforePan=three?await p.evaluate(()=>__buildSceneQa.state().rotation):await p.locator('#build-viewport').getAttribute('viewBox'),background=await blankCanvasPoint(p,three),rect=await p.locator('#build-canvas-wrap').boundingBox();
  await dragBetween(p,background,{x:background.x+(background.x>rect.x+rect.width/2?-45:45),y:background.y+15},{touch});
  assert.deepEqual(await state(p),empty);assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  if(three)await p.waitForFunction(n=>Math.abs(__buildSceneQa.state().rotation-n)>.01,beforePan);else assert.notEqual(await p.locator('#build-viewport').getAttribute('viewBox'),beforePan);
  await activate(p,'#build-fit',touch);if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();if(three)await settleScene(p);
  if(touch){
    const first=await point('bb:f16'),session=await p.context().newCDPSession(p),one={id:1,...first,radiusX:4,radiusY:4},two={id:2,x:first.x+30,y:first.y,radiusX:4,radiusY:4};
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[one]});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[one,two]});
    for(const d of [8,16,24])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...one,x:one.x-d},{...two,x:two.x+d}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
    assert.deepEqual(await state(p),empty,'A second finger changes the contact gesture into pinch without creating a wire');assert.notEqual(await p.locator('#build-root').getAttribute('data-wire-stage'),'destination');
  }
  record(label+' invalid/no-op drops and cancellation preserve Undo; background navigation never creates a wire');
  if(!three){
    await activate(p,'#build-fit',touch);await place(p,'resistor','bb:c6',{pointer:true,touch});const part=(await state(p)).parts.resistor;
    await activate(p,'#build-fit',touch);if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();
    await clickAt(p,await point('pin:23'),touch);await clickAt(p,await point('bb:a6'),touch);
    assert.deepEqual((await state(p)).parts.resistor,part,'Wiring while a part is selected never relocates that part');assert.equal((await state(p)).wires.length,1);
    record(label+' free-contact clicks wire normally while an existing component is selected');
  }
}
async function pickerExercises(p,{touch=false}={}){
  const expected=await p.evaluate(async()=>{const {lessons}=await import('./lessons.js');return ['blink','button','potentiometer'].map(id=>({id,title:lessons.find(l=>l.id===id).title}));});
  assert.equal(await p.locator('#build-project').evaluate(e=>e.tagName),'BUTTON');await activate(p,'#build-project',touch);
  assert.equal(await p.locator('#build-project').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#build-project-options [role="option"]').count(),3);
  for(const project of expected)assert.ok((await p.locator(`#build-project-options [data-project-id="${project.id}"]`).innerText()).includes(project.title),'The picker uses the exact lesson title: '+project.title);
  await screenshot(p,touch?'project-picker-touch':'project-picker-desktop');
  if(!touch){
    await p.keyboard.press('Escape');assert.equal(await p.locator('#build-project').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#build-project').evaluate(e=>e===document.activeElement),true);
    await activate(p,'#build-project');await p.locator('.build-heading p').click();assert.equal(await p.locator('#build-project').getAttribute('aria-expanded'),'false');
    await p.locator('#build-project').focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
    await p.waitForFunction(()=>location.hash==='#build-button'&&__buildQa.getState().project==='button');
    await p.locator('#build-project').focus();await p.keyboard.press('ArrowDown');await p.keyboard.press('End');await p.keyboard.press('Space');await p.waitForFunction(()=>location.hash==='#build-potentiometer'&&__buildQa.getState().project==='potentiometer');
  }else{
    for(const width of [390,320]){await p.setViewportSize({width,height:844});const b=await p.locator('#build-project-options').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width,'Phone menu stays within its viewport');await fits(p,width+'px custom project picker');}
    await activate(p,'#build-project-options [data-project-id="button"]',true);await p.waitForFunction(()=>location.hash==='#build-button'&&__buildQa.getState().project==='button');
  }
  await switchProject(p,'blink');await ready(p);assert.equal(await p.locator('#build-project-options').isVisible(),false);
  assert.ok((await p.locator('#build-project').innerText()).includes(expected[0].title));
  record(touch?'Custom project menu fits 390/320px phones and touch switches the actual route':'Custom project menu uses lesson titles, supports pointer/keyboard selection, and closes with Escape/outside click');
}
async function defaultInteractionSuite(browser,track){
  for(const options of [{},{three:true},{touch:true},{three:true,touch:true}]){
    if(process.env.QA_VIEW==='2d'&&options.three)continue;
    const context=await browser.newContext({viewport:{width:options.touch?390:1366,height:options.touch?844:768},isMobile:!!options.touch,hasTouch:!!options.touch,reducedMotion:'reduce'});await instrument(context);
    const p=await context.newPage();track(p);await p.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(p);
    if(!options.three&&!process.env.QA_SKIP_PICKER){await pickerExercises(p,options);if(options.touch)await p.setViewportSize({width:390,height:844});}
    await defaultWiringExercises(p,options);await context.close();
  }
}
async function wireEndPoint(p,id,end,{three=false}={}){
  if(three){await p.waitForFunction(({id,end})=>!!__buildSceneQa.wireEnd(id,end),{id,end});return p.evaluate(({id,end})=>__buildSceneQa.wireEnd(id,end),{id,end});}
  return center(p.locator(`[data-build-wire-id="${id}"][data-build-wire-end="${end}"]`));
}
async function endpointPoint(p,id,{three=false}={}){
  if(!three)return center(p.locator(`[data-build-contact="${id}"]`));
  const rect=await p.locator('#build-scene3d').boundingBox(),point=await p.evaluate(id=>__buildSceneQa.endpoint(id),id);assert.ok(point?.visible,'The destination contact is visible');return{x:rect.x+point.x,y:rect.y+point.y};
}
async function buildBypassDraft(p,{touch=false}={}){
  await place(p,'led','bb:e5',{pointer:true,touch});await place(p,'resistor','bb:e7',{pointer:true,touch});
  await wire(p,'pin:23','bb:b5',{pointer:true,touch});await wire(p,'bb:a6','pin:GND',{pointer:true,touch});
  return state(p);
}
async function endpointEditingExercises(p,{three=false,touch=false}={}){
  const original=await buildBypassDraft(p,{touch}),source=original.wires.find(w=>w.from==='pin:23');
  await activate(p,S.select,touch);await activate(p,'#build-fit',touch);if(three){await activate(p,S.three);await p.locator('#build-scene3d canvas').waitFor();}
  if(three)await settleScene(p);
  if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();
  await selectDrawnWire(p,source.id,{three,touch});
  const start=await wireEndPoint(p,source.id,'to',{three}),target=await endpointPoint(p,'bb:b7',{three});
  const view=three?await p.evaluate(()=>__buildSceneQa.state().rotation):await p.locator('#build-viewport').getAttribute('viewBox');
  await dragBetween(p,start,target,{touch});let moved=(await state(p)).wires.find(w=>w.id===source.id);
  assert.deepEqual(moved,{...source,to:'bb:b7'},'Only the dragged endpoint changes; identity, color and fixed end stay');
  if(three)assert.ok(Math.abs((await p.evaluate(()=>__buildSceneQa.state().rotation))-view)<.01);else assert.equal(await p.locator('#build-viewport').getAttribute('viewBox'),view,'Endpoint drag does not pan the board');
  const handle=await wireEndPoint(p,source.id,'to',{three});await dragBetween(p,handle,handle,{touch,via:{x:handle.x+18,y:handle.y+10}});
  assert.deepEqual((await state(p)).wires.find(w=>w.id===source.id),moved,'Returning to the original endpoint is a no-op');
  await activate(p,S.undo,touch);assert.deepEqual(await state(p),original,'No-op adds no Undo entry');

  await activate(p,S.select,touch);if(touch)await p.locator('#build-canvas-wrap').scrollIntoViewIfNeeded();if(three)await settleScene(p);await selectDrawnWire(p,source.id,{three,touch});await dragBetween(p,await wireEndPoint(p,source.id,'to',{three}),await endpointPoint(p,'bb:b7',{three}),{touch});
  const canvas=await p.locator('#build-canvas-wrap').boundingBox(),invalid={x:canvas.x+canvas.width-8,y:canvas.y+canvas.height-8};
  await dragBetween(p,await wireEndPoint(p,source.id,'to',{three}),invalid,{touch});assert.deepEqual((await state(p)).wires.find(w=>w.id===source.id),{...source,to:'bb:b7'},'Invalid drop rolls back');
  await activate(p,S.undo,touch);assert.deepEqual(await state(p),original,'Invalid drop adds no Undo entry');
  await screenshot(p,`endpoint-${three?'3d':touch?'touch':'2d'}-restored`);
  record(`${three?'3D':touch?'Touch':'2D'} wire-end drag preserves the fixed end; original/no-drop and invalid-drop cases preserve Undo`);
  return original;
}
async function repeatBodyDeleteExercises(p,original){
  const source=original.wires.find(w=>w.from==='pin:23');await activate(p,S.select);await activate(p,'#build-fit');
  await selectDrawnWire(p,source.id);const body=await wireBodyPoint(p,source.id);await p.mouse.click(body.x,body.y);
  assert.equal((await state(p)).wires.some(w=>w.id===source.id),false,'Second click on the selected wire body deletes it');
  await activate(p,S.undo);assert.deepEqual(await state(p),original);
  await activate(p,S.select);const part=p.locator('[data-build-part="led"]');await part.click();assert.ok((await state(p)).parts.led);await part.click();
  assert.equal((await state(p)).parts.led,null,'Second click on the selected part body deletes it');await activate(p,S.undo);assert.deepEqual(await state(p),original);
  await activate(p,S.select);await part.click();const start=await center(part),a=await endpointPoint(p,'bb:e5'),b=await endpointPoint(p,'bb:e12');await dragBetween(p,start,{x:start.x+b.x-a.x,y:start.y+b.y-a.y});
  assert.equal((await state(p)).parts.led.a,'bb:e12','Dragging an already selected body moves it instead of deleting it');await activate(p,S.undo);assert.deepEqual(await state(p),original);
  record('Repeated body clicks delete selected parts/wires directly; dragging an already selected body does not delete it');
}
async function activeCameraDragExercises(p){
  const original=await buildBypassDraft(p),source=original.wires.find(w=>w.from==='pin:23');
  await activate(p,S.three);await p.locator('#build-scene3d canvas').waitFor();
  await activate(p,S.check);await p.locator('#build-repair').waitFor({state:'visible'});
  const start=await wireEndPoint(p,source.id,'to',{three:true});
  const moving=await p.evaluate(()=>__buildSceneQa.cameraMoving());
  assert.equal(moving,true,'The user can grab an endpoint while diagnostic framing is still moving');
  await p.mouse.move(start.x,start.y);await p.mouse.down();
  assert.equal(await p.evaluate(()=>__buildSceneQa.dragLocksCamera()),true,'A real pointer grabs the selected wire endpoint');
  const camera=await p.evaluate(()=>__buildSceneQa.camera()),frame=await p.evaluate(()=>__buildSceneQa.frames());
  await p.waitForFunction(n=>__buildSceneQa.frames()>=n+4,frame);
  assert.deepEqual(await p.evaluate(()=>__buildSceneQa.camera()),camera,'Camera, frustum and world yaw stay fixed during a held drag');
  const target=await endpointPoint(p,'bb:b7',{three:true});await p.mouse.move(target.x,target.y,{steps:14});
  const draggedFrame=await p.evaluate(()=>__buildSceneQa.frames());await p.waitForFunction(n=>__buildSceneQa.frames()>=n+3,draggedFrame);
  assert.deepEqual(await p.evaluate(()=>__buildSceneQa.camera()),camera,'Moving the endpoint does not resume camera easing');
  await p.mouse.up();assert.equal(await p.evaluate(()=>__buildSceneQa.dragLocksCamera()),false);
  assert.deepEqual((await state(p)).wires.find(w=>w.id===source.id),{...source,to:'bb:b7'});
  await screenshot(p,'3d-immediate-drag');record('Grabbing a 3D wire during diagnostic framing freezes the camera and drops onto the visible intended hole');
}
async function mobileGuideExercises(p){
  await activate(p,'#build-guided',true);await activate(p,S.reset,true);
  assert.equal(await p.locator('#build-guide').getAttribute('data-step'),'rows');
  for(const width of [390,320]){
    await p.setViewportSize({width,height:844});await activate(p,'#build-guide-show',true);
    const canvas=await p.locator('#build-canvas-wrap').boundingBox();
    assert.ok(canvas.y>=-1&&canvas.y+canvas.height<=845,'Show on board reveals the complete '+width+'px phone canvas');
    assert.ok(await p.locator('[data-build-copper="strip:L:9"]').count());await fits(p,width+'px Guided build');await screenshot(p,'mobile-guided-'+width);
  }
  await activate(p,'#build-guide-next',true);await activate(p,'#build-guide-next',true);await activate(p,'#build-guide-next',true);
  assert.equal(await p.locator('#build-guide').getAttribute('data-step'),'part-resistor');await activate(p,'#build-guide-show',true);
  const ghost=await center(p.locator('[data-build-ghost="resistor"]'));assert.ok(ghost.y>0&&ghost.y<844);await p.touchscreen.tap(ghost.x,ghost.y);
  assert.deepEqual((await state(p)).parts.resistor,{a:'bb:c6',b:'bb:c9',ohms:330});await activate(p,'#build-guide-next',true);
  await activate(p,S.reset,true);assert.equal(await p.locator('#build-guide').getAttribute('data-step'),'rows');await activate(p,S.undo,true);
  assert.ok((await state(p)).parts.resistor);record('Phone guidance reveals its actual copper/ghost diagram, accepts a ghost-body tap and restarts at Rows after Reset');
}
async function visibleContact(p,label){
  const id=await p.evaluate(label=>[...document.querySelectorAll('[data-build-contact]')].find(e=>e.querySelector('title')?.textContent.replace(/\s*· occupied$/,'').trim()===label)?.dataset.buildContact,label);
  assert.ok(id,'The diagram exposes the contact named in the instruction: '+label);await contact(p,id,{pointer:true});
}
async function walkthroughExercises(p,project){
  await activate(p,'#build-guided');await p.locator('#build-guide').waitFor({state:'visible'});
  const transcript=[];let usedGhost=false,usedPrintedWireLabels=false;
  for(let index=0;index<20;index++){
    const id=await p.locator('#build-guide').getAttribute('data-step'),title=await p.locator('#build-guide-title').innerText(),task=await p.locator('#build-guide-task').innerText(),why=await p.locator('#build-guide-why').innerText();
    assert.ok(task.length>20&&why.length>30,'Each step states an action and the electrical reason');
    let code='';if(await p.locator('#build-guide-code').isVisible()){if(!await p.locator('#build-guide-code').evaluate(e=>e.open))await p.locator('#build-guide-code summary').click();code=await p.locator('#build-guide-code').innerText();}
    transcript.push({id,title,task,why,code});await activate(p,'#build-guide-show');
    if(id==='rows'){
      assert.match(task,/A9.*B9.*C9.*D9.*E9/);assert.match(why,/same metal strip/i);
      assert.ok(await p.locator('[data-build-copper="strip:L:9"]').count());
      if(project==='blink'){await activate(p,S.three);await activate(p,'#build-guide-show');await p.waitForFunction(()=>__buildSceneQa.copper().includes('row:9:a-e'));await settleScene(p);await screenshot(p,'guide-rows-3d');await activate(p,S.top);}
    }
    if(id==='gap'){assert.match(task,/not connected/i);assert.ok(await p.locator('[data-build-copper]').count()>=3);await screenshot(p,project+'-guide-gap');}
    if(id==='rails'){assert.match(why,/not power sources|no power source/i);assert.ok(await p.locator('[data-build-copper^="rail:"]').count()>=2);}
    if(id==='run')break;
    if(await p.locator('#build-guide-do').isVisible()){
      const ghost=p.locator('[data-build-ghost]').first(),kind=await ghost.getAttribute('data-build-ghost');
      if(kind!=='wire'){const point=await center(ghost);await p.mouse.click(point.x,point.y);usedGhost=true;}
      else{const match=task.match(/^Connect (.+?) → (.+?)\./);assert.ok(match,'A wire step names both endpoints in its visible instruction');await visibleContact(p,match[1]);await visibleContact(p,match[2]);usedPrintedWireLabels=true;}
      assert.equal(await p.locator('#build-guide-title').innerText(),title,'Completing an action leaves its explanation visible until Next');
    }
    assert.equal(await p.locator('#build-guide-next').isDisabled(),false,'The visible action completes the current step');
    await activate(p,'#build-guide-next');assert.notEqual(await p.locator('#build-guide-title').innerText(),title);
  }
  assert.equal(transcript.at(-1)?.id,'run','The walkthrough reaches its Check/Run instructions');
  const prose=transcript.map(s=>s.task+' '+s.why+' '+s.code).join('\n');
  assert.match(prose,/Series means one continuous path through both parts/i);assert.match(prose,/GND.*return path|return path.*GND/is);
  if(project==='button'){assert.match(prose,/permanently|always joined/i);assert.match(prose,/INPUT_PULLUP/);assert.match(prose,/LOW/);}
  if(project==='potentiometer'){assert.match(prose,/middle leg|middle terminal/i);assert.match(prose,/GPIO34/);assert.match(prose,/does not power/i);}
  if(project!=='blink')assert.ok(usedGhost&&usedPrintedWireLabels,'A new guided project is built by clicking the drawn parts and reading printed wire endpoints');
  guideTranscripts[project]=transcript;
  await activate(p,S.check);assert.equal(await p.locator(S.run).isDisabled(),false);await activate(p,S.run);assert.equal(await running(p),true);
  await fits(p,project+' Guided build');await screenshot(p,project+'-guided-complete');
  record(`${project} walkthrough visibly explains strips, rails and the actual current path; its printed instructions lead to a working build`);
}
async function repairBypassExercises(p,original){
  await activate(p,S.check);assert.equal(await p.locator(S.run).isDisabled(),true);await p.locator('#build-repair').waitFor({state:'visible'});
  const text=await p.locator('#build-repair').innerText();assert.match(text,/resistor/i);assert.match(text,/LED|current/i);
  const snapshots=[];
  for(let i=0;i<4&&await p.locator('#build-repair-show').isVisible();i++){
    snapshots.push({title:await p.locator('#build-repair-title').innerText(),why:await p.locator('#build-repair-why').innerText()});
    await activate(p,'#build-repair-show');await p.locator('[data-build-ghost="wire"]').waitFor({state:'visible'});await screenshot(p,'bypass-repair-'+i);await activate(p,'#build-repair-do');
  }
  const repaired=await state(p),source=original.wires.find(w=>w.from==='pin:23'),originalReturn=original.wires.find(w=>w.to==='pin:GND'),afterSource=repaired.wires.find(w=>w.id===source.id);
  assert.deepEqual(repaired.parts,original.parts);assert.ok(repaired.wires.some(w=>JSON.stringify(w)===JSON.stringify(originalReturn)));
  assert.equal(afterSource.from,source.from);assert.notEqual(afterSource.to,source.to);assert.equal(afterSource.color,source.color);physicalContactsAreUnique(repaired);
  guideTranscripts.repair=snapshots;await activate(p,S.check);assert.equal(await p.locator(S.run).isDisabled(),false);
  if(await p.locator('#build-repair-close').isVisible())await activate(p,'#build-repair-close');
  await walkthroughExercises(p,'blink');
  record('The bypassed LED draft is repaired through visible previewed steps, preserving both parts, the return wire and the fixed source endpoint');
}
async function runningBodiesStayInteractive(p,project){
  const before=await state(p),kind=project==='button'?'button':'potentiometer';
  if(project==='button')for(let i=0;i<2;i++){
    const point=await center(p.locator('[data-build-part="button"]'));await p.mouse.move(point.x,point.y);await p.mouse.down();
    await p.waitForFunction(()=>Number(document.querySelector('.build-led-bulb')?.dataset.brightness)>.9);await p.mouse.up();
    await p.waitForFunction(()=>Number(document.querySelector('.build-led-bulb')?.dataset.brightness)===0);
  }else{
    const point=await center(p.locator('[data-build-part="potentiometer"]'));await dragBetween(p,point,{x:point.x+80,y:point.y});
    await p.waitForFunction(()=>Number(document.querySelector('.build-led-bulb')?.dataset.brightness)>.8);
    const next=await center(p.locator('[data-build-part="potentiometer"]'));await p.mouse.click(next.x,next.y);await p.mouse.click(next.x,next.y);
  }
  assert.equal(await running(p),true);assert.deepEqual(await state(p),before);assert.ok((await state(p)).parts[kind]);
  record(`Repeated clicks/drags on the running ${kind} operate the device instead of deleting it`);
}
async function guidanceSuite(p){
  assert.equal(await p.locator('#build-guided').getAttribute('aria-pressed'),'true','A fresh visitor starts with Guided build');
  await activate(p,'#build-free');const original=await buildBypassDraft(p);await repairBypassExercises(p,original);
  for(const project of ['button','potentiometer']){await switchProject(p,project,{guided:true});await walkthroughExercises(p,project);await runningBodiesStayInteractive(p,project);}
}
function writeReport(){
  for(const name of ['failure.json','failure.png'])fs.rmSync(path.join(out,name),{force:true});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({result:'passed',checks,errors,guideTranscripts,output:out},null,2));
  console.log(JSON.stringify({result:'passed',checks:checks.length,errors,output:out}));
}
async function main(){
  await new Promise(r=>server.listen(4194,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle']});
  let page;
  try{
    const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(ctx);
    page=await ctx.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page,{preserve:process.env.QA_CASE==='guidance'});
    if(process.env.QA_CASE==='wire-retry'){await wireRetryExercises(page);assert.deepEqual(errors,[]);writeReport();return;}
    if(process.env.QA_CASE==='editing'){
      const original=await endpointEditingExercises(page);await repeatBodyDeleteExercises(page,original);
      const sceneContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(sceneContext);page=await sceneContext.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await endpointEditingExercises(page,{three:true});
      const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(touchContext);page=await touchContext.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await endpointEditingExercises(page,{touch:true});
      assert.deepEqual(errors,[]);writeReport();return;
    }
    if(process.env.QA_CASE==='camera'){await page.emulateMedia({reducedMotion:'no-preference'});await activeCameraDragExercises(page);assert.deepEqual(errors,[]);writeReport();return;}
    if(process.env.QA_CASE==='default-wiring'){await ctx.close();await defaultInteractionSuite(browser,p=>{page=p;collect(p);});assert.deepEqual(errors,[]);writeReport();return;}
    if(process.env.QA_CASE==='mobile-drag'){
      await ctx.close();const mobileContext=await browser.newContext({viewport:{width:320,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(mobileContext);page=await mobileContext.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await assemble(page,{touch:true});await checkAndRun(page,{touch:true});await activate(page,S.select,true);await activate(page,'#build-fit',true);await mobileFirstBodyDrag(page);record('The first body drag keeps a narrow phone canvas stable and reaches its intended row');assert.deepEqual(errors,[]);writeReport();return;
    }
    if(process.env.QA_CASE==='touch-endpoint'){
      await ctx.close();const touchContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(touchContext);page=await touchContext.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await endpointEditingExercises(page,{touch:true});assert.deepEqual(errors,[]);writeReport();return;
    }
    if(process.env.QA_CASE==='guidance'){await guidanceSuite(page);assert.deepEqual(errors,[]);writeReport();return;}
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
    await wire(page,'pin:GND2','bb:c6');assert.equal((await state(page)).wires.length,3);physicalContactsAreUnique(await state(page));
    await activate(page,S.check);assert.equal(await page.locator(S.run).isDisabled(),true,'Physical remapping does not hide an electrical short');
    await activate(page,S.undo);assert.deepEqual(await state(page),beforeOccupied);
    await wire(page,'pin:23','bb:a6');assert.equal((await state(page)).wires.length,2);
    assert.equal(await page.locator('.build-contact.is-first').count(),0);assert.match(await page.locator(S.feedback).innerText(),/already connected/i);
    record('Occupied contacts resolve to spare holes, shorts remain rejected, and duplicate connections release their source');

    // Pointer selection and movement exercise the actual SVG hit targets.
    const beforeMove=await state(page);await activate(page,S.select);await selectedPart(page,'resistor');await page.locator('#build-fit').click();
    const bodyMove=await center(page.locator('[data-build-part="resistor"]')),oldAnchor=await endpointPoint(page,'bb:c6'),newAnchor=await endpointPoint(page,'bb:c16');await dragBetween(page,bodyMove,{x:bodyMove.x+newAnchor.x-oldAnchor.x,y:bodyMove.y+newAnchor.y-oldAnchor.y});
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
    await activate(m,S.top,true);await activate(m,S.select,true);await activate(m,'#build-fit',true);
    await mobileFirstBodyDrag(m);
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
    const retry=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(retry);
    const r=await retry.newPage();page=r;collect(r);await r.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(r);await wireRetryExercises(r);
    // New novice editing and instruction regressions each start with a clean draft.
    await ctx.close();await mobile.close();await corrupt.close();await fallback.close();await retry.close();
    const editing=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(editing);
    page=await editing.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);const original=await endpointEditingExercises(page);await repeatBodyDeleteExercises(page,original);await editing.close();
    const endpoint3d=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(endpoint3d);
    page=await endpoint3d.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await endpointEditingExercises(page,{three:true});await endpoint3d.close();
    const cameraContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'no-preference'});await instrument(cameraContext);
    page=await cameraContext.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await activeCameraDragExercises(page);await cameraContext.close();
    const phoneEdit=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(phoneEdit);
    page=await phoneEdit.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page);await endpointEditingExercises(page,{touch:true});await mobileGuideExercises(page);await phoneEdit.close();
    const guided=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});await instrument(guided);
    page=await guided.newPage();collect(page);await page.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(page,{preserve:true});await guidanceSuite(page);
    await guided.close();await defaultInteractionSuite(browser,p=>{page=p;collect(p);});
    assert.deepEqual(errors,[]);writeReport();
  }catch(e){if(page)await screenshot(page,'failure').catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(e),checks,errors},null,2));throw e;}
  finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
