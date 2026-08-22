// 聴解bankのruntime（COMPLETION §7）。
// **音声assetがmanifestに無いsetは出題しない**（存在するふりをしない）。
import type { AdvBattleQuestion } from '../advVariants';
import { SECTION_OF_SKILL } from '../advExamSkills';
import { N2_LISTENING_SETS } from './n2ListeningSets';
import { N3_LISTENING_SETS } from './n3ListeningSets';
// 拡張バッチ（FINAL COMPLETION §14）。type別にファイルを分けて増やしていく
import { N3_LISTENING_TASK_B } from './n3ListeningTaskB';
import { N3_LISTENING_POINT_B } from './n3ListeningPointB';
import { N3_LISTENING_OUTLINE_B } from './n3ListeningOutlineB';
import { N3_LISTENING_QUICK_B } from './n3ListeningQuickB';
import { N3_LISTENING_INT_B } from './n3ListeningIntB';
import { N2_LISTENING_TASK_B } from './n2ListeningTaskB';
import { N2_LISTENING_POINT_B } from './n2ListeningPointB';
import { N2_LISTENING_OUTLINE_B } from './n2ListeningOutlineB';
import { N2_LISTENING_QUICK_B } from './n2ListeningQuickB';
import { N2_LISTENING_INT_B } from './n2ListeningIntB';
// N5/N4（2026-08-20 追加）。目標レベルにN5/N4を解禁したのに聴解が0本だったため。
// 本試験のN5/N4聴解に無い型（概要理解・統合理解）は作っていない → 各12セット・3型
import { N5_LISTENING_SETS_A } from './n5ListeningSetsA';
import { N5_LISTENING_TASK_B } from './n5ListeningTaskB';
import { N5_LISTENING_POINT_B } from './n5ListeningPointB';
import { N5_LISTENING_QUICK_B } from './n5ListeningQuickB';
import { N4_LISTENING_SETS_A } from './n4ListeningSetsA';
import { N4_LISTENING_TASK_B } from './n4ListeningTaskB';
import { N4_LISTENING_POINT_B } from './n4ListeningPointB';
import { N4_LISTENING_QUICK_B } from './n4ListeningQuickB';
import {
  LISTENING_TYPE_LABELS, listeningKeyOf,
  type ListeningLevel, type ListeningSet, type ListeningType,
} from './listeningTypes';
import audioManifest from '../../../../../../docs/ai-course/adventure-v2/generated/audio-manifest.json';

export { LISTENING_TYPE_LABELS, listeningKeyOf };
export type { ListeningLevel, ListeningSet, ListeningType };

export const ALL_LISTENING_SETS: ListeningSet[] = [
  ...N5_LISTENING_SETS_A,
  ...N5_LISTENING_TASK_B,
  ...N5_LISTENING_POINT_B,
  ...N5_LISTENING_QUICK_B,
  ...N4_LISTENING_SETS_A,
  ...N4_LISTENING_TASK_B,
  ...N4_LISTENING_POINT_B,
  ...N4_LISTENING_QUICK_B,
  ...N3_LISTENING_SETS,
  ...N3_LISTENING_TASK_B, ...N3_LISTENING_POINT_B, ...N3_LISTENING_OUTLINE_B,
  ...N3_LISTENING_QUICK_B, ...N3_LISTENING_INT_B,
  ...N2_LISTENING_SETS,
  ...N2_LISTENING_TASK_B, ...N2_LISTENING_POINT_B, ...N2_LISTENING_OUTLINE_B,
  ...N2_LISTENING_QUICK_B, ...N2_LISTENING_INT_B,
];

interface AudioEntry { setId: string; path: string; durationSeconds: number; bytes: number }
const MANIFEST_ENTRIES: AudioEntry[] = (audioManifest as { entries?: AudioEntry[] }).entries ?? [];
const AUDIO_BY_ID = new Map(MANIFEST_ENTRIES.map((e) => [e.setId, e]));

/** 音声が実在するsetだけ（= 出題可能） */
export const playableSets = (): ListeningSet[] =>
  ALL_LISTENING_SETS
    .filter((s) => AUDIO_BY_ID.has(s.setId))
    .map((s) => ({ ...s, durationSeconds: AUDIO_BY_ID.get(s.setId)?.durationSeconds ?? s.durationSeconds }));

/** 音声が無いsetのID（監査・HOLD報告用） */
export const setsWithoutAudio = (): string[] =>
  ALL_LISTENING_SETS.filter((s) => !AUDIO_BY_ID.has(s.setId)).map((s) => s.setId);

/**
 * その級の「音声が実在する」聴解セット。
 *
 * 2026-08-18 の時点では N5/N4 の音源が0本だったので、ここで無条件に空を返していた
 * （存在しないものを「ある」ように見せない・原則13）。
 * 2026-08-20 に N5/N4 各12セットと音声を追加したので、ガードを外して他の級と同じ扱いにした。
 * ガードではなく **manifest に音声があるか** で決まるので、音声生成に失敗した set は
 * 今も自動的に出題されない（playableSets が落とす）。
 */
export const listeningSetsFor = (level: ListeningLevel): ListeningSet[] =>
  playableSets().filter((s) => s.sourceLevel === level);

export const listeningSetById = (setId: string): ListeningSet | undefined =>
  playableSets().find((s) => s.setId === setId);

/** 聴解セット → バトル問題。transcriptは問題文へ入れない（解答前に見せない） */
export const listeningToQuestion = (s: ListeningSet): AdvBattleQuestion => ({
  key: listeningKeyOf(s),
  type: `listen-${s.listeningType}`,
  // N5/N4 は基礎帯の問題として扱う（AdvBattleQuestion.level は foundation/n3/n2 の3値）。
  // 読解の readingToQuestion と同じ対応にしてある
  level: s.sourceLevel === 'N2' ? 'n2' : s.sourceLevel === 'N3' ? 'n3' : 'foundation',
  skill: 'listening',
  examSection: SECTION_OF_SKILL.listening,
  targetJapanese: null, // 音声が本体。文字は出さない
  questionJa: s.questionJa,
  questionZh: s.questionZh,
  choices: s.choices.map((c) => ({
    choiceId: c.choiceId,
    textJa: c.textJa,
    isCorrect: c.isCorrect,
    whyWrongJa: c.whyWrongJa,
    whyWrongZh: undefined,
  })),
  explanation: {
    meaningJa: s.explanationJa,
    meaningZh: s.explanationZh,
    whyCorrectJa: s.explanationJa,
    whyCorrectZh: s.explanationZh,
    exampleJa: s.transcriptJa, // 回答後にのみUIが表示する
    exampleZh: null,
    sourceItemId: s.setId,
    sourceLabel: LISTENING_TYPE_LABELS[s.listeningType].ja,
  },
  sourceItemId: s.setId,
  difficulty: s.difficulty,
  timed: false,
  variantId: s.setId,
  reviewState: s.reviewState,
  status: 'validated_beta',
});

export const listeningPool = (level: ListeningLevel): Map<string, AdvBattleQuestion[]> => {
  const map = new Map<string, AdvBattleQuestion[]>();
  for (const s of listeningSetsFor(level)) {
    const target = `listen-${s.sourceLevel.toLowerCase()}-${s.listeningType}`;
    const list = map.get(target) ?? [];
    list.push(listeningToQuestion(s));
    map.set(target, list);
  }
  return map;
};

export const listeningTargetIds = (level: ListeningLevel): string[] => [...listeningPool(level).keys()];

export interface ListeningCoverage {
  level: 'N2' | 'N3';
  total: number;
  playable: number;
  byType: Record<string, number>;
  typesBelowMinimum: string[];
  missingAudio: string[];
  pass: boolean;
}

/**
 * Pilot最低coverage（各主要type 5セット以上・合計25セット以上・全て再生可能）。
 *
 * **N5/N4はこの基準の対象外**なので、引数の型を 'N2' | 'N3' のままにしてある。
 * 本試験のN5/N4聴解には概要理解・統合理解が無く、発話表現は絵が要るため作っていない。
 * 5type×5セット＝25セットという形は、5typeが出るN3/N2の話であって、
 * N5/N4（3type×4セット＝12）へ当てはめると「足りない」と嘘の判定になる。
 */
export const listeningCoverage = (level: 'N2' | 'N3'): ListeningCoverage => {
  const all = ALL_LISTENING_SETS.filter((s) => s.sourceLevel === level);
  const sets = listeningSetsFor(level);
  const byType: Record<string, number> = {};
  for (const s of sets) byType[s.listeningType] = (byType[s.listeningType] ?? 0) + 1;
  const typesBelowMinimum = Object.entries(byType).filter(([, n]) => n < 5).map(([t]) => t);
  const missingAudio = all.filter((s) => !AUDIO_BY_ID.has(s.setId)).map((s) => s.setId);
  return {
    level, total: all.length, playable: sets.length, byType, typesBelowMinimum, missingAudio,
    pass: sets.length >= 25 && typesBelowMinimum.length === 0 && missingAudio.length === 0,
  };
};

/** 聴解が「準備できている」か（総合模試の開放条件に使う） */
export const listeningReady = (level: 'N2' | 'N3'): boolean => listeningCoverage(level).pass;
