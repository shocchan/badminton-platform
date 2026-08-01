// 聴解bankのruntime（COMPLETION §7）。
// **音声assetがmanifestに無いsetは出題しない**（存在するふりをしない）。
import type { AdvBattleQuestion } from '../advVariants';
import { SECTION_OF_SKILL } from '../advExamSkills';
import { N2_LISTENING_SETS } from './n2ListeningSets';
import { N3_LISTENING_SETS } from './n3ListeningSets';
import { LISTENING_TYPE_LABELS, listeningKeyOf, type ListeningSet, type ListeningType } from './listeningTypes';
import audioManifest from '../../../../../../docs/ai-course/adventure-v2/generated/audio-manifest.json';

export { LISTENING_TYPE_LABELS, listeningKeyOf };
export type { ListeningSet, ListeningType };

export const ALL_LISTENING_SETS: ListeningSet[] = [...N3_LISTENING_SETS, ...N2_LISTENING_SETS];

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

export const listeningSetsFor = (level: 'N2' | 'N3'): ListeningSet[] =>
  playableSets().filter((s) => s.sourceLevel === level);

export const listeningSetById = (setId: string): ListeningSet | undefined =>
  playableSets().find((s) => s.setId === setId);

/** 聴解セット → バトル問題。transcriptは問題文へ入れない（解答前に見せない） */
export const listeningToQuestion = (s: ListeningSet): AdvBattleQuestion => ({
  key: listeningKeyOf(s),
  type: `listen-${s.listeningType}`,
  level: s.sourceLevel === 'N2' ? 'n2' : 'n3',
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

export const listeningPool = (level: 'N2' | 'N3'): Map<string, AdvBattleQuestion[]> => {
  const map = new Map<string, AdvBattleQuestion[]>();
  for (const s of listeningSetsFor(level)) {
    const target = `listen-${s.sourceLevel.toLowerCase()}-${s.listeningType}`;
    const list = map.get(target) ?? [];
    list.push(listeningToQuestion(s));
    map.set(target, list);
  }
  return map;
};

export const listeningTargetIds = (level: 'N2' | 'N3'): string[] => [...listeningPool(level).keys()];

export interface ListeningCoverage {
  level: 'N2' | 'N3';
  total: number;
  playable: number;
  byType: Record<string, number>;
  typesBelowMinimum: string[];
  missingAudio: string[];
  pass: boolean;
}

/** Pilot最低coverage（各主要type 5セット以上・合計25セット以上・全て再生可能） */
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
