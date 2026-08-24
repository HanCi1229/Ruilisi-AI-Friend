/**
 * 瑞丽丝原型 · 性能优化脚本（v2）
 * 1) 移除全部 backdrop-filter（视频背景上 17 处实时模糊 = 最大 GPU 负担）
 *    并以「提升底色不透明度」补偿视觉，保持玻璃感（仅处理 alpha<=0.9，幂等）
 * 2) 为缺背景色的 .icon-btn 补半透明底色
 * 3) 提升 --panel-bg 及其场景变体的不透明度
 * 4) .scene-video 强制独立合成层（translateZ + will-change）
 * 5) 注入 visibilitychange 逻辑：页面隐藏时暂停视频，恢复时只播可见层
 * 6) 移除 .star-field drift 动画（background-position 全屏重绘，无法走合成层）
 *
 * 用法: node perf-optimize.cjs [path/to/prototype.html]
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '../public/prototype.html');
let src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');
const reports = [];

/** 提升 rgba alpha（只处理 <=0.9 的，保证幂等） */
function boostAlpha(a) {
  if (a > 0.9) return a;
  return Math.min(0.97, Math.round((a * 1.1 + 0.06) * 100) / 100);
}

function boostBgAlpha(line) {
  const re = /(background(-color)?:\s*rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*)([\d.]+)(\s*\))/g;
  let changed = false;
  line = line.replace(re, (m, p1, _p2, p3, p4) => {
    const a = parseFloat(p3);
    if (a > 0.9) return m;
    changed = true;
    return p1 + boostAlpha(a) + p4;
  });
  return { line, changed };
}

function findRuleBlock(lines, idx) {
  let brace = -1;
  for (let i = idx; i >= 0; i--) {
    if (lines[i].includes('{')) { brace = i; break; }
  }
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (depth <= 0) return { start: brace, end: i };
  }
  return null;
}

/* ---------- 1&2. 去 backdrop-filter + 底色补偿 ---------- */
const out = [];
const dropSet = new Set();
const bgBoost = new Map();
const iconBtnFixes = new Map();

lines.forEach((line, i) => {
  if (/backdrop-filter\s*:/.test(line)) {
    dropSet.add(i);
    const block = findRuleBlock(lines, i);
    if (block) {
      for (let j = block.start + 1; j < block.end; j++) {
        if (/background(-color)?\s*:\s*rgba\(/.test(lines[j])) {
          const r = boostBgAlpha(lines[j]);
          if (r.changed) bgBoost.set(j, r.line);
          break;
        }
      }
      const hasBg = lines.slice(block.start + 1, block.end).some(l => /background(-color)?\s*:/.test(l));
      if (!hasBg && lines[block.start].includes('.icon-btn')) {
        iconBtnFixes.set(i, '      background: rgba(15, 20, 39, .58);');
      }
    }
    reports.push(`去毛玻璃 行${i + 1}: ${line.trim()}`);
    return;
  }
  out.push(line);
});

let result = out.join('\n');
bgBoost.forEach((newLine, i) => {
  const oldLine = lines[i];
  const pos = result.indexOf(oldLine);
  if (pos >= 0) {
    result = result.slice(0, pos) + newLine + result.slice(pos + oldLine.length);
  }
});
iconBtnFixes.forEach((fix, i) => {
  const oldLine = lines[i];
  const pos = result.indexOf(oldLine);
  if (pos >= 0) {
    result = result.slice(0, pos) + fix + '\n' + result.slice(pos);
  }
});

/* ---------- 3. --panel-bg 变量提升 ---------- */
const panelVarMap = new Map([
  ['rgba(8, 17, 35, 0.84)', 'rgba(8, 17, 35, 0.92)'],
  ['rgba(7, 15, 32, .84)',  'rgba(7, 15, 32, 0.93)'],
  ['rgba(34, 57, 66, .72)', 'rgba(34, 57, 66, 0.84)'],
  ['rgba(20, 31, 50, .82)', 'rgba(20, 31, 50, 0.91)'],
]);
panelVarMap.forEach((to, from) => {
  if (result.includes(from)) {
    result = result.split(from).join(to);
    reports.push(`--panel-bg 提浓: ${from} -> ${to}`);
  }
});

/* ---------- 4. .scene-video 合成层 ---------- */
if (/\.scene-video\s*\{/.test(result) && !/\.scene-video\s*\{[\s\S]*?will-change/.test(result)) {
  result = result.replace(/\.scene-video\s*\{[^}]*?\}/, m => {
    const add = `\n      transform: translateZ(0);\n      will-change: transform;`;
    return m.replace('{', '{' + add);
  });
  reports.push('.scene-video 强制合成层 translateZ + will-change');
}

/* ---------- 5. visibilitychange 注入（与已有监听合并） ---------- */
const pauseSnippet = `        // 性能：页面隐藏时暂停全部视频，恢复时只播可见层（省 GPU 解码）
        document.querySelectorAll('video.scene-video').forEach(v => { if (document.hidden) v.pause(); });
        if (!document.hidden) {
          document.querySelectorAll('.scene-background.visible video.scene-video').forEach(v => {
            if (v.dataset.src) v.play().catch(() => {});
          });
        }`;
if (!result.includes('恢复时只播可见层')) {
  const anchor = "app.dataset.motion = document.hidden ? 'paused' : (app.dataset.desktopState === 'assist' || app.dataset.desktopState === 'focus' ? 'focus' : 'natural');";
  if (result.includes(anchor)) {
    result = result.split(anchor).join(anchor + '\n' + pauseSnippet);
    reports.push('合并 visibilitychange 视频暂停逻辑');
  }
}

/* ---------- 6. star-field drift 动画移除 ---------- */
if (/animation:\s*drift/.test(result)) {
  result = result
    .replace(/\n\s*animation:\s*drift[^;]+;\s*\n/g, '\n')
    .replace(/\n\s*animation-duration:[^;]+;\s*/g, ' ')
    .replace(/\n\s*animation-direction:\s*reverse;\s*/g, ' ')
    .replace(/\n\s*@keyframes\s+drift\s*\{[^}]*\}\s*\n/g, '\n');
  reports.push('移除 star-field drift 动画（全屏 background-position 重绘）');
}

fs.writeFileSync(file, result, 'utf8');
console.log('===== 优化完成 =====');
console.log(reports.join('\n') || '（无可处理项，已是最优状态）');
console.log(`backdrop-filter 剩余: ${(result.match(/backdrop-filter/g) || []).length} | drift 剩余: ${(result.match(/animation:\s*drift/g) || []).length}`);
