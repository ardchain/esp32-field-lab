// Electrical rules for the guided Blink build. This is a connectivity checker,
// not a general circuit solver: only the supplied LED and resistor are modeled.
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

export function initialState() {
  return {version:1, parts:{led:null, resistor:null}, wires:[], interval:500};
}

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
  const first=parseEndpoint(anchor), span=kind==='led'?1:kind==='resistor'?3:0;
  if (!span || first?.kind!=='hole' || ![0,90,180,270].includes(orientation)) return null;
  let column=COLUMNS.indexOf(first.column), row=first.row;
  if (orientation===0) row+=span;
  if (orientation===90) column+=span;
  if (orientation===180) row-=span;
  if (orientation===270) column-=span;
  if (column<0 || column>9 || row<1 || row>ROW_COUNT) return null;
  let a=first.id, b=`bb:${COLUMNS[column]}${row}`;
  if (kind==='led' && flipped) [a,b]=[b,a];
  return kind==='resistor'?{a,b,ohms:330}:{a,b};
}

function cleanPart(kind, value) {
  if (!isObject(value)) return null;
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
  for (const kind of ['led','resistor']) {
    if (kind===omitPart) continue;
    const part=state.parts?.[kind];
    if (!part) continue;
    for (const key of ['a','b']) {
      const id=canonicalEndpoint(part[key]);
      if (id) occupied.set(id,kind==='led'?'the LED':'the resistor');
    }
  }
  for (const wire of state.wires||[]) for (const key of ['from','to']) {
    const id=canonicalEndpoint(wire?.[key]);
    if (id) occupied.set(id,'a wire');
  }
  return occupied;
}

export function placementIssue(state, kind, candidate) {
  if (!['led','resistor'].includes(kind) || !cleanPart(kind,candidate))
    return diagnostic('invalid_placement','Choose a position on the breadboard',
      kind==='led'?'The LED needs two adjacent holes in one row or column.':'The resistor leads must be three hole spacings apart in one row or column.');
  const part=cleanPart(kind,candidate), occupied=occupiedEndpoints(state,kind);
  for (const id of [part.a,part.b]) if (occupied.has(id))
    return diagnostic('occupied_contact','That contact is occupied',
      `${endpointLabel(id)} already holds ${occupied.get(id)}. Use a free hole.`,[id]);
  return null;
}

export function wireIssue(state, from, to) {
  const a=canonicalEndpoint(from), b=canonicalEndpoint(to);
  if (!a || !b) return diagnostic('invalid_endpoint','Choose two contacts','Select board pins, breadboard holes or rail contacts.');
  if (a===b) return diagnostic('same_endpoint','Choose a different contact','A wire needs two different endpoints.',[a]);
  if ((state.wires?.length||0)>=MAX_WIRES)
    return diagnostic('wire_limit','Remove an unused wire','This Blink workspace supports up to 60 wires.');
  if ((state.wires||[]).some(w=>(canonicalEndpoint(w.from)===a&&canonicalEndpoint(w.to)===b)||(canonicalEndpoint(w.from)===b&&canonicalEndpoint(w.to)===a)))
    return diagnostic('duplicate_wire','That wire is already connected','Choose another pair of contacts.',[a,b]);
  const occupied=occupiedEndpoints(state);
  for (const id of [a,b]) if (occupied.has(id))
    return diagnostic('occupied_contact','That contact is occupied',
      `${endpointLabel(id)} already holds ${occupied.get(id)}. Use a free hole in the same connected strip.`,[id]);
  return null;
}

// Restoring storage never trusts arbitrary object keys, HTML, colors or IDs.
// Invalid parts/wires are discarded; validation below never silently repairs its input.
export function normalizeState(raw) {
  const state=initialState();
  if (!isObject(raw) || raw.version!==1) return state;
  if (typeof raw.interval==='number' && Number.isFinite(raw.interval))
    state.interval=Math.max(100,Math.min(1500,100+Math.round((raw.interval-100)/50)*50));
  for (const kind of ['led','resistor']) {
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
  const probe=initialState();
  for (const kind of ['led','resistor']) {
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
  const {parts,wires}=raw, uf=new UnionFind();
  for (const id of endpoints) uf.join(id,netOf(id));
  for (const wire of wires) uf.join(canonicalEndpoint(wire.from),canonicalEndpoint(wire.to));
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
    'Disconnect EN from GND so the Blink sketch can run.', ['pin:EN','pin:GND']);
  if (root('pin:12')===supply) return diagnostic('boot_strap','Keep GPIO12 off 3V3 at startup',
    'On this original ESP32-WROOM board, GPIO12 HIGH at reset selects the wrong flash supply voltage and can prevent boot. Remove this connection.', ['pin:12','pin:3V3']);
  if (!parts.led||!parts.resistor) {
    const missing=['led','resistor'].filter(kind=>!parts[kind]);
    return diagnostic('missing_parts','Place the components',
      missing.length===2?'Add the LED and the 330 Ω resistor to the breadboard.':`Add ${missing[0]==='led'?'the LED':'the 330 Ω resistor'} to the breadboard.`,[],{missing});
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
    const extraPin=BOARD_PINS.find(id=>/^pin:\d+$/.test(id)&&id!=='pin:23'&&activeNodes.has(root(id)));
    if (extraPin) return diagnostic('extra_gpio','Use GPIO23 for this build',
      `Disconnect ${endpointLabel(extraPin)} from the LED circuit. This Blink task drives GPIO23 only; other GPIO states are not modeled.`,[extraPin,'pin:23']);
    return {ok:true,code:'complete',title:'Ready to blink',
      message:'GPIO23, the resistor, the LED and GND form a complete series circuit.',
      targets:['pin:23',resistor.a,resistor.b,led.a,led.b,'pin:GND'],
      interval:raw.interval,period:raw.interval*2,resistance:resistor.ohms};
  }
  if (series(source,ground,lk,la)) return diagnostic('reversed_led','Turn the LED around',
    'The long lead (+) must face GPIO23 through the circuit. The short lead (−) must face GND. Flip the LED.',partTargets(led));
  if (series(supply,ground)||series(supply,ground,lk,la)||series(vin,ground)||series(vin,ground,lk,la))
    return diagnostic('constant_power','Use the switching pin',
      '3V3 is steady power; it cannot produce the Blink sketch’s pulses. Connect the input of this circuit to GPIO23, not 3V3 or VIN.', ['pin:23',series(supply,ground)||series(supply,ground,lk,la)?'pin:3V3':'pin:VIN']);
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

export function ledIsOn(state, elapsedMs) {
  return validateCircuit(state).ok && Number.isFinite(elapsedMs) && elapsedMs>=0 && Math.floor(elapsedMs/state.interval)%2===0;
}
