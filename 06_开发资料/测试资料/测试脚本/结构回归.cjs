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
const screenshotDir = path.join(reportDir, 'screenshots', '结构回归');
const storageKey = 'ruilisi-p0-prototype-v071';
fs.mkdirSync(screenshotDir, { recursive: true });

const check = (value, message) => { if (!value) throw new Error(message); };
const sleep = (page, ms = 850) => page.waitForTimeout(ms);
const currentState = page => page.locator('#sceneShell').getAttribute('data-state');
const waitState = (page, value, timeout = 7000) => page.waitForFunction(expected => document.querySelector('#sceneShell')?.dataset.state === expected, value, { timeout });
const shot = async (page, name) => { await sleep(page); await page.screenshot({ path: path.join(screenshotDir, `${name}.png`) }); };
const memory = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), storageKey);

async function activeDock(page) {
  return page.locator('#modeBar button.active').evaluateAll(nodes => nodes.map(node => node.dataset.mode));
}

async function characterBox(page) {
  return page.locator('#characterWrap').evaluate(el => {
    const box = el.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, className: el.className, pose: document.querySelector('#character').className };
  });
}

async function panelBox(page) {
  return page.locator('#taskPanel').evaluate(el => {
    const box = el.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, state: el.dataset.panelState };
  });
}

async function openMore(page) {
  await page.locator('[data-mode="more"]').click();
  await page.locator('#moreMenu.open').waitFor();
  await sleep(page, 250);
}

async function seed(page) {
  await page.evaluate(({ key }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      preferredName: '旅人', sharedObject: 'plant', completedFirstLoop: true,
      currentScene: 'moon-garden', unlockedScenes: ['moon-garden', 'wind-plain'],
      cloudEventReady: true, visitedScenes: ['moon-garden'], relationStage: 'R2',
      returnCount: 1, conversationMode: 'companion', chatHistory: [],
      motionLevel: 'natural', currentActivity: '她在看新叶慢慢舒展',
      characterState: 'LIFE', previousState: 'LIFE', previousScene: 'moon-garden',
      previousCharacterState: 'LIFE', previousActivity: '她在看新叶慢慢舒展',
      previousMotionLevel: 'natural', currentState: 'LIFE', focusDuration: 25,
      focusStatus: 'setup', focusRemaining: 1500, taskVersions: [], recentTasks: []
    }));
  }, { key: storageKey });
  await page.reload({ waitUntil: 'load' });
  await waitState(page, 'LIFE');
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await seed(page);

  const defaultDisplay = await page.evaluate(() => ({
    title: document.title,
    topbar: getComputedStyle(document.querySelector('.topbar')).display,
    badge: getComputedStyle(document.querySelector('.prototype-badge')).display,
    caption: getComputedStyle(document.querySelector('.state-caption')).display,
    bodyText: document.body.innerText.length
  }));
  check(defaultDisplay.title.includes('v0.7.1a'), '页面版本标题不是 v0.7.1a');
  check(defaultDisplay.topbar === 'none' && defaultDisplay.badge === 'none' && defaultDisplay.caption === 'none', '默认打开泄露评审信息');
  check(defaultDisplay.bodyText > 20, '页面为空');

  await sleep(page);
  const lifeBox = await characterBox(page);
  check((await activeDock(page)).length === 0, 'LIFE 存在持续高亮');
  await shot(page, '01-LIFE');

  await page.locator('[data-mode="talk"]').click();
  await waitState(page, 'CHAT');
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['talk']), 'CHAT 动作坞高亮错误');
  const chatBox = await characterBox(page);
  check(chatBox.pose.includes('greeting'), 'CHAT 人物没有切换面向用户姿态');
  await shot(page, '02-CHAT');
  await page.locator('[data-action="close-chat"]').click();
  await waitState(page, 'LIFE');
  await sleep(page);
  check(Math.abs((await characterBox(page)).left - lifeBox.left) < 2, 'CHAT 关闭后人物位置未恢复');

  await page.locator('[data-mode="assist"]').click();
  await waitState(page, 'ASSIST_INPUT');
  await page.locator('[data-task-action="use-demo"]').click();
  await sleep(page);
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['assist']), 'ASSIST_INPUT 动作坞高亮错误');
  const assistInputBox = await panelBox(page);
  check(assistInputBox.height >= 330 && assistInputBox.height <= 420, `ASSIST_INPUT 高度异常: ${assistInputBox.height}`);
  const assistCharacter = await characterBox(page);
  const assistShift = lifeBox.left - assistCharacter.left;
  check(assistShift >= 40 && assistShift <= 70, `ASSIST 人物左移应为 40-70px，实际 ${assistShift}`);
  await shot(page, '03-ASSIST_INPUT');

  await page.locator('[data-task-action="run"]').click();
  await waitState(page, 'ASSIST_RUNNING');
  await sleep(page, 500);
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['assist']), 'ASSIST_RUNNING 动作坞高亮错误');
  const assistRunningBox = await panelBox(page);
  check(assistRunningBox.height >= 360 && assistRunningBox.height <= 460, `ASSIST_RUNNING 高度异常: ${assistRunningBox.height}`);
  await shot(page, '04-ASSIST_RUNNING');

  await waitState(page, 'ASSIST_RESULT');
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['assist']), 'ASSIST_RESULT 动作坞高亮错误');
  const assistResultBox = await panelBox(page);
  check(assistResultBox.width === assistInputBox.width && assistResultBox.right === assistInputBox.right, '任务面板三态宽度或右对齐不一致');
  await shot(page, '05-ASSIST_RESULT');
  await page.locator('[data-task-action="finish"]').click();
  await waitState(page, 'LIFE');

  await page.locator('[data-mode="focus"]').click();
  await waitState(page, 'FOCUS_SETUP');
  await sleep(page);
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['focus']), 'FOCUS_SETUP 动作坞高亮错误');
  const durationLabels = await page.locator('.focus-duration button').allTextContents();
  check(durationLabels.join('|') === '25分钟|45分钟|自定义', `专注时长文字错误: ${durationLabels.join('|')}`);
  const durationStyles = await page.locator('.focus-duration button').evaluateAll(buttons => buttons.map(button => ({
    color: getComputedStyle(button).color,
    background: getComputedStyle(button).backgroundColor,
    border: getComputedStyle(button).borderColor,
    selected: button.classList.contains('selected')
  })));
  check(durationStyles.every(style => style.color !== 'rgba(0, 0, 0, 0)'), '专注时长按钮文字不可见');
  check(durationStyles.filter(style => style.selected).length === 1, '专注时长选中态数量异常');
  const focusSetupCharacter = await characterBox(page);
  check(focusSetupCharacter.className.includes('seated') && focusSetupCharacter.left !== assistCharacter.left, 'FOCUS 人物状态与 ASSIST 区分不足');
  await shot(page, '06-FOCUS_SETUP');

  await page.locator('#focusGoalInput').fill('完成 v0.7.1a 小范围复核');
  await page.locator('[data-focus-action="start"]').click();
  await waitState(page, 'FOCUS_RUNNING');
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['focus']), 'FOCUS_RUNNING 动作坞高亮错误');
  await shot(page, '07-FOCUS_RUNNING');
  await page.locator('[data-focus-action="complete"]').click();
  await waitState(page, 'FOCUS_COMPLETE');
  await page.locator('[data-focus-action="save-review"]').click();
  await waitState(page, 'LIFE');
  await sleep(page);
  check(Math.abs((await characterBox(page)).left - lifeBox.left) < 2, 'FOCUS 完成后人物位置未恢复');

  await openMore(page);
  check(JSON.stringify(await activeDock(page)) === JSON.stringify(['more']), 'MORE_MENU 动作坞高亮错误');
  await shot(page, '08-MORE_MENU');
  await page.keyboard.press('Escape');
  check((await activeDock(page)).length === 0, 'MORE_MENU 关闭后仍有入口高亮');

  await openMore(page);
  await page.locator('[data-more-action="scenes"]').click();
  await waitState(page, 'SCENE_SWITCH');
  await page.locator('[data-scene="wind-plain"]').click();
  await waitState(page, 'LIFE');
  check((await memory(page)).currentScene === 'wind-plain', '场景切换未写入');
  await page.locator('[data-mode="assist"]').click();
  await waitState(page, 'ASSIST_INPUT');
  await page.locator('[data-task-action="close"]').click();
  await waitState(page, 'LIFE');
  check((await memory(page)).currentScene === 'wind-plain', '切换场景后关闭任务未恢复原场景');

  await page.reload({ waitUntil: 'load' });
  await waitState(page, 'LIFE');
  const refreshed = await memory(page);
  check(refreshed.currentScene === 'wind-plain' && refreshed.sharedObject === 'plant', '刷新后 localStorage 恢复失败');

  const responsive = [];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.locator('[data-mode="assist"]').click();
    await waitState(page, 'ASSIST_INPUT');
    if (await page.locator('[data-task-action="use-demo"]').count()) await page.locator('[data-task-action="use-demo"]').click();
    await sleep(page);
    const panel = await panelBox(page);
    const character = await characterBox(page);
    const expectedWidth = viewport.width >= 1600 ? 420 : viewport.width >= 1400 ? 400 : 380;
    check(Math.abs(panel.width - expectedWidth) < 2, `${viewport.width} 面板宽度错误: ${panel.width}`);
    check(panel.right <= viewport.width && character.right < panel.left, `${viewport.width} 存在人物或面板遮挡`);
    await page.screenshot({ path: path.join(screenshotDir, `RESPONSIVE-${viewport.width}x${viewport.height}.png`) });
    responsive.push({ viewport, panel, character });
    await page.locator('[data-task-action="close"]').click();
    await waitState(page, 'LIFE');
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${pathToFileURL(htmlPath).href}?review=1`, { waitUntil: 'load' });
  check((await page.locator('.topbar').evaluate(el => getComputedStyle(el).display)) !== 'none', '?review=1 未开启评审模式');

  const report = {
    generatedAt: new Date().toISOString(),
    browserPath: 'regular Playwright (Browser plugin not available)',
    pageTitle: await page.title(), defaultDisplay, durationLabels, durationStyles,
    character: { life: lifeBox, chat: chatBox, assist: assistCharacter, focus: focusSetupCharacter, assistShift },
    taskPanels: { input: assistInputBox, running: assistRunningBox, result: assistResultBox },
    responsive, runtimeErrors,
    screenshots: fs.readdirSync(screenshotDir).filter(file => file.endsWith('.png')).sort()
  };
fs.writeFileSync(path.join(reportDir, '结构回归.json'), JSON.stringify(report, null, 2));
  check(runtimeErrors.length === 0, `浏览器控制台错误: ${runtimeErrors.join(' | ')}`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
