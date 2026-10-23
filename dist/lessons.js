// Course targets the original ESP32-WROOM-32 DevKit V1, 30-pin layout.
// Sketches use Arduino-ESP32 3.x. Browser scenes illustrate each lesson's behavior.
const spec = (label, value) => ({ label, value });
const wire = (from, to, note = '') => ({ from, to, note });
const control = (label, min, max, step, value, unit) => ({ label, min, max, step, value, unit });
const question = (text, options, answer, explanation) => ({ text, options, answer, explanation });

export const lessons = [
  {
    id: 'board', title: 'Meet your ESP32', shortTitle: 'The board', category: 'Start here', duration: '5 min', icon: 'cpu',
    description: 'A tiny board with a lot of possibility. Explore the processor, antenna, power supply and pins that connect your code to the physical world.',
    objectives: ['Identify the main parts of a DevKit V1.', 'Understand 3.3 V logic and safe power connections.', 'Send your first message over USB.'],
    steps: ['Install Arduino IDE 2 on your computer and connect the ESP32 with a data-capable Micro-USB cable. A charge-only cable cannot upload code.', 'Open File → Preferences (Arduino IDE → Settings on macOS). In Additional Boards Manager URLs, add https://espressif.github.io/arduino-esp32/package_esp32_index.json and save.', 'Open Tools → Board → Boards Manager, search for esp32, and install “esp32 by Espressif Systems”. These lessons use version 3.x of that board package.', 'Use the board selector to choose “DOIT ESP32 DEVKIT V1”. Under Tools → Port, select the port that appears when your ESP32 is plugged in.', 'Copy this lesson’s sketch into a new Arduino sketch and click Upload, the right-arrow button. Wait for uploading to finish. If it stays at “Connecting”, hold BOOT until the transfer begins, then release it.', 'Open Tools → Serial Monitor and set its speed to 115200 baud. Press the board’s EN button to restart and see “Hello, ESP32!” followed by uptime messages.'],
    wiring: [wire('USB', 'Computer', 'Provides power and USB-to-serial communication.'), wire('GND', 'Circuit ground', 'All parts in a circuit need a shared reference.'), wire('3V3', '3.3 V peripherals', 'GPIO pins are not 5 V tolerant.')],
    code: `// Board: DOIT ESP32 DEVKIT V1
// Core: Arduino-ESP32 3.x
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Hello, ESP32!");
  Serial.print("CPU frequency: ");
  Serial.print(ESP.getCpuFreqMHz());
  Serial.println(" MHz");
}

void loop() {
  Serial.print("Uptime: ");
  Serial.print(millis() / 1000);
  Serial.println(" seconds");
  delay(1000);
}`,
    explanation: 'setup() runs once after startup. loop() runs repeatedly. The USB-to-serial chip carries Serial messages to your computer; 115200 is the communication speed, not the processor speed.',
    specs: [spec('Module', 'ESP32-WROOM-32'), spec('Processor', 'Dual-core Xtensa LX6, up to 240 MHz'), spec('Logic level', '3.3 V'), spec('Typical flash', '4 MB; board variants differ'), spec('Wireless', '2.4 GHz Wi-Fi + Bluetooth/BLE'), spec('Board reference', '30-pin DevKit V1')],
    control: null,
    challenge: 'Change the welcome message and print the uptime every two seconds.',
    question: question('What voltage represents a HIGH output on an ESP32 GPIO?', ['3.3 V', '5 V', '12 V'], 0, 'ESP32 GPIO uses 3.3 V logic. Applying 5 V to a GPIO can damage the chip.')
  },
  {
    id: 'blink', title: 'Your first blink', shortTitle: 'Blink an LED', category: 'Outputs', duration: '6 min', icon: 'bulb',
    description: 'Make a real-world output respond to your code. An external LED on GPIO23 switches on and off with a pause between each change.',
    objectives: ['Configure an output with pinMode().', 'Use HIGH and LOW to control an LED.', 'Understand why an LED needs a series resistor.'],
    steps: ['Connect GPIO23 to a 330 Ω resistor, then to the LED anode (the longer leg).', 'Connect the LED cathode (the shorter leg, next to the flat edge) to GND.', 'Start the demonstration. Adjust the interval to see the timing change.', 'Upload the example to a physical board and try a different delay value.'],
    wiring: [wire('GPIO23', '330 Ω → LED anode (+)', 'The resistor limits current.'), wire('LED cathode (−)', 'GND', 'Check the LED polarity.')],
    code: `const int LED_PIN = 23;
const int INTERVAL_MS = 500;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(INTERVAL_MS);
  digitalWrite(LED_PIN, LOW);
  delay(INTERVAL_MS);
}`,
    explanation: 'const int declares a named whole-number value that stays fixed: LED_PIN is the pin number and INTERVAL_MS is the wait time. Curly braces group the instructions belonging to setup() or loop(); semicolons end individual instructions. setup() configures the pin once, then loop() repeatedly sets HIGH, waits, sets LOW and waits. Two 500 ms waits make one one-second cycle. HIGH is about 3.3 V and LOW about 0 V.',
    specs: [spec('Output', 'GPIO23'), spec('Series resistor', '330 Ω'), spec('LED', 'Red, approximately 2 V forward voltage'), spec('Example period', '1 second')],
    control: control('Blink interval', 100, 1500, 50, 500, 'ms'),
    challenge: 'Make the LED stay on for 100 ms and off for 900 ms. The cycle still lasts one second.',
    question: question('Why is the resistor connected in series with the LED?', ['To increase the GPIO voltage', 'To limit current through the LED', 'To store the program'], 1, 'An LED does not safely limit its own current. The resistor protects both the LED and the GPIO output.')
  },
  {
    id: 'button', title: 'Listen to a button', shortTitle: 'Push a button', category: 'Inputs', duration: '7 min', icon: 'button',
    description: 'Give your circuit an input. Press a button to light an LED and learn why a pressed button can read LOW.',
    objectives: ['Read a digital input.', 'Use the internal pull-up resistor.', 'Recognize active-low button wiring.'],
    steps: ['Connect opposite switched sides of the push button to GPIO18 and GND. Legs on the same side of many four-leg buttons are already connected.', 'Connect the LED to GPIO23 through a 330 Ω resistor, with its cathode to GND.', 'Run the demonstration and hold the button control. The LED follows the press.', 'Try INPUT_PULLUP in the sketch: released is HIGH, pressed is LOW.'],
    wiring: [wire('GPIO18', 'Button contact A', 'INPUT_PULLUP holds the released input HIGH.'), wire('Button contact B', 'GND', 'Pressing connects the input to ground.'), wire('GPIO23', '330 Ω → LED → GND', 'Indicator output.')],
    code: `const int BUTTON_PIN = 18;
const int LED_PIN = 23;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("Pressed");
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("Released");
  }
  delay(50);
}`,
    explanation: 'bool stores true or false. The comparison digitalRead(BUTTON_PIN) == LOW asks whether the input equals LOW and stores that answer in pressed. The if block runs when pressed is true; otherwise the else block runs. Braces group the instructions in each branch. INPUT_PULLUP keeps the released input HIGH, and pressing connects it to GND, making this comparison true.',
    specs: [spec('Button', 'GPIO18 → GND'), spec('Input mode', 'INPUT_PULLUP'), spec('Pressed state', 'LOW'), spec('LED output', 'GPIO23')],
    control: null,
    challenge: 'Reverse the LED behavior so it is on when the button is released.',
    question: question('What does this button read while it is pressed?', ['HIGH', 'LOW', 'An undefined value'], 1, 'The switch connects GPIO18 to ground, so digitalRead() returns LOW.')
  },
  {
    id: 'potentiometer', title: 'Turn an analog dial', shortTitle: 'Turn a knob', category: 'Analog', duration: '8 min', icon: 'dial',
    description: 'A potentiometer turns position into voltage. Read its middle terminal and use the result to smoothly control LED brightness.',
    objectives: ['Build a voltage divider.', 'Turn an input voltage into a number.', 'Dim an LED with rapid on/off pulses.'],
    steps: ['Connect the outside terminals of a 10 kΩ potentiometer to 3V3 and GND.', 'Connect the center terminal (wiper) to GPIO34.', 'Connect GPIO23 through a 330 Ω resistor and LED to GND.', 'Run the demonstration and move the dial. The displayed ADC value is an idealized reading; real ADCs have noise and nonlinearity.'],
    wiring: [wire('3V3 / GND', 'Potentiometer outer terminals', 'Swap these to reverse the direction.'), wire('Potentiometer wiper', 'GPIO34', 'ADC1 input; GPIO34 is input-only.'), wire('GPIO23', '330 Ω → LED → GND', 'PWM brightness output.')],
    code: `const int POT_PIN = 34;
const int LED_PIN = 23;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(POT_PIN, ADC_11db);
  ledcAttach(LED_PIN, 5000, 8);
}

void loop() {
  int raw = analogRead(POT_PIN);
  int duty = map(raw, 0, 4095, 0, 255);
  ledcWrite(LED_PIN, duty);
  Serial.println(raw);
  delay(50);
}`,
    explanation: 'The analog-to-digital converter (ADC) represents voltage with a number. At 12 bits it has 4096 possible codes, 0–4095. map() rescales that to 256 PWM brightness settings, 0–255. Pulse-width modulation (PWM) varies the fraction of each fast on/off cycle spent on. The configured ADC input scaling, called attenuation, does not make GPIO34 safe for 5 V.',
    specs: [spec('Potentiometer', '10 kΩ linear'), spec('ADC pin', 'GPIO34 / ADC1'), spec('ADC resolution', '12 bits, 0–4095'), spec('PWM', '5 kHz, 8 bits, 0–255')],
    control: control('Dial position', 0, 100, 1, 50, '%'),
    challenge: 'Invert the mapping so the LED gets dimmer as the ADC reading rises.',
    question: question('With the current map(), the dial reading rises from 1024 to 3072. What should the LED do?', ['Get brighter: PWM duty rises from about 25% to 75%', 'Get dimmer: PWM duty falls from about 75% to 25%', 'Stay equally bright: every nonzero reading is treated as fully on'], 0, 'map(raw, 0, 4095, 0, 255) preserves the direction. The output rises from about 64 to 191, giving a longer on-time fraction. Reversing the map endpoints would reverse that behavior.')
  },
  {
    id: 'rgb', title: 'Mix light into color', shortTitle: 'Mix colors', category: 'Outputs', duration: '8 min', icon: 'palette',
    description: 'One package, three LEDs. Blend red, green and blue with independent PWM channels to create a spectrum of colors.',
    objectives: ['Identify a common-cathode RGB LED.', 'Give each color its own resistor.', 'Mix three PWM brightness values.'],
    steps: ['Identify the RGB LED pinout using its datasheet; lead order is not universal.', 'Connect the common cathode to GND.', 'Connect red, green and blue anodes through separate 330 Ω resistors to GPIO25, GPIO26 and GPIO27.', 'Run the demonstration and explore the hue control. The example converts a chosen hue into three PWM values.'],
    wiring: [wire('GPIO25', '330 Ω → red anode'), wire('GPIO26', '330 Ω → green anode'), wire('GPIO27', '330 Ω → blue anode'), wire('Common cathode', 'GND', 'This example is for a common-cathode LED.')],
    code: `const int RED = 25, GREEN = 26, BLUE = 27;
const int HUE_DEGREES = 180;

void setHue(int hue) {
  hue = ((hue % 360) + 360) % 360;
  int rise = (hue % 60) * 255 / 60;
  int fall = 255 - rise;
  int r = 0, g = 0, b = 0;
  switch (hue / 60) {
    case 0: r = 255; g = rise; break;
    case 1: r = fall; g = 255; break;
    case 2: g = 255; b = rise; break;
    case 3: g = fall; b = 255; break;
    case 4: r = rise; b = 255; break;
    case 5: r = 255; b = fall; break;
  }
  ledcWrite(RED, r);
  ledcWrite(GREEN, g);
  ledcWrite(BLUE, b);
}

void setup() {
  ledcAttach(RED, 5000, 8);
  ledcAttach(GREEN, 5000, 8);
  ledcAttach(BLUE, 5000, 8);
  setHue(HUE_DEGREES);
}

void loop() {
  delay(1000); // LEDC keeps the chosen color running.
}`,
    explanation: 'HUE_DEGREES selects a color around a 0–360° wheel. setHue() divides it into six regions and derives three 0–255 PWM values. The RGB LED needs one resistor per color. LEDC maintains those values after setup(); actual color balance depends on the LED, resistors and supply.',
    specs: [spec('Type', 'Common-cathode RGB LED'), spec('Outputs', 'GPIO25 / 26 / 27'), spec('Resistors', '3 × 330 Ω'), spec('PWM resolution', '8 bits per color')],
    control: control('Hue', 0, 360, 1, 180, '°'),
    challenge: 'Call setHue() with a slowly changing angle to make a rainbow sweep. Then lower all three PWM values proportionally for softer light.',
    question: question('At a hue of 60°, the helper chooses region 1 with rise = 0 and fall = 255. Which result should you expect?', ['Red 255, green 0, blue 255: magenta', 'Red 255, green 255, blue 0: yellow', 'Red 0, green 255, blue 255: cyan'], 1, 'Region 1 sets red to fall and green to 255, while blue stays at its initialized zero. Red and green light combine to make yellow. The three brightness numbers each control a separate current-limited channel.')
  },
  {
    id: 'light', title: 'Sense the daylight', shortTitle: 'Sense light', category: 'Sensors', duration: '8 min', icon: 'sun',
    description: 'Make a night-light that responds to its surroundings. A light-dependent resistor changes resistance as the light changes.',
    objectives: ['Turn changing resistance into voltage.', 'Read light with an ADC input.', 'Use a threshold to switch an output.'],
    steps: ['Connect an LDR between 3V3 and GPIO34.', 'Connect a 10 kΩ resistor between GPIO34 and GND to complete the voltage divider.', 'Connect an LED through 330 Ω to GPIO23 and GND.', 'On hardware, open Serial Monitor at 115200 baud and record readings with the LDR covered and brightly lit. If those are about 400 and 2000, a midpoint threshold is (400 + 2000) / 2 = 1200. Your readings may differ.', 'Edit DARK_THRESHOLD near the top of the sketch to suit your measurements, then upload again. In the simulation, cover the sensor and explore the ambient-light control to see the threshold decision.'],
    wiring: [wire('3V3', 'LDR → GPIO34', 'More light lowers LDR resistance.'), wire('GPIO34', '10 kΩ → GND', 'The divider junction is the ADC input.'), wire('GPIO23', '330 Ω → LED → GND')],
    code: `const int LIGHT_PIN = 34;
const int LED_PIN = 23;
const int DARK_THRESHOLD = 1200;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(LIGHT_PIN, ADC_11db);
}

void loop() {
  int light = analogRead(LIGHT_PIN);
  digitalWrite(LED_PIN, light < DARK_THRESHOLD);
  Serial.println(light);
  delay(100);
}`,
    explanation: 'In this wiring arrangement, more light creates a higher ADC reading. The threshold is a value you calibrate for your circuit. An LDR provides a relative light measurement; a raw ADC value is not a reading in lux.',
    specs: [spec('Sensor', 'LDR / photoresistor'), spec('Fixed resistor', '10 kΩ'), spec('ADC input', 'GPIO34'), spec('Output', 'GPIO23')],
    control: control('Ambient light', 0, 100, 1, 65, '%'),
    challenge: 'Add two thresholds so the light does not flicker when the reading hovers near the switching point.',
    question: question('What happens to an LDR’s resistance in brighter light?', ['It decreases', 'It increases', 'It always stays at 10 kΩ'], 0, 'An LDR conducts more easily in bright light, so its resistance decreases.')
  },
  {
    id: 'distance', title: 'Measure the space ahead', shortTitle: 'Read distance', category: 'Sensors', duration: '10 min', icon: 'ruler',
    description: 'Send a short ultrasound pulse, then measure its return time. Turn an echo into a distance reading.',
    objectives: ['Trigger an HC-SR04 measurement.', 'Convert round-trip time into distance.', 'Reduce the 5 V Echo signal for a 3.3 V input.'],
    steps: ['Power a standard HC-SR04 from 5 V and connect its GND to the ESP32 ground.', 'Connect GPIO23 to Trig. Most HC-SR04 modules accept a 3.3 V trigger; check your module if it does not respond.', 'Connect Echo through a 2.2 kΩ resistor to GPIO34, then connect 3.3 kΩ from GPIO34 to GND. This divider lowers a 5 V echo to about 3 V.', 'Run the demonstration and move the obstacle. On hardware, aim at a flat surface.'],
    wiring: [wire('5 V supply / GND', 'HC-SR04 VCC / GND', 'Use a suitable 5 V source and shared ground.'), wire('GPIO23', 'Trig'), wire('Echo', '2.2 kΩ → GPIO34', 'Never connect a 5 V Echo directly to a GPIO.'), wire('GPIO34', '3.3 kΩ → GND', 'Forms the lower divider resistor.')],
    code: `const int TRIG = 23;
const int ECHO = 34;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duration = pulseIn(ECHO, HIGH, 30000);
  if (duration == 0) {
    Serial.println("No echo");
  } else {
    float cm = duration * 0.0343f / 2.0f;
    Serial.printf("Distance: %.1f cm\\n", cm);
  }
  delay(100);
}`,
    explanation: 'Sound travels approximately 0.0343 cm per microsecond at room temperature. The echo travels to the obstacle and back, so the calculation divides by two. pulseIn() has a timeout so a missing echo cannot block the program indefinitely.',
    specs: [spec('Sensor supply', '5 V for standard HC-SR04'), spec('Echo divider', '2.2 kΩ top / 3.3 kΩ bottom'), spec('Typical range', '2–400 cm; conditions matter'), spec('Trigger / echo', 'GPIO23 / GPIO34')],
    control: control('Obstacle distance', 5, 150, 1, 45, 'cm'),
    challenge: 'Light an LED when an object is closer than 20 cm. Handle the “No echo” case separately.',
    question: question('An Echo pulse lasts 2000 µs. Using 0.0343 cm per µs, how far away is the obstacle?', ['About 68.6 cm', 'About 34.3 cm', 'About 17.2 cm'], 1, '2000 × 0.0343 = 68.6 cm for the entire out-and-back journey. Dividing once by two gives a one-way distance of about 34.3 cm. Forgetting that division doubles the reported distance.')
  },
  {
    id: 'sound', title: 'Make some sound', shortTitle: 'Make a sound', category: 'Outputs', duration: '7 min', icon: 'volume',
    description: 'A passive piezo turns a changing voltage into vibration. Change the frequency to change the pitch.',
    objectives: ['Distinguish passive piezos from active buzzers.', 'Generate a tone with LEDC.', 'Relate frequency to pitch.'],
    steps: ['Use a small passive piezo element, not a high-current speaker.', 'Connect GPIO25 through a 100 Ω resistor to the piezo positive terminal and its negative terminal to GND.', 'Start the demonstration and adjust the frequency. Enable site audio to hear the browser version.', 'Upload the selected-frequency sketch to hear the same pitch parameter on your board.'],
    wiring: [wire('GPIO25', '100 Ω → passive piezo (+)'), wire('Piezo (−)', 'GND', 'Use a transistor driver for a higher-current buzzer.')],
    code: `const int PIEZO_PIN = 25;
const int FREQUENCY_HZ = 440;

void setup() {
  ledcAttach(PIEZO_PIN, 2000, 8);
  ledcWriteTone(PIEZO_PIN, FREQUENCY_HZ);
}

void loop() {
  delay(1000); // The hardware continues producing the tone.
  // To stop it: ledcWriteTone(PIEZO_PIN, 0);
}`,
    explanation: 'FREQUENCY_HZ selects the pitch, and ledcWriteTone() starts a square wave at that frequency. LEDC keeps producing it while the loop waits. A frequency of zero stops the tone. An active buzzer contains its own oscillator and generally cannot reproduce different notes in the same way.',
    specs: [spec('Output', 'GPIO25'), spec('Transducer', 'Small passive piezo'), spec('Starting frequency', '440 Hz · A4'), spec('Tone API', 'ledcWriteTone(pin, frequency)')],
    control: control('Frequency', 150, 2000, 10, 440, 'Hz'),
    challenge: 'Create a three-note melody using 262, 330 and 392 Hz with timed pauses. Then double each frequency to move the melody up an octave.',
    question: question('What happens when you double a musical note’s frequency?', ['It gets one octave higher', 'It becomes silent', 'Its pitch stays the same'], 0, 'An octave corresponds to a frequency ratio of two to one.')
  },
  {
    id: 'piano', title: 'Build a tiny piano', shortTitle: 'Mini piano', category: 'Projects', duration: '12 min', icon: 'piano',
    description: 'Combine eight buttons and a piezo to make a one-octave instrument. Each button selects a different note.',
    objectives: ['Store related pins and frequencies in arrays.', 'Scan several digital inputs.', 'Build a simple monophonic instrument.'],
    steps: ['Connect eight buttons between the listed GPIO pins and GND, using one input per button.', 'Connect a small passive piezo to GPIO25 through 100 Ω, with its other terminal at GND.', 'Run the demonstration and play the on-screen keys.', 'The hardware sketch plays the first pressed key in the array if several buttons are held together.'],
    wiring: [wire('GPIO13, 14, 16, 17', 'Buttons C, D, E, F → GND', 'Each pin uses INPUT_PULLUP.'), wire('GPIO18, 19, 21, 22', 'Buttons G, A, B, C5 → GND'), wire('GPIO25', '100 Ω → passive piezo → GND')],
    code: `const int keys[] = {13, 14, 16, 17, 18, 19, 21, 22};
const int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};
const int PIEZO = 25;

void setup() {
  for (int pin : keys) {
    pinMode(pin, INPUT_PULLUP);
  }
  ledcAttach(PIEZO, 2000, 8);
}

void loop() {
  int frequency = 0;
  for (int i = 0; i < 8; i++) {
    if (digitalRead(keys[i]) == LOW) {
      frequency = notes[i];
      break;
    }
  }
  ledcWriteTone(PIEZO, frequency);
  delay(10);
}`,
    explanation: 'The two arrays have matching positions: keys[0] selects notes[0]. Reading inputs in a loop avoids repeating the same logic eight times. This example plays one note at a time; it does not synthesize chords.',
    specs: [spec('Keys', '8 momentary buttons'), spec('Range', 'C4 to C5'), spec('Input polarity', 'Active LOW'), spec('Sound output', 'GPIO25')],
    control: control('Note', 0, 7, 1, 0, ''),
    challenge: 'Change the notes array to create a different scale without changing the button-reading logic.',
    question: question('What does the index 3 refer to in the notes array?', ['The third note', 'The fourth note', 'A frequency of 3 Hz'], 1, 'C++ arrays start at index zero, so index three is the fourth element.')
  },
  {
    id: 'motor', title: 'Control a motor', shortTitle: 'Drive a motor', category: 'Motion', duration: '12 min', icon: 'fan',
    description: 'A motor needs more current than a GPIO can supply. Let a MOSFET switch the motor power while the ESP32 controls the speed.',
    objectives: ['Separate control signals from motor power.', 'Use a flyback diode and common ground.', 'Adjust motor speed with PWM.'],
    steps: ['A worked small-motor example uses a 3 V DC motor with specified stall current no more than 300 mA, a 2×AA battery holder (about 3 V), an AO3400A MOSFET breakout with G/D/S labels, a 1N5819 Schottky diode, and 100 Ω plus 10 kΩ resistors. Other motors need parts and a supply matched to their own ratings.', 'Identify G (gate: the control terminal), D (drain: toward motor negative) and S (source: toward ground). Follow the breakout labels and the manufacturer’s pinout drawing, including its viewing direction; transistor leg order is not universal.', 'With power disconnected, connect motor positive to the battery holder positive and motor negative to D. Connect S to the battery holder negative and ESP32 GND. Keep the ESP32 powered through USB in this example.', 'Place the 1N5819 across the motor: its banded cathode goes to motor positive and its anode to motor negative/D. This flyback path handles winding current after switch-off.', 'Connect GPIO25 through 100 Ω to G and 10 kΩ from G to S/GND. Check all connections before applying motor power. An ordinary 5 V-gate MOSFET module is not automatically compatible with a 3.3 V GPIO.'],
    wiring: [wire('GPIO25', '100 Ω → MOSFET gate', '10 kΩ gate-to-GND pull-down.'), wire('MOSFET source', 'GND', 'Join motor-supply and ESP32 grounds.'), wire('MOSFET drain', 'Motor (−)'), wire('Rated external supply', 'Motor (+)', 'Flyback diode: cathode to +, anode to −.')],
    code: `const int MOTOR_PIN = 25;
const int DUTY = 140; // 0–255 at 8-bit resolution

void setup() {
  ledcAttach(MOTOR_PIN, 20000, 8);
  ledcWrite(MOTOR_PIN, DUTY);
}

void loop() {
  delay(1000); // LEDC maintains the selected drive duty.
  // To stop the motor: ledcWrite(MOTOR_PIN, 0);
}`,
    explanation: 'The MOSFET carries motor current; the GPIO only controls its gate. The diode gives inductive current a safe path when the transistor turns off. A real motor may not start at a low duty cycle, and this circuit controls speed in one direction only.',
    specs: [spec('Control output', 'GPIO25'), spec('PWM', '20 kHz, 8 bit'), spec('Worked motor example', '3 V, specified stall current ≤300 mA'), spec('Example motor power', '2×AA holder; ESP32 powered by USB'), spec('Example switch / diode', 'AO3400A breakout / 1N5819')],
    control: control('Motor duty cycle', 0, 100, 1, 55, '%'),
    challenge: 'Change the code to hold three speeds for two seconds each. Observe the lowest duty cycle at which your motor starts.',
    question: question('Why is a flyback diode placed across the motor?', ['To reverse the motor automatically', 'To handle the inductive voltage spike when switching off', 'To convert 3.3 V into 5 V'], 1, 'A motor winding stores energy. The diode provides a path for its current after the MOSFET switches off.')
  },
  {
    id: 'temperature', title: 'Read the room', shortTitle: 'Sense heat', category: 'Sensors', duration: '10 min', icon: 'thermometer',
    description: 'Read temperature and humidity from a DHT22. Learn how to use a sensor library and handle a failed measurement.',
    objectives: ['Install a sensor library.', 'Read temperature and relative humidity.', 'Check for invalid readings.'],
    steps: ['Install “DHT sensor library” by Adafruit and its Adafruit Unified Sensor dependency in Arduino Library Manager.', 'For a bare DHT22, connect pin 1 to 3V3, pin 2 (data) to GPIO27 and pin 4 to GND; pin 3 is unused. Confirm the pinout of your module.', 'Add a 10 kΩ pull-up between data and 3V3 if your module does not include one.', 'Run the demonstration and adjust the room temperature. Real DHT22 readings should be spaced at least two seconds apart.'],
    wiring: [wire('3V3', 'DHT22 VCC'), wire('GPIO27', 'DHT22 data', '10 kΩ pull-up to 3V3 for a bare sensor.'), wire('GND', 'DHT22 GND')],
    code: `// Install: DHT sensor library (Adafruit)
// Dependency: Adafruit Unified Sensor
#include <DHT.h>

DHT sensor(27, DHT22);

void setup() {
  Serial.begin(115200);
  sensor.begin();
}

void loop() {
  delay(2000);
  float temperature = sensor.readTemperature();
  float humidity = sensor.readHumidity();
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Sensor read failed");
    return;
  }
  Serial.printf("%.1f C | %.1f %% RH\\n", temperature, humidity);
}`,
    explanation: 'The library handles the sensor’s digital timing protocol. A failed reading returns NaN (“not a number”), so the sketch checks before using it. This is a slow environmental sensor rather than a fast temperature probe.',
    specs: [spec('Sensor', 'DHT22 / AM2302'), spec('Data pin', 'GPIO27'), spec('Supply in this circuit', '3.3 V'), spec('Read interval', 'At least 2 seconds')],
    control: control('Temperature', 5, 45, 0.5, 23.5, '°C'),
    challenge: 'Print “Getting warm” when the temperature rises above 28 °C, while still handling failed readings.',
    question: question('What should the program do when a sensor returns NaN?', ['Treat it as zero degrees', 'Detect the failed reading before using the value', 'Increase the supply voltage'], 1, 'NaN means the reading is invalid. Report or retry the failure instead of acting on a made-up value.')
  },
  {
    id: 'servo', title: 'Move with precision', shortTitle: 'Position a servo', category: 'Motion', duration: '10 min', icon: 'gauge',
    description: 'Tell a hobby servo where to turn. The width of a repeating pulse sets a target angle, while the servo handles the motion.',
    objectives: ['Understand servo control pulses.', 'Use a separate power supply for motion.', 'Set a target position with ESP32Servo.'],
    steps: ['Install a current version of ESP32Servo compatible with Arduino-ESP32 3.x.', 'Connect servo power to a suitable external regulated supply, typically 5 V for an SG90. Check the servo’s rating.', 'Connect servo signal to GPIO18 and join the servo supply ground to ESP32 GND.', 'Try different target positions. Start with a conservative 20–160° range and check the servo’s mechanical limits before expanding it.'],
    wiring: [wire('GPIO18', 'Servo signal', 'Often orange, yellow or white; check your servo.'), wire('External regulated 5 V', 'Servo V+'), wire('Supply GND', 'Servo GND + ESP32 GND', 'Never power a servo from a GPIO.')],
    code: `// Install: ESP32Servo (current 3.x-compatible version)
#include <ESP32Servo.h>

Servo arm;
const int TARGET_ANGLE = 90;

void setup() {
  arm.setPeriodHertz(50);
  arm.attach(18, 1000, 2000);
  arm.write(TARGET_ANGLE);
}

void loop() {
  delay(1000); // The servo keeps receiving its target pulses.
}`,
    explanation: 'A servo uses pulse width, commonly around 1–2 ms repeated at 50 Hz, to select its target position. The exact angle range varies by servo. Pulse width is different from the PWM duty cycle used to dim an LED.',
    specs: [spec('Signal', 'GPIO18'), spec('Control rate', '50 Hz'), spec('Configured pulses', '1000–2000 µs'), spec('Power', 'External supply with shared ground')],
    control: control('Target angle', 20, 160, 1, 90, '°'),
    challenge: 'Replace the fixed target with a slow sweep between 20° and 160°. Then use a potentiometer on GPIO34 to choose the target instead.',
    question: question('Which part of the control signal tells a hobby servo its target position?', ['The pulse width', 'The USB baud rate', 'The number of supply wires'], 0, 'The servo interprets the width of each control pulse as a requested position.')
  },
  {
    id: 'stepper', title: 'Take it one step at a time', shortTitle: 'Spin the wheel', category: 'Motion', duration: '12 min', icon: 'rotate',
    description: 'A stepper motor moves through a sequence of magnetic fields. Count steps to control a small geared motor’s rotation.',
    objectives: ['Drive a 28BYJ-48 through a ULN2003 board.', 'Sequence coils with the Stepper library.', 'Understand open-loop positioning.'],
    steps: ['Install the Arduino Stepper library if it is not already available.', 'Plug the 5 V 28BYJ-48 into its ULN2003 driver board.', 'Connect IN1, IN2, IN3 and IN4 to GPIO16, GPIO17, GPIO18 and GPIO19. Power the driver from a suitable 5 V supply and share ground.', 'Run the example to move once by the selected angle relative to its current starting position. Resetting or uploading runs setup() again and causes another relative move; this sketch does not find an absolute home position. The exact gearbox ratio varies between motors.'],
    wiring: [wire('GPIO16 / 17', 'ULN2003 IN1 / IN2'), wire('GPIO18 / 19', 'ULN2003 IN3 / IN4'), wire('External 5 V / GND', 'Driver + / −', 'Join driver ground to ESP32 ground.'), wire('Motor connector', 'ULN2003 motor socket')],
    code: `// Install: Stepper by Arduino
#include <Stepper.h>

const int STEPS_PER_TURN = 2048;
const int TARGET_DEGREES = 180;
// The 1-3-2-4 order matches this motor's coil sequence.
Stepper motor(STEPS_PER_TURN, 16, 18, 17, 19);

void setup() {
  motor.setSpeed(10);
  int steps = STEPS_PER_TURN * TARGET_DEGREES / 360;
  motor.step(steps);
}

void loop() {
  delay(1000); // No further steps; energized coils hold position.
}`,
    explanation: 'TARGET_DEGREES is converted to a relative step count and executed once in setup(). This four-step drive uses approximately 2048 steps per output revolution. Energized coils then hold position and draw current. The motor gives no position feedback; overload can cause missed steps. Disconnect motor power when the experiment is finished.',
    specs: [spec('Motor / driver', '5 V 28BYJ-48 / ULN2003'), spec('Example drive', 'Four-step sequence'), spec('Nominal steps/revolution', 'Approximately 2048'), spec('Example speed', '10 RPM')],
    control: control('Target rotation', 0, 360, 5, 180, '°'),
    challenge: 'Move approximately a quarter turn in each direction. Compare the final position after several cycles.',
    question: question('Does this stepper circuit know whether the motor actually completed a step?', ['Yes, it reads a built-in encoder', 'No, it commands steps without position feedback', 'Only when the motor is disconnected'], 1, 'This is open-loop control. If the motor stalls, the program’s step count can differ from the actual position.')
  },
  {
    id: 'plant', title: 'Give your plant a voice', shortTitle: 'Smart plant', category: 'Projects', duration: '15 min', icon: 'sprout',
    description: 'Combine an analog moisture sensor and an OLED display. Turn a calibrated reading into a simple watering reminder.',
    objectives: ['Connect an I²C OLED.', 'Calibrate a relative moisture scale.', 'Combine input, logic and a display.'],
    steps: ['Use a capacitive soil-moisture sensor rated for 3.3 V. Connect VCC to 3V3, GND to GND and analog output to GPIO34. Keep the sensor’s electronic components out of soil and water.', 'Upload the serial-only calibration sketch in Learn first; it works without an OLED. Open Serial Monitor at 115200 baud. Insert the probe to a repeatable depth in dry potting mix and record several stable raw readings.', 'Repeat in freshly watered, drained mix using the same depth. Record the stable wet reading. These two references describe your setup, not every possible soil. Replace DRY and WET in the combined sketch with your different measured values.', 'Connect a 3.3 V-compatible SSD1306 OLED: SDA (data) to GPIO21, SCL (clock) to GPIO22, VCC to 3V3 and GND to GND.', 'Run the I²C scanner in Learn with the OLED connected and read the detected address in Serial Monitor. A common address is 0x3C; if yours differs, use that address in display.begin().', 'Install Adafruit SSD1306 and Adafruit GFX Library, then upload the combined example with your calibration values and address. The display percentage is relative; check the real soil before deciding to water.'],
    wiring: [wire('3V3 / GND', 'Moisture sensor VCC / GND'), wire('Sensor analog out', 'GPIO34', 'Output must remain within the ESP32 input limits.'), wire('GPIO21 / GPIO22', 'OLED SDA / SCL'), wire('3V3 / GND', 'OLED VCC / GND', 'Use an OLED module compatible with 3.3 V.')],
    code: `// Install: Adafruit SSD1306 + Adafruit GFX Library
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);
const int SOIL = 34;
const int DRY = 3000; // Replace with your dry reading
const int WET = 1300; // Replace with your wet reading

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL, ADC_11db);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED initialization failed");
    while (true) delay(1000);
  }
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  int raw = analogRead(SOIL);
  int moisture = constrain(map(raw, DRY, WET, 0, 100), 0L, 100L);
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print(moisture); display.println("%");
  display.setTextSize(1);
  display.println(moisture < 30 ? "Check the soil" : "Looking good");
  display.display();
  Serial.printf("Raw: %d | Relative: %d%%\\n", raw, moisture);
  delay(1000);
}`,
    explanation: 'The percentage is a relative scale between your two calibration points, not a laboratory measurement of water content. Different soils and sensor placements need different calibration. A capacitive sensor avoids the exposed resistive electrodes that corrode quickly.',
    specs: [spec('Analog sensor', '3.3 V capacitive moisture probe'), spec('ADC', 'GPIO34 / ADC1'), spec('I²C bus', 'SDA21 / SCL22'), spec('OLED', 'SSD1306 128×64, usually 0x3C')],
    control: control('Relative soil moisture', 0, 100, 1, 55, '%'),
    challenge: 'Display three plant messages for dry, comfortable and very wet conditions.',
    question: question('What does the displayed moisture percentage represent?', ['An exact water-content measurement for any soil', 'A relative scale based on your dry and wet calibration', 'The battery level'], 1, 'The sketch maps two measured reference values to 0–100%. Soil type and sensor placement affect that scale.')
  },
  {
    id: 'force', title: 'Feel the pressure', shortTitle: 'Feel the force', category: 'Sensors', duration: '8 min', icon: 'fingerprint',
    description: 'A force-sensing resistor reacts to pressure. Read its changing resistance and turn it into a visual response.',
    objectives: ['Read an FSR with a voltage divider.', 'Distinguish a relative reading from a calibrated force.', 'Map pressure to LED brightness.'],
    steps: ['Connect the FSR between 3V3 and GPIO34.', 'Connect 10 kΩ between GPIO34 and GND.', 'Connect an LED from GPIO23 through 330 Ω to GND.', 'Run the demonstration and adjust the pressure. On hardware, press gently within your sensor’s rated limits.'],
    wiring: [wire('3V3', 'FSR → GPIO34'), wire('GPIO34', '10 kΩ → GND', 'Forms a voltage divider.'), wire('GPIO23', '330 Ω → LED → GND')],
    code: `const int FORCE_PIN = 34;
const int LED_PIN = 23;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(FORCE_PIN, ADC_11db);
  ledcAttach(LED_PIN, 5000, 8);
}

void loop() {
  int raw = analogRead(FORCE_PIN);
  int brightness = map(raw, 0, 4095, 0, 255);
  ledcWrite(LED_PIN, brightness);
  Serial.printf("Relative pressure: %d\\n", raw);
  delay(50);
}`,
    explanation: 'An FSR’s resistance generally falls as force increases. With this divider, the voltage at GPIO34 rises. The response is nonlinear and affected by contact area, so the sketch reports a relative value rather than claiming a force in newtons.',
    specs: [spec('Sensor', 'Force-sensing resistor'), spec('Divider resistor', '10 kΩ'), spec('ADC input', 'GPIO34'), spec('Output', 'GPIO23 PWM')],
    control: control('Applied pressure', 0, 100, 1, 35, '%'),
    challenge: 'Add a threshold that announces a press, then experiment with averaging several samples to reduce noise.',
    question: question('Can this uncalibrated FSR reading directly tell us the exact force in newtons?', ['Yes, raw ADC values are newtons', 'No, it needs calibration and has a nonlinear response', 'Yes, if we use a blue LED'], 1, 'FSRs are useful for detecting relative force. Accurate force measurement requires suitable calibration and often a different sensor.')
  },
  {
    id: 'wifi', title: 'Build your first connected project', shortTitle: 'Go wireless', category: 'Connected', duration: '15 min', icon: 'wifi',
    description: 'Let a phone control your LED. The ESP32 creates its own Wi-Fi network and serves a small web page, with no router required.',
    objectives: ['Create a Wi-Fi access point.', 'Serve a page with WebServer.', 'Connect a web request to a physical output.'],
    steps: ['Connect an external LED to GPIO23 through 330 Ω and then to GND.', 'Upload the sketch and open Serial Monitor at 115200 baud to see the access-point address.', 'Join the “ESP32-Lab” Wi-Fi network from your phone or computer. It has no internet connection; stay connected when the device asks.', 'Open http://192.168.4.1 in that device’s browser and tap the LED buttons. This website’s demo illustrates the interaction locally; it does not connect to a physical ESP32.'],
    wiring: [wire('GPIO23', '330 Ω → LED anode (+)'), wire('LED cathode (−)', 'GND'), wire('USB', 'Power + programming', 'Wireless control works after the sketch starts.')],
    code: `#include <WiFi.h>
#include <WebServer.h>

WebServer server(80);
const int LED = 23;

void page() {
  server.send(200, "text/html", R"HTML(
    <!doctype html><html lang="en">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ESP32 Lab</title>
    <body style="font:20px system-ui;padding:2rem">
    <h1>Hello from ESP32</h1>
    <p><a href="/on">Turn LED on</a></p>
    <p><a href="/off">Turn LED off</a></p>
    </body></html>
  )HTML");
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  digitalWrite(LED, LOW);
  WiFi.mode(WIFI_AP);
  WiFi.softAP("ESP32-Lab");
  Serial.println(WiFi.softAPIP());
  server.on("/", page);
  server.on("/on", []() { digitalWrite(LED, HIGH); page(); });
  server.on("/off", []() { digitalWrite(LED, LOW); page(); });
  server.begin();
}

void loop() {
  server.handleClient();
}`,
    explanation: 'The ESP32 acts as an access point and web server. Your browser requests /on or /off, and the corresponding handler changes GPIO23. This learning example creates an open local network. You can add an access-point password by passing a second argument of at least eight characters to WiFi.softAP().',
    specs: [spec('Network mode', 'SoftAP, 2.4 GHz'), spec('Network name', 'ESP32-Lab'), spec('Default local address', '192.168.4.1'), spec('Libraries', 'WiFi and WebServer, included with core')],
    control: null,
    challenge: 'Combine this lesson with the DHT22 on GPIO27: add a /temperature route showing the latest valid Celsius reading. Sample every two seconds with millis() instead of a blocking delay, so /on and /off stay responsive.',
    question: question('Does the phone need an internet connection to open the ESP32’s local page?', ['Yes, every web page needs the internet', 'No, it connects directly to the ESP32’s Wi-Fi network', 'Only if the LED is on'], 1, 'The phone and ESP32 communicate on a local Wi-Fi network. The ESP32 itself serves the page.')
  }
];

// Kept separate from the first-screen summaries so the UI can disclose teaching
// progressively: predict, interact, observe, then explain the result.
const learningNotes = {
  board: {
    interaction: 'Tap EN to restart the board. Explore a component to learn its purpose.',
    concepts: [
      { title: 'A computer for a physical job', text: 'A microcontroller repeatedly reads inputs, makes decisions and changes outputs. The ESP32 stores your sketch in flash memory, which survives a power cut. Its RAM holds temporary working values. Restarting clears that temporary state and begins the program again.' },
      { title: 'Power, voltage and a shared ground', text: 'Voltage is the electrical difference between two points. GND, or ground, is the circuit’s shared 0 V reference and a return path for current. USB brings 5 V to the board; its regulator creates 3.3 V. The 3V3 power pin can supply a suitable small device connected between 3V3 and GND. It is not a programmable signal output.' },
      { title: 'Signals and the program that controls them', text: 'GPIO means general-purpose input/output: a numbered pin your code can read or control. HIGH is about 3.3 V and LOW about 0 V relative to GND; never apply 5 V to an ESP32 GPIO. setup() runs once, then loop() repeats. This first sketch prints uptime through USB Serial at 115200 baud so you can see the program working.' }
    ],
    experiment: {
      prediction: 'If you restart the board, will the uploaded program disappear, or will only its running state start again?',
      action: 'Start the simulation, inspect the module and USB connector, then tap the board’s EN reset button. Compare the simulated restart with pressing EN after uploading the example to a real board.',
      observe: 'The board starts its demonstration again. On hardware, the welcome message appears again and uptime returns close to zero; you do not need to upload the sketch again.',
      why: 'EN resets the processor. The sketch remains in flash, while setup() and the temporary runtime state restart. BOOT serves a different purpose: it selects download mode when held during reset.'
    },
    troubleshooting: ['No serial port appears: use a data-capable USB cable, then check the USB-to-UART driver required by your exact board.', 'Serial text is unreadable: set the monitor to 115200 baud. If uploading remains at “Connecting”, hold BOOT until the transfer starts, then release it.'],
    takeaway: 'Trace the complete path: USB power → 3.3 V regulator → processor → GPIO. Your code starts in setup() and keeps working in loop().'
  },
  blink: {
    interaction: 'Tap the LED to change its blink interval.',
    concepts: [
      { title: 'Make a complete current path', text: 'Current flows from GPIO23 through the resistor and LED to GND when the pin is HIGH. The LED conducts in one direction, from anode to cathode. Reversing it usually leaves the LED dark even though the program is running correctly.' },
      { title: 'Choose current, not just voltage', text: 'Ω means ohms, the unit of resistance; 1 kΩ is 1000 Ω. Current is measured in amperes (A); 1 mA is one thousandth of an ampere. A red LED drops roughly 2 V. With a 3.3 V output and 330 Ω resistor, an estimate is (3.3 − 2.0) / 330 ≈ 0.004 A, or 4 mA. The actual current depends on the LED and pin voltage. Removing the resistor can damage the LED or GPIO.' },
      { title: 'Two delays make one cycle', text: 'digitalWrite() changes the output; delay() decides how long that state lasts. The example holds HIGH for 500 ms and LOW for 500 ms, making a one-second cycle: 1 Hz. delay() blocks this loop, which becomes limiting when a project must also watch buttons or handle requests.' }
    ],
    experiment: {
      prediction: 'If you double both the on and off intervals, does the LED blink twice as fast or half as fast?',
      action: 'Run the simulation and tap the LED to cycle through intervals. Use the slider to compare 250 ms with 1000 ms. To reproduce a setting on hardware, change INTERVAL_MS in the sketch and upload it.',
      observe: 'At 250 ms, one complete blink takes 500 ms. At 1000 ms, it takes two seconds. The on and off portions remain equal.',
      why: 'The full period is the on-time plus the off-time. Increasing both intervals increases the period and decreases the frequency. The simulation changes this timing parameter; it does not compile the displayed sketch.'
    },
    troubleshooting: ['The LED stays dark: power down, check its polarity and verify that the resistor and LED form a series path to GND.', 'The wrong LED blinks: this lesson uses an external LED on GPIO23. Built-in LEDs differ between ESP32 development boards.'],
    takeaway: 'An output needs both correct code and a complete, current-limited circuit. Blink frequency depends on the whole on/off cycle.'
  },
  button: {
    interaction: 'Hold the button down, then release it.',
    concepts: [
      { title: 'An open input needs a reference', text: 'An unconnected input can float and react to electrical noise. INPUT_PULLUP connects a weak internal resistor to 3.3 V so GPIO18 reads HIGH when the button is open. GPIO34–39 on the original ESP32 do not have these internal pull resistors.' },
      { title: 'Pressed can mean LOW', text: 'The button connects GPIO18 to GND when pressed. The pull-up is weak enough that the switch wins, giving a LOW input. The expression digitalRead(BUTTON_PIN) == LOW converts this electrical level into the useful idea “pressed”. The LED can then follow that boolean.' },
      { title: 'Read the decision in plain language', text: 'bool is a true-or-false value. The double equals sign, ==, compares two values; a single = stores a value. Here the comparison asks “is the input LOW?” and stores the answer in pressed. if (pressed) chooses the LED-on instructions; else chooses LED-off. Curly braces group each branch. A future toggle or press counter also needs debouncing because real switch contacts can bounce.' }
    ],
    experiment: {
      prediction: 'When the LED turns on, will the button’s input be HIGH or LOW?',
      action: 'Run the simulation, hold the 3D button and watch the input state and LED. Release it, then try several short presses. The panel button offers the same interaction.',
      observe: 'Holding the button makes GPIO18 read LOW and lights the LED. Releasing it returns the input to HIGH and turns the LED off.',
      why: 'The input level and the meaning of that level are separate. The circuit is active-low, and the comparison with LOW makes the pressed boolean true. digitalWrite() then drives the LED output HIGH.'
    },
    troubleshooting: ['The input always reads LOW: check that the button contacts are not permanently bridging GPIO18 and GND. Two legs on the same side of many four-leg buttons are already joined.', 'The input changes unpredictably: confirm INPUT_PULLUP and a shared ground. Do not substitute an input-only pin without adding an external pull resistor.'],
    takeaway: 'Define what released and pressed mean electrically before writing the condition. A pull resistor keeps an open switch from becoming an undefined input.'
  },
  potentiometer: {
    interaction: 'Drag the knob to change the input and LED brightness.',
    concepts: [
      { title: 'Position becomes voltage', text: 'The potentiometer is a continuous resistor with a movable contact called a wiper. Its outer terminals span 3V3 and GND. The wiper divides that voltage according to its position; it does not generate voltage by itself. Swapping the two outer connections reverses the direction.' },
      { title: 'Voltage becomes a number', text: 'ADC means analog-to-digital converter: it changes a voltage into a number. Twelve bits allow 2¹² = 4096 codes, from 0 to 4095. GPIO34 uses ADC1, one of the ESP32’s two converter units; this unit can read while Wi-Fi runs. The ADC_11db attenuation setting selects internal input scaling for a wider voltage range. It does not permit 5 V inputs. Real readings are nonlinear and may reach their limit before 3.3 V.' },
      { title: 'A number becomes brightness', text: 'Pulse-width modulation (PWM) repeatedly switches an output on and off. Duty cycle means the fraction of that time spent on. The ESP32’s LEDC hardware generates these pulses; ledcAttach(LED_PIN, 5000, 8) selects 5000 cycles per second and 8 bits, or 256 duty settings from 0 to 255. map() rescales the 0–4095 input to that output range, and ledcWrite() applies it. A higher duty generally appears brighter.' }
    ],
    experiment: {
      prediction: 'At the middle of the dial, would you expect an input near zero, near half-scale or near full-scale?',
      action: 'Start the simulation and drag the potentiometer from one end to the other. Pause near 25%, 50% and 75%, comparing the simulated ADC value and LED brightness.',
      observe: 'The idealized ADC reading rises toward 4095 as the dial rises. The LED brightens gradually rather than switching at a single threshold. Half-scale is approximately 2048.',
      why: 'The divider supplies a changing voltage. The ADC represents it as a number, and the mapping converts that number into PWM duty. A real ESP32 needs calibration for accurate voltage measurement; the raw value is useful for relative control.'
    },
    troubleshooting: ['The reading stays at one extreme: confirm that GPIO34 connects to the center wiper, with one outer terminal at 3V3 and the other at GND.', 'The LED behaves only as on/off: use ledcAttach()/ledcWrite() and the mapped 0–255 value. digitalWrite() cannot select intermediate duty cycles.'],
    takeaway: 'This is the core of many interactive devices: physical position → voltage → ADC number → output behavior.'
  },
  rgb: {
    interaction: 'Tap the RGB LED to mix another color, or drag to sweep the hue.',
    concepts: [
      { title: 'Add light to make color', text: 'An RGB LED contains three separate emitters. Red plus green makes yellow light; green plus blue makes cyan; blue plus red makes magenta. Combining all three can approach white. The exact appearance depends on the brightness and color of each emitter.' },
      { title: 'Three branches need three resistors', text: 'A common-cathode package joins the negative terminals, which connect to GND. Each anode still needs its own series resistor. Sharing one resistor makes the channels affect one another because their forward voltages differ. Confirm the package’s lead order rather than guessing from its shape.' },
      { title: 'Read the color function', text: 'Hue is an angle around the color wheel. The % operator gives a remainder, so the first line wraps angles into 0–359°; 360° becomes 0°. Integer division by 60 chooses one of six regions. hue % 60 gives progress inside it, producing rising and falling brightness values. switch chooses that region’s case, and break ends it. At 60°, region 1 uses rise = 0 and fall = 255: red 255 plus green 255 makes yellow, with blue zero.' }
    ],
    experiment: {
      prediction: 'Which two light colors would you combine to produce yellow?',
      action: 'Run the simulation and tap the RGB LED to cycle through colors. Drag it or use the hue slider to move through red, yellow, green, cyan, blue and magenta.',
      observe: 'One physical package produces multiple colors. A hue value describes the selected color around the color wheel; it is not a single GPIO brightness value.',
      why: 'The visible color comes from the relative brightness of three emitters. HUE_DEGREES and setHue() convert one color choice into three PWM values. Retain a separate resistor for every channel when reproducing it on hardware.'
    },
    troubleshooting: ['The wrong color appears: check the red, green and blue pin order against the LED datasheet and the GPIO assignments.', 'The controls seem inverted or the LED stays dark: verify that the LED is common-cathode. A common-anode part needs different wiring and inverted brightness control.'],
    takeaway: 'Color is the combination of three controlled outputs. A hue control is a convenient way to choose a set of red, green and blue brightness values.'
  },
  light: {
    interaction: 'Hold the light sensor to cover it; release to let the light back in.',
    concepts: [
      { title: 'Light changes resistance', text: 'An LDR becomes less resistive in brighter light. The ESP32 cannot directly read resistance, so the LDR and a 10 kΩ resistor form a divider. Here the LDR connects to 3V3 and the fixed resistor connects to GND, with GPIO34 at their junction.' },
      { title: 'Understand the direction', text: 'The junction voltage is approximately 3.3 × 10 kΩ / (LDR resistance + 10 kΩ). In bright light the LDR resistance falls and the voltage rises. Covering the sensor does the opposite. Reversing the divider parts reverses this relationship.' },
      { title: 'Choose a threshold from measurements', text: 'Read Serial Monitor with the real LDR covered and brightly lit. For example, covered = 400 and bright = 2000 give a midpoint of 1200. Put your chosen number in DARK_THRESHOLD near the top of the sketch, then upload again. light < DARK_THRESHOLD turns the LED on below that value. If readings flicker near it, use separate on/off thresholds, called hysteresis.' }
    ],
    experiment: {
      prediction: 'When you cover this sensor, should the ADC value rise or fall, and should the LED turn on or off?',
      action: 'Start the simulation at a bright ambient level. Hold the 3D LDR to cover it, then release it. Use the ambient-light slider to explore the region around the switching threshold.',
      observe: 'Covering the sensor lowers its simulated reading and turns the night-light on. Releasing it restores the ambient level. In the idealized demo, 1200 out of 4095 is about 29% of the input scale.',
      why: 'The higher dark resistance pulls less strongly toward 3.3 V, so the fixed resistor pulls the divider voltage lower. The code compares that number with a threshold; the number itself is not a calibrated lux measurement.'
    },
    troubleshooting: ['The LED turns on in bright light: check which divider part connects to 3V3. If you intentionally reversed them, reverse the comparison too.', 'The LED flickers near the threshold: average several samples or add separate on/off thresholds. Keep the sensor wiring short and its ground secure.'],
    takeaway: 'A sensor reading becomes useful when you know its direction and choose a decision threshold from measurements.'
  },
  distance: {
    interaction: 'Drag the obstacle closer to or farther from the sensor.',
    concepts: [
      { title: 'Measure time, infer distance', text: 'The ESP32 sends a 10 µs pulse to Trig. The HC-SR04 emits ultrasound and holds Echo HIGH for a time related to the round trip. At room temperature, sound travels about 0.0343 cm per microsecond. Divide by two because the sound travels out and back.' },
      { title: 'Keep the Echo voltage safe', text: 'A standard HC-SR04 runs at 5 V and produces a 5 V Echo output. The 2.2 kΩ upper and 3.3 kΩ lower resistors form a divider: 5 × 3.3 / (2.2 + 3.3) = 3.0 V. That level is suitable for the ESP32 input; a direct 5 V connection is not.' },
      { title: 'Missing data is not zero distance', text: 'pulseIn(ECHO, HIGH, 30000) waits at most 30,000 µs. If no valid pulse arrives, it returns zero and the sketch prints “No echo”. A soft, angled or distant object may fail to return a useful reflection. The program should handle that separately from a nearby obstacle.' }
    ],
    experiment: {
      prediction: 'If you move an obstacle from 20 cm to 40 cm, what should happen to the echo’s travel time?',
      action: 'Run the simulation and drag the obstacle across the scene. Compare 20 cm, 40 cm and 80 cm using the distance control, then look at the serial scenario readings.',
      observe: 'The reported distance follows the obstacle. Doubling the distance would approximately double the real echo duration: about 1166 µs at 20 cm and 2332 µs at 40 cm.',
      why: 'The speed of sound is approximately constant for the same conditions, so distance and travel time scale together. The browser illustrates this relationship; real measurements also depend on temperature, object shape and reflections.'
    },
    troubleshooting: ['Every reading says “No echo”: check the 5 V supply, common ground and Trig/Echo assignments. Confirm that your module accepts a 3.3 V trigger.', 'Readings jump or look implausible: aim at a flat hard surface within the sensor’s range, leave time between pings and verify the Echo divider wiring.'],
    takeaway: 'The sensor measures a round-trip time. Correct math, voltage conversion and a missing-echo case are all part of a useful distance reading.'
  },
  sound: {
    interaction: 'Tap the piezo to change pitch, or drag to tune it.',
    concepts: [
      { title: 'Frequency is how often a wave repeats', text: 'A 440 Hz signal repeats 440 times per second. A small passive piezo flexes with this changing voltage and produces sound. Raising the frequency raises the pitch. Doubling it raises the pitch by one octave; it does not simply mean twice the volume.' },
      { title: 'Choose the right sound component', text: 'A passive piezo needs a changing signal from the ESP32. An active buzzer has its own oscillator and often plays one built-in pitch when powered. A low-impedance speaker or high-current buzzer needs a driver; do not substitute one directly into this small-piezo circuit.' },
      { title: 'Configure once, then choose a pitch', text: 'ledcAttach(PIEZO_PIN, 2000, 8) first creates a PWM output with an initial 2000 Hz setting and 8-bit resolution. The next call, ledcWriteTone(PIEZO_PIN, FREQUENCY_HZ), changes it to the selected tone frequency; it is not limited to 2000 Hz. The peripheral keeps that tone running while loop() waits. Passing zero to ledcWriteTone() stops it.' }
    ],
    experiment: {
      prediction: 'How should 880 Hz sound compared with 440 Hz?',
      action: 'Enable Sound in settings, start the simulation and tap or drag the piezo to change its pitch. Compare 440 Hz and 880 Hz with the slider. With sound off, follow the displayed frequency.',
      observe: 'The higher frequency produces a higher pitch. The two test notes are one octave apart. Visual vibration is illustrative; it is slowed or simplified so you can see the response.',
      why: 'Your ear interprets vibration frequency as pitch. The browser produces an audible demonstration, while the hardware sketch drives a passive piezo with LEDC. Both use frequency as the control variable.'
    },
    troubleshooting: ['The browser is silent: enable Sound and start the simulation with a click or tap, which allows browser audio to begin.', 'The real buzzer plays only one pitch: confirm that it is a passive piezo, check GPIO25 and GND, and verify that your chosen device is suitable for this drive circuit.'],
    takeaway: 'Tone frequency controls pitch. Note duration controls rhythm. They are separate choices in your program.'
  },
  piano: {
    interaction: 'Hold a piano key to play it; release to stop the note.',
    mapping: [
      { key: 'C4', gpio: 'GPIO13', index: 0, frequency: '262 Hz' },
      { key: 'D4', gpio: 'GPIO14', index: 1, frequency: '294 Hz' },
      { key: 'E4', gpio: 'GPIO16 / RX2', index: 2, frequency: '330 Hz' },
      { key: 'F4', gpio: 'GPIO17 / TX2', index: 3, frequency: '349 Hz' },
      { key: 'G4', gpio: 'GPIO18', index: 4, frequency: '392 Hz' },
      { key: 'A4', gpio: 'GPIO19', index: 5, frequency: '440 Hz' },
      { key: 'B4', gpio: 'GPIO21', index: 6, frequency: '494 Hz' },
      { key: 'C5', gpio: 'GPIO22', index: 7, frequency: '523 Hz' }
    ],
    concepts: [
      { title: 'Arrays keep related values together', text: 'keys[] stores the eight GPIO numbers and notes[] stores their eight frequencies in matching order. Index zero selects the first key and 262 Hz; index seven selects the last key and 523 Hz. Changing the notes array changes the scale without rewriting the input logic.' },
      { title: 'Scan inputs and make one choice', text: 'The for loop checks each INPUT_PULLUP button for LOW. When it finds one, it saves the corresponding frequency and breaks out of the loop. That gives earlier keys priority if several are held. This is a monophonic instrument: it plays one note at a time.' },
      { title: 'Silence is also a state', text: 'Each pass starts with frequency = 0. If no button is pressed, that zero reaches ledcWriteTone() and stops the sound. Without an explicit released state, the last note could continue after the player lets go. The brief delay limits how often the loop repeats.' }
    ],
    experiment: {
      prediction: 'What must the program send to the piezo when you release the last pressed key?',
      action: 'Enable Sound, run the simulation and hold individual 3D piano keys. Release between notes, then play the first C and the higher C at the other end. The panel keys are an alternative.',
      observe: 'A held key selects its frequency, and releasing it stops the note. The upper C is approximately twice the frequency of the lower C, so they are an octave apart.',
      why: 'A key does not contain its own tone generator. The program maps its input to a number in the frequency array, then gives that number to one piezo output. Returning to zero creates silence.'
    },
    troubleshooting: ['A hardware note never stops: confirm the button becomes HIGH when released and that frequency is reset to zero on each loop.', 'The wrong key plays a note: check both arrays have the same order and that each button connects its assigned GPIO to GND, not to another input.'],
    takeaway: 'A useful input interface needs clear press, hold and release behavior. Arrays and loops let the same logic scale to many buttons.'
  },
  motor: {
    interaction: 'Drag the motor to adjust its drive duty cycle.',
    concepts: [
      { title: 'A GPIO gives instructions, not motor power', text: 'A MOSFET is a transistor used here as an electronic switch. Its gate (G) is the control input, drain (D) connects toward motor negative and source (S) toward ground. Read the exact package or breakout pinout rather than assuming a leg order. For the worked 3 V motor with stall current ≤300 mA, use a 2×AA holder, AO3400A G/D/S breakout and 1N5819 diode. The gate resistor is 100 Ω; the pull-down is 10 kΩ. The full connections are in the step guide.' },
      { title: 'Inductance keeps current moving', text: 'The motor winding stores energy in a magnetic field. Switching off suddenly can create a large voltage spike. The flyback diode provides a path for that current, with its cathode toward motor positive. Shared ground gives the GPIO gate signal a meaningful voltage reference.' },
      { title: 'Duty cycle controls average drive', text: 'At 20 kHz, LEDC switches the MOSFET thousands of times per second. DUTY stores the selected value; 128 out of 255 is about 50% on-time. ledcWrite() applies it and the peripheral maintains it. Real speed also depends on load, supply, friction and motor characteristics; duty percentage is not measured RPM.' }
    ],
    experiment: {
      prediction: 'Will a real motor necessarily spin at exactly half its maximum speed when PWM duty is 50%?',
      action: 'Start the simulation and drag the motor to change duty. Compare zero, a small duty and a high duty. Watch the direction stay the same while the illustrated speed changes.',
      observe: 'The model slows or stops as duty falls and speeds up as duty rises. The control reports PWM duty, not a measured shaft speed. A real motor may need a minimum duty to overcome friction and start.',
      why: 'PWM changes average electrical drive. It does not measure or guarantee speed. A tachometer or encoder and feedback controller are needed when a precise speed must be maintained under changing load.'
    },
    troubleshooting: ['The ESP32 resets when the motor starts: use a suitable separate motor supply, keep grounds joined, and check decoupling, wiring and stall-current requirements.', 'The motor or transistor gets hot: disconnect power and verify the MOSFET’s 3.3 V drive rating, diode orientation, motor load and component current ratings.'],
    takeaway: 'Use the GPIO as a control signal, protect the switching circuit and distinguish requested drive from measured motion.'
  },
  temperature: {
    interaction: 'Drag the temperature sensor to explore warmer and cooler conditions.',
    concepts: [
      { title: 'A digital sensor does the conversion', text: 'The DHT22 measures temperature and relative humidity internally and sends encoded data on one line. GPIO27 reads that digital communication; it is not measuring an analog voltage proportional to temperature. The DHT library handles the timing details.' },
      { title: 'Give the sensor time', text: 'The sketch waits at least two seconds between readings because a DHT22 is a slow environmental sensor. Polling faster does not create fresh information. A real sensor also takes time to reach the surrounding air temperature; changing the browser value is an accelerated illustration.' },
      { title: 'Check a value before using it', text: 'readTemperature() returns degrees Celsius by default; readHumidity() returns relative humidity in percent. A failed measurement can return NaN. isnan() catches that case before printing or making a control decision, so an error is not mistaken for zero degrees.' }
    ],
    experiment: {
      prediction: 'If a sensor read fails, would “0 °C” be a safe substitute for the missing value?',
      action: 'Run the simulation and drag the DHT22 to move between cooler and warmer conditions. Compare the temperature readout. Then examine the isnan() check in the example code.',
      observe: 'The simulated temperature changes with the environment control. The hardware code has a separate “Sensor read failed” path instead of pretending every read succeeds.',
      why: 'Measurements describe the world only when they are valid. Separating data from errors prevents a heater, alarm or display from reacting to a fabricated reading. Real changes and real sensor updates are slower than the guided demonstration.'
    },
    troubleshooting: ['The real sketch repeatedly reports a failed read: verify the exact sensor pinout, DHT22 type, common ground and a data pull-up to 3V3.', 'Values do not update immediately: allow at least two seconds between requests and time for the sensor to adjust to its environment. Avoid warming it by touching the electronics.'],
    takeaway: 'Useful sensing includes correct units, a suitable sampling interval and an explicit response to missing or invalid data.'
  },
  servo: {
    interaction: 'Drag the servo horn to choose a target angle.',
    concepts: [
      { title: 'Ask for a position', text: 'A hobby servo contains a motor, gears, a position sensor and a controller. The ESP32 requests a target by sending pulses; the servo’s internal controller moves toward it. This is different from directly switching a bare DC motor, which has no built-in position control.' },
      { title: 'Pulse width has a specific meaning', text: 'The example uses a 50 Hz frame, or one pulse every 20 ms, with configured widths from 1000 to 2000 µs. The library maps write(angle) into that pulse range. Unlike LED dimming, this signal communicates a position rather than directly setting average motor power.' },
      { title: 'A target is not a measurement', text: 'The ESP32 sketch does not receive the servo’s actual angle. It only sends a requested position, and the physical angle depends on the servo and calibration. A separate supply handles movement current. Trying a conservative range protects against driving the mechanism into its stops.' }
    ],
    experiment: {
      prediction: 'If you ask for 90°, does the ESP32 automatically know that the horn actually reached 90°?',
      action: 'Run the simulation and drag the servo horn from one target to another. Compare 20°, 90° and 160° with the target-angle control.',
      observe: 'The illustrated horn follows the requested angle. The readout describes the target, not a sensor measurement sent back to the ESP32. A real servo may move more slowly or stop short under load.',
      why: 'The servo closes its own internal position loop, but the three-wire interface used here does not send actual position back to your sketch. Mechanical calibration is still necessary for precise positioning.'
    },
    troubleshooting: ['The board resets or the servo jitters: use a correctly rated external supply and a secure shared ground. A servo should not draw its movement current from a GPIO or the 3V3 rail.', 'The horn buzzes against a stop: remove power and reduce the angle or pulse-width range. Check the particular servo’s limits before expanding the sweep.'],
    takeaway: 'Servo control sends a target through pulse width. Safe power and calibrated mechanical limits matter as much as the requested angle.'
  },
  stepper: {
    interaction: 'Tap the stepper to advance the target by 45°, or drag to choose it.',
    concepts: [
      { title: 'Rotate a magnetic pattern', text: 'The ULN2003 driver switches the motor’s coils in a sequence that pulls the rotor from one position to the next. The ESP32 supplies four control signals while an external supply provides coil power. The library’s 16, 18, 17, 19 order matches the sequence for this wiring.' },
      { title: 'Turn steps into an angle', text: 'The 28BYJ-48’s gears reduce a fast internal rotation to a slower output. In this four-step example, 2048 steps approximate one output revolution, so about 512 make a quarter turn. Actual gear ratios vary. Half-step control would use a different number of steps per revolution.' },
      { title: 'Count commands with care', text: 'TARGET_DEGREES becomes a step count that motor.step() executes once in setup(). This is a relative move from the current starting position. Every reset or upload runs setup() again, causing another move; the sketch has no home reference. The coils stay energized afterward. Without position feedback, the program cannot detect a stall or missed step.' }
    ],
    experiment: {
      prediction: 'Using the example’s 2048-step model, approximately how many steps make a 90° turn?',
      action: 'Run the simulation and tap the stepper to advance its target in 45° increments. Use dragging or the slider to compare a quarter turn, half turn and full turn.',
      observe: 'The target angle progresses in a controlled direction. In the example’s model, 90° corresponds to about 512 steps and 180° to about 1024. The angle control changes a target, not a speed.',
      why: 'The software translates desired rotation into a sequence of steps. Counting works only while the motor follows that sequence; a real mechanism needs sufficient torque and, when necessary, a home switch or position feedback.'
    },
    troubleshooting: ['The motor vibrates without turning: verify IN1–IN4 wiring and the library’s 1-3-2-4 constructor order. Also check the motor and supply voltage match.', 'The final position drifts: reduce speed or load and check the real gearbox ratio. The sketch cannot detect missed steps by itself.'],
    takeaway: 'Stepper positioning is a sequence of counted commands. It becomes reliable when the motor can follow them and the mechanism has a known reference.'
  },
  plant: {
    interaction: 'Tap the soil or display to change the simulated moisture level.',
    snippets: [
      {
        title: '1. Read the soil sensor without an OLED',
        description: 'Upload this first and open Serial Monitor at 115200 baud. Record several stable readings in dry mix, then in watered, drained mix at the same probe depth. Use your two reference values as DRY and WET in the combined project. Keep the sensor electronics dry.',
        code: `// No OLED or display libraries are needed for calibration.
const int SOIL_PIN = 34;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
}

void loop() {
  int raw = analogRead(SOIL_PIN);
  Serial.print("Soil raw reading: ");
  Serial.println(raw);
  delay(500);
}`
      },
      {
        title: '2. Find the OLED’s I²C address',
        description: 'Connect the OLED’s power, ground, SDA21 and SCL22, then upload this sketch. Open Serial Monitor at 115200 baud and press EN. With only the OLED on the I²C bus, use its reported address in display.begin(). An acknowledged address confirms communication, not that a different display chip is SSD1306-compatible.',
        code: `#include <Wire.h>

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(21, 22);
  Serial.println("Scanning I2C addresses...");
  bool found = false;
  for (uint8_t address = 0x08; address <= 0x77; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Device at 0x%02X\\n", address);
      found = true;
    }
  }
  if (!found) {
    Serial.println("No devices replied. Check power and wiring.");
  }
}

void loop() {
  delay(1000); // Press EN to scan again.
}`
      }
    ],
    concepts: [
      { title: 'Calibrate before adding the display', text: 'Use the serial-only calibration sketch below before running the combined project. At the same insertion depth, record stable readings in dry potting mix and freshly watered, drained mix. Put those different values into DRY and WET. The example’s 3000 and 1300 are placeholders, not measurements of your probe. This separate sketch works even if the OLED is absent or fails to initialize.' },
      { title: 'Map, constrain, decide', text: 'map(raw, DRY, WET, 0, 100) translates the two reference readings into a relative percentage. constrain() limits values outside that interval to 0–100. Below 30%, the example asks you to check the soil. This percentage is not an absolute measurement of water content or a universal watering rule.' },
      { title: 'Address the screen, then send the picture', text: 'I²C means Inter-Integrated Circuit, a shared two-signal communication bus. SDA carries data on GPIO21; SCL carries its clock on GPIO22. 0x3C is a device address written in hexadecimal, not a pin number. The scanner below checks which address responds. clearDisplay(), setCursor() and print() draw into a memory buffer; display.display() sends that finished buffer to the OLED.' }
    ],
    experiment: {
      prediction: 'With DRY = 3000 and WET = 1300, should a falling raw reading make the displayed moisture percentage rise or fall?',
      action: 'Run the simulation and tap the soil or OLED to step through simulated moisture levels. Use the slider to compare 20%, 30% and 70%. This control changes a model value, not an instant physical watering process.',
      observe: 'The relative percentage rises as the simulated soil gets wetter. Below 30% the reminder asks you to check the soil; at 30% and above the example’s message changes.',
      why: 'The mapping reverses the numerical direction because the dry reference is greater than the wet reference. The message uses a simple threshold on that calibrated scale. Real watering decisions need the plant, soil and sensor placement to be considered together.'
    },
    troubleshooting: ['The percentage is reversed or pinned at an endpoint: record actual raw dry/wet values, replace both constants and make sure DRY and WET are different.', 'The OLED stays blank: verify 3.3 V compatibility, SDA/SCL wiring, the I²C address and the final display.display() call. Keep the moisture probe’s electronics out of water.'],
    takeaway: 'A meaningful dashboard starts with calibration, then converts the reading into a clearly labeled relative value and a useful decision.'
  },
  force: {
    interaction: 'Hold the force pad to apply pressure; release to remove it.',
    concepts: [
      { title: 'Pressure changes the current path', text: 'The FSR’s resistance falls when you press its sensing area. Connected above a 10 kΩ resistor in a divider, it pulls GPIO34 closer to 3.3 V as force increases. The ESP32 observes this voltage change, not mechanical force directly.' },
      { title: 'Relative is not calibrated', text: 'An FSR is nonlinear and responds differently depending on contact area, mounting and previous loading. A raw ADC number cannot be labeled as newtons without a suitable calibration model. This lesson deliberately uses relative pressure and LED brightness to show the trend.' },
      { title: 'Choose a useful response', text: 'The sketch maps the 12-bit input range to 8-bit PWM, so a higher reading creates a brighter LED. For a simple press detector, a threshold may be more useful than a continuous brightness value. Averaging several samples can reduce noise, at the cost of a slightly slower response.' }
    ],
    experiment: {
      prediction: 'When you release the pad, should the divider reading stay high or move back toward its unpressed level?',
      action: 'Start the simulation and hold the 3D force pad, then release it. Drag while pressing or use the pressure control to explore different input levels.',
      observe: 'Applying pressure raises the illustrated input and brightens the LED. Releasing the pad removes the simulated force and returns it toward zero. The values remain relative rather than a claim of measured newtons.',
      why: 'Pressure lowers the upper divider resistance, raising the ADC voltage. Releasing reverses the process. The LED is an output representation of the input trend, not a calibrated force meter.'
    },
    troubleshooting: ['The reading never changes: check that the FSR and 10 kΩ resistor form a divider with GPIO34 at their junction, rather than placing the input directly at a supply rail.', 'Readings vary between presses: use a consistent contact surface and mounting, then consider averaging. Keep force within the sensor’s rating.'],
    takeaway: 'A sensor can be useful without pretending to be precise. Label relative measurements honestly and choose the response your application needs.'
  },
  wifi: {
    interaction: 'Tap the connected LED to send a virtual on/off request.',
    concepts: [
      { title: 'The board can create the network', text: 'In station mode, a device joins an existing Wi-Fi network. This example instead uses access-point mode: WiFi.softAP("ESP32-Lab") creates a local network your phone can join. The ESP32 normally takes the local address 192.168.4.1. Internet access is not required.' },
      { title: 'A request becomes an output', text: 'WebServer listens on HTTP port 80. A request for / displays the page; /on drives GPIO23 HIGH and /off drives it LOW. The page’s links send these requests. The browser does not directly change a pin: the ESP32’s request handler makes that electrical change.' },
      { title: 'Keep the server responsive', text: 'server.handleClient() runs repeatedly inside loop() to process arriving requests. Long blocking delays would make the page slow to respond. The sample network is open for a local learning exercise; a second softAP() argument of at least eight characters adds a network password.' }
    ],
    experiment: {
      prediction: 'Could a phone control this LED while the ESP32’s Wi-Fi network has no connection to the internet?',
      action: 'Run the browser simulation and tap the LED or use its on/off control. To try the real network, upload the sketch, join ESP32-Lab from your phone and open http://192.168.4.1.',
      observe: 'Each virtual request changes the demonstrated LED state. On a real board, the phone requests /on or /off from the ESP32 and the corresponding handler changes GPIO23. The website itself does not connect to your hardware.',
      why: 'The entire exchange can stay on a local network: phone → HTTP request → ESP32 handler → GPIO output. The browser lesson illustrates that path; the uploaded sketch is what creates the actual access point and server.'
    },
    troubleshooting: ['The phone leaves ESP32-Lab automatically: choose to stay on the network even though it has no internet, then use the numeric local address.', 'The page does not load or respond: confirm the address printed by Serial, use http:// rather than https://, and keep server.handleClient() running without long blocking work.'],
    takeaway: 'A connected project still follows the same pattern: input, decision, output. Here the input arrives as a network request instead of a physical button.'
  }
};
for (const lesson of lessons) {
  const { interaction, ...learning } = learningNotes[lesson.id];
  lesson.interaction = interaction;
  lesson.learning = learning;
}

const part = (name, kicker, description, facts, tip) => ({ name, kicker, description, facts, tip });
export const parts = {
  module: part('ESP32-WROOM-32', 'THE BRAIN', 'Inside this shield are the ESP32 processor, flash memory and radio circuitry. Your program runs here and controls the pins around the board.', [spec('CPU', 'Dual-core Xtensa LX6'), spec('Clock', 'Up to 240 MHz'), spec('SRAM', '520 KB on-chip'), spec('Typical module flash', '4 MB')], 'This course uses the original ESP32. ESP32-C3, S3 and other family members have different capabilities and pinouts.'),
  antenna: part('PCB antenna', 'THE WIRELESS CONNECTION', 'The patterned copper at the end of the module transmits and receives 2.4 GHz radio signals for Wi-Fi and Bluetooth.', [spec('Wi-Fi', '802.11 b/g/n, 2.4 GHz'), spec('Bluetooth', 'Classic + Bluetooth Low Energy')], 'Keep metal, wires and enclosures away from the antenna end when possible to improve radio performance.'),
  usb: part('Micro-USB connector', 'POWER + PROGRAMMING', 'USB powers the development board and carries serial data through the USB-to-UART bridge. This original ESP32 module does not have native USB.', [spec('USB input', '5 V'), spec('Data path', 'USB-to-UART bridge'), spec('Typical bridge', 'CP2102 or CH340, varies by board')], 'A charge-only cable supplies power but cannot upload code. Use a cable that supports data.'),
  regulator: part('3.3 V regulator', 'STEADY POWER', 'The regulator converts the board’s 5 V supply into the 3.3 V rail used by the ESP32 and suitable peripherals.', [spec('Board logic', '3.3 V'), spec('GPIO tolerance', 'Not 5 V tolerant')], 'Power-hungry motors and servos need an appropriate separate supply with a common ground.'),
  en: part('EN / reset button', 'START AGAIN', 'Pressing EN pulls the enable line low and resets the processor. Your sketch starts again when you release it.', [spec('Signal', 'Chip enable / reset'), spec('Effect', 'Restarts setup()')], 'Resetting the board does not erase the uploaded program.'),
  boot: part('BOOT button', 'UPLOAD MODE', 'BOOT connects GPIO0 to ground. Holding it during reset selects the serial download mode used to upload firmware.', [spec('Pin', 'GPIO0'), spec('Role', 'Boot-strapping input')], 'If uploading stays at “Connecting”, hold BOOT until the upload begins, then release it.'),
  power: part('Power pins', 'SUPPLY + GROUND', '3V3 supplies the board’s regulated logic voltage. GND is the common electrical reference. VIN/5V labeling and power routing vary between DevKit clones.', [spec('Peripheral logic rail', '3.3 V'), spec('Ground', 'Shared by connected circuits')], 'Check your exact board schematic before using VIN or combining external power with USB. Never apply 5 V to a GPIO.'),
  gpio: part('General-purpose I/O', 'THE CONNECTIONS', 'GPIO pins read inputs and control outputs. Some can also carry PWM, analog input, I²C, SPI or UART signals.', [spec('Logic', '0 V / 3.3 V'), spec('GPIO34–39', 'Input-only; no internal pull resistors'), spec('GPIO6–11', 'Used by module flash'), spec('ADC1', 'Suitable for analog reads alongside Wi-Fi')], 'Avoid boot-strapping pins for beginner circuits. GPIO16 and 17 are available on this WROOM board, but may be reserved on other modules.'),
  led: part('LED + resistor', 'A VISIBLE OUTPUT', 'A light-emitting diode glows when current flows from its anode to its cathode. The series resistor keeps the current within a safe range.', [spec('Example pin', 'GPIO23'), spec('Series resistor', '330 Ω'), spec('Anode', 'Usually longer lead'), spec('Cathode', 'Usually shorter lead / flat edge')], 'The resistor may be placed on either side of the LED as long as it is in series.'),
  button: part('Momentary push button', 'A DIGITAL INPUT', 'Pressing the button joins its switched contacts. With INPUT_PULLUP and a connection to ground, a press reads LOW.', [spec('Example input', 'GPIO18'), spec('Released', 'HIGH'), spec('Pressed', 'LOW')], 'Mechanical switches bounce. Add debouncing before using a button as a counter or toggle.'),
  potentiometer: part('Potentiometer', 'AN ADJUSTABLE DIVIDER', 'A rotating wiper moves along a resistive track. With 3V3 and GND on the outer terminals, the center terminal provides an adjustable voltage.', [spec('Typical resistance', '10 kΩ'), spec('Wiper input', 'GPIO34 / ADC1'), spec('Read resolution', '12 bit')], 'Use 3.3 V, not 5 V, for the divider connected to the ESP32 ADC.'),
  rgb: part('RGB LED', 'THREE COLORS, ONE PACKAGE', 'Separate red, green and blue emitters can be mixed using PWM. This example uses a common-cathode LED.', [spec('Outputs', 'GPIO25 / 26 / 27'), spec('Resistors', 'One per color'), spec('Common connection', 'GND')], 'Check the LED’s datasheet for pin order. A common-anode LED requires different wiring and inverted control.'),
  ldr: part('Light-dependent resistor', 'LIGHT TO RESISTANCE', 'The resistance of an LDR falls as illumination increases. A fixed resistor turns that resistance change into a measurable voltage.', [spec('ADC', 'GPIO34'), spec('Divider resistor', '10 kΩ'), spec('Measurement', 'Relative light level')], 'Raw ADC values are not lux. Calibrate the switching threshold in the room where the circuit will be used.'),
  distance: part('HC-SR04 distance sensor', 'LISTEN FOR THE ECHO', 'One transducer sends ultrasound; the other listens for its reflection. The time between them reveals the distance to an object.', [spec('Standard module supply', '5 V'), spec('Trig / Echo', 'GPIO23 / GPIO34'), spec('Echo divider', '2.2 kΩ + 3.3 kΩ')], 'A standard HC-SR04 outputs a 5 V Echo signal. Use the divider shown in this lesson before connecting it to the ESP32.'),
  buzzer: part('Passive piezo', 'VOLTAGE INTO SOUND', 'A piezo element flexes as its voltage changes. Repeating that motion at an audible frequency produces a tone.', [spec('Output', 'GPIO25'), spec('Pitch', 'Set by frequency'), spec('Driver API', 'ledcWriteTone()')], 'A small passive piezo can use this circuit. A speaker or higher-current buzzer needs a suitable driver.'),
  motor: part('DC motor + MOSFET', 'CONTROLLED MOTION', 'A transistor switches the motor’s external supply. The GPIO controls the transistor; it does not carry the motor current.', [spec('Control', 'GPIO25 PWM'), spec('Driver', '3.3 V logic-level N-MOSFET'), spec('Protection', 'Flyback diode')], 'Join the motor supply’s ground to ESP32 ground. Check the motor’s stall current when choosing the supply, transistor and diode.'),
  temperature: part('DHT22 environmental sensor', 'READ THE ROOM', 'The DHT22 reports temperature and relative humidity over a digital data line. A library handles its timing-sensitive communication.', [spec('Data', 'GPIO27'), spec('Supply here', '3.3 V'), spec('Read interval', 'At least 2 seconds')], 'A bare sensor needs a pull-up on its data line. Many breakout modules already include one.'),
  servo: part('Hobby servo', 'POSITION ON COMMAND', 'A servo contains a motor, gears and feedback electronics. A repeating control pulse tells it the desired position.', [spec('Signal', 'GPIO18'), spec('Pulse repetition', '50 Hz'), spec('Power', 'External regulated supply')], 'Do not force the horn or command beyond the mechanism’s limits. Actual angle ranges vary between servos.'),
  stepper: part('28BYJ-48 + ULN2003', 'COUNT THE STEPS', 'The driver energizes motor coils in sequence. Gearing turns the small internal steps into slower output-shaft movement.', [spec('Inputs', 'GPIO16 / 17 / 18 / 19'), spec('Motor version', '5 V'), spec('Four-step revolution', 'Approximately 2048 steps')], 'The sketch counts requested steps; it cannot detect a stalled motor without extra feedback.'),
  oled: part('SSD1306 OLED display', 'A SMALL WINDOW INTO YOUR CODE', 'This 128×64 display uses an I²C bus, so only two data wires are needed to draw text and simple graphics.', [spec('SDA', 'GPIO21'), spec('SCL', 'GPIO22'), spec('Common address', '0x3C'), spec('Supply here', '3.3 V-compatible module')], 'If the screen stays blank, verify its I²C address and call display.display() after drawing.'),
  fsr: part('Force-sensing resistor', 'A SENSE OF TOUCH', 'Pressing the pad reduces its resistance. A voltage divider lets the ESP32 detect how strongly it is being pressed.', [spec('Input', 'GPIO34 / ADC1'), spec('Divider resistor', '10 kΩ'), spec('Output', 'Relative pressure')], 'The response is nonlinear and depends on contact area. Do not label an uncalibrated ADC value as a force in newtons.'),
  wifi: part('Wi-Fi access point', 'YOUR BOARD, YOUR NETWORK', 'The ESP32 can create a local Wi-Fi network and serve a web page. A phone connected to that network can send requests to the board.', [spec('Network', 'ESP32-Lab'), spec('Default address', '192.168.4.1'), spec('Radio band', '2.4 GHz')], 'The browser lesson is a local scenario demonstration. Upload the sketch to a physical board to use the actual Wi-Fi network.')
};
