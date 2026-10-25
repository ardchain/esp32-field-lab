import { getBuildProject } from './build-projects.js';
import { allEndpoints, connectionPlan, electricallyConnected, endpointLabel, netOf, parseEndpoint, partTerminals, placement, placementIssue, resolveWireConnection, validateCircuit } from './build-circuit.js';

const name = endpointLabel;
const clone = value => structuredClone(value);
const same = (state, a, b) => electricallyConnected(state, a, b);

// Guidance follows the learner's layout. Coordinates below are suggestions for
// missing parts, never requirements for a correct circuit.
function suggestedPart(state, kind, preferred) {
  const valid = part => {
    if (!part || placementIssue(state, kind, part)) return false;
    const next = clone(state); next.parts[kind] = part;
    const ids = partTerminals(kind, part);
    if (kind === 'button') {
      if (same(next, part.a, part.c)) return false;
    } else if (ids.some((a, i) => ids.slice(i + 1).some(b => same(next, a, b)))) return false;
    // Placement only answers whether these leads fit separate connections.
    // An unrelated wiring fault must not trigger a search of the whole board
    // or be mislabeled as a lack of space. Connection steps handle that fault.
    return true;
  };
  if (valid(preferred)) return clone(preferred);
  for (const anchor of allEndpoints().filter(id => id.startsWith('bb:'))) {
    for (const angle of [0, 90, 180, 270]) {
      const part = placement(kind, anchor, angle);
      if (valid(part)) return part;
    }
  }
  return null;
}

function stripDescription(a, b) {
  const p = parseEndpoint(a), q = parseEndpoint(b);
  if (netOf(a) !== netOf(b)) return null;
  if (p?.kind === 'hole' && q?.kind === 'hole')
    return `${name(a)} and ${name(b)} share the hidden metal strip in row ${p.row} (${p.column < 'f' ? 'A–E' : 'F–J'}). No jumper is needed.`;
  if (p?.kind === 'rail') return 'Both contacts share this continuous power rail. No extra jumper is needed.';
  return 'These contacts are already joined inside the board. No extra jumper is needed.';
}

// Include intervening jumper contacts so a rail-based circuit is explained as
// its actual path, rather than an imaginary wire directly between its ends.
function connectionTargets(state, a, b) {
  const edges = new Map();
  const add = (from, to) => {
    const key = netOf(from);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ from, to, key: netOf(to) });
  };
  for (const wire of state.wires) { add(wire.from, wire.to); add(wire.to, wire.from); }
  const button = state.parts.button;
  if (button) for (const [from, to] of [[button.a, button.b], [button.c, button.d]]) { add(from, to); add(to, from); }
  const queue = [{ key: netOf(a), path: [a] }], seen = new Set();
  while (queue.length) {
    const entry = queue.shift();
    if (entry.key === netOf(b)) return [...new Set([...entry.path, b])];
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    for (const edge of edges.get(entry.key) || []) queue.push({ key: edge.key, path: [...entry.path, edge.from, edge.to] });
  }
  return [a, b];
}

function connectionStep(state, planned, id, title, from, to, why, code) {
  const complete = same(state, from, to);
  const resolved = !complete && planned ? resolveWireConnection(state, from, to) : null;
  const action = resolved?.ok ? { type: 'wire', from: resolved.from, to: resolved.to } : null;
  const sharedPin = (resolved?.redirected || []).filter(item => parseEndpoint(item.requested)?.kind === 'pin')
    .map(item => `${name(item.endpoint)} already connects to ${name(item.requested)}.`).join(' ');
  const targets = complete ? connectionTargets(state, from, to) : action ? [action.from, action.to, from, to] : [from, to];
  const sharedStrip = complete ? stripDescription(from, to) : null;
  return {
    id, type: 'connection', title, complete, action, targets, copper: targets,
    blocked: !complete && !action,
    instruction: complete ? sharedStrip || `${name(from)} is connected to ${name(to)}. Follow the highlighted contacts and jumper.`
      : action ? `Connect ${name(action.from)} → ${name(action.to)}.${sharedPin ? ' ' + sharedPin : ''} Click the two highlighted contacts, or use “Do this step”.`
      : 'Finish placing the parts, or fix the highlighted connection before adding this wire.',
    why, code,
  };
}

export function getWalkthrough(state) {
  const project = getBuildProject(state.project), future = clone(state);
  const steps = [
    { id: 'rows', type: 'concept', title: 'Five holes, one connection', complete: true, action: null,
      instruction: 'Follow the highlighted strip: A9, B9, C9, D9 and E9 are already connected inside the breadboard.',
      why: 'A leg in C9 and a wire in A9 touch the same metal strip. Use separate holes; one hole holds one lead.',
      targets: ['bb:a9', 'bb:e9'], frame: ['bb:a1', 'bb:j10'], copper: ['bb:a9'] },
    { id: 'gap', type: 'concept', title: 'The gap separates the two sides', complete: true, action: null,
      instruction: 'E9 and F9 face each other across the gap, but are not connected inside the breadboard. Row 10 is separate from row 9 too.',
      why: 'A component needs its leads on separate connections. Putting both LED leads in A9–E9 would join them together.',
      targets: ['bb:a9', 'bb:e9', 'bb:f9', 'bb:j9', 'bb:a10', 'bb:e10'], frame: ['bb:a1', 'bb:j11'], copper: ['bb:a9', 'bb:f9', 'bb:a10'] },
    { id: 'rails', type: 'concept', title: 'A colored line is a power rail', complete: true, action: null,
      instruction: 'Each long + or − strip is one connection on this breadboard. The four strips are separate from each other and from the numbered rows.',
      why: 'The printed + and − are labels, not power sources. A rail only becomes 3.3 V or ground after you wire it to 3V3 or GND. This build can connect directly to the ESP32.',
      targets: ['rail:L+:1', 'rail:L+:25', 'rail:L-:1', 'rail:L-:25'], copper: ['rail:L+', 'rail:L-'].map(id => id + ':1') },
  ];
  const descriptions = {
    resistor: { title: 'Place the current-limiting resistor', why: 'The 330 Ω resistor limits current through the LED and protects the GPIO output. Both leads must be on different connections; either direction works.' },
    led: { title: 'Place the LED with separate leads', why: 'A + is the anode (long leg); K − is the cathode (short leg, flat edge). Current must pass through the resistor and then the LED, or through the LED and then the resistor.' },
    button: { title: 'Place the four-leg switch', why: 'The two A contacts are always joined inside the switch; the two B contacts are another joined pair. Pressing joins A to B. Keep the two pairs separate on the breadboard.' },
    potentiometer: { title: 'Give the dial three separate connections', why: 'A and B are the ends of a resistive track. W is the middle leg, called the wiper. Turning the knob moves its contact along that track.' },
  };
  for (const kind of ['resistor', 'led', ...project.parts.filter(k => !['resistor', 'led'].includes(k))]) {
    const existing = state.parts[kind], part = existing || suggestedPart(future, kind, project.placements[kind]);
    if (part) future.parts[kind] = part;
    const targets = part ? partTerminals(kind, part) : [];
    const separate = !existing || (kind === 'button'
      ? [existing.a, existing.b].every(a => [existing.c, existing.d].every(b => netOf(a) !== netOf(b)))
      : new Set(targets.map(netOf)).size === targets.length);
    steps.push({ id: 'part-' + kind, type: 'part', kind, ...descriptions[kind],
      complete: !!existing && separate, action: existing || !part ? null : { type: 'place', kind, part }, targets, copper: targets,
      instruction: existing && !separate ? kind === 'button'
        ? 'The breadboard joins the A and B pairs even when the button is released. Select the switch, then rotate or move it so the two pairs occupy separate strips.'
        : `The breadboard joins ${kind === 'potentiometer' ? 'some of these three legs' : 'both leads'} together. Select the ${project.labels[kind]}, then use Rotate or drag it so ${kind === 'potentiometer' ? 'all three legs have separate strips' : 'its leads have separate strips'}.`
      : existing ? `${project.labels[kind]} is placed at ${targets.map(name).join(' / ')}. Follow its leads to their strips.`
        : part ? `Place the ${project.labels[kind]} at ${targets.map(name).join(' / ')}. Click its ghost, or use “Do this step”.`
        : 'There is no clear space for this part. Move an overlapping part or wire first.' });
  }
  if (Object.values(future.parts).some(p => !p)) return steps;
  const plan = connectionPlan(future), completed = clone(future);
  if (plan) for (const [i, wire] of plan.entries()) {
    let id = 'walkthrough-' + i;
    while (completed.wires.some(w => w.id === id)) id += 'x';
    completed.wires.push({ ...wire, id, color: '#d4ac58' });
  }
  const { resistor: r, led: l, button: b, potentiometer: p } = future.parts;
  const variants = [
    { before: true, input: r.a, output: r.b, edges: [['pin:23', r.a], [r.b, l.a], [l.b, 'pin:GND']] },
    { before: true, input: r.b, output: r.a, edges: [['pin:23', r.b], [r.a, l.a], [l.b, 'pin:GND']] },
    { before: false, input: r.a, output: r.b, edges: [['pin:23', l.a], [l.b, r.a], [r.b, 'pin:GND']] },
    { before: false, input: r.b, output: r.a, edges: [['pin:23', l.a], [l.b, r.b], [r.a, 'pin:GND']] },
  ];
  const route = variants.find(v => v.edges.every(([a, b]) => same(completed, a, b))) || variants[0];
  const allPlaced = project.parts.every(kind => state.parts[kind]);
  const canPlan = allPlaced && plan !== null;
  const connection = (id, title, a, b, why, code) => steps.push(connectionStep(state, canPlan, id, title, a, b, why, code));
  connection('indicator-source', 'Bring GPIO23 into the LED circuit', ...route.edges[0],
    route.before ? 'GPIO23 is the controlled output. This connection feeds the resistor first, so current cannot reach the LED without passing through it.'
      : 'GPIO23 feeds the LED anode. Your resistor is on the ground side of the LED; that is also a valid series circuit.',
    { line: 'const int LED_PIN = 23;', explanation: 'The example controls the pin marked 23. A wire on a different GPIO would not follow this code.' });
  connection('indicator-junction', route.before ? 'Join the resistor to the LED anode' : 'Join the LED cathode to the resistor', ...route.edges[1],
    'Series means one continuous path through both parts. A resistor standing nearby does nothing unless its two ends are in that path. A shared breadboard strip counts as a connection.');
  connection('indicator-return', 'Complete the path to GND', ...route.edges[2],
    'GND is the common 0 V reference and the return path. When GPIO23 goes HIGH, current flows through the resistor and LED to GND. Without a return path, the LED stays off.');
  if (b) {
    const input = same(completed, 'pin:18', b.c) ? b.c : b.a;
    const ground = input === b.a ? b.c : b.a;
    connection('button-input', 'Connect one switch pair to GPIO18', 'pin:18', input,
      'GPIO18 reads the button. Its internal pull-up holds the input HIGH while the switch is open; no wire to 3V3 is needed.',
      { line: 'pinMode(BUTTON_PIN, INPUT_PULLUP);', explanation: 'INPUT_PULLUP enables a weak connection to 3.3 V inside the ESP32, so an unpressed button has a defined HIGH reading.' });
    connection('button-ground', 'Connect the opposite switch pair to GND', ground, 'pin:GND',
      'Pressing bridges the two pairs and connects GPIO18 to GND, making the input LOW. Wiring both jumpers to the same pair would make it LOW all the time.',
      { line: 'bool pressed = digitalRead(BUTTON_PIN) == LOW;', explanation: 'The code treats LOW as pressed and turns the LED on.' });
  }
  if (p) {
    const high = same(completed, p.a, 'pin:3V3') ? p.a : p.b, low = high === p.a ? p.b : p.a;
    connection('pot-ground', 'Connect one outer dial leg to GND', low, 'pin:GND',
      'This sets one end of the resistive track to 0 V. The track remains between GND and 3.3 V; the outer legs must never share one breadboard strip.');
    connection('pot-power', 'Connect the other outer leg to 3V3', 'pin:3V3', high,
      '3V3 supplies a steady 3.3 V to the other end of the track. Use 3V3 here, not VIN: GPIO34 is not 5 V tolerant. Swapping the outer wires reverses the dial direction.');
    connection('pot-wiper', 'Send the middle leg to GPIO34', p.w, 'pin:34',
      'The wiper picks a voltage between the two outer legs. GPIO34 measures it; the code then drives the separate LED circuit on GPIO23. The dial does not power the LED directly.',
      { line: 'int raw = analogRead(POT_PIN);', explanation: 'The example reads GPIO34 into raw. The demo maps its ideal 0–4095 reading to LED brightness; physical ADC readings can differ.' });
  }
  const check = validateCircuit(state);
  if (!check.ok && check.code !== 'missing_parts') for (const step of steps) if (step.blocked) {
    step.instruction = check.message;
    step.targets = check.targets;
    step.copper = check.targets;
    step.diagnostic = check;
  }
  steps.push({ id: 'run', type: 'run', title: 'Check it, then bring it to life', complete: check.ok, action: null,
    instruction: project.id === 'blink' ? 'Choose Check circuit, then Run. Change INTERVAL_MS to adjust the pause between LED changes.'
      : project.id === 'button' ? 'Choose Check circuit, then Run. Hold the physical button or the Hold button control; release it to turn the LED off.'
      : 'Choose Check circuit, then Run. Turn the physical dial or use Dial position to change the LED brightness.',
    why: 'The demo checks this circuit and follows the supplied example. It does not compile the displayed code. Disconnect power before changing real wiring.',
    targets: ['pin:23', ...partTerminals('resistor', r), ...partTerminals('led', l), 'pin:GND'], copper: [],
    code: project.id === 'blink' ? { line: 'delay(INTERVAL_MS);', explanation: `Each pause is ${state.interval} ms. One on-and-off cycle takes ${state.interval * 2} ms. The slider updates both the demo and this constant in the downloadable example.` }
      : project.id === 'potentiometer' ? { line: 'ledcWrite(LED_PIN, duty);', explanation: 'PWM switches GPIO23 rapidly. duty sets how much of each cycle is on: 0 is off and 255 is fully on.' }
      : { line: 'digitalWrite(LED_PIN, HIGH);', explanation: 'The pressed branch sets GPIO23 HIGH; the released branch sets it LOW.' } });
  return steps;
}
