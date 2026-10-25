import { createScene } from './scene.js';
import { initialState, normalizeState, parseEndpoint, netOf, endpointLabel, allEndpoints, placement, placementIssue, wireIssue, validateCircuit } from './build-circuit.js';

const KEY='field-lab-build-blink-v1', COMPLETE='field-lab-build-completed-v1';
const COLORS=['#d4ac58','#4e807f','#c7634b','#526c88','#7a678d'];
const LEFT=['EN','36','39','34','35','32','33','25','26','27','14','12','13','GND2','VIN'];
const RIGHT=['23','22','1','3','21','19','18','5','17','16','4','2','15','GND','3V3'];
const PIN_TEXT={'36':'VP','39':'VN','1':'TX0','3':'RX0','17':'TX2','16':'RX2',GND2:'GND'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=x=>JSON.parse(JSON.stringify(x));
const name=id=>endpointLabel(id)||id;

export function mountBuild(container,{onExit=()=>{}}={}){
 let state=initialState(), stored=false;
 try{const raw=localStorage.getItem(KEY);if(raw){state=normalizeState(JSON.parse(raw));stored=true;}}catch{}
 let active=true, mode='wire', orientation=0, flipped=false, first=null, selected=null, highlights=[], check=null, running=false, hintLevel=0, view='top', scene=null;
 let sceneState='', sceneHighlights='', sceneRunning=null;
 let undo=[], animation=0, startTime=0, lastLED=null, wireCounter=Date.now(), message=stored?'Your saved circuit is ready to continue.':'Place the LED and resistor, then connect them.', tone='neutral';
 const full={x:14,y:39,w:746,h:672};
 let viewport=copy(full), pan=null;
 container.classList.add('build-workspace');
 container.innerHTML=`<header class="build-heading"><div><div class="build-eyebrow">BUILD / 01</div><h1>Make it blink<span>.</span></h1><p>Connect an LED to GPIO23 through a 330 Ω resistor.</p></div><button class="build-back" id="build-exit">← Blink lesson</button></header>
 <div class="build-layout"><section class="build-stage" aria-label="Circuit editor">
 <div class="build-toolbar"><div class="build-viewbar"><div class="build-view-switch" aria-label="Circuit view"><button id="build-top" aria-pressed="true">Top view</button><button id="build-3d" aria-pressed="false">3D</button></div><div class="build-view-tools"><button id="build-zoom-out" aria-label="Zoom out">−</button><button id="build-zoom-in" aria-label="Zoom in">+</button><button id="build-fit" aria-label="Fit circuit in view">Fit</button></div></div>
 <div class="build-tray" aria-label="Parts and tools"><button data-build-tool="led"><svg viewBox="0 0 28 30" aria-hidden="true"><path d="M10 22v7m8-7v7"/><path d="M7 22V12a7 7 0 0 1 14 0v10Z" fill="#cf7255"/><path d="M5 22h18"/></svg><span>LED</span></button><button data-build-tool="resistor"><svg viewBox="0 0 38 30" aria-hidden="true"><path d="M2 15h34"/><rect x="9" y="10" width="20" height="10" rx="3" fill="#d6be88"/><path d="M14 10v10m5-10v10m5-10v10" stroke="#b36a38"/></svg><span>330 Ω</span></button><button data-build-tool="wire" aria-pressed="true"><svg viewBox="0 0 32 30" aria-hidden="true"><path d="M5 24V12C5 2 27 2 27 12v12" fill="none" stroke="#bd984a" stroke-width="3"/></svg><span>Wire</span></button><label class="build-color"><span class="build-sr">Wire color</span><select id="build-color" aria-label="Wire color">${COLORS.map((c,i)=>`<option value="${c}">${['Gold','Teal','Red','Blue','Purple'][i]}</option>`).join('')}</select></label></div>
 </div><div class="build-context"><p id="build-instruction" aria-live="polite"></p><div><button id="build-rotate" title="Rotate part footprint">Rotate</button><button id="build-flip" title="Swap LED anode and cathode">Flip LED</button><button id="build-remove">Remove</button><button id="build-cancel" aria-label="Cancel selection">Cancel</button></div></div>
 <div class="build-canvas-wrap" id="build-canvas-wrap"><svg id="build-viewport" viewBox="0 0 800 740" role="img" aria-label="Top view of the ESP32 and breadboard. Tap two contacts to add a wire. The contact picker provides keyboard access."></svg><div id="build-scene3d" hidden></div><div id="build-contact-tip" aria-hidden="true"></div><p id="build-inline-feedback" class="build-inline-feedback" aria-hidden="true" hidden></p></div>
 <div class="build-quick"><span>Board pins</span><button data-build-endpoint="pin:23">GPIO23</button><button data-build-endpoint="pin:GND">GND</button><button id="build-open-picker">Pick contact</button><span class="build-pan-note">Drag empty space to pan</span></div>
 </section><aside class="build-panel" aria-label="Build controls">
 <div class="build-primary"><button id="build-check">Check circuit</button><button id="build-run" disabled>Run</button></div>
 <div class="build-feedback" id="build-feedback" role="status" aria-live="polite"></div>
 <button class="build-hint-button" id="build-hint">Need a hint?</button><div id="build-hint-copy" class="build-hint-copy" hidden></div>
 <div class="build-edit-actions"><button id="build-undo" disabled>↶ Undo</button><button id="build-reset">Start over</button></div>
 <details class="build-details" id="build-contact-picker"><summary>Choose a contact</summary><div class="build-picker"><label>Area<select id="build-area"><option value="board">ESP32</option><option value="boardholes">Breadboard</option><option value="rails">Power rails</option></select></label><label id="build-pin-label">Pin<select id="build-pin">${[...new Set([...RIGHT,...LEFT])].map(p=>`<option value="pin:${p}">${esc(name('pin:'+p))}</option>`).join('')}</select></label><label id="build-column-label" hidden>Column<select id="build-column">${'abcdefghij'.split('').map(c=>`<option>${c}</option>`).join('')}</select></label><label id="build-row-label" hidden>Row<select id="build-row">${Array.from({length:30},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label><label id="build-rail-label" hidden>Rail<select id="build-rail"><option value="L+">Left +</option><option value="L-">Left −</option><option value="R+">Right +</option><option value="R-">Right −</option></select></label><label id="build-rail-index-label" hidden>Hole<select id="build-rail-index">${Array.from({length:25},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label><button id="build-use-contact">Use contact</button></div></details>
 <details class="build-details" id="build-wires"><summary>Wires <span id="build-wire-count">0</span></summary><div id="build-wire-list"></div></details>
 <details class="build-details"><summary>Blink timing & code</summary><label class="build-interval-label" for="build-interval">INTERVAL_MS <output id="build-interval-value">500 ms</output></label><input id="build-interval" type="range" min="100" max="1500" step="50" value="500"><p class="build-small">Updates the demo and example. No code is compiled.</p><button id="build-download">Download .ino ↗</button><pre id="build-code" tabindex="0" aria-label="Blink Arduino code"></pre></details>
 <details class="build-details"><summary>How the breadboard connects</summary><p>In each numbered row, a–e share one connection and f–j share another. The center gap separates them.</p><p>Each colored power rail is one continuous strip on this board. A wire and a component leg need separate holes in the same strip.</p><p>This build checks the fixed GPIO23 Blink circuit. It does not simulate arbitrary electronics.</p></details>
 </aside></div>`;
 const $=s=>container.querySelector(s), $$=s=>[...container.querySelectorAll(s)];
 const endpoints=allEndpoints();
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}
 function point(id){const p=parseEndpoint(id);if(!p)return null;if(p.kind==='hole'){const col='abcdefghij'.indexOf(p.column);return{x:420+col*22+(col>4?20:0),y:90+(p.row-1)*20};}if(p.kind==='rail'){const pos={'L+':350,'L-':376,'R+':692,'R-':718}[p.side+p.polarity];return{x:pos,y:90+(Math.floor((p.index-1)/5)*6+(p.index-1)%5)*20};}const pin=p.pin,li=LEFT.indexOf(pin),ri=RIGHT.indexOf(pin);return li>=0?{x:48,y:126+li*30}:ri>=0?{x:252,y:126+ri*30}:null;}
 function wirePath(a,b){return `M${a.x} ${a.y} C${a.x} ${a.y-34},${b.x} ${b.y-34},${b.x} ${b.y}`;}
 function svgPart(kind,p){const a=point(p.a),b=point(p.b);if(!a||!b)return'';const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  const selectedClass=selected?.kind===kind?' is-selected':'';
  const leads=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#82908c" stroke-width="4"/>`;
  return `<g data-build-part="${kind}" class="build-component${selectedClass}">${leads}${kind==='led'?`<circle class="build-led-bulb" cx="${mx}" cy="${my}" r="12" fill="#b85d48" stroke="#894b37" stroke-width="2"/><path d="M${mx-7} ${my-4}q4-6 9-2" stroke="#f7c7a4" fill="none" stroke-width="2"/><text x="${a.x+15}" y="${a.y+4}" class="build-leg-label">A +</text><text x="${b.x+15}" y="${b.y+4}" class="build-leg-label">K −</text>`:`<g transform="translate(${mx} ${my}) rotate(${angle})"><rect x="-19" y="-8" width="38" height="16" rx="6" fill="#d4bf8a" stroke="#9b8b64"/><path d="M-10-8V8M-3-8V8" stroke="#bd6b37" stroke-width="4"/><path d="M4-8V8" stroke="#6a4630" stroke-width="4"/><path d="M13-8V8" stroke="#b99b45" stroke-width="3"/></g>`}<circle cx="${a.x}" cy="${a.y}" r="3" fill="#c9b46f"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="#c9b46f"/></g>`;
 }
 function renderSVG(){
  const occupied=new Set([...Object.values(state.parts).filter(Boolean).flatMap(p=>[p.a,p.b]),...state.wires.flatMap(w=>[w.from,w.to])]);
  const h=new Set(highlights.flatMap(id=>endpoints.filter(e=>e===id||netOf(e)===netOf(id))));
  let s=`<rect x="24" y="72" width="252" height="550" rx="15" fill="#e8eee6" stroke="#507875" stroke-width="2"/><rect x="76" y="96" width="148" height="240" rx="5" fill="#cbd1c5" stroke="#8b9b92"/><path d="M110 115h70v24h-55v24h55v24h-55" fill="none" stroke="#ab985b" stroke-width="5"/><text x="150" y="260" text-anchor="middle" class="build-board-title">ESP32</text><text x="150" y="284" text-anchor="middle" class="build-tiny">DEVKIT V1</text><rect x="117" y="562" width="65" height="55" rx="4" fill="#c2cbc8" stroke="#7a8c8a"/><rect x="130" y="601" width="40" height="10" fill="#3b5352"/><rect x="100" y="480" width="29" height="30" fill="#3e5552"/><rect x="172" y="480" width="29" height="30" fill="#3e5552"/><text x="150" y="650" text-anchor="middle" class="build-tiny">USB power is provided</text>
  <rect x="320" y="45" width="430" height="655" rx="13" fill="#ecebdf" stroke="#a2ada5" stroke-width="2"/><rect x="527" y="66" width="22" height="610" rx="3" fill="#d1d5cb"/>`;
  for(const [x,color,sign] of [[343,'#bf7462','+'],[383,'#648595','−'],[685,'#bf7462','+'],[725,'#648595','−']])s+=`<path d="M${x} 75V680" stroke="${color}" stroke-width="2"/><text x="${x}" y="65" text-anchor="middle" fill="${color}" class="build-tiny">${sign}</text>`;
  for(let i=0;i<10;i++)s+=`<text x="${420+i*22+(i>4?20:0)}" y="68" text-anchor="middle" class="build-tiny">${'abcdefghij'[i]}</text>`;
  for(let i=1;i<=30;i++)s+=`<text x="402" y="${94+(i-1)*20}" text-anchor="end" class="build-row-number">${i}</text>`;
  for(const id of endpoints){const p=point(id);if(!p)continue;const ep=parseEndpoint(id);let cls='build-contact'+(first===id?' is-first':'')+(h.has(id)?' is-highlighted':'')+(occupied.has(id)?' is-occupied':'');s+=`<g data-build-contact="${esc(id)}" class="${cls}"><circle class="build-contact-hit" cx="${p.x}" cy="${p.y}" r="${ep.kind==='pin'?12:9.5}"/><circle class="build-contact-dot" cx="${p.x}" cy="${p.y}" r="${ep.kind==='pin'?5.5:3.8}"/><title>${esc(name(id))}${occupied.has(id)?' · occupied':''}</title></g>`;
   if(ep.kind==='pin'){const l=LEFT.includes(ep.pin);s+=`<text x="${p.x+(l?12:-12)}" y="${p.y+4}" text-anchor="${l?'start':'end'}" class="build-pin-label">${PIN_TEXT[ep.pin]||ep.pin}</text>`;}
  }
  for(const w of state.wires){const a=point(w.from),b=point(w.to);if(!a||!b)continue;s+=`<g data-build-wire="${esc(w.id)}" class="build-wire${selected?.wire===w.id?' is-selected':''}"><path d="${wirePath(a,b)}" stroke="transparent" stroke-width="15"/><path d="${wirePath(a,b)}" stroke="${esc(w.color)}" stroke-width="4"/><circle cx="${a.x}" cy="${a.y}" r="3" fill="${esc(w.color)}"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="${esc(w.color)}"/></g>`;}
  for(const kind of ['resistor','led'])if(state.parts[kind])s+=svgPart(kind,state.parts[kind]);
  $('#build-viewport').innerHTML=s;setViewport();lastLED=null;
 }
 function setViewport(){const svg=$('#build-viewport');svg.setAttribute('viewBox',`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`);}
 function focusTargets(targets){
  if(!targets.length)return;
  if(view==='3d'){scene?.focusBuildTargets(targets);return;}
  const points=targets.flatMap(id=>{const kind=String(id).replace(/^component:/,'');const p=state.parts[kind];const w=state.wires.find(w=>w.id===id||'wire:'+w.id===id);return p?[p.a,p.b]:w?[w.from,w.to]:[id];}).map(point).filter(Boolean);
  if(!points.length)return;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),spanX=Math.max(...xs)-x,spanY=Math.max(...ys)-y;
  const box=$('#build-canvas-wrap').getBoundingClientRect(),ratio=box.width/Math.max(1,box.height);
  let w=Math.max(250,spanX+120),h=Math.max(230,spanY+120);if(w/h<ratio)w=h*ratio;else h=w/ratio;
  viewport={x:x+spanX/2-w/2,y:y+spanY/2-h/2,w,h};setViewport();
 }
 function syncScene(){
  if(!scene)return;
  const signature=JSON.stringify(state),targetSignature=JSON.stringify(highlights);
  if(signature!==sceneState){scene.setBuildState(copy(state));sceneState=signature;sceneHighlights='';sceneRunning=null;}
  if(targetSignature!==sceneHighlights){scene.setBuildHighlight(highlights);sceneHighlights=targetSignature;}
  if(running!==sceneRunning){scene.setBuildRunning(running);sceneRunning=running;}
 }
 function setMessage(text,type='neutral',targets=[]){message=text;tone=type;highlights=targets;renderFeedback();syncScene();renderSVG();}
 function renderFeedback(){$('#build-feedback').textContent=message;$('#build-feedback').dataset.tone=tone;$('#build-inline-feedback').textContent=message;$('#build-inline-feedback').hidden=tone!=='error';}
 function instruction(){if(selected?.wire)return'Wire selected. Remove it or choose another tool.';if(selected?.kind)return`${selected.kind==='led'?'LED':'Resistor'} selected. Choose a new hole${selected.kind==='led'?' for its anode (+)':''}.`;if(mode==='led')return flipped?'Tap a hole for the LED’s short leg (−).':'Tap a hole for the LED’s long leg (+).';if(mode==='resistor')return'Tap a hole for the first resistor lead.';return first?`${name(first)} → choose the other contact.`:'Tap two contacts to connect a wire.';}
 function sketch(){return `const int LED_PIN = 23;\nconst int INTERVAL_MS = ${state.interval};\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(INTERVAL_MS);\n  digitalWrite(LED_PIN, LOW);\n  delay(INTERVAL_MS);\n}`;}
 function render(){
  $('#build-instruction').textContent=instruction();
  $$('[data-build-tool]').forEach(b=>{const k=b.dataset.buildTool;b.setAttribute('aria-pressed',String(mode===k));b.classList.toggle('is-active',mode===k);b.querySelector('span').textContent=k==='wire'?'Wire':k==='led'?(state.parts.led?'Move LED':'LED'):(state.parts.resistor?'Move 330 Ω':'330 Ω');});
  $('#build-rotate').hidden=!['led','resistor'].includes(mode);$('#build-flip').hidden=mode!=='led'&&!selected?.kind?.includes('led');$('#build-remove').hidden=!selected;$('#build-cancel').hidden=!first&&!selected&&mode==='wire';
  $('#build-run').disabled=!check?.ok;$('#build-run').textContent=running?'Stop':'Run';$('#build-run').setAttribute('aria-pressed',String(running));$('#build-undo').disabled=!undo.length;
  $('#build-wire-count').textContent=String(state.wires.length);$('#build-wire-list').innerHTML=state.wires.length?state.wires.map(w=>`<div class="build-wire-row"><button data-build-wire-select="${esc(w.id)}"><i style="background:${esc(w.color)}"></i>${esc(name(w.from))} → ${esc(name(w.to))}</button><button data-build-wire-remove="${esc(w.id)}" aria-label="Remove wire from ${esc(name(w.from))} to ${esc(name(w.to))}">×</button></div>`).join(''):'<p class="build-small">No wires yet.</p>';
  $('#build-interval').value=String(state.interval);$('#build-interval-value').textContent=state.interval+' ms';$('#build-code').textContent=sketch();renderFeedback();renderSVG();syncScene();container.dataset.running=String(running);container.dataset.checked=String(!!check?.ok);container.dataset.tool=mode;
 }
 function stop(){running=false;if(sceneRunning!==false)scene?.setBuildRunning(false);sceneRunning=false;lastLED=null;}
 function edit(next,notice='Circuit changed. Check it before running.'){
  stop();undo.push(copy(state));if(undo.length>50)undo.shift();state=normalizeState(next);check=null;highlights=[];hintLevel=0;$('#build-hint-copy').hidden=true;$('#build-hint').textContent='Need a hint?';first=null;message=notice;tone='neutral';save();render();
 }
 function issue(d){if(d)setMessage(d.message||d.title,'error',d.targets||[]);return !!d;}
 function selectContact(id){if(!parseEndpoint(id))return;const kind=selected?.kind||(['led','resistor'].includes(mode)?mode:null);
  if(kind){const p=placement(kind,id,orientation,kind==='led'&&flipped);if(!p){setMessage('Choose a breadboard hole with room for both leads.','error',[id]);return;}if(issue(placementIssue(state,kind,p)))return;const next=copy(state);next.parts[kind]=p;selected=null;mode='wire';edit(next,`${kind==='led'?'LED':'Resistor'} placed. Use spare holes in its rows for wires.`);return;}
  selected=null;mode='wire';if(first===id){first=null;render();return;}if(!first){first=id;highlights=[id];render();return;}if(issue(wireIssue(state,first,id)))return;const next=copy(state);next.wires.push({id:'w'+(++wireCounter),from:first,to:id,color:$('#build-color').value});edit(next,'Wire connected.');
 }
 function partPose(kind){const p=state.parts[kind],a=parseEndpoint(p?.a),b=parseEndpoint(p?.b);orientation=!a||!b?0:b.row>a.row?0:b.row<a.row?180:b.column>a.column?90:270;flipped=false;}
 function selectPart(kind){if(!state.parts[kind])return;stop();selected={kind};mode=kind;partPose(kind);first=null;highlights=[state.parts[kind].a,state.parts[kind].b];render();}
 function selectWire(id){const w=state.wires.find(w=>w.id===id);if(!w)return;stop();selected={wire:id};mode='wire';first=null;highlights=[w.from,w.to];render();}
 function chooseTool(k){stop();mode=k;selected=state.parts[k]?{kind:k}:null;first=null;highlights=[];partPose(k);render();if(k!=='wire'){const p=state.parts[k];focusTargets(p?[p.a,p.b]:['bb:a1','bb:j15']);}}
 function removeSelected(){if(!selected)return;const next=copy(state);if(selected.kind)next.parts[selected.kind]=null;else next.wires=next.wires.filter(w=>w.id!==selected.wire);selected=null;mode='wire';edit(next,'Removed. Undo brings it back.');}
 function checkCircuit(){stop();check=validateCircuit(state);message=check.message||check.title;tone=check.ok?'success':'error';highlights=check.targets||[];first=null;selected=null;mode='wire';render();if(!check.ok)focusTargets(highlights);}
 function run(){if(running){stop();message='Stopped. Your checked circuit is ready.';render();return;}const fresh=validateCircuit(state);if(!check?.ok||!fresh.ok){checkCircuit();return;}running=true;startTime=performance.now();message='Circuit complete. GPIO23 is driving your LED.';tone='success';try{const done=JSON.parse(localStorage.getItem(COMPLETE)||'[]');localStorage.setItem(COMPLETE,JSON.stringify([...new Set([...(Array.isArray(done)?done:[]),'blink'])]));}catch{}render();}
 function freeContacts(){const busy=new Set([...Object.values(state.parts).filter(Boolean).flatMap(p=>[p.a,p.b]),...state.wires.flatMap(w=>[w.from,w.to])]);return endpoints.filter(e=>!busy.has(e));}
 function nextConnection(){
  const l=state.parts.led,r=state.parts.resistor;if(!l||!r)return null;
  const patterns=[[["pin:23",r.a],[r.b,l.a],[l.b,"pin:GND"]],[["pin:23",r.b],[r.a,l.a],[l.b,"pin:GND"]],[["pin:23",l.a],[l.b,r.a],[r.b,"pin:GND"]],[["pin:23",l.a],[l.b,r.b],[r.a,"pin:GND"]]];
  let best=null;
  for(const pattern of patterns){const trial=copy(state),added=[];let failed=false;
   const roots=new Map();const find=x=>{x=netOf(x);if(!roots.has(x))roots.set(x,x);let a=x;while(roots.get(a)!==a)a=roots.get(a);return a;};const join=(a,b)=>roots.set(find(a),find(b));
   state.wires.forEach(w=>join(w.from,w.to));
   for(const [a,b]of pattern){if(find(a)===find(b))continue;const occupied=new Set([...Object.values(trial.parts).filter(Boolean).flatMap(p=>[p.a,p.b]),...trial.wires.flatMap(w=>[w.from,w.to])]);const from=endpoints.filter(e=>!occupied.has(e)&&find(e)===find(a));const to=endpoints.filter(e=>!occupied.has(e)&&find(e)===find(b));let pair=null;for(const x of from){for(const y of to){if(!wireIssue(trial,x,y)){pair=[x,y];break;}}if(pair)break;}if(!pair){failed=true;break;}trial.wires.push({id:'hint'+added.length,from:pair[0],to:pair[1],color:COLORS[0]});added.push(pair);join(...pair);}
   if(!failed&&validateCircuit(trial).ok&&added.length&&(!best||added.length<best.length))best=added;
  }return best?.[0]||null;
 }
 function hint(){hintLevel=Math.min(3,hintLevel+1);const result=validateCircuit(state),l=state.parts.led,r=state.parts.resistor;let text='',targets=[];
  if(!r||!l){const missing=!r?'resistor':'led',anchor=missing==='resistor'?'bb:c6':'bb:e9';const proposed=placement(missing,anchor,0,false);const available=proposed&&!placementIssue(state,missing,proposed);text=hintLevel===1?'Start with the LED and the resistor. Both leads of each part need separate electrical rows.':hintLevel===2?`Choose ${missing==='resistor'?'330 Ω':'LED'} from the tray, then choose a hole on the breadboard.`:available?`One possible position: ${missing==='resistor'?'resistor':'LED anode (+)'} at ${name(anchor)}. Other rows work too.`:'Choose two free rows for the missing part. Move a placed part if you need more room.';if(hintLevel>=2&&available)targets=[proposed.a,proposed.b];
  }else if(result.ok){text='You have a complete path with the LED and resistor in series. Press Check, then Run.';}
  else if(hintLevel===1){text='The path must run from GPIO23, through the resistor and LED, back to GND. The resistor can be on either side of the LED.';}
  else if(hintLevel===2){text=result.message||result.title;targets=result.targets||[];}
  else{const next=nextConnection();if(next){text=`Try a wire from ${name(next[0])} to ${name(next[1])}. Other free holes in those same strips also work.`;targets=next;}else{text=result.message||'Check LED polarity and remove any wire that bypasses a part.';targets=result.targets||[];}}
  $('#build-hint-copy').hidden=false;$('#build-hint-copy').textContent=text;$('#build-hint').textContent=hintLevel<3?'Another hint':'Show hint again';highlights=targets;syncScene();renderSVG();focusTargets(targets);
 }
 function setView(next){view=next;$('#build-viewport').toggleAttribute('hidden',view!=='top');$('#build-scene3d').hidden=view!=='3d';$('#build-top').setAttribute('aria-pressed',String(view==='top'));$('#build-3d').setAttribute('aria-pressed',String(view==='3d'));$('.build-pan-note').textContent=view==='top'?'Drag empty space to pan':'Drag to rotate';
  if(view==='3d'&&!scene){try{scene=createScene($('#build-scene3d'),{buildMode:true,onBuildEndpoint:selectContact,onBuildPart:selectPart,onBuildWire:selectWire});if(!$('#build-scene3d canvas'))throw new Error('WebGL unavailable');sceneState='';sceneHighlights='';sceneRunning=null;syncScene();}catch{scene?.dispose?.();scene=null;$('#build-scene3d').replaceChildren();setView('top');setMessage('3D is unavailable here. You can still build and run in Top view.');}}
 }
 function zoom(factor){if(view==='3d'){scene?.zoom(factor<1?.12:-.12);return;}const nw=Math.max(260,Math.min(1100,viewport.w*factor)),nh=viewport.h*nw/viewport.w;viewport={x:viewport.x+(viewport.w-nw)/2,y:viewport.y+(viewport.h-nh)/2,w:nw,h:nh};setViewport();}
 function fit(){if(view==='3d')scene?.reset();else{viewport=copy(full);setViewport();}}
 function picker(){const area=$('#build-area').value;$('#build-pin-label').hidden=area!=='board';$('#build-column-label').hidden=area!=='boardholes';$('#build-row-label').hidden=area!=='boardholes';$('#build-rail-label').hidden=area!=='rails';$('#build-rail-index-label').hidden=area!=='rails';}
 container.addEventListener('click',onClick);
 function onClick(e){const tool=e.target.closest('[data-build-tool]');if(tool){chooseTool(tool.dataset.buildTool);return;}const quick=e.target.closest('[data-build-endpoint]');if(quick){selectContact(quick.dataset.buildEndpoint);return;}const wire=e.target.closest('[data-build-wire-select]');if(wire){selectWire(wire.dataset.buildWireSelect);return;}const remove=e.target.closest('[data-build-wire-remove]');if(remove){selected={wire:remove.dataset.buildWireRemove};removeSelected();return;}}
 const svg=$('#build-viewport');
 svg.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;pan={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,view:copy(viewport),target:e.target,dragged:false};svg.setPointerCapture(e.pointerId);});
 svg.addEventListener('pointermove',e=>{const target=e.target.closest('[data-build-contact]');if(target&&!pan){$('#build-contact-tip').textContent=name(target.dataset.buildContact);$('#build-contact-tip').style.opacity='1';}else $('#build-contact-tip').style.opacity='0';if(!pan||pan.id!==e.pointerId)return;const dx=e.clientX-pan.startX,dy=e.clientY-pan.startY;if(Math.hypot(dx,dy)>7)pan.dragged=true;if(!pan.dragged)return;const r=svg.getBoundingClientRect(),scale=Math.min(r.width/pan.view.w,r.height/pan.view.h);viewport={...pan.view,x:Math.max(-250,Math.min(800,pan.view.x-dx/scale)),y:Math.max(-250,Math.min(740,pan.view.y-dy/scale))};setViewport();});
 svg.addEventListener('pointerup',e=>{if(!pan||pan.id!==e.pointerId)return;const current=pan;pan=null;if(current.dragged)return;const part=current.target.closest('[data-build-part]'),wire=current.target.closest('[data-build-wire]'),contact=current.target.closest('[data-build-contact]');if(part)selectPart(part.dataset.buildPart);else if(wire)selectWire(wire.dataset.buildWire);else if(contact)selectContact(contact.dataset.buildContact);});
 svg.addEventListener('pointercancel',()=>{pan=null;});svg.addEventListener('pointerleave',()=>$('#build-contact-tip').style.opacity='0');
 $('#build-open-picker').onclick=()=>{$('#build-contact-picker').open=true;$('#build-area').focus();$('#build-contact-picker').scrollIntoView({block:'nearest',behavior:'instant'});};
 $('#build-top').onclick=()=>setView('top');$('#build-3d').onclick=()=>setView('3d');$('#build-zoom-in').onclick=()=>zoom(.8);$('#build-zoom-out').onclick=()=>zoom(1.25);$('#build-fit').onclick=fit;
 $('#build-check').onclick=checkCircuit;$('#build-run').onclick=run;$('#build-hint').onclick=hint;$('#build-exit').onclick=onExit;
 $('#build-cancel').onclick=()=>{selected=null;first=null;mode='wire';highlights=[];render();};$('#build-remove').onclick=removeSelected;
 $('#build-rotate').onclick=()=>{orientation=(orientation+90)%360;message=`Footprint rotated to ${orientation}°. Choose its first hole.`;tone='neutral';render();};
 $('#build-flip').onclick=()=>{if(state.parts.led&&selected?.kind==='led'){const next=copy(state);[next.parts.led.a,next.parts.led.b]=[next.parts.led.b,next.parts.led.a];edit(next,'LED polarity reversed.');partPose('led');}else{flipped=!flipped;message=flipped?'The cathode (−) will be placed first.':'The anode (+) will be placed first.';render();}};
 $('#build-undo').onclick=()=>{if(!undo.length)return;stop();state=undo.pop();check=null;first=null;selected=null;highlights=[];hintLevel=0;$('#build-hint-copy').hidden=true;message='Undone. Check the circuit before running.';tone='neutral';save();render();};
 $('#build-reset').onclick=()=>{selected=null;mode='wire';edit(initialState(),'Fresh breadboard. Undo restores your previous circuit.');};
 $('#build-area').onchange=picker;$('#build-use-contact').onclick=()=>{const a=$('#build-area').value;selectContact(a==='board'?$('#build-pin').value:a==='boardholes'?`bb:${$('#build-column').value}${$('#build-row').value}`:`rail:${$('#build-rail').value}:${$('#build-rail-index').value}`);};
 $('#build-interval').oninput=()=>{const next=copy(state);next.interval=Number($('#build-interval').value);if(next.interval!==state.interval)edit(next,'Timing changed. Check before running.');};
 $('#build-download').onclick=()=>{const url=URL.createObjectURL(new Blob([sketch()],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download='build-blink.ino';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function key(e){if(document.querySelector('dialog[open]')||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Escape'){first=null;selected=null;mode='wire';highlights=[];render();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){e.preventDefault();$('#build-undo').click();}}
 container.addEventListener('keydown',key);
 function hidden(){if(document.hidden&&running){stop();message='Paused while the page is hidden.';render();}}
 document.addEventListener('visibilitychange',hidden);
 function tick(now){if(!active)return;animation=requestAnimationFrame(tick);const lit=running&&Math.floor((now-startTime)/state.interval)%2===0;if(lit!==lastLED){lastLED=lit;const bulb=$('.build-led-bulb');if(bulb){bulb.setAttribute('fill',lit?'#ff8053':'#b85d48');bulb.classList.toggle('is-lit',lit);}}}
 render();picker();animation=requestAnimationFrame(tick);
 return{getState:()=>copy(state),isRunning:()=>running,dispose(){active=false;stop();cancelAnimationFrame(animation);scene?.dispose();scene=null;document.removeEventListener('visibilitychange',hidden);container.removeEventListener('click',onClick);container.removeEventListener('keydown',key);container.innerHTML='';container.classList.remove('build-workspace');}};
}
