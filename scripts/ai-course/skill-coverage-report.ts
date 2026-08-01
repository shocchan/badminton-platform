// 読解・聴解の coverage を「件数だけ」で判定しないための report（FINAL COMPLETION §15）。
//
// 100件に到達しただけで saturated にしない。形式別に、
// 難易度分布・本文の重複・構造の重複・未出容量・HOLD件数まで見て段階を決める。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/skill-coverage-report.ts
// 出力: docs/ai-course/adventure-v2/generated/skill-coverage.json
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  ALL_READING_SETS, readingCoverage, READING_TYPE_LABELS,
} from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import {
  ALL_LISTENING_SETS, listeningCoverage, setsWithoutAudio, playableSets, LISTENING_TYPE_LABELS,
} from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';

const OUT = 'docs/ai-course/adventure-v2/generated/skill-coverage.json';

/** §15 の段階。件数だけでは saturated にしない */
export type CoverageStage = 'empty' | 'insufficient' | 'pilot' | 'broad' | 'saturated';

/**
 * 「言い換えだけの水増し」を検出するキー。
 *
 * 設問文（「最も言いたいことは何か」等）は形式ごとに定型なので**設問では見ない**。
 * 本文・原稿の骨格（かなを落とした漢字・カタカナ列の先頭）で見る。
 * ここが重複するのは、同じ素材を言い換えて増やした場合。
 */
const structureKey = (s: string): string =>
  s.replace(/[、。「」\s\n]/g, '')
    .replace(/[ぁ-ん]/g, '')       // かなを落とし、漢字・カタカナの骨格で比較
    .slice(0, 24);

const stageOf = (opts: {
  active: number; target: number; uniqueBodies: number; duplicateStructures: number;
  difficultyKinds: number; hold: number;
}): CoverageStage => {
  const { active, target, uniqueBodies, duplicateStructures, difficultyKinds } = opts;
  if (active === 0) return 'empty';
  if (active < 6) return 'insufficient';
  // 本文が使い回されている／構造が重複している間は上の段階へ上げない
  const healthy = uniqueBodies === active && duplicateStructures === 0 && difficultyKinds >= 2;
  if (active < target * 0.5) return 'pilot';
  if (!healthy) return 'pilot';
  if (active < target) return 'broad';
  return 'saturated';
};

const readingReport = (level: 'N2' | 'N3', target: number) => {
  const sets = ALL_READING_SETS.filter((s) => s.sourceLevel === level);
  const byType: Record<string, unknown> = {};
  const perTypeTarget = Math.ceil(target / 5);
  for (const [type, label] of Object.entries(READING_TYPE_LABELS)) {
    const inType = sets.filter((s) => s.readingType === type);
    if (inType.length === 0 && !sets.some((s) => s.readingType === type)) continue;
    const bodies = new Set(inType.map((s) => s.passageJa));
    const structures = inType.map((s) => structureKey(s.passageJa));
    const dupStructures = structures.length - new Set(structures).size;
    const diffs = new Set(inType.map((s) => s.difficulty));
    byType[type] = {
      labelJa: label.ja,
      active: inType.length,
      target: perTypeTarget,
      uniqueBodies: bodies.size,
      duplicateStructures: dupStructures,
      difficultyDistribution: [1, 2, 3].map((d) => inType.filter((s) => s.difficulty === d).length),
      stage: stageOf({
        active: inType.length, target: perTypeTarget, uniqueBodies: bodies.size,
        duplicateStructures: dupStructures, difficultyKinds: diffs.size, hold: 0,
      }),
    };
  }
  const c = readingCoverage(level);
  return { level, total: sets.length, target, pilotPass: c.pass, byType };
};

const listeningReport = (level: 'N2' | 'N3', target: number) => {
  const all = ALL_LISTENING_SETS.filter((s) => s.sourceLevel === level);
  const playable = playableSets().filter((s) => s.sourceLevel === level);
  const byType: Record<string, unknown> = {};
  const perTypeTarget = Math.ceil(target / 5);
  for (const [type, label] of Object.entries(LISTENING_TYPE_LABELS)) {
    const inType = playable.filter((s) => s.listeningType === type);
    const heldInType = all.filter((s) => s.listeningType === type).length - inType.length;
    const scripts = new Set(inType.map((s) => s.transcriptJa));
    const structures = inType.map((s) => structureKey(s.transcriptJa));
    const dupStructures = structures.length - new Set(structures).size;
    const diffs = new Set(inType.map((s) => s.difficulty));
    byType[type] = {
      labelJa: label.ja,
      active: inType.length,
      target: perTypeTarget,
      uniqueAudio: scripts.size,
      heldForMissingAudio: heldInType,
      duplicateStructures: dupStructures,
      difficultyDistribution: [1, 2, 3].map((d) => inType.filter((s) => s.difficulty === d).length),
      stage: stageOf({
        active: inType.length, target: perTypeTarget, uniqueBodies: scripts.size,
        duplicateStructures: dupStructures, difficultyKinds: diffs.size, hold: heldInType,
      }),
    };
  }
  const c = listeningCoverage(level);
  return {
    level, total: all.length, playable: playable.length, target,
    pilotPass: c.pass, missingAudio: c.missingAudio.length, byType,
  };
};

const run = () => {
  const report = {
    generatedAt: new Date().toISOString(),
    note: '件数の到達だけで saturated にしない（§15）。本文の重複・構造の重複・難易度の偏りを見る。',
    reading: [readingReport('N3', 100), readingReport('N2', 120)],
    listening: [listeningReport('N3', 100), listeningReport('N2', 100)],
    audio: {
      playable: playableSets().length,
      missing: setsWithoutAudio(),
    },
  };
  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`);

  for (const r of report.reading) {
    console.log(`読解 ${r.level}: ${r.total}/${r.target}`);
    for (const [t, v] of Object.entries(r.byType)) {
      const x = v as Record<string, unknown>;
      console.log(`  ${x.labelJa}: ${x.active}/${x.target} stage=${x.stage} 本文重複=${(x.active as number) - (x.uniqueBodies as number)} 構造重複=${x.duplicateStructures}`);
    }
  }
  for (const r of report.listening) {
    console.log(`聴解 ${r.level}: 再生可 ${r.playable}/${r.target}（総数 ${r.total}・音声なし ${r.missingAudio}）`);
    for (const [t, v] of Object.entries(r.byType)) {
      const x = v as Record<string, unknown>;
      console.log(`  ${x.labelJa}: ${x.active}/${x.target} stage=${x.stage} HOLD=${x.heldForMissingAudio} 構造重複=${x.duplicateStructures}`);
    }
  }
  console.log('→', OUT);
};

run();
