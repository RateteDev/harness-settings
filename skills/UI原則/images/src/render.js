// build.pyが書き出したHTMLを、1枚ずつPNGにする。
// 使い方: node render.js <HTMLのディレクトリ> <PNGの出力先>
// 文字の細部が潰れないよう、2倍の解像度で書き出す。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [srcDir, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 });
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith('.html')).sort()) {
    await page.goto('file://' + path.resolve(srcDir, file), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.locator('body').screenshot({ path: path.join(outDir, file.replace(/\.html$/, '.png')) });
  }
  await browser.close();
})();
