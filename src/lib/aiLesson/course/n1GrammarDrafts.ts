// N1文法の完成draft（2026-09-05 開始・lin さんの12月受験に向けた新規構築）。
//
// なぜ別ファイルなのか:
//   N2は「教師が作った原本の例文（sourceExample）」を持つ形で作られている。
//   N1は原本が無く**全部こちらで書き起こす**ので、原本まわりの項目を持たない型にする。
//   それ以外の完成条件（意味・中文・接続・用法・ニュアンス・文体・例文2本・ふりがな・
//   誤用注意・学習者フォーカス・類似/対比・認識問題・産出問題・会話練習）はN2と同じ。
//
// 出題生成（advVariants.buildVariantPool）は GrammarDraftLike の構造だけを見るので、
// この型はそのまま渡せる。levelは 'N1'、bandは 'n1'。
import type { GrammarRegister } from './n3GrammarDrafts';

export interface N1GrammarDraft {
  grammarId: string;
  pattern: string;
  reading: string;
  level: 'N1';
  meaningJa: string;
  explanationZh: string;
  formation: string;
  usageScene: string;
  nuance: string;
  register: GrammarRegister;
  /** 例文はすべて自社で書き起こす（他ソースの例文を写さない） */
  examplesJa: string[];
  examplesZh: string[];
  furigana: string;
  commonMistakesZh: string;
  learnerFocus: string;
  similarPatterns: string[];
  contrast: string;
  recognition: {
    promptZh: string; options: string[]; answerIndex: number;
    distractorReason: string; distractorReasonZh: string; explanationZh: string;
  };
  production: { promptJa: string; promptZh: string; expected: string[]; acceptable: string[] };
  practice: { themeJa: string; starterJa: string; starterZh: string; targetUse: string };
  /** 例文照合の鍵。不連続文型・活用で語尾が変わる文型で明示する */
  matchKeys?: string[];
  /** 関連づける語彙のid（無ければ空配列） */
  vocabularyLinks: string[];
  route: 'n1-grammar';
  /** 単元（1〜10） */
  unit: number;
  /** 例文の由来。N1はすべて新規執筆 */
  runtimeExampleOrigin: 'original_authored';
  reviewStatus: 'draft';
  humanReviewed: false;
  approved: false;
}

/** draft作成のヘルパー。固定値を書き忘れないようにする */
export const n1g = (
  p: Omit<N1GrammarDraft, 'level' | 'route' | 'runtimeExampleOrigin' | 'reviewStatus' | 'humanReviewed' | 'approved'>,
): N1GrammarDraft => ({
  level: 'N1', route: 'n1-grammar', runtimeExampleOrigin: 'original_authored',
  reviewStatus: 'draft', humanReviewed: false, approved: false, ...p,
});
