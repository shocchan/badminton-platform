// 教材を「ビルド時に実体化して、非公開のページ単位オブジェクトへ書き出す」スクリプト（P0）。
//
// v2: 削った InternalItem ではなく **完全な AdvBattleQuestion を保存する**。
// 理由: 出題編成（buildEncounter）・模試構成（startMockSession）・診断選定を
// server 側で動かすには、type / skill / variant / 解説を含む完全な形が要る。
// 学習者へ渡す直前の削り（正解・解説の除去）は Worker が配信時に行う。
// このディレクトリは dist/ の外にあり、公開されない。
//
// なぜビルド時か:
//   語彙は 2,000語の原文から生成すると1レベル約12MB（実測）。client にも
//   Worker bundle にも載せられず、リクエスト毎の生成は CPU を食う。
//
//   npx vite-node scripts/ai-course/build-content-shards.mts

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { vocabPool } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { readingPool, readingSetsFor } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { listeningPool, listeningSetsFor, ALL_LISTENING_SETS } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import { loadGrammarPools, buildDiagnosisPools, loadAllN2Drafts } from '../../src/lib/aiLesson/course/adventure/advContent';
import { COURSE_MISSIONS } from '../../src/lib/aiLesson/course/courseData';
import { buildConversationMission } from '../../src/lib/aiLesson/course/adventure/advConversationBridge';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import type { AdvBattleQuestion } from '../../src/lib/aiLesson/course/adventure/advVariants';

const OUT = 'content-dist';
const V = 'v2';
/** 1ページの問題数。Worker が1リクエストで読む量を決める */
export const PAGE_SIZE = 20;

type Scope = 'n2' | 'n3' | 'all';
interface TargetIndexEntry { kind: string; scope: Scope; targetId: string; items: number; pages: number }

const index: TargetIndexEntry[] = [];
let totalItems = 0;
let totalBytes = 0;
let fileCount = 0;

rmSync(OUT, { recursive: true, force: true });

const writeJson = (path: string, body: unknown) => {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  const json = JSON.stringify(body);
  writeFileSync(full, json);
  totalBytes += Buffer.byteLength(json, 'utf8');
  fileCount += 1;
};

/** 1問の健全性。正解がちょうど1つ・選択肢が2つ以上でなければ配信できない */
const validateQuestion = (q: AdvBattleQuestion, where: string) => {
  const correct = q.choices.filter((c) => c.isCorrect).length;
  if (correct !== 1 || q.choices.length < 2) {
    throw new Error(`${where}: ${q.key} は正解${correct}個・選択肢${q.choices.length}個で配信できません`);
  }
};

const emitPool = (kind: string, scope: Scope, pool: Map<string, AdvBattleQuestion[]>) => {
  for (const [targetId, questions] of pool) {
    for (const q of questions) validateQuestion(q, `${kind}/${scope}/${targetId}`);
    const pages = Math.max(1, Math.ceil(questions.length / PAGE_SIZE));
    for (let p = 0; p < pages; p++) {
      writeJson(
        `${V}/pool/${kind}/${scope}/${targetId}/${p}.json`,
        { targetId, page: p, questions: questions.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE) },
      );
    }
    index.push({ kind, scope, targetId, items: questions.length, pages });
    totalItems += questions.length;
  }
};

const main = async () => {
  // ── 語彙・読解・聴解（レベル別。語彙は要求レベルで誤答の母集団が変わるため scope 必須） ──
  for (const level of ['N3', 'N2'] as const) {
    const scope = level.toLowerCase() as Scope;
    emitPool('vocab', scope, vocabPool(level));
    emitPool('reading', scope, readingPool(level));
    emitPool('listening', scope, listeningPool(level));
  }

  // ── 読解・聴解の set 形式（runner が使う situationJa / rationaleSpan / playLimit を保つ）──
  // pool 形式（AdvBattleQuestion）は模試用。set 形式は読解・聴解の単独練習用。
  for (const level of ['N3', 'N2'] as const) {
    const scope = level.toLowerCase() as Scope;
    const rSets = readingSetsFor(level);
    const lSets = listeningSetsFor(level);
    writeJson(`${V}/sets/reading/${scope}.json`, { sets: rSets });
    writeJson(`${V}/sets/listening/${scope}.json`, { sets: lSets });
  }

  // ── 文法（N3 draft変形 + N2 draft変形 + N3単元生成問題。byItem は level 混在なので all） ──
  const grammar = await loadGrammarPools();
  emitPool('grammar', 'all', grammar.byItem);

  // ── 診断プール（onboarding の12問選定は Worker が seed 付きで行う） ──
  const diag = await buildDiagnosisPools();
  writeJson(`${V}/diagnosis/pools.json`, diag);

  // ── 文法学習ドキュメント（study画面の本文。1文法=1ファイルで最小取得） ──
  const n2Drafts = await loadAllN2Drafts();
  let docCount = 0;
  for (const d of N3_GRAMMAR_DRAFTS) {
    writeJson(`${V}/grammar-doc/${d.grammarId}.json`, d);
    docCount += 1;
  }
  for (const d of n2Drafts) {
    writeJson(`${V}/grammar-doc/${d.grammarId}.json`, d);
    docCount += 1;
  }

  // ── 会話ミッション本文（1ミッション=1ファイル。レッスン開始時に現在分だけ配信） ──
  let missionCount = 0;
  for (const m of COURSE_MISSIONS) {
    writeJson(`${V}/conversation/${m.id}.json`, m);
    missionCount += 1;
  }

  // ── 構造メタ（stageContent を Worker で計算するための骨格。本文は含まない） ──
  const missions: Record<string, unknown> = {};
  for (const d of [...(N3_GRAMMAR_DRAFTS as never[]), ...(n2Drafts as never[])] as { grammarId: string; practice?: unknown }[]) {
    if (!d.practice) continue;
    try {
      missions[d.grammarId] = buildConversationMission(d as never);
    } catch { /* practice の形が合わない draft は会話対象外 */ }
  }
  writeJson(`${V}/meta/grammar-structure.json`, {
    n3Ids: grammar.n3Ids,
    n2Ids: grammar.n2Ids,
    n2ByUnit: Object.fromEntries(grammar.n2ByUnit),
    missions,
  });

  // ── 聴解音声の索引（実ファイルは content-audio/ から R2 へ。公開ディレクトリに置かない） ──
  writeJson(`${V}/meta/audio-index.json`, {
    sets: ALL_LISTENING_SETS.map((s) => ({ setId: s.setId, durationSeconds: s.durationSeconds, playLimit: s.playLimit })),
  });

  // ── pool 索引（Worker が「その target が何ページか」を知るためだけ。本文なし） ──
  writeJson(`${V}/meta/pool-index.json`, { pageSize: PAGE_SIZE, targets: index });

  const manifest = {
    version: V,
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    containsContent: false,
    files: fileCount,
    totalItems,
    grammarDocs: docCount,
    contentHash: createHash('sha256')
      .update(JSON.stringify(index) + totalItems)
      .digest('hex').slice(0, 16),
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('教材シャード v2 を書き出しました（dist/ の外・非公開）');
  console.log(`  出力先      : ${OUT}/`);
  console.log(`  pool target : ${index.length}`);
  console.log(`  問題        : ${totalItems.toLocaleString()}`);
  console.log(`  文法doc     : ${docCount}`);
  console.log(`  会話mission : ${missionCount}`);
  console.log(`  ファイル    : ${fileCount}`);
  console.log(`  合計bytes   : ${totalBytes.toLocaleString()}`);
  console.log(`  contentHash : ${manifest.contentHash}`);
};

await main();
