// 「自分の文章で復習」の画面を、実物のコンポーネントのまま1枚のHTMLにして見せる（CEO確認用）。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-personal-pack-shots.tsx
// 出力: /tmp/personal-pack-shots.html（読み取りのみ・DBには一切触らない）
//
// なぜスクショではなく実物を描くのか:
//   手で作ったモックは、実装とずれても誰も気づけない。ここでは本物の
//   AdvPersonalPackRunner を jsdom 上で動かし、実際にボタンを押した後のDOMを写し取る。
//   CSSは本番ビルドの dist/assets/*.css をそのまま埋め込む＝見え方も実物と同じ。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(import.meta.dirname, '../..');

/* ── jsdom を先に立ててから React を読み込む（document が無いと import で落ちる） ── */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://study.kawabado.com/',
  pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// navigator は getter しか無い環境があるので、置ける場合だけ置く
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: FrameRequestCallback) => dom.window.setTimeout(() => cb(0), 0);
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
const { AdvPersonalPackRunner } = await import('../../src/components/ai-course/adventure/AdvPersonalPackRunner');
const { defaultAdvProfile } = await import('../../src/lib/aiLesson/course/adventure/advProfile');
const { restorePersonalPacks, withAnswer, emptyPersonalPackState } =
  await import('../../src/lib/aiLesson/course/adventure/personal/advPersonalPack');
type Profile = import('../../src/lib/aiLesson/course/adventure/advTypes').AdventureV2Profile;

const packDir = join(ROOT, 'docs/ai-course/personal-packs');
const packFile = process.argv[2] ?? readdirSync(packDir).filter((f) => f.endsWith('.json'))[0]!;
const raw = JSON.parse(readFileSync(join(packDir, packFile), 'utf8'));
const packs = restorePersonalPacks([raw]);

const baseProfile = (): Profile => ({
  ...defaultAdvProfile('2026-08-24T00:00:00.000Z'),
  enabled: true,
  personalPacks: packs,
});

/** 1画面ぶん撮る。操作は本物のクリックで進める */
const shot = (
  titleJa: string, noteJa: string, profile: Profile, drive: (lang: 'ja' | 'zh') => void, lang: 'ja' | 'zh' = 'ja',
) => {
  const view = render(React.createElement(AdvPersonalPackRunner, {
    lang, profile, onSave: () => {}, onBack: () => {},
  }));
  drive(lang);
  const html = view.container.innerHTML;
  cleanup();
  return { titleJa, noteJa, html };
};

const click = (re: RegExp | string) => fireEvent.click(
  typeof re === 'string' ? screen.getByRole('button', { name: re }) : screen.getByRole('button', { name: re }),
);

const pack = packs[0]!;
const firstItem = pack.items[0]!;
const clozeItem = pack.items.find((i) => i.kind === 'cloze')!;
const meaningItem = pack.items.find((i) => i.kind === 'meaning')!;

/** 途中まで練習した状態（記録の見え方を見せるため） */
const practiced = (): Profile => {
  let st = emptyPersonalPackState();
  st = withAnswer(st, pack.packId, pack.items[0]!.id, true, '2026-08-23T10:00:00.000Z');
  st = withAnswer(st, pack.packId, pack.items[1]!.id, true, '2026-08-23T10:01:00.000Z');
  st = withAnswer(st, pack.packId, pack.items[2]!.id, false, '2026-08-23T10:02:00.000Z');
  return { ...baseProfile(), personalPack: st };
};

/**
 * 狙った1問だけを「今日の復習」に残す（他は今日答えたことにして先へ送る）。
 * 表現・空欄の問題は出題順の後ろにあるので、これが無いと何十回もクリックすることになる
 */
const isolate = (targetId: string): Profile => {
  const now = new Date().toISOString();
  let st = emptyPersonalPackState();
  for (const it of pack.items) if (it.id !== targetId) st = withAnswer(st, pack.packId, it.id, true, now);
  return { ...baseProfile(), personalPack: st };
};

const shots = [
  shot('① パックの広場（入ってすぐ）',
    '今日やる数・全問通し・本文の読み返し。下に1問ずつの記録が並ぶ',
    baseProfile(), () => {}),

  shot('② 出題（漢字の読み・答える前）',
    '本人の文がそのまま出る。ふりがなは出さない＝答えが透けないため',
    baseProfile(), () => click(/今日の復習をする/)),

  shot('③ 正解したとき',
    '正解が緑で確定し、先生の一言（あれば）が出る。次へ進む',
    baseProfile(), () => {
      click(/今日の復習をする/);
      click(firstItem.answer);
    }),

  shot('④ まちがえたとき',
    '選んだものが赤・正解が緑。その日のうちにもう一度出る',
    baseProfile(), () => {
      click(/今日の復習をする/);
      click(firstItem.distractors[0]!);
    }),

  shot('⑤ 表現の意味を選ぶ問題',
    '本人が使った表現の意味を、中国語の選択肢から選ぶ（答えは例文に書いていない）',
    isolate(meaningItem.id), () => click(/今日の復習をする/)),

  shot('⑥ 自分の文の空欄うめ',
    '本人が書いた文の一部を空けて、そこに入る言い方を選ぶ',
    isolate(clozeItem.id), () => click(/今日の復習をする/)),

  shot('⑦ 自分の文章を読み返す',
    '発行した本文をそのまま表示。ここにもふりがなは出さない',
    baseProfile(), () => click(/自分の文章を読み返す/)),

  shot('⑧ 何日か練習したあとの広場',
    '「答えたことがある数」「2回続けて正解できた数」と、1問ごとの記録が出る',
    practiced(), () => {}),

  shot('⑨ 中国語表示', '生徒の画面は中国語。UIに日本語は残さない（本人の作文だけが日本語）',
    baseProfile(), () => {}, 'zh'),
];

const css = (() => {
  const dir = join(ROOT, 'dist/assets');
  const file = readdirSync(dir).find((f) => f.endsWith('.css'));
  return file ? readFileSync(join(dir, file), 'utf8') : '';
})();

const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>自分の文章で復習 — 画面の見え方</title>
<style>${css}</style>
<style>
  body { background:#f3f4f6; font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif; margin:0; padding:24px; }
  .wrap { max-width:1200px; margin:0 auto; }
  h1 { font-size:20px; font-weight:800; color:#111827; margin:0 0 4px; }
  .lead { font-size:13px; color:#4b5563; margin:0 0 20px; line-height:1.7; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(390px,1fr)); gap:20px; }
  .shot h2 { font-size:13px; font-weight:700; color:#111827; margin:0 0 2px; }
  .shot p { font-size:12px; color:#6b7280; margin:0 0 8px; line-height:1.6; }
  .phone { width:100%; max-width:390px; background:#fff; border:1px solid #d1d5db; border-radius:20px;
           overflow:hidden; box-shadow:0 6px 20px rgba(0,0,0,.08); }
</style></head>
<body><div class="wrap">
<h1>自分の文章で復習 — 実際の画面</h1>
<p class="lead">
  ${packFile} を発行した状態で、本物の画面コンポーネントを動かして写し取ったものです（モックではありません）。<br>
  出題 ${pack.items.length}問／本文 ${pack.passages.length}本。ボタンは飾りなので押しても動きません。
</p>
<div class="grid">
${shots.map((s) => `  <div class="shot">
    <h2>${s.titleJa}</h2>
    <p>${s.noteJa}</p>
    <div class="phone">${s.html}</div>
  </div>`).join('\n')}
</div>
</div></body></html>`;

const out = process.env.OUT ?? '/tmp/personal-pack-shots.html';
writeFileSync(out, page);
console.log(`✅ ${out}（${shots.length}画面・${packFile}）`);
