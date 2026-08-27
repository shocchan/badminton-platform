import type { Lang } from '../../../contexts/LanguageContext';
import { LP, type VariantConfig } from './lpContent';
import { Reveal, SectionHeading, Check } from './lpUi';
import {
  BookOpen, Ear, MessageCircle, Briefcase, CalendarDays, Brain, Compass, Users,
  Bot, UserRound,
} from 'lucide-react';

const painIcon: Record<string, typeof BookOpen> = {
  test: BookOpen, listen: Ear, talk: MessageCircle, work: Briefcase,
  calendar: CalendarDays, forget: Brain, lost: Compass, friend: Users,
};

export function PainPointsSection({ lang }: { lang: Lang }) {
  return (
    <section id="pain" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal><SectionHeading eyebrow={LP.pain.heading[lang]} title={LP.pain.lead[lang]} /></Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {LP.pain.items[lang].map((it, i) => {
            const Icon = painIcon[it.scene] || MessageCircle;
            return (
              <Reveal key={i} delay={(i % 4) * 60}>
                <div className="h-full bg-lp-card border border-lp-line rounded-2xl p-5 shadow-[0_6px_18px_rgba(55,43,38,0.06)]">
                  <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl bg-lp-coral-soft text-lp-coral-deep mb-3">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <p className="text-[0.98rem] text-lp-ink leading-relaxed">{it.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * 人×AIの役割。**人間コーチが主・AIが従**の順で見せる
 * （2026-08-19 CEO依頼: サービスの信頼性と6か月コースの価格の理由は人間コーチが担う）
 */
export function AiHumanRolesSection({ v, lang }: { v: VariantConfig; lang: Lang }) {
  const r = LP.roles;
  const aiName = r.ai.name[lang].replace('翔子先生・悠斗先生', v.name[lang]).replace('翔子・悠斗', v.name[lang]);
  return (
    <section id="roles" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal><SectionHeading eyebrow={LP.roles.sub[lang]} title={r.heading[lang]} /></Reveal>
        <div className="grid md:grid-cols-2 gap-5">
          {/* 主: 人間コーチ（強調枠・先に読まれる位置） */}
          <Reveal>
            <div className="h-full bg-lp-card border-2 border-lp-pine rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-lp-pine-soft text-lp-pine"><UserRound className="w-5 h-5" aria-hidden="true" /></span>
                <span className="text-[0.8rem] font-extrabold tracking-wide bg-lp-pine text-white rounded-full px-3 py-0.5">{r.human.label[lang]}</span>
              </div>
              <h3 className="font-extrabold text-lp-ink text-lg mb-3">{r.human.name[lang]}</h3>
              <ul className="flex flex-col gap-2.5">
                {r.human.items[lang].map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[0.97rem] text-lp-ink-soft"><Check className="w-5 h-5 shrink-0 text-lp-pine" />{s}</li>
                ))}
              </ul>
            </div>
          </Reveal>
          {/* 従: AIの相棒 */}
          <Reveal delay={80}>
            <div className="h-full bg-lp-card border border-lp-line rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-lp-coral-soft text-lp-coral-deep"><Bot className="w-5 h-5" aria-hidden="true" /></span>
                <span className="text-[0.8rem] font-extrabold tracking-wide bg-lp-coral text-white rounded-full px-3 py-0.5">{r.ai.label[lang]}</span>
              </div>
              <h3 className="font-extrabold text-lp-ink text-lg mb-3">{aiName}</h3>
              <ul className="flex flex-col gap-2.5">
                {r.ai.items[lang].map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[0.97rem] text-lp-ink-soft"><Check className="w-5 h-5 shrink-0 text-lp-coral" />{s}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/*
 * 学習サイクルの各ステップに、**アプリで実際に使っているアイコン**を出す（2026-08-27）。
 *
 * 新しい画像は作っていない。public/ai-course/step/ にある本物のアイコンを使う。
 * 1個1〜2KB、5個で約8KB。LPで見た絵が、買ったあとの画面にそのまま出てくる
 * ＝「聞いていた話と違う」が起きない。
 *
 * 並びは LP.flow.steps と1対1。文言を足し引きしたらここも合わせること
 * （lpVisuals.test.ts が件数の一致を見ている）。
 */
const FLOW_STEP_ICONS: (string | null)[] = [
  'goal-chest',   // 今日の目標を見る
  'step-talk',    // AIと話す
  'step-words',   // 言えなかった表現を確認
  'step-review',  // 1・3・7・30日後に復習
  /*
   * 「職場・生活・交流で使う」に合うアイコンがアプリ側に無い。
   * step-battle は文法バトルの絵なので、実生活の場面に当てると意味がずれる。
   * **合わない絵を置くくらいなら置かない**。null のカードはアイコン無しで出る。
   */
  null,
];

export function DailyLearningFlow({ v, lang }: { v: VariantConfig; lang: Lang }) {
  const steps = LP.flow.steps[lang];
  return (
    <section id="flow" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal><SectionHeading title={LP.flow.heading[lang]} lead={LP.flow.lead[lang]} /></Reveal>
        <ol className="grid gap-4 md:grid-cols-5 sm:grid-cols-2">
          {steps.map((s, i) => (
            <Reveal key={i} delay={(i % 5) * 60}>
              <li className="h-full bg-lp-card border border-lp-line rounded-2xl p-5 flex flex-col gap-2">
                <span className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-full bg-lp-coral text-white font-extrabold grid place-items-center shrink-0">{i + 1}</span>
                  {/* アプリと同じアイコン。装飾なので支援技術には読ませない */}
                  {FLOW_STEP_ICONS[i] && (
                    <img
                      src={`/ai-course/step/${FLOW_STEP_ICONS[i]}@2x.webp`}
                      alt="" aria-hidden="true" loading="lazy" decoding="async"
                      width={36} height={36}
                      className="w-9 h-9 object-contain opacity-90"
                    />
                  )}
                </span>
                <h3 className="font-extrabold text-lp-ink text-[1.02rem] mt-1">{s.title.replace('AI', i === 1 ? v.name[lang] : 'AI')}</h3>
                <p className="text-[0.92rem] text-lp-ink-soft leading-relaxed">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
