// AI先生が持つ「あなたの記憶」（2026-09-07）。
//
// なぜ要るか:
//   会話のシステムプロンプトに入るのは、今日のテーマ・目標表現・レベルだけだった。
//   前回なにを話したか、いつも何を間違えるか、仕事は何か——生徒が「相棒」に期待するものが
//   毎回まっさらに戻る。しかも ai-lesson-chat は understoodSummary（生徒の状況の理解メモ）を
//   **毎ターン生成して、どこにも保存していなかった**＝作って捨てているぶんだけ払っていた。
//
// なぜ新しく保存しないか:
//   材料はすでに全部 ai_learning_sessions.report にある（実際に話した内容から作られた記録）。
//   新しい保存先を足すと migration と復元と保護リストの面倒が増えるうえ、
//   **保存し直す過程で必ず情報が劣化する**。ここは読むだけの純関数にして、
//   会話を始めるたびに実データから組み立てる。
//
// 守ること（原則13: 数字を作らない・無いものを有るふりをしない）:
//   - レポートに実在する文だけを使う。要約し直したり、言い換えたりしない
//   - 「いつも◯◯を間違える」と断定しない。2回以上出たものだけ「くり返し出ている」と書く
//   - 空なら空で返す。埋めるために当たり障りのない一般論を足さない
import type { CourseSessionRecord } from '../types';

/** プロンプトへ入れる行数の上限（増やすほど毎ターンの入力が太る） */
export const MEMO_MAX_LINES = 5;
/** 1行の長さの上限 */
export const MEMO_MAX_CHARS = 90;
/** 何日前までのセッションを材料にするか */
export const MEMO_LOOKBACK_DAYS = 30;
/** 「くり返し出ている」と書いてよい最低回数 */
export const MEMO_REPEAT_MIN = 2;

const DAY_MS = 86400000;

const trim = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MEMO_MAX_CHARS ? `${t.slice(0, MEMO_MAX_CHARS - 1)}…` : t;
};

/** 直近から順に、レポートのあるセッションだけを取る */
const recentReported = (sessions: CourseSessionRecord[], nowMs: number): CourseSessionRecord[] =>
  sessions
    .filter((s) => s.report && s.startedAt)
    .filter((s) => {
      const t = Date.parse(s.startedAt);
      return Number.isFinite(t) && nowMs - t <= MEMO_LOOKBACK_DAYS * DAY_MS;
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

/**
 * 直された言い方のうち、**別のセッションで2回以上**出たもの。
 * 同じセッション内の重複は数えない（1回の会話で2回言っただけを「くり返し」にしない）。
 */
const repeatedCorrections = (list: CourseSessionRecord[]): string[] => {
  const seen = new Map<string, { sessions: Set<string>; improved: string }>();
  for (const s of list) {
    for (const c of s.report?.corrections ?? []) {
      const key = c.improved.trim();
      if (!key) continue;
      const e = seen.get(key) ?? { sessions: new Set<string>(), improved: key };
      e.sessions.add(s.id);
      seen.set(key, e);
    }
  }
  return [...seen.values()]
    .filter((e) => e.sessions.size >= MEMO_REPEAT_MIN)
    .map((e) => e.improved);
};

/**
 * 会話のシステムプロンプトへ渡す「この人のこと」。
 * 行の形は日本語の短文。**渡すのは事実だけ**で、指示（こう教えろ）は入れない。
 * 指示は Edge Function 側のルールが持つ（役割を混ぜると片方が古くなる）。
 */
export const buildLearnerNotes = (
  sessions: CourseSessionRecord[], nowISO: string,
): string[] => {
  const nowMs = Date.parse(nowISO);
  if (!Number.isFinite(nowMs)) return [];
  const list = recentReported(sessions, nowMs);
  if (list.length === 0) return [];

  const out: string[] = [];
  const last = list[0];

  // ① 前回なにを話したか（レポートの要約そのまま。作り直さない）
  const summary = last.report?.todaySummaryJa?.trim();
  if (summary) out.push(trim(`前回の会話: ${summary}`));

  // ② 前回できたこと（褒め直しではなく、同じ話題を広げるための手がかり）
  const did = (last.report?.achievements ?? []).map((a) => a.trim()).filter(Boolean)[0];
  if (did) out.push(trim(`前回できたこと: ${did}`));

  // ③ くり返し出ている直し（2回以上。1回だけのものを「いつも」にしない）
  const repeated = repeatedCorrections(list).slice(0, 2);
  for (const r of repeated) out.push(trim(`くり返し出ている直し: ${r}`));

  // ④ 直前の直し（くり返しに入っていないもの）
  const lastFix = (last.report?.corrections ?? [])
    .map((c) => c.improved.trim())
    .find((v) => v && !repeated.includes(v));
  if (lastFix) out.push(trim(`前回直した言い方: ${lastFix}`));

  return out.slice(0, MEMO_MAX_LINES);
};
