/**
 * 知識項目のID（2026-09-10 Phase 1）。
 *
 * 【この層の目的】
 * 教材は級ごと・技能ごとに別々の場所で育ってきた。文法だけでN5〜N1に552項目、
 * 語彙は4,759語あるが、**IDの読み方がどこにも書かれていない**。
 * 「この文字列は何の項目か」を1か所で答えられるようにするのが、この層の仕事。
 *
 * 【いちばん大事な制約：既存IDを変えない】
 * 学習履歴（AdvMasteryLedger）は `Record<targetId, 試行[]>` で、**targetId がそのまま
 * 既存のID**（`n2g-001` など）。ここで新しいID体系を作って振り直すと、
 * 実在の学習者の攻略記録・復習予定・錯題本がすべて迷子になる。
 * だから**新しいIDは1つも作らない**。いま使われている文字列の**読み方を定義するだけ**。
 *
 * 【実在するIDの形】（2026-09-10 実データから抽出）
 *   文法   n1g-001 / n2g-001 …（番号）  n3g-kke / n5g-desu …（綴り）  → 552項目
 *   語彙   vc-01-001 …                                              → 4,697語
 *   基礎語彙 fi-komaru …                                             → 62語
 *   単元   n3u-01-self / n3g-unit-1 / n5g-unit-1 …
 *   地域   area01-minato …
 *
 * 番号式と綴り式が混在しているのは歴史的な経緯で、**そろえない**。
 * そろえた瞬間に学習履歴と切れるため、混在したまま読めることのほうが価値がある。
 */

/** 知識項目の種類。学習の単位が違うものを分ける */
export type KnowledgeKind =
  | 'grammar'    // 文法項目（n1g-001 / n3g-kke）
  | 'vocab'      // 語彙（vc-01-001）
  | 'foundation' // 基礎語彙（fi-komaru）。vocab とは別の古い体系
  | 'unit'       // 単元の束（n3u-01-self / n5g-unit-1）
  | 'area';      // 冒険の地域（area01-minato）

export type KnowledgeLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

export interface KnowledgeId {
  /** 元の文字列。**これが正**（保存・照合はいつもこれ） */
  raw: string;
  kind: KnowledgeKind;
  /** IDから読み取れる級。読み取れないものは null（推測しない） */
  level: KnowledgeLevel | null;
}

/*
 * 形の定義。**単元は文法より先に判定する**
 * （`n5g-unit-1` は文法の形にも当てはまるため、順番が意味を持つ）。
 */
const UNIT_LEVELLED = /^n([1-5])[gu]-unit-\d+$/;      // n5g-unit-1
const UNIT_N3 = /^n3u-\d{2}-[a-z0-9-]+$/;             // n3u-01-self
const GRAMMAR = /^n([1-5])g-[a-z0-9-]+$/;             // n2g-001 / n3g-kke
const VOCAB = /^vc-\d{2}-\d{3}$/;                     // vc-01-001
const FOUNDATION = /^fi-[a-z0-9-]+$/;                 // fi-komaru
const AREA = /^area\d{2}-[a-z0-9-]+$/;                // area01-minato

const levelOf = (n: string): KnowledgeLevel | null => {
  const v = `N${n}`;
  return (['N1', 'N2', 'N3', 'N4', 'N5'] as const).find((l) => l === v) ?? null;
};

/**
 * IDを読む。読めなければ null。
 * **知らない形を勝手に解釈しない**（間違った級で教材が出るほうが、出ないより悪い）。
 */
export const parseKnowledgeId = (raw: string): KnowledgeId | null => {
  const id = (raw ?? '').trim();
  if (!id) return null;

  const unitLv = UNIT_LEVELLED.exec(id);
  if (unitLv) return { raw: id, kind: 'unit', level: levelOf(unitLv[1]) };
  if (UNIT_N3.test(id)) return { raw: id, kind: 'unit', level: 'N3' };

  const g = GRAMMAR.exec(id);
  if (g) return { raw: id, kind: 'grammar', level: levelOf(g[1]) };

  // 語彙IDは級を含まない（バッチ番号）。級は語彙データ側の level が正
  if (VOCAB.test(id)) return { raw: id, kind: 'vocab', level: null };
  if (FOUNDATION.test(id)) return { raw: id, kind: 'foundation', level: null };
  if (AREA.test(id)) return { raw: id, kind: 'area', level: null };

  return null;
};

export const isKnowledgeId = (raw: string): boolean => parseKnowledgeId(raw) !== null;

export const knowledgeKindOf = (raw: string): KnowledgeKind | null =>
  parseKnowledgeId(raw)?.kind ?? null;

/**
 * IDから読み取れる級。**語彙は null が正しい**
 * （IDにはバッチ番号しか入っておらず、級は語彙データ側の `level` が持っている）。
 */
export const knowledgeLevelOf = (raw: string): KnowledgeLevel | null =>
  parseKnowledgeId(raw)?.level ?? null;

/** 級の並び（下から上へ）。比較に使う */
export const LEVEL_ORDER: KnowledgeLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

/** a は b より上の級か（N1 が最上位） */
export const isHigherLevel = (a: KnowledgeLevel, b: KnowledgeLevel): boolean =>
  LEVEL_ORDER.indexOf(a) > LEVEL_ORDER.indexOf(b);
