# ESP32 Field Lab

An interactive, browser-based classroom for the original 30-pin ESP32 DevKit V1 with ESP32-WROOM-32. Explore a 3D board, operate components, and follow 16 English lessons from your desktop or phone.

**[Open the lab](https://ardchain.github.io/esp32-field-lab/)**

![ESP32 Field Lab with a guided GND connection view](docs/preview.png)

- Procedural 3D board and component models, with hover and tap inspection.
- Direct interaction: hold a button, turn a knob, cover a light sensor, play piano keys or move a servo.
- 68 visual connection steps: the camera frames each part and highlights exact pins and resistor values. Every Pinout row opens its matching explanation.
- Electrical diagrams, a breadboard primer, Arduino examples, experiments and knowledge checks.
- Saved progress on your current browser; no account or backend required.
- A desktop workbench that fits the window, with scrolling inside the lesson panel; touch controls and page scrolling on phones.
- Keyboard navigation and reduced-motion support.

## Lessons

Board basics · LED blink · Button · Potentiometer · RGB LED · Light sensor · Ultrasonic distance · Piezo sound · Mini piano · DC motor · Temperature · Servo · Stepper motor · Plant monitor · Force sensor · Wi-Fi

## Run locally

The site is plain HTML, CSS and JavaScript. Three.js and fonts are bundled locally; there is no build step.

```sh
git clone https://github.com/ardchain/esp32-field-lab.git
cd esp32-field-lab
python3 -m http.server 4173 -d dist
```

Open <http://localhost:4173>. Serve the files over HTTP rather than opening `index.html` directly, because the application uses JavaScript modules.

## Controls

Drag empty space to rotate horizontally. Scroll or pinch to zoom. Hover or tap a passive part to inspect it, or use the component library. Operate interactive parts using the hint above the scene; the demonstration starts automatically. Shift/Alt-click an interactive part to inspect it.

Choose **Show the connections**, or select a **Pinout** row, for a guided close-up. Running the simulation or taking manual control of the camera returns to free exploration. Labels are off by default.

- **Space:** run or stop the demonstration.
- **R:** reset the camera.
- **[ / ]:** previous or next lesson.
- **Escape:** close a panel.

## Project structure

| Path | Purpose |
| --- | --- |
| `dist/index.html` | Application shell |
| `dist/app.js` | Navigation, lesson panels, controls, quizzes and progress |
| `dist/scene.js` | Procedural 3D models, camera, highlights and interactions |
| `dist/lessons.js` | Lesson content, Arduino sketches and component reference |
| `dist/guides.js` | Step-by-step visual connection tours |
| `dist/diagrams.js` | Circuit diagrams and breadboard connectivity |
| `dist/style.css`, `dist/guide.css` | Responsive layout and styles |
| `tests/` | Browser regression checks |

## Checks

Node.js 20 or later is needed for the development checks. Python 3 is only needed for the local server above.

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm test
```

The browser checks cover all lessons, direct device interactions, visual-guide targets, navigation, camera bounds, quizzes, stored progress and narrow layouts. They inject observation helpers into the served test response; production has no test globals. Tests start local servers on ports 4181, 4184 and 4185. Screenshots and reports go into temporary directories, or a directory set with `QA_OUTPUT`.

To use an already-installed Chromium, set `CHROMIUM_EXECUTABLE` to its executable path before running the tests.

## Deploy

The included GitHub Actions workflow publishes `dist/` to GitHub Pages whenever `main` changes. In the repository's **Settings → Pages**, choose **GitHub Actions** as the source. Assets use relative paths, so the site also works at a project URL such as `/esp32-field-lab/`.

You can serve `dist/` with any static host, including Vercel, Netlify or a conventional web server.

## Simulation and hardware

The browser runs interactive lesson demonstrations. It does not compile C++, emulate an ESP32 CPU, or connect to a physical board. The output monitor reports the demonstration state. Six output controls update constants in the downloadable examples; sensor controls change simulated conditions.

Arduino examples target Arduino-ESP32 3.x and the original ESP32-WROOM-32. Library-dependent sketches and physical wiring should be verified on the intended board; other ESP32 variants have different pins and features. GPIO uses 3.3 V and is not 5 V tolerant. The 3D scenes illustrate the setup; the wiring tables and electrical diagrams describe the intended connections.

Progress and preferences use localStorage. They stay in the same browser and site origin and do not sync between devices or domains.

## License

Original application code, lesson content and artwork are available under the [MIT License](LICENSE).

Bundled dependencies retain their own notices:

- [Three.js r170 — MIT](dist/vendor/THREE-LICENSE.txt)
- [DM Sans — SIL Open Font License](dist/fonts/DM-Sans-OFL.txt)
- [JetBrains Mono — SIL Open Font License](dist/fonts/JetBrains-Mono-OFL.txt)
- [Space Grotesk — SIL Open Font License](dist/fonts/Space-Grotesk-OFL.txt)

The interactive lesson format was inspired by [Learn Arduino](https://learn-arduino-red.vercel.app/). This project uses its own interface, content and procedural 3D models.
