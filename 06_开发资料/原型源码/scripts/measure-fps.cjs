/**
 * 瑞丽丝原型 · 帧率实测脚本
 * 用 playwright-core 驱动本机 Edge，在视频背景 + 面板打开状态下统计 6 秒实际帧率
 * 用法: node measure-fps.cjs <url> [面板选择器...]
 */
const { chromium } = require('playwright-core');

const EDGE = process.env.EDGE_PATH
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
  const url = process.argv[2];
  if (!url) { console.error('用法: node measure-fps.cjs <url>'); process.exit(1); }
  const panels = process.argv.slice(3);

  const browser = await chromium.launch({
    executablePath: EDGE,
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--mute-audio']
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500); // 等视频起播

  // 打开指定面板（存在才点）
  for (const sel of panels) {
    const vis = await page.$(sel);
    if (vis) { await vis.click().catch(() => {}); await page.waitForTimeout(400); }
  }

  // 视频状态（取实际起播的视频）
  const video = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video.scene-video')].find(x => !x.paused && x.currentSrc) || document.querySelector('.scene-background.visible video.scene-video');
    return v ? { playing: !v.paused, ready: v.readyState, w: v.videoWidth, h: v.videoHeight, src: (v.currentSrc || '').split('/').pop() } : null;
  });

  // 6 秒 rAF 计数
  const fps = await page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise(resolve => {
      const loop = () => { frames++; performance.now() - t0 < 6000 ? requestAnimationFrame(loop) : resolve(); };
      requestAnimationFrame(loop);
    });
    const ms = performance.now() - t0;
    return { frames, ms, fps: +(frames / (ms / 1000)).toFixed(1) };
  });

  // 长任务统计：抽样主线程阻塞
  const longTask = await page.evaluate(() => {
    return new Promise(resolve => {
      let count = 0, total = 0;
      const obs = new PerformanceObserver(l => {
        for (const e of l.getEntries()) { count++; total += e.duration; }
      });
      obs.observe({ entryTypes: ['longtask'] });
      setTimeout(() => { obs.disconnect(); resolve({ count, totalMs: +total.toFixed(1) }); }, 6000);
    });
  });

  console.log(JSON.stringify({ video, fps, longTask }, null, 2));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
