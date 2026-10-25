// End-to-end assembly checks through the same controls used by visitors.
// Test-only wrappers observe state; they never perform assembly actions.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
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
      state:()=>({running,buildState,emission:anim.led?.emissiveIntensity,geometryCount:geometries.size}),
      bounds:()=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);let maxX=0,maxY=0;for(const parent of [board,circuit])parent.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera);maxX=Math.max(maxX,Math.abs(q.x));maxY=Math.max(maxY,Math.abs(q.y));}});return{maxX,maxY};},
      point:kind=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect(),candidates=[];circuit.traverse(o=>{if(o.isMesh&&o.userData.buildPart===kind)candidates.push(o);});for(const o of candidates){o.geometry.computeBoundingBox();const q=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld).project(camera),x=r.left+(q.x+1)*r.width/2,y=r.top+(1-q.y)*r.height/2;if(x<r.left||x>r.right||y<r.top||y>r.bottom)continue;const result=hit({clientX:x,clientY:y});if(result?.object.userData.buildPart===kind)return{x,y};}return null;},
      partSize:kind=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;circuit.traverse(o=>{if(!o.isMesh||o.userData.buildPart!==kind)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera);minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);}});return Math.hypot(maxX-minX,maxY-minY);},
      targets:()=>{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);return buildHighlightTargets.flatMap(id=>buildTargetEndpoints(id).map(buildEndpointPosition).filter(Boolean).map(p=>{const q=new THREE.Vector3(...p).applyMatrix4(world.matrixWorld).project(camera);return{id,x:q.x,y:q.y};}));}
    };}\n`;
    await route.fulfill({contentType:'text/javascript',body:source.replace(anchor,observe+anchor)});
  });
}
function collect(page,{allowWebGLFailure=false}={}){
  page.on('pageerror',e=>errors.push(e.message));
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
  led:'[data-build-tool="led"]',resistor:'[data-build-tool="resistor"]',wire:'[data-build-tool="wire"]',
  use:'#build-use-contact',check:'#build-check',run:'#build-run',
  undo:'#build-undo',reset:'#build-reset',flip:'#build-flip',remove:'#build-remove',
  top:'#build-top',three:'#build-3d',back:'#build-exit',hint:'#build-hint',feedback:'#build-feedback',
};
async function activate(p,selector,touch=false){const l=p.locator(selector);if(touch)await l.tap();else await l.click();}
async function contact(p,id,{touch=false,keyboard=false}={}){
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
async function wire(p,from,to,options={}){await activate(p,S.wire,options.touch);await contact(p,from,options);await contact(p,to,options);}
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
    await assemble(page,{keyboard:true});await checkAndRun(page);await screenshot(page,'desktop-success');record('Keyboard contact picker builds and runs Blink');

    // Keyboard shortcuts must not navigate or start the hidden lesson.
    await page.locator('.build-heading h1').click();await page.keyboard.press(']');await page.keyboard.press('[');await page.keyboard.press('r');await page.keyboard.press('Space');
    assert.ok(page.url().endsWith('#build-blink'));assert.equal(await page.locator('#lesson-main').isVisible(),false);
    assert.equal(await page.locator('#run-label').textContent(),'Run simulation');record('Build isolates lesson shortcuts');

    // Same saved circuit is rendered and blinking in the real 3D renderer.
    await page.locator(S.three).click();await page.locator('#build-scene3d canvas').waitFor();
    await page.waitForFunction(()=>globalThis.__buildSceneQa?.state().running===true);
    await page.waitForFunction(()=>__buildSceneQa.state().emission>1);
    await page.waitForFunction(()=>__buildSceneQa.state().emission<.1);
    const uiCircuit=await state(page);assert.deepEqual(await page.evaluate(()=>__buildSceneQa.state().buildState),{parts:uiCircuit.parts,wires:uiCircuit.wires,interval:uiCircuit.interval});
    const b=await page.evaluate(()=>__buildSceneQa.bounds());assert.ok(b.maxX<1&&b.maxY<1,'3D model fits '+JSON.stringify(b));
    const ledWholeSize=await page.evaluate(()=>__buildSceneQa.partSize('led'));
    await screenshot(page,'desktop-3d-running');record('3D build fits and LED actually blinks');
    await page.waitForFunction(()=>!!__buildSceneQa.point('led'));
    const ledPoint=await page.evaluate(()=>__buildSceneQa.point('led'));await page.mouse.click(ledPoint.x,ledPoint.y);
    assert.equal(await page.locator('#build-root').getAttribute('data-tool'),'led');assert.equal(await page.locator(S.remove).isVisible(),true);
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

    // Touch completes the same task. The contact picker avoids tiny target dependence.
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(mobile);
    const m=await mobile.newPage();page=m;collect(m);await m.goto(origin+'#build-blink',{waitUntil:'networkidle'});await ready(m);
    await assemble(m,{touch:true});await checkAndRun(m,{touch:true});await fits(m,'390px touch');await screenshot(m,'mobile-success');
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
