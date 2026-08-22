// 問題バンクの自動警告（CEO監査用）。
//
// **警告は問題を自動削除しない。** 人間が見つけやすくするための印だけを付ける。
// 「怪しい」と「間違い」は違うので、判定はここに集約して基準を1か所に置く。
import type { AdvBattleQuestion } from './advVariants';

export type QuestionWarningKind =
  | 'correct_longest'            // 正解だけが長い＝読まずに当てられる
  | 'length_skew'                // 選択肢の長さが大きく偏る
  | 'duplicate_choice'           // 同じ選択肢が2つ以上
  | 'multiple_correct_candidate' // 正解が2つになりうる（同義の誤答）
  | 'implausible_kana'           // 実在しない仮名列が誤答に入っている
  | 'duplicate_question_text'    // 同じ問題文が別IDで存在
  | 'duplicate_choice_set'       // 同じ選択肢の組み合わせが別IDで存在
  | 'missing_explanation'        // 解説が無い
  | 'missing_zh'                 // 中国語が無い
  | 'level_mismatch'             // 語のレベルと問題のレベル帯が食い違う
  | 'readiness_overcount'        // N2 readiness へ基礎問題が加算されうる
  | 'hold_leakage'               // 出題対象外の語から作られている
  | 'missing_source_sense_id';   // どの語から作ったか辿れない

/**
 * defect … 直す必要がある可能性が高いもの
 * info   … 事実の分類。直す対象ではないが、集計時に混ぜてはいけないもの
 *          （例: N3の語がN2ルートに出るのは設計どおり。ただし N2 readiness へ数えてはいけない）
 */
export type WarningSeverity = 'defect' | 'info';

export interface QuestionWarning {
  kind: QuestionWarningKind;
  severity: WarningSeverity;
  detailJa: string;
}

export const WARNING_SEVERITY: Record<QuestionWarningKind, WarningSeverity> = {
  correct_longest: 'defect',
  length_skew: 'defect',
  duplicate_choice: 'defect',
  multiple_correct_candidate: 'defect',
  implausible_kana: 'defect',
  duplicate_question_text: 'defect',
  duplicate_choice_set: 'defect',
  missing_explanation: 'defect',
  missing_zh: 'defect',
  level_mismatch: 'defect',
  hold_leakage: 'defect',
  missing_source_sense_id: 'defect',
  readiness_overcount: 'info',
};

export const WARNING_LABEL: Record<QuestionWarningKind, string> = {
  correct_longest: '正解だけが長い',
  length_skew: '選択肢の長さが偏る',
  duplicate_choice: '重複した選択肢',
  multiple_correct_candidate: '複数正解の疑い',
  implausible_kana: '不自然な仮名列',
  duplicate_question_text: '同一の問題文',
  duplicate_choice_set: '同一の選択肢セット',
  missing_explanation: '解説が無い',
  missing_zh: '中国語が無い',
  level_mismatch: 'レベル不整合',
  readiness_overcount: '基礎問題のreadiness誤加算',
  hold_leakage: '出題対象外の語',
  missing_source_sense_id: 'sourceSenseId欠落',
};

export interface AuditContext {
  /** 出題元の語のレベル（層Cのみ。単元問題は null） */
  wordLevel: string | null;
  /** N2スコープに入っているか */
  inN2: boolean;
  /** 出題してよい語の `surface|reading` 集合（hold leakage 検出用） */
  activeSurfaces: Set<string>;
  /** 実在する読みの集合（読み問題の誤答が機械生成の非語でないかを見る） */
  realReadings: Set<string>;
  /** 問題文 → 最初に見つけた questionId（重複検出用・呼び出し側で使い回す） */
  seenQuestionText: Map<string, string>;
  /** 選択肢セット → 最初に見つけた questionId */
  seenChoiceSet: Map<string, string>;
}

const len = (s: string) => [...s].length;

/** 実在しそうな仮名列か（読み問題の誤答が機械生成の非語でないかの目安） */
const KANA_ONLY = /^[぀-ゟ゠-ヿー]+$/;

export const analyzeQuestion = (
  q: AdvBattleQuestion, ctx: AuditContext,
): QuestionWarning[] => {
  const out: QuestionWarning[] = [];
  const choices = q.choices ?? [];
  const texts = choices.map((c) => c.textJa ?? '');
  const correct = choices.find((c) => c.isCorrect);

  // ── 選択肢の形 ──
  if (texts.length > 1) {
    const lens = texts.map(len);
    const max = Math.max(...lens);
    const min = Math.min(...lens);
    if (correct && len(correct.textJa) === max && lens.filter((l) => l === max).length === 1 && max >= min + 3) {
      out.push({ kind: 'correct_longest', severity: WARNING_SEVERITY['correct_longest'], detailJa: `正解 ${max}字 / 最短 ${min}字` });
    }
    if (min > 0 && max / min > 3.2) {
      out.push({ kind: 'length_skew', severity: WARNING_SEVERITY['length_skew'], detailJa: `最長/最短 = ${(max / min).toFixed(1)}倍` });
    }
  }
  const uniq = new Set(texts.map((t) => t.trim()));
  if (uniq.size !== texts.length) {
    out.push({ kind: 'duplicate_choice', severity: WARNING_SEVERITY['duplicate_choice'], detailJa: `${texts.length}択中 ${uniq.size}種類` });
  }
  if (choices.filter((c) => c.isCorrect).length !== 1) {
    out.push({ kind: 'multiple_correct_candidate', severity: WARNING_SEVERITY['multiple_correct_candidate'], detailJa: `正解フラグ ${choices.filter((c) => c.isCorrect).length}件` });
  }

  // ── 読み問題の誤答が非語でないか ──
  // かなを1文字ずらして作った「ふきゅぬ」のような非語は、日本語を知らなくても消去法で当たる
  if (q.type === 'vocab-reading' && ctx.realReadings.size > 0) {
    const fake = choices
      .filter((x) => !x.isCorrect)
      .map((x) => (x.textJa ?? '').trim())
      .filter((t) => t && KANA_ONLY.test(t) && !ctx.realReadings.has(t));
    if (fake.length > 0) {
      out.push({ kind: 'implausible_kana', severity: WARNING_SEVERITY['implausible_kana'], detailJa: `実在しない読み: ${fake.join('・')}` });
    }
  }

  // ── 出題対象外の語から作られていないか（hold leakage） ──
  if (ctx.wordLevel !== null && ctx.activeSurfaces.size > 0) {
    const key = `${q.explanation?.sourceLabel ?? ''}`;
    if (key && ![...ctx.activeSurfaces].some((k) => k.startsWith(`${key}|`))) {
      out.push({ kind: 'hold_leakage', severity: WARNING_SEVERITY['hold_leakage'], detailJa: `「${key}」は出題対象の語に無い` });
    }
  }

  // ── 重複（別IDで同じ中身） ──
  // 文法クローズは**設問文が指示文だけ**で、本文（例文）は targetJapanese に入る。
  // questionJa だけを見ていたため、中身の違う389問が「同一の問題文」に化けていた
  //（2026-08-22 監査の誤検知。実際に重複していたのは表記・文脈の側だった）
  const qt = [q.targetJapanese ?? '', q.questionJa ?? ''].join('\n').trim();
  if (qt) {
    const prev = ctx.seenQuestionText.get(qt);
    if (prev && prev !== q.key) out.push({ kind: 'duplicate_question_text', severity: WARNING_SEVERITY['duplicate_question_text'], detailJa: `${prev} と同一` });
    else if (!prev) ctx.seenQuestionText.set(qt, q.key);
  }
  const cs = [...texts].map((t) => t.trim()).sort().join('|');
  if (cs.replace(/\|/g, '')) {
    const prev = ctx.seenChoiceSet.get(cs);
    if (prev && prev !== q.key) out.push({ kind: 'duplicate_choice_set', severity: WARNING_SEVERITY['duplicate_choice_set'], detailJa: `${prev} と同一` });
    else if (!prev) ctx.seenChoiceSet.set(cs, q.key);
  }

  // ── 欠落 ──
  if (!q.explanation?.whyCorrectJa?.trim()) out.push({ kind: 'missing_explanation', severity: WARNING_SEVERITY['missing_explanation'], detailJa: '日本語の解説が無い' });
  if (!q.questionZh?.trim() || !q.explanation?.whyCorrectZh?.trim()) {
    out.push({ kind: 'missing_zh', severity: WARNING_SEVERITY['missing_zh'], detailJa: '中国語の設問または解説が無い' });
  }
  if (!q.sourceItemId) out.push({ kind: 'missing_source_sense_id', severity: WARNING_SEVERITY['missing_source_sense_id'], detailJa: 'どの語から作ったか辿れない' });

  // ── レベル ──
  if (ctx.wordLevel) {
    const band = q.level; // 'foundation' | 'n3' | 'n2'
    const expect = ctx.wordLevel === 'N2' || ctx.wordLevel === 'N1' ? 'n2'
      : ctx.wordLevel === 'N3' ? 'n3' : 'foundation';
    if (band !== expect) {
      out.push({ kind: 'level_mismatch', severity: WARNING_SEVERITY['level_mismatch'], detailJa: `語=${ctx.wordLevel} / 問題帯=${band}` });
    }
    // N2ルートに出る N3以下の語は「基礎補強」。N2の実力としては数えられない
    if (ctx.inN2 && expect !== 'n2') {
      out.push({
        kind: 'readiness_overcount',
        severity: WARNING_SEVERITY.readiness_overcount,
        detailJa: `${ctx.wordLevel}の語がN2ルートに出る（基礎補強。N2 readinessへ加算しないこと）`,
      });
    }
  }

  return out;
};
