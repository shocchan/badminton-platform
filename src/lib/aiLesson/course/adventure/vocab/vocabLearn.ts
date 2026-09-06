// 新しいことばを覚える（2026-09-06 CEO要望「Duolingoのように学びやすい単語学習」）。
//
// これまで語彙は**バトルの出題としてしか**現れず、「まだ知らない語をこれから覚える」
// 入口が基礎の140語（ことば図鑑）にしかなかった。N3以上の学習者には
// 「知らない語がいきなり問題として出る」体験しか無い。ここを作る。
//
// 学習の形（1回3〜4分・5語）:
//   ① 出会う   … 語・読み・意味・例文を1枚ずつ見る（答えを当てさせない）
//   ② たしかめる … 語ごとに2問。**間違えたらその場で説明を出し、あとでもう一度出す**
//   ③ まとめ   … 覚えた語と、図鑑に増えた数を見せる
//
// 記録の方針:
// - 出会い・正誤は既存の攻略台帳（mastery）へ1回の試行として書く。
//   単語図鑑（vocabDex）はそこから読むので、**学習した語はそのまま図鑑に載る**
// - 間違えて出し直した回は「出会い」を二重に数えない（questionKeys は重複なし）
// - 最初の解答で間違えた語だけを wrongKeys に入れる（やり直して当てたから正解、にしない）
import type { AdvMasteryAttempt } from '../advTypes';

/** 学習セッションで扱う1語 */
export interface LearnWord {
  id: string;
  surface: string;
  reading: string;
  level: string;
  glossZh: string;
  exampleJa: string;
  exampleZh: string;
  explanationJa: string;
  explanationZh: string;
  collocationsJa: string[];
}

/** 確認の1問（既存の語彙問題から作る） */
export interface LearnQuestion {
  key: string;
  wordId: string;
  /** 出題の観点（vocab-meaning など） */
  type: string;
  promptJa: string | null;
  promptZh: string;
  targetJapanese: string | null;
  choices: { choiceId: string; textJa: string; isCorrect: boolean }[];
  explanationZh: string;
}

export interface LearnSession {
  words: LearnWord[];
  questions: LearnQuestion[];
}

/** 画面の進行状態。1問ずつ進み、間違えた問題は最後にもう一度回ってくる */
export interface LearnRuntime {
  phase: 'teach' | 'quiz' | 'done';
  /** teach で何枚目か */
  teachIndex: number;
  /** これから出す問題のキュー（先頭から出す） */
  queue: string[];
  /** 最初の解答で間違えた問題キー */
  firstWrong: string[];
  /** 出題した問題キー（重複なし） */
  served: string[];
  /** 正解した問題キー（重複なし） */
  correct: string[];
}

export const startLearnRuntime = (session: LearnSession): LearnRuntime => ({
  phase: session.words.length > 0 ? 'teach' : 'done',
  teachIndex: 0,
  queue: session.questions.map((q) => q.key),
  firstWrong: [],
  served: [],
  correct: [],
});

/** 「次へ」で1枚進む。最後の1枚のあとは確認へ */
export const advanceTeach = (rt: LearnRuntime, total: number): LearnRuntime => (
  rt.teachIndex + 1 >= total
    ? { ...rt, phase: rt.queue.length > 0 ? 'quiz' : 'done', teachIndex: total }
    : { ...rt, teachIndex: rt.teachIndex + 1 }
);

/**
 * 1問に答える。
 * - 正解: キューから外す
 * - 不正解: キューの**最後**へ戻す（同じセッション内でもう一度出会う＝Duolingoの形）
 *   ただし同じ問題を無限に繰り返さないよう、戻すのは1回だけ
 */
export const answerLearn = (rt: LearnRuntime, key: string, correct: boolean): LearnRuntime => {
  const rest = rt.queue.filter((k, i) => !(i === 0 && k === key));
  const served = rt.served.includes(key) ? rt.served : [...rt.served, key];
  if (correct) {
    const next = { ...rt, queue: rest, served, correct: rt.correct.includes(key) ? rt.correct : [...rt.correct, key] };
    return { ...next, phase: next.queue.length === 0 ? 'done' : 'quiz' };
  }
  const alreadyMissed = rt.firstWrong.includes(key);
  const queue = alreadyMissed ? rest : [...rest, key];
  const firstWrong = alreadyMissed ? rt.firstWrong : [...rt.firstWrong, key];
  return { ...rt, queue, served, firstWrong, phase: queue.length === 0 ? 'done' : 'quiz' };
};

/** 覚えた語（その語の問題を全部、最初の解答で正解した語） */
export const learnedWordIds = (session: LearnSession, rt: LearnRuntime): string[] => {
  const byWord = new Map<string, string[]>();
  for (const q of session.questions) {
    byWord.set(q.wordId, [...(byWord.get(q.wordId) ?? []), q.key]);
  }
  const out: string[] = [];
  for (const [wordId, keys] of byWord) {
    if (keys.every((k) => rt.correct.includes(k) && !rt.firstWrong.includes(k))) out.push(wordId);
  }
  return out;
};

/** 台帳へ書く1回ぶんの記録を作る。図鑑はこれを読んで段階を上げる */
export const toLearnAttempt = (
  session: LearnSession, rt: LearnRuntime, dateKey: string, nowISO: string,
): AdvMasteryAttempt => {
  const total = session.questions.length;
  const wrong = rt.firstWrong;
  const scorePct = total === 0 ? 0 : Math.round(((total - wrong.length) / total) * 100);
  return {
    dateKey,
    scorePct,
    // 新しい語を覚える回なので、未出の割合は常に高い。実測値を入れる
    unseenRatio: total === 0 ? 0 : 1,
    questionKeys: rt.served,
    tier: 'normal',
    timed: false,
    completedAt: nowISO,
    skills: ['charactersVocabulary'],
    bySkill: {
      charactersVocabulary: { correct: total - wrong.length, total, unseen: total },
    },
    wrongKeys: wrong,
  };
};

/** 学習の記録を入れる台帳のキー。ルートのstageではないので攻略判定には使われない */
export const VOCAB_LEARN_TARGET_ID = 'vocab-learn';
