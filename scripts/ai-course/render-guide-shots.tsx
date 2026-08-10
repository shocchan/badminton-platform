// 学習者向け「冒険ガイド」用の画面ショット（静的レンダー）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-guide-shots.tsx
//
// render-growth-map-sheet.tsx と同じ流儀: アプリのコードに手を入れず、
// 実コンポーネント＋実CSS（dist）で「初日に見る画面」をHTML化する。
// 出力: docs/ai-course/guide/shots/*.html（ガイド組版時に playwright でPNG化する）
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { CourseNameOnlyHearing } from '../../src/components/ai-course/CourseNameOnlyHearing';
import { AdvOnboarding } from '../../src/components/ai-course/adventure/AdvOnboarding';
import AdvBattleRunner from '../../src/components/ai-course/adventure/AdvBattleRunner';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import { buildVariantPool } from '../../src/lib/aiLesson/course/adventure/advVariants';
import { AdvInterviewPrep } from '../../src/components/ai-course/adventure/AdvInterviewPrep';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import type { DiagnosisPools } from '../../src/lib/aiLesson/course/adventure/advDiagnosis';

const DIR = 'docs/ai-course/guide/shots/';
mkdirSync(DIR, { recursive: true });
const NOW = new Date().toISOString();
const noop = () => {};

const emptyPools: DiagnosisPools = { foundationVocab: [], n3Vocab: [], n3Grammar: [], n2Grammar: [] };

// 実バンクからバトル問題プールを作る（fixtureをでっち上げない）
const pool = buildVariantPool(N3_GRAMMAR_DRAFTS, 'n3').byItem;
const firstTarget = [...pool.keys()][0];

interface Variant { id: string; caption: string; width: number; node: React.ReactElement }

const VARIANTS: Variant[] = [
  {
    id: 'name-ja', width: 390, caption: '初回ログイン後: 名前だけ入力',
    node: <CourseNameOnlyHearing lang="ja" onComplete={noop} />,
  },
  {
    id: 'name-zh', width: 390, caption: '首次登录后: 只需输入名字',
    node: <CourseNameOnlyHearing lang="zh" onComplete={noop} />,
  },
  {
    id: 'goal-ja', width: 390, caption: '冒険の準備: 目標を選ぶ（最初の質問）',
    node: <AdvOnboarding lang="ja" pools={emptyPools} nowISO={NOW} onComplete={noop} onCancel={noop} />,
  },
  {
    id: 'goal-zh', width: 390, caption: '冒险准备: 选择目标（第一个问题）',
    node: <AdvOnboarding lang="zh" pools={emptyPools} nowISO={NOW} onComplete={noop} onCancel={noop} />,
  },
  {
    id: 'interview-zh', width: 390, caption: '入籍面试表达特训（广场）',
    node: (
      <AdvInterviewPrep lang="zh" onSave={noop} onBack={noop}
        profile={{ ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: 'N2',
          interviewPrep: { enabledAt: NOW, notes: {}, worksheet: {} } }} />
    ),
  },
  {
    id: 'battle-zh', width: 390, caption: '题目战斗（每天学习的内容）',
    node: (
      <AdvBattleRunner
        lang="zh" tier="normal"
        targetId={firstTarget} targetLabel="N3语法" targetIds={[firstTarget]}
        pool={pool} seenKeys={new Set()} recentWrongKeys={new Set()}
        priorAttempts={[]} dateKey={NOW.slice(0, 10)} nowISO={NOW} level="N3"
        onFinish={noop} onClose={noop}
      />
    ),
  },
  {
    id: 'battle-ja', width: 390, caption: '問題バトル（毎日の学習の中身）',
    node: (
      <AdvBattleRunner
        lang="ja" tier="normal"
        targetId={firstTarget} targetLabel="N3文法" targetIds={[firstTarget]}
        pool={pool} seenKeys={new Set()} recentWrongKeys={new Set()}
        priorAttempts={[]} dateKey={NOW.slice(0, 10)} nowISO={NOW} level="N3"
        onFinish={noop} onClose={noop}
      />
    ),
  },
];

const cssFile = readdirSync('dist/assets').find((f) => f.endsWith('.css'));
if (!cssFile) throw new Error('dist/assets に CSS がありません。先に npm run build を実行してください');
const css = readFileSync(`dist/assets/${cssFile}`, 'utf8');
writeFileSync(`${DIR}guide-shots.css`, `${css}\nbody{margin:0;padding:0;background:#fff;font-family:system-ui}\n`);

for (const v of VARIANTS) {
  writeFileSync(`${DIR}guide-${v.id}.html`, `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${v.caption}</title>
<link rel="stylesheet" href="guide-shots.css">
</head><body><div id="shot" style="width:${v.width}px;background:#fff">${
    // file:// で開いてPNG化するため、アプリの絶対パス画像をrepo内のpublicへ向け直す
    renderToStaticMarkup(v.node).replaceAll('src="/', 'src="../../../../public/')
  }</div></body></html>`);
}
console.log(`✅ ${DIR} (${VARIANTS.length} shots)`);
