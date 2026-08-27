import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { Reveal, SectionHeading, Check } from './lpUi';
import {
  MessageCircle, MessageSquareText, RefreshCw, LineChart, BookOpen, Map, UserRound, ImageIcon, PlayCircle,
} from 'lucide-react';

const featIcon = [MessageCircle, MessageSquareText, RefreshCw, LineChart, BookOpen, Map, UserRound];

/**
 * 実際の学習画面の素材が用意できるまでは枠ごと出さない（「準備中」を訪問者に見せない・Phase B-5）。
 * - `SHOW_SCREENSHOT_FRAME`: 学習画面のスクリーンショット枠
 * - `SHOW_SYSTEM_DEMO`: デモ動画枠（撮影でき次第 true にして VIDEO_SRC を差し替える）
 * 架空のUI・存在しない画面は作らない。
 */
const SHOW_SCREENSHOT_FRAME = false;
const SHOW_SYSTEM_DEMO = false;
const DEMO_VIDEO_SRC = ''; // 例: '/videos/ai-course-demo.mp4'（public 配下に置く）

/**
 * 実際の学習画面（2026-08-23 監査で撮影）。テスト生徒アカウントの実画面をそのまま使う
 * （架空UIは作らない）。画像は public/images/ai-course/screens/<id>-<lang>@{1x,2x}.webp。
 * 並びは正準Journey（今日の冒険 → マップ → バトル → AI会話）。
 */
const REAL_SCREENS: { id: string; w: number; h: number; title: { ja: string; zh: string }; body: { ja: string; zh: string } }[] = [
  { id: 'home', w: 375, h: 650,
    title: { ja: '今日の冒険', zh: '今天的冒险' },
    body: { ja: '開いた瞬間に「今日やること」が1つ。迷わない', zh: '一打开就知道「今天做什么」。不用迷茫' } },
  { id: 'map', w: 375, h: 750,
    title: { ja: '冒険マップ', zh: '冒险地图' },
    body: { ja: '現在地・次の目的地・その先の世界。半年の道のりが見える', zh: '当前位置・下一个目的地・更远的世界。半年的路一目了然' } },
  { id: 'battle', w: 375, h: 750,
    title: { ja: '語彙・文法バトル', zh: '词汇・语法战斗' },
    body: { ja: '間違えても、例文と「ほかが違う理由」で学びになる。相棒が声をかける', zh: '答错也能学到：例句＋「其他选项为什么不对」。搭档会给你打气' } },
  { id: 'conversation', w: 375, h: 812,
    title: { ja: 'AI会話（音声・テキスト）', zh: 'AI会话（语音・文字）' },
    body: { ja: '今日の表現を、実際の会話で使う。中国語訳はタップで', zh: '把今天的表达用在真实会话里。中文翻译点一下就有' } },
];

function RealScreens({ lang }: { lang: Lang }) {
  return (
    <Reveal delay={80}>
      <div className="mt-10">
        <p className="text-center text-[0.95rem] font-bold text-lp-ink">
          {lang === 'ja' ? '実際の学習画面（スマホ）' : '真实的学习界面（手机）'}
        </p>
        <p className="text-center text-[0.86rem] text-lp-ink-soft mt-1">{LP.features.screenshotNote[lang]}</p>
        {/* スマホは横スクロール（1枚ずつスナップ）、PCは4枚並び。横スクロールは枠内に閉じ、ページ本体は横に動かない */}
        <ul className="mt-5 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-5 px-5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible"
          aria-label={lang === 'ja' ? '実際の学習画面' : '真实的学习界面'}>
          {REAL_SCREENS.map((sc) => (
            <li key={sc.id} className="snap-center shrink-0 w-[78%] sm:w-auto">
              <figure className="h-full rounded-2xl border border-lp-line bg-lp-card overflow-hidden shadow-[0_10px_26px_rgba(55,43,38,0.08)]">
                <div className="bg-lp-ivory-2 border-b border-lp-line">
                  <img
                    src={`/images/ai-course/screens/${sc.id}-${lang}@1x.webp`}
                    srcSet={`/images/ai-course/screens/${sc.id}-${lang}@1x.webp 1x, /images/ai-course/screens/${sc.id}-${lang}@2x.webp 2x`}
                    width={sc.w} height={sc.h} loading="lazy" decoding="async"
                    alt={`${sc.title[lang]}：${sc.body[lang]}`}
                    className="w-full h-auto block" />
                </div>
                <figcaption className="px-4 py-3">
                  <p className="font-extrabold text-lp-ink text-[0.95rem]">{sc.title[lang]}</p>
                  <p className="text-[0.86rem] text-lp-ink-soft mt-0.5">{sc.body[lang]}</p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

export function PlatformFeatures({ lang }: { lang: Lang }) {
  return (
    // scroll-mt-20: ヒーローの「学習システムを見る」からのスクロール着地時に
    // 固定ヘッダー（h-16）で見出しが隠れないようにする
    <section id="features" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal><SectionHeading title={LP.features.heading[lang]} lead={LP.features.lead[lang]} /></Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LP.features.items[lang].map((f, i) => {
            const Icon = featIcon[i] || MessageCircle;
            return (
              <Reveal key={i} delay={(i % 3) * 60}>
                <div className="h-full bg-lp-card border border-lp-line rounded-2xl p-5 flex gap-4 items-start">
                  <span className="inline-flex w-12 h-12 shrink-0 items-center justify-center rounded-xl bg-lp-pine-soft text-lp-pine"><Icon className="w-6 h-6" aria-hidden="true" /></span>
                  <div>
                    <h3 className="font-extrabold text-lp-ink">{f.title}</h3>
                    <p className="text-[0.95rem] text-lp-ink-soft mt-1">{f.value}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* 実画面4枚（2026-08-23）。「説明文だけで画面が無い」状態を解消する */}
        <RealScreens lang={lang} />

        {/* デモ動画枠: 実素材が撮影でき次第 SHOW_SYSTEM_DEMO を true にして差し替える。
            素材が無いあいだは枠ごと出さない（空の「準備中」を訪問者に見せない） */}
        {SHOW_SYSTEM_DEMO && DEMO_VIDEO_SRC && (
          <Reveal delay={80}>
            <figure className="mt-8 rounded-2xl border border-lp-line bg-lp-card overflow-hidden shadow-[0_10px_26px_rgba(55,43,38,0.08)]">
              <video src={DEMO_VIDEO_SRC} controls playsInline preload="metadata" className="w-full h-auto">
                <span className="grid place-items-center h-56 text-lp-ink-soft text-sm gap-2">
                  <PlayCircle className="w-8 h-8" aria-hidden="true" />
                </span>
              </video>
              <figcaption className="px-4 py-3 text-[0.86rem] text-lp-ink-soft">{LP.features.screenshotNote[lang]}</figcaption>
            </figure>
          </Reveal>
        )}

        {/* 実画面プレースホルダー：デモは招待制で自動取得不可のため、撮影待ち（架空UIは作らない）。
            撮影できたら SHOW_SCREENSHOT_FRAME を true にして中身を実画像へ差し替える。 */}
        {SHOW_SCREENSHOT_FRAME && (
        <Reveal delay={80}>
          <figure className="mt-8 rounded-2xl border border-lp-line bg-lp-card overflow-hidden shadow-[0_10px_26px_rgba(55,43,38,0.08)]">
            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-lp-ivory-2 border-b border-lp-line">
              <span className="w-3 h-3 rounded-full bg-lp-coral/60" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-lp-gold/70" aria-hidden="true" />
              <span className="w-3 h-3 rounded-full bg-lp-pine/50" aria-hidden="true" />
              <span className="ml-3 text-[0.72rem] text-lp-ink-soft truncate">kawabado.com/ja/ai-course</span>
            </div>
            <div className="grid place-items-center h-56 sm:h-72 bg-lp-ivory text-lp-ink-soft text-sm gap-2">
              <ImageIcon className="w-8 h-8" aria-hidden="true" />
              <span>{lang === 'ja' ? '実際の学習画面を掲載予定（準備中）' : '真实学习界面即将展示（准备中）'}</span>
            </div>
          </figure>
          <p className="text-center text-[0.86rem] text-lp-ink-soft mt-3">{LP.features.screenshotNote[lang]}</p>
        </Reveal>
        )}
      </div>
    </section>
  );
}

/*
 * 6か月ロードマップの頭に、**アプリで実際に使っている冒険マップの絵**を帯で出す（2026-08-27）。
 *
 * 新しい画像は作っていない。public/ai-course/map/world-bg（水彩の風景）を使う。
 * 「6か月で目指す道のり」という中身と、生徒が毎日見る世界地図が同じ絵になる。
 *
 * 【全面の背景にしなかった理由】
 * 最初はセクション全体の背景に敷いたが、スマホでは縦2,000px・横375pxになり、
 * object-cover が縦長の画像をさらに細い帯に切り取って**何の絵か分からなくなった**（実機で確認）。
 * 白ベールも強くしないと本文が読めず、薄くすると読みにくい。
 * 帯にすれば絵は絵として見え、文字の上に重ならないので可読性の妥協も要らない。
 *
 * 【重さ】
 *   - AVIF（51KB）→ WebP（61KB）のフォールバック。<picture> でブラウザに選ばせる
 *   - loading="lazy"。ページのかなり下なので初回表示には乗らない
 *   - aspect比を固定して、読み込み中に下の文字がずれないようにする
 *   - 装飾なので alt="" と aria-hidden（道のりの中身は下のカードが文字で言っている）
 */
export function SixMonthRoadmap({ lang }: { lang: Lang }) {
  return (
    <section id="roadmap" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="mb-8 overflow-hidden rounded-3xl border border-lp-line bg-lp-card">
            <picture>
              <source srcSet="/ai-course/map/world-bg@1x.avif" type="image/avif" />
              <img
                src="/ai-course/map/world-bg@1x.webp"
                alt="" aria-hidden="true" loading="lazy" decoding="async"
                width={512} height={768}
                /*
                  縦長の原画を横長に切る。**上寄せ**にして山と、そこへ延びる川を見せる。
                  最初 object-bottom にしたら港の水面だけになり、
                  「これから進む道のり」に見えなかった（実機で確認）。
                */
                className="w-full h-[140px] sm:h-[200px] object-cover object-top"
              />
            </picture>
          </div>
        </Reveal>

        <Reveal><SectionHeading title={LP.roadmap.heading[lang]} /></Reveal>
        <div className="grid md:grid-cols-3 gap-4">
          {LP.roadmap.phases[lang].map((p, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="relative h-full bg-lp-card border border-lp-line rounded-2xl p-6" style={{ marginTop: `${i * 12}px` }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-8 h-8 rounded-full bg-lp-gold text-lp-ink font-extrabold grid place-items-center text-sm">{i + 1}</span>
                  <span className="font-extrabold text-lp-ink">{p.span}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {p.items.map((it, j) => (
                    <li key={j} className="flex gap-2 text-[0.95rem] text-lp-ink-soft"><Check className="w-4 h-4 mt-1 shrink-0 text-lp-coral" />{it}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-center text-[0.86rem] text-lp-ink-soft mt-6">{LP.roadmap.note[lang]}</p>
      </div>
    </section>
  );
}
