// 教材を「ビルド時に実体化して、非公開のページ単位オブジェクトへ書き出す」スクリプト（P0）。
//
// なぜビルド時か:
//   語彙は 2,000語の原文から 1語あたり4〜6観点の問題を生成するため、実体化すると
//   1レベル約12MB になる（実測）。これは client にも Worker bundle にも載せられない。
//   リクエストの度に生成すると Worker の CPU を食う。だから**先に作って置いておく**。
//
// なぜページに分けるか:
//   Worker は R2 オブジェクトを丸ごと読む。target 単位（語彙N2で12MB）だと
//   1問のために12MB読むことになる。20問ずつに切って、必要なページだけ読む。
//
// 出力先は dist/ の**外**（content-dist/）。Pages のアセットにならないので公開されない。
//
//   npx vite-node scripts/ai-course/build-content-shards.mts

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { vocabPool } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { readingPool } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { listeningPool } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import { hashSeed, type AdvBattleQuestion } from '../../src/lib/aiLesson/course/adventure/advVariants';
import { seededFisherYates } from '../../src/lib/aiLesson/course/adventure/advChoiceOrder';
import type { InternalItem } from '../../src/lib/aiLesson/course/sales/contentGuard';

const OUT = 'content-dist';
const VERSION = 'v1';
/** 1ページの問題数。Worker が1リクエストで読む量を決める */
export const PAGE_SIZE = 20;

type Kind = 'vocab' | 'reading' | 'listening';
type Level = 'N2' | 'N3';

/**
 * バンクの問題を InternalItem へ落とす。
 *
 * ここが**内部IDを断ち切る唯一の場所**。とくに語彙の choiceId は
 * `${wordId}-x0` の形で内部の語IDを持っているので、位置ベースの `c0..c3` へ振り直す。
 * これをしないと、選択肢を文字列に落としても correctChoiceId から語IDが漏れる。
 */
const toInternal = (q: AdvBattleQuestion, bankIndex: number): InternalItem & {
  promptZh: string | null;
  passageJa: string | null;
  audioSetId: string | null;
} => {
  // **並べ替えてから位置IDを振る。**
  //
  // バンクは正解を先頭に置いて持っており（`choice(id, surface, true)` が最初）、
  // 表示順は実行時に advChoiceOrder がシャッフルする前提だった。
  // ビルド時に元の並びのまま位置IDを振ると、正解が 99.6% の確率で c0 になり、
  // 配信した時点で答えが位置から分かってしまう（実測して見つけた）。
  //
  // seed は問題キーから作るので、再ビルドしても同じ並びになる（差分が暴れない）。
  const shuffled = seededFisherYates(q.choices, hashSeed(`shard:${q.key}`));
  const choices = shuffled.map((c, i) => ({ ...c, positionId: `c${i}` }));
  const correct = choices.find((c) => c.isCorrect);
  return {
    id: q.key,
    bankIndex,
    sourceFile: q.explanation?.sourceLabel ?? q.sourceItemId ?? '',
    prompt: q.questionJa,
    // 文字列へ落とす。オブジェクトのまま渡すと choiceId が境界を越える
    choices: choices.map((c) => c.textJa),
    correctChoiceId: correct?.positionId ?? 'c0',
    explanationJa: q.explanation?.whyCorrectJa ?? q.explanation?.meaningJa ?? '',
    explanationZh: q.explanation?.whyCorrectZh ?? q.explanation?.meaningZh ?? '',
    promptZh: q.questionZh ?? null,
    // 読解は本文が targetJapanese に載っている。聴解は null（音声が本体）
    passageJa: q.skill === 'reading' ? q.targetJapanese : null,
    audioSetId: q.skill === 'listening' ? q.sourceItemId ?? null : null,
  };
};

interface TargetEntry {
  kind: Kind;
  level: Level;
  targetId: string;
  items: number;
  pages: number;
  /** 本文は入れない。中身が変わったかを見るためだけのhash */
  contentHash: string;
}

const entries: TargetEntry[] = [];
let totalItems = 0;
let totalBytes = 0;
/** 正解がどの位置に来たかの集計（偏り検査用） */
const answerPositions: Record<string, number> = {};

rmSync(OUT, { recursive: true, force: true });

const writeShard = (path: string, body: unknown) => {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  const json = JSON.stringify(body);
  writeFileSync(full, json);
  totalBytes += Buffer.byteLength(json, 'utf8');
};

/**
 * キーに level を含める理由（一度 level を外そうとして失敗した記録）。
 *
 * `vocab-n4` は N3 要求でも N2 要求でも 7,345 問で同一なので、
 * 「targetId が level を含んでいるのだから重複だ」と考えたくなる。だが **`vocab-n3` は違う**。
 * N3 要求では 586 問、N2 要求では 602 問になる。
 * `buildVocabQuestions` が誤答選択肢を「その要求レベルの語彙プール全体」から選ぶため、
 * N2 スコープだと N3 の語にも N2 の紛らわしい語が誤答として付くからである。
 *
 * つまり同じ targetId でも**要求レベルによって中身が変わりうる**。
 * level をキーから外すと、片方が片方を静かに上書きする。だから含める。
 * 下の hash 照合は、この前提が将来崩れたときに気づくための番人として残す。
 */
const emitted = new Map<string, string>();

const emitPool = (kind: Kind, level: Level, pool: Map<string, AdvBattleQuestion[]>) => {
  for (const [targetId, questions] of pool) {
    const items = questions.map(toInternal);
    const hash = createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 16);
    const shardKey = `${kind}/${level.toLowerCase()}/${targetId}`;

    const already = emitted.get(shardKey);
    if (already && already !== hash) {
      throw new Error(`${shardKey} を違う中身で二度書こうとしました（${already} vs ${hash}）`);
    }
    emitted.set(shardKey, hash);

    for (const it of items) {
      answerPositions[it.correctChoiceId] = (answerPositions[it.correctChoiceId] ?? 0) + 1;
    }

    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    for (let p = 0; p < pages; p++) {
      writeShard(
        `${VERSION}/${shardKey}/${p}.json`,
        { targetId, page: p, items: items.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE) },
      );
    }
    entries.push({ kind, level, targetId, items: items.length, pages, contentHash: hash });
    totalItems += items.length;
  }
};

for (const level of ['N3', 'N2'] as const) {
  emitPool('vocab', level, vocabPool(level));
  emitPool('reading', level, readingPool(level));
  emitPool('listening', level, listeningPool(level));
}

// manifest には**件数とhashだけ**。本文も問題文も入れない。
// Worker が「その target が何ページあるか」を知るためだけに使う。
const manifest = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  pageSize: PAGE_SIZE,
  containsContent: false,
  targets: entries.sort((a, b) => a.targetId.localeCompare(b.targetId)),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// 正解位置が偏っていないかを毎回確かめる。
// 偏っていると、配信した時点で位置から答えが分かる（一度これで 99.6% が c0 になった）
const worst = Math.max(...Object.values(answerPositions));
const worstShare = worst / totalItems;
const positionSummary = Object.entries(answerPositions)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k} ${(100 * v / totalItems).toFixed(1)}%`)
  .join(' / ');

const pageCount = entries.reduce((n, e) => n + e.pages, 0);
console.log('教材シャードを書き出しました（dist/ の外・非公開）');
console.log(`  出力先      : ${OUT}/`);
console.log(`  target      : ${entries.length}`);
console.log(`  ページ      : ${pageCount}（1ページ ${PAGE_SIZE} 問）`);
console.log(`  問題        : ${totalItems.toLocaleString()}`);
console.log(`  合計bytes   : ${totalBytes.toLocaleString()}`);
console.log(`  平均ページ  : ${Math.round(totalBytes / pageCount).toLocaleString()} bytes`);
console.log(`  正解位置    : ${positionSummary}`);

// 4択なら理想は25%ずつ。半分を超えたら位置から答えが読めるので止める
if (worstShare > 0.5) {
  console.error(`\n❌ 正解位置が偏っています（最大 ${(100 * worstShare).toFixed(1)}%）。配信すると位置で答えが分かります。`);
  process.exit(1);
}
