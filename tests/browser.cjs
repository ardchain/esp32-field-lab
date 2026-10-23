const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist'),out=process.env.QA_OUTPUT||'/tmp/esp32-revision-qa';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+'/')&&f!==root){res.writeHead(403);return res.end();}if(f===root)f+='/index.html';fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf'})[path.extname(f)]||'application/octet-stream');res.end(data);});});
// Test-only instrumentation is inserted into the served module. Production has no test global.
const instrumentation=`
 globalThis.__labScene={
  state:()=>({lesson,value,running,pressed,tilt:world.rotation.x,yaw:rotation,zoom:zoomLevel,transitioning:!!transition,gesture:gesture?.action,pointerDown:!!pointerDown}),
  points:(onlyPart)=>{
   world.updateMatrixWorld(true);camera.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect(),found=[];
   for(const o of meshes){if(onlyPart&&o.userData.part!==onlyPart)continue;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
    for(const f of [[.5,.5,.5],[.5,1,.5],[0,.5,.5],[1,.5,.5],[.5,.5,0],[.5,.5,1]]){
     const q=new THREE.Vector3(b.min.x+(b.max.x-b.min.x)*f[0],b.min.y+(b.max.y-b.min.y)*f[1],b.min.z+(b.max.z-b.min.z)*f[2]).applyMatrix4(o.matrixWorld).project(camera);
     const x=r.x+(q.x+1)*r.width/2,y=r.y+(1-q.y)*r.height/2,h=hit({clientX:x,clientY:y}),a=interaction(h);
     if(h&&(onlyPart?h.object.userData.part===onlyPart:!!a)){const key=onlyPart||a.action+':'+a.note;if(!found.some(v=>v.key===key))found.push({key,x,y,action:a?.action,kind:a?.kind,note:a?.note,part:h.object.userData.part});}
    }
   }return found;
  },
  bounds:()=>{let maxX=0,maxY=0;world.updateMatrixWorld(true);camera.updateMatrixWorld(true);for(const parent of [board,circuit])parent.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(camera);maxX=Math.max(maxX,Math.abs(q.x));maxY=Math.max(maxY,Math.abs(q.y));}});return {maxX,maxY};}
 };
`;
async function instrument(ctx){await ctx.route('**/scene.js',async route=>{const source=fs.readFileSync(path.join(root,'scene.js'),'utf8');await route.fulfill({contentType:'text/javascript',body:source.replace("  externalSetup('board');resize();",instrumentation+"  externalSetup('board');resize();")});});}
async function settle(p,id){await p.waitForFunction(id=>document.querySelector('#scene').dataset.lesson===id&&document.querySelector('#scene').dataset.transitioning==='false',id);await p.waitForTimeout(160);}
async function choose(p,id){await p.evaluate(id=>location.hash=id,id);await settle(p,id);await p.locator('#scene canvas').scrollIntoViewIfNeeded();}
async function bounds(p,label){const b=await p.evaluate(()=>__labScene.bounds());assert.ok(b.maxX<1&&b.maxY<1,label+' fits '+JSON.stringify(b));}
(async()=>{
await new Promise(r=>server.listen(4181,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await instrument(ctx);const p=await ctx.newPage();const errors=[];const collect=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text())});};collect(p);
try{
await p.goto('http://127.0.0.1:4181',{waitUntil:'networkidle'});await settle(p,'board');
assert.equal(await p.locator('#lesson-cards .lesson-card').count(),16);assert.equal(await p.locator('#labels-button').getAttribute('aria-pressed'),'false');
assert.ok(await p.locator('.lesson-shelf').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('.workbench').getBoundingClientRect().top));
await p.screenshot({path:out+'/desktop.png',fullPage:true});
const data=await p.evaluate(async()=>{const {lessons}=await import('./lessons.js');return lessons.map(x=>({id:x.id,answer:x.question.answer,control:x.control,learning:x.learning}));});
const constantNames={blink:'INTERVAL_MS',rgb:'HUE_DEGREES',sound:'FREQUENCY_HZ',motor:'DUTY',servo:'TARGET_ANGLE',stepper:'TARGET_DEGREES'};
for(const l of (process.env.QA_SKIP_LESSONS?[]:data)){
 await choose(p,l.id);assert.ok(l.learning.concepts.length>=2);assert.ok(l.learning.experiment.prediction);await bounds(p,l.id);
 for(const tab of ['learn','pinout','code','overview']){await p.locator(`[data-tab="${tab}"]`).click();assert.ok((await p.locator('#lesson-content').innerText()).length>50,l.id+' '+tab);}
 await p.locator('#scene canvas').scrollIntoViewIfNeeded();
 const points=await p.evaluate(()=>__labScene.points());assert.ok(points.length,l.id+' has physical controls');const t=points.find(x=>x.note===4)||points[0];
 await p.mouse.move(t.x,t.y);await p.mouse.down();
 if(t.kind==='drag')await p.mouse.move(t.x+48,t.y,{steps:5});
 if(t.kind==='hold'){
  const st=await p.evaluate(()=>__labScene.state());assert.ok(st.running,l.id+' hold autostarts');
  if(['button','piano'].includes(l.id))assert.equal(st.pressed,true);
  if(l.id==='light')assert.equal(st.value,0);if(l.id==='force')assert.ok(st.value>70);
 }
 await p.mouse.up();assert.equal(await p.locator('#run-label').innerText(),'Stop simulation',l.id+' interaction autostarts');
 const st=await p.evaluate(()=>__labScene.state());if(['button','piano'].includes(l.id))assert.equal(st.pressed,false);if(l.id==='force')assert.equal(st.value,0);if(l.id==='light')assert.equal(st.value,l.control.value);
 if(l.control&&l.id!=='piano'){
  await p.locator('#experiment-value').fill(String(l.control.max));await p.locator('#experiment-value').dispatchEvent('input');
  assert.ok((await p.locator('#value-output').innerText()).includes(String(l.control.max)));
  if(constantNames[l.id]){await p.locator('[data-tab="code"]').click();const n=l.id==='motor'?255:l.control.max;assert.ok((await p.locator('pre code').innerText()).includes(`const int ${constantNames[l.id]} = ${n};`),'Sketch follows '+l.id);await p.locator('[data-tab="overview"]').click();}
 }
 await p.locator('#run-button').click();assert.equal(await p.locator('#run-label').innerText(),'Run simulation');
 await p.locator('#view-schematic').click();assert.equal(await p.locator('#schematic').isVisible(),true);await p.locator('#view-3d').click();
 console.log('PASS lesson + physical interaction + material '+l.id);
}
// Regression: stale held-device releases must not mutate or start another lesson.
await choose(p,'force');let target=(await p.evaluate(()=>__labScene.points()))[0];await p.mouse.move(target.x,target.y);await p.mouse.down();await p.evaluate(()=>document.querySelector('#next-lesson-button').click());await settle(p,'wifi');await p.mouse.up();assert.equal(await p.locator('#run-label').innerText(),'Run simulation');assert.equal((await p.evaluate(()=>__labScene.state())).pressed,false);
// Camera vertical drag, all yaw angles and maximal zoom keep geometry visible.
await choose(p,'plant');let canvas=await p.locator('#scene canvas').boundingBox();await p.mouse.move(canvas.x+10,canvas.y+15);await p.mouse.down();await p.mouse.move(canvas.x+10,canvas.y+220,{steps:6});await p.mouse.up();assert.equal((await p.evaluate(()=>__labScene.state())).tilt,0);
await p.locator('#scene canvas').focus();for(let j=0;j<4;j++){for(let i=0;i<10;i++)await p.keyboard.press('ArrowRight');await p.waitForTimeout(500);await bounds(p,'rotated plant '+j);}for(let i=0;i<5;i++)await p.locator('#zoom-in').click();await p.waitForTimeout(400);await bounds(p,'maximum zoom');await p.screenshot({path:out+'/plant-rotated.png',fullPage:true});await p.locator('#reset-view').click();await p.waitForTimeout(500);
// Real mesh inspection and quiz completion survive reload.
await choose(p,'board');target=(await p.evaluate(()=>__labScene.points('module')))[0];assert.ok(target);await p.mouse.move(target.x,target.y);assert.equal(await p.locator('#hover-tip').isVisible(),true);await p.mouse.click(target.x,target.y);assert.equal(await p.locator('#inspector').isVisible(),true);await p.locator('#inspector .close').click();
await p.locator('[data-tab="learn"]').click();await p.locator('#check-understanding').click();await p.locator(`[data-answer="${data[0].answer}"]`).click();assert.ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('field-lab-progress')).includes('board')));await p.locator('#close-dialog').click();await p.reload({waitUntil:'networkidle'});await settle(p,'board');assert.ok((await p.locator('#progress-label').innerText()).startsWith('1'));
// Mobile touch controls, navigation and narrow layouts.
const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await instrument(mobile);const m=await mobile.newPage();collect(m);await m.goto('http://127.0.0.1:4181/#plant',{waitUntil:'networkidle'});await settle(m,'plant');
for(const width of [320,390,768]){
 await m.setViewportSize({width,height:844});await m.waitForTimeout(200);assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth),width,'No overflow '+width);assert.equal(await m.locator('#previous-lesson').isVisible(),true);assert.equal(await m.locator('#choose-lesson').isVisible(),true);await bounds(m,'mobile'+width);
 if(width===390){target=(await m.evaluate(()=>__labScene.points()))[0];await m.touchscreen.tap(target.x,target.y);assert.equal(await m.locator('#run-label').innerText(),'Stop simulation');await m.screenshot({path:out+'/mobile.png',fullPage:true});
  await m.locator('#fullscreen-button').tap();let expanded=await m.locator('.scene-panel').boundingBox();assert.ok(expanded.height>800&&expanded.width<=390,'Expanded mobile fills viewport');await bounds(m,'expanded mobile');await m.locator('#fullscreen-button').tap();
  await m.evaluate(()=>scrollTo(0,0));const touchRect=await m.locator('#scene canvas').boundingBox(),cdp=await mobile.newCDPSession(m);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchRect.x+25,y:touchRect.y+touchRect.height-30}]});for(let j=1;j<=5;j++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchRect.x+25,y:touchRect.y+touchRect.height-30-j*28}]});await m.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await m.waitForTimeout(200);assert.ok(await m.evaluate(()=>scrollY)>50,'Vertical swipe on canvas scrolls page');await m.evaluate(()=>scrollTo(0,0));
  await m.locator('#choose-lesson').tap();await m.locator('#dialog [data-lesson="servo"]').tap();await settle(m,'servo');assert.ok(await m.evaluate(()=>scrollY<150));await m.locator('#previous-lesson').tap();await settle(m,'temperature');}
}
// Full-motion transitions and fast interruptions.
await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>location.hash='plant');await p.waitForFunction(()=>document.querySelector('#scene').dataset.transitioning==='true');await p.waitForTimeout(320);await p.screenshot({path:out+'/assembly.png',fullPage:true});await settle(p,'plant');
await p.evaluate(()=>{document.querySelector('#previous-lesson').click();document.querySelector('#previous-lesson').click();document.querySelector('#next-lesson-button').click();});await settle(p,'stepper');await bounds(p,'rapid-switch');
assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',lessons:process.env.QA_SKIP_LESSONS?0:data.length,widths:[1440,320,390,768],errors,output:out}));
}catch(e){await p.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
