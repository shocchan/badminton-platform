/**
 * 教材間接続の索引を、本番の教材全部から作る（2026-09-10 Phase 4）。
 * 文法は N5/N4（basic）・N3・N2・N1 の**公開中の項目だけ**（ギャップ教材 draft は入れない）。
 * 語彙は出題に使える語（active）。教材は読解・聴解の全級。
 */
import { loadAllBasicDrafts } from '../basicGrammarChunks';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { loadAllN2Drafts } from '../adventure/advContent';
import { N1_GRAMMAR_DRAFTS_UNIT1 } from '../n1GrammarDraftsUnit1';
import { N1_GRAMMAR_DRAFTS_UNIT2 } from '../n1GrammarDraftsUnit2';
import { N1_GRAMMAR_DRAFTS_UNIT3 } from '../n1GrammarDraftsUnit3';
import { N1_GRAMMAR_DRAFTS_UNIT4 } from '../n1GrammarDraftsUnit4';
import { N1_GRAMMAR_DRAFTS_UNIT5 } from '../n1GrammarDraftsUnit5';
import { N1_GRAMMAR_DRAFTS_UNIT6 } from '../n1GrammarDraftsUnit6';
import { N1_GRAMMAR_DRAFTS_UNIT7 } from '../n1GrammarDraftsUnit7';
import { N1_GRAMMAR_DRAFTS_UNIT8 } from '../n1GrammarDraftsUnit8';
import { N1_GRAMMAR_DRAFTS_UNIT9 } from '../n1GrammarDraftsUnit9';
import { N1_GRAMMAR_DRAFTS_UNIT10 } from '../n1GrammarDraftsUnit10';
import { ALL_VOCAB_CONTENT } from '../adventure/vocab/content/vocabContentBank';
import { activeContent } from '../adventure/vocab/vocabContent';
import { BANK_ITEMS } from '../foundationItemBank';
import { N3_ITEMS } from '../foundationVocabN3';
import { VOCAB_NEW_ITEMS } from '../foundationVocabBank';
import { ALL_READING_SETS } from '../adventure/reading/readingBank';
import { ALL_LISTENING_SETS } from '../adventure/listening/listeningBank';
import {
  buildCrossLinks, type CrossLinkIndex, type GrammarForLinks, type MaterialForLinks, type VocabForLinks,
} from './crossLinks';

interface DraftLike {
  grammarId: string; pattern: string; level: string;
  examplesJa?: string[]; vocabularyLinks?: string[];
  practice?: { themeJa: string; targetUse: string };
}

const toGrammar = (d: DraftLike): GrammarForLinks => ({
  grammarId: d.grammarId, pattern: d.pattern, level: d.level,
  examplesJa: d.examplesJa, vocabularyLinks: d.vocabularyLinks,
  practice: d.practice ? { themeJa: d.practice.themeJa, targetUse: d.practice.targetUse } : null,
});

export const loadAllGrammarForLinks = async (): Promise<GrammarForLinks[]> => {
  const [basic, n2] = await Promise.all([loadAllBasicDrafts(), loadAllN2Drafts()]);
  const n1 = [
    ...N1_GRAMMAR_DRAFTS_UNIT1, ...N1_GRAMMAR_DRAFTS_UNIT2, ...N1_GRAMMAR_DRAFTS_UNIT3, ...N1_GRAMMAR_DRAFTS_UNIT4,
    ...N1_GRAMMAR_DRAFTS_UNIT5, ...N1_GRAMMAR_DRAFTS_UNIT6, ...N1_GRAMMAR_DRAFTS_UNIT7, ...N1_GRAMMAR_DRAFTS_UNIT8,
    ...N1_GRAMMAR_DRAFTS_UNIT9, ...N1_GRAMMAR_DRAFTS_UNIT10,
  ];
  return [
    ...(basic as unknown as DraftLike[]), ...(N3_GRAMMAR_DRAFTS as unknown as DraftLike[]),
    ...(n2 as unknown as DraftLike[]), ...(n1 as unknown as DraftLike[]),
  ].map(toGrammar);
};

export const allVocabForLinks = (): VocabForLinks[] =>
  activeContent(ALL_VOCAB_CONTENT).map((c) => ({
    wordId: c.wordId, surface: c.surface, level: c.level,
    exampleJa: c.exampleJa, collocationsJa: c.collocationsJa, explanationJa: c.explanationJa, glossZh: c.glossZh,
  }));

export const allMaterialsForLinks = (): MaterialForLinks[] => [
  ...ALL_READING_SETS.map((s) => ({ setId: s.setId, kind: 'reading' as const, level: s.sourceLevel, text: s.passageJa, knowledge: s.knowledge })),
  ...ALL_LISTENING_SETS.map((s) => ({ setId: s.setId, kind: 'listening' as const, level: s.sourceLevel, text: s.transcriptJa, knowledge: s.knowledge })),
];

let cache: Promise<CrossLinkIndex> | null = null;

/** 本番教材の索引。重いので1回だけ作る */
export const loadCrossLinks = (): Promise<CrossLinkIndex> => {
  if (!cache) {
    cache = loadAllGrammarForLinks().then((grammar) => buildCrossLinks({
      grammar,
      vocab: allVocabForLinks(),
      foundation: [...BANK_ITEMS, ...N3_ITEMS, ...VOCAB_NEW_ITEMS].map((f) => ({ id: f.id, displayForm: f.displayForm, lemma: f.lemma })),
      materials: allMaterialsForLinks(),
    }));
  }
  return cache;
};
