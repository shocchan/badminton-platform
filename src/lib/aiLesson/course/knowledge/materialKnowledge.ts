/**
 * 教材1本と知識グラフの接続（2026-09-10 Phase 2-3/2-5）。
 *
 * 読解・聴解の1セットが「何を測っているか」「どの文法・語彙を知っていれば解けるか」を、
 * **既存のID**（n1g-001 / vc-41-001 …）で残す。教材の本文は1文字も変えない。
 * 聴解（ListeningKnowledge）と読解（ReadingSet.knowledge）で同じ形を使う＝Phase 4 で
 * 文法↔語彙↔読解↔聴解を1つの関数で辿れるようにするため。
 */
import type { PracticalDomain } from './practicalAxis';

export interface MaterialKnowledge {
  /** 何が読み取れれば／聞き取れれば正解できるか（測っている理解の対象） */
  comprehensionTarget: string;
  /** 誤答の作り方（どの読み違い・聞き違いを狙っているか） */
  distractorDesign: string;
  /** 本文に出る文法項目（既存の grammarId） */
  grammarLinks: string[];
  /** 本文に出る語彙（既存の wordId） */
  vocabularyLinks: string[];
  /** Practical Axis の分野 */
  domain: PracticalDomain;
}
