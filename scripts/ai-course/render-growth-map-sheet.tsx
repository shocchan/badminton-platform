// 成長マップ（冒険マップ）の見た目確認シート。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-growth-map-sheet.tsx
//
// なぜ必要か: この画面は「V2が有効なログイン済み learner」でしか開けないので、
// 見た目を直すたびに本番DBへQA learnerを作るのは重すぎる。
// **アプリのコードには一切手を入れず**、コンポーネントを静的HTMLへ出して並べる。
// 出力は docs/ai-course/adventure-v2/generated/growth-map-sheet.html（レビュー用・製品には含まれない）。
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { AdvAdventureMap } from '../../src/components/ai-course/adventure/AdvAdventureMap';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import type {
  AdventureV2Profile, AdvGoalType, AdvTodayQuest, AdvMasteryAttempt,
} from '../../src/lib/aiLesson/course/adventure/advTypes';

const OUT = 'docs/ai-course/adventure-v2/generated/growth-map-sheet.html';
const NOW = new Date().toISOString();

const qualifying = (dateKey: string): AdvMasteryAttempt => ({
  dateKey, scorePct: 88, unseenRatio: 0.5,
  questionKeys: ['rec:a', 'rec:b', 'cloze:c', 'cloze:d', 'meaning:e'],
  tier: 'normal', timed: false, completedAt: `${dateKey}T09:00:00.000Z`,
});

const profileFor = (goalType: AdvGoalType): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType,
  targetJlpt: goalType === 'conversation' ? null : 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType, targetJlpt: goalType === 'conversation' ? null : 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

const quest: AdvTodayQuest = {
  questId: 'q-sheet', dateKey: '2026-08-02', goalType: 'hybrid', primaryTargets: [],
  steps: [
    { kind: 'review_due', refIds: [], titleJa: '復習2問', titleZh: '复习2题', estMinutes: 3 },
    { kind: 'grammar_new', refIds: ['n3g-001'], titleJa: 'N3文法1テーマ', titleZh: 'N3语法1个主题', estMinutes: 7 },
    { kind: 'battle', refIds: [], titleJa: '問題バトル', titleZh: '题目战斗', estMinutes: 5, tier: 'normal' },
  ],
  whyJa: '', whyZh: '', estimatedMinutes: 15, targetSkills: [], targetExpressions: [],
  successConditionJa: '', successConditionZh: '', nextStepJa: '', nextStepZh: '',
};

const noop = () => {};

interface Variant { id: string; caption: string; width: number; node: React.ReactElement }

const hybrid = profileFor('hybrid');
const examStarted: AdventureV2Profile = {
  ...profileFor('jlpt'),
  mastery: { 'stg-n3bridge': [qualifying('2026-07-28'), qualifying('2026-07-30')] },
};

const view = (p: AdventureV2Profile, lang: 'ja' | 'zh', mastered: Set<string>, week = 1) => (
  <AdvAdventureMap
    lang={lang} profile={p} route={p.route} mastered={mastered} currentWeek={week} quest={quest}
    nextStepTitleJa="復習2問" nextStepTitleZh="复习2题"
    onStartToday={noop} onBack={noop}
    onOpenReview={noop} reviewAvailable
    onStartConversation={noop} conversationAvailable
    onOpenMock={noop}
  />
);

const VARIANTS: Variant[] = [
  {
    id: 'ja-hybrid-start', width: 390,
    caption: '日本語 / 総合ルート / 開始直後（iPhone 390px）',
    node: view(hybrid, 'ja', new Set()),
  },
  {
    id: 'zh-hybrid-start', width: 390,
    caption: '中文 / 综合路线 / 刚开始（iPhone 390px）',
    node: view(hybrid, 'zh', new Set()),
  },
  {
    id: 'ja-exam-progress', width: 390,
    caption: '日本語 / 試験ルート / 基礎キャンプ攻略済み・N3の橋を攻略中（定着50%）',
    node: view(examStarted, 'ja', new Set(['stg-foundation'])),
  },
  {
    id: 'ja-conversation-w5', width: 390,
    caption: '日本語 / 会話ルート / 5週目（4地域が攻略済み）',
    node: view(profileFor('conversation'), 'ja', new Set(), 5),
  },
  {
    id: 'ja-hybrid-desktop', width: 720,
    caption: '日本語 / 総合ルート / 広い画面（720px）',
    node: view(hybrid, 'ja', new Set()),
  },
];

// 製品と同じ見た目にするため、ビルド済みのTailwind CSSをそのまま読み込む
const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'));
if (!cssFile) throw new Error('dist/assets に CSS がありません。先に npm run build を実行してください');
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8');

const frames = VARIANTS.map((v) => `
  <figure style="margin:0">
    <figcaption style="font:600 12px/1.5 system-ui;color:#334155;margin-bottom:6px">${v.caption}</figcaption>
    <div style="width:${v.width}px;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;background:#fff">
      ${renderToStaticMarkup(v.node)}
    </div>
  </figure>`).join('\n');

writeFileSync(OUT, `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>成長マップ 見た目確認シート</title>
<style>${css}</style>
<style>body{margin:0;padding:20px;background:#f1f5f9;font-family:system-ui}
.sheet{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}</style>
</head><body>
<h1 style="font:700 16px/1.4 system-ui;color:#0f172a">成長マップ 見た目確認シート（レビュー専用・製品には含まれない）</h1>
<p style="font:400 12px/1.6 system-ui;color:#475569">生成: ${NOW}／操作はできません（静的HTML）。押したときの遷移は実機で確認すること。</p>
<div class="sheet">${frames}</div>
</body></html>`);

console.log(`✅ ${OUT} (${VARIANTS.length} variants)`);
