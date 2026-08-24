const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..', '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const sourceScenes = path.join(publicDir, 'assets', 'scenes');

fs.mkdirSync(path.join(distDir, 'server'), { recursive: true });
fs.mkdirSync(path.join(distDir, '.openai'), { recursive: true });

let html = fs.readFileSync(path.join(publicDir, 'prototype.html'), 'utf8');
for (const fileName of fs.readdirSync(sourceScenes)) {
  const imageBase64 = fs.readFileSync(path.join(sourceScenes, fileName)).toString('base64');
  const dataUrl = `data:image/webp;base64,${imageBase64}`;
  html = html
    .replaceAll(`./assets/scenes/${fileName}`, dataUrl)
    .replaceAll(`assets/scenes/${fileName}`, dataUrl);
}

const workerSource = `const html = ${JSON.stringify(html)};\n\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    if (url.pathname !== '/' && url.pathname !== '/index.html') {\n      return new Response('Not found', { status: 404 });\n    }\n    return new Response(html, {\n      headers: {\n        'content-type': 'text/html; charset=utf-8',\n        'cache-control': 'public, max-age=300'\n      }\n    });\n  }\n};\n`;

fs.writeFileSync(path.join(distDir, 'server', 'index.js'), workerSource);
fs.copyFileSync(
  path.join(root, '.openai', 'hosting.json'),
  path.join(distDir, '.openai', 'hosting.json')
);

// Keep a browser-openable copy for local validation.
fs.writeFileSync(path.join(distDir, 'index.html'), html);

// 交付版
const deliverDir = path.join(projectRoot, '02_交互原型');
fs.mkdirSync(deliverDir, { recursive: true });
fs.writeFileSync(path.join(deliverDir, '瑞丽丝交互原型.html'), html);

const targetScenes = path.join(distDir, 'assets', 'scenes');
fs.mkdirSync(targetScenes, { recursive: true });
for (const fileName of fs.readdirSync(sourceScenes)) {
  fs.copyFileSync(
    path.join(sourceScenes, fileName),
    path.join(targetScenes, fileName)
  );
}

// 视频背景不内联，作为独立资源复制到 dist 与交付版目录。
const sourceVideos = path.join(publicDir, 'assets', 'videos');
if (fs.existsSync(sourceVideos)) {
  const targetVideos = path.join(distDir, 'assets', 'videos');
  fs.mkdirSync(targetVideos, { recursive: true });
  for (const fileName of fs.readdirSync(sourceVideos)) {
    fs.copyFileSync(path.join(sourceVideos, fileName), path.join(targetVideos, fileName));
  }
  const deliverVideos = path.join(deliverDir, 'assets', 'videos');
  fs.mkdirSync(deliverVideos, { recursive: true });
  for (const fileName of fs.readdirSync(sourceVideos)) {
    fs.copyFileSync(path.join(sourceVideos, fileName), path.join(deliverVideos, fileName));
  }
}

console.log('Static prototype and worker entrypoint built into dist/');
