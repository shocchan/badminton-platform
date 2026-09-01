// @vitest-environment jsdom
// 起動案内を**実際に走らせて**確かめる（2026-09-01）。
//
// index.html に書いた文字列を目で読むだけでは、
// 「本当に画面へ出るのか」「日本語と中国語を出し分けられるのか」が分からない。
// スクリプトを取り出して jsdom で実行し、出てくるものを見る。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const HTML = readFileSync('index.html', 'utf8');

/** index.html の起動案内スクリプトの中身だけを取り出す */
const scriptBody = (): string => {
  const m = /<script>\s*(\(function \(\) \{\s*var WAIT_MS[\s\S]*?\}\)\(\);)\s*<\/script>/.exec(HTML);
  expect(m, '起動案内のスクリプトが取り出せない').toBeTruthy();
  return m![1];
};

/** #root を空にした状態でスクリプトを走らせ、6秒経過させる */
const runWith = (opts: { path: string; htmlLang?: string; rootChild?: boolean }) => {
  document.documentElement.lang = opts.htmlLang ?? 'ja';
  document.body.innerHTML = '<div id="root"></div>';
  if (opts.rootChild) document.getElementById('root')!.appendChild(document.createElement('span'));
  // location は jsdom では書き換えられないので、必要な値だけ差し替える
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: opts.path, href: 'https://kawabado.com' + opts.path },
  });
  // eslint-disable-next-line no-new-func
  new Function(scriptBody())();
  window.dispatchEvent(new Event('load'));
  vi.advanceTimersByTime(9000);
  return document.getElementById('root')!.textContent ?? '';
};

describe('起動案内が実際に画面へ出る', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('日本語のページでは日本語で出る', () => {
    const t = runWith({ path: '/ja/ai-course/login' });
    expect(t).toContain('ページが開けませんでした');
    expect(t).toContain('Chrome');
    expect(t).not.toContain('页面没能正常打开');
  });

  it('中国語のページでは中国語で出る', () => {
    const t = runWith({ path: '/zh/ai-course/login', htmlLang: 'zh' });
    expect(t).toContain('页面没能正常打开');
    expect(t).toContain('极速模式');
    expect(t).not.toContain('ページが開けませんでした');
  });

  it('html の lang が ja でも、URLが /zh なら中国語で出す', () => {
    // Worker が lang を差し替えられなかった場合でも、見る人の言語に寄せる
    const t = runWith({ path: '/zh/ai-course/login', htmlLang: 'ja' });
    expect(t).toContain('页面没能正常打开');
  });

  it('起動できていれば何も出さない', () => {
    const t = runWith({ path: '/ja/ai-course/login', rootChild: true });
    expect(t).not.toContain('ページが開けませんでした');
  });

  it('待ち時間の前には出さない（遅い回線で早とちりしない）', () => {
    document.documentElement.lang = 'ja';
    document.body.innerHTML = '<div id="root"></div>';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/ja/ai-course/login', href: 'https://kawabado.com/ja/ai-course/login' },
    });
    // eslint-disable-next-line no-new-func
    new Function(scriptBody())();
    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(3000);
    expect(document.getElementById('root')!.textContent).not.toContain('ページが開けませんでした');
    vi.advanceTimersByTime(4000);
    expect(document.getElementById('root')!.textContent).toContain('ページが開けませんでした');
  });

  it('いまのURLを載せる（本人が何を開いていたか分かる）', () => {
    const t = runWith({ path: '/zh/ai-course/login', htmlLang: 'zh' });
    expect(t).toContain('kawabado.com/zh/ai-course/login');
  });
});
