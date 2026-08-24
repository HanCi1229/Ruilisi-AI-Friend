const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const playwrightPath = path.join(
  process.env.USERPROFILE,
  '.cache', 'codex-runtimes', 'codex-primary-runtime',
  'dependencies', 'node', 'node_modules', 'playwright'
);
const { chromium } = require(playwrightPath);

const devRoot = path.resolve(__dirname, '..', '..');
const htmlPath = path.join(devRoot, '原型源码', 'dist', 'index.html');
const reportDir = path.resolve(__dirname, '..', '测试报告');
const screenshotDir = path.join(reportDir, 'screenshots', '三场景动效');
const storageKey = 'ruilisi-p0-prototype-v071';
fs.mkdirSync(screenshotDir, { recursive: true });

const check = (value, message) => { if (!value) throw new Error(message); };
const durationInRange = value => {
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds >= 3 && seconds <= 5;
};
const waitState = (page, state) => page.waitForFunction(
  expected => document.querySelector('#sceneShell')?.dataset.state === expected,
  state,
  { timeout: 7000 }
);

const storedLifeState = {
  completedFirstLoop: true,
  preferredName: 'QA user',
  sharedObject: 'plant',
  relationStage: 'R2',
  currentScene: 'moon-garden',
  previousScene: 'moon-garden',
  unlockedScenes: ['moon-garden', 'wind-plain', 'cloud-terminal'],
  visitedScenes: ['moon-garden', 'wind-plain', 'cloud-terminal'],
  cloudEventReady: true,
  currentState: 'LIFE',
  currentActivity: 'ambient stage 2C QA',
  characterState: 'LIFE',
  motionLevel: 'natural',
  focusDuration: 25,
  focusStatus: 'setup',
  focusRemaining: 1500
};

async function debugAmbient(page) {
  return page.evaluate(() => ({
    ...window.__ruilisiAmbient.getDebugState(),
    phase: document.querySelector('#app')?.dataset.phase,
    motionVariable: getComputedStyle(document.querySelector('#app')).getPropertyValue('--motion-factor').trim(),
    pointerEvents: getComputedStyle(document.querySelector('#sceneAmbient')).pointerEvents,
    ambientZ: getComputedStyle(document.querySelector('#sceneAmbient')).zIndex,
    moonDurations: {
      glow: getComputedStyle(document.querySelector('.moon-glow-layer')).animationDuration,
      water: getComputedStyle(document.querySelector('.water-glow-layer')).animationDuration,
      lamps: [...document.querySelectorAll('.lamp-glow-layer i')].map(node => getComputedStyle(node).animationDuration)
    },
    plainAnimations: {
      clouds: [...document.querySelectorAll('.plain-cloud-haze-layer i')].map(node => getComputedStyle(node).animationName),
      light: getComputedStyle(document.querySelector('.plain-light-breath-layer')).animationName,
      grass: getComputedStyle(document.querySelector('.plain-grass-light-layer')).animationName,
      durations: [
        ...[...document.querySelectorAll('.plain-cloud-haze-layer i')].map(node => getComputedStyle(node).animationDuration),
        getComputedStyle(document.querySelector('.plain-light-breath-layer')).animationDuration,
        getComputedStyle(document.querySelector('.plain-grass-light-layer')).animationDuration
      ]
    },
    terminalAnimations: {
      clouds: [...document.querySelectorAll('.terminal-cloud-layer i')].map(node => getComputedStyle(node).animationName),
      mist: getComputedStyle(document.querySelector('.terminal-mist-layer')).animationName,
      lamps: [...document.querySelectorAll('.terminal-lamp-glow-layer i')].map(node => getComputedStyle(node).animationName),
      durations: [
        ...[...document.querySelectorAll('.terminal-cloud-layer i')].map(node => getComputedStyle(node).animationDuration),
        getComputedStyle(document.querySelector('.terminal-mist-layer')).animationDuration,
        ...[...document.querySelectorAll('.terminal-lamp-glow-layer i')].map(node => getComputedStyle(node).animationDuration)
      ]
    }
  }));
}

async function openScenePicker(page) {
  await page.locator('#modeBar button[data-mode="more"]').click();
  await page.locator('#moreMenu button[data-more-action="scenes"]').click();
  await page.locator('#scenePicker.open').waitFor();
}

async function switchScene(page, sceneId) {
  await openScenePicker(page);
  await page.locator(`#sceneChoices button[data-scene="${sceneId}"]`).click();
  await page.waitForFunction(expected => {
    const app = document.querySelector('#app');
    return app?.dataset.theme === expected && !app.classList.contains('scene-transitioning');
  }, sceneId, { timeout: 5000 });
  await waitState(page, 'LIFE');
}

async function captureLifeAndChat(page, prefix) {
  await page.screenshot({ path: path.join(screenshotDir, `${prefix}-LIFE.png`) });
  await page.locator('#modeBar button[data-mode="talk"]').click();
  await waitState(page, 'CHAT');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(screenshotDir, `${prefix}-CHAT.png`) });
  await page.locator('[data-action="close-chat"]').click();
  await waitState(page, 'LIFE');
}

async function createSoakPage(browser, sceneId) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, state, scene }) => {
    localStorage.setItem(key, JSON.stringify({ ...state, currentScene: scene, previousScene: scene }));
  }, { key: storageKey, state: storedLifeState, scene: sceneId });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.clock.fastForward('10:00');
  const state = await debugAmbient(page);
  await context.close();
  return state;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: storageKey, state: storedLifeState });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await waitState(page, 'LIFE');
  await page.waitForTimeout(800);
  const moonBaseline = await debugAmbient(page);
  check(moonBaseline.phase === '2c', 'phase marker is not 2c');
  check(moonBaseline.containerCount === 1, 'ambient container count is not 1');
  check(moonBaseline.activeGroups.length === 1 && moonBaseline.activeGroups[0] === 'moon-garden', 'moon ambient group not active');
  check(moonBaseline.timers.moon && !moonBaseline.timers.plain && !moonBaseline.timers.terminal, 'moon timer isolation failed');
  check(moonBaseline.pointerEvents === 'none' && moonBaseline.ambientZ === '1', 'ambient layer interaction or stacking is invalid');
  check(durationInRange(moonBaseline.moonDurations.glow) && durationInRange(moonBaseline.moonDurations.water) && moonBaseline.moonDurations.lamps.every(durationInRange), 'moon breathing duration is outside 3-5 seconds');

  await switchScene(page, 'wind-plain');
  const plainInitial = await debugAmbient(page);
  check(plainInitial.activeGroups.length === 1 && plainInitial.activeGroups[0] === 'wind-plain', 'wind ambient group not isolated');
  check(plainInitial.timers.plain && !plainInitial.timers.moon && !plainInitial.timers.terminal, 'wind timer isolation failed');
  check(plainInitial.plainAnimations.clouds.every(name => name === 'plain-cloud-drift'), 'wind cloud haze animation missing');
  check(plainInitial.plainAnimations.light === 'plain-light-breathe', 'wind daylight breathing missing');
  check(plainInitial.plainAnimations.grass === 'plain-grass-light', 'wind grass light animation missing');
  check(plainInitial.plainAnimations.durations.every(durationInRange), 'wind breathing duration is outside 3-5 seconds');
  await page.screenshot({ path: path.join(screenshotDir, 'wind-00-second.png') });
  await captureLifeAndChat(page, 'wind');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screenshotDir, 'wind-04-second.png') });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screenshotDir, 'wind-08-second.png') });
  await page.evaluate(() => window.__ruilisiAmbient.spawnLeafForTest());
  await page.waitForTimeout(1800);
  const plainParticle = await debugAmbient(page);
  check(plainParticle.leafCount > 0 && plainParticle.leafCount <= 3, `wind leaf limit failed: ${plainParticle.leafCount}`);
  await page.screenshot({ path: path.join(screenshotDir, 'wind-leaf-visible.png') });
  await page.screenshot({ path: path.join(screenshotDir, 'wind-factor-1.png') });
  await page.evaluate(() => window.__ruilisiAmbient.setMotionFactor(.25));
  const plainQuarter = await debugAmbient(page);
  check(plainQuarter.factor === .25 && Number(plainQuarter.motionVariable) === .25, 'wind factor .25 not applied');
  await page.screenshot({ path: path.join(screenshotDir, 'wind-factor-025.png') });
  await page.evaluate(() => window.__ruilisiAmbient.setMotionFactor(1));

  await switchScene(page, 'cloud-terminal');
  const terminalInitial = await debugAmbient(page);
  check(terminalInitial.activeGroups.length === 1 && terminalInitial.activeGroups[0] === 'cloud-terminal', 'terminal ambient group not isolated');
  check(terminalInitial.timers.terminal && !terminalInitial.timers.moon && !terminalInitial.timers.plain, 'terminal timer isolation failed');
  check(terminalInitial.terminalAnimations.clouds.every(name => name === 'terminal-cloud-drift'), 'terminal cloud animation missing');
  check(terminalInitial.terminalAnimations.mist === 'terminal-edge-mist', 'terminal edge mist missing');
  check(terminalInitial.terminalAnimations.lamps.every(name => name === 'terminal-lamp-breathe'), 'terminal lamp breathing missing');
  check(terminalInitial.terminalAnimations.durations.every(durationInRange), 'terminal breathing duration is outside 3-5 seconds');
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-00-second.png') });
  await captureLifeAndChat(page, 'terminal');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-04-second.png') });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-08-second.png') });
  let terminalParticle = await debugAmbient(page);
  if (terminalParticle.terminalLightCount === 0) {
    await page.evaluate(() => window.__ruilisiAmbient.spawnTerminalLightForTest());
    await page.waitForTimeout(350);
    terminalParticle = await debugAmbient(page);
  }
  check(terminalParticle.terminalLightCount === 1, `terminal distant light limit failed: ${terminalParticle.terminalLightCount}`);
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-light-visible.png') });
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-factor-1.png') });
  await page.evaluate(() => window.__ruilisiAmbient.setMotionFactor(.25));
  const terminalQuarter = await debugAmbient(page);
  check(terminalQuarter.factor === .25 && Number(terminalQuarter.motionVariable) === .25, 'terminal factor .25 not applied');
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-factor-025.png') });
  await page.evaluate(() => window.__ruilisiAmbient.setMotionFactor(1));

  const switching = [];
  const sequence = ['moon-garden', 'wind-plain', 'cloud-terminal', 'moon-garden', 'wind-plain', 'cloud-terminal', 'moon-garden', 'wind-plain', 'cloud-terminal', 'moon-garden'];
  for (const sceneId of sequence) {
    await switchScene(page, sceneId);
    const state = await debugAmbient(page);
    switching.push({ sceneId, state });
    check(state.containerCount === 1, `ambient container duplicated after switching to ${sceneId}`);
    check(state.activeGroups.length === 1 && state.activeGroups[0] === sceneId, `active group mismatch after switching to ${sceneId}`);
    check(state.petalCount <= 4 && state.leafCount <= 3 && state.terminalLightCount <= 1, `particle limit failed at ${sceneId}`);
    if (sceneId !== 'moon-garden') check(state.petalCount === 0 && !state.timers.moon, 'moon particles or timer leaked');
    if (sceneId !== 'wind-plain') check(state.leafCount === 0 && !state.timers.plain, 'wind particles or timer leaked');
    if (sceneId !== 'cloud-terminal') check(state.terminalLightCount === 0 && !state.timers.terminal, 'terminal particles or timer leaked');
  }

  await switchScene(page, 'wind-plain');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const reducedPlain = await debugAmbient(page);
  check(!reducedPlain.timers.plain && reducedPlain.leafCount === 0, 'reduced motion did not stop wind particles');
  check(reducedPlain.plainAnimations.clouds.every(name => name === 'none') && reducedPlain.plainAnimations.light === 'none' && reducedPlain.plainAnimations.grass === 'none', 'reduced motion did not stop wind movement');
  await page.screenshot({ path: path.join(screenshotDir, 'wind-reduced-motion.png') });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await switchScene(page, 'cloud-terminal');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const reducedTerminal = await debugAmbient(page);
  check(!reducedTerminal.timers.terminal && reducedTerminal.terminalLightCount === 0, 'reduced motion did not stop terminal particles');
  check(reducedTerminal.terminalAnimations.clouds.every(name => name === 'none') && reducedTerminal.terminalAnimations.mist === 'none' && reducedTerminal.terminalAnimations.lamps.every(name => name === 'none'), 'reduced motion did not stop terminal movement');
  await page.screenshot({ path: path.join(screenshotDir, 'terminal-reduced-motion.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const plainSoak = await createSoakPage(browser, 'wind-plain');
  const terminalSoak = await createSoakPage(browser, 'cloud-terminal');
  check(plainSoak.containerCount === 1 && plainSoak.leafCount <= 3 && plainSoak.timers.plain, 'wind 10-minute soak failed');
  check(terminalSoak.containerCount === 1 && terminalSoak.terminalLightCount <= 1 && terminalSoak.timers.terminal, 'terminal 10-minute soak failed');
  check(errors.length === 0, `runtime errors: ${errors.join(' | ')}`);

  const report = {
    generatedAt: new Date().toISOString(),
    browserPath: 'regular Playwright (Browser plugin not available)',
    pageTitle: await page.title(),
    moonBaseline,
    plainInitial,
    plainParticle,
    plainQuarter,
    terminalInitial,
    terminalParticle,
    terminalQuarter,
    switching: switching.map(item => ({
      scene: item.sceneId,
      activeGroups: item.state.activeGroups,
      timers: item.state.timers,
      particles: {
        petals: item.state.petalCount,
        leaves: item.state.leafCount,
        terminalLights: item.state.terminalLightCount
      }
    })),
    reducedPlain,
    reducedTerminal,
    tenMinuteSoak: { plain: plainSoak, terminal: terminalSoak },
    runtimeErrors: errors,
    screenshots: fs.readdirSync(screenshotDir).sort()
  };
fs.writeFileSync(path.join(reportDir, '三场景动效.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
