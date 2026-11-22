// render.ts が出力したHTMLを、スマートフォンで見るPNGに書き出す。
// 前提: playwright-core（または playwright）と Chromium。日本語用のフォントが要る（Noto Sans JP が望ましい）。
//
// render.ts の出力との取り決め（見た目は templates/乗換案内.css が持つ）:
//   main.route             経路の全体。幅と高さの基準にする
//   .timeline > .row       タイムラインの行。.point が地点で、画像はここで分ける
//   data-ghost="above"     画像の上端に見せる、切れ目の地点の前の行に付ける（下端は "below"）
//   data-piece-top         分けた画像の先頭になる地点に付ける
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
// 画像の端に見せる、隣の行のレールの長さ（CSS px）。
const STUB = 28;
const TIMEOUT_MS = 30_000;

// 日本語の字形で描かれるフォント。日本語がこれ以外（中国語向けなど）で描かれるときは書き出さない。
const JAPANESE_FONTS = [
  'Noto Sans JP', 'Noto Sans CJK JP', 'IPAGothic', 'IPAPGothic', 'IPAexGothic', 'Hiragino', 'ヒラギノ',
  'Yu Gothic', '游ゴシック', 'Meiryo', 'メイリオ', 'BIZ UD', 'M PLUS', 'Source Han Sans JP', 'TakaoGothic', 'VL Gothic',
];

const USAGE = '使い方: node export-png.mjs <入力.html> <出力.png> [--single-max 1150] [--split-height 900]';
const HELP = `${USAGE}
幅${WIDTH}pxを${SCALE}倍の解像度で書き出す。高さが ${DEFAULT_SINGLE_MAX}px を超えるときは、${DEFAULT_SPLIT_HEIGHT}px 前後ずつ地点の行で複数枚に分け、出力名の末尾に -1、-2 を付ける。切れ目の地点は、前の画像の最後と次の画像の最初の両方に出す。
書き出したファイルのパスを1行ずつ標準出力へ書く。`;

// このスクリプトの近くの node_modules と NODE_PATH を探し、なければ bun のグローバルの導入先を探す。
// import ではなく require で探すのは、import が NODE_PATH を見ないため。
function loadChromium() {
  const origins = [import.meta.url, pathToFileURL(join(homedir(), '.bun/install/global/'))];
  for (const origin of origins) {
    for (const name of ['playwright-core', 'playwright']) {
      try {
        return createRequire(origin)(name).chromium;
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
      }
    }
  }
  throw new Error('playwright-core が見つからない。playwright-core と Chromium を導入する。');
}

function parseArgs(args) {
  const paths = [];
  const options = { singleMax: DEFAULT_SINGLE_MAX, splitHeight: DEFAULT_SPLIT_HEIGHT };
  const names = { '--single-max': 'singleMax', '--split-height': 'splitHeight' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg in names) {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} には正の数を指定する`);
      options[names[arg]] = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知の指定: ${arg}\n${USAGE}`);
    } else {
      paths.push(arg);
    }
  }
  if (paths.length !== 2) throw new Error(USAGE);
  if (options.splitHeight > options.singleMax) throw new Error('--split-height は --single-max 以下にする');
  const [input, output] = paths.map((path) => resolve(path));
  if (!/\.html?$/i.test(input)) throw new Error('入力は .html にする');
  if (!/\.png$/i.test(output)) throw new Error('出力は .png にする');
  return { input, output, ...options };
}

// 画像を分けられる場所。最初と最後を除く地点の行で分け、その地点を前の画像の最後と次の画像の最初の両方に出す。
// end は前の画像の終わり、start は次の画像の始まりで、どちらも隣の行のレールを STUB だけ含める。
function cutsOf(rows) {
  const points = rows.filter((row) => row.point).slice(1, -1);
  return points.map(({ index }) => {
    const [before, row, after] = [rows[index - 1], rows[index], rows[index + 1]];
    return {
      index,
      start: row.top - Math.min(STUB, before.bottom - before.top),
      end: row.bottom + Math.min(STUB, after.bottom - after.top),
    };
  });
}

// 切れ目を count - 1 個選び、いちばん高い画像が最も低くなる分け方を返す。
function lowestSplit(total, cuts, count) {
  const lower = (a, b) => (a && a.tallest <= b.tallest ? a : b);
  const extend = (plan, cut) => ({
    tallest: Math.max(plan.tallest, cut.end - plan.cuts.at(-1).start),
    cuts: [...plan.cuts, cut],
  });
  // plans[i]: i 番目の切れ目で画像を終えるまでの、最良の分け方。その切れ目より前で選べないときは undefined
  let plans = cuts.map((cut) => ({ tallest: cut.end, cuts: [cut] }));
  for (let piece = 2; piece < count; piece++) {
    const previous = plans;
    plans = cuts.map((cut, i) =>
      previous.slice(0, i).filter(Boolean).map((plan) => extend(plan, cut)).reduce(lower, undefined));
  }
  return plans
    .filter(Boolean)
    .map((plan) => ({ ...plan, tallest: Math.max(plan.tallest, total - plan.cuts.at(-1).start) }))
    .reduce(lower, undefined);
}

// 高さが上限以内なら1枚。超えるときは、1枚が上限を超えない最小の枚数で分ける。
function planPieces(total, cuts, singleMax, splitHeight) {
  if (total <= singleMax) return [{ start: 0, end: total, marks: [] }];
  for (let count = Math.ceil(total / splitHeight); count <= cuts.length + 1; count++) {
    const split = lowestSplit(total, cuts, count);
    if (split === undefined || split.tallest > singleMax) continue;
    return Array.from({ length: count }, (_, i) => {
      const [from, to] = [split.cuts[i - 1], split.cuts[i]];
      return {
        start: from?.start ?? 0,
        end: to?.end ?? total,
        marks: [
          ...(from ? [[from.index - 1, 'data-ghost', 'above'], [from.index, 'data-piece-top', '']] : []),
          ...(to ? [[to.index + 1, 'data-ghost', 'below']] : []),
        ],
      };
    });
  }
  throw new Error('高さが大きすぎて、地点の行では分けられない');
}

async function measure(page) {
  const layout = await page.evaluate(() => {
    const route = document.querySelector('main.route');
    if (!route) return undefined;
    const rows = Array.from(route.querySelectorAll('.timeline > .row'), (row, index) => {
      const box = row.getBoundingClientRect();
      return {
        index,
        point: row.classList.contains('point'),
        top: Math.round(box.top + window.scrollY),
        bottom: Math.round(box.bottom + window.scrollY),
      };
    });
    return { total: Math.ceil(route.getBoundingClientRect().height), rows };
  });
  if (!layout) throw new Error('render.ts が出力したHTMLではない（main.route がない）');
  return layout;
}

const setMarks = (page, marks, on) =>
  page.evaluate(([marks, on]) => {
    const rows = document.querySelectorAll('.timeline > .row');
    for (const [index, name, value] of marks) {
      if (on) rows[index].setAttribute(name, value);
      else rows[index].removeAttribute(name);
    }
  }, [marks, on]);

async function checkJapaneseFont(page) {
  await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.id = 'font-probe';
    probe.textContent = '直骨角令';
    probe.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.querySelector('main.route').append(probe);
    // 追加した直後は、描画の準備が終わっておらず、使用フォントの一覧が空で返ることがある。
    probe.getBoundingClientRect();
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
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

async function exportPng({ input, output, singleMax, splitHeight }) {
  if (!(await stat(input)).isFile()) throw new Error('入力HTMLがファイルではない');
  await access(dirname(output));

  const browser = await loadChromium().launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: SCALE });
    page.setDefaultTimeout(TIMEOUT_MS);
    await page.goto(pathToFileURL(input).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const { total, rows } = await measure(page);
    await checkJapaneseFont(page);

    const pieces = planPieces(total, cutsOf(rows), singleMax, splitHeight);
    const stem = join(dirname(output), basename(output, extname(output)));
    const written = [];
    for (const [i, piece] of pieces.entries()) {
      await setMarks(page, piece.marks, true);
      const image = await page.screenshot({
        fullPage: true,
        clip: { x: 0, y: piece.start, width: WIDTH, height: piece.end - piece.start },
      });
      await setMarks(page, piece.marks, false);
      const file = pieces.length === 1 ? output : `${stem}-${i + 1}.png`;
      await writeFile(file, image);
      written.push(file);
    }
    console.error(`高さ ${total}px を ${written.length} 枚に書き出した（1枚で出す上限 ${singleMax}px、分ける目安 ${splitHeight}px）`);
    for (const file of written) console.log(file);
  } finally {
    await browser.close();
  }
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) console.log(HELP);
  else await exportPng(parseArgs(args));
} catch (error) {
  console.error(`PNGの書き出しに失敗: ${error.message}`);
  process.exitCode = 1;
}
