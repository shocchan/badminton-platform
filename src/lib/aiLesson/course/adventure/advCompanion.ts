// 旅の相棒（§8・D-010）。オリジナル3種。既存IP非模倣・捕獲/進化/属性バトルなし。
// 教材は分岐させない: 推奨比率（クエスト構成のわずかな重み）とHomeの声掛けだけを変える。
import type { AdvCompanionDef, AdvCompanionId } from './advTypes';

export const COMPANIONS: AdvCompanionDef[] = [
  {
    id: 'nami',
    nameJa: 'ナミ', nameZh: '娜米',
    roleJa: '会話型の相棒。発話・聞き返し・言い直しを応援する',
    roleZh: '会话型伙伴。鼓励开口・听不懂再问・改口',
    emphasis: { conversation: 0.5, knowledge: 0.25, practical: 0.25 },
    greetJa: '今日も一言、話してみよう', greetZh: '今天也开口说一句吧',
  },
  {
    id: 'fukuro',
    nameJa: 'フク老師', nameZh: '梟老师',
    roleJa: '知識型の相棒。文法・語彙・読解の理屈を一緒に整理する',
    roleZh: '知识型伙伴。一起梳理语法・词汇・阅读的逻辑',
    emphasis: { conversation: 0.25, knowledge: 0.5, practical: 0.25 },
    greetJa: '今日の一枚を積み上げよう', greetZh: '今天也垒上一块砖吧',
  },
  {
    id: 'kaji',
    nameJa: 'カジ', nameZh: '舵手卡吉',
    roleJa: '実践型の相棒。生活・職場のミッションへ連れ出す',
    roleZh: '实践型伙伴。带你完成生活・职场任务',
    emphasis: { conversation: 0.3, knowledge: 0.2, practical: 0.5 },
    greetJa: '今日の冒険に出かけよう', greetZh: '出发去今天的冒险吧',
  },
];

export const companionById = (id: AdvCompanionId | null | undefined): AdvCompanionDef =>
  COMPANIONS.find((c) => c.id === id) ?? COMPANIONS[1]; // 既定は知識型（もっとも中立）

/** 相棒の軽量SVG（自前描画・外部asset不要）。抽象的な形でIP非模倣を担保 */
export const companionSvg = (id: AdvCompanionId): string => {
  if (id === 'nami') {
    // 会話型: 波と吹き出しをモチーフにした水色の精霊
    return '<svg viewBox="0 0 64 64" role="img" aria-label="ナミ" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="34" r="22" fill="#7dd3fc"/><path d="M14 40 q6 -8 12 0 t12 0 t12 0" stroke="#0369a1" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="25" cy="28" r="3" fill="#0c4a6e"/><circle cx="39" cy="28" r="3" fill="#0c4a6e"/><path d="M44 14 h12 v9 h-7 l-5 4 z" fill="#e0f2fe" stroke="#0369a1" stroke-width="2"/></svg>';
  }
  if (id === 'fukuro') {
    // 知識型: 本を抱えたふくろう
    return '<svg viewBox="0 0 64 64" role="img" aria-label="フク老師" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="34" rx="20" ry="22" fill="#c4b5fd"/><circle cx="24" cy="28" r="7" fill="#ede9fe"/><circle cx="40" cy="28" r="7" fill="#ede9fe"/><circle cx="24" cy="28" r="3" fill="#4c1d95"/><circle cx="40" cy="28" r="3" fill="#4c1d95"/><path d="M29 36 l3 4 l3 -4 z" fill="#f59e0b"/><rect x="22" y="44" width="20" height="8" rx="2" fill="#7c3aed"/><line x1="32" y1="44" x2="32" y2="52" stroke="#ede9fe" stroke-width="2"/></svg>';
  }
  // 実践型: 舵とコンパスのモチーフ
  return '<svg viewBox="0 0 64 64" role="img" aria-label="カジ" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="20" fill="#fdba74"/><circle cx="32" cy="32" r="12" fill="none" stroke="#9a3412" stroke-width="3"/><g stroke="#9a3412" stroke-width="3" stroke-linecap="round"><line x1="32" y1="12" x2="32" y2="20"/><line x1="32" y1="44" x2="32" y2="52"/><line x1="12" y1="32" x2="20" y2="32"/><line x1="44" y1="32" x2="52" y2="32"/></g><path d="M32 26 l4 6 l-4 6 l-4 -6 z" fill="#7c2d12"/></svg>';
};
