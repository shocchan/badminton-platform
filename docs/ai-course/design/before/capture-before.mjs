// 改善前記録の撮影スクリプト（Adventure V2 冒険マップ／今日の冒険・staging）。
//
// 使い方（playwright が入った作業ディレクトリから実行する。`npm i playwright@1.57` 済みの場所）:
//   AI_COURSE_TEST_ID=test AI_COURSE_TEST_PW='<pw>' node docs/ai-course/design/before/capture-before.mjs
// 任意の環境変数:
//   AI_COURSE_BASE     … 既定 https://staging.badminton-platform.pages.dev（本番は使わない）
//   AI_COURSE_OUT      … 既定 このファイルと同じ before/ ディレクトリ
//   AI_COURSE_SCRATCH  … 本文テキストの一時保存先（既定 /tmp 配下）。個人情報が写っていないか目視確認に使う
//   PW_CHROMIUM        … Chromium 実行ファイル（playwright 同梱のビルドが無い場合のみ指定）
//
// 注意:
//   - testアカウント専用。実在生徒でログインしない。パスワードはファイルに書かない（環境変数で渡す）
//   - 撮影は fullPage。幅 375 / 768 / 1440、言語 ja / zh、画面 home（今日の冒険）/ map（冒険マップ）
//   - ネットワーク記録は画像/フォント/メディアのみ assets-network.json に残す（URL・type・bytes・ms・phase）
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AI_COURSE_BASE || 'https://staging.badminton-platform.pages.dev';
const OUT = process.env.AI_COURSE_OUT || HERE;
const SCRATCH = process.env.AI_COURSE_SCRATCH || fs.mkdtempSync(path.join(os.tmpdir(), 'ai-course-before-'));
const LOGIN_ID = process.env.AI_COURSE_TEST_ID || 'test';
const LOGIN_PW = process.env.AI_COURSE_TEST_PW;
if (!LOGIN_PW) { console.error('AI_COURSE_TEST_PW を環境変数で渡してください'); process.exit(2); }
if (/kawabado\.com|study\.kawabado/.test(BASE)) { console.error('本番URLは対象外です'); process.exit(2); }

const WIDTHS = [375, 768, 1440];
const HEIGHTS = { 375: 812, 768: 1024, 1440: 900 };
const LANGS = ['ja', 'zh'];
const LABEL = {
  ja: { map: '冒険マップ', home: '今日の冒険', login: 'ログイン' },
  zh: { map: '冒险地图', home: '今日的冒险', login: '登录' },
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });
const assetLog = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureLoggedIn(page, lang) {
  await page.goto(`${BASE}/${lang}/ai-course?app=1`, { waitUntil: 'networkidle', timeout: 60000 });
  const idInput = page.locator('input[autocomplete="username"]');
  if (await idInput.count() && await idInput.first().isVisible()) {
    await idInput.first().fill(LOGIN_ID);
    await page.locator('input[type="password"]').first().fill(LOGIN_PW);
    await page.getByRole('button', { name: LABEL[lang].login, exact: true }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await sleep(1500);
    if (await page.locator('input[type="password"]').count()) {
      throw new Error(`ログインに失敗（${lang}）。IDまたはパスワードを確認してください`);
    }
  }
}

function attachNetworkLog(page, meta) {
  page.on('response', async (res) => {
    const req = res.request();
    const rt = req.resourceType();
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    const isAsset = rt === 'image' || rt === 'font' || rt === 'media'
      || /\.(svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|mp3|mp4)(\?|$)/i.test(url) || /^image\//.test(ct);
    if (!isAsset) return;
    let bytes = Number(res.headers()['content-length'] || 0);
    if (!bytes) { try { bytes = (await res.body()).length; } catch { bytes = 0; } }
    let ms = null;
    try { const t = req.timing(); if (t && t.responseEnd >= 0) ms = Math.round(t.responseEnd); } catch { /* ignore */ }
    assetLog.push({ ...meta(), url, type: rt, contentType: ct.split(';')[0], bytes, ms, status: res.status() });
  });
}

const textSnapshot = async (page) => (await page.evaluate(() => document.body.innerText)).slice(0, 20000);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
// 1回だけログインし、storageState を全コンテキストで使い回す（試行回数を増やさない）
const boot = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const bootPage = await boot.newPage();
await ensureLoggedIn(bootPage, 'ja');
const statePath = path.join(SCRATCH, 'state.json');
fs.writeFileSync(statePath, JSON.stringify(await boot.storageState()));
await boot.close();
console.log('logged in');

for (const lang of LANGS) {
  for (const width of WIDTHS) {
    const isMobile = width < 768;
    const ctx = await browser.newContext({
      viewport: { width, height: HEIGHTS[width] }, deviceScaleFactor: 1, isMobile, hasTouch: isMobile,
      storageState: statePath, locale: lang === 'zh' ? 'zh-CN' : 'ja-JP',
    });
    const page = await ctx.newPage();
    let phase = 'home';
    attachNetworkLog(page, () => ({ lang, width, phase }));
    await ensureLoggedIn(page, lang);
    const homeBtn = page.getByRole('button', { name: LABEL[lang].home }).filter({ visible: true });
    if (await homeBtn.count()) { await homeBtn.first().click(); await sleep(800); }
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await sleep(1500);
    fs.writeFileSync(path.join(SCRATCH, `text-home-${lang}-${width}.txt`), await textSnapshot(page));
    await page.screenshot({ path: path.join(OUT, `before-home-${lang}-${width}.png`), fullPage: true });
    console.log(`home ${lang} ${width} ok`);

    phase = 'map';
    const mapBtn = page.getByRole('button', { name: LABEL[lang].map }).filter({ visible: true });
    if (!(await mapBtn.count())) { console.log(`!! map button not found for ${lang} ${width}`); }
    else {
      await mapBtn.first().click();
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
      await sleep(2500); // 霧晴れ等のアニメーションを落ち着かせる
      fs.writeFileSync(path.join(SCRATCH, `text-map-${lang}-${width}.txt`), await textSnapshot(page));
      await page.screenshot({ path: path.join(OUT, `before-map-${lang}-${width}.png`), fullPage: true });
      console.log(`map ${lang} ${width} ok`);
    }
    await ctx.close();
  }
}
await browser.close();
fs.rmSync(statePath, { force: true }); // セッショントークンを残さない
fs.writeFileSync(path.join(OUT, 'assets-network.json'), JSON.stringify(assetLog, null, 2));
console.log('assets logged:', assetLog.length, '| text snapshots in', SCRATCH, '(個人情報の目視確認に使い、確認後に削除)');
