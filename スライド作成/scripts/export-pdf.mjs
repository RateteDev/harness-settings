// 使い方: node export-pdf.mjs [入力.html] [出力.pdf]
// 既定の入力は作業ディレクトリーの発表スライド.html 出力は入力と同じ場所・同じ名前の.pdf
// 前提: playwright-core と Chromium の導入 Google Fonts を使う場合はネットワーク接続
import { access, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_INPUT = '発表スライド.html';
const TIMEOUT_MS = 30_000;
const usage = 'Usage: node export-pdf.mjs [input.html] [output.pdf]';

function resourceLabel(value) {
  const url = new URL(value);
  // 認証情報やクエリの秘密値を診断へ含めない
  if (url.protocol === 'data:') return 'data: resource';
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.href;
}

async function loadChromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const fallback = join(homedir(), '.bun/install/global/node_modules/playwright-core/index.mjs');
    try {
      return (await import(pathToFileURL(fallback).href)).chromium;
    } catch {
      throw new Error('playwright-core is unavailable. Install playwright-core and its Chromium browser.');
    }
  }
}

async function exportPdf() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`${usage}\nDefault input: ${DEFAULT_INPUT} in the current working directory.\nDefault output: the input path with its extension replaced by .pdf.`);
    return;
  }
  if (args.length > 2 || args.some(arg => arg.startsWith('-'))) throw new Error(usage);
  const input = resolve(args[0] ?? DEFAULT_INPUT);
  const output = resolve(args[1] ?? join(dirname(input), `${basename(input, extname(input))}.pdf`));
  if (!/\.html?$/i.test(input)) throw new Error('The input path must end in .html or .htm.');
  if (!/\.pdf$/i.test(output) || output === input) throw new Error('The output must be a separate .pdf file.');
  if (!(await stat(input)).isFile()) throw new Error('The input HTML path must be a file.');
  await access(dirname(output));

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    page.setDefaultNavigationTimeout(TIMEOUT_MS);
    const failures = new Set();
    page.on('requestfailed', request => failures.add(
      `${request.failure()?.errorText ?? 'Request failed'}: ${resourceLabel(request.url())}`
    ));
    page.on('response', response => {
      if (response.status() >= 400) failures.add(`HTTP ${response.status()}: ${resourceLabel(response.url())}`);
    });
    page.on('pageerror', error => failures.add(`Page script error: ${error.message}`));
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(input).href, { waitUntil: 'load' });

    // 印刷時は全スライドを表示し 遅延画像も含めて実際に復号する
    const imageFailures = await page.evaluate(async () => {
      const errors = await Promise.all(Array.from(document.images, async (image, index) => {
        image.loading = 'eager';
        try {
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
          return null;
        } catch {
          return { index: index + 1, source: image.currentSrc || image.src };
        }
      }));
      await document.fonts.ready;
      return errors.filter(Boolean);
    });
    imageFailures.forEach(({ index, source }) => failures.add(
      `Image ${index} could not be decoded${source ? `: ${resourceLabel(source)}` : ' (no source)'}.`
    ));
    const fontFailures = await page.evaluate(() => Array.from(document.fonts)
      .filter(font => font.status === 'error').map(font => font.family));
    fontFailures.forEach(family => failures.add(`Font could not be loaded: ${family}`));
    if (failures.size) throw new Error(`Resource loading failed:\n${Array.from(failures).join('\n')}`);

    const deck = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const dimension = name => {
        const value = root.getPropertyValue(name).trim();
        if (!/^\d+(?:\.\d+)?px$/.test(value) || Number.parseFloat(value) <= 0) {
          throw new Error(`${name} must be a positive dimension in px.`);
        }
        return Number.parseFloat(value);
      };
      const width = dimension('--slide-width');
      const height = dimension('--slide-height');
      const stage = document.getElementById('stage');
      if (!stage || getComputedStyle(stage).transform !== 'none') {
        throw new Error('The print stage must exist and have no transform.');
      }
      const slides = Array.from(stage.querySelectorAll('.slide'));
      if (!slides.length) throw new Error('No slides were found inside #stage.');
      slides.forEach((slide, index) => {
        const headings = slide.querySelectorAll('h1');
        const numbers = slide.querySelectorAll('.pn');
        if (headings.length !== 1 || numbers.length !== 1) {
          throw new Error(`Slide ${index + 1} must have exactly one h1 and one .pn.`);
        }
        const expectedNumber = `${String(index + 1).padStart(2, '0')}/${String(slides.length).padStart(2, '0')}`;
        if (numbers[0].textContent.trim() !== expectedNumber) {
          throw new Error(`Slide ${index + 1} has not been numbered by the viewer.`);
        }
        const bounds = slide.getBoundingClientRect();
        if (getComputedStyle(slide).display === 'none' || Math.abs(bounds.width - width) > 0.1 || Math.abs(bounds.height - height) > 0.1) {
          throw new Error(`Slide ${index + 1} has incorrect print dimensions or is hidden.`);
        }
      });
      return { width, height, count: slides.length };
    });
    const pdf = await page.pdf({
      width: `${deck.width}px`,
      height: `${deck.height}px`,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });
    if (failures.size) throw new Error(`Resource loading failed:\n${Array.from(failures).join('\n')}`);
    await writeFile(output, pdf);
    console.log(`Exported ${deck.count} slides (${deck.width}x${deck.height}px) to ${output}`);
  } finally {
    await browser.close();
  }
}

try {
  await exportPdf();
} catch (error) {
  console.error(`PDF export failed: ${error.message}`);
  process.exitCode = 1;
}
