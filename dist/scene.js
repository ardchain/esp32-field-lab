import * as THREE from './vendor/three.module.js';

const C = { pcb:0x164d49, edge:0x0b3432, gold:0xd9b76a, silver:0xbfc8c6, dark:0x222c2b, white:0xe9eee7, teal:0x2aa58d, red:0xe9654c };
const PINS_LEFT=['EN','VP','VN','34','35','32','33','25','26','27','14','12','13','GND','VIN'];
const PINS_RIGHT=['23','22','TX0','RX0','21','19','18','5','TX2','RX2','4','2','15','GND','3V3'];

export function createScene(container, callbacks = {}) {
  let renderer;
  const noop=()=>{};
  try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'}); }
  catch (error) {
    const fallback=document.createElement('div');
    fallback.style.cssText='height:100%;display:grid;place-content:center;text-align:center;padding:28px;color:#284944;font:14px/1.6 sans-serif';
    fallback.innerHTML='<strong>Explore the ESP32</strong><span>The interactive board needs WebGL.<br>Try a recent version of Chrome, Edge, Firefox or Safari.<br>You can still read every lesson and use the pin guide.</span>';
    container.append(fallback); callbacks.onReady?.();
    return {setLesson:noop,setRunning:noop,setValue:noop,setPressed:noop,setLabels:noop,setFlow:noop,reset:noop,rotate:noop,zoom:noop,focus:({targets=[]}={})=>({resolved:[],unresolved:targets}),clearFocus:noop,dispose:()=>fallback.remove()};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0xf4f3ed,0);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:pan-y;outline:none;';
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','Interactive ESP32 circuit. Drag empty space left or right to rotate. Scroll or pinch gently to zoom. Drag or press lesson devices to interact. Hold Shift while clicking a device to inspect it.');
  container.append(renderer.domElement);
  if(getComputedStyle(container).position==='static')container.style.position='relative';
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-7,7,7,-7,.1,100);
  camera.position.set(8,12,10);camera.lookAt(0,0,0);
  const world=new THREE.Group(); scene.add(world);
  const board=new THREE.Group();world.add(board);
  let circuit=new THREE.Group();world.add(circuit);
  const labelsEl=document.createElement('div');
  labelsEl.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.append(labelsEl);
  let labels=[], meshes=[], anim={}, lesson='board', running=false, value=50, pressed=false, labelsVisible=false, flow=false;
  const DEFAULT_YAW=-.13, MIN_ZOOM=.8, MAX_ZOOM=1.12;
  let rotation=DEFAULT_YAW, targetRotation=DEFAULT_YAW, zoomLevel=1, alive=true, frame=0, last=performance.now(), elapsed=0;
  let transition=null, gesture=null, frameBounds=null, viewWidth=600, viewHeight=500, focusState=null, cameraAnimatingUntil=0;
  const focusLayer=new THREE.Group();world.add(focusLayer);
  const focusLabels=document.createElement('div');focusLabels.className='scene-focus-labels';focusLabels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;';container.append(focusLabels);
  const targetDirection=new THREE.Vector3(7,13,10);container.dataset.focusTargets='[]';container.dataset.focusActive='false';
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const viewDirection=new THREE.Vector3(7,13,10), framePoint=new THREE.Vector3(), frameCenter=new THREE.Vector3(), cameraCenter=new THREE.Vector3();let fittedHeight=0, framingReady=false;
  container.dataset.transitioning='false';container.dataset.lesson='board';
  const rays=new THREE.Raycaster(), mouse=new THREE.Vector2(), temp=new THREE.Vector3();
  let hover=null, pointerDown=null, pointers=new Map(), pinchDist=0, lastPinch=0;
  const materials=new Set(), geometries=new Set(), textures=new Set();
  const light=new THREE.DirectionalLight(0xfff9ef,2.5);light.position.set(-5,12,7);light.castShadow=true;
  light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:40});
  light.shadow.bias=-.0004;light.shadow.normalBias=.02;scene.add(light);
  scene.add(new THREE.HemisphereLight(0xf3f8ff,0xaaa99b,1.8));
  const fill=new THREE.DirectionalLight(0xc9ddd5,.75);fill.position.set(7,5,-8);scene.add(fill);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.13}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.32;shadow.receiveShadow=true;scene.add(shadow);

  function mat(color, extras={}) {const m=new THREE.MeshStandardMaterial({color,roughness:.74,metalness:0,...extras});materials.add(m);return m;}
  function mesh(geo, material, parent, position, id){geometries.add(geo);const o=new THREE.Mesh(geo,material);if(position)o.position.set(...position);o.castShadow=true;o.receiveShadow=true;(parent||board).add(o);if(id){o.userData.part=id;meshes.push(o);}return o;}
  function box(w,h,d,m,p,pos,id){return mesh(new THREE.BoxGeometry(w,h,d),m,p,pos,id);}
  function cyl(r,h,m,p,pos,id,n=32){return mesh(new THREE.CylinderGeometry(r,r,h,n),m,p,pos,id);}
  function rounded(w,d,h,r,m,p,pos,id){const s=new THREE.Shape();const x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);const b=Math.min(.015,h*.2,r*.25);const g=new THREE.ExtrudeGeometry(s,{depth:h-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:10});g.rotateX(-Math.PI/2);g.translate(0,-h/2+b,0);return mesh(g,m,p,pos,id);}
  function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const cx=c.getContext('2d');draw(cx,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);textures.add(t);return t;}
  function print(w,d,t,p,pos,id){const m=new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});materials.add(m);const o=mesh(new THREE.PlaneGeometry(w,d),m,p,pos,id);o.rotation.x=-Math.PI/2;o.castShadow=false;return o;}
  function line(points,color,r=.02,parent=board,id){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,32,r,7,false),mat(color,{roughness:.7}),parent,null,id);}
  function label(id,text,pos,side='left'){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label','Inspect '+text);
    b.style.cssText=`position:absolute;pointer-events:auto;white-space:nowrap;transform:translate(-50%,-50%);border:1px solid #d4d9cf;background:rgba(252,253,247,.93);border-radius:6px;padding:7px 10px;color:#3d5a52;font:500 10px/1.1 'DM Sans',sans-serif;letter-spacing:.04em;box-shadow:0 3px 12px #19382f08;cursor:pointer;transition:opacity .2s;`;
    b.addEventListener('click',()=>callbacks.onInspect?.(id));for(const event of ['pointerenter','pointermove'])b.addEventListener(event,e=>callbacks.onHover?.(id,{x:e.clientX,y:e.clientY}));b.addEventListener('pointerleave',e=>callbacks.onHover?.(null,{x:e.clientX,y:e.clientY}));labelsEl.append(b);labels.push({id,el:b,pos:new THREE.Vector3(...pos),side});
  }
  const pcb=mat(C.pcb,{roughness:.7}), edge=mat(C.edge),gold=mat(C.gold,{metalness:.7,roughness:.48}),silver=mat(C.silver,{metalness:.68,roughness:.52}),black=mat(C.dark,{roughness:.65}),white=mat(C.white);
  rounded(3.4,7.3,.16,.16,pcb,board,[0,.03,0],'gpio');
  rounded(3.42,7.32,.035,.16,edge,board,[0,-.063,0]);
  // Plated mounting holes are deliberately visible through their dark centers.
  for(const x of [-1.39,1.39])for(const z of [-3.34,3.34]){
    const ring=mesh(new THREE.TorusGeometry(.112,.027,8,28),gold,board,[x,.125,z]);ring.rotation.x=-Math.PI/2;
    cyl(.083,.011,black,board,[x,.128,z]);
  }
  for(const side of [-1,1]){
    box(.24,.18,6.52,black,board,[side*1.56,-.17,0],'gpio');
    for(let i=0;i<15;i++){
      const z=-3.01+i*.43;
      const name=(side===-1?PINS_LEFT:PINS_RIGHT)[i],pin=({VP:'36',VN:'39',TX0:'1',RX0:'3',RX2:'16',TX2:'17'})[name]||name;
      for(const o of [cyl(.095,.017,gold,board,[side*1.55,.13,z],'gpio',16),box(.063,.69,.063,gold,board,[side*1.55,-.14,z],'gpio'),box(.063,.18,.063,gold,board,[side*1.55,.22,z],'gpio')]){o.userData.pin=pin;o.userData.pinCluster=side+':'+i;}
    }
  }
  const silk=texture(1024,2048,(c,w,h)=>{
    c.clearRect(0,0,w,h);c.strokeStyle='#7ba49a';c.lineWidth=2;
    c.strokeRect(55,38,w-110,h-76);
    c.font='500 31px monospace';c.fillStyle='#e1e8d8';
    PINS_LEFT.forEach((p,i)=>{const yy=178+i*118;c.textAlign='left';c.fillText(p,94,yy);c.textAlign='right';c.fillText(PINS_RIGHT[i],w-94,yy);});
    c.textAlign='center';c.fillStyle='#b3cec2';c.font='700 38px monospace';c.fillText('ESP32',w/2,1395);c.font='24px monospace';c.fillText('DEVKIT V1 · 30 PIN',w/2,1445);
    c.font='22px monospace';c.fillText('EN',315,1790);c.fillText('BOOT',705,1790);
    c.font='18px monospace';c.fillText('3.3V LOGIC',w/2,1992);
    c.strokeStyle='#5e8476';c.lineWidth=3;
    for(let i=0;i<7;i++){let yy=980+i*70;c.beginPath();c.moveTo(240,yy);c.lineTo(280+i*22,yy);c.lineTo(340+i*22,yy+60);c.lineTo(340+i*22,1630);c.stroke();}
  });print(3.27,7.12,silk,board,[0,.117,0]);
  // ESP-WROOM-32 module, castellated pads, RF shield and etched antenna.
  rounded(2.54,3.45,.075,.05,mat(0x273e35),board,[0,.19,-1.55],'module');
  for(let i=0;i<9;i++)for(const side of [-1,1])box(.1,.065,.13,gold,board,[side*1.28,.21,-2.52+i*.29],'module');
  rounded(2.43,2.47,.29,.06,silver,board,[0,.39,-1.13],'module');
  rounded(2.28,2.32,.018,.045,mat(0xd1d6cf,{metalness:.65,roughness:.58}),board,[0,.545,-1.13],'module');
  const shield=texture(1024,1024,(c,w,h)=>{
    c.fillStyle='#495552';c.textAlign='center';c.font='600 76px sans-serif';c.fillText('ESP',w/2,235);
    c.strokeStyle='#495552';c.lineWidth=12;for(let i=0;i<3;i++){c.beginPath();c.arc(w/2,120,38+i*26,Math.PI*1.1,Math.PI*1.9);c.stroke();}
    c.font='500 67px monospace';c.fillText('ESP-WROOM-32',w/2,390);c.font='29px monospace';c.fillText('Wi-Fi + Bluetooth',w/2,455);
    c.font='25px monospace';c.fillText('FCC ID: 2AC7Z-ESPWROOM32',w/2,550);c.fillText('2.4 GHz · DUAL CORE',w/2,598);
    c.font='600 54px sans-serif';c.fillText('CE   ◇   RoHS',w/2,760);
    c.strokeStyle='#6f7a70';c.lineWidth=1;for(let i=0;i<14;i++)for(let j=0;j<14;j++)if((i*31+j*17)%5<3)c.strokeRect(430+i*8,835+j*8,6,6);
  });print(2.14,2.14,shield,board,[0,.558,-1.13],'module');
  const antPoints=[[-1.04,.255,-2.65],[-1.04,.255,-3.05],[-.67,.255,-3.05],[-.67,.255,-2.7],[-.3,.255,-2.7],[-.3,.255,-3.05],[.07,.255,-3.05],[.07,.255,-2.7],[.44,.255,-2.7],[.44,.255,-3.05],[1.03,.255,-3.05]];
  line(antPoints,C.gold,.031,board,'antenna');box(2.3,.06,.67,mat(0x28392b,{transparent:true,opacity:.1}),board,[0,.22,-2.87],'antenna');
  // USB-to-UART bridge and voltage regulation circuitry.
  box(.74,.13,.74,black,board,[0,.22,1.51],'usb');
  for(let i=0;i<5;i++)for(const side of [-1,1])box(.09,.035,.05,silver,board,[side*.42,.2,1.25+i*.13]);
  print(.6,.52,texture(256,256,(c)=>{c.fillStyle='#9da6a0';c.textAlign='center';c.font='24px monospace';c.fillText('CP2102',128,100);c.font='17px monospace';c.fillText('USB / UART',128,145);}),board,[0,.291,1.51],'usb');
  box(.47,.13,.72,black,board,[-.73,.2,2.42],'regulator');box(.45,.03,.19,silver,board,[-.73,.28,2.1],'regulator');
  for(let i=0;i<3;i++)box(.065,.03,.22,silver,board,[-.88+i*.15,.17,2.87],'regulator');
  for(const [x,z,s] of [[.72,2.4,.2],[.71,1.82,.12],[-.76,1.4,.15],[.65,.55,.12],[-.76,.56,.14],[.36,2.55,.1],[.72,1.15,.15]]){
    box(s,.09,s*1.7,mat(0xb2a188),board,[x,.18,z]);box(s+.02,.08,.05,silver,board,[x,.18,z-s*.85]);box(s+.02,.08,.05,silver,board,[x,.18,z+s*.85]);
  }
  const usb=new THREE.Group();usb.userData.focusToken='part:usb';usb.position.set(0,.27,3.24);board.add(usb);
  rounded(.99,.78,.28,.08,silver,usb,[0,0,0],'usb');box(.79,.18,.025,black,usb,[0,-.015,.399],'usb');box(.57,.045,.3,mat(0xb4bbb3),usb,[0,-.035,.29],'usb');
  for(let i=0;i<5;i++)box(.047,.026,.19,gold,usb,[-.19+i*.095,-.005,.36]);
  for(const [x,id] of [[-.97,'en'],[.97,'boot']]){
    rounded(.48,.57,.13,.05,silver,board,[x,.22,3.02],id);box(.34,.12,.37,black,board,[x,.33,3.02],id);
    for(const side of [-1,1])box(.07,.06,.43,silver,board,[x+side*.27,.16,3.02]);
  }
  const powerMat=mat(0xe87248,{emissive:0xe84822,emissiveIntensity:.7});box(.115,.06,.2,powerMat,board,[.91,.19,2.44],'power');
  const onboardLED=mat(0x47adc1,{emissive:0x12b7c6,emissiveIntensity:.1});box(.115,.06,.18,onboardLED,board,[-1.04,.19,1.92],'led');

  const persistentMaterials=new Set(materials), persistentTextures=new Set(textures), persistentGeometries=new Set(geometries);
  function clearCircuit(group=circuit){
    group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;if(g&&!persistentGeometries.has(g)){g.dispose();geometries.delete(g);}for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(!m||persistentMaterials.has(m))continue;if(m.map&&!persistentTextures.has(m.map)){m.map.dispose();textures.delete(m.map);}m.dispose();materials.delete(m);}});
  }
  function rebuildLabels(){labels.forEach(l=>l.el.remove());labels=[];
    if(lesson==='board'){
      label('antenna','2.4 GHz ANTENNA',[1.9,.5,-3.25],'right');
      label('module','ESP-WROOM-32',[-2.1,.5,-1.3],'left');
      label('gpio','30 PIN HEADERS',[2.1,.2,.3],'right');
      label('usb','MICRO USB',[-.1,.4,4.1],'bottom');
      label('regulator','3.3V REGULATOR',[-2.15,.3,2.2],'left');
    }else{
      label('module','ESP32',[-3.4,.5,-2.6],'left');
      const names={blink:'LED + RESISTOR',button:'PUSH BUTTON',potentiometer:'POTENTIOMETER',rgb:'RGB LED',light:'PHOTORESISTOR',distance:'ULTRASONIC SENSOR',sound:'PIEZO BUZZER',piano:'TOUCH THE KEYS',motor:'DC MOTOR',temperature:'DHT22 SENSOR',servo:'SERVO MOTOR',stepper:'STEPPER MOTOR',plant:'SOIL + OLED',force:'FORCE SENSOR',wifi:'WI-FI + LED'};
      label(({blink:'led',light:'ldr',sound:'buzzer',piano:'buzzer',plant:'oled'})[lesson]||lesson,names[lesson]||'CIRCUIT',[2.9,.5,-2.9],'right');
    }
  }
  function breadboard(){
    rounded(4.1,5.9,.23,.12,mat(0xe7e5d9,{roughness:.9}),circuit,[2.9,-.04,.05]);
    box(.18,.03,5.2,mat(0xc9c9bc),circuit,[2.9,.088,.05]);
    const t=texture(1024,1536,(c,w,h)=>{
      c.strokeStyle='#d76956';c.lineWidth=4;c.beginPath();c.moveTo(70,60);c.lineTo(70,h-60);c.moveTo(w-70,60);c.lineTo(w-70,h-60);c.stroke();
      c.strokeStyle='#6a929d';c.beginPath();c.moveTo(115,60);c.lineTo(115,h-60);c.moveTo(w-115,60);c.lineTo(w-115,h-60);c.stroke();
      c.fillStyle='#777e73';c.font='21px monospace';c.textAlign='center';['a','b','c','d','e','f','g','h','i','j'].forEach((v,i)=>c.fillText(v,194+(i<5?i:i+1)*58,48));
      for(let row=0;row<27;row++)for(let col=0;col<10;col++){let x=194+(col<5?col:col+1)*58,y=100+row*51;c.fillStyle='#c1c4b8';c.fillRect(x-9,y-10,18,20);c.fillStyle='#727d70';c.fillRect(x-5,y-7,10,13);}
      for(let row=0;row<27;row++)for(const x of [45,92,w-45,w-92]){c.fillStyle='#9da796';c.fillRect(x-4,94+row*51,8,13);}
      c.font='16px monospace';c.fillStyle='#849080';for(let row=0;row<27;row+=5)c.fillText(row+1,150,105+row*51);
    });print(4,5.8,t,circuit,[2.9,.12,.05]);
  }
  function wire(a,b,color){const ar=[a[0],a[1]+.25,a[2]],br=[b[0],b[1]+.6,b[2]];const o=line([a,ar,[(a[0]+b[0])/2,Math.max(a[1],b[1])+.9,(a[2]+b[2])/2],br,b],color,.033,circuit);o.userData.wire=true;return o;}
  function led(x,z,id='led',color=0xe96249){
    const g=new THREE.Group();g.position.set(x,.13,z);circuit.add(g);
    for(const dx of [-.11,.11])cyl(.025,.58,silver,g,[dx,.22,0],id,8);
    const m=mat(color,{transparent:true,opacity:.92,roughness:.65,emissive:color,emissiveIntensity:.07});
    cyl(.23,.31,m,g,[0,.65,0],id);const dome=mesh(new THREE.SphereGeometry(.23,24,16,0,Math.PI*2,0,Math.PI/2),m,g,[0,.805,0],id);cyl(.27,.045,m,g,[0,.48,0],id);anim.led=m;anim.ledGroup=g;return g;
  }
  function resistor(x,z,ohms=330){const g=new THREE.Group();g.userData.focusToken='component:resistor';g.userData.resistance=ohms;g.position.set(x,.35,z);g.rotation.z=Math.PI/2;circuit.add(g);cyl(.09,.68,mat(0xc2ae79),g,[0,0,0]);const bands=({330:[0xc77236,0xc77236,0x513c25],100:[0x513c25,0x292a27,0x513c25],10000:[0x513c25,0x292a27,0xc77236],2200:[0xa33a28,0xa33a28,0xa33a28],3300:[0xc77236,0xc77236,0xa33a28]})[ohms]||[0xc77236,0xc77236,0x513c25];for(const [y,c] of [[-.2,bands[0]],[-.08,bands[1]],[.04,bands[2]],[.24,0xb89b3d]])cyl(.093,.055,mat(c),g,[0,y,0]);for(const side of [-1,1])cyl(.022,.4,silver,g,[0,side*.46,0]);return g;}
  function groupRecent(start,token){const children=circuit.children.slice(start),g=new THREE.Group();g.userData.focusToken=token;circuit.add(g);for(const o of children)g.add(o);return g;}
  function pushButton(x,z){const g=new THREE.Group();g.position.set(x,.2,z);circuit.add(g);rounded(.7,.7,.14,.06,black,g,[0,0,0],'button');box(.56,.07,.56,silver,g,[0,.1,0],'button');anim.button=cyl(.18,.19,mat(C.red),g,[0,.22,0],'button');for(const s of [-1,1])for(const zz of [-.22,.22])box(.23,.04,.07,silver,g,[s*.4,-.04,zz]);}
  function knob(x,z){const g=new THREE.Group();g.position.set(x,.34,z);circuit.add(g);rounded(.9,.9,.3,.06,mat(0x3c7198),g,[0,0,0],'potentiometer');cyl(.36,.19,silver,g,[0,.24,0],'potentiometer');anim.knob=cyl(.23,.48,black,g,[0,.54,0],'potentiometer');box(.05,.015,.19,white,anim.knob,[0,.245,-.1]);}
  function buzzer(x,z){cyl(.44,.46,black,circuit,[x,.4,z],'buzzer');cyl(.08,.015,mat(0x070e0d),circuit,[x,.64,z],'buzzer');const m=mat(C.teal,{transparent:true,opacity:0});anim.sound=[];for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.5+i*.18,.013,6,48),m.clone(),circuit,[x,.66,z],'buzzer');ring.rotation.x=-Math.PI/2;anim.sound.push(ring);}}
  function plant(x,z){const g=new THREE.Group();g.position.set(x,.35,z);circuit.add(g);anim.plant=g;mesh(new THREE.CylinderGeometry(.57,.4,.8,32),mat(0xc78263),g,[0,0,0]);cyl(.54,.03,mat(0x56463c),g,[0,.41,0]);line([[0,.4,0],[0,1,0],[.05,1.5,0]],0x547d47,.04,g);for(let i=0;i<6;i++){const l=mesh(new THREE.SphereGeometry(.26,12,8),mat(i%2?0x5f9459:0x75a66a),g,[Math.cos(i*2.4)*.24,.7+i*.13,Math.sin(i*2.4)*.17]);l.scale.set(1.5,.2,.65);l.rotation.z=i%2?.5:-.5;}g.traverse(o=>{if(o.isMesh&&!o.userData.part){o.userData.part='oled';meshes.push(o);}}); }
  function oled(x,z){rounded(1.6,1.14,.13,.06,mat(0x294565),circuit,[x,.25,z],'oled');rounded(1.27,.78,.035,.03,mat(0x101c22),circuit,[x,.335,z],'oled');const t=texture(512,256,()=>{});anim.oled=print(1.12,.62,t,circuit,[x,.357,z],'oled');anim.oledTexture=t;anim.oledLast=null;}
  function updateOled(){if(!anim.oledTexture)return;const pct=Math.round(THREE.MathUtils.clamp(value,0,100)),key=running?String(pct):'off';if(anim.oledLast===key)return;anim.oledLast=key;const c=anim.oledTexture.image.getContext('2d');c.clearRect(0,0,512,256);if(running){c.fillStyle='#91dfcb';c.textAlign='center';c.font='25px monospace';c.fillText('SOIL MOISTURE',256,48);c.font='65px monospace';c.fillText(pct+'%',256,133);c.font='27px monospace';c.fillText(pct<30?'TIME TO WATER':'LOOKING GOOD',256,200);}anim.oledTexture.needsUpdate=true;}
  function externalSetup(id){
    meshes=meshes.filter(m=>!isChildOf(m,circuit));
    clearCircuit();world.remove(circuit);circuit=new THREE.Group();world.add(circuit);anim={};
    board.position.x=id==='board'?0:-2.25;
    if(id==='board'){rebuildLabels();captureBounds();resize();return;}
    breadboard();
    // These board-side connections use the lesson's real GPIO locations. The
    // breadboard layout is an illustration; the lesson wiring table is the reference.
    const pinPosition=pin=>{const key=String(pin),left=PINS_LEFT.indexOf(key),right=PINS_RIGHT.indexOf(key);if(left>=0)return[-3.8,.25,-3.01+left*.43];if(right>=0)return[-.7,.25,-3.01+right*.43];const aliases={16:'RX2',17:'TX2'};return pinPosition(aliases[key]||'GND');};
    const signalPins={blink:[23],button:[18,23],potentiometer:[34,23],rgb:[25,26,27],light:[34,23],distance:[23,34],sound:[25],piano:[25,13,14,16,17,18,19,21,22],motor:[25],temperature:[27],servo:[18],stepper:[16,17,18,19],plant:[34,21,22],force:[34,23],wifi:[23]}[id]||[];
    const wireColors=[0xd4ac58,0x68a19a,0x8a8bb0,0xd07964];
    signalPins.forEach((pin,i)=>wire(pinPosition(pin),[1.9+(i%3)*.28,.13,-1.8+i*.38],wireColors[i%wireColors.length]));
    if(signalPins.length)anim.flowPath={a:pinPosition(signalPins[0]),b:[1.9,.13,-1.8]};
    wire([-.7,.25,2.58],[1.25,.13,2.35],0x3e5350);
    if(['potentiometer','light','temperature','plant','force'].includes(id))wire([-.7,.25,3.01],[1.25,.13,1.9],C.red);
    if(['motor','servo','stepper','distance'].includes(id)){
      // Power for motion and the HC-SR04 comes from a separate supply, never 3V3.
      const supplyStart=circuit.children.length;rounded(1.25,.75,.45,.06,mat(0x4e5b58),circuit,[4.2,.3,3.6]);
      print(1.1,.59,texture(384,192,c=>{c.fillStyle='#d7e0ce';c.textAlign='center';c.font='26px monospace';c.fillText(id==='motor'?'EXT. SUPPLY':'EXT. 5 V',192,78);c.font='23px monospace';c.fillText('+        −',192,135);}),circuit,[4.2,.537,3.6]);
      groupRecent(supplyStart,'component:supply');
      wire([3.9,.4,3.3],[1.25,.13,1.9],C.red);wire([4.5,.4,3.3],[1.25,.13,2.35],0x3e5350);
    }
    switch(id){
      case 'blink':led(3,.15);resistor(2.2,1.1);break;
      case 'button':led(3.3,-1.35);pushButton(2.8,.65);resistor(2,1.75);break;
      case 'potentiometer':knob(2.8,.1);led(3.7,-1.8);resistor(2.1,1.7);break;
      case 'rgb':led(2.9,-.1,'rgb',0x9fb5b1);resistor(2.1,1.1);resistor(2.1,1.5);resistor(2.1,1.9);break;
      case 'light':{
        cyl(.34,.09,mat(0xc69769),circuit,[2.7,.65,-.6],'ldr');
        for(const dx of [-.18,.18])cyl(.02,.5,silver,circuit,[2.7+dx,.37,-.6],'ldr',8);
        print(.6,.6,texture(256,256,(c)=>{c.strokeStyle='#714b37';c.lineWidth=13;c.beginPath();for(let i=0;i<8;i++){let x=42+i*24;c.lineTo(x,i%2?60:195);}c.stroke();}),circuit,[2.7,.699,-.6],'ldr');led(3.4,1.15);resistor(1.9,.1,10000);resistor(2.1,1.9);break;}
      case 'distance':{
        rounded(2.5,1.1,.09,.07,mat(0x2a7889),circuit,[2.9,.45,-.6],'distance');
        for(const x of [2.15,3.65]){const a=cyl(.43,.52,silver,circuit,[x,.72,-.6],'distance');a.rotation.x=Math.PI/2;const face=cyl(.34,.025,mat(0x34484d),circuit,[x,.72,-.32],'distance');face.rotation.x=Math.PI/2;}
        anim.obstacle=rounded(1.25,.7,.5,.12,mat(0xc69164),circuit,[3,.36,1.7],'distance');resistor(1.9,1.1,2200);resistor(1.9,1.65,3300);break;}
      case 'sound':buzzer(2.9,-.35);resistor(2.1,1.1,100);break;
      case 'piano':{buzzer(2.9,-1.55);resistor(1.9,-1.3,100);anim.keys=[];for(let i=0;i<8;i++){const k=rounded(.37,1.15,.15,.025,mat(0xf5f4eb),circuit,[1.48+i*.4,.28,.7],'buzzer');k.userData.note=i;anim.keys.push(k);const t=print(.24,.28,texture(128,128,c=>{c.fillStyle='#50685e';c.textAlign='center';c.font='56px monospace';c.fillText(['C','D','E','F','G','A','B','C'][i],64,84);}),circuit,[1.48+i*.4,.362,1],'buzzer');t.userData.note=i;t.userData.keyLabel=i;}break;}
      case 'motor':{
        const driverStart=circuit.children.length;rounded(.45,.3,.62,.04,black,circuit,[4,.65,1.35],'motor');box(.38,.035,.18,silver,circuit,[4,.98,1.35],'motor');for(let i=0;i<3;i++)cyl(.02,.44,silver,circuit,[3.86+i*.14,.27,1.35],'motor',8);groupRecent(driverStart,'component:driver');resistor(2.1,1.75,100);resistor(1.9,2.25,10000);
        const diode=cyl(.085,.44,black,circuit,[3.2,.35,1.8],'motor');diode.rotation.z=Math.PI/2;diode.userData.focusToken='component:diode';
        const a=cyl(.44,1.18,silver,circuit,[2.8,.69,-.3],'motor');a.rotation.x=Math.PI/2;
        rounded(.94,.75,.63,.09,mat(0xd9b145),circuit,[2.8,.6,.68],'motor');
        anim.rotor=new THREE.Group();anim.rotor.position.set(2.8,.69,-1);circuit.add(anim.rotor);
        cyl(.14,.12,black,anim.rotor,[0,0,0],'motor').rotation.x=Math.PI/2;
        for(let i=0;i<3;i++){const wing=box(.22,.93,.06,mat(C.teal),anim.rotor,[Math.sin(i*2.094)*.3,Math.cos(i*2.094)*.3,0],'motor');wing.rotation.z=-i*2.094;}break;}
      case 'temperature':{
        const housing=mat(0xe8e9df,{roughness:.88});rounded(1.03,1.35,.55,.09,housing,circuit,[2.9,.65,-.3],'temperature');
        // The bare DHT22 has four leads and a slotted white vented enclosure.
        for(let i=0;i<4;i++)box(.045,.045,.58,silver,circuit,[2.58+i*.21,.22,.61],'temperature');
        for(let row=0;row<7;row++)for(const side of [-1,1])rounded(.32,.055,.012,.02,mat(0x6f817a,{roughness:.9}),circuit,[2.9+side*.23,.934,-.82+row*.15],'temperature');
        for(const x of [2.38,3.42])for(let row=0;row<5;row++)box(.012,.22,.055,mat(0x8d9990),circuit,[x,.66,-.7+row*.2],'temperature');
        print(.72,.2,texture(384,128,c=>{c.fillStyle='#5b6a62';c.font='37px monospace';c.textAlign='center';c.fillText('DHT22',192,80);}),circuit,[2.9,.94,.24],'temperature');resistor(1.9,1.2,10000);break;}
      case 'servo':{
        rounded(.9,1.75,.9,.08,mat(0x46778e,{roughness:.77}),circuit,[2.9,.6,.1],'servo');box(1.3,.12,.3,mat(0x416782),circuit,[2.9,.4,-.65],'servo');box(1.3,.12,.3,mat(0x416782),circuit,[2.9,.4,.85],'servo');
        cyl(.3,.2,white,circuit,[2.9,1.14,-.3],'servo');anim.servo=new THREE.Group();anim.servo.position.set(2.9,1.28,-.3);circuit.add(anim.servo);rounded(.2,1.8,.1,.08,white,anim.servo,[0,0,0],'servo');cyl(.09,.02,silver,anim.servo,[0,.06,0]);break;}
      case 'stepper':{
        const driverStart=circuit.children.length;rounded(1.45,1.18,.1,.04,mat(0x477857),circuit,[2.9,.2,1.8],'stepper');box(.48,.16,.78,black,circuit,[2.9,.33,1.8],'stepper');for(let i=0;i<4;i++){box(.12,.18,.12,gold,circuit,[2.38,.35,1.42+i*.23],'stepper');box(.12,.15,.12,white,circuit,[3.42,.33,1.42+i*.23],'stepper');}print(.4,.65,texture(256,512,c=>{c.fillStyle='#b2c5ad';c.textAlign='center';c.translate(128,256);c.rotate(-Math.PI/2);c.font='40px monospace';c.fillText('ULN2003',0,14);}),circuit,[2.9,.417,1.8],'stepper');groupRecent(driverStart,'component:driver');
        cyl(.8,.7,silver,circuit,[2.9,.52,0],'stepper');box(1.8,.1,.35,silver,circuit,[2.9,.3,0],'stepper');cyl(.15,.35,gold,circuit,[2.9,1.03,0],'stepper');anim.stepper=new THREE.Group();anim.stepper.position.set(2.9,1.22,0);circuit.add(anim.stepper);rounded(.2,1.3,.08,.05,mat(C.teal),anim.stepper,[0,0,.45],'stepper');break;}
      case 'plant':{plant(3.2,-1.05);oled(2.85,1.7);const probe=box(.2,.9,.08,mat(0x39745a),circuit,[3.55,.8,-1.05],'oled');probe.userData.focusToken='component:soil';break;}
      case 'force':{
        cyl(.64,.065,mat(0x323e3b),circuit,[2.9,.2,-.3],'fsr');cyl(.49,.02,mat(0x536d62),circuit,[2.9,.242,-.3],'fsr');box(.25,.035,1.35,mat(0x9b7c4e),circuit,[2.9,.2,.8],'fsr');led(3.7,1.7);resistor(1.9,.5,10000);resistor(2.1,1.8);break;}
      case 'wifi':{led(3,.25);resistor(2.1,1.1);anim.wifi=[];for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.6+i*.32,.025,8,48,Math.PI*1.3),mat(C.teal,{transparent:true,opacity:.4}),circuit,[-2.25,1+i*.25,-2.8],'wifi');ring.rotation.x=-.6;ring.rotation.z=-.5;anim.wifi.push(ring);}break;}
    }
    rebuildLabels();captureBounds();resize();
  }
  function isChildOf(obj,parent){let o=obj;while(o){if(o===parent)return true;o=o.parent;}return false;}
  function captureBounds(){
    board.updateMatrixWorld(true);circuit.updateMatrixWorld(true);
    // Final model coordinates form a conservative envelope. Transform its corners
    // into camera space on every yaw update; framing therefore cannot lose an edge.
    frameBounds=new THREE.Box3();
    for(const parent of [board,circuit])parent.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const local=o.geometry.boundingBox.clone();const relative=new THREE.Matrix4().copy(world.matrixWorld).invert().multiply(o.matrixWorld);local.applyMatrix4(relative);frameBounds.union(local);});
    frameBounds.expandByScalar(.3);
    // Interactive obstacles may move after the static layout was captured.
    if(lesson==='distance')frameBounds.max.z=Math.max(frameBounds.max.z,3.05);
  }
  function frameCamera(){
    if(!frameBounds)return;
    const bounds=focusState?.bounds||frameBounds;
    const yawMatrix=new THREE.Matrix4().makeRotationY(rotation), aspect=viewWidth/viewHeight;
    viewDirection.lerp(targetDirection,reducedMotion.matches?1:.14);
    bounds.getCenter(frameCenter).applyMatrix4(yawMatrix);
    if(!framingReady){cameraCenter.copy(frameCenter);framingReady=true;}else cameraCenter.lerp(frameCenter,.2);
    camera.position.copy(cameraCenter).add(viewDirection);camera.lookAt(cameraCenter);camera.updateMatrixWorld(true);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      framePoint.set(x,y,z).applyMatrix4(yawMatrix).applyMatrix4(camera.matrixWorldInverse);
      minX=Math.min(minX,framePoint.x);maxX=Math.max(maxX,framePoint.x);minY=Math.min(minY,framePoint.y);maxY=Math.max(maxY,framePoint.y);
    }
    // 18% padding plus the expanded model bounds keeps assembly and max zoom in frame.
    const needed=Math.max(Math.abs(minY),Math.abs(maxY),Math.abs(minX)/aspect,Math.abs(maxX)/aspect)*2*1.18/zoomLevel;
    fittedHeight=fittedHeight?Math.max(needed,fittedHeight+(needed-fittedHeight)*.18):needed;const height=fittedHeight;
    camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  }
  function canonicalToken(token){
    const [kind,raw='',qualifier,...extra]=String(token).split(':');if(!['pin','part','component'].includes(kind)||extra.length)return null;
    if(kind==='pin'){if(qualifier!==undefined)return null;let name=raw.toUpperCase().replace(/^GPIO/,'');name=({VP:'36',VN:'39',TX0:'1',RX0:'3',RX2:'16',TX2:'17'})[name]||name;return 'pin:'+name;}
    const id=raw.toLowerCase();if(qualifier!==undefined){if(kind!=='component'||id!=='resistor')return null;const q=qualifier.toLowerCase().replace(/\s|[Ωω]|ohms?/g,'');const canonical=({'10000':'10k','2200':'2.2k','2k2':'2.2k','3300':'3.3k','3k3':'3.3k'})[q]||q;return 'component:resistor:'+canonical;}
    return kind+':'+id;
  }
  function explicitToken(o){for(let n=o;n&&n!==world;n=n.parent)if(n.userData.focusToken)return n.userData.focusToken;return null;}
  function resolveTarget(token){
    const [kind,id,qualifier]=token.split(':'),found=[];
    if(kind==='component'&&id==='resistor'&&qualifier!==undefined){const ohms=({'100':100,'330':330,'10k':10000,'2.2k':2200,'3.3k':3300})[qualifier];if(ohms===undefined)return found;circuit.traverse(o=>{if(o.userData.focusToken==='component:resistor'&&o.userData.resistance===ohms)found.push(o);});return found;}
    if(kind==='pin'){board.traverse(o=>{if(o.isMesh&&o.userData.pin===id)found.push(o);});return found;}
    if(kind==='part'&&id==='usb')return[usb];
    const base=kind==='part'?board:circuit;
    base.traverse(o=>{
      if(o.userData.focusToken===token){found.push(o);return;}
      if(!o.isMesh||explicitToken(o))return;
      if(kind==='part'&&o.userData.part===id&&id!=='usb')found.push(o);
      if(kind==='component'){
        if(id==='piano'&&(Number.isInteger(o.userData.note)||Number.isInteger(o.userData.keyLabel))){found.push(o);return;}
        if(o.userData.part!==id)return;
        if(id==='oled'&&anim.plant&&isChildOf(o,anim.plant))return;
        if(id==='distance'&&o===anim.obstacle)return;
        if(id==='buzzer'&&(anim.sound?.includes(o)||Number.isInteger(o.userData.note)||Number.isInteger(o.userData.keyLabel)))return;
        found.push(o);
      }
    });return found;
  }
  function objectsBounds(objects){
    world.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(world.matrixWorld).invert(),bounds=new THREE.Box3();
    for(const parent of objects)parent.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(inverse).multiply(o.matrixWorld)));});
    return bounds;
  }
  function focusName(token){const[kind,id,qualifier]=token.split(':');if(id==='resistor'&&qualifier)return qualifier.endsWith('k')?qualifier.slice(0,-1)+' kΩ':qualifier+' Ω';if(kind==='pin')return /^\d+$/.test(id)?'GPIO '+id:id;return({usb:'USB CONNECTOR',module:'ESP-WROOM-32',antenna:'2.4 GHz ANTENNA',regulator:'3.3 V REGULATOR',en:'RESET / EN',boot:'BOOT',temperature:'DHT22',soil:'MOISTURE PROBE',driver:lesson==='stepper'?'ULN2003 DRIVER':'MOSFET DRIVER',supply:'EXTERNAL SUPPLY',ldr:'LIGHT SENSOR',fsr:'FORCE SENSOR',oled:'OLED DISPLAY'})[id]||id.toUpperCase();}
  function removeFocusVisuals(){
    for(const o of [...focusLayer.children]){o.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of(Array.isArray(n.material)?n.material:[n.material]))m.dispose();});focusLayer.remove(o);}
    focusLabels.replaceChildren();
  }
  function clearFocus(){
    if(!focusState)return;const prior=focusState.prior;focusState=null;removeFocusVisuals();
    targetDirection.set(7,13,10);targetRotation=prior.yaw;zoomLevel=prior.zoom;
    if(reducedMotion.matches){rotation=targetRotation;viewDirection.copy(targetDirection);framingReady=false;fittedHeight=0;}
    cameraAnimatingUntil=performance.now()+(reducedMotion.matches?0:850);container.dataset.focusTargets='[]';container.dataset.focusActive='false';callbacks.onFocusChange?.(false);
  }
  function focus({targets=[],view='connection'}={}){
    cancelGesture(true);
    // A deliberate guide selection settles an in-flight lesson switch first, so
    // target resolution can never accidentally refer to the outgoing lesson.
    if(transition){transition=null;board.position.y=0;externalSetup(lesson);container.dataset.transitioning='false';}
    const prior=focusState?.prior||{yaw:targetRotation,zoom:zoomLevel};removeFocusVisuals();
    const resolved=[],unresolved=[],entries=[];
    for(const requested of [...new Set(targets)]){
      const token=canonicalToken(requested),objects=token?resolveTarget(token):[];
      if(!objects.length){unresolved.push(requested);continue;}
      if(resolved.includes(token))continue;resolved.push(token);
      if(token.startsWith('pin:')){const groups=new Map();for(const o of objects){const key=o.userData.pinCluster;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}for(const group of groups.values())entries.push({token,box:objectsBounds(group)});}
      else if(token.startsWith('component:resistor')){for(const o of objects){const n=o.userData.resistance,label=n>=1000?(n/1000)+' kΩ':n+' Ω';entries.push({token,box:objectsBounds([o]),label});}}
      else entries.push({token,box:objectsBounds(objects)});
    }
    if(!entries.length){focusState={prior};clearFocus();return{resolved,unresolved};}
    const selected=new THREE.Box3();for(const e of entries)selected.union(e.box);
    let bounds=selected.clone();
    if(view==='board')bounds.union(objectsBounds([board]));
    else if(view==='usb'){bounds.expandByVector(new THREE.Vector3(.9,.45,.75));}
    else if(view==='top')bounds.expandByVector(new THREE.Vector3(.8,.35,.8));
    else if(view==='circuit')bounds.expandByVector(new THREE.Vector3(.65,.4,.65));
    else bounds.expandByVector(new THREE.Vector3(.65,.45,.65));
    const size=bounds.getSize(new THREE.Vector3());if(size.x<2.5)bounds.expandByVector(new THREE.Vector3((2.5-size.x)/2,0,0));if(size.z<2)bounds.expandByVector(new THREE.Vector3(0,0,(2-size.z)/2));
    const dirs={board:[2,19,7],top:[0,22,3.5],usb:[3,9,17],circuit:[4,18,10],connection:[3,18,9]};
    targetDirection.set(...(dirs[view]||dirs.connection));targetRotation=view==='usb'?0:-.04;zoomLevel=1;
    const units=entries.map((entry,index)=>{
      const b=entry.box.clone().expandByScalar(entry.token.startsWith('pin:')?.07:.07);
      const helper=new THREE.Box3Helper(b,0xd67c39);helper.material.transparent=true;helper.material.opacity=.96;helper.material.depthTest=false;helper.material.depthWrite=false;helper.renderOrder=30;focusLayer.add(helper);
      const anchor=b.getCenter(new THREE.Vector3());anchor.y=b.max.y+.08;
      if(entry.token.startsWith('pin:')){const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.018,8,40),new THREE.MeshBasicMaterial({color:0xe69a46,depthTest:false,transparent:true,opacity:.95}));ring.rotation.x=-Math.PI/2;ring.position.copy(anchor);ring.renderOrder=31;focusLayer.add(ring);}
      const label=document.createElement('div');label.className='scene-focus-label';label.dataset.focusTarget=entry.token;label.textContent=entry.label||focusName(entry.token);label.style.cssText='position:absolute;transform:translate(-50%,-100%);padding:5px 7px;border:1px solid #c47843;background:rgba(255,249,231,.97);color:#8d4f2d;font:600 10px/1.15 monospace;letter-spacing:.05em;white-space:nowrap;box-shadow:0 2px 8px #5c412118;';focusLabels.append(label);
      const stem=document.createElement('div');stem.style.cssText='position:absolute;width:1px;background:#c47843;transform-origin:top left;';focusLabels.append(stem);
      return{...entry,anchor,label,stem,index};
    });
    focusState={prior,bounds,units,resolved,view};
    if(reducedMotion.matches){rotation=targetRotation;viewDirection.copy(targetDirection);framingReady=false;fittedHeight=0;}
    cameraAnimatingUntil=performance.now()+(reducedMotion.matches?0:1000);container.dataset.focusTargets=JSON.stringify(resolved);container.dataset.focusActive='true';callbacks.onFocusChange?.(true,{resolved,unresolved});frameCamera();return{resolved,unresolved};
  }
  function positionFocusLabels(){
    if(!focusState?.units)return;const placed=[];
    for(const u of focusState.units){
      temp.copy(u.anchor).applyMatrix4(world.matrixWorld).project(camera);
      const ax=(temp.x*.5+.5)*viewWidth,ay=(-temp.y*.5+.5)*viewHeight,w=u.label.offsetWidth||90,h=u.label.offsetHeight||24;
      const minX=Math.min(w/2+8,viewWidth/2),maxX=Math.max(viewWidth/2,viewWidth-w/2-8),maxY=Math.max(h+8,viewHeight-30);
      let best=null,bestScore=Infinity;
      // Search nearby annotation lanes instead of pushing labels into a stack
      // against the bottom edge on narrow screens.
      for(const dy of [-24,-54,32,-84,62,-114,92])for(const dx of [0,-60,60,-110,110]){
        const x=THREE.MathUtils.clamp(ax+dx,minX,maxX),y=THREE.MathUtils.clamp(ay+dy,h+8,maxY);
        let overlaps=0;for(const p of placed)if(Math.abs(x-p.x)<(w+p.w)/2+7&&y-h<p.y+6&&y>p.y-p.h-6)overlaps++;
        const score=overlaps*100000+Math.hypot(x-ax,(y-ay)*1.15)+(dy>0?12:0);
        if(score<bestScore){bestScore=score;best={x,y,w,h};}
      }
      const {x,y}=best;u.label.style.left=x+'px';u.label.style.top=y+'px';placed.push(best);
      const dx=x-ax,dy=y-ay;u.stem.style.left=ax+'px';u.stem.style.top=ay+'px';u.stem.style.height=Math.hypot(dx,dy)+'px';u.stem.style.transform='rotate('+(-Math.atan2(dx,dy))+'rad)';
    }
  }
  function resize(){viewWidth=Math.max(1,container.clientWidth||600);viewHeight=Math.max(1,container.clientHeight||500);renderer.setSize(viewWidth,viewHeight,false);frameCamera();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function hit(e){
    if(transition)return null;const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return null;
    mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    world.updateMatrixWorld(true);camera.updateMatrixWorld(true);rays.setFromCamera(mouse,camera);
    return rays.intersectObjects(meshes,false).find(h=>h.object.visible)||null;
  }
  function interaction(h,e={}){
    if(!h||focusState||e.shiftKey||e.altKey)return null;const part=h.object.userData.part;
    if(lesson==='board'&&part==='en')return{kind:'tap',part,action:'reset'};
    if(!isChildOf(h.object,circuit))return null;
    if(lesson==='piano'&&Number.isInteger(h.object.userData.note))return{kind:'hold',part,action:'piano',note:h.object.userData.note};
    if(lesson==='button'&&part==='button')return{kind:'hold',part,action:'button'};
    if(lesson==='light'&&part==='ldr')return{kind:'hold',part,action:'light'};
    if(lesson==='force'&&part==='fsr')return{kind:'hold',part,action:'force'};
    if(lesson==='wifi'&&part==='led')return{kind:'tap',part,action:'toggle'};
    if(lesson==='blink'&&part==='led')return{kind:'tap',part,action:'blink'};
    const allowed={potentiometer:'potentiometer',rgb:'rgb',distance:'distance',sound:'buzzer',motor:'motor',temperature:'temperature',servo:'servo',stepper:'stepper',plant:'oled'};
    if(allowed[lesson]===part&&(lesson!=='distance'||h.object===anim.obstacle))return{kind:'drag',part,action:lesson};
    return null;
  }
  function emit(type,data={}){
    if(type==='value'&&data.value!==undefined)value=THREE.MathUtils.clamp(Number(data.value)||0,0,100);
    if(type==='press')pressed=!!data.pressed;
    if(type==='toggle')pressed=data.pressed===undefined?!pressed:!!data.pressed;
    callbacks.onInteract?.({type,...data,...(type==='value'?{value}:{}),...(type==='toggle'?{pressed}:{})});
  }
  function beginAction(g,e){
    if(g.action==='button')emit('press',{pressed:true,part:g.part});
    if(g.action==='piano'){value=g.note/7*100;emit('press',{pressed:true,value,part:g.part});}
    if(g.action==='light')emit('value',{value:0,part:g.part});
    if(g.action==='force')emit('value',{value:e.pointerType==='pen'&&e.pressure>0?e.pressure*100:80,part:g.part});
  }
  function releaseAction(silent=false){
    if(!gesture)return;
    if(silent===true){gesture=null;pressed=false;return;}
    if(['button','piano'].includes(gesture.action))emit('press',{pressed:false,value,part:gesture.part});
    if(gesture.action==='force')emit('value',{value:0,part:gesture.part});
    if(gesture.action==='light')emit('value',{value:gesture.startValue,part:gesture.part});
    gesture=null;
  }
  function tapAction(g){
    if(g.action==='reset'){emit('reset',{part:g.part});return;}
    if(g.action==='toggle'){emit('toggle',{pressed:!pressed,part:g.part});return;}
    const step={blink:25,potentiometer:25,rgb:100/12,distance:25,sound:12.5,motor:25,temperature:12.5,servo:25,stepper:12.5,plant:25}[g.action];
    if(step!==undefined)emit('value',{value:g.action==='plant'?Math.min(100,value+step):(value+step>100.01?0:value+step),part:g.part});
  }
  function hoverAt(e){const h=hit(e),part=h?.object.userData.part||null;hover=part;const a=interaction(h,e);renderer.domElement.style.cursor=a?.kind==='drag'?'ew-resize':part?'pointer':'grab';callbacks.onHover?.(part,{x:e.clientX,y:e.clientY});}
  function cancelGesture(silent=false){releaseAction(silent===true);if(silent===true)pressed=false;pointerDown=null;pointers.clear();pinchDist=0;callbacks.onHover?.(null,{x:0,y:0});}
  function down(e){
    if((e.button!==undefined&&e.button!==0)||transition)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{renderer.domElement.setPointerCapture(e.pointerId);}catch{}
    if(pointers.size>1){clearFocus();releaseAction();pointerDown=null;const[a,b]=[...pointers.values()];pinchDist=Math.hypot(a.x-b.x,a.y-b.y);lastPinch=zoomLevel;return;}
    const h=hit(e),a=interaction(h,e);
    pointerDown={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,hit:h,inspect:!!(e.shiftKey||e.altKey)};
    gesture=a?{...a,startValue:value,startX:e.clientX,startY:e.clientY}:null;
    if(gesture)beginAction(gesture,e);
    renderer.domElement.style.cursor=gesture?.kind==='drag'?'ew-resize':'grabbing';
  }
  function move(e){
    if(!pointers.has(e.pointerId)){hoverAt(e);return;}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){const[a,b]=[...pointers.values()];zoomLevel=THREE.MathUtils.clamp(lastPinch*Math.hypot(a.x-b.x,a.y-b.y)/(pinchDist||1),MIN_ZOOM,MAX_ZOOM);frameCamera();return;}
    if(!pointerDown||pointerDown.id!==e.pointerId)return;
    const dx=e.clientX-pointerDown.x,totalX=e.clientX-pointerDown.startX,totalY=e.clientY-pointerDown.startY;
    if(Math.hypot(totalX,totalY)>5)pointerDown.moved=true;
    if(gesture?.kind==='drag'&&pointerDown.moved){emit('value',{value:gesture.startValue+totalX/Math.max(140,viewWidth*.35)*100,part:gesture.part});}
    else if(gesture?.action==='force'){emit('value',{value:e.pointerType==='pen'&&e.pressure>0?e.pressure*100:80-totalY*.7,part:gesture.part});}
    else if(gesture?.action==='piano'){const h=hit(e),note=h?.object.userData.note;if(Number.isInteger(note)&&note!==gesture.note){gesture.note=note;value=note/7*100;emit('press',{pressed:true,value,part:gesture.part});}}
    else if(!gesture&&pointerDown.moved){clearFocus();targetRotation=THREE.MathUtils.clamp(targetRotation+dx*.006,DEFAULT_YAW-Math.PI*.85,DEFAULT_YAW+Math.PI*.85);}
    pointerDown.x=e.clientX;pointerDown.y=e.clientY;callbacks.onHover?.(null,{x:e.clientX,y:e.clientY});
  }
  function up(e){
    const had=pointers.has(e.pointerId);pointers.delete(e.pointerId);
    if(!had)return;
    if(pointerDown?.id===e.pointerId){
      const clicked=e.type==='pointerup'&&!pointerDown.moved;
      if(clicked&&gesture&&gesture.kind!=='hold')tapAction(gesture);
      else if(clicked&&!gesture){const part=pointerDown.hit?.object.userData.part;if(part)callbacks.onInspect?.(part);}
      releaseAction();pointerDown=null;
    }
    // A remaining finger after a pinch starts a fresh orbit, never a component click.
    if(pointers.size===1){const[id,p]=[...pointers.entries()][0];pointerDown={id,x:p.x,y:p.y,startX:p.x,startY:p.y,moved:true,hit:null};}
    renderer.domElement.style.cursor='grab';
  }
  function lost(e){if(pointers.has(e.pointerId))up({...e,type:'pointercancel',pointerId:e.pointerId});}
  function leave(){if(!pointers.size){hover=null;callbacks.onHover?.(null,{x:0,y:0});}}
  function wheel(e){e.preventDefault();clearFocus();zoomLevel=THREE.MathUtils.clamp(zoomLevel*Math.exp(-e.deltaY*.0007),MIN_ZOOM,MAX_ZOOM);frameCamera();}
  function turn(d){clearFocus();targetRotation=THREE.MathUtils.clamp(targetRotation+d,DEFAULT_YAW-Math.PI*.85,DEFAULT_YAW+Math.PI*.85);}
  function key(e){if(['ArrowLeft','ArrowRight','+','-','0'].includes(e.key)){e.preventDefault();clearFocus();if(e.key==='ArrowLeft')turn(-.15);if(e.key==='ArrowRight')turn(.15);if(e.key==='+'){zoomLevel=Math.min(MAX_ZOOM,zoomLevel+.05);frameCamera();}if(e.key==='-'){zoomLevel=Math.max(MIN_ZOOM,zoomLevel-.05);frameCamera();}if(e.key==='0')reset();}}
  const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:up,lostpointercapture:lost,pointerleave:leave,wheel,keyDown:key};
  for(const[name,fn]of Object.entries(listeners))renderer.domElement.addEventListener(name==='keyDown'?'keydown':name,fn,name==='wheel'?{passive:false}:undefined);
  window.addEventListener('blur',cancelGesture);
  function assemble(id,animate=true){
    const oldX=board.position.x;
    externalSetup(id);
    if(!animate||reducedMotion.matches){transition=null;container.dataset.transitioning='false';return;}
    const parts=circuit.children.map((node,i)=>({node,position:node.position.clone(),scale:node.scale.clone(),rotation:node.rotation.clone(),delay:node.userData.wire?.4+Math.min(.18,i*.003):Math.min(.17,i*.003),lift:node.userData.wire?0:.6+(i%5)*.05,drawCount:node.userData.wire?node.geometry.index.count:0}));
    transition={phase:'in',start:performance.now(),duration:590,parts,fromX:oldX,toX:id==='board'?0:-2.25};
    // Keep both endpoints of the retained board's move inside the camera envelope.
    frameBounds.expandByPoint(new THREE.Vector3(oldX-2,.9,-4));frameBounds.expandByPoint(new THREE.Vector3(oldX+2,-.6,4));
    board.position.x=oldX;board.position.y=.14;
    for(const p of parts){p.node.position.y+=p.lift;p.node.scale.copy(p.scale).multiplyScalar(.12);if(p.drawCount)p.node.geometry.setDrawRange(0,0);}
    container.dataset.transitioning='true';
  }
  function switchLesson(id){
    if(id===lesson)return;
    clearFocus();cancelGesture(true);running=false;pressed=false;lesson=id;container.dataset.lesson=id;zoomLevel=1;
    if(reducedMotion.matches){assemble(id,false);return;}
    if(transition){board.position.y=0;assemble(id,true);return;}
    transition={phase:'out',start:performance.now(),duration:210,target:id,parts:circuit.children.map((node,i)=>({node,position:node.position.clone(),scale:node.scale.clone(),lift:.22+(i%4)*.08})),fromX:board.position.x};
    container.dataset.transitioning='true';
  }
  function animateAssembly(now){
    if(!transition)return;
    const t=transition,p=THREE.MathUtils.clamp((now-t.start)/t.duration,0,1);
    if(t.phase==='out'){
      const eased=p*p;
      for(const part of t.parts){part.node.position.y=part.position.y+part.lift*eased;part.node.scale.copy(part.scale).multiplyScalar(1-eased*.92);}
      board.position.y=.14*eased;
      if(p===1)assemble(t.target,true);
    }else{
      const eased=1-Math.pow(1-p,3);board.position.x=t.fromX+(t.toX-t.fromX)*eased;board.position.y=.14*(1-eased);
      for(const part of t.parts){const q=THREE.MathUtils.clamp((p-part.delay)/(1-part.delay),0,1),ease=1-Math.pow(1-q,3);part.node.position.copy(part.position);part.node.position.y+=part.lift*(1-ease);part.node.scale.copy(part.scale).multiplyScalar(.12+.88*ease);if(part.drawCount)part.node.geometry.setDrawRange(0,Math.floor(part.drawCount*ease/3)*3);}
      if(p===1){board.position.x=t.toX;board.position.y=0;transition=null;container.dataset.transitioning='false';captureBounds();}
    }
  }
  const pulses=[];
  for(let i=0;i<9;i++){const o=mesh(new THREE.SphereGeometry(.055,8,8),new THREE.MeshBasicMaterial({color:0xefffb6}),world,[0,0,0]);o.visible=false;pulses.push(o);}
  function reset(){clearFocus();targetRotation=DEFAULT_YAW;zoomLevel=1;frameCamera();}
  const coarse=window.matchMedia('(pointer: coarse)').matches;let lastRendered=0;
  function tick(now){if(!alive)return;frame=requestAnimationFrame(tick);if(document.hidden){last=now;return;}const moving=Math.abs(targetRotation-rotation)>.001||pointerDown||transition||now<cameraAnimatingUntil;const fps=running||moving?(coarse?30:60):10;if(now-lastRendered<1000/fps)return;lastRendered=now;const dt=Math.min((now-last)/1000,.15);last=now;elapsed+=dt;
    rotation+=(targetRotation-rotation)*.15;world.rotation.y=rotation;world.rotation.x=0;animateAssembly(now);frameCamera();
    const normalized=THREE.MathUtils.clamp(value/100,0,1);let brightness=0;
    if(running&&!transition){
      brightness=lesson==='blink'?(Math.floor(elapsed*1000/(100+normalized*1400))%2===0?1:0):['button','wifi'].includes(lesson)?(pressed?1:0):lesson==='light'?(normalized<1200/4095?1:0):['force','potentiometer'].includes(lesson)?normalized:1;
      // External lesson LEDs do not imply that a particular built-in LED exists.
      onboardLED.emissiveIntensity=.08;
      if(anim.rotor)anim.rotor.rotation.z+=dt*normalized*30;
      if(anim.stepper)anim.stepper.rotation.y=normalized*Math.PI*2;
      if(anim.servo)anim.servo.rotation.y=THREE.MathUtils.degToRad(20+normalized*140-90);
      if(anim.wifi)anim.wifi.forEach((r,i)=>{r.material.opacity=.1+.5*((Math.sin(elapsed*3-i*.8)+1)/2);});
      if(anim.sound)anim.sound.forEach((r,i)=>{const sounding=lesson!=='piano'||pressed;r.material.opacity=sounding?.12+.3*(Math.sin(elapsed*7-i)+1)/2:0;r.scale.setScalar(sounding?1+.09*Math.sin(elapsed*7-i):1);});
      if(anim.keys)anim.keys.forEach((k,i)=>{k.position.y=.28-(pressed&&Math.round(normalized*7)===i?.07:0);});
    }else {onboardLED.emissiveIntensity=.08;if(anim.sound)anim.sound.forEach(r=>r.material.opacity=0);if(anim.wifi)anim.wifi.forEach(r=>r.material.opacity=.12);if(anim.keys&&!transition)anim.keys.forEach(k=>k.position.y=.28);}
    if(anim.keys&&!transition)circuit.children.forEach(o=>{if(Number.isInteger(o.userData.keyLabel))o.position.y=anim.keys[o.userData.keyLabel].position.y+.082;});
    updateOled();
    if(anim.led){anim.led.emissiveIntensity=.04+brightness*1.6;if(lesson==='rgb'){anim.led.color.setHSL(normalized,.7,.55);anim.led.emissive.copy(anim.led.color);}}
    if(!transition&&anim.knob)anim.knob.rotation.y=(normalized-.5)*Math.PI*1.5;
    if(!transition&&anim.button)anim.button.position.y=pressed?.15:.22;
    if(!transition&&anim.obstacle)anim.obstacle.position.z=.8+normalized*1.5;
    pulses.forEach((p,i)=>{p.visible=flow&&running&&!transition&&lesson!=='board';if(p.visible){const t=(elapsed*.3+i/9)%1;const a=anim.flowPath?.a||[-.7,.25,3.01],b=anim.flowPath?.b||[1.25,.13,1.9];p.position.set(a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])+Math.sin(t*Math.PI)*.9,a[2]+t*(b[2]-a[2]));}});
    camera.updateMatrixWorld();world.updateMatrixWorld();const r=container.getBoundingClientRect();
    for(const l of labels){l.el.style.display=labelsVisible&&!focusState?'block':'none';if(!labelsVisible||focusState)continue;temp.copy(l.pos).applyMatrix4(world.matrixWorld).project(camera);const x=(temp.x*.5+.5)*r.width,y=(-temp.y*.5+.5)*r.height;l.el.style.left=Math.max(58,Math.min(r.width-58,x))+'px';l.el.style.top=Math.max(22,Math.min(r.height-22,y))+'px';l.el.style.opacity=(pointerDown?.moved)?.25:1;}
    positionFocusLabels();
    renderer.render(scene,camera);
  }
  externalSetup('board');resize();frame=requestAnimationFrame(tick);callbacks.onReady?.();
  return {
    setLesson:switchLesson,
    setRunning(v){running=!!v;if(!running)cancelGesture(true);elapsed=0;},setValue(v){value=Number(v)||0;},setPressed(v){pressed=!!v;},
    setLabels(v){labelsVisible=!!v;},setFlow(v){flow=!!v;},focus,clearFocus,reset,
    rotate:turn,zoom(d){clearFocus();zoomLevel=THREE.MathUtils.clamp(zoomLevel+d,MIN_ZOOM,MAX_ZOOM);frameCamera();},
    dispose(){alive=false;clearFocus();cancelGesture(true);cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('blur',cancelGesture);for(const[name,fn]of Object.entries(listeners))renderer.domElement.removeEventListener(name==='keyDown'?'keydown':name,fn);transition=null;renderer.dispose();renderer.forceContextLoss();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());labelsEl.remove();focusLabels.remove();renderer.domElement.remove();}
  };
}
