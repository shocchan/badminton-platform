// 帰化面接の表現特訓（純関数層）。
//
// 目的（CEO決定 2026-08-07）:
//   **模擬面接はアプリでやらない**（CEOの授業で行う）。
//   アプリが担うのは「面接で聞かれそうなことを、自分の言葉の日本語で言える」ようにする特訓。
//
// 特訓の型（1問あたり）:
//   質問を読む → まず自分で考える → 何を確認される質問かを知る →
//   答え方のポイント → 自分の答えを書く → **声に出して言う練習**（回数を記録）
//
// 誠実さの原則:
// - 進捗は「自分の答えを書いた数」「声に出して練習した回数」**だけ**を数える。
//   できた/できないをAIが判定しない（判定材料が無いのに判定しない・原則13）
// - 回答例の丸暗記をさせない（本人の事実と違う答えは面接で崩れる）。
//   だから「自分の答え」を書くまで練習チェックを押せる状態にしない
import type { AdventureV2Profile } from '../advTypes';
import {
  INTERVIEW_QUESTIONS, WORKSHEET_PROMPTS, CATEGORY_ORDER,
  questionsByCategory, type InterviewCategory,
} from './kikaInterviewBank';

/** 1問ぶんの学習者の記録 */
export interface InterviewNote {
  /** 自分の答え（本人の事実で書く。空=未記入） */
  myAnswer: string;
  /** 声に出して言う練習をした回数 */
  spokenCount: number;
  lastPracticedAt: string | null;
  /** 「私には当てはまらない」（離婚歴なし等）。conditional質問だけ立てられる */
  notApplicable: boolean;
}

/** 自分ノート（自己分析）の1項目 */
export interface WorksheetNote {
  /** 本音の答え（整理用・そのままは話さない） */
  honne: string;
  /** 面接で伝える言い方（本音を面接にふさわしい日本語へ直したもの） */
  omote: string;
}

export interface InterviewPrepState {
  /** 発行日時。null=未発行（画面に出さない） */
  enabledAt: string | null;
  notes: Record<string, InterviewNote>;
  worksheet: Record<string, WorksheetNote>;
}

export const emptyInterviewPrep = (): InterviewPrepState => ({
  enabledAt: null, notes: {}, worksheet: {},
});

/**
 * 特訓を出してよい learner か。
 * **発行された人だけ**（帰化面接はコース契約に紐づく個別対応。全員に出さない）。
 */
export const interviewPrepVisible = (prof: AdventureV2Profile): boolean =>
  prof.interviewPrep.enabledAt !== null;

export const noteFor = (state: InterviewPrepState, questionId: string): InterviewNote =>
  state.notes[questionId] ?? { myAnswer: '', spokenCount: 0, lastPracticedAt: null, notApplicable: false };

export const worksheetFor = (state: InterviewPrepState, promptId: string): WorksheetNote =>
  state.worksheet[promptId] ?? { honne: '', omote: '' };

/* ── 更新（イミュータブル） ── */

export const withMyAnswer = (
  state: InterviewPrepState, questionId: string, myAnswer: string,
): InterviewPrepState => ({
  ...state,
  notes: { ...state.notes, [questionId]: { ...noteFor(state, questionId), myAnswer: myAnswer.slice(0, 2000) } },
});

/**
 * 声に出して練習した記録。
 * **自分の答えが空のままでは記録できない**（回答例の丸暗記で練習した気にさせない）。
 */
export const withSpokenPractice = (
  state: InterviewPrepState, questionId: string, nowISO: string,
): InterviewPrepState => {
  const note = noteFor(state, questionId);
  if (note.myAnswer.trim().length === 0) return state;
  return {
    ...state,
    notes: {
      ...state.notes,
      [questionId]: { ...note, spokenCount: note.spokenCount + 1, lastPracticedAt: nowISO },
    },
  };
};

/** 「私には当てはまらない」。conditional な質問だけ */
export const withNotApplicable = (
  state: InterviewPrepState, questionId: string, value: boolean,
): InterviewPrepState => {
  const q = INTERVIEW_QUESTIONS.find((x) => x.id === questionId);
  if (!q?.conditional) return state;
  return {
    ...state,
    notes: { ...state.notes, [questionId]: { ...noteFor(state, questionId), notApplicable: value } },
  };
};

export const withWorksheet = (
  state: InterviewPrepState, promptId: string, patch: Partial<WorksheetNote>,
): InterviewPrepState => {
  const cur = worksheetFor(state, promptId);
  return {
    ...state,
    worksheet: {
      ...state.worksheet,
      [promptId]: {
        honne: (patch.honne ?? cur.honne).slice(0, 2000),
        omote: (patch.omote ?? cur.omote).slice(0, 2000),
      },
    },
  };
};

/* ── 進捗（実測だけを数える） ── */

export interface CategoryProgress {
  category: InterviewCategory;
  /** notApplicable を除いた対象問題数 */
  total: number;
  answered: number;
  spoken: number;
}

export const categoryProgress = (state: InterviewPrepState): CategoryProgress[] =>
  CATEGORY_ORDER.map((category) => {
    const qs = questionsByCategory(category)
      .filter((q) => !noteFor(state, q.id).notApplicable);
    return {
      category,
      total: qs.length,
      answered: qs.filter((q) => noteFor(state, q.id).myAnswer.trim().length > 0).length,
      spoken: qs.filter((q) => noteFor(state, q.id).spokenCount > 0).length,
    };
  });

export interface InterviewOverview {
  totalQuestions: number;
  answered: number;
  spoken: number;
  worksheetDone: number;
  worksheetTotal: number;
}

export const interviewOverview = (state: InterviewPrepState): InterviewOverview => {
  const cats = categoryProgress(state);
  return {
    totalQuestions: cats.reduce((n, c) => n + c.total, 0),
    answered: cats.reduce((n, c) => n + c.answered, 0),
    spoken: cats.reduce((n, c) => n + c.spoken, 0),
    // ノートは「伝える言い方」まで書けて1項目完了（本音だけでは面接で使えない）
    worksheetDone: WORKSHEET_PROMPTS.filter((p) => worksheetFor(state, p.id).omote.trim().length > 0).length,
    worksheetTotal: WORKSHEET_PROMPTS.length,
  };
};

/* ── 壊れたデータの復元（jsonb） ── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export const restoreInterviewPrep = (v: unknown): InterviewPrepState => {
  if (!isRecord(v)) return emptyInterviewPrep();
  const notes: Record<string, InterviewNote> = {};
  if (isRecord(v.notes)) {
    for (const [k, raw] of Object.entries(v.notes)) {
      if (!isRecord(raw)) continue;
      notes[k] = {
        myAnswer: str(raw.myAnswer, 2000),
        spokenCount: typeof raw.spokenCount === 'number' && Number.isInteger(raw.spokenCount) && raw.spokenCount >= 0
          ? Math.min(raw.spokenCount, 9999) : 0,
        lastPracticedAt: typeof raw.lastPracticedAt === 'string' ? raw.lastPracticedAt : null,
        notApplicable: raw.notApplicable === true,
      };
    }
  }
  const worksheet: Record<string, WorksheetNote> = {};
  if (isRecord(v.worksheet)) {
    for (const [k, raw] of Object.entries(v.worksheet)) {
      if (!isRecord(raw)) continue;
      worksheet[k] = { honne: str(raw.honne, 2000), omote: str(raw.omote, 2000) };
    }
  }
  return {
    enabledAt: typeof v.enabledAt === 'string' ? v.enabledAt : null,
    notes, worksheet,
  };
};
