import { createScene } from './scene.js';
import { initialState, normalizeState, parseEndpoint, netOf, endpointLabel, allEndpoints, placement, placementIssue, wireIssue, validateCircuit, partTerminals, connectionPlan, simulationState, resolveWireEndpoint, resolveWireConnection, resolveWireMove, repairPlan, electricallyConnected } from './build-circuit.js';
import { BUILD_PROJECTS, getBuildProject, buildSketch } from './build-projects.js';
import { getWalkthrough } from './build-walkthroughs.js';

const KEY='field-lab-build-blink-v1', COMPLETE='field-lab-build-completed-v1';
const COLORS=['#d4ac58','#4e807f','#c7634b','#526c88','#7a678d'];
const LEFT=['EN','36','39','34','35','32','33','25','26','27','14','12','13','GND2','VIN'];
const RIGHT=['23','22','1','3','21','19','18','5','17','16','4','2','15','GND','3V3'];
const PIN_TEXT={'36':'VP','39':'VN','1':'TX0','3':'RX0','17':'TX2','16':'RX2',GND2:'GND'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const name=id=>endpointLabel(id)||id;

export function mountBuild(container,{projectId='blink',onProjectChange=()=>{},onExit=()=>{}}={}){
 const project=getBuildProject(projectId),draftKey=project.id==='blink'?KEY:`field-lab-build-${project.id}-v1`;
 let state=initialState(project.id), stored=false;
 try{const raw=localStorage.getItem(draftKey);if(raw){const saved=normalizeState(JSON.parse(raw));if(saved.project===project.id||(!saved.project&&project.id==='blink')){state=saved;stored=true;}}}catch{}
 let active=true, mode='select', orientation=0, flipped=false, first=null, selected=null, highlights=[], check=null, running=false, view='top', scene=null;
 let sceneState='', sceneHighlights='', sceneRunning=null, sceneGhost='', preview=null, hintGhost=null, callout=null;
 let firstRequested=null,guidedWire=null,wireStatus='',wireHover=null,wireCacheState=null;
 let copper=[],draggingWire=null;
 let guideEnabled=true,guideStepId='rows',guideState=null,guideSteps=[],repair=null,repairVisible=false;
 const guideKey=`field-lab-build-guide-${project.id}-v1`;
 try{const prefs=JSON.parse(localStorage.getItem(guideKey)||'null');if(prefs){guideEnabled=prefs.enabled!==false;guideStepId=typeof prefs.step==='string'?prefs.step:'rows';}}catch{}
 const wireCache=new Map();
 let undo=[], animation=0, startTime=0, lastLED=null, wireCounter=Date.now(), message=stored?'Your saved circuit is ready to continue.':'Place the LED and resistor, then connect them.', tone='neutral';
 let pressed=false,dial=50,simulation=null,simulationSignature='';
 const full={x:14,y:39,w:746,h:672};
 let viewport=copy(full), pan=null, pinch=null;
 const pointers=new Map();
 container.classList.add('build-workspace');
 container.innerHTML=`<header class="build-heading"><div><div class="build-eyebrow">BUILD / PRACTICE</div><h1><select id="build-project" aria-label="Build project">${BUILD_PROJECTS.map(p=>`<option value="${esc(p.id)}"${p.id===project.id?' selected':''}>${esc(p.shortTitle)}</option>`).join('')}</select></h1><p>${esc(project.goal)}</p></div><button class="build-back" id="build-exit">← ${esc(project.shortTitle)} lesson</button></header>
 <div class="build-layout"><section class="build-stage" aria-label="Circuit editor">
 <div class="build-toolbar"><div class="build-viewbar"><div class="build-edit-tools" aria-label="Editing tools"><button data-build-tool="select" aria-pressed="true"><span>Select / Move</span></button><button data-build-tool="wire"><span>Wire</span></button><button data-build-tool="delete"><span>Delete</span></button></div><div class="build-view-switch" aria-label="Circuit view"><button id="build-top" aria-pressed="true">Top view</button><button id="build-3d" aria-pressed="false">3D</button></div><div class="build-view-tools"><button id="build-zoom-out" aria-label="Zoom out">−</button><label class="build-zoom-control">Zoom <input id="build-zoom" type="range" min="60" max="300" step="1" value="100" aria-label="Zoom"><output id="build-zoom-value">100%</output></label><button id="build-zoom-in" aria-label="Zoom in">+</button><button id="build-fit" aria-label="Fit circuit in view">Fit</button></div></div>
 <div class="build-tray" aria-label="Parts"><span class="build-tray-label">Parts</span><button data-build-tool="led"><svg viewBox="0 0 28 30" aria-hidden="true"><path d="M10 22v7m8-7v7"/><path d="M7 22V12a7 7 0 0 1 14 0v10Z" fill="#cf7255"/><path d="M5 22h18"/></svg><span>LED</span></button><button data-build-tool="resistor"><svg viewBox="0 0 38 30" aria-hidden="true"><path d="M2 15h34"/><rect x="9" y="10" width="20" height="10" rx="3" fill="#d6be88"/><path d="M14 10v10m5-10v10m5-10v10" stroke="#b36a38"/></svg><span>330 Ω</span></button><label class="build-color"><span>Wire</span><select id="build-color" aria-label="Wire color">${COLORS.map((c,i)=>`<option value="${c}">${['Gold','Teal','Red','Blue','Purple'][i]}</option>`).join('')}</select></label></div>
 </div><div class="build-context"><p id="build-instruction" aria-live="polite"></p><div><button id="build-rotate" title="Rotate part footprint">Rotate</button><button id="build-flip" title="Swap LED anode and cathode">Flip LED</button><button id="build-remove">Remove</button><button id="build-cancel" aria-label="Cancel selection">Cancel</button></div></div>
 <div class="build-canvas-wrap" id="build-canvas-wrap"><svg id="build-viewport" viewBox="0 0 800 740" tabindex="0" role="img" aria-label="Circuit editor. Drag components to move; choose Wire to connect contacts. Use the contact picker for keyboard editing."></svg><div id="build-scene3d" hidden></div><div id="build-contact-tip" aria-hidden="true"></div><svg class="build-callout-line" aria-hidden="true"><path/><circle r="4"/></svg><div id="build-callout" class="build-callout" aria-hidden="true" hidden></div><p id="build-inline-feedback" class="build-inline-feedback" aria-hidden="true" hidden></p></div>
 <div class="build-quick"><span>Board pins</span><button data-build-endpoint="pin:23">GPIO23</button><button data-build-endpoint="pin:GND">GND</button><button id="build-open-picker">Pick contact</button><button id="build-hint-near">Hint</button><span class="build-pan-note">Drag empty space to pan</span></div>
 </section><aside class="build-panel" aria-label="Build controls">
 <section class="build-guidance-wrap" aria-label="Assembly guidance"><div class="build-guidance-tabs"><button id="build-guided" aria-pressed="true">Guided build</button><button id="build-free" aria-pressed="false">Free build</button></div><article id="build-guide" class="build-guide"><div class="build-guide-heading"><span id="build-guide-progress"></span><span id="build-guide-complete"></span></div><h2 id="build-guide-title"></h2><p id="build-guide-task"></p><p id="build-guide-why" class="build-guide-why"></p><details id="build-guide-code"><summary>How the code uses this</summary><code></code><p></p></details><div class="build-guide-actions"><button id="build-guide-show">Show on board</button><button id="build-guide-do">Do this step</button></div><div class="build-guide-nav"><button id="build-guide-back">← Back</button><button id="build-guide-next">Next →</button></div></article><article id="build-repair" class="build-guide build-repair" hidden><span id="build-repair-progress"></span><h2 id="build-repair-title"></h2><p id="build-repair-why"></p><div class="build-guide-actions"><button id="build-repair-show">Show the repair</button><button id="build-repair-do">Do this step</button></div><button id="build-repair-close">Back to the guide</button></article></section>
 <div class="build-primary"><button id="build-check">Check circuit</button><button id="build-run" disabled>Run</button></div>
 <div class="build-run-controls" id="build-run-controls"${project.id==='blink'?' hidden':''}>${project.control.type==='button'?'<button id="build-hold" disabled>Hold button</button>':project.control.type==='range'?'<label for="build-dial">Dial position <output id="build-dial-value">50%</output></label><input id="build-dial" type="range" min="0" max="100" value="50" disabled>':''}<output id="build-simulation-status"></output></div>
 <div class="build-feedback" id="build-feedback" role="status" aria-live="polite"></div>
 <button class="build-hint-button" id="build-hint">Show me the next step</button><div id="build-hint-copy" class="build-hint-copy" role="status" hidden></div>
 <div class="build-edit-actions"><button id="build-undo" disabled>↶ Undo</button><button id="build-reset">Start over</button></div>
 <details class="build-details" id="build-contact-picker"><summary>Choose a contact</summary><div class="build-picker"><label>Area<select id="build-area"><option value="board">ESP32</option><option value="boardholes">Breadboard</option><option value="rails">Power rails</option></select></label><label id="build-pin-label">Pin<select id="build-pin">${[...new Set([...RIGHT,...LEFT])].map(p=>`<option value="pin:${p}">${esc(name('pin:'+p))}</option>`).join('')}</select></label><label id="build-column-label" hidden>Column<select id="build-column">${'abcdefghij'.split('').map(c=>`<option>${c}</option>`).join('')}</select></label><label id="build-row-label" hidden>Row<select id="build-row">${Array.from({length:30},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label><label id="build-rail-label" hidden>Rail<select id="build-rail"><option value="L+">Left +</option><option value="L-">Left −</option><option value="R+">Right +</option><option value="R-">Right −</option></select></label><label id="build-rail-index-label" hidden>Hole<select id="build-rail-index">${Array.from({length:25},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label><button id="build-use-contact">Use contact</button></div></details>
 <details class="build-details" id="build-wires"><summary>Wires <span id="build-wire-count">0</span></summary><div id="build-wire-list"></div></details>
 <details class="build-details"><summary>${project.id==='blink'?'Blink timing & code':'Arduino code'}</summary><div${project.id!=='blink'?' hidden':''}><label class="build-interval-label" for="build-interval">INTERVAL_MS <output id="build-interval-value">500 ms</output></label><input id="build-interval" type="range" min="100" max="1500" step="50" value="500"></div><p class="build-small">The demo follows this example. No code is compiled.</p><button id="build-download">Download .ino ↗</button><pre id="build-code" tabindex="0" aria-label="Arduino code"></pre></details>
 <details class="build-details"><summary>How the breadboard connects</summary><p>In each numbered row, a–e share one connection and f–j share another. The center gap separates them.</p><p>Each colored power rail is one continuous strip on this board. A wire and a component leg need separate holes in the same strip.</p><p>This project checks the connections for ${esc(project.shortTitle)}. It does not simulate arbitrary electronics.</p></details>
 </aside></div>`;
 const $=s=>container.querySelector(s), $$=s=>[...container.querySelectorAll(s)];
 const endpoints=allEndpoints();
 for(const kind of project.parts.filter(k=>!['led','resistor'].includes(k))){const icon=kind==='button'?'<rect x="4" y="5" width="24" height="20" rx="3" fill="#aeb8ae"/><circle cx="16" cy="15" r="7" fill="#535c56"/><path d="M1 8h4m22 0h4M1 22h4m22 0h4"/>':'<path d="M8 22v7m8-7v7m8-7v7"/><circle cx="16" cy="12" r="10" fill="#8aa9ad"/><circle cx="16" cy="12" r="5" fill="#d9d2ad"/><path d="M13 15l6-6"/>';$('.build-color').insertAdjacentHTML('beforebegin',`<button data-build-tool="${kind}"><svg viewBox="0 0 32 30" aria-hidden="true">${icon}</svg><span>${esc(project.labels[kind])}</span></button>`);}
 if(project.id!=='blink')$('#build-open-picker').insertAdjacentHTML('beforebegin',`<button data-build-endpoint="pin:${project.id==='button'?'18':'34'}">GPIO${project.id==='button'?'18':'34'}</button>`);
 function terminals(parts=state.parts){return Object.entries(parts).flatMap(([kind,p])=>p?partTerminals(kind,p):[]);}
 function saveGuide(){try{localStorage.setItem(guideKey,JSON.stringify({enabled:guideEnabled,step:guideStepId}));}catch{}}
 function repairDone(op){if(op.kind==='connect')return electricallyConnected(state,op.from,op.to);const w=state.wires.find(w=>w.id===op.wireId);return !!w&&(w[op.end]===op.target||electricallyConnected(state,w[op.end],op.target));}
 function currentRepair(){return repair?.operations.find(op=>!repairDone(op))||null;}
 function repairViable(){if(!repair)return false;const trial=copy(state);for(const [i,op]of repair.operations.entries()){if(repairDone(op))continue;if(op.kind==='moveWire'){const result=resolveWireMove(trial,op.wireId,op.end,op.target),w=trial.wires.find(w=>w.id===op.wireId);if(!result.ok||!w)return false;w.from=result.from;w.to=result.to;}else{const result=resolveWireConnection(trial,op.from,op.to);if(result.alreadyConnected)continue;if(!result.ok)return false;let id='repair-check-'+i;while(trial.wires.some(w=>w.id===id))id+='x';trial.wires.push({id,from:result.from,to:result.to,color:COLORS[0]});}}return validateCircuit(trial).ok;}
 function readGuide(){if(guideState!==state){guideState=state;guideSteps=getWalkthrough(state);const currentIndex=guideSteps.findIndex(s=>s.id===guideStepId),partIndex=guideSteps.findIndex(s=>s.type==='part'&&!s.complete);if(guideEnabled&&partIndex>=0&&currentIndex>partIndex){guideStepId=guideSteps[partIndex].id;saveGuide();}if(validateCircuit(state).ok||!repairViable()){repair=null;repairVisible=false;}if(!repair&&project.parts.every(k=>state.parts[k])&&guideSteps.some(s=>s.blocked)){repair=repairPlan(state);if(repair&&guideEnabled)repairVisible=true;}}let index=guideSteps.findIndex(s=>s.id===guideStepId);if(index<0){index=0;guideStepId=guideSteps[0]?.id||'rows';}return{step:guideSteps[index],index};}
 function placeGuidePanel(){const wrap=$('.build-guidance-wrap');if(!wrap)return;const mobile=matchMedia('(max-width:760px)').matches,parent=mobile?$('.build-layout'):$('.build-panel');if(wrap.parentElement!==parent)parent.insertBefore(wrap,mobile?$('.build-stage'):parent.firstChild);}
 function renderGuide(){
  const {step,index}=readGuide(),op=currentRepair();$('#build-guided').setAttribute('aria-pressed',String(guideEnabled));$('#build-free').setAttribute('aria-pressed',String(!guideEnabled));$('#build-guide').hidden=!guideEnabled||repairVisible;$('#build-repair').hidden=!repairVisible||!repair;$('#build-repair-close').textContent=guideEnabled?'Back to the guide':'Close repair';
  if(step){$('#build-guide').dataset.step=step.id;$('#build-guide-progress').textContent=`${index+1} / ${guideSteps.length}`;$('#build-guide-complete').textContent=step.type==='concept'?'Explore':step.complete?'Complete':'';$('#build-guide-title').textContent=step.title;$('#build-guide-task').textContent=step.instruction;$('#build-guide-why').textContent=step.why;$('#build-guide-code').hidden=!step.code;$('#build-guide-code code').textContent=step.code?.line||'';$('#build-guide-code p').textContent=step.code?.explanation||'';$('#build-guide-do').hidden=!step.action;$('#build-guide-back').disabled=index===0;$('#build-guide-next').disabled=!step.complete||index===guideSteps.length-1;$('#build-guide-next').textContent=index===guideSteps.length-1?'Finished':'Next →';}
  if(repair){const done=repair.operations.filter(repairDone).length;$('#build-repair-progress').textContent=op?`Repair ${done+1} / ${repair.operations.length}`:'Repair complete';$('#build-repair-title').textContent=op?.title||'The current path is repaired';$('#build-repair-why').textContent=op?[op.kind==='moveWire'?repair.why:null,op.why].filter(Boolean).join(' '):'Check the circuit, then run it to test the result.';$('#build-repair-do').textContent=op?'Do this step':'Check circuit';$('#build-repair-show').hidden=!op;}
  copper=repairVisible&&op?op.targets||[]:guideEnabled?step?.copper||[]:[];$('#build-hint').hidden=guideEnabled;$('#build-hint-copy').hidden=guideEnabled||$('#build-hint-copy').hidden;$('#build-hint-near').textContent=guideEnabled?'Show step':'Hint';placeGuidePanel();container.dataset.guided=String(guideEnabled);
 }
 function revealGuide(){if(matchMedia('(max-width:760px)').matches)$('.build-guidance-wrap').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
 function showRepair({showBoard=false}={}){readGuide();if(!repair)repair=repairPlan(state);if(!repair)return;repairVisible=true;const op=currentRepair();if(!op){render();return;}stop();first=null;firstRequested=null;clearPreview({hint:true});highlights=op.targets||[];copper=highlights;mode='select';selected=null;if(op.kind==='moveWire'){selected={wire:op.wireId};hintGhost={kind:'wire',from:op.from,to:op.to};}else{mode='wire';hintGhost={kind:'wire',from:op.from,to:op.to};}message=op.title;tone='neutral';render();focusTargets(highlights);showCallout(op.title,op.target||op.to);if(guideEnabled&&!showBoard)revealGuide();else revealCanvas();}
 function guideCallout(step){const ids=step.targets||[];if(step.type!=='connection'||!step.complete)return{text:step.title,target:ids[0]};const first=ids[0],last=ids[ids.length-1],occupied=new Set([...terminals(),...state.wires.flatMap(w=>[w.from,w.to])]),target=endpoints.find(id=>parseEndpoint(id)?.kind==='hole'&&netOf(id)===netOf(first)&&!occupied.has(id))||first;return{text:`${name(first)} ↔ ${name(last)} · connected`,target};}
 function showGuideStep({showBoard=false}={}){const {step}=readGuide();if(repairVisible&&repair){showRepair({showBoard});return;}if(!step)return;first=null;firstRequested=null;selected=null;clearPreview({hint:true});highlights=step.targets||[];copper=step.copper||[];mode='select';if(step.action){stop();if(step.action.type==='place'){mode=step.action.kind;hintGhost={kind:mode,...step.action.part};const a=parseEndpoint(step.action.part.a),b=parseEndpoint(step.action.part.b);orientation=b.row>a.row?0:b.row<a.row?180:b.column>a.column?90:270;flipped=false;}else{mode='wire';hintGhost={kind:'wire',from:step.action.from,to:step.action.to};}}message=step.instruction;tone='neutral';render();focusTargets(step.frame||highlights);const annotation=guideCallout(step);showCallout(annotation.text,annotation.target);if(showBoard)revealCanvas();else revealGuide();}
 function stepGuide(delta){const {index,step}=readGuide();if(delta>0&&!step?.complete)return;const next=guideSteps[index+delta];if(!next)return;guideStepId=next.id;repairVisible=false;saveGuide();showGuideStep();}
 function toggleGuide(enabled){guideEnabled=enabled;first=null;firstRequested=null;selected=null;clearPreview({hint:true});repairVisible=enabled&&!!repair&&!!currentRepair();if(!enabled)copper=[];saveGuide();render();if(enabled)showGuideStep();}
 function doGuideStep(){const {step}=readGuide(),action=step?.action;if(!action)return;if(action.type==='place'){const d=placementIssue(state,action.kind,action.part);if(issue(d))return;commitPart(action.kind,action.part);}else{const resolved=resolveWireConnection(state,action.from,action.to);if(resolved.alreadyConnected){render();return;}if(issue(!resolved.ok?resolved:null))return;const next=copy(state),id='w'+(++wireCounter);next.wires.push({id,from:resolved.from,to:resolved.to,color:$('#build-color').value});selected={wire:id};mode='select';edit(next,'Connection made. Read why it works, then choose Next.',true);}render();}
 function doRepair(){const op=currentRepair();if(!op){checkCircuit();return;}if(op.kind==='moveWire'){finishWireMove(op.wireId,op.end,op.target);}else{const result=resolveWireConnection(state,op.from,op.to);if(result.alreadyConnected){render();return;}if(issue(!result.ok?result:null))return;const next=copy(state),id='w'+(++wireCounter);next.wires.push({id,from:result.from,to:result.to,color:$('#build-color').value});selected={wire:id};mode='select';edit(next,'Repair connection made.',true);}if(currentRepair())showRepair();else render();}
 function save(){try{localStorage.setItem(draftKey,JSON.stringify(state));}catch{}}
 function point(id){const p=parseEndpoint(id);if(!p)return null;if(p.kind==='hole'){const col='abcdefghij'.indexOf(p.column);return{x:420+col*22+(col>4?20:0),y:90+(p.row-1)*20};}if(p.kind==='rail'){const pos={'L+':350,'L-':376,'R+':692,'R-':718}[p.side+p.polarity];return{x:pos,y:90+(Math.floor((p.index-1)/5)*6+(p.index-1)%5)*20};}const pin=p.pin,li=LEFT.indexOf(pin),ri=RIGHT.indexOf(pin);return li>=0?{x:48,y:126+li*30}:ri>=0?{x:252,y:126+ri*30}:null;}
 function wirePath(a,b){return `M${a.x} ${a.y} C${a.x} ${a.y-34},${b.x} ${b.y-34},${b.x} ${b.y}`;}
 function svgPart(kind,p){const a=point(p.a),b=point(p.b);if(!a||!b)return'';const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  const selectedClass=selected?.kind===kind?' is-selected':'';
  if(kind==='button'||kind==='potentiometer')return `<g data-build-part="${kind}" class="build-component${selectedClass}">${kind==='button'?svgBuildButton(p,point,{pressed,showPins:selected?.kind===kind||activeGhost()?.kind===kind}):svgBuildPotentiometer(p,point,{value:dial/100,showPins:selected?.kind===kind||activeGhost()?.kind===kind})}</g>`;
  const leads=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#82908c" stroke-width="4"/>`;
  return `<g data-build-part="${kind}" class="build-component${selectedClass}">${leads}${kind==='led'?`<circle class="build-led-bulb" cx="${mx}" cy="${my}" r="12" fill="#b85d48" stroke="#894b37" stroke-width="2"/><path d="M${mx-7} ${my-4}q4-6 9-2" stroke="#f7c7a4" fill="none" stroke-width="2"/><text x="${a.x+15}" y="${a.y+4}" class="build-leg-label">A +</text><text x="${b.x+15}" y="${b.y+4}" class="build-leg-label">K −</text>`:`<g transform="translate(${mx} ${my}) rotate(${angle})"><rect x="-19" y="-8" width="38" height="16" rx="6" fill="#d4bf8a" stroke="#9b8b64"/><path d="M-10-8V8M-3-8V8" stroke="#bd6b37" stroke-width="4"/><path d="M4-8V8" stroke="#6a4630" stroke-width="4"/><path d="M13-8V8" stroke="#b99b45" stroke-width="3"/></g>`}<circle cx="${a.x}" cy="${a.y}" r="3" fill="#c9b46f"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="#c9b46f"/></g>`;
 }
 function renderSVG(){
  const occupied=new Set([...terminals(),...state.wires.flatMap(w=>[w.from,w.to])]);
  const h=new Set(highlights.flatMap(id=>endpoints.filter(e=>e===id||netOf(e)===netOf(id))));
  let s=`<rect x="24" y="72" width="252" height="550" rx="15" fill="#e8eee6" stroke="#507875" stroke-width="2"/><rect x="76" y="96" width="148" height="240" rx="5" fill="#cbd1c5" stroke="#8b9b92"/><path d="M110 115h70v24h-55v24h55v24h-55" fill="none" stroke="#ab985b" stroke-width="5"/><text x="150" y="260" text-anchor="middle" class="build-board-title">ESP32</text><text x="150" y="284" text-anchor="middle" class="build-tiny">DEVKIT V1</text><rect x="117" y="562" width="65" height="55" rx="4" fill="#c2cbc8" stroke="#7a8c8a"/><rect x="130" y="601" width="40" height="10" fill="#3b5352"/><rect x="100" y="480" width="29" height="30" fill="#3e5552"/><rect x="172" y="480" width="29" height="30" fill="#3e5552"/><text x="150" y="650" text-anchor="middle" class="build-tiny">USB power is provided</text>
  <rect x="320" y="45" width="430" height="655" rx="13" fill="#ecebdf" stroke="#a2ada5" stroke-width="2"/><rect x="527" y="66" width="22" height="610" rx="3" fill="#d1d5cb"/>`;
  for(const [x,color,sign] of [[343,'#bf7462','+'],[383,'#648595','−'],[685,'#bf7462','+'],[725,'#648595','−']])s+=`<path d="M${x} 75V680" stroke="${color}" stroke-width="2"/><text x="${x}" y="65" text-anchor="middle" fill="${color}" class="build-tiny">${sign}</text>`;
  for(let i=0;i<10;i++)s+=`<text x="${420+i*22+(i>4?20:0)}" y="68" text-anchor="middle" class="build-tiny">${'abcdefghij'[i]}</text>`;
  for(let i=1;i<=30;i++)s+=`<text x="402" y="${94+(i-1)*20}" text-anchor="end" class="build-row-number">${i}</text>`;
  const copperNets=[...new Set(copper.map(netOf).filter(Boolean))];for(const [index,net] of copperNets.entries()){const ids=endpoints.filter(id=>netOf(id)===net&&parseEndpoint(id)?.kind!=='pin'),pts=ids.map(point).filter(Boolean);if(pts.length<2)continue;const a=pts[0],b=pts[pts.length-1];s+=`<path class="build-copper build-copper-${index%3}" data-build-copper="${esc(net)}" d="M${a.x} ${a.y}L${b.x} ${b.y}"/>`;}
  for(const id of endpoints){const p=point(id);if(!p)continue;const ep=parseEndpoint(id);let cls='build-contact'+(first===id?' is-first':'')+(h.has(id)?' is-highlighted':'')+(occupied.has(id)?' is-occupied':'');s+=`<g data-build-contact="${esc(id)}" class="${cls}"><circle class="build-contact-hit" cx="${p.x}" cy="${p.y}" r="${ep.kind==='pin'?12:9.5}"/><circle class="build-contact-dot" cx="${p.x}" cy="${p.y}" r="${ep.kind==='pin'?5.5:3.8}"/><title>${esc(name(id))}${occupied.has(id)?' · occupied':''}</title></g>`;
   if(ep.kind==='pin'){const l=LEFT.includes(ep.pin);s+=`<text x="${p.x+(l?12:-12)}" y="${p.y+4}" text-anchor="${l?'start':'end'}" class="build-pin-label">${PIN_TEXT[ep.pin]||ep.pin}</text>`;}
  }
  for(const w of state.wires){const a=point(w.from),b=point(w.to);if(!a||!b)continue;s+=`<g data-build-wire="${esc(w.id)}" class="build-wire${selected?.wire===w.id?' is-selected':''}"><path d="${wirePath(a,b)}" stroke="transparent" stroke-width="15"/><path d="${wirePath(a,b)}" stroke="${esc(w.color)}" stroke-width="4"/><circle cx="${a.x}" cy="${a.y}" r="3" fill="${esc(w.color)}"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="${esc(w.color)}"/></g>`;}
  for(const kind of project.parts)if(state.parts[kind])s+=svgPart(kind,state.parts[kind]);
  for(const w of state.wires)for(const end of ['from','to']){const p=point(w[end]);if(!p)continue;s+=`<g class="build-wire-handle${selected?.wire===w.id?' is-selected':''}" data-build-wire-id="${esc(w.id)}" data-build-wire-end="${end}"><circle cx="${p.x}" cy="${p.y}" r="${selected?.wire===w.id?10:6}" fill="${selected?.wire===w.id?'#faf7ed':'transparent'}" stroke="${esc(w.color)}" stroke-width="${selected?.wire===w.id?2:0}"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="${esc(w.color)}"/><title>Drag this wire end</title></g>`;}
  s+='<g id="build-ghost-layer" aria-hidden="true"></g>';
  $('#build-viewport').innerHTML=s;setViewport();lastLED=null;
  renderGhost();
 }
 function setViewport(){const svg=$('#build-viewport');svg.setAttribute('viewBox',`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`);updateZoom();positionCallout();}
 function activeGhost(){return preview||(mode==='wire'&&first&&wireHover?null:hintGhost);}
 function renderGhost(){
  const layer=$('#build-ghost-layer'),g=activeGhost();if(!layer)return;
  if(!g){layer.innerHTML='';return;}
  let shape='';const ids=g.kind==='wire'?[g.from,g.to]:partTerminals(g.kind,g);
  if(g.kind==='wire'){const a=point(g.from),b=point(g.to);if(a&&b)shape=`<path d="${wirePath(a,b)}" class="build-ghost-wire"/>`;}
  else shape=svgPart(g.kind,g).replace(/data-build-part="[^"]+"/g,'').replace(/class="build-led-bulb"/g,'');
  shape+=ids.map(id=>{const p=point(id);return p?`<circle cx="${p.x}" cy="${p.y}" r="9" class="build-ghost-contact"/>`:'';}).join('');
  layer.innerHTML=`<g data-build-ghost="${esc(g.kind)}" data-build-targets="${esc(ids.join(','))}" class="build-ghost${g.invalid?' is-invalid':''}">${shape}</g>`;
 }
 function showCallout(text,target,action=null){callout=text&&target?{text,target,action}:null;$('#build-callout').innerHTML=`<span>${esc(text||'')}</span>${action?`<button data-build-callout-action="${esc(action)}">${action==='flip'?'Flip LED':'Delete tool'}</button>`:''}`;$('#build-callout').removeAttribute('aria-hidden');positionCallout();}
 function positionCallout(){
  const label=$('#build-callout'),line=$('.build-callout-line');if(!label||!line)return;
  if(!callout){label.hidden=true;line.style.display='none';return;}
  let p;if(view==='3d')p=scene?.projectBuildEndpoint?.(callout.target);else{const ep=point(callout.target);if(ep){const box=$('#build-viewport').getBoundingClientRect(),scale=Math.min(box.width/viewport.w,box.height/viewport.h);p={x:(box.width-viewport.w*scale)/2+(ep.x-viewport.x)*scale,y:(box.height-viewport.h*scale)/2+(ep.y-viewport.y)*scale,visible:true};}}
  const box=$('#build-canvas-wrap').getBoundingClientRect();if(!p||p.visible===false||p.x<0||p.y<0||p.x>box.width||p.y>box.height){label.hidden=true;line.style.display='none';return;}
  label.hidden=false;line.style.display='block';const w=label.offsetWidth,h=label.offsetHeight,left=Math.max(8,Math.min(box.width-w-8,p.x-w/2)),top=Math.max(8,Math.min(box.height-h-8,p.y-h-28));
  label.style.left=left+'px';label.style.top=top+'px';line.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);line.querySelector('path').setAttribute('d',`M${left+w/2} ${top+h}L${p.x} ${p.y}`);line.querySelector('circle').setAttribute('cx',p.x);line.querySelector('circle').setAttribute('cy',p.y);
 }
 function clearPreview({hint=false}={}){preview=null;wireHover=null;if(hint){hintGhost=null;guidedWire=null;showCallout('',null);$('#build-hint-copy').hidden=true;}renderGhost();syncScene();}
 function wireIntent(from,to){if(wireCacheState!==state){wireCache.clear();wireCacheState=state;}const key=from+'|'+to;if(!wireCache.has(key))wireCache.set(key,resolveWireConnection(state,from,to));return wireCache.get(key);}
 function wireRelocation(list){return list?.length?list.map(p=>`${name(p.requested)} is occupied; using ${name(p.endpoint)} on the same connection.`).join(' '):'';}
 function cancelWire(notice='Wire cancelled. Choose a new start contact.'){first=null;firstRequested=null;wireStatus='';selected=null;clearPreview({hint:true});highlights=[];message=notice;tone='neutral';render();}
 function previewContact(id){
  wireHover=mode==='wire'&&first?id:null;
  const kind=selected?.kind||(project.parts.includes(mode)?mode:null);
  if(kind&&id){const p=placement(kind,id,orientation,kind==='led'&&flipped);preview=p?{kind,...p,invalid:!!placementIssue(state,kind,p)}:null;}
  else if(mode==='wire'&&first&&id&&id!==first&&id!==firstRequested){const result=wireIntent(firstRequested||first,id);if(result.alreadyConnected){preview=null;showCallout('Already connected · click to finish',id);}else if(result.ok){preview={kind:'wire',from:result.from,to:result.to};showCallout(result.redirected?.length?`Preview → ${name(result.to)} · same connection`:'Preview · click to connect',result.to);}else{preview=null;showCallout(result.title||'Choose another destination',result.targets?.[0]||id);}}
  else preview=null;
  if(mode==='wire'&&first&&!id){if(guidedWire&&hintGhost?.kind==='wire')showCallout(`2 / 2 · Connect to ${name(hintGhost.to)}`,hintGhost.to);else showCallout(`Start: ${name(first)} · choose the other end`,first);}
  renderGhost();syncScene();
 }
 function focusTargets(targets){
  if(!targets.length)return;
  if(view==='3d'){scene?.focusBuildTargets(targets);return;}
  const points=targets.flatMap(id=>{const kind=String(id).replace(/^component:/,'');const p=state.parts[kind];const w=state.wires.find(w=>w.id===id||'wire:'+w.id===id);return p?partTerminals(kind,p):w?[w.from,w.to]:[id];}).map(point).filter(Boolean);
  if(!points.length)return;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),spanX=Math.max(...xs)-x,spanY=Math.max(...ys)-y;
  const box=$('#build-canvas-wrap').getBoundingClientRect(),ratio=box.width/Math.max(1,box.height);
  let w=Math.max(250,spanX+120),h=Math.max(230,spanY+120);if(w/h<ratio)w=h*ratio;else h=w/ratio;
  viewport={x:x+spanX/2-w/2,y:y+spanY/2-h/2,w,h};setViewport();
 }
 function syncScene(){
  if(!scene)return;
  const signature=JSON.stringify(state),targetSignature=JSON.stringify(highlights);
  if(signature!==sceneState){scene.setBuildState(copy(state));sceneState=signature;sceneHighlights='';sceneRunning=null;sceneGhost='';}
  if(targetSignature!==sceneHighlights){scene.setBuildHighlight(highlights);sceneHighlights=targetSignature;}
  if(running!==sceneRunning){scene.setBuildRunning(running);sceneRunning=running;}
  const g=JSON.stringify(activeGhost());if(g!==sceneGhost){scene.setBuildGhost?.(activeGhost());sceneGhost=g;}
  scene.setBuildTool?.(mode);
  scene.setBuildWirePending?.(!!first);
  scene.setBuildSelection?.(selected);
  scene.setBuildConnections?.(copper);
 }
 function setMessage(text,type='neutral',targets=[]){message=text;tone=type;highlights=targets;renderFeedback();syncScene();renderSVG();}
 function renderFeedback(){$('#build-feedback').hidden=guideEnabled&&!repairVisible&&tone==='neutral'&&message===readGuide().step?.instruction;$('#build-feedback').textContent=message;$('#build-feedback').dataset.tone=tone;$('#build-inline-feedback').textContent=message;$('#build-inline-feedback').dataset.tone=tone==='error'?'error':wireStatus?'success':'neutral';$('#build-inline-feedback').hidden=tone!=='error'&&!(mode==='wire'&&wireStatus);}
 function instruction(){if(mode==='delete')return'Tap a component or wire to delete it. Undo restores it.';if(selected?.wire)return'Drag an end to reconnect. Click this wire again to delete.';if(selected?.kind)return'Drag to move. Click this part again to delete.';if(mode==='led')return flipped?'Place the short leg (−) on a hole.':'Place the long leg (+) on a hole.';if(mode==='resistor')return'Place the first resistor lead on a hole.';if(mode==='button')return'Place the four button leads.';if(mode==='potentiometer')return'Place the dial’s three leads in separate rows.';if(mode==='select')return'Drag a part to move it. Tap a part or wire to select.';return first?`2 / 2 · ${name(first)} → choose the other end.`:`${wireStatus?'Connected. ':''}1 / 2 · Choose ${wireStatus?'the next':'a'} start contact.`;}
 function sketch(){return buildSketch(state);}
 function render(){
  renderGuide();
  $('#build-instruction').textContent=instruction();
  $$('button[data-build-tool]').forEach(b=>{const k=b.dataset.buildTool;b.setAttribute('aria-pressed',String(mode===k));b.classList.toggle('is-active',mode===k);b.classList.toggle('is-placed',!!state.parts[k]);b.querySelector('span').textContent=({select:'Select / Move',wire:'Wire',delete:'Delete',resistor:'330 Ω',button:'Button',potentiometer:'10 kΩ dial'})[k]||project.labels[k]||k;});
  $('#build-rotate').hidden=!project.parts.includes(mode)&&!selected?.kind;$('#build-flip').hidden=mode!=='led'&&selected?.kind!=='led';$('#build-remove').hidden=!selected;$('#build-cancel').hidden=!first&&!selected&&!project.parts.includes(mode);
  $('#build-cancel').textContent=mode==='wire'?'Cancel wire':'Cancel';container.dataset.wireStage=mode==='wire'?(first?'destination':'start'):'';
  $('#build-run').disabled=!check?.ok;$('#build-run').textContent=running?'Stop':'Run';$('#build-run').setAttribute('aria-pressed',String(running));$('#build-undo').disabled=!undo.length;
  $('#build-wire-count').textContent=String(state.wires.length);$('#build-wire-list').innerHTML=state.wires.length?state.wires.map(w=>`<div class="build-wire-row"><button data-build-wire-select="${esc(w.id)}"><i style="background:${esc(w.color)}"></i>${esc(name(w.from))} → ${esc(name(w.to))}</button><button data-build-wire-remove="${esc(w.id)}" aria-label="Remove wire from ${esc(name(w.from))} to ${esc(name(w.to))}">×</button></div>`).join(''):'<p class="build-small">No wires yet.</p>';
  if($('#build-hold'))$('#build-hold').disabled=!running;if($('#build-dial'))$('#build-dial').disabled=!running;
  $('#build-interval').value=String(state.interval);$('#build-interval-value').textContent=state.interval+' ms';$('#build-code').textContent=sketch();renderFeedback();renderSVG();syncScene();updateSimulation();container.dataset.running=String(running);container.dataset.checked=String(!!check?.ok);container.dataset.tool=mode;
 }
 function stop(){running=false;pressed=false;if(sceneRunning!==false)scene?.setBuildRunning(false);sceneRunning=false;lastLED=null;simulationSignature='';scene?.setBuildInputs?.({pressed:false,value:dial});}
 function edit(next,notice='Circuit changed. Check it before running.',wireConnected=false){
  stop();undo.push(copy(state));if(undo.length>50)undo.shift();state=normalizeState(next);check=null;highlights=[];preview=null;hintGhost=null;guidedWire=null;wireStatus=wireConnected?'connected':'';showCallout('',null);$('#build-hint-copy').hidden=true;first=null;firstRequested=null;message=notice;tone='neutral';save();render();
 }
 function issue(d){if(d)setMessage(d.message||d.title,'error',d.targets||[]);return !!d;}
 function selectContact(id){if(!parseEndpoint(id))return;
  if(mode==='delete'){const part=Object.entries(state.parts).find(([k,p])=>p&&partTerminals(k,p).includes(id)),wire=state.wires.find(w=>w.from===id||w.to===id);if(part)selected={kind:part[0]};else if(wire)selected={wire:wire.id};else return;removeSelected();return;}
  const kind=selected?.kind||(project.parts.includes(mode)?mode:null);
  if(kind){const p=placement(kind,id,orientation,kind==='led'&&flipped);if(!p){setMessage('Choose a breadboard hole with room for every lead.','error',[id]);return;}if(issue(placementIssue(state,kind,p)))return;commitPart(kind,p);return;}
  if(mode!=='wire'){highlights=[id];render();return;}
  selected=null;if(first&&(first===id||firstRequested===id)){cancelWire();return;}if(!first){startWire(id);return;}finishWire(id);
 }
 function startWire(id){
  const suggestion=guidedWire||(hintGhost?.kind==='wire'?{from:hintGhost.from,to:hintGhost.to}:null),result=resolveWireEndpoint(state,id);clearPreview({hint:true});wireStatus='';first=null;firstRequested=null;
  if(!result.ok){message=`${result.message} Choose another start contact.`;tone='error';highlights=result.targets||[id];render();showCallout('Choose another start contact',id);return;}
  first=result.endpoint;firstRequested=result.requested;highlights=[first];tone='neutral';message=result.redirected?wireRelocation([result]):`Start: ${name(first)}. Choose the other end.`;
  let destination=null;if(suggestion){if(wireIntent(id,suggestion.from).alreadyConnected)destination=suggestion.to;else if(wireIntent(id,suggestion.to).alreadyConnected)destination=suggestion.from;}
  if(destination){const pair=wireIntent(id,destination);if(pair.ok){guidedWire=suggestion;hintGhost={kind:'wire',from:pair.from,to:pair.to};highlights=[first,pair.to];}}
  render();showCallout(hintGhost?`2 / 2 · Connect to ${name(hintGhost.to)}`:result.redirected?`Start: ${name(first)} · same connection as ${name(id)}`:`Start: ${name(first)} · choose the other end`,hintGhost?.to||first);
 }
 function finishWire(id){
  const result=wireIntent(firstRequested||first,id),resumeGuide=!!guidedWire&&!guideEnabled;
  if(result.alreadyConnected){cancelWire('Already connected. Choose a new start contact.');wireStatus='connected';highlights=result.targets||[];render();showCallout('Already connected · no extra wire needed',id);if(resumeGuide)hint({afterConnection:true});return;}
  if(!result.ok){preview=null;hintGhost=null;guidedWire=null;$('#build-hint-copy').hidden=true;const source=resolveWireEndpoint(state,firstRequested||first);if(!source.ok){first=null;firstRequested=null;}else first=source.endpoint;message=`${result.message} ${first?'Your start is still selected; choose another end.':'Choose a new start contact.'}`;tone='error';wireStatus='';highlights=[...(first?[first]:[]),...(result.targets||[])];render();showCallout(first?'Choose another destination':'Choose a new start',result.targets?.[0]||id);return;}
  const next=copy(state),idNew='w'+(++wireCounter);next.wires.push({id:idNew,from:result.from,to:result.to,color:$('#build-color').value});if(guideEnabled){selected={wire:idNew};mode='select';}edit(next,`Connected: ${name(result.from)} → ${name(result.to)}.${result.redirected?.length?' '+wireRelocation(result.redirected):''}`,true);if(resumeGuide)hint({afterConnection:true});
 }
 function commitPart(kind,p){const moved=!!state.parts[kind],next=copy(state);next.parts[kind]=p;selected={kind};mode='select';edit(next,`${project.labels[kind]} ${moved?'moved':'placed'}.${guideEnabled?' Read why it works, then choose Next.':''}`);partPose(kind);}
 function partPose(kind){const p=state.parts[kind],a=parseEndpoint(p?.a),b=parseEndpoint(p?.b);orientation=!a||!b?0:b.row>a.row?0:b.row<a.row?180:b.column>a.column?90:270;flipped=false;}
 function selectPart(kind,{repeat=false}={}){if(!state.parts[kind])return;const remove=mode==='delete'||(repeat&&selected?.kind===kind&&!running);stop();selected={kind};if(remove){removeSelected();return;}mode='select';partPose(kind);first=null;clearPreview({hint:true});highlights=partTerminals(kind,state.parts[kind]);render();}
 function selectWire(id,{repeat=false}={}){const w=state.wires.find(w=>w.id===id);if(!w)return;const remove=mode==='delete'||(repeat&&selected?.wire===id&&!running);stop();selected={wire:id};if(remove){removeSelected();return;}mode='select';first=null;clearPreview({hint:true});highlights=[w.from,w.to];render();}
 function chooseTool(k){stop();clearPreview({hint:true});mode=k;selected=null;first=null;firstRequested=null;wireStatus='';highlights=[];if(k==='wire'){message='Choose a start contact, then the other end. Solid wires are already connected.';tone='neutral';}partPose(k);if(state.parts[k]){selectPart(k);return;}render();if(project.parts.includes(k))focusTargets(['bb:a1','bb:j15']);}
 function removeSelected(){if(!selected)return;const next=copy(state);if(selected.kind)next.parts[selected.kind]=null;else next.wires=next.wires.filter(w=>w.id!==selected.wire);selected=null;if(mode!=='delete')mode='select';edit(next,'Deleted. Undo brings it back.');}
 function revealCanvas(){if(matchMedia('(max-width:760px)').matches)$('#build-canvas-wrap').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
 function checkCircuit(){stop();clearPreview({hint:true});check=validateCircuit(state);message=check.message||check.title;tone=check.ok?'success':'error';highlights=check.targets||[];first=null;selected=check.code==='reversed_led'?{kind:'led'}:null;mode='select';readGuide();if(!check.ok&&repair){showRepair();return;}render();if(!check.ok){focusTargets(highlights);showCallout(check.title||check.message,highlights[0],check.code==='reversed_led'?'flip':null);revealCanvas();}}
 function run(){if(running){stop();message='Stopped. Your checked circuit is ready.';render();return;}const fresh=validateCircuit(state);if(!check?.ok||!fresh.ok){checkCircuit();return;}first=null;firstRequested=null;selected=null;wireStatus='';mode='select';clearPreview({hint:true});running=true;startTime=performance.now();simulationSignature='';message=project.id==='blink'?'Circuit complete. GPIO23 is driving your LED.':project.id==='button'?'Hold the button to light the LED.':'Turn the dial to change LED brightness.';tone='success';if(project.id!=='blink')highlights=[...partTerminals('led',state.parts.led),...partTerminals(project.id,state.parts[project.id])];try{const done=JSON.parse(localStorage.getItem(COMPLETE)||'[]');localStorage.setItem(COMPLETE,JSON.stringify([...new Set([...(Array.isArray(done)?done:[]),project.id])]));}catch{}render();if(project.id!=='blink')focusTargets(highlights);}
 function hintPlacement(kind){
  const viable=p=>{if(!p||placementIssue(state,kind,p))return false;const nets=partTerminals(kind,p).map(netOf),separate=kind==='button'?![nets[0],nets[1]].some(n=>n===nets[2]||n===nets[3]):new Set(nets).size===nets.length;if(!separate)return false;const trial=copy(state);trial.parts[kind]=p;return !project.parts.every(k=>trial.parts[k])||connectionPlan(trial)!==null;};
  const preferred=project.placements[kind];if(viable(preferred))return preferred;
  for(const id of endpoints.filter(id=>id.startsWith('bb:')))for(const angle of [0,90,180,270]){const p=placement(kind,id,angle,false);if(viable(p))return p;}
  return null;
 }
 function hint({afterConnection=false}={}){
  if(guideEnabled){showGuideStep({showBoard:true});return;}
  const result=validateCircuit(state);if(!result.ok)stop();clearPreview({hint:true});selected=null;first=null;firstRequested=null;wireStatus=afterConnection?'connected':'';tone='neutral';message=afterConnection?'Wire connected. Follow the next preview.':'Follow the highlighted suggestion.';const missing=['resistor','led',...project.parts.filter(k=>!['resistor','led'].includes(k))].find(k=>project.parts.includes(k)&&!state.parts[k]);let text='',short='',targets=[];
  if(missing){const p=hintPlacement(missing);if(p){hintGhost={kind:missing,...p};targets=partTerminals(missing,p);text=`Place ${project.labels[missing]} at the dashed preview: ${targets.map(name).join(' / ')}. Other free positions also work.`;short=`Place ${project.labels[missing]} here`;mode=missing;const a=parseEndpoint(p.a),b=parseEndpoint(p.b);orientation=b.row>a.row?0:b.row<a.row?180:b.column>a.column?90:270;flipped=false;}else{text='Existing connections need a change before this part can complete the circuit. Check the wires or move a part to free separate rows.';short='Check the existing connections';}}
  else if(result.ok){text=running?'Your circuit is running. The controls let you try its response.':'Your circuit is connected. Check it, then press Run.';message=text;short=running?'Circuit running':'Ready to check';targets=terminals();mode='select';}
  else if(result.code==='reversed_led'){selected={kind:'led'};partPose('led');hintGhost={kind:'led',a:state.parts.led.b,b:state.parts.led.a};targets=[state.parts.led.a,state.parts.led.b];text=result.message;short='Swap the + and − legs';mode='select';}
  else{const next=connectionPlan(state)?.[0];if(next){hintGhost={kind:'wire',from:next.from,to:next.to};guidedWire={from:next.from,to:next.to};targets=[next.from,next.to];text=`1. Choose ${name(next.from)}. 2. Choose ${name(next.to)}. The dashed wire is a preview; the solid wire appears after both clicks.`;short=`1 / 2 · Start at ${name(next.from)}`;mode='wire';}else{text=result.message||result.title;short=result.title||'Check this connection';targets=result.targets||[];mode='select';}}
  highlights=targets;render();$('#build-hint-copy').hidden=false;$('#build-hint-copy').textContent=text;focusTargets(targets);showCallout(short,targets[0],result.code==='reversed_led'?'flip':null);revealCanvas();
 }
 function setView(next){view=next;$('#build-viewport').toggleAttribute('hidden',view!=='top');$('#build-scene3d').hidden=view!=='3d';$('#build-top').setAttribute('aria-pressed',String(view==='top'));$('#build-3d').setAttribute('aria-pressed',String(view==='3d'));$('.build-pan-note').textContent=view==='top'?'Drag empty space to pan':'Drag to rotate';
  if(view==='3d'&&!scene){try{scene=createScene($('#build-scene3d'),{buildMode:true,onBuildEndpoint:selectContact,onBuildPart:k=>selectPart(k,{repeat:true}),onBuildWire:id=>selectWire(id,{repeat:true}),onBuildHover:previewContact,onBuildDrag:sceneDrag,onBuildWireDrag:sceneWireDrag,onBuildGhost:placeGhost,onBuildInteract:interact,onZoomChange:updateZoom});if(!$('#build-scene3d canvas'))throw new Error('WebGL unavailable');sceneState='';sceneHighlights='';sceneRunning=null;syncScene();scene.setBuildInputs?.({pressed,value:dial});scene.setBuildSimulation?.(simulation||{});}catch{scene?.dispose?.();scene=null;$('#build-scene3d').replaceChildren();setView('top');setMessage('3D is unavailable here. You can still build and run in Top view.');}}
  updateZoom();positionCallout();
 }
 function currentZoom(){if(view==='3d')return scene?.getBuildZoom?.()||1;const r=$('#build-viewport').getBoundingClientRect();return Math.min(r.width/viewport.w,r.height/viewport.h)/Math.min(r.width/full.w,r.height/full.h);}
 function updateZoom(){if(!$('#build-zoom'))return;const value=Math.round(currentZoom()*100);$('#build-zoom').value=String(value);$('#build-zoom-value').textContent=value+'%';}
 function svgPoint(clientX,clientY,v=viewport){const r=$('#build-viewport').getBoundingClientRect(),scale=Math.min(r.width/v.w,r.height/v.h);return{x:v.x+(clientX-r.left-(r.width-v.w*scale)/2)/scale,y:v.y+(clientY-r.top-(r.height-v.h*scale)/2)/scale};}
 function setZoom(value,client=null,anchor=null){value=Math.max(.6,Math.min(3,value));if(view==='3d'){scene?.setBuildZoom?.(value);updateZoom();return;}const r=$('#build-viewport').getBoundingClientRect(),at=client||{x:r.left+r.width/2,y:r.top+r.height/2},world=anchor||svgPoint(at.x,at.y),scale=Math.min(r.width/full.w,r.height/full.h)*value;viewport={x:world.x-(at.x-r.left)/scale,y:world.y-(at.y-r.top)/scale,w:r.width/scale,h:r.height/scale};setViewport();}
 function zoom(factor,client=null){setZoom(currentZoom()/factor,client);}
 function fit(){if(view==='3d')scene?.reset();else{viewport=copy(full);setViewport();}updateZoom();positionCallout();}
 function nearestHole(p){let best=null,distance=Infinity;for(const id of endpoints){if(!id.startsWith('bb:'))continue;const q=point(id),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<distance){distance=d;best=id;}}return distance<=22?best:null;}
 function nearestContact(p){let best=null,distance=Infinity;for(const id of endpoints){const q=point(id);if(!q)continue;const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<distance){distance=d;best=id;}}return distance<=22?best:null;}
 function placeGhost(g){if(!g||g.kind==='wire'||!project.parts.includes(g.kind))return;const d=placementIssue(state,g.kind,g);if(issue(d))return;const p=Object.fromEntries(Object.entries(g).filter(([key])=>!['kind','invalid','label'].includes(key)));commitPart(g.kind,p);}
 function wireMovePreview(id,end,anchor){const wire=state.wires.find(w=>w.id===id);if(!wire)return;const result=anchor?resolveWireMove(state,id,end,anchor):null;draggingWire={id,end,anchor,result};preview=result?.ok?{kind:'wire',from:result.from,to:result.to}:anchor?{kind:'wire',from:end==='from'?anchor:wire.from,to:end==='to'?anchor:wire.to,invalid:true}:null;renderGhost();syncScene();$('#build-contact-tip').textContent=result?.ok?(result.unchanged?'Original contact':`Release to connect ${name(result[end])}`):result?.title||'Move over a contact';$('#build-contact-tip').style.opacity='1';}
 function finishWireMove(id,end,anchor){const result=anchor?resolveWireMove(state,id,end,anchor):null;draggingWire=null;preview=null;$('#build-contact-tip').style.opacity='0';if(!result){renderGhost();syncScene();return;}if(!result.ok){issue(result);return;}if(result.unchanged){renderGhost();syncScene();return;}const next=copy(state),wire=next.wires.find(w=>w.id===id);if(!wire)return;wire.from=result.from;wire.to=result.to;selected={wire:id};mode='select';edit(next,`Wire end moved to ${name(result[end])}.${result.redirected?.length?' '+wireRelocation(result.redirected):''}`);}
 function sceneWireDrag({id,end,phase,anchor}){if(phase==='start'){selectWire(id);draggingWire={id,end};}else if(phase==='move')wireMovePreview(id,end,anchor);else if(phase==='end')finishWireMove(id,end,anchor);else{draggingWire=null;clearPreview();$('#build-contact-tip').style.opacity='0';}}
 function dragPreview(kind,anchor){const p=anchor?placement(kind,anchor,orientation,false):null,d=p?placementIssue(state,kind,p):null;preview=p?{kind,...p,invalid:!!d}:null;renderGhost();syncScene();$('#build-contact-tip').textContent=d?.title||(p?'Release to place':'Move over the breadboard');$('#build-contact-tip').style.opacity='1';return{p,issue:d};}
 function finishDrag(kind,anchor){const p=anchor?placement(kind,anchor,orientation,false):null;preview=null;$('#build-contact-tip').style.opacity='0';if(!p){renderGhost();syncScene();return;}const d=placementIssue(state,kind,p);if(d){issue(d);return;}if(JSON.stringify(state.parts[kind])!==JSON.stringify(p))commitPart(kind,p);else{renderGhost();syncScene();}}
 function sceneDrag({kind,phase,anchor}){if(phase==='start')selectPart(kind);else if(phase==='move')dragPreview(kind,anchor);else if(phase==='end')finishDrag(kind,anchor);else{clearPreview();$('#build-contact-tip').style.opacity='0';}}
 function interact(action){if(!running)return;if(action.type==='press')pressed=!!action.pressed;else if(action.type==='value')dial=Math.max(0,Math.min(100,Number(action.value)||0));scene?.setBuildInputs?.({pressed,value:dial});renderSVG();updateSimulation();}
 function updateSimulation(now=performance.now()){
  const elapsedMs=Math.max(0,now-startTime),phase=project.id==='blink'?Math.floor(elapsedMs/state.interval)%2:0,signature=`${running}:${phase}:${pressed}:${dial}`;
  if(signature===simulationSignature&&lastLED!==null)return;
  if(signature!==simulationSignature){simulationSignature=signature;simulation=running?simulationState(state,{elapsedMs,pressed,value:dial}):{ledBrightness:0,status:'Press Run to try it.',pressed:false,value:dial};scene?.setBuildSimulation?.(simulation);}
  const brightness=running?Number(simulation?.ledBrightness)||0:0;if(brightness!==lastLED){lastLED=brightness;const bulb=$('.build-led-bulb');if(bulb){bulb.setAttribute('fill',brightness>0?`rgb(${Math.round(184+71*brightness)},${Math.round(93+35*brightness)},${Math.round(72+11*brightness)})`:'#b85d48');bulb.classList.toggle('is-lit',brightness>.02);bulb.dataset.brightness=String(brightness);}}
  if($('#build-hold'))$('#build-hold').setAttribute('aria-pressed',String(pressed));if($('#build-dial')){$('#build-dial').value=String(dial);$('#build-dial-value').textContent=Math.round(dial)+'%';}$('#build-simulation-status').textContent=simulation?.status||'';
 }
 function picker(){const area=$('#build-area').value;$('#build-pin-label').hidden=area!=='board';$('#build-column-label').hidden=area!=='boardholes';$('#build-row-label').hidden=area!=='boardholes';$('#build-rail-label').hidden=area!=='rails';$('#build-rail-index-label').hidden=area!=='rails';}
 container.addEventListener('click',onClick);
 function onClick(e){const action=e.target.closest('[data-build-callout-action]');if(action){if(action.dataset.buildCalloutAction==='flip')$('#build-flip').click();else chooseTool('delete');return;}const tool=e.target.closest('button[data-build-tool]');if(tool){chooseTool(tool.dataset.buildTool);return;}const quick=e.target.closest('[data-build-endpoint]');if(quick){selectContact(quick.dataset.buildEndpoint);return;}const wire=e.target.closest('[data-build-wire-select]');if(wire){selectWire(wire.dataset.buildWireSelect);return;}const remove=e.target.closest('[data-build-wire-remove]');if(remove){selected={wire:remove.dataset.buildWireRemove};removeSelected();return;}}
 const svg=$('#build-viewport');
 svg.addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);zoom(Math.exp(delta*.0012),{x:e.clientX,y:e.clientY});},{passive:false});
 svg.addEventListener('pointerdown',e=>{
  if(e.button!==undefined&&e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});svg.setPointerCapture(e.pointerId);svg.focus({preventScroll:true});
  if(pointers.size===2){const[a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:currentZoom(),anchor:svgPoint(mid.x,mid.y)};pan=null;clearPreview();if(pressed)interact({type:'press',pressed:false});return;}
  const handle=e.target.closest('[data-build-wire-end]'),ghost=e.target.closest('[data-build-ghost]'),part=e.target.closest('[data-build-part]')?.dataset.buildPart;let wire=handle?.dataset.buildWireId||e.target.closest('[data-build-wire]')?.dataset.buildWire,contact=e.target.closest('[data-build-contact]')?.dataset.buildContact;if(mode==='wire'&&wire){const p=svgPoint(e.clientX,e.clientY),near=nearestContact(p),q=near&&point(near);if(q&&Math.hypot(p.x-q.x,p.y-q.y)<=(parseEndpoint(near).kind==='pin'?12:9.5)){contact=near;wire=null;}}
  pan={id:e.pointerId,startX:e.clientX,startY:e.clientY,view:copy(viewport),part,wire,contact,dragged:false,anchor:null,wasSelected:part?selected?.kind===part:wire?selected?.wire===wire:false,handle:!!handle};
  if(ghost&&ghost.dataset.buildGhost!=='wire'){pan.ghost=copy(activeGhost());return;}
  if(running&&part==='button'){pan.interact='button';interact({type:'press',pressed:true});return;}if(running&&part==='potentiometer'){pan.interact='potentiometer';pan.value=dial;return;}
  if(part&&mode==='select'){const p=svgPoint(e.clientX,e.clientY),a=point(state.parts[part].a);pan.kind=part;pan.offset={x:p.x-a.x,y:p.y-a.y};selectPart(part);}
  else if(handle&&mode==='select'&&!running){const end=handle.dataset.buildWireEnd,p=svgPoint(e.clientX,e.clientY),wireState=state.wires.find(w=>w.id===wire),a=point(wireState[end]);pan.wireEnd=end;pan.offset={x:p.x-a.x,y:p.y-a.y};selectWire(wire);}
 });
 svg.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pointers.size>=2){const[a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance),mid,pinch.anchor);return;}
  if(!pan){if(e.target.closest('[data-build-ghost]:not([data-build-ghost=wire])')){$('#build-contact-tip').style.opacity='0';return;}const id=e.target.closest('[data-build-contact]')?.dataset.buildContact;$('#build-contact-tip').textContent=id?name(id):'';$('#build-contact-tip').style.opacity=id?'1':'0';previewContact(id||null);return;}
  if(pan.id!==e.pointerId)return;const dx=e.clientX-pan.startX,dy=e.clientY-pan.startY;if(Math.hypot(dx,dy)>5)pan.dragged=true;
  if(pan.interact){if(pan.interact==='potentiometer'&&pan.dragged)interact({type:'value',value:pan.value+dx*.7});return;}if(!pan.dragged)return;
  if(pan.kind){const p=svgPoint(e.clientX,e.clientY);pan.anchor=nearestHole({x:p.x-pan.offset.x,y:p.y-pan.offset.y});dragPreview(pan.kind,pan.anchor);return;}
  if(pan.wireEnd){const p=svgPoint(e.clientX,e.clientY);pan.anchor=nearestContact({x:p.x-pan.offset.x,y:p.y-pan.offset.y});wireMovePreview(pan.wire,pan.wireEnd,pan.anchor);return;}
  const r=svg.getBoundingClientRect(),scale=Math.min(r.width/pan.view.w,r.height/pan.view.h);viewport={...pan.view,x:pan.view.x-dx/scale,y:pan.view.y-dy/scale};setViewport();
 });
 function pointerEnd(e){
  pointers.delete(e.pointerId);if(pinch){if(pointers.size<2)pinch=null;pan=null;return;}
  if(!pan||pan.id!==e.pointerId)return;const current=pan;pan=null;
  if(current.interact){if(current.interact==='button')interact({type:'press',pressed:false});return;}
  if(e.type!=='pointerup'){draggingWire=null;clearPreview();return;}
  if(current.dragged){if(current.kind)finishDrag(current.kind,current.anchor);else if(current.wireEnd)finishWireMove(current.wire,current.wireEnd,current.anchor);return;}
  if(current.ghost){placeGhost(current.ghost);return;}
  if(current.part)selectPart(current.part,{repeat:current.wasSelected});else if(current.wire)selectWire(current.wire,{repeat:current.wasSelected&&!current.handle});else if(current.contact)selectContact(current.contact);else if(mode==='select'){selected=null;clearPreview({hint:true});render();}
 }
 svg.addEventListener('pointerup',pointerEnd);svg.addEventListener('pointercancel',pointerEnd);svg.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))pointerEnd(e);});
 svg.addEventListener('pointerleave',()=>{if(!pan){$('#build-contact-tip').style.opacity='0';clearPreview();}});
 $('#build-open-picker').onclick=()=>{$('#build-contact-picker').open=true;$('#build-area').focus();$('#build-contact-picker').scrollIntoView({block:'nearest',behavior:'instant'});};
 $('#build-top').onclick=()=>setView('top');$('#build-3d').onclick=()=>setView('3d');$('#build-zoom-in').onclick=()=>zoom(.8);$('#build-zoom-out').onclick=()=>zoom(1.25);$('#build-fit').onclick=fit;$('#build-zoom').oninput=()=>setZoom(Number($('#build-zoom').value)/100);$('#build-project').onchange=()=>onProjectChange($('#build-project').value);
 $('#build-check').onclick=checkCircuit;$('#build-run').onclick=run;$('#build-hint').onclick=hint;$('#build-hint-near').onclick=hint;$('#build-exit').onclick=onExit;
 $('#build-guided').onclick=()=>toggleGuide(true);$('#build-free').onclick=()=>toggleGuide(false);$('#build-guide-back').onclick=()=>stepGuide(-1);$('#build-guide-next').onclick=()=>stepGuide(1);$('#build-guide-show').onclick=()=>showGuideStep({showBoard:true});$('#build-guide-do').onclick=doGuideStep;$('#build-repair-show').onclick=()=>showRepair({showBoard:true});$('#build-repair-do').onclick=doRepair;$('#build-repair-close').onclick=()=>{repairVisible=false;clearPreview({hint:true});render();if(guideEnabled)showGuideStep();};$('#build-guide-title').setAttribute('aria-live','polite');$('#build-guide-back').setAttribute('aria-label','Previous assembly step');$('#build-guide-next').setAttribute('aria-label','Next assembly step');
 $('#build-cancel').onclick=()=>{if(mode==='wire'){cancelWire();return;}selected=null;first=null;mode='select';highlights=[];clearPreview({hint:true});render();};$('#build-remove').onclick=removeSelected;
 $('#build-rotate').onclick=()=>{orientation=(orientation+90)%360;const kind=selected?.kind;if(kind){const p=placement(kind,state.parts[kind].a,orientation,false);if(p&&!placementIssue(state,kind,p)){commitPart(kind,p);return;}preview=p?{kind,...p,invalid:true}:null;}message=`Footprint rotated to ${orientation}°. Choose its first hole.`;tone='neutral';render();};
 $('#build-flip').onclick=()=>{if(state.parts.led&&selected?.kind==='led'){const next=copy(state);[next.parts.led.a,next.parts.led.b]=[next.parts.led.b,next.parts.led.a];edit(next,'LED polarity reversed.');partPose('led');}else{flipped=!flipped;message=flipped?'The cathode (−) will be placed first.':'The anode (+) will be placed first.';render();}};
 $('#build-undo').onclick=()=>{if(!undo.length)return;stop();state=undo.pop();check=null;first=null;selected=null;highlights=[];mode='select';clearPreview({hint:true});message='Undone. Check the circuit before running.';tone='neutral';save();render();};
 $('#build-reset').onclick=()=>{selected=null;mode='select';guideStepId='rows';repair=null;repairVisible=false;saveGuide();edit(initialState(project.id),'Fresh breadboard. Undo restores your previous circuit.');if(guideEnabled)showGuideStep();};
 $('#build-area').onchange=picker;$('#build-use-contact').onclick=()=>{const a=$('#build-area').value;selectContact(a==='board'?$('#build-pin').value:a==='boardholes'?`bb:${$('#build-column').value}${$('#build-row').value}`:`rail:${$('#build-rail').value}:${$('#build-rail-index').value}`);};
 $('#build-interval').oninput=()=>{const next=copy(state);next.interval=Number($('#build-interval').value);if(next.interval!==state.interval)edit(next,'Timing changed. Check before running.');};
 $('#build-download').onclick=()=>{const url=URL.createObjectURL(new Blob([sketch()],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download=`build-${project.id}.ino`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 if($('#build-hold')){const button=$('#build-hold');button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);interact({type:'press',pressed:true});};for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>interact({type:'press',pressed:false}));button.onkeydown=e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();interact({type:'press',pressed:true});}};button.onkeyup=e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();interact({type:'press',pressed:false});}};button.onblur=()=>interact({type:'press',pressed:false});}
 if($('#build-dial'))$('#build-dial').oninput=()=>interact({type:'value',value:Number($('#build-dial').value)});
 function key(e){if(document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.key==='Escape'){if(mode==='wire')cancelWire();else{first=null;selected=null;mode='select';highlights=[];clearPreview({hint:true});render();}}if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();removeSelected();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('#build-undo').click();}}
 container.addEventListener('keydown',key);
 function hidden(){if(document.hidden&&running){stop();message='Paused while the page is hidden.';render();}}
 document.addEventListener('visibilitychange',hidden);
 let canvasSize=null;
 const resizeObserver=new ResizeObserver(entries=>{const size=entries[0]?.contentRect;if(!active||!size?.width||!size?.height)return;placeGuidePanel();if(canvasSize&&view==='top'&&(Math.abs(size.width-canvasSize.width)>1||Math.abs(size.height-canvasSize.height)>1)){const old=canvasSize,relative=Math.min(old.width/viewport.w,old.height/viewport.h)/Math.min(old.width/full.w,old.height/full.h),scale=Math.min(size.width/full.w,size.height/full.h)*relative,w=size.width/scale,h=size.height/scale;viewport={x:viewport.x+viewport.w/2-w/2,y:viewport.y+viewport.h/2-h/2,w,h};setViewport();}canvasSize={width:size.width,height:size.height};updateZoom();positionCallout();});resizeObserver.observe($('#build-canvas-wrap'));
 function tick(now){if(!active)return;animation=requestAnimationFrame(tick);if(running)updateSimulation(now);if(callout&&view==='3d')positionCallout();}
 render();picker();if(guideEnabled)showGuideStep();animation=requestAnimationFrame(tick);
 return{getState:()=>copy(state),isRunning:()=>running,dispose(){active=false;stop();cancelAnimationFrame(animation);resizeObserver.disconnect();scene?.dispose();scene=null;document.removeEventListener('visibilitychange',hidden);container.removeEventListener('click',onClick);container.removeEventListener('keydown',key);container.innerHTML='';container.classList.remove('build-workspace');}};
}

// Read-only review deliverable: standalone blueprint SVG bodies for Build UI.
// Call inside the UI-owned data-build-part wrapper; point(endpoint) returns {x,y}.
// Geometry uses the actual terminals, so rotated footprints keep the right pins.

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const num = n => Number(n.toFixed(3));
const xy = p => `${num(p.x)} ${num(p.y)}`;
const terminal = (p, label, showPins) => `<circle cx="${num(p.x)}" cy="${num(p.y)}" r="3.1" fill="#c9b46f" stroke="#7b8174" stroke-width=".8"/>${showPins ? `<text x="${num(p.x+6)}" y="${num(p.y-6)}" font-size="8" fill="#556f72" pointer-events="none">${label}</text>` : ''}`;

function svgBuildButton(part, point, {pressed=false, showPins=false}={}) {
  const p=['a','b','c','d'].map(k=>point(part[k]));
  if (!p.every(finitePoint)) return '';
  const [a,b,c,d]=p;
  const across=Math.hypot(c.x-a.x,c.y-a.y), along=Math.hypot(b.x-a.x,b.y-a.y);
  if (!across || !along) return '';
  const u={x:(c.x-a.x)/across,y:(c.y-a.y)/across};
  const v={x:(b.x-a.x)/along,y:(b.y-a.y)/along};
  const center={x:(a.x+b.x+c.x+d.x)/4,y:(a.y+b.y+c.y+d.y)/4};
  const bw=Math.max(18,across-18),bh=Math.max(18,along-12);
  const r=Math.max(6,Math.min(bw,bh)*.34);
  // a/b sit on one permanent contact side; c/d on the other.
  const local=[[-across/2,-along/2],[-across/2,along/2],[across/2,-along/2],[across/2,along/2]];
  const leads=local.map(([x,y])=>`<path d="M${num(x)} ${num(y)}L${num(Math.sign(x)*bw/2)} ${num(Math.sign(y)*bh*.35)}"/>`).join('');
  return `<g transform="matrix(${num(u.x)} ${num(u.y)} ${num(v.x)} ${num(v.y)} ${xy(center)})">
    <g fill="none" stroke="#86918b" stroke-width="3" stroke-linecap="round">${leads}</g>
    <rect x="${num(-bw/2)}" y="${num(-bh/2)}" width="${num(bw)}" height="${num(bh)}" rx="3" fill="#576e63" stroke="#3f5e56" stroke-width="1.5"/>
    <rect x="${num(-bw/2+3)}" y="${num(-bh/2+2)}" width="${num(bw-6)}" height="${num(bh-4)}" rx="3" fill="#bcc6bd" stroke="#7b8d82"/>
    <path d="M${num(-bw/2+4)} ${num(-bh*.3)}V${num(bh*.3)}M${num(bw/2-4)} ${num(-bh*.3)}V${num(bh*.3)}" stroke="#87998b" stroke-width="2.5"/>
    <circle r="${num(r+1.5)}" fill="#78877c" stroke="#4b6258"/>
    <circle cy="${pressed ? 1 : -1}" r="${num(r)}" fill="${pressed ? '#bd7551' : '#3b514c'}" stroke="#2d4642" stroke-width="1.3"/>
    <path d="M${num(-r*.55)} ${num(-r*.3)}Q0 ${num(-r*.75)} ${num(r*.55)} ${num(-r*.3)}" fill="none" stroke="${pressed ? '#e5ad82' : '#7e9589'}" stroke-width="1.3"/>
  </g>${p.map((q,i)=>terminal(q,['A','A','B','B'][i],showPins)).join('')}`;
}

function svgBuildPotentiometer(part, point, {value=.5, showPins=false}={}) {
  const a=point(part.a),w=point(part.w),b=point(part.b);
  if (![a,w,b].every(finitePoint)) return '';
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if (!length) return '';
  const u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},v={x:-u.y,y:u.x};
  const project=p=>({x:(p.x-w.x)*u.x+(p.y-w.y)*u.y,y:(p.x-w.x)*v.x+(p.y-w.y)*v.y});
  const local=[a,w,b].map(project), angle=-135+270*Math.max(0,Math.min(1,Number(value)||0));
  const leads=local.map(p=>`<path d="M${xy(p)}L${num(Math.max(-16,Math.min(16,p.x)))} -13"/>`).join('');
  return `<g transform="matrix(${num(u.x)} ${num(u.y)} ${num(v.x)} ${num(v.y)} ${xy(w)})">
    <g fill="none" stroke="#86918b" stroke-width="3" stroke-linecap="round">${leads}</g>
    <rect x="-25" y="-53" width="50" height="42" rx="8" fill="#547e83" stroke="#3d626a" stroke-width="1.6"/>
    <path d="M-20-44V-49H-13M20-44V-49H13" fill="none" stroke="#86a2a1" stroke-width="1.6"/>
    <circle cx="0" cy="-32" r="18.5" fill="#bbc6bb" stroke="#718879" stroke-width="1.4"/>
    <circle cx="0" cy="-32" r="14" fill="#ece8d6" stroke="#87978a"/>
    <g transform="translate(0 -32) rotate(${num(angle)})"><path d="M0-11V4" stroke="#4c6b69" stroke-width="3" stroke-linecap="round"/><circle cy="-11" r="2" fill="#bd7551"/></g>
    <text x="0" y="-16" text-anchor="middle" font-size="5.5" fill="#436366" pointer-events="none">10K</text>
  </g>${[[a,'A'],[w,'W'],[b,'B']].map(([p,label])=>terminal(p,label,showPins)).join('')}`;
}
