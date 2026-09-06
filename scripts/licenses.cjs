const fs = require('node:fs');
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
if (process.argv.includes('--dist')) {
  for (const file of ['LICENSE', 'THIRD_PARTY.md']) fs.copyFileSync(file, path.join('dist', file));
} else {
  const read = (file) => fs.readFileSync(file, 'utf8');
  const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const version = JSON.parse(read('node_modules/box2d-wasm/package.json')).version;
  const notices = [
    ['원본 · lazygyu/roulette (MIT)', 'https://github.com/lazygyu/roulette', read('LICENSE')],
    ['box2d-wasm ' + version + ' (Zlib)', 'https://github.com/Birch-san/box2d-wasm', read('node_modules/box2d-wasm/LICENSE.zlib.txt')],
    ['Box2D 2.4.1 (MIT)', 'https://github.com/erincatto/box2d/tree/v2.4.1', read('licenses/Box2D.MIT.txt')],
    ['box2d.js · WebIDL bindings (Zlib)', 'https://github.com/kripken/box2d.js', read('licenses/box2d-js.Zlib.txt')],
    ['wasm-feature-detect (Apache-2.0)', 'https://github.com/GoogleChromeLabs/wasm-feature-detect', 'Copyright 2019 Google Inc. All Rights Reserved.\n\n' + read('node_modules/box2d-wasm/LICENSE.wasm-feature-detect.Apache.txt')],
    ['Emscripten · 런타임 고지', 'https://github.com/emscripten-core/emscripten', read('licenses/Emscripten.txt')],
  ];
  fs.writeFileSync('licenses.html', `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>오픈소스 라이선스 · 바울 핀볼</title>
<style>html{color-scheme:dark}body{margin:0;background:#090c10;color:#dce3ed;font:15px/1.7 system-ui,sans-serif}main{max-width:860px;margin:auto;padding:32px 24px}a{color:#64f4e0}h1{font-size:26px}h2{font-size:18px}section{margin-top:36px;border-top:1px solid #29313e;padding-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 ui-monospace,monospace}</style>
</head><body><main><a href="./index.html">← 게임으로 돌아가기</a><h1>오픈소스 라이선스</h1>
<p>이 게임은 lazygyu/roulette의 일부 코드를 수정해 만든 프로젝트입니다. 원작자의 공식 배포판이 아닙니다.</p>
<p>원본 맵 4개, 맵 타입과 초기 물리 어댑터를 바탕으로 화면, 맵 편집기, 저장, 녹화 및 게임 기능을 추가·수정했습니다. 아래 저작권 표시와 라이선스는 해당 원본 및 구성요소에 적용됩니다.</p>
${notices.map(([title, url, text]) => '<section><h2>' + escape(title) + '</h2><a href="' + url + '">원본 저장소</a><pre>' + escape(text) + '</pre></section>').join('\n')}
</main></body></html>`);
}
