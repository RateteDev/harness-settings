// render.ts が出力したHTMLを、スマートフォンで見るPNGに書き出す。
// 使い方: node export-png.mjs <入力.html> <出力.png> [--single-max 1150] [--split-height 900]
// 前提: playwright-core（または playwright）と Chromium。日本語用のフォントが要る（Noto Sans JP が望ましい）。
import { createRequire } from 'node:module';
import { access, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// render.ts の出力幅。人が見る画像なので2倍の解像度で撮る。
const WIDTH = 408;
const SCALE = 2;
// 高さ（CSS px）がこの値以下なら1枚で出す。1100px前後までは1枚で見られるという感覚に、丸めを見込んで合わせた。
// 超えるときは、スマートフォンの1画面に収まる900px前後ずつに分ける。
const DEFAULT_SINGLE_MAX = 1150;
const DEFAULT_SPLIT_HEIGHT = 900;
// 次の画像の頭に見せる、直前の区間のレールの長さ（CSS px）。続きであることを示す。
const STUB_MAX = 28;
const TIMEOUT_MS = 30_000;

// 日本語の字形で描かれるフォント。日本語がこれ以外（中国語向けなど）で描かれるときは書き出さない。
const JAPANESE_FONTS = [
  'Noto Sans JP', 'Noto Sans CJK JP', 'IPAGothic', 'IPAPGothic', 'IPAexGothic', 'Hiragino', 'ヒラギノ',
  'Yu Gothic', '游ゴシック', 'Meiryo', 'メイリオ', 'BIZ UD', 'M PLUS', 'Source Han Sans JP', 'TakaoGothic', 'VL Gothic',
];

const usage = '使い方: node export-png.mjs <入力.html> <出力.png> [--single-max 1150] [--split-height 900]';

async function loadChromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  const require = createRequire(import.meta.url);
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(name).chromium;
    } catch { /* 次の候補へ */ }
  }
  const fallback = join(homedir(), '.bun/install/global/node_modules/playwright-core/index.mjs');
  try {
    return (await import(pathToFileURL(fallback).href)).chromium;
  } catch {
    throw new Error('playwright-core が見つからない。playwright-core と Chromium を導入する。');
  }
}

function parseArgs(args) {
  const positional = [];
  const options = { singleMax: DEFAULT_SINGLE_MAX, splitHeight: DEFAULT_SPLIT_HEIGHT };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--single-max' || arg === '--split-height') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} には正の数を指定する`);
      if (arg === '--single-max') options.singleMax = value;
      else options.splitHeight = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知の指定: ${arg}\n${usage}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 2) throw new Error(usage);
  if (options.splitHeight > options.singleMax) throw new Error('--split-height は --single-max 以下にする');
  return { input: resolve(positional[0]), output: resolve(positional[1]), ...options };
}

// 高さが上限以内なら1枚。超えるときは、地点の行で分ける。
// 切れ目の地点は、前の画像の最後と次の画像の最初の両方に出し、次の画像をその地点から再開する。
// 枚数は、1枚が上限を超えない最小にし、その枚数で、いちばん高い画像が最も低くなる地点を選ぶ。
function planPieces(total, nodes, singleMax, splitHeight) {
  if (total <= singleMax) return [{ start: 0, end: total }];
  // 地点の行の頭にある区切り線は前の画像に残す。次の画像は、その1px下から、直前の区間のレールの分だけ上へ広げる。
  const startOf = (node) => node.top + 1 - node.stub;
  for (let n = Math.ceil(total / splitHeight); n <= nodes.length + 1; n++) {
    // best[j][i]: j+1枚目の終わりを地点 i にしたときの、ここまでの最大の高さと、1つ前の地点
    const best = [nodes.map((node, i) => ({ max: node.bottom, prev: -1, i }))];
    for (let j = 1; j < n - 1; j++) {
      best.push(nodes.map((node, i) => {
        let pick = { max: Infinity, prev: -1, i };
        for (let p = 0; p < i; p++) {
          const max = Math.max(best[j - 1][p].max, node.bottom - startOf(nodes[p]));
          if (max < pick.max) pick = { max, prev: p, i };
        }
        return pick;
      }));
    }
    let last = { max: Infinity, i: -1 };
    nodes.forEach((node, i) => {
      const max = Math.max(best[n - 2][i].max, total - startOf(node));
      if (max < last.max) last = { max, i };
    });
    if (last.i < 0 || last.max > singleMax) continue;
    const picked = [];
    for (let j = n - 2, i = last.i; j >= 0; i = best[j][i].prev, j--) picked.unshift(nodes[i]);
    return Array.from({ length: n }, (_, k) => {
      const from = k === 0 ? undefined : picked[k - 1];
      const to = k === n - 1 ? undefined : picked[k];
      return { start: from ? startOf(from) : 0, end: to ? to.bottom : total, prevRow: from && from.stub > 0 ? from.prevRow : undefined, startNode: from?.index, endNode: to?.index };
    });
  }
  throw new Error('高さが大きすぎて、地点の行では分けられない');
}

async function checkJapaneseFont(page) {
  const hasRoute = await page.evaluate(() => {
    const route = document.querySelector('main.route');
    if (!route) return false;
    const probe = document.createElement('span');
    probe.id = 'font-probe';
    probe.textContent = '直骨角令';
    probe.style.cssText = 'position:absolute;left:-9999px;top:0';
    route.append(probe);
    return true;
  });
  // 追加した直後は、描画の準備が終わっておらず、使用フォントの一覧が空で返ることがある。
  await page.evaluate(() => new Promise((resolve) => {
    document.getElementById('font-probe').getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  if (!hasRoute) throw new Error('render.ts が出力したHTMLではない（main.route がない）');
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#font-probe' });
  if (!nodeId) throw new Error('フォントの確認用の要素を作れない');
  let fonts = [];
  for (let attempt = 0; attempt < 5 && fonts.length === 0; attempt++) {
    if (attempt > 0) await page.waitForTimeout(100);
    ({ fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId }));
  }
  await page.evaluate(() => document.getElementById('font-probe').remove());
  const names = fonts.map((font) => font.familyName);
  if (names.length === 0 || !names.every((name) => JAPANESE_FONTS.some((ok) => name.includes(ok)))) {
    throw new Error(`日本語が日本語用ではないフォントで描かれる: ${names.join('、') || '不明'}\nNoto Sans JP などの日本語フォントを導入する。`);
  }
}

async function exportPng() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`${usage}\n幅${WIDTH}pxを${SCALE}倍の解像度で書き出す。高さが ${DEFAULT_SINGLE_MAX}px を超えるときは、${DEFAULT_SPLIT_HEIGHT}px 前後ずつ地点の行で複数枚に分け、出力名の末尾に -1、-2 を付ける。切れ目の地点は、前の画像の最後と次の画像の最初の両方に出す。\n書き出したファイルのパスを1行ずつ標準出力へ書く。`);
    return;
  }
  const { input, output, singleMax, splitHeight } = parseArgs(args);
  if (!/\.html?$/i.test(input)) throw new Error('入力は .html にする');
  if (!/\.png$/i.test(output)) throw new Error('出力は .png にする');
  if (!(await stat(input)).isFile()) throw new Error('入力HTMLがファイルではない');
  await access(dirname(output));

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: SCALE });
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.goto(pathToFileURL(input).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await checkJapaneseFont(page);

    const { total, nodes, rails } = await page.evaluate((STUB_MAX) => {
      const top = (element) => Math.round(element.getBoundingClientRect().top + window.scrollY);
      const bottom = (element) => Math.round(element.getBoundingClientRect().bottom + window.scrollY);
      const route = document.querySelector('main.route');
      const rows = Array.from(document.querySelectorAll('.timeline .row.node'));
      const allRows = Array.from(document.querySelectorAll('.timeline .row'));
      // 直前の行が区間ならその高さの範囲で、地点の行なら点より下の余白の範囲で、レールを見せる。
      const stubOf = (row, max) => {
        const prev = row.previousElementSibling;
        if (!prev) return 0;
        const height = prev.getBoundingClientRect().height;
        const dot = prev.querySelector('.rail-dot');
        const room = dot ? height - (dot.getBoundingClientRect().bottom - prev.getBoundingClientRect().top) - 3 : height - 4;
        return Math.max(0, Math.min(max, Math.floor(room)));
      };
      return {
        total: Math.ceil(route.getBoundingClientRect().height),
        // 最初と最後の地点では切らない。
        nodes: rows.map((row, index) => ({
          index, top: top(row), bottom: bottom(row), stub: stubOf(row, STUB_MAX),
          prevRow: allRows.indexOf(row) - 1,
        })).slice(1, -1),
        rails: rows.map((row) => ({ above: row.dataset.above, below: row.dataset.below })),
      };
    }, STUB_MAX);
    const pieces = planPieces(total, nodes, singleMax, splitHeight);

    // 画像の端になる地点は、切れた側のレールを消し、前の画像は地点で終わり、次の画像は地点から始まる形にする。
    const setRail = (index, side, value) =>
      page.evaluate(([i, key, v]) => { document.querySelectorAll('.timeline .row.node')[i].dataset[key] = v; }, [index, side, value]);
    // 地点の行の頭にある区切り線は、広げた範囲に入るため、次の画像では消す。
    const hideDivider = (index, hidden) =>
      page.evaluate(([i, h]) => {
        document.querySelectorAll('.timeline .row.node')[i].querySelector('.body').style.borderTopColor = h ? 'transparent' : '';
      }, [index, hidden]);
    const hideRowText = (rowIndex, hidden) =>
      page.evaluate(([i, h]) => {
        const row = document.querySelectorAll('.timeline .row')[i];
        row.querySelectorAll('.side, .body').forEach((el) => { el.style.visibility = h ? 'hidden' : ''; });
      }, [rowIndex, hidden]);
    const written = [];
    const stem = join(dirname(output), basename(output, extname(output)));
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (piece.prevRow !== undefined) await hideRowText(piece.prevRow, true);
      if (piece.startNode !== undefined) await hideDivider(piece.startNode, true);
      if (piece.endNode !== undefined) await setRail(piece.endNode, 'below', 'none');
      const file = pieces.length === 1 ? output : `${stem}-${i + 1}.png`;
      const image = await page.screenshot({
        fullPage: true,
        clip: { x: 0, y: piece.start, width: WIDTH, height: piece.end - piece.start },
      });
      await writeFile(file, image);
      written.push(file);
      if (piece.prevRow !== undefined) await hideRowText(piece.prevRow, false);
      if (piece.startNode !== undefined) await hideDivider(piece.startNode, false);
      if (piece.endNode !== undefined) await setRail(piece.endNode, 'below', rails[piece.endNode].below);
    }
    console.error(`高さ ${total}px を ${written.length} 枚に書き出した（1枚で出す上限 ${singleMax}px、分ける目安 ${splitHeight}px）`);
    written.forEach((file) => console.log(file));
  } finally {
    await browser.close();
  }
}

try {
  await exportPng();
} catch (error) {
  console.error(`PNGの書き出しに失敗: ${error.message}`);
  process.exitCode = 1;
}
