// Run with: node tests/guides.cjs
// Uses the built site, a local server on 4184, and test-only scene observation.
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist');
const out = process.env.QA_OUTPUT || '/tmp/esp32-guides-qa';
const origin = 'http://127.0.0.1:4184';
fs.mkdirSync(out, {recursive: true});
const server = http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0])); }
  catch { res.writeHead(400); res.end(); return; }
  if (file !== root && !file.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  if (file === root) file += '/index.html';
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});

// Observe actual geometry, not just the public data attributes. No production
// file is changed and none of these helpers performs a scene action.
const instrumentation = `
  globalThis.__guideScene = {
    state: () => ({lesson, value, running, pressed, yaw: rotation,
      focused: !!focusState, transitioning: !!transition,
      highlightCount: focusLayer.children.length,
      focus: focusState ? {resolved: [...focusState.resolved], view: focusState.view,
        units: focusState.units.map(u => ({token: u.token,
          min: u.box.min.toArray(), max: u.box.max.toArray()}))} : null}),
    points: part => {
      world.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const r = renderer.domElement.getBoundingClientRect(), found = [];
      for (const o of meshes) {
        if (o.userData.part !== part) continue;
        o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
        for (const f of [[.5,.5,.5],[.5,1,.5],[0,.5,.5],[1,.5,.5],[.5,.5,0],[.5,.5,1]]) {
          const q = new THREE.Vector3(
            b.min.x+(b.max.x-b.min.x)*f[0],
            b.min.y+(b.max.y-b.min.y)*f[1],
            b.min.z+(b.max.z-b.min.z)*f[2]).applyMatrix4(o.matrixWorld).project(camera);
          const x = r.x+(q.x+1)*r.width/2, y = r.y+(1-q.y)*r.height/2;
          if (x < r.left+4 || x > r.right-4 || y < r.top+4 || y > r.bottom-4) continue;
          const h = hit({clientX:x,clientY:y});
          if (h?.object.userData.part === part) found.push({x,y,part});
        }
      }
      return found;
    }
  };
`;

async function instrument(context) {
  await context.route('**/scene.js', async route => {
    const source = fs.readFileSync(path.join(root, 'scene.js'), 'utf8');
    const anchor = "  externalSetup('board');resize();";
    assert.equal(source.split(anchor).length, 2, 'Scene observation hook has one insertion point');
    await route.fulfill({contentType: 'text/javascript', body: source.replace(anchor, instrumentation + anchor)});
  });
}

const errors = [], warnings = [], missingTargets = [], screenshots = [];
const coverage = {lessons: 0, steps: 0, pinoutRows: 0, widths: [], dismissals: []};
let currentCheck = 'start', activePage;
function collect(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon')) errors.push(text);
    if (message.type() === 'warning') {
      warnings.push(text);
      if (/missing\s+guide\s+targets|unresolved\s+guide/i.test(text)) missingTargets.push(text);
    }
  });
}
function assertClean() {
  assert.deepEqual(missingTargets, [], 'Every requested guide target resolves');
  assert.deepEqual(errors, [], 'No JavaScript or console errors');
}

// Expected target names come from the guide data, with the documented GPIO
// aliases and resistance notation normalized independently of the scene API.
function canonicalTarget(token) {
  const fields = token.split(':');
  if (fields[0] === 'pin') {
    let pin = fields[1].toUpperCase().replace(/^GPIO/, '');
    pin = ({VP: '36', VN: '39', TX0: '1', RX0: '3', RX2: '16', TX2: '17'})[pin] || pin;
    return 'pin:' + pin;
  }
  fields[1] = fields[1].toLowerCase();
  if (fields[2]) {
    const value = fields[2].toLowerCase().replace(/\s|[Ωω]|ohms?/g, '');
    fields[2] = ({10000: '10k', 2200: '2.2k', '2k2': '2.2k', 3300: '3.3k', '3k3': '3.3k'})[value] || value;
  }
  return fields.join(':');
}
const uniqueSorted = values => [...new Set(values)].sort();
const targetsOf = step => uniqueSorted(step.targets.map(canonicalTarget));

async function paint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}
async function settle(page, id) {
  await page.waitForFunction(id => {
    const scene = document.querySelector('#scene');
    return globalThis.__guideScene && scene.dataset.lesson === id && scene.dataset.transitioning === 'false';
  }, id);
  await paint(page);
}
async function choose(page, id) {
  // Hash navigation is the site's public deep-link path. Re-selecting the current
  // lesson uses its actual card so this helper also resets its tab and guide.
  if (await page.locator('#scene').getAttribute('data-lesson') === id) {
    await page.locator(`#lesson-cards .lesson-card[data-lesson="${id}"]`).click();
  } else {
    await page.evaluate(id => { location.hash = id; }, id);
  }
  await settle(page, id);
}
async function open(page) {
  await page.locator('#lesson-content [data-open-guide]').click();
}
async function shot(page, name, panelOnly = false) {
  const file = path.join(out, name + '.png');
  if (panelOnly) await page.locator('.scene-panel').screenshot({path: file});
  else await page.screenshot({path: file, fullPage: true});
  screenshots.push(file);
}

async function checkLayout(page, label, {labels = false, groundPair = false} = {}) {
  const layout = await page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height};
    };
    return {
      canvas: rect(document.querySelector('#scene canvas')),
      panel: rect(document.querySelector('.scene-panel')),
      guide: rect(document.querySelector('#visual-guide')),
      labels: [...document.querySelectorAll('.scene-focus-label')].map(element => ({
        ...rect(element), token: element.dataset.focusTarget, text: element.textContent,
        visible: getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none'
      }))
    };
  });
  const {canvas: c, panel: p, guide: g} = layout;
  assert.ok(c.width > 1 && c.height > 1, `${label}: positive canvas dimensions ${JSON.stringify(c)}`);
  assert.ok(c.left >= p.left - 1 && c.right <= p.right + 1 && c.top >= p.top - 1 && c.bottom <= p.bottom + 1,
    `${label}: canvas remains in the scene panel ${JSON.stringify(layout)}`);
  assert.ok(g.height > 1 && c.bottom <= g.top + 1,
    `${label}: guide does not cover the canvas ${JSON.stringify({canvas: c, guide: g})}`);
  if (labels) {
    assert.ok(layout.labels.length, label + ': annotations exist');
    for (const l of layout.labels) {
      assert.ok(l.visible && l.width > 1 && l.height > 1 && l.text.trim(), `${label}: visible label ${JSON.stringify(l)}`);
      assert.ok(l.left >= c.left - 1 && l.right <= c.right + 1 && l.top >= c.top - 1 && l.bottom <= c.bottom + 1,
        `${label}: annotation stays inside canvas ${JSON.stringify({annotation: l, canvas: c})}`);
    }
    for (let i = 0; i < layout.labels.length; i++) for (let j = i + 1; j < layout.labels.length; j++) {
      const a = layout.labels[i], b = layout.labels[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      assert.ok(overlapX <= 1 || overlapY <= 1, `${label}: annotations do not collide ${JSON.stringify({a, b})}`);
    }
  }
  if (groundPair) assert.equal(layout.labels.filter(l => l.token === 'pin:GND').length, 2,
    label + ': both distinct DevKit GND header positions are marked');
}

async function checkFocus(page, lesson, stepIndex, options) {
  const step = lesson.guide[stepIndex], expected = targetsOf(step);
  currentCheck = `${lesson.id} / ${step.id}`;
  assert.ok(expected.length, currentCheck + ': the guide requests targets');
  await page.waitForFunction(({title, expected}) => {
    const scene = document.querySelector('#scene');
    const labels = [...document.querySelectorAll('.scene-focus-label')];
    return document.querySelector('#guide-title').textContent === title &&
      scene.dataset.focusActive === 'true' &&
      JSON.stringify([...new Set(JSON.parse(scene.dataset.focusTargets))].sort()) === JSON.stringify(expected) &&
      labels.length > 0 && labels.every(label => label.style.left && label.style.top);
  }, {title: step.title, expected});
  await paint(page);
  assert.equal(await page.locator('#visual-guide').isVisible(), true, currentCheck + ': guide is visible');
  assert.equal((await page.locator('#guide-position').innerText()).trim(), `CONNECTIONS / ${stepIndex + 1} OF ${lesson.guide.length}`);
  assert.equal((await page.locator('#guide-text').innerText()).trim(), step.text);
  assert.equal(await page.locator('#guide-prev').isDisabled(), stepIndex === 0);
  assert.equal((await page.locator('#guide-next').innerText()).trim(), stepIndex === lesson.guide.length - 1 ? 'Done ✓' : 'Next →');
  const state = await page.evaluate(() => __guideScene.state());
  assert.equal(state.lesson, lesson.id, currentCheck + ': focus belongs to the active lesson');
  assert.equal(state.running, false, currentCheck + ': guide pauses the simulation');
  assert.equal(state.focused, true);
  assert.deepEqual(uniqueSorted(state.focus.resolved), expected, currentCheck + ': resolved target set');
  assert.deepEqual(uniqueSorted(state.focus.units.map(unit => unit.token)), expected, currentCheck + ': actual geometry covers all targets');
  assert.ok(state.highlightCount >= state.focus.units.length, currentCheck + ': each focus unit has a rendered highlight');
  for (const unit of state.focus.units) {
    assert.ok([...unit.min, ...unit.max].every(Number.isFinite), currentCheck + ': finite target bounds');
    assert.ok(unit.max.every((n, i) => n >= unit.min[i]) && unit.max.some((n, i) => n > unit.min[i]),
      currentCheck + ': target has nonempty geometry ' + unit.token);
  }
  const labelTokens = await page.locator('.scene-focus-label').evaluateAll(elements => elements.map(e => e.dataset.focusTarget));
  assert.deepEqual(uniqueSorted(labelTokens), expected, currentCheck + ': every target has an annotation');
  await checkLayout(page, currentCheck, options);
  assertClean();
}

async function checkClosed(page, reason) {
  currentCheck = reason;
  await page.waitForFunction(() => document.querySelector('#visual-guide').hidden && document.querySelector('#scene').dataset.focusActive === 'false');
  assert.deepEqual(JSON.parse(await page.locator('#scene').getAttribute('data-focus-targets')), [], reason + ': no stale targets');
  const state = await page.evaluate(() => __guideScene.state());
  assert.equal(state.focus, null, reason + ': scene focus cleared');
  assert.equal(state.highlightCount, 0, reason + ': highlight geometry removed');
  assert.equal(await page.locator('.scene-focus-label').count(), 0, reason + ': annotations removed');
  assert.equal(await page.locator('.scene-panel.guide-open').count(), 0, reason + ': canvas space restored');
  assert.equal(await page.locator('[data-guide-connection][aria-pressed="true"]').count(), 0, reason + ': no selected Pinout row');
  assert.equal(await page.locator('[data-open-guide][aria-expanded="true"]').count(), 0, reason + ': launch controls collapse');
  assertClean();
}

async function run() {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4184, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']});
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
    context.setDefaultTimeout(15000);
    await instrument(context);
    const page = await context.newPage(); activePage = page; collect(page);
    await page.goto(origin, {waitUntil: 'networkidle'});
    await settle(page, 'board');
    const lessons = await page.evaluate(async () => {
      const [{lessons}, {guides}] = await Promise.all([import('./lessons.js'), import('./guides.js')]);
      return lessons.map(lesson => ({id: lesson.id, wiring: lesson.wiring, guide: guides[lesson.id]}));
    });
    assert.equal(lessons.length, 16, 'All 16 lessons are present');
    assert.ok(lessons.every(l => Array.isArray(l.guide) && l.guide.length), 'Every lesson has a guide');
    assert.equal(lessons.reduce((sum, l) => sum + l.guide.length, 0), 68, 'All 68 authored guide steps');
    assert.equal(lessons.reduce((sum, l) => sum + l.wiring.length, 0), 51, 'All 51 Pinout connections');
    const byId = Object.fromEntries(lessons.map(l => [l.id, l]));

    for (const lesson of (process.env.QA_SKIP_LESSONS ? [] : lessons)) {
      await choose(page, lesson.id);
      await open(page);
      for (let i = 0; i < lesson.guide.length; i++) {
        await checkFocus(page, lesson, i);
        if (lesson.id === 'board' && i === 0) await shot(page, 'board-usb-desktop');
        if (lesson.id === 'board' && i === 1) {
          await checkLayout(page, 'desktop GND', {labels: true, groundPair: true});
          await shot(page, 'board-gnd-desktop');
        }
        coverage.steps++;
        await page.locator('#guide-next').click();
      }
      await checkClosed(page, lesson.id + ': Done closes the guide');
      await page.locator('[data-tab="pinout"]').click();
      const rows = page.locator('#lesson-content [data-guide-connection]');
      assert.equal(await rows.count(), lesson.wiring.length, lesson.id + ': every wiring row is actionable');
      for (let row = 0; row < lesson.wiring.length; row++) {
        const index = lesson.guide.findIndex(step => step.connection === row);
        assert.ok(index >= 0, `${lesson.id}: wiring row ${row} has a guide`);
        const button = page.locator(`#lesson-content [data-guide-connection="${row}"]`);
        await button.click();
        await checkFocus(page, lesson, index);
        assert.equal(await button.getAttribute('aria-pressed'), 'true', lesson.id + ': selected row is announced');
        assert.equal(await page.locator('[data-guide-connection][aria-pressed="true"]').count(), 1);
        assert.equal(await button.locator('xpath=ancestor::tr').evaluate(e => e.classList.contains('is-focused')), true);
        coverage.pinoutRows++;
      }
      await page.locator('[data-tab="overview"]').click();
      await checkClosed(page, lesson.id + ': leaving Pinout closes focus');
      coverage.lessons++;
      console.log(`PASS ${lesson.id}: ${lesson.guide.length} guide steps, ${lesson.wiring.length} Pinout rows`);
    }

    // Keyboard activation must work through real button defaults, not synthetic click handlers.
    await choose(page, 'board');
    await page.locator('[data-tab="pinout"]').click();
    await page.locator('#close-guide').click();
    await checkClosed(page, 'Close button');
    await page.locator('[data-guide-connection="1"]').focus();
    await page.keyboard.press('Enter');
    await checkFocus(page, byId.board, 1);
    await page.locator('[data-guide-connection="0"]').focus();
    await page.keyboard.press('Space');
    await checkFocus(page, byId.board, 0);
    await page.locator('#guide-next').click();
    await page.locator('#guide-prev').click();
    await checkFocus(page, byId.board, 0);
    await page.locator('[data-tab="overview"]').click();
    await checkClosed(page, 'Pinout to Overview');

    const dismissals = [
      ['Close button', () => page.locator('#close-guide').click()],
      ['Escape', () => page.keyboard.press('Escape')],
      ['Reset view', () => page.locator('#reset-view').click()],
      ['Zoom in', () => page.locator('#zoom-in').click()],
      ['Zoom out', () => page.locator('#zoom-out').click()],
      ['Keyboard zoom in', async () => { await page.locator('#scene canvas').focus(); await page.keyboard.press('+'); }],
      ['Keyboard zoom out', async () => { await page.locator('#scene canvas').focus(); await page.keyboard.press('-'); }],
      ['Keyboard reset', async () => { await page.locator('#scene canvas').focus(); await page.keyboard.press('0'); }],
      ['Keyboard rotate', async () => { await page.locator('#scene canvas').focus(); await page.keyboard.press('ArrowRight'); }],
      ['Wheel zoom', async () => { await page.locator('#scene canvas').hover(); await page.mouse.wheel(0, 120); }],
      ['Run simulation', () => page.locator('#run-button').click()]
    ];
    for (const [name, action] of dismissals) {
      await open(page); await checkFocus(page, byId.board, 0);
      await action(); await checkClosed(page, name); coverage.dismissals.push(name);
      if (name === 'Run simulation') {
        assert.equal(await page.locator('#run-label').innerText(), 'Stop simulation');
        await page.locator('#run-button').click();
      }
    }
    await page.locator('#run-button').click();
    await open(page); await checkFocus(page, byId.board, 0);
    assert.equal(await page.locator('#run-label').innerText(), 'Run simulation', 'Opening a guide stops an active simulation');
    await page.locator('[data-tab="learn"]').click();
    await checkClosed(page, 'Overview to Learn');
    await open(page); await checkFocus(page, byId.board, 0);
    await page.locator('[data-tab="code"]').click();
    await checkClosed(page, 'Learn to Code');
    await page.locator('[data-tab="overview"]').click();
    await open(page); await checkFocus(page, byId.board, 0);
    await page.locator('#next-lesson-button').click(); await settle(page, 'blink');
    await checkClosed(page, 'Lesson switch');

    // Starting a drag over the actual knob while focused must orbit, without
    // triggering the device or sending a value into the simulation.
    await choose(page, 'potentiometer'); await open(page); await checkFocus(page, byId.potentiometer, 0);
    await page.locator('#scene canvas').scrollIntoViewIfNeeded(); await paint(page);
    const knob = await page.evaluate(() => __guideScene.points('potentiometer')[0]);
    assert.ok(knob, 'Focused potentiometer is visible and raycastable');
    const before = await page.evaluate(() => __guideScene.state());
    await page.mouse.move(knob.x, knob.y); await page.mouse.down();
    assert.equal((await page.evaluate(() => __guideScene.state())).running, false, 'Focused device pointer-down cannot start simulation');
    await page.mouse.move(knob.x + 55, knob.y + 2, {steps: 6}); await page.mouse.up();
    await checkClosed(page, 'Dragging the focused device');
    const after = await page.evaluate(() => __guideScene.state());
    assert.equal(after.running, false, 'Moving a focused scene cannot start simulation');
    assert.equal(after.pressed, false, 'Moving a focused scene cannot leave a device pressed');
    assert.equal(after.value, before.value, 'Moving a focused scene cannot change device value');
    assert.equal(await page.locator('#run-label').innerText(), 'Run simulation');

    // Check a real explanatory diagram, then use its call-to-action to return
    // to the corresponding 3D connection guide.
    await choose(page, 'light'); await open(page); await checkFocus(page, byId.light, 0);
    await page.locator('#view-schematic').click(); await checkClosed(page, 'Schematic view');
    assert.equal(await page.locator('#schematic').isVisible(), true);
    const svg = page.locator('#schematic svg.circuit-svg');
    assert.equal(await svg.count(), 1, 'Light lesson has an actual circuit diagram');
    assert.equal(await svg.getAttribute('role'), 'img');
    const diagramText = await svg.textContent();
    for (const label of ['3V3', 'LDR', 'GPIO34', '10 kΩ', 'GPIO23', '330 Ω', 'LED', 'GND']) {
      assert.ok(diagramText.includes(label), 'Light schematic labels ' + label);
    }
    assert.ok(await svg.locator('path').count() > 8, 'Schematic draws connected circuit symbols');
    await shot(page, 'light-schematic');
    await page.locator('#schematic [data-open-guide]').click(); await checkFocus(page, byId.light, 0);
    assert.equal(await page.locator('#schematic').isVisible(), false, 'Trace action restores the 3D view');
    await context.close();

    // Only one live browser page at a time: SwiftShader can be slow with several
    // active WebGL scenes. Test touch-layout breakpoints sequentially.
    const mobileContext = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
    mobileContext.setDefaultTimeout(15000);
    await instrument(mobileContext);
    const mobile = await mobileContext.newPage(); activePage = mobile; collect(mobile);
    await mobile.goto(origin, {waitUntil: 'networkidle'}); await settle(mobile, 'board');
    for (const width of [320, 390, 768]) {
      await mobile.setViewportSize({width, height: 844});
      await choose(mobile, 'board'); await open(mobile); await mobile.locator('#guide-next').click();
      await checkFocus(mobile, byId.board, 1, {labels: true, groundPair: true});
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width, 'Board guide has no page overflow at ' + width);
      if (width === 390) await shot(mobile, 'board-gnd-mobile', true);
      await mobile.locator('#close-guide').tap(); await checkClosed(mobile, 'Mobile close at ' + width);
      await choose(mobile, 'piano'); await open(mobile);
      await checkFocus(mobile, byId.piano, 0, {labels: true, groundPair: true});
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width, 'Piano guide has no page overflow at ' + width);
      if (width === 390) await shot(mobile, 'piano-mobile', true);
      await mobile.locator('#guide-next').tap();
      await checkFocus(mobile, byId.piano, 1, {labels: true, groundPair: true});
      coverage.widths.push(width);
      console.log(`PASS responsive guide labels: ${width}px GND and both piano input groups`);
    }
    assertClean();
    if (!process.env.QA_SKIP_LESSONS) { assert.equal(coverage.steps, 68); assert.equal(coverage.pinoutRows, 51); }
    const result = {result: 'passed', ...coverage, errors, missingTargets, warnings, screenshots, output: out};
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({path: path.join(out, 'failure.png'), fullPage: true}).catch(() => {});
      const state = await activePage.evaluate(() => ({
        url: location.href, scene: globalThis.__guideScene?.state(),
        title: document.querySelector('#guide-title')?.textContent,
        viewport: {width: innerWidth, height: innerHeight}, scrollY
      })).catch(() => null);
      fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({currentCheck, message: error.message, coverage, errors, missingTargets, warnings, state}, null, 2));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error('FAIL at ' + currentCheck, error); process.exitCode = 1; });
