import { lessons, parts } from './lessons.js';
import { createScene } from './scene.js';
import { mountBuild } from './build.js';
import { BUILD_PROJECTS } from './build-projects.js';
import { guides } from './guides.js';
import { renderCircuitDiagram, renderBreadboardDiagram } from './diagrams.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
book:'<path d="M12 6C9 3 5 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 2Zm0 0v15"/>',
chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx=".5"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
settings:'<path d="m10 3-1 3-3 1-3 2 2 3-1 4 4 1 2 4 3-2 4 1 1-4 3-2-2-3 1-4-4-1-2-3z"/><circle cx="12" cy="12" r="3"/>',
help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
hand:'<path d="M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-4-1-6-4l-3-4a2 2 0 0 1 3-2l1 1"/>',
tag:'<path d="m3 3 8 1 10 10-7 7L4 11z"/><circle cx="8" cy="8" r="1"/>',activity:'<path d="M2 12h4l3-8 6 16 3-8h4"/>',minus:'<path d="M5 12h14"/>',plus:'<path d="M5 12h14m-7-7v14"/>',reset:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',play:'<path d="m8 4 12 8-12 8z" fill="currentColor" stroke="none"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',bulb:'<path d="M9 18v-2a7 7 0 1 1 6 0v2m-6 0h6m-5 3h4M12 9v4"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 4H6a2 2 0 0 0-2 2v9"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',wifi:'<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".7"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.chip}</svg>`;
const fillIcons = (root=document) => root.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon)});
fillIcons();
let completed = new Set(), settings={labels:false,flow:false,sound:false};
try {completed=new Set(JSON.parse(localStorage.getItem('field-lab-progress')||'[]').filter(id=>lessons.some(l=>l.id===id)));settings={...settings,...JSON.parse(localStorage.getItem('field-lab-settings')||'{}')};} catch {}
let lesson=lessons[0], tab='overview', running=false, value=50, pressed=false, serialTimer=null, serialCount=0, logs=[], scene=null, audioContext=null, voice=null, toastTimer=null, simulationStart=0, guideIndex=null, tabScroll={};
const buildProjectIds=new Set(BUILD_PROJECTS.map(project=>project.id));
let buildActive=false, builder=null, buildProjectId='blink';
function buildFromHash(){const id=location.hash.replace(/^#build-/,'');return location.hash.startsWith('#build-')&&buildProjectIds.has(id)?id:null;}
function persist(){try{localStorage.setItem('field-lab-progress',JSON.stringify([...completed]));localStorage.setItem('field-lab-settings',JSON.stringify(settings));}catch{$('.saved').innerHTML='Progress available this session';}}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
function art(id){
 const common='<path d="M15 65h70" stroke="#b7c1a4" stroke-dasharray="2 3"/>';
 const board='<g transform="translate(33 5)"><rect x="-4" y="5" width="42" height="61" rx="4" fill="#174e46" stroke="#0e3b35"/><path d="M-8 11v49m50-49v49" stroke="#b7a16b" stroke-width="5" stroke-dasharray="3 3"/><rect x="2" y="19" width="30" height="26" rx="2" fill="#c5cec0" stroke="#94a798"/><path d="M4 14V9h5v5h5V9h5v5h5V9h7" stroke="#bdac78"/><path d="M9 29h17m-15 5h13m-11 4h8" stroke="#7b9185"/><rect x="9" y="58" width="16" height="10" rx="2" fill="#c2c6b8" stroke="#91a08a"/><rect x="10" y="48" width="11" height="7" fill="#22392d" stroke="none"/></g>';
 const led=color=>`<path d="M42 43v21m15-21v21" stroke="#a6aca0" stroke-width="2"/><path d="M36 39V26a13 13 0 0 1 26 0v13Z" fill="${color}" stroke="#ad8161"/><ellipse cx="49" cy="40" rx="15" ry="4" fill="${color}" stroke="#ad8161"/><path d="M42 27c0-5 3-8 6-8" stroke="#fff" stroke-width="3" opacity=".6"/>`;
 const arts={board,blink:led('#e49b76')+'<g transform="translate(69 38)"><path d="M0 0v27" stroke="#acb09f"/><rect x="-4" y="7" width="8" height="14" rx="3" fill="#dfc091" stroke="#ae9068"/><path d="M-3 10h6m-6 6h6" stroke="#8d6454"/></g>',rgb:led('#a5bbcf')+'<path d="M47 45v18m5-18v18" stroke="#a6aca0"/><circle cx="79" cy="25" r="4" fill="#d88e7c" stroke="none"/><circle cx="84" cy="36" r="4" fill="#9db98c" stroke="none"/><circle cx="80" cy="47" r="4" fill="#86aebc" stroke="none"/>',button:'<path d="M29 42v18m40-18v18M29 19v8m40-8v8" stroke="#aaa991" stroke-width="3"/><path d="m28 28 23-11 23 12v19L51 59 28 46z" fill="#354a42" stroke="#243d32"/><path d="m28 28 23 12 23-11m-23 11v19" stroke="#819283"/><ellipse cx="51" cy="28" rx="13" ry="8" fill="#9aa28f"/><path d="M38 27v-8a13 7 0 0 1 26 0v8" fill="#708a70"/><ellipse cx="51" cy="18" rx="13" ry="7" fill="#91a98b" stroke="#6e8265"/>',potentiometer:'<path d="M36 52v13m14-11v11m14-13v13" stroke="#b4ad8f" stroke-width="3"/><ellipse cx="50" cy="45" rx="24" ry="13" fill="#729c94"/><path d="M26 40v-7a24 13 0 0 1 48 0v7a24 13 0 0 1-48 0" fill="#9dbbb0" stroke="#638e81"/><ellipse cx="50" cy="31" rx="24" ry="13" fill="#c2cfb8" stroke="#739785"/><path d="M44 30V9a6 4 0 0 1 12 0v21" fill="#bac3b3" stroke="#8b9d8d"/><ellipse cx="50" cy="9" rx="6" ry="3" fill="#d6ddce"/>',light:'<path d="M40 46v18m18-18v18" stroke="#b4b29b" stroke-width="2"/><circle cx="49" cy="32" r="21" fill="#d6b386" stroke="#c19265"/><path d="M39 17v29h6V19h7v27h7V18" stroke="#936950" stroke-width="3"/><path d="m77 14 5-5m-3 19h9m-10 8 6 5" stroke="#c5b361"/>',distance:'<rect x="15" y="17" width="71" height="36" rx="3" fill="#6b9b9c" stroke="#517e83"/><circle cx="33" cy="34" r="15" fill="#bdc9c1" stroke="#8d9e92"/><circle cx="33" cy="34" r="11" fill="#5e7067"/><circle cx="68" cy="34" r="15" fill="#bdc9c1" stroke="#8d9e92"/><circle cx="68" cy="34" r="11" fill="#5e7067"/><path d="M43 53v12m6-12v12m6-12v12m6-12v12" stroke="#c2ad76"/>',sound:'<path d="M41 49v17m17-17v17" stroke="#a9b199" stroke-width="2"/><path d="M28 28v18a22 12 0 0 0 44 0V28" fill="#2b473c"/><ellipse cx="50" cy="28" rx="22" ry="13" fill="#466153" stroke="#2b473c"/><ellipse cx="50" cy="28" rx="5" ry="3" fill="#1f362c"/><path d="m79 20 5-4m-4 12h7m-9 7 5 4" stroke="#a3ab75"/>',temperature:'<rect x="33" y="9" width="34" height="45" rx="5" fill="#a4c2aa" stroke="#739a80"/><path d="M40 17h20m-20 7h20m-20 7h20m-20 7h20m-20 7h20" stroke="#597d65" stroke-width="3"/><path d="M40 54v12m7-12v12m7-12v12m7-12v12" stroke="#b3ad8f"/>',servo:'<rect x="26" y="29" width="47" height="28" rx="4" fill="#779bab" stroke="#4e7489"/><rect x="21" y="33" width="57" height="6" rx="2" fill="#8dafbb"/><path d="M52 28V17" stroke="#e9e6d8" stroke-width="9"/><path d="M34 16h35" stroke="#e9e6d8" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="16" r="4" fill="#c8c9b8"/><path d="M27 49C11 49 24 65 11 65" stroke="#cc9862" stroke-width="2"/>',motor:'<path d="M26 27h44v24H26z" fill="#bec6b7" stroke="#829784"/><ellipse cx="26" cy="39" rx="8" ry="12" fill="#dde0d1" stroke="#a4b29b"/><ellipse cx="70" cy="39" rx="8" ry="12" fill="#a5b59e" stroke="#829784"/><path d="M70 39h18" stroke="#a1a98e" stroke-width="5"/><path d="M22 43C5 43 14 63 4 63m22-26C11 37 17 18 5 18" stroke="#c28b59" stroke-width="2"/>',stepper:'<circle cx="51" cy="35" r="24" fill="#b0c1b0" stroke="#80977f"/><circle cx="51" cy="35" r="10" fill="#d8dfcf" stroke="#91a18a"/><path d="M51 35V14" stroke="#c4c7b6" stroke-width="7"/><path d="M31 51v14m40-14v14" stroke="#9ea994" stroke-width="5"/>',plant:'<path d="M35 37h29l-5 27H40z" fill="#c69370" stroke="#ac7a55"/><path d="M49 38V17m0 12C24 29 30 11 49 25m0 1C69 22 70 6 49 18" fill="#7f9c67" stroke="#668653"/><rect x="68" y="40" width="26" height="19" rx="2" fill="#4f7168"/><rect x="71" y="43" width="20" height="12" fill="#1d3e34"/><path d="M74 48h14m-14 4h8" stroke="#b7c99b"/>',force:'<path d="M45 37v30h10V37" fill="#bdad78" stroke="#a09063"/><circle cx="50" cy="26" r="19" fill="#415748" stroke="#677d60"/><circle cx="50" cy="26" r="14" fill="#283d30" stroke="#90a07d"/>',wifi:board+'<path d="M80 15q8 5 0 12m5-17q15 11 0 22" stroke="#8aa861" stroke-width="2"/>',piano:'<rect x="14" y="20" width="73" height="37" rx="3" fill="#f9f9ef" stroke="#b2bca6"/><path d="M26 21v35m12-35v35m12-35v35m12-35v35m12-35v35" stroke="#bac4ae"/><path d="M25 21v19m12-19v19m25-19v19m12-19v19" stroke="#3a5140" stroke-width="6"/>'};
 return `<svg viewBox="0 0 100 75" aria-hidden="true">${common}${arts[id]||board}</svg>`;
}
function buildLaunch(){return lesson.id==='board'||buildProjectIds.has(lesson.id)?'<button class="build-launch" data-nav="build">Build a circuit <span>↗</span></button>':'';}
function card(l,i){return `<button class="lesson-card ${l.id===lesson.id?'active':''}" data-lesson="${l.id}" ${l.id===lesson.id?'aria-current="step"':''}><div class="card-art"><span class="card-num">${String(i+1).padStart(2,'0')}</span>${art(l.id)}${completed.has(l.id)?'<span class="card-tag" aria-label="Completed">✓</span>':l.id===lesson.id?'':''}</div><div class="card-copy"><strong>${esc(l.shortTitle||l.title)}</strong><span>${esc(l.duration)}${completed.has(l.id)?icon('check'):icon('right')}</span></div></button>`;}
function renderShelf(){const left=$('#lesson-cards').scrollLeft;$('#lesson-cards').innerHTML=lessons.map(card).join('');$('#lesson-cards').scrollLeft=left;$('#progress-label').innerHTML=`${completed.size} <em>/ ${lessons.length} lessons</em>`;$('#progress-bar').style.width=`${completed.size/lessons.length*100}%`;}
function controlHTML(){let html=lesson.id==='board'?'<button class="experiment-button" id="reset-device">Press EN · Restart board</button>':'';if(lesson.control&&lesson.id!=='piano'){const c=lesson.control;html=`<div class="control-box"><label for="experiment-value">${esc(c.label)}${lesson.id==='blink'?'<span class="control-constant">INTERVAL_MS</span>':''}<output id="value-output">${value} ${esc(c.unit)}</output></label><input id="experiment-value" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${value}"${lesson.id==='blink'?' aria-describedby="blink-control-note"':''}>${lesson.id==='blink'?'<p class="control-note" id="blink-control-note">Updates the demo and example code. No code is compiled.</p>':''}</div>`;}if(lesson.id==='button')html+='<button class="experiment-button" id="press-button">Hold to press the button</button>';if(lesson.id==='wifi')html+='<button class="experiment-button" id="wifi-toggle">Toggle virtual LED</button>';if(lesson.id==='piano')html+='<div class="piano-keys" aria-label="Mini piano">'+['C','D','E','F','G','A','B','C↑'].map((n,i)=>`<button data-note="${i}" aria-label="Play ${n}">${n}</button>`).join('')+'</div>';if(['sound','piano'].includes(lesson.id))html+=`<button class="quiet-btn audio-toggle" id="toggle-audio" aria-pressed="${settings.sound}">Sound ${settings.sound?'on':'off'}</button>`;return html;}
function serialHTML(){return running?`<section class="serial" aria-label="Serial monitor"><header>Simulation output</header><div class="serial-lines" id="serial-lines">${logs.map(l=>`<p>${esc(l)}</p>`).join('')}</div></section>`:'';}
function currentSketch(){
 const targets={blink:'INTERVAL_MS',rgb:'HUE_DEGREES',sound:'FREQUENCY_HZ',motor:'DUTY',servo:'TARGET_ANGLE',stepper:'TARGET_DEGREES'};
 const constant=targets[lesson.id];
 if(!constant)return lesson.code;
 const n=lesson.id==='motor'?Math.round(value/100*255):Math.round(value);
 return lesson.code.replace(new RegExp('(const int '+constant+' = )\\d+(;)'),(_,before,after)=>before+n+after);
}
function sketchPreview(){
 const preview=currentSketch().split('\n').filter(line=>!line.startsWith('//')).slice(0,8).join('\n');
 return `<div class="code-preview"><div class="code-actions"><span>${esc(lesson.id)}.ino</span><button id="open-code" aria-label="Open full sketch">Code ↗</button></div><pre tabindex="0" aria-label="Sketch preview"><code>${highlight(preview)}</code></pre></div>`;
}
function completionButton(){return `<button class="complete-button" id="check-understanding">${icon(completed.has(lesson.id)?'check':'book')}${completed.has(lesson.id)?'Completed · Review':'Check understanding'}</button>`;}
function guideLaunch(){return `<button class="visual-guide-launch" data-open-guide aria-controls="visual-guide" aria-expanded="${guideIndex!==null}">${icon('chip')} Show the connections</button>`;}
function syncGuideUI(){
 const step=guideIndex===null?null:guides[lesson.id]?.[guideIndex];
 document.querySelectorAll('[data-open-guide]').forEach(b=>b.setAttribute('aria-expanded',String(!!step)));
 document.querySelectorAll('[data-guide-connection]').forEach(b=>{const active=!!step&&Number(b.dataset.guideConnection)===step.connection;b.setAttribute('aria-pressed',String(active));b.closest('tr')?.classList.toggle('is-focused',active);});
}
function sizeGuide(){if(guideIndex!==null)$('.scene-panel').style.setProperty('--guide-panel-height',Math.ceil($('#visual-guide').getBoundingClientRect().height+16)+'px');}
function closeGuide({restore=true}={}){
 const wasOpen=guideIndex!==null;guideIndex=null;$('#visual-guide').hidden=true;$('.scene-panel').classList.remove('guide-open');
 if(restore&&wasOpen)scene?.clearFocus();syncGuideUI();
 if($('#scene-action-hint'))$('#scene-action-hint').hidden=!$('#schematic').hidden||!lesson.interaction;
}
function openGuide(index=0,{scroll=true}={}){
 const steps=guides[lesson.id],step=steps?.[index];if(!step)return;
 if(running)stopSimulation();showView(false);guideIndex=index;
 $('#inspector').hidden=true;$('#hover-tip').hidden=true;$('#scene-action-hint').hidden=true;
 $('#guide-position').textContent=`CONNECTIONS / ${index+1} OF ${steps.length}`;
 $('#guide-title').textContent=step.title;$('#guide-text').textContent=step.text;
 $('#guide-prev').disabled=index===0;$('#guide-next').textContent=index===steps.length-1?'Done ✓':'Next →';
 $('#visual-guide').hidden=false;$('#visual-guide').scrollTop=0;$('.scene-panel').classList.add('guide-open');sizeGuide();
 const result=scene?.focus(step);if(result?.unresolved.length)console.warn('Missing guide targets',lesson.id,step.id,result.unresolved);
 syncGuideUI();
 if(scroll&&matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(guideIndex!==null)window.scrollTo({top:Math.max(0,window.scrollY+$('.scene-panel').getBoundingClientRect().top-12),behavior:'instant'});}));
}
new ResizeObserver(sizeGuide).observe($('#visual-guide'));
$('#close-guide').onclick=()=>closeGuide();
$('#guide-prev').onclick=()=>openGuide(guideIndex-1,{scroll:false});
$('#guide-next').onclick=()=>{if(guideIndex===guides[lesson.id].length-1)closeGuide();else openGuide(guideIndex+1,{scroll:false});};
function renderContent({preserveScroll=false}={}){
 const c=$('#lesson-content'),scroll=preserveScroll?c.scrollTop:0,l=lesson.learning;
 if(tab==='overview'){
  const facts=lesson.id==='board'?`<div class="board-facts"><p><b>USB</b> powers the board and uploads your code.</p><p><b>GPIO pins</b> connect sensors, buttons and LEDs.</p><p><b>3.3 V logic.</b> Never apply 5 V to a GPIO pin.</p></div>`:'';
  c.innerHTML=`<p class="lesson-description">${esc(lesson.description)}</p>${controlHTML()}${serialHTML()}${guideLaunch()}${buildLaunch()}${facts}${l?`<section class="try-it"><h3>Watch for</h3><p>${esc(l.experiment.observe.split(/(?<=[.!?])\s/)[0])}</p></section>`:''}<button class="quiet-btn" id="open-learn">Explore the lesson →</button>${lesson.id==='board'?sketchPreview():''}`;
 }else if(tab==='learn'){
  c.innerHTML=`<div class="lesson-learning">${guideLaunch()}${l?`<section class="learning-section"><h3>Before you try</h3><p>${esc(l.experiment.prediction)}</p></section>${l.concepts.map(x=>`<section class="learning-section"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></section>`).join('')}<section class="learning-section"><h3>Try and observe</h3><p>${esc(l.experiment.action)}</p><p>${esc(l.experiment.observe)}</p><p>${esc(l.experiment.why)}</p><button class="quiet-btn" id="try-experiment">Try it in the simulation →</button></section>`:''}${l?.mapping?`<details class="details-block"><summary>Key, pin and note map</summary><table class="pinout-table"><thead><tr><th>KEY</th><th>GPIO</th><th>INDEX</th><th>NOTE</th></tr></thead><tbody>${l.mapping.map(x=>`<tr><td>${esc(x.key)}</td><td>${esc(x.gpio)}</td><td>${esc(x.index)}</td><td>${esc(x.frequency)}</td></tr>`).join('')}</tbody></table></details>`:''}<section class="learning-section"><h3>Read the sketch</h3><p>${esc(lesson.explanation)}</p><button class="quiet-btn" id="open-code">Open code ↗</button></section>${['blink','button','potentiometer','rgb','light','distance','sound','piano','temperature','force'].includes(lesson.id)?`<details class="details-block"><summary>How breadboard connections work</summary>${renderBreadboardDiagram()}</details>`:''}<details class="details-block"><summary>Build it on your board</summary><ol class="steps">${lesson.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></details>${l?`<details class="details-block"><summary>Troubleshooting</summary><ul class="steps">${l.troubleshooting.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}${l?.snippets?.map((x,i)=>`<details class="details-block"><summary>${esc(x.title)}</summary><p class="code-note">${esc(x.description)}</p><div class="code-actions"><span>Arduino sketch</span><div><button data-copy-snippet="${i}">${icon('copy')} Copy</button><button data-download-snippet="${i}" aria-label="Download ${esc(x.title)} sketch">${icon('download')}</button></div></div><pre tabindex="0" aria-label="${esc(x.title)} sketch"><code>${highlight(x.code)}</code></pre></details>`).join('')||''}<section class="learning-section"><h3>Take it further</h3><p>${esc(lesson.challenge)}</p></section>${l?`<p class="takeaway">${esc(l.takeaway)}</p>`:''}${buildProjectIds.has(lesson.id)?buildLaunch():''}${completionButton()}</div>`;
 }else if(tab==='pinout')c.innerHTML=`<table class="pinout-table"><thead><tr><th>PIN / SOURCE</th><th>CONNECTION</th></tr></thead><tbody>${lesson.wiring.map((w,i)=>`<tr><td><button class="pinout-focus" data-guide-connection="${i}" aria-pressed="false" aria-label="Show ${esc(w.from)} to ${esc(w.to)} on the device">${esc(w.from)} ${icon('right')}</button></td><td>${esc(w.to)}<small>${esc(w.note)}</small></td></tr>`).join('')}</tbody></table><p class="code-note">GPIO uses 3.3 V and is not 5 V tolerant. Power down before changing connections.</p><hr class="content-divider">${lesson.specs.map(x=>`<div class="spec-row"><span>${esc(x.label)}</span><strong>${esc(x.value)}</strong></div>`).join('')}`;
 else c.innerHTML=`<div class="code-actions"><span>${esc(lesson.id)}.ino</span><div><button id="copy-code" title="Copy sketch">${icon('copy')} Copy</button><button id="download-code" aria-label="Download Arduino sketch" title="Download sketch">${icon('download')}</button></div></div><pre tabindex="0" aria-label="Arduino C++ example"><code>${highlight(currentSketch())}</code></pre><p class="code-note">${esc(lesson.explanation)}</p><details class="details-block"><summary>About this example</summary><p class="code-note">Arduino-ESP32 3.x. Run demonstrates the lesson scenario; it does not compile C++. Sensor values represent conditions around the device; output settings update the sketch.</p></details>${controlHTML()}${serialHTML()}`;
 bindContent();syncControls();syncGuideUI();c.scrollTop=scroll;
}
function highlight(code){const token=/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|\b(?:void|int|const|float|bool|unsigned|long|if|else|for|while|return|include|define|HIGH|LOW|OUTPUT|INPUT_PULLUP|INPUT|true|false|uint8_t|uint16_t|uint32_t|String)\b|\b\d+(?:\.\d+)?\b/g;let result='',start=0;for(const m of code.matchAll(token)){result+=esc(code.slice(start,m.index));let cls=m[0].startsWith('/')?'comment':m[0].startsWith('"')?'string':/^\d/.test(m[0])?'number':'keyword';result+=`<span class="code-${cls}">${esc(m[0])}</span>`;start=m.index+m[0].length;}return result+esc(code.slice(start));}
function bindContent(){
 $('#open-code')?.addEventListener('click',()=>selectTab('code'));
 $('#open-learn')?.addEventListener('click',()=>selectTab('learn'));
 $('#try-experiment')?.addEventListener('click',()=>{selectTab('overview');startSimulation();if(matchMedia('(max-width:760px)').matches)$('.scene-panel').scrollIntoView({block:'start',behavior:'instant'});});
 $('#reset-device')?.addEventListener('click',()=>handleSceneInteraction({type:'reset'}));
 $('#toggle-audio')?.addEventListener('click',()=>{settings.sound=!settings.sound;persist();$('#toggle-audio').textContent='Sound '+(settings.sound?'on':'off');$('#toggle-audio').setAttribute('aria-pressed',String(settings.sound));if(!settings.sound)stopTone();else if(running&&lesson.id==='sound')tone(value);});
 $('#experiment-value')?.addEventListener('input',e=>applyValue(Number(e.target.value)));
 $('#copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(currentSketch());toast('Sketch copied');}catch{toast('Select the code and copy it using your browser.');}});
 $('#download-code')?.addEventListener('click',()=>download(`${lesson.id}.ino`,currentSketch(),'text/plain'));
 $('#check-understanding')?.addEventListener('click',showQuiz);
 document.querySelectorAll('[data-copy-snippet]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(lesson.learning.snippets[Number(b.dataset.copySnippet)].code);toast('Sketch copied');}catch{toast('Select the code and copy it using your browser.');}});
 document.querySelectorAll('[data-download-snippet]').forEach(b=>b.onclick=()=>download(`${lesson.id}-helper-${Number(b.dataset.downloadSnippet)+1}.ino`,lesson.learning.snippets[Number(b.dataset.downloadSnippet)].code,'text/plain'));
 const pressButton=$('#press-button');
 if(pressButton)bindPressControl(pressButton,'#press-button',()=>handleSceneInteraction({type:'press',pressed:true}),()=>handleSceneInteraction({type:'press',pressed:false}));
 $('#wifi-toggle')?.addEventListener('click',()=>handleSceneInteraction({type:'toggle'}));
 cForNotes();
}

function bindPressControl(button,selector,down,up){
 const press=e=>{
  if(e.repeat)return;e.preventDefault();down();
  const current=$(selector);if(e.pointerId!==undefined){try{current?.setPointerCapture(e.pointerId);}catch{}}else current?.focus({preventScroll:true});
 };
 button.addEventListener('pointerdown',press);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
 button.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter')press(e);});
 button.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();up();}});
 button.addEventListener('blur',()=>{if(pressed&&running)up();});
}
function cForNotes(){
 document.querySelectorAll('[data-note]').forEach(btn=>{
  const n=Number(btn.dataset.note);
  bindPressControl(btn,`[data-note="${n}"]`,()=>handleSceneInteraction({type:'press',pressed:true,value:n/7*100}),()=>handleSceneInteraction({type:'press',pressed:false}));
 });
}
function tone(freq){if(!settings.sound)return;stopTone();try{audioContext ||=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;g.gain.value=.05;o.connect(g);g.connect(audioContext.destination);o.start();voice={o,g};}catch{}}
function stopTone(){if(voice){try{voice.o.stop();voice.o.disconnect();voice.g.disconnect();}catch{}voice=null;}}

function syncControls(){
 const c=lesson.control;
 if($('#toggle-audio')){$('#toggle-audio').textContent='Sound '+(settings.sound?'on':'off');$('#toggle-audio').setAttribute('aria-pressed',String(settings.sound));}
 if($('#experiment-value'))$('#experiment-value').value=String(value);
 if($('#value-output'))$('#value-output').textContent=`${value}${c?.unit==='°'?'':' '}${c?.unit||''}`;
 if($('#wifi-toggle'))$('#wifi-toggle').textContent=`Virtual LED is ${pressed?'on · Turn off':'off · Turn on'}`;
 if($('#press-button'))$('#press-button').textContent=pressed?'Pressed — GPIO reads LOW':'Hold to press the button';
 document.querySelectorAll('[data-note]').forEach(b=>{b.classList.toggle('is-pressed',pressed&&Number(b.dataset.note)===value);b.setAttribute('aria-pressed',String(pressed&&Number(b.dataset.note)===value));});
}
function applyValue(next,{log=true}={}){
 const c=lesson.control;if(!c)return;
 value=Number(Math.min(c.max,Math.max(c.min,c.min+Math.round((next-c.min)/c.step)*c.step)).toFixed(3));
 updateSceneValue();syncControls();
 const code=$('#lesson-content pre code');if(code&&tab==='code')code.innerHTML=highlight(currentSketch());
 if(running){if(lesson.id==='sound')tone(value);if(lesson.id==='blink'){simulationStart=performance.now();scene?.setRunning(true);}if(log)logState();}
}
function handleSceneInteraction(event){
 if(event.type==='reset'){
  stopSimulation(false);startSimulation();logs.unshift('EN pressed · setup() runs again');renderLogs();return;
 }
 if(event.type==='press'&&!event.pressed){pressed=false;scene?.setPressed(false);stopTone();syncControls();if(running&&lesson.id==='button')logState();return;}
 if(!running)startSimulation();
 if(Number.isFinite(event.value)&&lesson.control){const c=lesson.control;applyValue(c.min+(c.max-c.min)*event.value/100,{log:event.type!=='press'});}
 if(event.type==='toggle'){pressed=!pressed;scene?.setPressed(pressed);syncControls();logState();}
 if(event.type==='press'){
  pressed=!!event.pressed;scene?.setPressed(pressed);syncControls();
  if(lesson.id==='piano'){
   const hz=[262,294,330,349,392,440,494,523][Math.round(value)];tone(hz);logs.push(`♪ ${['C','D','E','F','G','A','B','C↑'][Math.round(value)]} — ${hz} Hz`);logs=logs.slice(-24);renderLogs();
  }else logState();
 }
}
function updateSceneValue(){const c=lesson.control;scene?.setValue(c?(value-c.min)/(c.max-c.min)*100:50);}
function selectLesson(id,{updateHash=true}={}){
 const next=lessons.find(l=>l.id===id);if(!next)return;
 if(buildActive)leaveBuild();
 closeGuide();stopSimulation(false);lesson=next;value=lesson.control?.value??50;pressed=false;logs=[];
 const i=lessons.indexOf(lesson);
 $('#lesson-number').textContent=String(i+1).padStart(2,'0');
 $('#lesson-position').textContent=`${String(i+1).padStart(2,'0')} / ${lessons.length}`;
 $('#choose-lesson')?.setAttribute('aria-label',`Choose a lesson. ${i+1} of ${lessons.length}: ${lesson.shortTitle}`);
 $('#previous-lesson').disabled=i===0;$('#next-lesson-button').disabled=i===lessons.length-1;
 $('#lesson-title').innerHTML=esc(lesson.title)+'<span>.</span>';
 $('#lesson-subtitle').textContent='';
 scene?.setLesson(id);updateSceneValue();
 $('#inspector').hidden=true;$('#hover-tip').hidden=true;$('#board-callouts').hidden=true;$('.stage-stamp').hidden=true;
 renderShelf();selectTab('overview',{restoreScroll:false});renderSchematic();showView(false);
 if($('#scene-action-hint')){$('#scene-action-hint').textContent=lesson.interaction||'';$('#scene-action-hint').hidden=!lesson.interaction;}
 if(updateHash&&location.hash!==`#${id}`)history.pushState(null,'',`#${id}`);
 try{localStorage.setItem('field-lab-last',id);}catch{}
 const active=$('#lesson-cards .active'),shelf=$('#lesson-cards');
 if(active){const a=active.getBoundingClientRect(),r=shelf.getBoundingClientRect();if(a.left<r.left||a.right>r.right)shelf.scrollBy({left:a.left-r.left,behavior:'instant'});}
}
function selectTab(name,{restoreScroll=true}={}){if(restoreScroll)tabScroll[tab]=$('#lesson-content').scrollTop;else tabScroll={};if(name!==tab)closeGuide();$('#lesson-content').setAttribute('aria-labelledby','tab-'+name);if(pressed&&['button','piano'].includes(lesson.id))handleSceneInteraction({type:'press',pressed:false});tab=name;document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));b.tabIndex=b.dataset.tab===name?0:-1;});renderContent();$('#lesson-content').scrollTop=tabScroll[name]||0;if(name==='pinout')openGuide(0,{scroll:false});}
function setRunUI(){const b=$('#run-button');b.classList.toggle('is-running',running);b.querySelector('[data-icon]').innerHTML=icon(running?'stop':'play');$('#run-label').textContent=running?'Stop simulation':'Run simulation';$('#sim-status').textContent=running?'Running':'Ready';$('#sim-dot').classList.toggle('running',running);}
function startSimulation(){closeGuide();if(running)return;const focusId=document.activeElement?.id;running=true;simulationStart=performance.now();serialCount=0;logs=[];scene?.setRunning(true);updateSceneValue();setRunUI();renderContent({preserveScroll:true});if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});logState();serialTimer=setInterval(()=>{logState();},lesson.id==='blink'?100:1200);if(lesson.id==='sound')tone(Number(value)||440);}
function stopSimulation(render=true){running=false;pressed=false;clearInterval(serialTimer);serialTimer=null;stopTone();scene?.setRunning(false);scene?.setPressed(false);setRunUI();if(render)renderContent({preserveScroll:true});}
function rgbValues(hue){const h=((Math.round(hue)%360)+360)%360,rise=Math.floor((h%60)*255/60),fall=255-rise;return [[255,rise,0],[fall,255,0],[0,255,rise],[0,fall,255],[rise,0,255],[255,0,fall]][Math.floor(h/60)];}
function logState(){if(!running)return;serialCount++;const c=lesson.control;const normalized=c?(value-c.min)/(c.max-c.min):.5;const lines={board:`Uptime: ${Math.floor((performance.now()-simulationStart)/1000)} s · ESP32 ready · GPIO 3.3 V`,blink:`GPIO23 → ${Math.floor((performance.now()-simulationStart)/value)%2===0?'HIGH · LED on':'LOW · LED off'} · interval ${value} ms`,button:`GPIO18 = ${pressed?'LOW · pressed · LED on':'HIGH · released · LED off'}`,potentiometer:`ADC → ${Math.round(normalized*4095)} / 4095 · PWM → ${Math.floor(Math.round(normalized*4095)*255/4095)} / 255`,rgb:`Hue ${value}° · R / G / B: ${rgbValues(value).join(' / ')}`,light:`Light ${value}% · ADC ${Math.round(normalized*4095)} · threshold 1200 · LED ${normalized<(1200/4095)?'on':'off'}`,distance:`Distance ${value} cm · round trip ≈ ${Math.round(value*2/.0343)} μs · ${value<20?'Object detected':'Clear'}`,sound:`Tone: ${value} Hz`,piano:pressed?`Note ${['C','D','E','F','G','A','B','C↑'][Math.round(value)]} · ${[262,294,330,349,392,440,494,523][Math.round(value)]} Hz`:'Keys released',motor:`PWM duty: ${Math.round(normalized*255)} / 255`,temperature:`Temperature: ${value} °C`,servo:`Target ${value}° · pulse ${Math.round(1000+value/180*1000)} μs · every 20 ms`,stepper:`Target rotation ${value}° · ${Math.floor(value/360*2048)} commanded steps`,plant:`Relative soil moisture: ${value}% · ${value<30?'Check the soil':'Looking good'}`,force:`Pressure input: ${Math.round(normalized*4095)} / 4095`,wifi:`Virtual AP: ESP32-Lab · LED ${pressed?'ON':'OFF'}`};const state=lines[lesson.id];if(logs.at(-1)?.endsWith(state))return;logs.push(`${String(serialCount).padStart(3,'0')}  ${state}`);logs=logs.slice(-24);renderLogs();}
function renderLogs(){const el=$('#serial-lines');if(el){el.innerHTML=logs.map(l=>`<p>${esc(l)}</p>`).join('');el.scrollTop=el.scrollHeight;}}
function renderSchematic(){$('#schematic').innerHTML=renderCircuitDiagram(lesson.id)+`<button class="visual-guide-launch" data-open-guide>${icon('chip')} Trace it on the device</button>`;}

function inspect(id){if(guideIndex!==null)return;const p=parts[id];if(!p)return;$('#hover-tip').hidden=true;$('#inspector').innerHTML=`<button class="close" aria-label="Close component information">${icon('close')}</button><div class="eyebrow">${esc(p.kicker)}</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><dl>${p.facts.map(f=>`<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl><p class="tip">${esc(p.tip)}</p>`;$('#inspector').hidden=false;$('#inspector .close').addEventListener('click',()=>$('#inspector').hidden=true);}
function hover(id,pos){
 const tip=$('#hover-tip');if(guideIndex!==null||!id||!parts[id]||!$('#inspector').hidden){tip.hidden=true;return;}
 const interactive={board:['en'],blink:['led'],button:['button'],potentiometer:['potentiometer'],rgb:['rgb'],light:['ldr'],distance:['distance'],sound:['buzzer'],piano:['buzzer'],motor:['motor'],temperature:['temperature'],servo:['servo'],stepper:['stepper'],plant:['oled'],force:['fsr'],wifi:['led','wifi']};
 const action=interactive[lesson.id]?.includes(id)?lesson.interaction:'Click for specifications ↗';
 tip.innerHTML=`<strong>${esc(parts[id].name)}</strong><span>${esc(parts[id].description.split('. ').slice(0,2).join('. '))}</span><small>${esc(action||'Click for specifications ↗')}</small>`;
 tip.hidden=false;
 const r=$('.scene-panel').getBoundingClientRect(),t=tip.getBoundingClientRect();
 tip.style.left=`${Math.max(8,Math.min(r.width-t.width-8,pos.x-r.left+14))}px`;
 tip.style.top=`${Math.max(44,Math.min(r.height-t.height-62,pos.y-r.top-t.height-14))}px`;
}
function openDialog(title,html,eyebrow='FIELD NOTES'){$('#dialog-title').textContent=title;$('#dialog-eyebrow').textContent=eyebrow;$('#dialog-body').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal();document.body.classList.add('dialog-open');}
function closeDialog(){$('#dialog').close();document.body.classList.remove('dialog-open');}
function showMenu(){openDialog('Field Lab',`<div class="dialog-grid"><button class="part-card" data-nav="build">${icon('chip')}<strong>Build a circuit</strong><small>${BUILD_PROJECTS.length} assembly projects</small></button><button class="part-card" data-nav="lessons">${icon('book')}<strong>All 16 lessons</strong><small>${completed.size} lessons completed</small></button><button class="part-card" data-nav="components">${icon('chip')}<strong>Components</strong><small>Explore the parts library</small></button><button class="part-card" data-nav="settings">${icon('settings')}<strong>Settings</strong><small>Sound, labels and progress</small></button><button class="part-card" id="menu-help">${icon('help')}<strong>How it works</strong><small>Make yourself at home</small></button></div>`,'');$('#menu-help').onclick=showHelp;}
function showLessons(){openDialog('Lessons',`<div class="dialog-grid">${lessons.map(card).join('')}</div>`,'16 LESSONS');}
function showComponents(){openDialog('Components',`<div class="dialog-grid">${Object.entries(parts).map(([id,p])=>`<button class="part-card" data-library-part="${id}">${icon(id==='wifi'||id==='antenna'?'wifi':'chip')}<strong>${esc(p.name)}</strong><small>${esc(p.kicker)}</small></button>`).join('')}</div>`,'COMPONENT REFERENCE');}
function showPartModal(id){const p=parts[id];if(!p)return;openDialog(p.name,`<div class="modal-copy"><p>${esc(p.description)}</p><h3>Field notes</h3>${p.facts.map(f=>`<div class="spec-row"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div>`).join('')}<p style="margin-top:20px">${esc(p.tip)}</p><button class="next-button" id="back-components">← Back to components</button></div>`,p.kicker);$('#back-components').onclick=showComponents;}
function showSettings(){openDialog('Settings',`<div class="settings-row"><div>Component labels<small>Show part names on the 3D board.</small></div><input type="checkbox" id="setting-labels" aria-label="Component labels" ${settings.labels?'checked':''}></div><div class="settings-row"><div>Sound<small>Enable audio for the buzzer and mini piano.</small></div><input type="checkbox" id="setting-sound" aria-label="Enable sound" ${settings.sound?'checked':''}></div><div class="settings-row"><div>Your learning progress<small>${completed.size} of ${lessons.length} lessons completed, saved on this device.</small></div><button id="export-progress">Export</button></div><div class="settings-row"><div>Start fresh<small>Clear completed lessons on this device.</small></div><button id="reset-progress">Reset progress</button></div><div class="modal-copy"><h3>Lesson shortcuts</h3><p><kbd>Space</kbd> Run or stop · <kbd>R</kbd> Reset view · <kbd>Esc</kbd> Close a panel.<br>Drag to rotate. Scroll or pinch to zoom. Use the component library for a keyboard-accessible guide.</p></div>`,'');$('#setting-labels').onchange=e=>setLabels(e.target.checked);$('#setting-sound').onchange=e=>{settings.sound=e.target.checked;persist();syncControls();if(!settings.sound)stopTone();else if(running&&lesson.id==='sound')tone(value);};$('#export-progress').onclick=()=>download('esp32-field-lab-progress.json',JSON.stringify({course:'ESP32 Field Lab',completed:[...completed],exported:new Date().toISOString()},null,2),'application/json');$('#reset-progress').onclick=()=>{openDialog('Start the path again?',`<p class="modal-copy">This clears the ${completed.size} completed lessons saved in this browser.</p><button class="next-button" id="confirm-reset">Clear progress</button> <button class="quiet-btn" id="cancel-reset" style="display:inline-flex">Keep my progress</button>`);$('#confirm-reset').onclick=()=>{completed.clear();persist();renderShelf();renderContent();closeDialog();toast('A fresh start. Your next discovery is waiting.');};$('#cancel-reset').onclick=showSettings;};}
function showHelp(){openDialog('Welcome to your field lab.',`<div class="modal-copy"><p>Get hands-on with the ESP32, one small experiment at a time. All 16 lessons work in your browser — no board required.</p><h3>01 / Get acquainted</h3><p>Drag empty space to turn the board left or right. Scroll or pinch to zoom. Hover for component information; tap passive parts for specifications. Use the labelled controls or component library with a keyboard.</p><h3>02 / Make something happen</h3><p>Choose a lesson from the strip above the board. Follow its gesture hint to operate the actual 3D part: turn a knob, hold a button or play a key. This starts the demonstration automatically. The controls beside the scene offer the same actions.</p><h3>03 / Take it further</h3><p>Use <strong>Show the connections</strong> for a guided close-up of each pin and part. The <strong>Pinout</strong> tab lets you select a connection and see it on the device. The <strong>Code</strong> tab has a complete Arduino sketch you can copy or download. The <strong>Learn</strong> tab explains the concept, the code, physical setup and common problems. Answer its knowledge check to complete a lesson.</p><h3>04 / Assemble a circuit</h3><p>Open <strong>Build</strong> to practice Blink, Button or Potentiometer. Drag parts, connect contacts and follow visual hints. Check your wiring before Run.</p><h3>A note on the simulation</h3><p>These are guided, interactive demonstrations of electronics concepts. The lab does not emulate an ESP32 CPU or compile sketches. Wi-Fi is illustrated with a virtual connection; the example code runs on a real board.</p><p>Designed for the original ESP32-WROOM-32 on a 30-pin DevKit V1. Pin labels and features differ on other ESP32 models.</p></div>`,'A LITTLE CURIOSITY GOES A LONG WAY');}
function showQuiz(){const l=lesson,q=l.question;openDialog('Check understanding',`<p class="modal-copy">${esc(q.text)}</p><div class="quiz-options">${q.options.map((o,i)=>`<button data-answer="${i}">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div><div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div>`,'LESSON '+String(lessons.indexOf(l)+1).padStart(2,'0'));document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{const correct=Number(b.dataset.answer)===q.answer;b.classList.add(correct?'correct':'wrong');$('#quiz-feedback').textContent=correct?'Exactly. '+q.explanation:'Not quite. '+q.explanation;if(correct){completed.add(l.id);persist();renderShelf();renderContent();document.querySelectorAll('[data-answer]').forEach(el=>el.disabled=true);const next=lessons[lessons.indexOf(l)+1]||lessons.find(x=>!completed.has(x.id));$('#quiz-feedback').insertAdjacentHTML('beforeend',`<br><button class="next-button" id="next-lesson">${next?'Continue: '+esc(next.shortTitle||next.title)+' →':'All done. Keep exploring →'}</button>`);$('#next-lesson').onclick=()=>{closeDialog();if(next){selectLesson(next.id);if(matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));}else toast('You’ve completed the explorer path. Keep making!');};}});}
function download(filename,text,type){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function setLabels(v){settings.labels=v;scene?.setLabels(v);$('#labels-button').classList.toggle('on',v);$('#labels-button').setAttribute('aria-pressed',String(v));persist();}
function setFlow(v){settings.flow=v;scene?.setFlow(v);$('#flow-button').classList.toggle('on',v);$('#flow-button').setAttribute('aria-pressed',String(v));$('#flow-button').dataset.tooltip=v?'Hide signal flow':'Show signal flow';persist();if(v)toast('Signal flow is visible while the simulation runs.');}
function showView(schematic){if(schematic)closeGuide();$('#schematic').hidden=!schematic;$('#scene').style.visibility=schematic?'hidden':'visible';if($('#scene-action-hint'))$('#scene-action-hint').hidden=schematic||guideIndex!==null||!lesson.interaction;$('#view-3d').classList.toggle('selected',!schematic);$('#view-schematic').classList.toggle('selected',schematic);$('#view-3d').setAttribute('aria-pressed',String(!schematic));$('#view-schematic').setAttribute('aria-pressed',String(schematic));$('#inspector').hidden=true;$('#hover-tip').hidden=true;}
document.addEventListener('click',e=>{const launch=e.target.closest('[data-open-guide]');if(launch){openGuide();return;}const connection=e.target.closest('[data-guide-connection]');if(connection){const i=guides[lesson.id].findIndex(g=>g.connection===Number(connection.dataset.guideConnection));if(i>=0)openGuide(i);return;}const lessonButton=e.target.closest('.lesson-card[data-lesson]');if(lessonButton){selectLesson(lessonButton.dataset.lesson);closeDialog();if(matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});return;}const n=e.target.closest('[data-nav]')?.dataset.nav;if(n){if(n==='build'){closeDialog();const id=buildActive?buildProjectId:buildProjectIds.has(lesson.id)?lesson.id:'blink';if(location.hash==='#build-'+id)enterBuild(id);else location.hash='build-'+id;}else if(n==='lessons')showLessons();else if(n==='components')showComponents();else if(n==='settings')showSettings();else if(n==='menu')showMenu();else{closeDialog();if(buildActive)selectLesson(buildProjectId);window.scrollTo({top:0,behavior:'smooth'});}}const part=e.target.closest('[data-part]')?.dataset.part;if(part)inspect(part);const libraryPart=e.target.closest('[data-library-part]')?.dataset.libraryPart;if(libraryPart)showPartModal(libraryPart);});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
$('.panel-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=['overview','learn','pinout','code'],i=tabs.indexOf(tab);selectTab(tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length]);$(`[data-tab="${tab}"]`).focus();});
$('#run-button').onclick=()=>running?stopSimulation():startSimulation();$('#help-button').onclick=showHelp;$('#about-button').onclick=showHelp;$('#all-lessons').onclick=showLessons;$('#close-dialog').onclick=closeDialog;$('#dialog').addEventListener('close',()=>document.body.classList.remove('dialog-open'));$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
$('#previous-lesson')?.addEventListener('click',()=>{const i=lessons.indexOf(lesson);if(i>0)selectLesson(lessons[i-1].id);});$('#next-lesson-button')?.addEventListener('click',()=>{const i=lessons.indexOf(lesson);if(i<lessons.length-1)selectLesson(lessons[i+1].id);});
$('#shelf-prev').onclick=()=>$('#lesson-cards').scrollBy({left:-360,behavior:'smooth'});$('#shelf-next').onclick=()=>$('#lesson-cards').scrollBy({left:360,behavior:'smooth'});$('#zoom-in').onclick=()=>scene?.zoom(.12);$('#zoom-out').onclick=()=>scene?.zoom(-.12);$('#reset-view').onclick=()=>scene?.reset();$('#labels-button').onclick=()=>setLabels(!settings.labels);$('#flow-button').onclick=()=>setFlow(!settings.flow);$('#view-3d').onclick=()=>showView(false);$('#view-schematic').onclick=()=>showView(true);$('#fullscreen-button').onclick=()=>{const expanded=$('.scene-panel').classList.toggle('expanded');document.body.classList.toggle('workbench-expanded',expanded);$('#fullscreen-button').setAttribute('aria-label',expanded?'Collapse workbench':'Expand workbench');};
document.addEventListener('keydown',e=>{if(buildActive)return;if(e.key==='Escape'){closeGuide();$('#inspector').hidden=true;$('.scene-panel').classList.remove('expanded');document.body.classList.remove('workbench-expanded');$('#fullscreen-button').setAttribute('aria-label','Expand workbench');}if($('#dialog').open||/INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY/.test(e.target.tagName))return;if(e.key==='['||e.key===']'){e.preventDefault();const i=lessons.indexOf(lesson)+(e.key===']'?1:-1);if(lessons[i])selectLesson(lessons[i].id);return;}if(e.code==='Space'){e.preventDefault();running?stopSimulation():startSimulation();}if(e.key.toLowerCase()==='r')scene?.reset();});

$('#lesson-cards').addEventListener('wheel',e=>{
 const shelf=e.currentTarget;if(Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;
 const canMove=e.deltaY<0?shelf.scrollLeft>0:shelf.scrollLeft<shelf.scrollWidth-shelf.clientWidth-1;
 if(canMove){e.preventDefault();shelf.scrollLeft+=e.deltaY;}
},{passive:false});
window.addEventListener('hashchange',()=>{const project=buildFromHash();if(project)enterBuild(project);else selectLesson(lessons.some(l=>l.id===location.hash.slice(1))?location.hash.slice(1):'board',{updateHash:false});});
function initLessonScene(){
try{scene=createScene($('#scene'),{onInspect:inspect,onHover:hover,onInteract:handleSceneInteraction,onFocusChange:active=>{if(!active)closeGuide({restore:false});},onReady:()=>$('.scene-loading')?.remove()});setLabels(settings.labels);scene.setFlow(settings.flow);$('#flow-button').classList.toggle('on',settings.flow);$('#flow-button').setAttribute('aria-pressed',String(settings.flow));}catch(error){if($('.scene-loading'))$('.scene-loading').textContent='3D could not start. Lessons and connection guides are still available.';console.error(error);}
}
function enterBuild(projectId='blink'){
 const next=buildProjectIds.has(projectId)?projectId:'blink';
 if(buildActive&&buildProjectId===next)return;
 if(buildActive){builder?.dispose();builder=null;}
 closeDialog();closeGuide();stopSimulation(false);
 $('.scene-panel').classList.remove('expanded');document.body.classList.remove('workbench-expanded');
 $('#fullscreen-button').setAttribute('aria-label','Expand workbench');
 scene?.dispose();scene=null;buildActive=true;buildProjectId=next;
 $('#lesson-main').hidden=true;$('#build-root').hidden=false;document.body.classList.add('building');
 document.querySelectorAll('.top-navigation [data-nav]').forEach(b=>b.classList.toggle('nav-current',b.dataset.nav==='build'));
 try{builder=mountBuild($('#build-root'),{projectId:next,onProjectChange:id=>{if(buildProjectIds.has(id))location.hash='build-'+id;},onExit:()=>{location.hash=next;}});}catch(error){console.error(error);leaveBuild();toast('The build workspace could not open. Please reload and try again.');}
 window.scrollTo({top:0,behavior:'instant'});
}
function leaveBuild(){
 if(!buildActive)return;builder?.dispose();builder=null;buildActive=false;
 $('#build-root').replaceChildren();$('#build-root').hidden=true;$('#lesson-main').hidden=false;document.body.classList.remove('building');
 document.querySelectorAll('.top-navigation [data-nav]').forEach(b=>b.classList.toggle('nav-current',b.dataset.nav==='lab'));
 initLessonScene();
}
if(!buildFromHash())initLessonScene();
selectLesson(lessons.some(l=>l.id===location.hash.slice(1))?location.hash.slice(1):'board',{updateHash:false});selectTab('overview');
if(buildFromHash())enterBuild(buildFromHash());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stopSimulation();});

window.addEventListener('blur',()=>{if(running&&pressed&&['button','piano'].includes(lesson.id))handleSceneInteraction({type:'press',pressed:false});});
