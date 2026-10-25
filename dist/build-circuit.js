// Connectivity rules for the supplied teaching projects, not a general solver.
import { BUILD_PROJECTS, getBuildProject } from './build-projects.js';
export const COLUMNS = 'abcdefghij';
export const ROW_COUNT = 30;
export const MAX_WIRES = 60;
export const WIRE_COLORS = ['#d4ac58', '#3e5350', '#c85848', '#68a19a', '#8a8bb0'];
export const RESISTANCES = [220, 330, 470, 680, 1000];
export const BOARD_PINS = [
  'pin:EN', 'pin:36', 'pin:39', 'pin:34', 'pin:35', 'pin:32', 'pin:33',
  'pin:25', 'pin:26', 'pin:27', 'pin:14', 'pin:12', 'pin:13', 'pin:GND2', 'pin:VIN',
  'pin:23', 'pin:22', 'pin:1', 'pin:3', 'pin:21', 'pin:19', 'pin:18',
  'pin:5', 'pin:17', 'pin:16', 'pin:4', 'pin:2', 'pin:15', 'pin:GND', 'pin:3V3',
];
const pinSet = new Set(BOARD_PINS);
const aliases = {VP:'36', VN:'39', TX0:'1', RX0:'3', TX2:'17', RX2:'16',
  'GND-L':'GND2', 'GND-R':'GND', 'GND_LEFT':'GND2', 'GND_RIGHT':'GND'};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const diagnostic = (code, title, message, targets = [], extra = {}) =>
  ({ok:false, code, title, message, targets:[...new Set(targets.filter(Boolean))], ...extra});

export function initialState(project='blink') {
  project=getBuildProject(project).id;
  return {version:1, project, parts:Object.fromEntries(getBuildProject(project).parts.map(kind=>[kind,null])), wires:[], interval:500};
}
export function partTerminals(kind,part){
  if(!part)return[];
  return (kind==='button'?['a','b','c','d']:kind==='potentiometer'?['a','w','b']:['a','b']).map(key=>part[key]);
}
const projectOf=state=>getBuildProject(state?.project);

export function parseEndpoint(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  let match = /^bb:([a-j])([1-9]|[12]\d|30)$/i.exec(value);
  if (match) {
    const column=match[1].toLowerCase(), row=Number(match[2]), id=`bb:${column}${row}`;
    return {id,kind:'hole',column,row,net:`strip:${column<'f'?'L':'R'}:${row}`,label:`${column.toUpperCase()}${row}`};
  }
  match = /^rail:([LR])([+-]):([1-9]|1\d|2[0-5])$/i.exec(value);
  if (match) {
    const side=match[1].toUpperCase(), polarity=match[2], index=Number(match[3]);
    return {id:`rail:${side}${polarity}:${index}`,kind:'rail',side,polarity,index,
      net:`rail:${side}${polarity}`,label:`${side==='L'?'Left':'Right'} ${polarity} rail · ${index}`};
  }
  match = /^pin:(.+)$/i.exec(value);
  if (match) {
    let pin=match[1].toUpperCase().replace(/^GPIO(?=\d)/,'');
    pin=aliases[pin]||pin;
    const id=`pin:${pin}`;
    if (!pinSet.has(id)) return null;
    return {id,kind:'pin',pin,net:pin==='GND2'?'pin:GND':id,
      label:pin==='GND2'?'GND (left)':pin==='GND'?'GND (right)':/^\d+$/.test(pin)?`GPIO${pin}`:pin};
  }
  return null;
}

export const canonicalEndpoint = id => parseEndpoint(id)?.id ?? null;
export const netOf = id => parseEndpoint(id)?.net ?? null;
export const endpointLabel = id => parseEndpoint(id)?.label ?? 'Unknown contact';
const endpoints = [
  ...BOARD_PINS,
  ...Array.from(COLUMNS, column=>Array.from({length:ROW_COUNT},(_,i)=>`bb:${column}${i+1}`)).flat(),
  ...['L+','L-','R+','R-'].flatMap(rail=>Array.from({length:25},(_,i)=>`rail:${rail}:${i+1}`)),
];
export const allEndpoints = () => [...endpoints];

// Orientation 0 points toward higher row numbers; 90 toward higher columns.
// LED a is its anode (long lead); b is its cathode (short lead).
export function placement(kind, anchor, orientation=0, flipped=false) {
  const first=parseEndpoint(anchor);
  if (!['led','resistor','button','potentiometer'].includes(kind) || first?.kind!=='hole' || ![0,90,180,270].includes(orientation)) return null;
  const point=(dr,dc)=>{
    for(let angle=0;angle<orientation;angle+=90)[dr,dc]=[-dc,dr];
    const col=COLUMNS.indexOf(first.column)+dc,row=first.row+dr;
    return col<0||col>9||row<1||row>ROW_COUNT?null:`bb:${COLUMNS[col]}${row}`;
  };
  if(kind==='button'){
    const part={a:point(0,0),b:point(2,0),c:point(0,2),d:point(2,2)};
    return Object.values(part).every(Boolean)?part:null;
  }
  if(kind==='potentiometer'){
    const part={a:point(0,0),w:point(1,0),b:point(2,0)};
    return Object.values(part).every(Boolean)?part:null;
  }
  let a=first.id, b=point(kind==='led'?1:3,0);
  if(!b)return null;
  if (kind==='led' && flipped) [a,b]=[b,a];
  return kind==='resistor'?{a,b,ohms:330}:{a,b};
}

function cleanPart(kind, value) {
  if (!isObject(value)) return null;
  if(kind==='button'||kind==='potentiometer'){
    const keys=kind==='button'?['a','b','c','d']:['a','w','b'];
    const points=keys.map(key=>parseEndpoint(value[key]));
    if(points.some(p=>p?.kind!=='hole'))return null;
    const vector=(p,q)=>[q.row-p.row,COLUMNS.indexOf(q.column)-COLUMNS.indexOf(p.column)];
    const eq=(a,b)=>a[0]===b[0]&&a[1]===b[1];
    if(kind==='potentiometer'){
      const d=vector(points[0],points[1]);
      if(Math.abs(d[0])+Math.abs(d[1])!==1||!eq(d,vector(points[1],points[2])))return null;
    }else{
      const u=vector(points[0],points[1]),v=vector(points[0],points[2]);
      if(Math.abs(u[0])+Math.abs(u[1])!==2||Math.abs(v[0])+Math.abs(v[1])!==2||u[0]*v[0]+u[1]*v[1]!==0||
        (u[0]&&u[1])||(v[0]&&v[1])||!eq(vector(points[0],points[3]),[u[0]+v[0],u[1]+v[1]]))return null;
    }
    return Object.fromEntries(keys.map((key,i)=>[key,points[i].id]));
  }
  const a=parseEndpoint(value.a), b=parseEndpoint(value.b), span=kind==='led'?1:3;
  if (a?.kind!=='hole' || b?.kind!=='hole') return null;
  const dr=Math.abs(a.row-b.row), dc=Math.abs(COLUMNS.indexOf(a.column)-COLUMNS.indexOf(b.column));
  if (!((dr===span && dc===0) || (dr===0 && dc===span))) return null;
  if (kind==='resistor') {
    const ohms=value.ohms??330;
    if (!RESISTANCES.includes(ohms)) return null;
    return {a:a.id,b:b.id,ohms};
  }
  return {a:a.id,b:b.id};
}

function occupiedEndpoints(state, omitPart=null) {
  const occupied=new Map();
  for (const kind of projectOf(state).parts) {
    if (kind===omitPart) continue;
    const part=state.parts?.[kind];
    if (!part) continue;
    for (const terminal of partTerminals(kind,part)) {
      const id=canonicalEndpoint(terminal);
      if (id) occupied.set(id,`the ${projectOf(state).labels[kind].toLowerCase()}`);
    }
  }
  for (const wire of state.wires||[]) for (const key of ['from','to']) {
    const id=canonicalEndpoint(wire?.[key]);
    if (id) occupied.set(id,'a wire');
  }
  return occupied;
}

export function placementIssue(state, kind, candidate) {
  if (!projectOf(state).parts.includes(kind) || !cleanPart(kind,candidate))
    return diagnostic('invalid_placement','Choose a position on the breadboard',
      kind==='led'?'The LED needs two adjacent holes in one row or column.':kind==='button'?'The button needs four holes at the corners of its two-by-two-spacing footprint.':kind==='potentiometer'?'The potentiometer needs three consecutive holes.':'The resistor leads must be three hole spacings apart in one row or column.');
  const part=cleanPart(kind,candidate), occupied=occupiedEndpoints(state,kind);
  for (const id of partTerminals(kind,part)) if (occupied.has(id))
    return diagnostic('occupied_contact','That contact is occupied',
      `${endpointLabel(id)} already holds ${occupied.get(id)}. Use a free hole.`,[id]);
  return null;
}

export function wireIssue(state, from, to) {
  const a=canonicalEndpoint(from), b=canonicalEndpoint(to);
  if (!a || !b) return diagnostic('invalid_endpoint','Choose two contacts','Select board pins, breadboard holes or rail contacts.');
  if (a===b) return diagnostic('same_endpoint','Choose a different contact','A wire needs two different endpoints.',[a]);
  if ((state.wires?.length||0)>=MAX_WIRES)
    return diagnostic('wire_limit','Remove an unused wire','This build workspace supports up to 60 wires.');
  if ((state.wires||[]).some(w=>(canonicalEndpoint(w.from)===a&&canonicalEndpoint(w.to)===b)||(canonicalEndpoint(w.from)===b&&canonicalEndpoint(w.to)===a)))
    return diagnostic('duplicate_wire','That wire is already connected','Choose another pair of contacts.',[a,b]);
  const occupied=occupiedEndpoints(state);
  for (const id of [a,b]) if (occupied.has(id))
    return diagnostic('occupied_contact','That contact is occupied',
      `${endpointLabel(id)} already holds ${occupied.get(id)}. Use a free hole in the same connected strip.`,[id]);
  return null;
}

// A clicked component lead may already occupy its hole. Offer another physical
// contact on that exact conducting net; never cross a passive component or the
// normally open side of a button. The stored circuit still has one lead per hole.
function wireResolutionContext(state) {
  const links=new Map();
  const link=(from,to)=>{
    from=canonicalEndpoint(from);to=canonicalEndpoint(to);
    const a=netOf(from),b=netOf(to);
    if(!links.has(a))links.set(a,[]);if(!links.has(b))links.set(b,[]);
    links.get(a).push({net:b,anchor:to});links.get(b).push({net:a,anchor:from});
  };
  for(const wire of state.wires)link(wire.from,wire.to);
  const button=state.parts.button;
  if(button){link(button.a,button.b);link(button.c,button.d);}
  return {occupied:occupiedEndpoints(state),uf:buildNets(state),links};
}

function resolveInContext(context,requested,exclude=[]) {
  const blocked=new Set((Array.isArray(exclude)?exclude:[]).map(canonicalEndpoint).filter(Boolean));
  const available=id=>!context.occupied.has(id)&&!blocked.has(id);
  if(available(requested))return {ok:true,requested,endpoint:requested,redirected:false};
  const origin=parseEndpoint(requested),target=context.uf.find(requested);
  // The two GND headers are joined inside the board. Keep a requested ground
  // connection visibly on the board when its other physical header is free.
  if(origin.kind==='pin'&&(origin.pin==='GND'||origin.pin==='GND2')){
    const other=origin.pin==='GND'?'pin:GND2':'pin:GND';
    if(available(other))return {ok:true,requested,endpoint:other,redirected:true};
  }
  const routes=new Map([[origin.net,{hops:0,anchors:[requested]}]]),queue=[origin.net];
  for(let i=0;i<queue.length;i++){
    const current=routes.get(queue[i]);
    for(const edge of context.links.get(queue[i])||[]){
      const known=routes.get(edge.net),hops=current.hops+1;
      if(!known){routes.set(edge.net,{hops,anchors:[edge.anchor]});queue.push(edge.net);}
      else if(known.hops===hops)known.anchors.push(edge.anchor);
    }
  }
  const distance=(a,b)=>a.kind==='hole'&&b.kind==='hole'?Math.abs(COLUMNS.indexOf(a.column)-COLUMNS.indexOf(b.column)):
    a.kind==='rail'&&b.kind==='rail'?Math.abs(a.index-b.index):0;
  const candidates=endpoints.filter(id=>available(id)&&context.uf.find(id)===target).map(id=>{
    const point=parseEndpoint(id),route=routes.get(point.net);
    // First use the clicked strip/rail, then a nearby hole reached by a jumper
    // or a permanent button pair. Other board pins are the final alternative.
    const tier=point.kind==='pin'?2:point.net===origin.net?0:1;
    return {id,rank:[tier,route?.hops??Infinity,route?Math.min(...route.anchors.map(anchor=>distance(point,parseEndpoint(anchor)))):Infinity]};
  });
  candidates.sort((a,b)=>a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||a.rank[2]-b.rank[2]);
  if(!candidates.length)return diagnostic('no_free_contact','No free contact on this connection',
    `Every contact electrically joined to ${endpointLabel(requested)} is occupied or reserved. Free a contact or choose another connection.`,[requested]);
  return {ok:true,requested,endpoint:candidates[0].id,redirected:true};
}

export function resolveWireEndpoint(state,id,{exclude=[]}={}) {
  const requested=canonicalEndpoint(id);
  if(!requested)return diagnostic('invalid_endpoint','Choose a contact','Select a board pin, breadboard hole or rail contact.');
  const bad=validInput(state);if(bad)return bad;
  return resolveInContext(wireResolutionContext(state),requested,exclude);
}

export function resolveWireConnection(state,requestedFrom,requestedTo) {
  const a=canonicalEndpoint(requestedFrom),b=canonicalEndpoint(requestedTo);
  if(!a||!b)return diagnostic('invalid_endpoint','Choose two contacts','Select board pins, breadboard holes or rail contacts.');
  const bad=validInput(state);if(bad)return bad;
  const context=wireResolutionContext(state);
  if(context.uf.find(a)===context.uf.find(b))return {alreadyConnected:true,targets:[...new Set([a,b])]};
  const first=resolveInContext(context,a);if(!first.ok)return first;
  const second=resolveInContext(context,b,[first.endpoint]);if(!second.ok)return second;
  const issue=wireIssue(state,first.endpoint,second.endpoint);if(issue)return issue;
  return {ok:true,from:first.endpoint,to:second.endpoint,
    redirected:[first,second].filter(result=>result.redirected).map(({requested,endpoint})=>({requested,endpoint}))};
}

// Preview an endpoint edit with the old wire lifted out of the circuit. Its
// opposite end stays in the exact same hole; callers retain the wire ID/color.
export function resolveWireMove(state,wireId,end,target) {
  if(!['from','to'].includes(end))return diagnostic('invalid_wire_end','Choose a wire end','Move the start or end of an existing wire.');
  const requested=canonicalEndpoint(target);
  if(!requested)return diagnostic('invalid_endpoint','Choose a contact','Select a board pin, breadboard hole or rail contact.');
  const bad=validInput(state);if(bad)return bad;
  const wire=state.wires.find(w=>w.id===wireId);
  if(!wire)return diagnostic('wire_not_found','Select an existing wire','That wire is no longer in this build.');
  const original={from:canonicalEndpoint(wire.from),to:canonicalEndpoint(wire.to)};
  if(requested===original[end])return {ok:true,...original,redirected:[],unchanged:true};
  const lifted={...state,wires:state.wires.filter(w=>w.id!==wireId)},fixed=original[end==='from'?'to':'from'];
  const context=wireResolutionContext(lifted);
  if(context.uf.find(requested)===context.uf.find(fixed))return diagnostic('already_connected','These contacts are already connected',
    'Choose a contact on a different connection. This move would add a wire across an existing connection.',[fixed,requested]);
  const resolved=resolveInContext(context,requested,[fixed]);if(!resolved.ok)return resolved;
  const actual={...original,[end]:resolved.endpoint},issue=wireIssue(lifted,actual.from,actual.to);if(issue)return issue;
  return {ok:true,...actual,redirected:resolved.redirected?[{requested,endpoint:resolved.endpoint}]:[],
    unchanged:actual.from===original.from&&actual.to===original.to};
}

export function electricallyConnected(state,a,b) {
  a=canonicalEndpoint(a);b=canonicalEndpoint(b);
  if(!a||!b||validInput(state))return false;
  const uf=buildNets(state);return uf.find(a)===uf.find(b);
}

// Restoring storage never trusts arbitrary object keys, HTML, colors or IDs.
// Invalid parts/wires are discarded; validation below never silently repairs its input.
export function normalizeState(raw) {
  const state=initialState(raw?.project);
  if (!isObject(raw) || raw.version!==1) return state;
  if (typeof raw.interval==='number' && Number.isFinite(raw.interval))
    state.interval=Math.max(100,Math.min(1500,100+Math.round((raw.interval-100)/50)*50));
  for (const kind of projectOf(state).parts) {
    const part=cleanPart(kind,raw.parts?.[kind]);
    if (part && !placementIssue(state,kind,part)) state.parts[kind]=part;
  }
  const usedIds=new Set();
  for (const [index,wire] of (Array.isArray(raw.wires)?raw.wires.slice(0,MAX_WIRES):[]).entries()) {
    if (!isObject(wire) || wireIssue(state,wire.from,wire.to)) continue;
    let id=typeof wire.id==='string'&&/^[\w-]{1,40}$/.test(wire.id)?wire.id:`wire-${index+1}`;
    let suffix=0;
    while (usedIds.has(id)) id=`wire-${index+1}-${++suffix}`;
    usedIds.add(id);
    const color=typeof wire.color==='string'&&/^#[\da-f]{6}$/i.test(wire.color)?wire.color.toLowerCase():WIRE_COLORS[0];
    state.wires.push({id,from:canonicalEndpoint(wire.from),to:canonicalEndpoint(wire.to),color});
  }
  return state;
}

class UnionFind {
  constructor(){this.parents=new Map();}
  find(value){if(!this.parents.has(value))this.parents.set(value,value);let root=value;
    while(this.parents.get(root)!==root)root=this.parents.get(root);
    while(value!==root){const next=this.parents.get(value);this.parents.set(value,root);value=next;}return root;}
  join(a,b){a=this.find(a);b=this.find(b);if(a!==b)this.parents.set(a,b);}
}

function partTargets(part) {return part?[part.a,part.b]:[];}
function validInput(raw) {
  if (!isObject(raw)||raw.version!==1||!isObject(raw.parts)||!Array.isArray(raw.wires)||raw.wires.length>MAX_WIRES)
    return diagnostic('invalid_state','Reset this build','The saved build is not in a supported format.');
  if (!Number.isFinite(raw.interval)||raw.interval<100||raw.interval>1500||(raw.interval-100)%50!==0)
    return diagnostic('invalid_interval','Choose a blink interval','Use 100–1500 ms, in steps of 50 ms.');
  if(raw.project!==undefined&&!BUILD_PROJECTS.some(p=>p.id===raw.project))return diagnostic('invalid_project','Choose a build project','This project is not supported.');
  const probe=initialState(raw.project);
  for(const kind of Object.keys(raw.parts))if(!projectOf(raw).parts.includes(kind)&&raw.parts[kind]!==null)
    return diagnostic('unexpected_part','Remove the extra component','This component is not part of the selected build.');
  for (const kind of projectOf(raw).parts) {
    if (raw.parts[kind]===null) continue;
    const error=placementIssue(probe,kind,raw.parts[kind]);
    if (error) return error;
    probe.parts[kind]=cleanPart(kind,raw.parts[kind]);
  }
  const ids=new Set();
  for (const wire of raw.wires) {
    if (!isObject(wire)) return diagnostic('invalid_wire','Remove the invalid wire','A wire must have two valid contacts.');
    const error=wireIssue(probe,wire.from,wire.to);
    if (error) return error;
    if (typeof wire.id!=='string'||!/^[\w-]{1,40}$/.test(wire.id)||ids.has(wire.id))
      return diagnostic('invalid_wire_id','Reset this build','The build contains invalid or repeated wire identifiers.');
    ids.add(wire.id);probe.wires.push(wire);
  }
  return null;
}

export function validateCircuit(raw) {
  const bad=validInput(raw);if(bad)return bad;
  const {parts,wires}=raw, project=projectOf(raw), uf=buildNets(raw);
  const root=id=>uf.find(canonicalEndpoint(id)), ground=root('pin:GND'), source=root('pin:23');
  const supply=root('pin:3V3'), vin=root('pin:VIN');
  if (source===ground) return diagnostic('short_gpio','GPIO23 is shorted to GND',
    'Remove the direct connection. The current path must pass through the resistor and LED.', ['pin:23','pin:GND']);
  if (supply===ground||vin===ground) return diagnostic('short_power','A supply is shorted to GND',
    'Remove this connection before running the build.',[supply===ground?'pin:3V3':'pin:VIN','pin:GND']);
  if (source===supply||source===vin||supply===vin) return diagnostic('short_supplies','Keep the power outputs separate',
    'Do not connect GPIO23, 3V3 and VIN directly to one another. GPIO23 drives this LED.',
    source===supply?['pin:23','pin:3V3']:source===vin?['pin:23','pin:VIN']:['pin:3V3','pin:VIN']);
  const vinInput=BOARD_PINS.find(id=>(/^pin:\d+$/.test(id)||id==='pin:EN')&&root(id)===vin);
  if (vinInput) return diagnostic('gpio_overvoltage','Keep VIN off the GPIO pins',
    'VIN can carry 5 V from USB. ESP32 GPIO and EN use 3.3 V logic and are not 5 V tolerant.', ['pin:VIN',vinInput]);
  if (root('pin:EN')===ground) return diagnostic('held_in_reset','EN is holding the board in reset',
    'Disconnect EN from GND so the sketch can run.', ['pin:EN','pin:GND']);
  if (root('pin:12')===supply) return diagnostic('boot_strap','Keep GPIO12 off 3V3 at startup',
    'On this original ESP32-WROOM board, GPIO12 HIGH at reset selects the wrong flash supply voltage and can prevent boot. Remove this connection.', ['pin:12','pin:3V3']);
  if (project.parts.some(kind=>!parts[kind])) {
    const missing=project.parts.filter(kind=>!parts[kind]);
    return diagnostic('missing_parts','Place the components',
      `Add ${missing.map(kind=>project.labels[kind]).join(' and ')} to the breadboard.`,[],{missing});
  }
  const led=cleanPart('led',parts.led), resistor=cleanPart('resistor',parts.resistor);
  const la=root(led.a), lk=root(led.b), ra=root(resistor.a), rb=root(resistor.b);
  if (la===lk) return diagnostic('led_shorted','The LED leads share one connection',
    'The five holes in each row are connected on their side of the center gap. Put the LED leads in separate strips.',partTargets(led));
  if (ra===rb) return diagnostic('resistor_bypassed','The resistor is bypassed',
    'Both resistor leads are connected by the breadboard or a wire. Give its leads separate connections so current must pass through it.',partTargets(resistor));
  const series=(start,end,a=la,k=lk)=>(start===ra&&rb===a&&k===end)||(start===rb&&ra===a&&k===end)||
    (start===a&&k===ra&&rb===end)||(start===a&&k===rb&&ra===end);
  for (const drive of [source,supply,vin]) {
    if ((la===drive&&lk===ground)||(lk===drive&&la===ground))
      return diagnostic('missing_current_limit','The LED has a path around the resistor',
        'Remove the bypass. Every path from the driving pin through the LED to GND must include the resistor.',[...partTargets(led),...partTargets(resistor)]);
  }
  const activeNodes=new Set([la,lk,ra,rb]);
  if (activeNodes.has(root('pin:EN')) && wires.some(w=>[w.from,w.to].some(e=>canonicalEndpoint(e)==='pin:EN')))
    return diagnostic('reset_pin','Use GPIO23, not EN','EN is the reset input. Disconnect it from the LED circuit.',['pin:EN','pin:23']);
  if (series(source,ground)) {
    if (activeNodes.has(supply)||activeNodes.has(vin)) return diagnostic('extra_supply','Disconnect the extra supply',
      'This build is driven by GPIO23. A 3V3 or VIN connection can feed the LED while GPIO23 is LOW.',[activeNodes.has(supply)?'pin:3V3':'pin:VIN']);
    const allowed=['pin:23',...(project.id==='button'?['pin:18']:project.id==='potentiometer'?['pin:34']:[])];
    const extraPin=BOARD_PINS.find(id=>/^pin:\d+$/.test(id)&&!allowed.includes(id)&&activeNodes.has(root(id)));
    if (extraPin) return diagnostic('extra_gpio','Use GPIO23 for this build',
      `Disconnect ${endpointLabel(extraPin)} from the LED circuit. This task drives GPIO23 only; other GPIO states are not modeled.`,[extraPin,'pin:23']);
    const input=validateInputProject(raw,root,{ground,source,supply,vin,activeNodes});if(!input.ok)return input;
    return {...input,ok:true,code:'complete',title:project.id==='blink'?'Ready to blink':'Ready to try',
      message:project.id==='blink'?'GPIO23, the resistor, the LED and GND form a complete series circuit.':project.id==='button'?'The button switches GPIO18 to GND. Press it to light the LED.':'The wiper feeds GPIO34. Turn the dial to change LED brightness.',
      targets:['pin:23',resistor.a,resistor.b,led.a,led.b,'pin:GND'],
      interval:raw.interval,period:raw.interval*2,resistance:resistor.ohms};
  }
  if (series(source,ground,lk,la)) return diagnostic('reversed_led','Turn the LED around',
    'The long lead (+) must face GPIO23 through the circuit. The short lead (−) must face GND. Flip the LED.',partTargets(led));
  if (series(supply,ground)||series(supply,ground,lk,la)||series(vin,ground)||series(vin,ground,lk,la))
    return diagnostic('constant_power','Use the switching pin',
      '3V3 is steady power. The sketch controls the LED through GPIO23, so connect the LED circuit to GPIO23 instead of 3V3 or VIN.', ['pin:23',series(supply,ground)||series(supply,ground,lk,la)?'pin:3V3':'pin:VIN']);
  if (!activeNodes.has(source)) {
    const other=BOARD_PINS.find(id=>!['pin:23','pin:GND','pin:GND2','pin:3V3','pin:VIN','pin:EN'].includes(id)&&activeNodes.has(root(id)));
    if(other)return diagnostic('wrong_gpio','The sketch uses GPIO23',
      `${endpointLabel(other)} is connected to the circuit, but this sketch switches GPIO23. Move that connection.`,[other,'pin:23']);
    return diagnostic('missing_gpio','Connect GPIO23 to the circuit',
      'Use a wire from GPIO23 to a free hole in the strip shared by a component lead.',['pin:23',...partTargets(resistor)]);
  }
  if (!activeNodes.has(ground)) return diagnostic('missing_ground','Complete the return path',
    'Connect the circuit to GND through a free hole in the same strip as its final component lead.',['pin:GND',...partTargets(led)]);
  return diagnostic('open_path','There is a gap in the circuit',
    'Trace GPIO23 → resistor → LED → GND (the resistor may also go after the LED). The two sides of the breadboard gap are separate.',
    [...partTargets(resistor),...partTargets(led)]);
}

function buildNets(state){
  const uf=new UnionFind();for(const id of endpoints)uf.join(id,netOf(id));
  for(const wire of state.wires)uf.join(canonicalEndpoint(wire.from),canonicalEndpoint(wire.to));
  const button=state.parts.button;
  if(button){uf.join(canonicalEndpoint(button.a),canonicalEndpoint(button.b));uf.join(canonicalEndpoint(button.c),canonicalEndpoint(button.d));}
  return uf;
}

function validateInputProject(state,root,{ground,source,supply,vin,activeNodes}){
  const project=projectOf(state);if(project.id==='blink')return{ok:true};
  const inputPin=project.id==='button'?'pin:18':'pin:34',input=root(inputPin);
  if(input!==ground&&activeNodes.has(input))return diagnostic('input_output_join','Separate the input and LED output',
    `${endpointLabel(inputPin)} senses the input; GPIO23 drives the LED. These must be separate signal connections.`,[inputPin,'pin:23']);
  let inputNodes;
  if(project.id==='button'){
    const b=state.parts.button,a=root(b.a),c=root(b.c);inputNodes=new Set([a,c]);
    if(a===c)return diagnostic('button_shorted','The button is already bridged',
      'A1 and A2 are permanently connected; B1 and B2 are permanently connected. Keep the two sides separate until the button is pressed.',partTerminals('button',b));
    if([source,supply,vin].some(n=>inputNodes.has(n)))return diagnostic('button_power','Switch the input to GND',
      'Connect the button between GPIO18 and GND, not an output or power supply. INPUT_PULLUP provides the released HIGH level.',[inputPin,...partTerminals('button',b)]);
    if(input===ground)return diagnostic('input_grounded','GPIO18 is always LOW',
      'Remove the direct GPIO18-to-GND path. Only pressing the button should complete it.',[inputPin,'pin:GND']);
    if(!((a===input&&c===ground)||(c===input&&a===ground)))return diagnostic('button_input','Connect opposite switch sides',
      'Connect one permanently joined pair to GPIO18 and the other pair to GND. Either pair may be the input side.',[inputPin,'pin:GND',...partTerminals('button',b)]);
  }else{
    const p=state.parts.potentiometer,a=root(p.a),w=root(p.w),b=root(p.b);inputNodes=new Set([a,w,b]);
    if(a===b||a===w||w===b)return diagnostic('pot_shorted','Give each potentiometer terminal its own connection',
      'The outer terminals and wiper need three separate breadboard strips. Rotate or move the part if its legs share one row.',partTerminals('potentiometer',p));
    if(a===vin||b===vin||w===vin)return diagnostic('pot_voltage','Use 3V3 for this input',
      'Power the outer terminals from 3V3 and GND. VIN can exceed the 3.3 V input limit.', ['pin:VIN',...partTerminals('potentiometer',p)]);
    if(w===supply||w===ground||input===supply||input===ground)return diagnostic('wiper_shorted','Let the wiper provide a variable signal',
      'Do not tie the middle terminal or GPIO34 directly to 3V3 or GND. Connect the middle terminal to GPIO34.',[p.w,inputPin]);
    if(!((a===supply&&b===ground)||(a===ground&&b===supply)))return diagnostic('pot_power','Power the two outer terminals',
      'Connect one outer terminal to 3V3 and the other to GND. Swapping them reverses the dial direction.',[p.a,p.b,'pin:3V3','pin:GND']);
    if(w!==input)return diagnostic('wiper_input','Connect the middle terminal to GPIO34',
      'The wiper (W) supplies the changing voltage. GPIO34 reads that voltage.',[p.w,inputPin]);
  }
  const extra=BOARD_PINS.find(id=>/^pin:\d+$/.test(id)&&id!==inputPin&&inputNodes.has(root(id)));
  if(extra)return diagnostic('extra_input_gpio','Use the project’s input pin',
    `Disconnect ${endpointLabel(extra)} from the input circuit. This task reads ${endpointLabel(inputPin)}.`,[extra,inputPin]);
  if(inputNodes.has(root('pin:EN')))return diagnostic('reset_pin','Keep EN separate','EN resets the board and is not a component input.', ['pin:EN']);
  return {ok:true,...(project.id==='potentiometer'?{potReversed:root(state.parts.potentiometer.a)===supply}:{})};
}

export function simulationState(state,{elapsedMs=0,pressed=false,value=50}={}){
  const check=validateCircuit(state),project=projectOf(state);
  value=Number.isFinite(value)?Math.max(0,Math.min(100,value)):50;
  const result={valid:check.ok,ledBrightness:0,inputLevel:null,adc:null,duty:null,pressed:!!pressed,value,status:check.ok?'Ready':check.message};
  if(!check.ok)return result;
  if(project.id==='button')return {...result,ledBrightness:pressed?1:0,inputLevel:pressed?'LOW':'HIGH',status:pressed?'Pressed · GPIO18 LOW':'Released · GPIO18 HIGH'};
  if(project.id==='potentiometer'){
    const fraction=check.potReversed?1-value/100:value/100,adc=Math.round(fraction*4095),duty=Math.floor(adc*255/4095);
    return {...result,adc,duty,ledBrightness:duty/255,status:`ADC ${adc} / 4095 · PWM ${duty} / 255`};
  }
  const on=Number.isFinite(elapsedMs)&&elapsedMs>=0&&Math.floor(elapsedMs/state.interval)%2===0;
  return {...result,ledBrightness:on?1:0,status:on?'GPIO23 HIGH · LED on':'GPIO23 LOW · LED off'};
}
export function ledIsOn(state,elapsedMs){return simulationState(state,{elapsedMs}).ledBrightness>0;}

// Find an additive solution from actual nets, not a single memorized layout.
// This never moves a component or deletes a user's wire. null means an existing
// fault/placement must be corrected before a connection hint is possible.
export function connectionPlan(state){
  if(validInput(state)||projectOf(state).parts.some(kind=>!state.parts[kind]))return null;
  if(validateCircuit(state).ok)return[];
  const {led:l,resistor:r,button:b,potentiometer:p}=state.parts;
  const indicatorPlans=[
    [['pin:23',r.a],[r.b,l.a],[l.b,'pin:GND']],
    [['pin:23',r.b],[r.a,l.a],[l.b,'pin:GND']],
    [['pin:23',l.a],[l.b,r.a],[r.b,'pin:GND']],
    [['pin:23',l.a],[l.b,r.b],[r.a,'pin:GND']],
  ];
  const inputPlans=projectOf(state).id==='button'?[[['pin:18',b.a],[b.c,'pin:GND']],[['pin:18',b.c],[b.a,'pin:GND']]]:
    projectOf(state).id==='potentiometer'?[[['pin:GND',p.a],['pin:34',p.w],['pin:3V3',p.b]],[['pin:3V3',p.a],['pin:34',p.w],['pin:GND',p.b]]]:[[]];
  let best=null;
  for(const indicator of indicatorPlans)for(const input of inputPlans){
    const trial=structuredClone(state),uf=buildNets(trial),planned=[];let failed=false;
    for(const [a,b] of [...indicator,...input]){
      const ar=uf.find(canonicalEndpoint(a)),br=uf.find(canonicalEndpoint(b));if(ar===br)continue;
      const occupied=occupiedEndpoints(trial);
      const choose=net=>endpoints.find(id=>!occupied.has(id)&&uf.find(id)===net);
      const from=choose(ar),to=choose(br);
      if(!from||!to||wireIssue(trial,from,to)){failed=true;break;}
      let id=`hint-${planned.length}`;while(trial.wires.some(w=>w.id===id))id+='x';
      trial.wires.push({id,from,to,color:WIRE_COLORS[0]});planned.push({from,to});uf.join(from,to);
    }
    if(!failed&&validateCircuit(trial).ok&&(!best||planned.length<best.length))best=planned;
  }
  return best;
}

// A bounded repair for an LED driven directly from GPIO23: move one source-wire
// end onto the resistor, then add the missing connections. Every proposed final
// circuit is checked; unsupported faults receive no guessed or automatic edit.
export function repairPlan(state){
  if(validateCircuit(state).code!=='missing_current_limit')return null;
  const {led,resistor}=state.parts,uf=buildNets(state),root=id=>uf.find(canonicalEndpoint(id));
  if(root(led.a)!==root('pin:23')||root(led.b)!==root('pin:GND'))return null;
  let best=null;
  for(const wire of state.wires)for(const end of ['to','from']){
    const old=canonicalEndpoint(wire[end]),fixed=canonicalEndpoint(wire[end==='from'?'to':'from']);
    if(parseEndpoint(old).kind==='pin')continue;
    const lifted={...state,wires:state.wires.filter(w=>w.id!==wire.id)},nets=buildNets(lifted),net=id=>nets.find(canonicalEndpoint(id));
    if(net(fixed)!==net('pin:23')||net(old)!==net(led.a)||net(led.a)===net('pin:23'))continue;
    for(const target of [resistor.a,resistor.b]){
      const move=resolveWireMove(state,wire.id,end,target);if(!move.ok||move.unchanged)continue;
      const trial=structuredClone(state),edited=trial.wires.find(w=>w.id===wire.id);
      edited.from=move.from;edited.to=move.to;
      const connections=connectionPlan(trial);if(!connections)continue;
      const actual=move[end],operations=[{kind:'moveWire',wireId:wire.id,end,target:actual,from:move.from,to:move.to,
        title:`Move the wire end from ${endpointLabel(old)} to ${endpointLabel(actual)}`,
        why:`Keep ${endpointLabel(fixed)} connected. ${endpointLabel(actual)} connects it to the resistor lead at ${endpointLabel(target)}.`,
        targets:[...new Set([old,actual,fixed,canonicalEndpoint(target)])]}];
      for(const connection of connections){
        const current=buildNets(trial),isAnode=id=>current.find(id)===current.find(canonicalEndpoint(led.a));
        operations.push({kind:'connect',...connection,
          title:`Connect ${endpointLabel(connection.from)} to ${endpointLabel(connection.to)}`,
          why:isAnode(connection.from)||isAnode(connection.to)?'Join the resistor to the LED’s long (+) lead so LED current passes through the resistor.':'Complete this connection in the project circuit.',
          targets:[connection.from,connection.to]});
        let id='repair-wire';while(trial.wires.some(w=>w.id===id))id+='x';
        trial.wires.push({id,...connection,color:WIRE_COLORS[0]});
      }
      if(validateCircuit(trial).ok&&(!best||operations.length<best.operations.length))best={
        title:'Put the resistor in the LED path',
        why:'GPIO23 currently reaches the LED directly. Route it through the resistor first to limit LED current.',operations};
    }
  }
  return best;
}
