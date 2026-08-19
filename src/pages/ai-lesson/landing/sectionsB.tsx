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

export function SixMonthRoadmap({ lang }: { lang: Lang }) {
  return (
    <section id="roadmap" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
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
