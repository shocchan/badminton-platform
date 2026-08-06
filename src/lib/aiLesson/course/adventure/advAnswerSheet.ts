// 答案用紙（マークシート）。**問題文はアプリに置かない。**
//
// 運用（CEO決定 2026-08-02）:
//   問題そのものは先生がWeChatで個別に画像を送る。学習者は紙（または画面の画像）を見ながら解き、
//   **答案だけをアプリに記入する**。アプリは時間を測り、記録し、あとで見返せるようにする。
//
// なぜこの形なのか:
//   ① 市販の過去問題集をサーバーに置いて配信すると複製権・公衆送信権の侵害になる。
//      アプリに問題を持たなければ、その問題自体が起きない
//   ② 紙を見ながら時間を測って解くのは**本番のJLPTそのもの**の体験。
//      画面で解くより本番に近い
//   ③ アプリ側は「解き方と伸ばし方」を担う。教材を配る人ではなく、設計する人になる
//
// 設計上の約束:
// - 正解が登録されていなければ **採点しない**。0点と表示しない（原則13「未判定を0%にしない」）
// - 残り時間は**壁時計から計算する**。アプリを閉じても時間は進む（試験なので正しい）
// - 中断して戻っても、同じ問題・同じ残り時間から続けられる
import type { AdventureV2Profile } from './advTypes';

/** JLPTの選択肢は基本4つ。将来3択が来ても壊れないよう設定で持つ */
export const DEFAULT_CHOICE_COUNT = 4;
export const MAX_CHOICE_COUNT = 6;
export const MAX_QUESTIONS_PER_SECTION = 120;

export interface AnswerSheetSection {
  id: string;
  labelJa: string;
  labelZh: string;
  /** 問題数 */
  questionCount: number;
  /** 選択肢の数 */
  choiceCount: number;
  /** 制限時間（分） */
  minutes: number;
  /**
   * 正解（1始まり）。**先生が入れたときだけ自己採点する。**
   * 未登録なら記録だけして「先生が確認します」と出す
   */
  correctChoices?: number[];
}

/** 1回分の答案用紙。先生が learner ごとに用意する */
export interface AnswerSheetPaper {
  paperId: string;
  titleJa: string;
  titleZh: string;
  level: 'N2' | 'N3';
  /** 先生からの一言（例「WeChatで送った画像の3ページ目まで」）。無ければ出さない */
  noteJa?: string;
  noteZh?: string;
  sections: AnswerSheetSection[];
  /** 用意した日（表示順に使う） */
  issuedAtISO: string;
}

/** 進行中の答案。中断復帰のため settings へ直列化する */
export interface AnswerSheetSession {
  paperId: string;
  /** いま解いている科目のindex */
  sectionIndex: number;
  startedAtISO: string;
  /** 現在の科目を始めた時刻。残り時間はここから計算する */
  sectionStartedAtISO: string;
  /** sectionId → 各問の解答（1始まり・未回答は null） */
  answers: Record<string, (number | null)[]>;
}

export interface AnswerSheetSectionResult {
  id: string;
  labelJa: string;
  labelZh: string;
  answered: number;
  total: number;
  /** 正解が未登録なら null（＝採点していない） */
  correct: number | null;
  elapsedSeconds: number;
}

export interface AnswerSheetResult {
  paperId: string;
  titleJa: string;
  titleZh: string;
  submittedAtISO: string;
  sections: AnswerSheetSectionResult[];
  answeredTotal: number;
  questionTotal: number;
  /** 全科目に正解が登録されているときだけ出す。1つでも欠けたら null */
  scorePct: number | null;
}

/* ────────────────────────────────────────────────────────────
   可視性
   ──────────────────────────────────────────────────────────── */

/**
 * 答案用紙の機能を出してよい learner か。
 *
 * **N2の試験を受ける人だけ**（CEO指示 2026-08-02）。
 * 会話目的の人や、そもそも試験を受けない人の画面に試験場を出さない。
 */
export const answerSheetsVisible = (prof: AdventureV2Profile): boolean =>
  prof.goalType !== 'conversation' && prof.targetJlpt === 'N2';

/** その learner に届いている答案用紙（新しい順） */
export const availablePapers = (prof: AdventureV2Profile): AnswerSheetPaper[] => {
  if (!answerSheetsVisible(prof)) return [];
  return [...(prof.answerSheets ?? [])].sort((a, b) => b.issuedAtISO.localeCompare(a.issuedAtISO));
};

export const paperById = (prof: AdventureV2Profile, paperId: string): AnswerSheetPaper | null =>
  availablePapers(prof).find((p) => p.paperId === paperId) ?? null;

/* ────────────────────────────────────────────────────────────
   進行
   ──────────────────────────────────────────────────────────── */

export const startSession = (paper: AnswerSheetPaper, nowISO: string): AnswerSheetSession => ({
  paperId: paper.paperId,
  sectionIndex: 0,
  startedAtISO: nowISO,
  sectionStartedAtISO: nowISO,
  answers: Object.fromEntries(
    paper.sections.map((s) => [s.id, Array.from({ length: s.questionCount }, () => null)]),
  ),
});

/**
 * 解答を1つ記入する。**同じ番号をもう一度押したら取り消す**（マークシートの消しゴム）。
 * 範囲外の値は無視する（壊れた入力で配列を壊さない）。
 */
export const setAnswer = (
  session: AnswerSheetSession,
  section: AnswerSheetSection,
  questionIndex: number,
  choice: number,
): AnswerSheetSession => {
  if (questionIndex < 0 || questionIndex >= section.questionCount) return session;
  if (choice < 1 || choice > section.choiceCount) return session;
  const current = session.answers[section.id] ?? [];
  const next = [...current];
  next[questionIndex] = current[questionIndex] === choice ? null : choice;
  return { ...session, answers: { ...session.answers, [section.id]: next } };
};

/** 残り秒数。壁時計から計算するので、アプリを閉じていた時間も減る（試験なので正しい） */
export const remainingSeconds = (
  section: AnswerSheetSection,
  session: AnswerSheetSession,
  nowISO: string,
): number => {
  const started = new Date(session.sectionStartedAtISO).getTime();
  const now = new Date(nowISO).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(now)) return section.minutes * 60;
  // now が開始時刻より僅かに古い（開始直後の描画）と経過が-1秒になり、
  // 「105:01」のように制限時間より多く表示されてしまう。経過は0未満にしない
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));
  return Math.max(0, section.minutes * 60 - elapsed);
};

export const isTimeUp = (
  section: AnswerSheetSection, session: AnswerSheetSession, nowISO: string,
): boolean => remainingSeconds(section, session, nowISO) === 0;

/** 未回答の問題番号（1始まり）。提出前の確認に使う */
export const unansweredNumbers = (
  session: AnswerSheetSession, section: AnswerSheetSection,
): number[] => {
  const a = session.answers[section.id] ?? [];
  const out: number[] = [];
  for (let i = 0; i < section.questionCount; i += 1) if (a[i] == null) out.push(i + 1);
  return out;
};

/** 次の科目へ。最後の科目なら null（＝提出へ） */
export const advanceSection = (
  paper: AnswerSheetPaper, session: AnswerSheetSession, nowISO: string,
): AnswerSheetSession | null => {
  const next = session.sectionIndex + 1;
  if (next >= paper.sections.length) return null;
  return { ...session, sectionIndex: next, sectionStartedAtISO: nowISO };
};

/* ────────────────────────────────────────────────────────────
   集計
   ──────────────────────────────────────────────────────────── */

/** 正解が「全問ぶん」登録されている科目だけ採点できる。中途半端な採点はしない */
const gradable = (s: AnswerSheetSection): boolean =>
  Array.isArray(s.correctChoices) && s.correctChoices.length === s.questionCount;

export const grade = (
  paper: AnswerSheetPaper, session: AnswerSheetSession, nowISO: string,
): AnswerSheetResult => {
  const startedMs = new Date(session.startedAtISO).getTime();
  const nowMs = new Date(nowISO).getTime();
  const totalElapsed = Number.isFinite(startedMs) && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor((nowMs - startedMs) / 1000)) : 0;

  const sections: AnswerSheetSectionResult[] = paper.sections.map((s, i) => {
    const a = session.answers[s.id] ?? [];
    const answered = a.filter((v) => v != null).length;
    const correct = gradable(s)
      ? a.reduce((n: number, v, qi) => (v != null && v === s.correctChoices![qi] ? n + 1 : n), 0)
      : null;
    // 科目ごとの実測時間は持っていないので、制限時間を上限とした按分で出す。
    // 「測っていない値をそれらしく出さない」ため、最後の科目だけ実測の残りを充てる
    const cap = s.minutes * 60;
    const consumedBefore = paper.sections.slice(0, i).reduce((n, x) => n + x.minutes * 60, 0);
    const elapsedSeconds = Math.max(0, Math.min(cap, totalElapsed - consumedBefore));
    return {
      id: s.id, labelJa: s.labelJa, labelZh: s.labelZh,
      answered, total: s.questionCount, correct, elapsedSeconds,
    };
  });

  const questionTotal = paper.sections.reduce((n, s) => n + s.questionCount, 0);
  const answeredTotal = sections.reduce((n, s) => n + s.answered, 0);
  // **1科目でも正解未登録なら総合スコアを出さない**（部分的な点数を全体の点数に見せない）
  const allGradable = paper.sections.length > 0 && paper.sections.every(gradable);
  const correctTotal = sections.reduce((n, s) => n + (s.correct ?? 0), 0);
  const scorePct = allGradable && questionTotal > 0
    ? Math.round((correctTotal / questionTotal) * 100) : null;

  return {
    paperId: paper.paperId, titleJa: paper.titleJa, titleZh: paper.titleZh,
    submittedAtISO: nowISO, sections, answeredTotal, questionTotal, scorePct,
  };
};

/* ────────────────────────────────────────────────────────────
   壊れたデータの復元（jsonbなので何が入っているか分からない）
   ──────────────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

const restoreSection = (v: unknown): AnswerSheetSection | null => {
  if (!isRecord(v)) return null;
  const questionCount = intIn(v.questionCount, 1, MAX_QUESTIONS_PER_SECTION);
  const choiceCount = intIn(v.choiceCount, 2, MAX_CHOICE_COUNT);
  const minutes = intIn(v.minutes, 1, 300);
  if (typeof v.id !== 'string' || !v.id || questionCount === null || choiceCount === null || minutes === null) {
    return null;
  }
  const s: AnswerSheetSection = {
    id: v.id,
    labelJa: typeof v.labelJa === 'string' ? v.labelJa : v.id,
    labelZh: typeof v.labelZh === 'string' ? v.labelZh : v.id,
    questionCount, choiceCount, minutes,
  };
  // 正解は「全問ぶん・範囲内」がそろっているときだけ採用する。
  // 半端なものを入れると採点が嘘になる
  if (Array.isArray(v.correctChoices) && v.correctChoices.length === questionCount
    && v.correctChoices.every((c) => intIn(c, 1, choiceCount) !== null)) {
    s.correctChoices = v.correctChoices as number[];
  }
  return s;
};

export const restorePaper = (v: unknown): AnswerSheetPaper | null => {
  if (!isRecord(v)) return null;
  if (typeof v.paperId !== 'string' || !v.paperId) return null;
  if (v.level !== 'N2' && v.level !== 'N3') return null;
  const sections = Array.isArray(v.sections)
    ? v.sections.map(restoreSection).filter((s): s is AnswerSheetSection => s !== null) : [];
  if (sections.length === 0) return null;
  return {
    paperId: v.paperId,
    titleJa: typeof v.titleJa === 'string' ? v.titleJa : v.paperId,
    titleZh: typeof v.titleZh === 'string' ? v.titleZh : v.paperId,
    level: v.level,
    noteJa: typeof v.noteJa === 'string' ? v.noteJa : undefined,
    noteZh: typeof v.noteZh === 'string' ? v.noteZh : undefined,
    sections,
    issuedAtISO: typeof v.issuedAtISO === 'string' ? v.issuedAtISO : '1970-01-01T00:00:00.000Z',
  };
};

export const restorePapers = (v: unknown): AnswerSheetPaper[] =>
  (Array.isArray(v) ? v.map(restorePaper).filter((p): p is AnswerSheetPaper => p !== null) : []);

export const restoreSheetSession = (v: unknown): AnswerSheetSession | null => {
  if (!isRecord(v)) return null;
  if (typeof v.paperId !== 'string' || typeof v.startedAtISO !== 'string') return null;
  const idx = intIn(v.sectionIndex, 0, 50);
  if (idx === null) return null;
  const answers: Record<string, (number | null)[]> = {};
  if (isRecord(v.answers)) {
    for (const [k, arr] of Object.entries(v.answers)) {
      if (!Array.isArray(arr)) continue;
      answers[k] = arr.map((x) => intIn(x, 1, MAX_CHOICE_COUNT));
    }
  }
  return {
    paperId: v.paperId,
    sectionIndex: idx,
    startedAtISO: v.startedAtISO,
    sectionStartedAtISO: typeof v.sectionStartedAtISO === 'string' ? v.sectionStartedAtISO : v.startedAtISO,
    answers,
  };
};

export const restoreSheetLog = (v: unknown): AnswerSheetResult[] =>
  (Array.isArray(v)
    ? v.filter((e): e is AnswerSheetResult =>
      isRecord(e) && typeof e.paperId === 'string' && typeof e.submittedAtISO === 'string'
      && Array.isArray(e.sections))
    : []).slice(-50);

/** 時間の表示（mm:ss）。残り1分を切ったら赤くする判断は画面側 */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
