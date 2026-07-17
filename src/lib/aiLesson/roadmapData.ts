// ロードマップの仮データ（MVP: N2 と 日常会話力UP を優先）
//
// ⚠️ ここにある総項目数・項目リストはすべてモックの仮値。
// 正式なN2出題範囲・項目数の網羅は別フェーズで行い、その際は
// このファイルを JSON / Supabase / 管理画面由来のデータへ差し替える。
// UIコンポーネントは roadmapRepository 経由で GoalRoadmap を受け取るだけなので、
// 差し替えてもUI側の変更は不要。

import type { GoalRoadmap, RoadmapCategory, RoadmapItem } from './roadmapTypes';

// ── 会話運用の共通カテゴリー・項目（日常会話とJLPT系で共用） ──
// detect は planGenerator.ts の TARGETS と同じパターン（今日のレッスンとの紐付け用）

const CONV_CATEGORIES: RoadmapCategory[] = [
  { id: 'conv.permission', domain: 'conversation', labelJa: '許可・依頼', labelZh: '许可・请求' },
  { id: 'conv.experience', domain: 'conversation', labelJa: '経験を話す', labelZh: '谈论经历' },
  { id: 'conv.change', domain: 'conversation', labelJa: '変化・成長を伝える', labelZh: '表达变化・成长' },
  { id: 'conv.nuance', domain: 'conversation', labelJa: '部分否定・ニュアンス', labelZh: '部分否定・语气' },
  { id: 'conv.obligation', domain: 'conversation', labelJa: '義務・やむを得ない', labelZh: '义务・不得已' },
];

const CONV_ITEMS: RoadmapItem[] = [
  // 許可・依頼（12-3 の例）
  { id: 'conv.permission.temoii', label: '「〜てもいいですか」', zhMeaning: '可以…吗？', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 1, priority: 10, detect: 'てもいいですか|でもいいですか' },
  { id: 'conv.permission.teitadakemasenka', label: '「〜ていただけませんか」', zhMeaning: '能否请您…？', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 2, priority: 11 },
  { id: 'conv.permission.temoraemasuka', label: '「〜てもらえますか」', zhMeaning: '可以帮我…吗？', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 1, priority: 12 },
  { id: 'conv.permission.tehoshii', label: '「〜てほしい」', zhMeaning: '希望（对方）…', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 2, priority: 13 },
  { id: 'conv.permission.saseteitadaku', label: '「〜させていただく」', zhMeaning: '请允许我…（谦让）', domain: 'conversation', categoryId: 'conv.permission', required: false, difficulty: 3, priority: 14 },
  { id: 'conv.permission.temokamaimasen', label: '「〜ても構いません」', zhMeaning: '…也没关系', domain: 'conversation', categoryId: 'conv.permission', required: false, difficulty: 2, priority: 15 },
  { id: 'conv.permission.tewaikemasen', label: '「〜てはいけません」', zhMeaning: '不可以…', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 1, priority: 16 },
  { id: 'conv.permission.naidekudasai', label: '「〜ないでください」', zhMeaning: '请不要…', domain: 'conversation', categoryId: 'conv.permission', required: true, difficulty: 1, priority: 17 },
  // 経験
  { id: 'conv.experience.takotogaarimasu', label: '「〜たことがあります」', zhMeaning: '曾经…过', domain: 'conversation', categoryId: 'conv.experience', required: true, difficulty: 1, priority: 20, detect: 'たことがあり|たことがある|だことがあり|だことがある' },
  { id: 'conv.experience.tabakari', label: '「〜たばかりです」', zhMeaning: '刚刚…', domain: 'conversation', categoryId: 'conv.experience', required: true, difficulty: 2, priority: 21 },
  { id: 'conv.experience.tokoro', label: '「〜ているところです」', zhMeaning: '正在…', domain: 'conversation', categoryId: 'conv.experience', required: false, difficulty: 2, priority: 22 },
  // 変化・成長
  { id: 'conv.change.youninarimashita', label: '「〜ようになりました」', zhMeaning: '变得能…了', domain: 'conversation', categoryId: 'conv.change', required: true, difficulty: 2, priority: 30, detect: 'ようになりました|ようになった' },
  { id: 'conv.change.tekimashita', label: '「〜てきました」', zhMeaning: '（逐渐）…起来了', domain: 'conversation', categoryId: 'conv.change', required: true, difficulty: 2, priority: 31 },
  { id: 'conv.change.tsutsuaru', label: '「〜つつあります」', zhMeaning: '正在逐渐…', domain: 'conversation', categoryId: 'conv.change', required: false, difficulty: 3, priority: 32 },
  // 部分否定・ニュアンス
  { id: 'conv.nuance.wakedewanai', label: '「〜わけではありません」', zhMeaning: '并不是…', domain: 'conversation', categoryId: 'conv.nuance', required: true, difficulty: 3, priority: 40, detect: 'わけではありません|わけではない|わけじゃない' },
  { id: 'conv.nuance.towakagiranai', label: '「〜とは限りません」', zhMeaning: '未必…', domain: 'conversation', categoryId: 'conv.nuance', required: false, difficulty: 3, priority: 41 },
  // 義務
  { id: 'conv.obligation.zaruwoenai', label: '「〜ざるを得ません」', zhMeaning: '不得不…', domain: 'conversation', categoryId: 'conv.obligation', required: false, difficulty: 3, priority: 50, detect: 'ざるを得|ざるをえ' },
  { id: 'conv.obligation.nakerebanarimasen', label: '「〜なければなりません」', zhMeaning: '必须…', domain: 'conversation', categoryId: 'conv.obligation', required: true, difficulty: 1, priority: 51 },
];

// ── N2 ロードマップ（仮） ──

const N2_GRAMMAR_CATEGORIES: RoadmapCategory[] = [
  { id: 'n2.grammar.core', domain: 'grammar', labelJa: 'N2重要文法', labelZh: 'N2重点语法' },
];

const N2_GRAMMAR_ITEMS: RoadmapItem[] = [
  { id: 'n2.grammar.wakeniwaikanai', label: '「〜わけにはいかない」', zhMeaning: '不能…（情理上）', domain: 'grammar', categoryId: 'n2.grammar.core', required: true, difficulty: 3, priority: 10 },
  { id: 'n2.grammar.monoda', label: '「〜ものだ」', zhMeaning: '（感慨・常理）…', domain: 'grammar', categoryId: 'n2.grammar.core', required: true, difficulty: 3, priority: 11 },
  { id: 'n2.grammar.kotoninatteiru', label: '「〜ことになっている」', zhMeaning: '按规定…', domain: 'grammar', categoryId: 'n2.grammar.core', required: true, difficulty: 2, priority: 12 },
];

export const N2_ROADMAP: GoalRoadmap = {
  goal: 'n2',
  version: 'mock-2026-07',
  labelJa: 'JLPT N2 合格ロードマップ',
  labelZh: 'JLPT N2 合格路线图',
  targetLevelLabel: 'N2',
  hasExamTrack: true,
  estimatedTotalMissions: 150, // 仮値（管理者調整想定）
  // status: conversation のみ実項目を公開中。他は試算/設計中（正式カリキュラムは別フェーズ）
  domains: [
    { key: 'vocab', totalItems: 800, status: 'planned' },
    { key: 'kanji', totalItems: 400, status: 'planned' },
    { key: 'grammar', totalItems: 120, status: 'estimated' },
    { key: 'reading', totalItems: 60, status: 'planned' },
    { key: 'listening', totalItems: 80, status: 'planned' },
    { key: 'conversation', totalItems: 100, status: 'published' },
    { key: 'mockExam', totalItems: 40, status: 'planned' },
    { key: 'review', totalItems: 60, status: 'planned' },
  ],
  categories: [...CONV_CATEGORIES, ...N2_GRAMMAR_CATEGORIES],
  items: [...CONV_ITEMS, ...N2_GRAMMAR_ITEMS],
};

// ── 日常会話力UP ロードマップ（仮） ──

export const DAILY_ROADMAP: GoalRoadmap = {
  goal: 'daily',
  version: 'mock-2026-07',
  labelJa: '日常会話力UP ロードマップ',
  labelZh: '日常会话能力UP路线图',
  targetLevelLabel: '日常会話',
  hasExamTrack: false,
  estimatedTotalMissions: 100, // 仮値
  domains: [
    { key: 'conversation', totalItems: 100, status: 'published' },
    { key: 'vocab', totalItems: 300, status: 'planned' },
    { key: 'grammar', totalItems: 60, status: 'planned' },
    { key: 'listening', totalItems: 40, status: 'planned' },
    { key: 'review', totalItems: 30, status: 'planned' },
  ],
  categories: CONV_CATEGORIES,
  items: CONV_ITEMS,
};
