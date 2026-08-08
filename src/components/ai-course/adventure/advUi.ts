// V2冒険画面の共有UIレシピ。
//
// 押下フィードバックは index.css の Interaction Design System（§13-§21）を使う:
// action-raised（押すと沈む）＋ action-primary-blue / action-secondary / action-choice（縁の立体）。
// prefers-reduced-motion での抑制は index.css 側で一括処理される。
//
// **ボタンの見た目は必ずここ経由で組む。** ファイルごとにローカル定義すると
// 「押しても反応しない画面」が再発する（2026-08-08 デザイン監査の教訓）。

/** すべての押せる要素の基盤: 沈み込み・タップハイライト除去・フォーカスリング */
export const pressFx =
  'action-raised touch-manipulation select-none [-webkit-tap-highlight-color:transparent] '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

/** 主ボタン（1画面1つ・原則3）。青い立体キー */
export const primaryBtn =
  `${pressFx} action-primary-blue w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 `
  + 'text-base font-bold text-white disabled:opacity-40 disabled:shadow-none';

/** 副ボタン（青枠・白地） */
export const secondaryBtn =
  `${pressFx} action-secondary w-full min-h-[48px] rounded-xl border border-blue-200 bg-white px-4 py-3 `
  + 'text-base font-semibold text-blue-700 disabled:opacity-40 disabled:shadow-none';

/** 控えめボタン（もどる・スキップ等） */
export const subtleBtn =
  `${pressFx} action-secondary w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2 `
  + 'text-sm text-gray-700 disabled:opacity-40 disabled:shadow-none';

/** 警告系の白地ボタン（答案破棄など。破壊的操作を primary の青で出さない） */
export const amberBtn =
  `${pressFx} action-amber w-full min-h-[44px] rounded-xl border border-amber-400 bg-white px-3 py-2 `
  + 'text-sm font-bold text-amber-900';

/**
 * 選択肢ボタンの基盤（クイズ・設定の選択）。
 * 選択中は aria-pressed="true" を付けると index.css 側で「押し込まれた」形になる。
 * 色の選択状態は choiceOn を使う
 */
export const choiceBtn =
  `${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left`;
export const choiceIdle = `${choiceBtn} border-gray-200 bg-white hover:border-blue-400`;
export const choiceOn = `${choiceBtn} is-selected border-blue-600 bg-blue-50`;

/** 結果・フィードバックのパネル出現（motion-safe なので reduced-motion では静止） */
export const riseIn = 'motion-safe:animate-[adv-rise_0.25s_ease-out]';
/** 正解した選択肢のポップ */
export const popIn = 'motion-safe:animate-[adv-pop_0.35s_ease-out]';
