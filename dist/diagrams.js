// Electrical connections, not breadboard hole maps. All markup is authored here.
// Values and GPIOs match the original ESP32-WROOM-32 lessons in lessons.js.
let diagramSequence = 0;
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function drawing(title, description, content, caption = '', height = 400) {
  const id = `circuit-${++diagramSequence}`;
  const body = content.replaceAll('ARROW_ID', `${id}-arrow`);
  return `<figure class="circuit-diagram" style="margin:0;min-width:0">
    <div class="circuit-scroll" tabindex="0" role="group" aria-label="${escapeText(title)}. Scroll horizontally to see all connections."><svg class="circuit-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 ${height}" role="img" aria-labelledby="${id}-title ${id}-desc" style="display:block;width:100%;height:auto;overflow:visible;color:#264864;fill:none;stroke:#264864;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">
      <title id="${id}-title">${escapeText(title)}</title><desc id="${id}-desc">${escapeText(description)}</desc>
      <defs><marker id="${id}-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 7 3.5 0 7" fill="none" stroke="#c8754e" stroke-width="1.5"/></marker></defs>
      ${body}
    </svg></div>
    <span class="diagram-scroll-hint" aria-hidden="true">Scroll sideways to trace the circuit →</span>
    ${caption ? `<figcaption style="font:13px/1.6 'DM Sans',sans-serif;color:#607888;margin-top:8px">${escapeText(caption)}</figcaption>` : ''}
  </figure>`;
}

const line = (x1, y1, x2, y2, options = '') => `<path d="M${x1} ${y1}L${x2} ${y2}" ${options}/>`;
const path = (d, options = '') => `<path d="${d}" ${options}/>`;
const text = (x, y, value, size = 17, anchor = 'middle', color = '#264864') => `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" stroke="none" style="font:${size}px 'JetBrains Mono',monospace">${escapeText(value)}</text>`;
const note = (x, y, value, anchor = 'middle') => text(x, y, value, 15, anchor, '#697f8e');
const node = (x, y, accent = false) => `<circle cx="${x}" cy="${y}" r="4" fill="${accent ? '#c8754e' : '#264864'}" stroke="none"/>`;
const terminal = (x, y) => `<circle cx="${x}" cy="${y}" r="4" fill="#f8f5eb"/>`;
const ground = (x, y) => path(`M${x} ${y}v12m-17 0h34m-11 7h-12m3 7h6`) + text(x, y + 51, 'GND', 16);
const resistor = (x, y, angle = 0, length = 48) => `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M-${length / 2 + 15} 0h15m${length} 0h15"/><rect x="-${length / 2}" y="-10" width="${length}" height="20" fill="#f8f5eb"/></g>`;
const diode = (x, y, angle = 0, emitting = false) => `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M-35 0h21m28 0h21M-14-13 14 0-14 13ZM14-15v30"/>${emitting ? '<path d="M-4-23 10-37M10-19 24-33" stroke="#c8754e" marker-end="url(#ARROW_ID)"/>' : ''}</g>`;
const switchSymbol = (x, y, angle = 0) => `<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M-35 0h15m40 0h15M-20 0 15-20"/><circle cx="-20" r="3" fill="#f8f5eb"/><circle cx="20" r="3" fill="#f8f5eb"/></g>`;
const block = (x, y, w, h, label = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f8f5eb"/>${label ? text(x + w / 2, y + h / 2 + 6, label) : ''}`;
const pin = (x, y, label, width = 136) => block(x, y - 22, width, 44, label);

function ledOutput(x = 580, top = 90) {
  return text(x, top - 20, 'GPIO23') + terminal(x, top) + line(x, top, x, top + 21)
    + resistor(x, top + 60, 90) + text(x + 43, top + 65, '330 Ω', 15, 'start')
    + line(x, top + 99, x, top + 115) + diode(x, top + 150, 90, true)
    + text(x + 42, top + 155, 'LED', 16, 'start') + line(x, top + 185, x, top + 220)
    + ground(x, top + 220);
}

function blink(wifi = false) {
  const c = pin(38, 170, 'GPIO23', 122) + line(160, 170, 246, 170)
    + resistor(285, 170) + text(285, 137, '330 Ω') + line(324, 170, 405, 170)
    + diode(440, 170, 0, true) + text(440, 115, 'LED')
    + note(399, 213, '+') + note(479, 213, '−')
    + path('M475 170H600V250') + ground(600, 250)
    + note(100, 220, '3.3 V output') + note(440, 253, 'Anode → cathode');
  return drawing(wifi ? 'Wi-Fi LED output circuit' : 'LED output circuit',
    'GPIO23 connects through a 330 ohm resistor to the LED anode. The LED cathode connects to ground.', c,
    wifi ? 'Wi-Fi requests change GPIO23. The external LED still needs the same complete, current-limited path.' : 'GPIO23 → resistor → LED anode (+) → cathode (−) → GND.');
}

function divider(sensor) {
  const isLight = sensor === 'LDR';
  const c = text(190, 48, '3V3') + line(190, 63, 190, 86) + resistor(190, 125, 90)
    + text(125, 130, sensor, 18, 'end')
    + (isLight ? path('M126 87 153 109M116 101 143 123', 'stroke="#c8754e" marker-end="url(#ARROW_ID)"') : '')
    + line(190, 164, 190, 231) + node(190, 205, true) + line(190, 205, 345, 205, 'stroke="#c8754e"')
    + pin(345, 205, 'GPIO34') + note(413, 249, 'ADC input')
    + resistor(190, 270, 90) + text(125, 275, '10 kΩ', 17, 'end')
    + line(190, 309, 190, 330) + ground(190, 330) + ledOutput(580, 90);
  return drawing(`${sensor} voltage divider and LED`,
    `3V3 connects through the ${sensor} to one junction shared by GPIO34 and a 10 kilohm resistor to ground. GPIO23 drives a separate LED through 330 ohms to ground.`, c,
    'The orange dot is one shared node: sensor, GPIO34 and 10 kΩ all meet here.');
}

function potentiometer() {
  const c = text(190, 48, '3V3') + line(190, 63, 190, 115)
    + resistor(190, 200, 90, 140) + text(128, 192, '10 kΩ', 17, 'end') + note(128, 216, 'pot', 'end')
    + line(190, 285, 190, 330) + ground(190, 330)
    + line(345, 200, 203, 200, 'stroke="#c8754e" marker-end="url(#ARROW_ID)"')
    + pin(345, 200, 'GPIO34') + note(277, 181, 'Wiper') + note(413, 244, 'ADC input')
    + ledOutput(580, 90);
  return drawing('Potentiometer wiper and PWM LED',
    'The potentiometer outer terminals connect to 3V3 and ground. Its movable middle terminal, the wiper, connects to GPIO34. GPIO23 drives an LED through 330 ohms to ground.', c,
    'The wiper is the center terminal. It selects a voltage between the two outer terminals.');
}

function board() {
  const c = block(35, 105, 150, 90, 'USB') + block(270, 105, 170, 90, 'Regulator')
    + block(525, 105, 145, 90, 'ESP32')
    + line(185, 150, 270, 150) + text(225, 132, '5 V')
    + line(440, 150, 525, 150, 'stroke="#c8754e"') + node(480, 150, true)
    + line(480, 150, 480, 72, 'stroke="#c8754e"') + text(480, 52, '3V3 pin')
    + note(355, 225, '5 V → 3.3 V') + note(598, 225, '3.3 V logic')
    + path('M110 195V280H598V195M355 195V280') + node(355, 280) + ground(355, 280)
    + note(225, 268, 'USB return') + note(540, 268, '0 V reference');
  return drawing('ESP32 board power and ground',
    'USB supplies 5 volts to the voltage regulator. The regulator supplies 3.3 volts to the ESP32 and the 3V3 power pin. USB, regulator and ESP32 share the same ground reference.', c,
    '3V3 is a power pin. A GPIO is a programmable signal measured relative to GND.');
}

function button() {
  const c = `<rect x="45" y="30" width="330" height="181" stroke-dasharray="5 6"/>`
    + note(65, 56, 'Inside ESP32', 'start') + text(220, 82, '3V3')
    + line(220, 92, 220, 101) + resistor(220, 140, 90)
    + note(280, 131, 'Internal', 'start') + note(280, 154, 'pull-up', 'start')
    + line(220, 179, 220, 230) + node(220, 200, true) + line(95, 200, 220, 200)
    + text(93, 181, 'GPIO18') + switchSymbol(220, 265, 90)
    + note(275, 270, 'Button', 'start') + line(220, 300, 220, 330) + ground(220, 330)
    + ledOutput(540, 90);
  return drawing('Active-low button with internal pull-up',
    'GPIO18 has an internal resistor to 3V3 when INPUT_PULLUP is enabled. Pressing the button connects this input to ground. A separate output, GPIO23, drives an LED through 330 ohms.', c,
    'INPUT_PULLUP: released = HIGH, pressed = LOW. The LED uses a separate output.');
}

function distance() {
  const c = block(35, 95, 165, 220) + text(117, 186, 'HC-SR04', 19)
    + text(117, 45, '5 V') + line(117, 60, 117, 95) + note(117, 120, 'VCC')
    + note(185, 150, 'Trig', 'end') + line(200, 145, 500, 145) + pin(500, 145, 'GPIO23')
    + note(185, 225, 'Echo', 'end') + line(200, 220, 246, 220)
    + resistor(285, 220) + text(285, 192, '2.2 kΩ')
    + line(324, 220, 500, 220, 'stroke="#c8754e"') + node(385, 220, true) + pin(500, 220, 'GPIO34')
    + line(385, 220, 385, 251) + resistor(385, 290, 90) + text(430, 295, '3.3 kΩ', 16, 'start')
    + path('M385 329V360H117V315') + node(385, 360) + ground(385, 360)
    + note(117, 296, 'GND') + note(285, 255, '5 V Echo') + note(567, 264, '≈ 3.0 V max');
  return drawing('HC-SR04 with Echo voltage divider',
    'The HC-SR04 uses a 5 volt supply and shared ground. GPIO23 drives Trig. Echo passes through 2.2 kilohms to the shared GPIO34 junction, then through 3.3 kilohms to ground. A 5 volt Echo becomes about 3 volts at the GPIO34 junction.', c,
    'The two resistors are a divider: 5 × 3.3 / (2.2 + 3.3) = 3.0 V. Never connect Echo directly to GPIO34.', 430);
}

function rgb() {
  const rows = [[100, 25, 'Red'], [200, 26, 'Green'], [300, 27, 'Blue']];
  let c = '';
  for (const [y, gpio, color] of rows) {
    c += pin(32, y, `GPIO${gpio}`, 120) + line(152, y, 211, y) + resistor(250, y)
      + text(250, y - 28, '330 Ω') + line(289, y, 385, y) + diode(420, y, 0, true)
      + text(420, y - 47, color) + line(455, y, 590, y) + node(590, y);
  }
  c += line(590, 100, 590, 335) + ground(590, 335) + note(592, 410, 'Common cathode');
  return drawing('Common-cathode RGB LED',
    'GPIO25, GPIO26 and GPIO27 each connect through their own 330 ohm resistor to the red, green and blue LED anodes. All cathodes join ground.', c,
    'Three independent current paths need three separate resistors. Check your RGB LED’s lead order.', 440);
}

function piezo(x, y) {
  return `<circle cx="${x}" cy="${y}" r="30" fill="#f8f5eb"/>`
    + path(`M${x - 30} ${y}h19m22 0h19M${x - 11} ${y - 18}v36m22-36v36`)
    + note(x, y + 58, 'Passive piezo');
}

function sound() {
  const c = pin(35, 170, 'GPIO25', 122) + line(157, 170, 236, 170)
    + resistor(275, 170) + text(275, 135, '100 Ω') + line(314, 170, 410, 170)
    + piezo(440, 170) + path('M470 170H605V265') + ground(605, 265)
    + note(394, 203, '+') + note(487, 203, '−') + note(96, 221, 'Tone output');
  return drawing('Passive piezo tone output',
    'GPIO25 connects through 100 ohms to a small passive piezo positive terminal. The negative terminal connects to ground.', c,
    'Use a small passive piezo. A speaker or high-current buzzer needs a suitable driver.');
}

function piano() {
  const pins = [13, 14, 16, 17, 18, 19, 21, 22];
  const notes = ['C4', 'D', 'E', 'F', 'G', 'A', 'B', 'C5'];
  let c = text(350, 34, 'GPIO inputs · INPUT_PULLUP', 18);
  pins.forEach((gpio, i) => {
    const x = 75 + i * 78;
    c += text(x, 76, gpio) + terminal(x, 91) + line(x, 95, x, 130)
      + switchSymbol(x, 165, 90) + note(x + 12, 125, notes[i], 'start')
      + line(x, 200, x, 235) + node(x, 235);
  });
  c += line(75, 235, 621, 235) + ground(350, 235)
    + pin(35, 355, 'GPIO25', 122) + line(157, 355, 236, 355) + resistor(275, 355)
    + text(275, 325, '100 Ω') + line(314, 355, 410, 355) + piezo(440, 355)
    + path('M470 355H605V370') + ground(605, 370);
  return drawing('Eight piano keys and one piezo',
    'Eight independent switches connect GPIO13, 14, 16, 17, 18, 19, 21 and 22 to a shared ground. Every input uses INPUT_PULLUP. GPIO25 connects through 100 ohms to a passive piezo whose other terminal is grounded.', c,
    'Each button has its own input. Only their ground contacts are joined together.', 445);
}

function motor() {
  const c = text(440, 35, 'Rated motor supply +', 17) + line(440, 50, 440, 106)
    + `<circle cx="440" cy="140" r="34" fill="#f8f5eb"/>` + text(440, 147, 'M', 23)
    + note(483, 108, '+') + note(483, 186, '−') + line(440, 174, 440, 245)
    + path('M440 80H580V105M580 175V200H440') + node(440, 80) + node(440, 200)
    + diode(580, 140, -90) + note(580, 226, 'Flyback diode') + note(580, 247, 'Bar to supply +')
    + block(350, 245, 180, 100) + text(440, 291, 'N-MOSFET') + note(440, 315, '3.3 V gate drive')
    + text(440, 263, 'D', 13) + text(367, 299, 'G', 13) + text(440, 338, 'S', 13)
    + text(66, 275, 'GPIO25') + terminal(66, 295) + line(70, 295, 91, 295)
    + resistor(130, 295) + text(130, 263, '100 Ω', 16) + line(169, 295, 350, 295) + node(250, 295)
    + line(250, 295, 250, 311) + resistor(250, 350, 90) + text(202, 355, '10 kΩ', 16, 'end')
    + path('M250 389V405H600M440 345V405') + node(440, 405) + ground(440, 405)
    + note(600, 388, 'Supply −', 'end') + note(250, 440, 'ESP32 GND');
  return drawing('Low-side MOSFET motor driver',
    'Motor positive connects to an external supply. Motor negative connects to the N-MOSFET drain. Its source connects to the shared supply and ESP32 ground. GPIO25 reaches the gate through 100 ohms; a 10 kilohm pull-down connects the gate to ground. The flyback diode is across the motor, cathode at supply positive and anode at the drain.', c,
    'The MOSFET carries motor current. The diode’s cathode bar faces the positive supply.', 475);
}

function temperature() {
  const c = block(480, 120, 150, 190) + text(555, 190, 'DHT22', 20)
    + note(555, 145, 'VCC') + note(493, 236, 'Data', 'start') + note(555, 292, 'GND')
    + text(250, 49, '3V3') + path('M250 64V116M250 80H555V120') + node(250, 80)
    + resistor(250, 155, 90) + text(303, 160, '10 kΩ', 17, 'start')
    + line(250, 194, 250, 230) + node(250, 230, true)
    + line(85, 230, 480, 230, 'stroke="#c8754e"') + terminal(85, 230) + text(85, 202, 'GPIO27')
    + line(555, 310, 555, 335) + ground(555, 335);
  return drawing('DHT22 data with pull-up resistor',
    'The DHT22 uses 3V3 and ground. Its data terminal connects to GPIO27 and a 10 kilohm pull-up resistor to 3V3. Bare sensor pin 3 is unused.', c,
    'A bare DHT22 needs the data pull-up. Some modules already include it; check your module.');
}

function servo() {
  const c = block(500, 130, 155, 160) + text(577, 195, 'Servo', 22)
    + note(577, 153, 'V+') + note(515, 230, 'Signal', 'start') + note(577, 272, 'GND')
    + text(340, 49, 'External regulated 5 V', 17) + path('M340 64V80H577V130')
    + pin(35, 225, 'GPIO18', 120) + line(155, 225, 500, 225, 'stroke="#c8754e"')
    + note(325, 202, 'Control pulse') + note(325, 251, '50 Hz · 1–2 ms')
    + path('M577 290V330H100') + node(340, 330) + ground(340, 330)
    + note(100, 311, 'ESP32 GND') + note(577, 354, 'Supply −');
  return drawing('Servo signal and external power',
    'GPIO18 supplies the servo control signal. An external regulated 5 volt supply powers the servo. The servo, external supply and ESP32 grounds are joined.', c,
    'The signal wire carries control pulses. Servo current comes from the external supply.');
}

function stepper() {
  let c = block(280, 105, 170, 230) + text(365, 86, 'ULN2003', 20)
    + block(550, 160, 120, 130) + text(610, 214, '28BYJ-48', 16) + note(610, 244, '5 V motor')
    + line(450, 225, 550, 225) + note(500, 203, '5-wire', 'middle') + note(500, 253, 'socket')
    + text(365, 31, 'External 5 V') + line(365, 45, 365, 105) + note(365, 127, '+')
    + path('M365 335V370H80') + ground(365, 370) + note(105, 353, 'ESP32 GND') + note(550, 375, 'Supply −')
    + line(365, 370, 590, 370) + node(365, 370);
  [16, 17, 18, 19].forEach((gpio, i) => {
    const y = 155 + i * 45;
    c += text(90, y + 6, `GPIO${gpio}`) + line(153, y, 280, y) + note(298, y + 6, `IN${i + 1}`, 'start');
  });
  return drawing('28BYJ-48 with ULN2003 driver',
    'GPIO16, 17, 18 and 19 connect to ULN2003 inputs 1, 2, 3 and 4 respectively. The motor plugs into the driver motor socket. An external 5 volt supply powers the driver and motor; its ground connects to ESP32 ground.', c,
    'The driver switches the motor coils. GPIOs connect to IN1–IN4, not directly to the motor.', 435);
}

function plant() {
  const c = block(35, 100, 150, 140) + text(110, 143, 'Moisture', 17) + text(110, 166, 'sensor', 17)
    + note(172, 201, 'AOUT', 'end') + block(255, 120, 190, 220) + text(350, 158, 'ESP32', 21)
    + block(520, 100, 150, 180) + text(595, 146, 'SSD1306', 18) + text(595, 169, 'OLED', 17)
    + line(185, 195, 255, 195, 'stroke="#c8754e"') + note(267, 201, 'GPIO34', 'start')
    + line(445, 195, 520, 195) + note(433, 201, 'GPIO21', 'end') + note(533, 201, 'SDA', 'start')
    + line(445, 235, 520, 235) + note(433, 241, 'GPIO22', 'end') + note(533, 241, 'SCL', 'start')
    + path('M110 100V55H595V100M350 55V120') + node(350, 55) + text(350, 36, '3V3')
    + path('M110 240V380H595V280M350 340V380') + node(350, 380) + ground(350, 380)
    + note(110, 91, 'VCC') + note(595, 91, 'VCC') + note(110, 263, 'GND') + note(595, 303, 'GND');
  return drawing('Moisture sensor and I²C OLED',
    'The moisture sensor and OLED both use 3V3 and a common ground. The sensor analog output connects to GPIO34. GPIO21 connects to OLED SDA and GPIO22 connects to OLED SCL.', c,
    'Use 3.3 V-compatible modules. Both devices share power and ground, but use different signal pins.', 445);
}

/** Return an accessible, responsive electrical diagram for one lesson. */
export function renderCircuitDiagram(lessonId) {
  const circuits = {
    board, blink, button, potentiometer, rgb,
    light: () => divider('LDR'), distance, sound, piano, motor, temperature,
    servo, stepper, plant, force: () => divider('FSR'), wifi: () => blink(true)
  };
  return (circuits[lessonId] || board)();
}

/** Continuity inside a typical solderless breadboard; not a wiring placement map. */
export function renderBreadboardDiagram() {
  let c = text(350, 30, 'Connections inside a breadboard', 20)
    + note(75, 66, 'Power rails') + note(625, 66, 'Power rails')
    + text(350, 85, 'Center gap', 16) + path('M350 94V120', 'stroke="#697f8e"')
    + `<rect x="332" y="130" width="36" height="180" fill="#e8e8df" stroke="none"/>`;
  // One row on each side: each band is a single metal strip with five sockets.
  [168, 228, 288].forEach((y, row) => {
    [175, 390].forEach((start, group) => {
      const emphasized = row === 0;
      c += `<rect x="${start - 14}" y="${y - 15}" width="170" height="30" fill="${emphasized ? '#c8754e18' : '#26486409'}" stroke="${emphasized ? '#c8754e' : '#8299a655'}"/>`
        + line(start, y, start + 140, y, `stroke="${emphasized ? '#c8754e' : '#8299a6'}" stroke-width="4"`);
      for (let i = 0; i < 5; i++) c += `<circle cx="${start + i * 35}" cy="${y}" r="5.5" fill="#f8f5eb" stroke="${emphasized ? '#c8754e' : '#8299a6'}"/>`;
      if (row === 0) c += text(start + 70, 138, group ? 'F  G  H  I  J' : 'A  B  C  D  E', 15);
    });
  });
  // Rails are separate vertical conductors. An explicit break illustrates why
  // a long rail must not be assumed continuous on every breadboard model.
  [60, 100, 600, 640].forEach((x, i) => {
    const positive = i % 2 === 0;
    const color = positive ? '#c8754e' : '#264864';
    c += text(x, 101, positive ? '+' : '−', 22, 'middle', color)
      + path(`M${x} 126V198M${x} 233V305`, `stroke="${color}" stroke-width="3"`);
    [130, 161, 192, 241, 272, 303].forEach(y => {
      c += `<circle cx="${x}" cy="${y}" r="5" fill="#f8f5eb" stroke="${color}"/>`;
    });
  });
  c += note(250, 343, '5 holes joined') + note(460, 343, '5 holes joined')
    + note(350, 377, 'Rows stay separate. Nothing crosses the center gap.')
    + path('M111 215H140V396', 'stroke="#c8754e"') + note(155, 402, 'Possible rail break', 'start');
  return drawing('Breadboard internal connections',
    'Each horizontal group of five holes is one connected metal strip. The five-hole group on the other side of the center gap is separate. Adjacent rows are separate. The vertical power rails are separate from the strips, from each other, and may have a break partway along their length.', c,
    'Rails are not automatically connected to the rows. Add a wire where you need a connection, and check rail breaks with a continuity tester.', 425);
}
