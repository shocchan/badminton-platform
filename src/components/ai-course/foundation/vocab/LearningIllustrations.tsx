// 学習Journeyのイラスト・可視化（Phase 2E-1.13 CEO指示: 見やすく・視線が動きやすく・イメージしやすく）。
// 方針:
//   - すべてインラインSVG（外部ライブラリ・画像リクエストなし＝bundleと通信を増やさない）
//   - 情報は必ずテキストでも読める（イラストは理解の補助であって唯一の情報源にしない）
//   - アニメーションは prefers-reduced-motion を尊重し、動きは 200-500ms の穏やかなものだけ
//   - 学習内容（語・結果）を歪めない。数値はpropsで受け取った実データのみを描く
import type { ReactNode } from 'react';

/** 動きを許可する環境だけでアニメーションを付ける（reduced motionでは静止画になる） */
const motionSafe = 'motion-safe:transition-all motion-safe:duration-300';

// ── ステップイラスト（4種・視線の起点を作る） ──────────────────────────

// viewBoxは図形のbboxに合わせて個別に渡す（共通viewBoxだと余白が大きく、絵が小さく見えた）
// 幅だけ指定して高さは比率任せにする（正方形に押し込むと図が上下に潰れて読めなくなる）
//
// アクセシビリティ（2E-1.14 §11）: これらの絵は必ず隣に同じ意味の見出しがある場所で使う。
// そこで **既定は装飾（aria-hidden）** とし、読み上げを重複させない。
// 隣接テキストが無い場所で使う場合だけ label を渡すと、意味のある画像として読まれる。
const Frame = ({ children, label, viewBox }: { children: ReactNode; label?: string; viewBox: string }) => (
  <svg viewBox={viewBox} className="w-16 shrink-0" focusable="false"
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    {children}
  </svg>
);

/** Step1 目的: 方位磁針（どこへ向かうか） */
export const GoalIllustration = ({ label }: { label?: string }) => (
  <Frame label={label} viewBox="18 6 60 60">
    <circle cx="48" cy="36" r="26" fill="#EEF2FF" />
    <circle cx="48" cy="36" r="26" fill="none" stroke="#C7D2FE" strokeWidth="2" />
    <path d="M48 18 L54 34 L48 30 L42 34 Z" fill="#4F46E5" />
    <path d="M48 54 L42 38 L48 42 L54 38 Z" fill="#A5B4FC" />
    <circle cx="48" cy="36" r="3" fill="#312E81" />
  </Frame>
);

/** Step2 短い確認: カードと虫めがね（測るのではなく「見てみる」印象） */
export const CheckIllustration = ({ label }: { label?: string }) => (
  <Frame label={label} viewBox="14 15 70 48">
    <rect x="18" y="20" width="34" height="26" rx="4" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2" />
    <rect x="24" y="27" width="18" height="3" rx="1.5" fill="#A5B4FC" />
    <rect x="24" y="34" width="12" height="3" rx="1.5" fill="#C7D2FE" />
    <circle cx="60" cy="40" r="12" fill="#fff" stroke="#4F46E5" strokeWidth="3" />
    <path d="M69 49 L78 58" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" />
  </Frame>
);

/** Step3 最初の練習: 吹き出し（話す・使う） */
export const PracticeIllustration = ({ label }: { label?: string }) => (
  <Frame label={label} viewBox="6 15 82 50">
    <path d="M14 18 h50 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-30 l-12 10 v-10 h-8 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"
      fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2" />
    <rect x="24" y="28" width="26" height="3.5" rx="1.75" fill="#818CF8" />
    <rect x="24" y="36" width="18" height="3.5" rx="1.75" fill="#C7D2FE" />
    <circle cx="76" cy="24" r="7" fill="#4F46E5" />
    <path d="M73 24 l2.4 2.4 L79.5 21.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

/** Step4 まとめ: カレンダーの中の大きなチェック（今日ぶんが終わった、が一目で分かる形） */
export const DoneIllustration = ({ label }: { label?: string }) => (
  <Frame label={label} viewBox="10 10 76 60">
    <rect x="14" y="14" width="68" height="52" rx="8" fill="#fff" stroke="#C7D2FE" strokeWidth="3" />
    <rect x="14" y="14" width="68" height="14" rx="8" fill="#4F46E5" />
    <rect x="14" y="22" width="68" height="6" fill="#4F46E5" />
    <path d="M32 44 l10 10 l22 -22" stroke="#10B981" strokeWidth="6" fill="none"
      strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

// ── 進捗ステッパー（視線が左→右に自然に流れる） ─────────────────────

export interface StepperStep { key: string; label: string }

/**
 * 4ステップの進捗表示。番号・ラベル・接続線で「今どこか」「あといくつか」を一目で示す。
 * 色だけに依存させず、済み=チェック／現在=塗り＋リング／未来=薄い丸 で形も変える。
 */
export const JourneyStepper = ({ steps, currentIndex, ariaLabel }: {
  steps: StepperStep[]; currentIndex: number; ariaLabel: string;
}) => (
  <ol className="flex items-start gap-0 mb-3" aria-label={ariaLabel}>
    {steps.map((s, i) => {
      const done = i < currentIndex;
      const current = i === currentIndex;
      return (
        <li key={s.key} className="flex-1 flex flex-col items-center relative"
          aria-current={current ? 'step' : undefined}>
          {/* 接続線（視線誘導）。最初の要素の左側は描かない */}
          {i > 0 && (
            <span aria-hidden
              className={`absolute top-3.5 right-1/2 w-full h-0.5 ${done || current ? 'bg-indigo-300' : 'bg-gray-200'}`} />
          )}
          <span aria-hidden
            className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${motionSafe} ${
              done ? 'bg-indigo-500 text-white'
                : current ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 scale-110'
                  : 'bg-gray-100 text-gray-400'}`}>
            {done ? '✓' : i + 1}
          </span>
          <span className={`mt-1 text-[10px] leading-tight text-center ${current ? 'font-bold text-indigo-700' : 'text-gray-500'}`}>
            {s.label}
          </span>
        </li>
      );
    })}
  </ol>
);

/**
 * 1語の中の3段階（見る→試す→ふりかえる）を示す小さな帯。
 * 「何問目か」だけでは今の一歩が見えないため、語の中の位置も同時に示す。
 * 進捗バーの直下に置き、視線が 進捗 → 今の段階 → 本文 と自然に降りるようにする。
 */
export const PhaseTrail = ({ phases, currentIndex, ariaLabel }: {
  phases: string[]; currentIndex: number; ariaLabel: string;
}) => (
  <ol className="flex items-center gap-1.5 mb-3" aria-label={ariaLabel}>
    {phases.map((label, i) => {
      const done = i < currentIndex;
      const current = i === currentIndex;
      return (
        <li key={label} aria-current={current ? 'step' : undefined}
          className={`flex items-center gap-1 text-[10px] ${motionSafe} ${
            current ? 'font-bold text-indigo-700' : done ? 'text-indigo-400' : 'text-gray-400'}`}>
          <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${
            current ? 'bg-indigo-600' : done ? 'bg-indigo-300' : 'bg-gray-200'}`} />
          {label}
          {i < phases.length - 1 && <span aria-hidden className="text-gray-300 ml-0.5">›</span>}
        </li>
      );
    })}
  </ol>
);

// ── 結果の可視化（数を「見て」わかる） ───────────────────────────

export interface ResultBar { label: string; count: number; tone: 'good' | 'support' | 'review' }

const TONE = {
  good: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  support: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700' },
  review: { bar: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-700' },
} as const;

/**
 * 結果の横棒グラフ。数値テキストを必ず併記し、棒は理解の補助に留める。
 * 0件の項目は棒を描かない（0を強調して落ち込ませない）。
 */
export const ResultBars = ({ bars, total }: { bars: ResultBar[]; total: number }) => {
  const max = Math.max(total, ...bars.map((b) => b.count), 1);
  return (
    <ul className="space-y-1.5">
      {bars.filter((b) => b.count > 0).map((b) => (
        <li key={b.label} className="flex items-center gap-2">
          <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${TONE[b.tone].dot}`} />
          <span className="text-xs text-gray-700 w-28 shrink-0">{b.label}</span>
          <span aria-hidden className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <span className={`block h-full rounded-full ${TONE[b.tone].bar} motion-safe:transition-[width] motion-safe:duration-500`}
              style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
          </span>
          <span className={`text-xs font-bold tabular-nums ${TONE[b.tone].text}`}>{b.count}</span>
        </li>
      ))}
    </ul>
  );
};

// ── 復習予定タイムライン（「また戻ってくる」が絵でわかる） ──────────────

export interface TimelinePoint { label: string; count: number; emphasis?: boolean }

/**
 * 次回復習の時間軸。今日を起点に右へ伸びる線と点で「忘れかける頃に戻ってくる」を表す。
 * 件数は数字でも読める。0件の点は薄く描き、存在自体は示す（予定がないことも情報）。
 */
export const ReviewTimeline = ({ points, todayLabel }: { points: TimelinePoint[]; todayLabel: string }) => {
  const columns = [{ label: todayLabel, count: null as number | null, emphasis: true }, ...points];
  return (
    <div className="mt-1">
      <div className="relative flex items-start justify-between pt-4">
        <span aria-hidden className="absolute left-3 right-3 top-[22px] h-0.5 bg-indigo-100 rounded-full" />
        {columns.map((c, i) => {
          const today = i === 0;
          const active = today || (c.count ?? 0) > 0;
          return (
            <div key={c.label} className="relative z-10 flex flex-col items-center flex-1">
              <span aria-hidden className={`rounded-full ${motionSafe} ${
                today ? 'w-3 h-3 bg-indigo-600 ring-4 ring-indigo-100'
                  : active ? (c.emphasis ? 'w-3 h-3 bg-indigo-500' : 'w-2.5 h-2.5 bg-indigo-300')
                    : 'w-2 h-2 bg-gray-200'}`} />
              <span className={`mt-1.5 text-[10px] leading-none ${
                today ? 'font-bold text-indigo-700' : active ? 'text-gray-700' : 'text-gray-400'}`}>
                {c.label}
              </span>
              {/* 今日の列は件数を持たないが、高さを揃えるため空の行を確保する */}
              <span className={`mt-0.5 text-[10px] leading-none font-bold tabular-nums ${
                active ? 'text-indigo-700' : 'text-gray-300'}`}>
                {c.count === null ? '\u00a0' : c.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
