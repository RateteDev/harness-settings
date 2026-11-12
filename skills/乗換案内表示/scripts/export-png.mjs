// render.ts が出力したHTMLを、スマートフォンで見るPNGに書き出す。
// 使い方: node export-png.mjs <入力.html> <出力.png> [--max-height 1500] [--grace 0.2]
// 前提: playwright-core（または playwright）と Chromium。日本語用のフォントが要る（Noto Sans JP が望ましい）。
import { createRequire } from 'node:module';
import { access, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// render.ts の出力幅。人が見る画像なので2倍の解像度で撮る。
const WIDTH = 408;
const SCALE = 2;
// 1枚に許す高さ（CSS px）は、スマートフォンの画面およそ1.7枚分。
// これを猶予の割合だけ超えても1枚のままにし、それ以上のときだけ分ける。
const DEFAULT_MAX_HEIGHT = 1500;
const DEFAULT_GRACE = 0.2;
const TIMEOUT_MS = 30_000;

// 日本語の字形で描かれるフォント。日本語がこれ以外（中国語向けなど）で描かれるときは書き出さない。
const JAPANESE_FONTS = [
  'Noto Sans JP', 'Noto Sans CJK JP', 'IPAGothic', 'IPAPGothic', 'IPAexGothic', 'Hiragino', 'ヒラギノ',
  'Yu Gothic', '游ゴシック', 'Meiryo', 'メイリオ', 'BIZ UD', 'M PLUS', 'Source Han Sans JP', 'TakaoGothic', 'VL Gothic',
];

const usage = '使い方: node export-png.mjs <入力.html> <出力.png> [--max-height 1500] [--grace 0.2]';

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
  const options = { maxHeight: DEFAULT_MAX_HEIGHT, grace: DEFAULT_GRACE };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--max-height' || arg === '--grace') {
      const value = Number(args[++i]);
      const valid = arg === '--max-height' ? value > 0 : value >= 0;
      if (!Number.isFinite(value) || !valid) {
        throw new Error(`${arg} には${arg === '--grace' ? '0以上' : '正'}の数を指定する`);
      }
      if (arg === '--max-height') options.maxHeight = value;
      else options.grace = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知の指定: ${arg}\n${usage}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 2) throw new Error(usage);
  return { input: resolve(positional[0]), output: resolve(positional[1]), ...options };
}

// 全体の高さがしきい値以内なら1枚。超えるときは、行の境目だけで、なるべく均等に分ける。
function planCuts(total, cuts, maxHeight, grace) {
  const limit = maxHeight * (1 + grace);
  if (total <= limit) return [0, total];
  for (let n = Math.ceil(total / maxHeight); n <= cuts.length + 1; n++) {
    const bounds = [0];
    for (let i = 1; i < n; i++) {
      const target = (total * i) / n;
      const candidates = cuts.filter((c) => c > bounds[bounds.length - 1]);
      if (candidates.length === 0) break;
      bounds.push(candidates.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)));
    }
    bounds.push(total);
    const heights = bounds.slice(1).map((b, i) => b - bounds[i]);
    if (bounds.length === n + 1 && heights.every((h) => h > 0 && h <= limit)) return bounds;
  }
  throw new Error('高さが大きすぎて、行の境目では分けられない');
}

// 数字や空白は Roboto などで描かれるため、日本語の文字だけを入れた確認用の要素で調べる。
// 字形が日本語と中国語で違う漢字を使う。
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
  if (!hasRoute) throw new Error('render.ts が出力したHTMLではない（main.route がない）');
  const session = await page.context().newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument');
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#font-probe' });
  if (!nodeId) throw new Error('フォントの確認用の要素を作れない');
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  await page.evaluate(() => document.getElementById('font-probe').remove());
  const names = fonts.map((font) => font.familyName);
  if (names.length === 0 || !names.every((name) => JAPANESE_FONTS.some((ok) => name.includes(ok)))) {
    throw new Error(`日本語が日本語用ではないフォントで描かれる: ${names.join('、') || '不明'}\nNoto Sans JP などの日本語フォントを導入する。`);
  }
}

async function exportPng() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`${usage}\n幅${WIDTH}pxを${SCALE}倍の解像度で書き出す。高さが ${DEFAULT_MAX_HEIGHT}px の ${1 + DEFAULT_GRACE} 倍を超えるときは、行の境目で複数枚に分け、出力名の末尾に -1、-2 を付ける。\n書き出したファイルのパスを1行ずつ標準出力へ書く。`);
    return;
  }
  const { input, output, maxHeight, grace } = parseArgs(args);
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

    const { total, cuts } = await page.evaluate(() => {
      const top = (element) => element.getBoundingClientRect().top + window.scrollY;
      const route = document.querySelector('main.route');
      // 駅の行の頭で切る。次の画像が駅の行から始まり、レールが上からつながる。
      const nodes = Array.from(document.querySelectorAll('.timeline .row.node')).slice(1);
      return { total: Math.ceil(route.getBoundingClientRect().height), cuts: nodes.map((row) => Math.round(top(row)) + 1) };
    });
    const bounds = planCuts(total, cuts, maxHeight, grace);

    const written = [];
    const stem = join(dirname(output), basename(output, extname(output)));
    for (let i = 0; i < bounds.length - 1; i++) {
      const file = bounds.length === 2 ? output : `${stem}-${i + 1}.png`;
      const image = await page.screenshot({
        fullPage: true,
        clip: { x: 0, y: bounds[i], width: WIDTH, height: bounds[i + 1] - bounds[i] },
      });
      await writeFile(file, image);
      written.push(file);
    }
    console.error(`高さ ${total}px を ${written.length} 枚に書き出した（1枚の許容 ${maxHeight}px、猶予 ${Math.round(grace * 100)}%）`);
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
