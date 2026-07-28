// Answer Leakage 検出（§11・P1 release blocker）。
//
// 問題: 「答えを教える画面」と「記憶を確認する画面」が同居していると、
// 学習者は記憶ではなく画面上の情報を読んで正解でき、mastery判定が成立しない。
// CEO確認済みの実例: 「先生」の意味を問う直前に中国語訳（例文訳）を表示していた。
//
// 本moduleは「実際に画面へ出す内容」を対象に検査する（データ定義だけでなく提示の検査）。
import type { FoundationQuestion } from '../foundationTypes';

/** 学習フェーズ: teach=答えを見せてよい / assess=記憶を測る（答えを見せてはいけない） */
export type LearningPhase = 'teach' | 'assess';

export interface PresentedQuestion {
  questionId: string;
  phase: LearningPhase;
  /** 同一画面または直前に提示した教示テキスト（解説・例文・訳・注記・ふりがな） */
  teachTexts: string[];
  /** 問題文（日本語・中国語とも） */
  promptTexts: string[];
  choices: string[];
  correctAnswer: string;
  /** 画像alt・aria-label・sr-onlyなど、視覚以外に露出するテキスト */
  mediaTexts?: string[];
}

export type LeakageKind =
  | 'answer_in_teach_text'    // 教示テキストに答えが出ている（同一画面/直前）
  | 'answer_in_prompt'        // 問題文に答えが含まれる
  | 'answer_in_media_text'    // alt/aria/sr-onlyに答えが含まれる
  | 'length_outlier'          // 正解だけ極端に長い
  | 'style_outlier'           // 正解だけ文体（句点等）が違う
  | 'duplicate_choice'        // 選択肢が重複し正解が一意でない
  | 'answer_not_in_choices';  // 正解が選択肢にない（設問破綻）

export interface LeakageFinding {
  questionId: string;
  kind: LeakageKind;
  severity: 'P1' | 'P2';
  releaseBlocker: boolean;
  detail: string;
}

/** 中国語意味文字列から「核となる語」を取り出す。「（自）变化；改变」→ ['变化','改变'] */
export const meaningTokens = (meaning: string): string[] =>
  meaning
    .replace(/[（(][^）)]*[）)]/g, '')       // 品詞注記など括弧を除去
    .split(/[；;、,／/]/)                    // 併記された訳を分割
    .map(s => s.trim())
    .filter(s => s.length >= 1);

/** 表記ゆれを吸収した包含判定（空白・句読点を無視） */
const normalize = (s: string) => s.replace(/[\s。、．，,.!！?？「」『』]/g, '');

const contains = (haystack: string, needle: string): boolean => {
  const h = normalize(haystack), n = normalize(needle);
  return n.length > 0 && h.includes(n);
};

/**
 * 提示された1問を検査する。
 * assessフェーズでの答えの露出のみをP1（release blocker）とし、
 * teachフェーズでの露出は設計どおりなので検出しない。
 */
export const auditPresentedQuestion = (q: PresentedQuestion): LeakageFinding[] => {
  const out: LeakageFinding[] = [];
  const add = (kind: LeakageKind, severity: 'P1' | 'P2', detail: string) =>
    out.push({ questionId: q.questionId, kind, severity, releaseBlocker: severity === 'P1', detail });

  // 設問の整合（フェーズによらず破綻）
  if (!q.choices.includes(q.correctAnswer)) {
    add('answer_not_in_choices', 'P1', `正解「${q.correctAnswer}」が選択肢にない`);
  }
  if (new Set(q.choices).size !== q.choices.length) {
    add('duplicate_choice', 'P1', '選択肢に重複があり正解が一意でない');
  }

  if (q.phase === 'assess') {
    // 答えそのもの、または答えの核となる語が教示テキストに出ていないか
    const tokens = [q.correctAnswer, ...meaningTokens(q.correctAnswer)];
    for (const t of q.teachTexts) {
      const hit = tokens.find(tok => tok.length >= 1 && contains(t, tok));
      if (hit) { add('answer_in_teach_text', 'P1', `教示テキストに答え「${hit}」が出ている: ${t.slice(0, 40)}`); break; }
    }
    for (const t of q.promptTexts) {
      // 問題文に答えが丸ごと入っている（短い答えは偶然一致しやすいので2文字以上に限定）
      if (normalize(q.correctAnswer).length >= 2 && contains(t, q.correctAnswer)) {
        add('answer_in_prompt', 'P1', `問題文に答えが含まれる: ${t.slice(0, 40)}`); break;
      }
    }
    for (const t of q.mediaTexts ?? []) {
      const hit = tokens.find(tok => normalize(tok).length >= 2 && contains(t, tok));
      if (hit) { add('answer_in_media_text', 'P1', `alt/aria等に答え「${hit}」が出ている`); break; }
    }
  }

  // 形式的な当てやすさ（フェーズによらずP2）
  const lens = q.choices.map(c => c.length).sort((a, b) => b - a);
  if (q.choices.length > 1 && q.correctAnswer.length === lens[0] && lens[0] >= lens[1] * 2) {
    add('length_outlier', 'P2', '正解だけ極端に長く、内容を読まずに当てられる');
  }
  const endsWithPeriod = (s: string) => /[。.]$/.test(s.trim());
  const others = q.choices.filter(c => c !== q.correctAnswer);
  if (others.length >= 2 && others.every(c => endsWithPeriod(c) !== endsWithPeriod(q.correctAnswer))) {
    add('style_outlier', 'P2', '正解だけ文体（句点の有無）が他と異なる');
  }
  return out;
};

/** 既存FoundationQuestionを、教示テキストなしのassess提示として検査する（データ側の健全性） */
export const auditFoundationQuestion = (q: FoundationQuestion, teachTexts: string[] = []): LeakageFinding[] => {
  if (!q.choices || q.answerIndex === undefined) return []; // choice系以外は本監査の対象外
  return auditPresentedQuestion({
    questionId: q.id,
    phase: 'assess',
    teachTexts: [...teachTexts, q.hintJa ?? '', q.hintZh ?? ''].filter(Boolean),
    promptTexts: [q.promptJa, q.promptZh],
    choices: q.choices,
    correctAnswer: q.choices[q.answerIndex],
  });
};
