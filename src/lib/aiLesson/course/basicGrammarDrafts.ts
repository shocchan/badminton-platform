// 初級文法（N5・N4）バンク。2026-08-17 新設。
//
// 経緯（重要）: 冒険モードには N3文法76項目・N2文法178項目があるのに、**その手前の
// N5/N4文法が1項目も無かった**。そのため診断で基礎帯と測られた学習者（基礎キャンプ／
// N3語彙・文法の橋）には文法の学習ステップが生成されず、「単元のことば＋語彙バトル」
// だけが延々と続いていた（advContent.ts の stageContent は foundation_camp / n3_bridge に
// grammarIds を与えないため）。
// ゼロに近い状態からN3合格を目指す学習者にとって、文の作り方（です/ます・助詞・て形・
// た形・ない形・可能形・条件形…）を体系的に積む場所が無いのは最大のボトルネックだった。
//
// 設計:
// - 形式は N3GrammarDraft に**そのまま合わせる**（GrammarDraftLike 互換なので、
//   既存の出題生成 advVariants（rec/cloze/meaning/form）と mastery 判定が無改造で動く）
// - unit は n5g-unit-1.. / n4g-unit-1.. の束。項目単位で攻略判定すると
//   100項目超で完走不可能になるため、N3・N2と同じ束攻略にする
// - 中国語母語者向けであることを最優先。commonMistakesZh / learnerFocus / contrast は
//   「中国語話者が実際に間違えるところ」を書く（助詞・自他動詞・授受・て形の音便など）
// - すべて自作。既存教材・市販書籍の文面は使わない
import type { GrammarRegister } from './n3GrammarDrafts';

export type BasicGrammarLevel = 'N5' | 'N4';

/** N3GrammarDraft と同形（level/route/unit だけ初級用）。GrammarDraftLike 互換 */
export interface BasicGrammarDraft {
  grammarId: string;            // n5g-<安定キー> / n4g-<安定キー>
  pattern: string;
  reading: string;
  level: BasicGrammarLevel;
  meaningJa: string;
  explanationZh: string;
  formation: string;
  usageScene: string;
  nuance: string;
  register: GrammarRegister;
  examplesJa: string[];
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
  production: {
    promptJa: string; promptZh: string; expected: string[]; acceptable: string[];
  };
  practice: {
    themeJa: string; starterJa: string; starterZh: string; targetUse: string;
  };
  matchKeys?: string[];
  vocabularyLinks: string[];
  reviewKey: string;
  route: 'basic-grammar';
  unit: string;                 // n5g-unit-1〜 / n4g-unit-1〜
  reviewStatus: 'draft';
  humanReviewed: false;
  approved: false;
}

export const bg = (
  p: Omit<BasicGrammarDraft, 'route' | 'reviewStatus' | 'humanReviewed' | 'approved' | 'reviewKey'>
    & { reviewKey?: string },
): BasicGrammarDraft => ({
  route: 'basic-grammar', reviewStatus: 'draft', humanReviewed: false,
  approved: false, reviewKey: p.grammarId, ...p,
});
