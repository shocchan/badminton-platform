// 会話で直された言い方を、あとでもう一度出す（2026-09-07）。
//
// なぜ要るか:
//   この教室の看板は「第1・3・7・30天复习」。ところが実際に復習へ乗っていたのは
//   **選択問題の誤答だけ**（错题本は mastery 台帳の試行から作られる）。
//   AIレポートの corrections——つまり**自分が話して直された言い方**——は、その日の
//   言い直しカードと復習ノートに出て、そこで終わっていた。翌日以降は二度と出てこない。
//   会話を売っている商品として、いちばんもったいない穴だった。
//
// なぜ台帳へ書き写さないか:
//   直しの本体は ai_learning_sessions.report に実在する（実際の発話から作られた記録）。
//   同じ文をプロフィールへコピーすると二重管理になり、必ず片方が古くなる。
//   ここは**セッションから毎回導出**し、保存するのは「いつ言い直したか」の記録だけにする。
//
// 間隔:
//   会話の直しは選択問題より忘れやすい（自分の口で1回言っただけ）ので、
//   1日後・3日後・7日後の3回で止める。30日後まで引っぱらない＝
//   「まだ終わらないのか」という重さを作らない。
import type { CourseSessionRecord } from '../types';
import type { AdvRestateLogEntry } from './advTypes';

/** 何日後に出すか。この配列の長さ＝1件あたりの最大出題回数 */
export const RESTATE_INTERVALS = [1, 3, 7] as const;
/** 1日に出す上限（毎日の負担を一定にする） */
export const RESTATE_DAILY_MAX = 2;
/** 記録の保持件数（jsonbを太らせない） */
export const RESTATE_LOG_KEEP = 120;

const DAY_MS = 86400000;

const isDayKey = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** セッションの開始日（ローカル日付キー）。壊れていれば null */
const sessionDayKey = (s: CourseSessionRecord): string | null => {
  const d = new Date(s.startedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE');
};

export interface RestateItem {
  /** 記録の照合キー。セッションと直しの位置で決まる（本文を含めない＝長くならない） */
  key: string;
  /** 生徒が実際に言った文 */
  original: string;
  /** 自然にした言い方 */
  improved: string;
  /** なぜそう直すのか（中国語1文） */
  noteZh: string;
  /** 直された日 */
  fromDay: string;
  /** その日から何日たったか */
  daysSince: number;
  /** これで何回目の出題か（1〜3） */
  round: number;
}

export const restoreRestateLog = (raw: unknown): AdvRestateLogEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is AdvRestateLogEntry =>
      !!e && typeof e === 'object'
      && typeof (e as AdvRestateLogEntry).key === 'string'
      && isDayKey((e as AdvRestateLogEntry).dateKey))
    .map((e) => ({ key: e.key, dateKey: e.dateKey, said: e.said === true }))
    .slice(-RESTATE_LOG_KEEP);
};

/**
 * 今日出す言い直し。
 *
 * - 直された日から 1/3/7 日**以上**たっていて、その回をまだ出していないものを出す
 *   （毎日開かない人でも取りこぼさない。「ちょうどその日」に限定すると、
 *    3日空けた人は永久に受け取れない）
 * - 3回ぶん終わったものは出さない
 * - 同じ言い方（improved が同じ）は1つだけ出す＝同じ文が2枚並ばない
 */
export const dueRestates = (
  sessions: CourseSessionRecord[], log: AdvRestateLogEntry[], todayKey: string,
): RestateItem[] => {
  if (!isDayKey(todayKey)) return [];
  const shownDays = new Map<string, string[]>();
  for (const e of log) {
    const arr = shownDays.get(e.key) ?? [];
    arr.push(e.dateKey);
    shownDays.set(e.key, arr);
  }

  const out: RestateItem[] = [];
  const seenImproved = new Set<string>();
  for (const s of sessions) {
    const fromDay = sessionDayKey(s);
    if (!fromDay) continue;
    const corrections = s.report?.corrections ?? [];
    corrections.forEach((c, i) => {
      const original = c.original?.trim() ?? '';
      const improved = c.improved?.trim() ?? '';
      if (!original || !improved) return;
      if (seenImproved.has(improved)) return;
      const key = `${s.id}:${i}`;
      const shown = shownDays.get(key) ?? [];
      const round = shown.length + 1;                     // 次に出すのは何回目か
      if (round > RESTATE_INTERVALS.length) return;       // 3回ぶん終わった
      const days = dayDiff(fromDay, todayKey);
      if (!Number.isFinite(days) || days < RESTATE_INTERVALS[round - 1]) return;
      if (shown.includes(todayKey)) return;               // 今日もう出した
      seenImproved.add(improved);
      out.push({
        key, original, improved, noteZh: c.noteZh ?? '', fromDay, daysSince: days, round,
      });
    });
  }
  // 直された日が古いものから（忘れかけている順）
  out.sort((a, b) => (a.fromDay < b.fromDay ? -1 : a.fromDay > b.fromDay ? 1 : 0));
  return out.slice(0, RESTATE_DAILY_MAX);
};

/**
 * 出した／言えたの記録を足す。同じ日の同じ件は上書きする（二重に積まない）。
 * `said` は**自己申告**であって、実際に言えたかを機械で確かめたものではない。
 * 画面でも「自分でチェックした記録」と分かる書き方にすること。
 */
export const markRestate = (
  log: AdvRestateLogEntry[], key: string, todayKey: string, said: boolean,
): AdvRestateLogEntry[] => {
  if (!isDayKey(todayKey)) return log;
  const rest = log.filter((e) => !(e.key === key && e.dateKey === todayKey));
  return [...rest, { key, dateKey: todayKey, said }].slice(-RESTATE_LOG_KEEP);
};

/** 「言えた」と自分でチェックした件数（画面の数字はここからしか作らない） */
export const restateSaidCount = (log: AdvRestateLogEntry[]): number =>
  log.filter((e) => e.said).length;
