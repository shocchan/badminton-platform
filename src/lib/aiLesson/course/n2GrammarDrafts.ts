// Phase 3P-5: N2文法の完成draft（監督指示3P-4と同一の完成条件）。
// 原本 n2GrammarData.ts は「例文のみ・meaningJa 10件・中文0」。ここで意味・中文・接続・
// 用法・ニュアンス・文体・第2例文・ふりがな・誤用注意・学習者フォーカス・類似/対比・
// 認識問題・産出問題・会話練習・語彙リンク・復習キー・route・Unit を揃えたものだけを収録する。
// 原本の例文は teacher_created（sourceExamples）として保持し、改変しない。
// N3シートと同表記の38件は中文・意味のsourceとして活用できる（n2-grammar-source-audit.json）。
import type { GrammarRegister } from './n3GrammarDrafts';

export interface N2GrammarDraft {
  grammarId: string;            // 原本 n2GrammarData.ts の grammarId と一致
  pattern: string;
  reading: string;
  level: 'N2';
  meaningJa: string;
  explanationZh: string;
  formation: string;
  usageScene: string;
  nuance: string;
  register: GrammarRegister;
  examplesJa: string[];         // [0]は原本の教師作成例文（改変しない）
  examplesZh: string[];
  furigana: string;
  commonMistakesZh: string;
  learnerFocus: string;
  similarPatterns: string[];
  contrast: string;
  recognition: {
    promptZh: string; options: string[]; answerIndex: number;
    distractorReason: string; explanationZh: string;
  };
  production: { promptJa: string; promptZh: string; expected: string[]; acceptable: string[] };
  practice: { themeJa: string; starterJa: string; starterZh: string; targetUse: string };
  /** 例文照合の鍵。不連続文型・活用で語尾が変わる文型で明示する */
  matchKeys?: string[];
  vocabularyLinks: string[];
  reviewKey: string;
  route: 'n2-grammar';
  unit: number;                 // 原本の unit12（1〜12）
  /** N3シート由来の中文を使った場合の出典。無い場合はnull（新規執筆） */
  zhSourceRowId: string | null;
  /** 原本例文。CEO確認により全件 teacher_created_confirmed（2026-07-28）。runtime使用可。 */
  sourceExample: { text: string; hash: string;
    rightsStatus: 'teacher_created_confirmed' };
  /** runtime例文の由来。confirmed後は原本をそのまま使う選択（source_confirmed）も可 */
  runtimeExampleOrigin: 'original_authored' | 'source_confirmed';
  reviewStatus: 'draft';
  humanReviewed: false;
  approved: false;
}

import { N2_GRAMMAR_DRAFTS_UNIT1 } from './n2GrammarDraftsUnit1';
import { N2_GRAMMAR_DRAFTS_UNIT2 } from './n2GrammarDraftsUnit2';
import { N2_GRAMMAR_DRAFTS_UNIT3 } from './n2GrammarDraftsUnit3';
import { N2_GRAMMAR_DRAFTS_UNIT4 } from './n2GrammarDraftsUnit4';
import { N2_GRAMMAR_DRAFTS_UNIT5 } from './n2GrammarDraftsUnit5';
import { N2_GRAMMAR_DRAFTS_UNIT6 } from './n2GrammarDraftsUnit6';
import { N2_GRAMMAR_DRAFTS_UNIT7 } from './n2GrammarDraftsUnit7';
import { N2_GRAMMAR_DRAFTS_UNIT8 } from './n2GrammarDraftsUnit8';
import { N2_GRAMMAR_DRAFTS_UNIT9 } from './n2GrammarDraftsUnit9';
import { N2_GRAMMAR_DRAFTS_UNIT10 } from './n2GrammarDraftsUnit10';
import { N2_GRAMMAR_DRAFTS_UNIT11 } from './n2GrammarDraftsUnit11';
import { N2_GRAMMAR_DRAFTS_UNIT12 } from './n2GrammarDraftsUnit12';

/** 現在の完成draft（全Unit集約）。追加は「全field完備」のUnitのみ。 */
export const N2_GRAMMAR_DRAFTS: N2GrammarDraft[] = [
  ...N2_GRAMMAR_DRAFTS_UNIT1,
  ...N2_GRAMMAR_DRAFTS_UNIT2,
  ...N2_GRAMMAR_DRAFTS_UNIT3,
  ...N2_GRAMMAR_DRAFTS_UNIT4,
  ...N2_GRAMMAR_DRAFTS_UNIT5,
  ...N2_GRAMMAR_DRAFTS_UNIT6,
  ...N2_GRAMMAR_DRAFTS_UNIT7,
  ...N2_GRAMMAR_DRAFTS_UNIT8,
  ...N2_GRAMMAR_DRAFTS_UNIT9,
  ...N2_GRAMMAR_DRAFTS_UNIT10,
  ...N2_GRAMMAR_DRAFTS_UNIT11,
  ...N2_GRAMMAR_DRAFTS_UNIT12,
];

export const n2GrammarDraftById = (id: string): N2GrammarDraft | undefined =>
  N2_GRAMMAR_DRAFTS.find((d) => d.grammarId === id);
