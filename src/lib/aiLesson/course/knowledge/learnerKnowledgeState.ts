/**
 * 学習者 × 知識項目の状態（2026-09-10 Phase 3 — Knowledge Graph × Learning OS）。
 *
 * 【何をするか】
 * 既存の記録（80%攻略台帳 AdvMasteryLedger・会話セッション・言い直し）を、
 * **知識項目ID（n3g-xxx / vc-41-001 / 読解・聴解の setId）ごと**に読み直し、
 *   「選択問題では分かる」（recognition）
 *   「自分で言える」        （production：言い直し・再挑戦）
 *   「会話で使えた」        （conversation：AI会話ミッション）
 * を**別々の習熟**として持つ。この三つを同じ mastery にしない。
 *
 * 【何をしないか】
 * 新しい mastery システムも review エンジンも作らない。
 *  - 台帳（AdvMasteryLedger）は読むだけ。1件も書き換えない。攻略判定（advMastery）はそのまま。
 *  - 復習は既存の错题本（advMistakeNotebook）へ**戻す**（reviewKeysForItems）。
 *  - ここに書き込むのは、台帳が持てない出来事だけ＝言い直しの成否・再挑戦の成否
 *    （profile.knowledgeLog。append-only・上限あり）。
 *
 * 【推薦（Next Best Action）】
 * 「昨日 n3g-xxx を選択問題で正解したが言い直しで失敗」→「今日は同じ文法の production を優先」
 * のように、learner state × knowledge graph から次の一手を並べる。推薦AIの完成ではなく、
 * **必要なデータ接続**（誰が・何を・どの経路で・できた／できない）を揃えるのが今回の範囲。
 */
import { parseKnowledgeId } from './knowledgeId';

export type KnowledgeChannel = 'recognition' | 'production' | 'conversation';
export type KnowledgeEventKind = 'answer' | 'retry' | 'restate' | 'conversation';

/** 1回の出来事。台帳・セッションから導出するものと、knowledgeLog に保存するものの両方がこの形 */
export interface KnowledgeEvent {
  at: string;
  /** JST日付キー YYYY-MM-DD */
  dateKey: string;
  itemId: string;
  channel: KnowledgeChannel;
  kind: KnowledgeEventKind;
  ok: boolean;
  /** どこから来たか（ledger:<targetId> / session:<id> / restate / retry …） */
  source: string;
  questionKey?: string;
}

export type ChannelStatus = 'untested' | 'failing' | 'shaky' | 'solid';

export interface ChannelState {
  attempts: number;
  correct: number;
  lastAt: string | null;
  lastOk: boolean | null;
  lastWrongDateKey: string | null;
  lastCorrectDateKey: string | null;
  /** 直近の連続正解数 */
  streak: number;
  status: ChannelStatus;
}

export interface KnowledgeItemState {
  itemId: string;
  kind: 'grammar' | 'vocab' | 'material' | 'other';
  recognition: ChannelState;
  production: ChannelState;
  conversation: ChannelState;
  lastActivityAt: string | null;
}

export type KnowledgeState = Record<string, KnowledgeItemState>;

const emptyChannel = (): ChannelState => ({
  attempts: 0, correct: 0, lastAt: null, lastOk: null,
  lastWrongDateKey: null, lastCorrectDateKey: null, streak: 0, status: 'untested',
});

const kindOf = (itemId: string): KnowledgeItemState['kind'] => {
  const k = parseKnowledgeId(itemId)?.kind;
  if (k === 'grammar') return 'grammar';
  if (k === 'vocab') return 'vocab';
  if (/^n[1-5][lr]-/.test(itemId)) return 'material';
  return 'other';
};

/* ────────────────────────────────────────────────────────────
   問題キー → 知識項目
   ──────────────────────────────────────────────────────────── */

/**
 * 台帳の問題キーから知識項目IDと経路を読む。
 *   rec:n3g-x / cloze:n3g-x:1 / meaning:n3g-x / form:n3g-x → 文法・recognition
 *   vocab:表記:読み:観点                                    → 語彙・recognition（wordId は索引で引く）
 *   listen:n1l-task-01 / read:n1r-short-01                   → 教材・recognition
 * 読めないキー（kanji: など）は null。**当てずっぽうで項目に繋がない。**
 */
export const questionKeyToItem = (
  key: string, vocabIdBySurfaceReading?: ReadonlyMap<string, string>,
): { itemId: string; channel: KnowledgeChannel } | null => {
  const parts = key.split(':');
  const head = parts[0];
  if (head === 'rec' || head === 'cloze' || head === 'meaning' || head === 'form') {
    const id = parts[1];
    return id && parseKnowledgeId(id)?.kind === 'grammar' ? { itemId: id, channel: 'recognition' } : null;
  }
  if (head === 'vocab') {
    const surface = parts[1]; const reading = parts[2];
    if (!surface || !reading) return null;
    const wordId = vocabIdBySurfaceReading?.get(`${surface}|${reading}`);
    return wordId ? { itemId: wordId, channel: 'recognition' } : null;
  }
  if (head === 'listen' || head === 'read') {
    const id = parts[1];
    return id ? { itemId: id, channel: 'recognition' } : null;
  }
  return null;
};

/* ────────────────────────────────────────────────────────────
   既存の記録 → 出来事
   ──────────────────────────────────────────────────────────── */

/** AdvMasteryAttempt のうち、ここで読む部分だけ */
export interface LedgerAttemptLike {
  dateKey: string;
  completedAt: string;
  questionKeys: string[];
  /** undefined＝旧データ（正誤不明）。その試行は出来事にしない（正解したと推定しない） */
  wrongKeys?: string[];
}

/**
 * 台帳 → recognition の出来事。
 * wrongKeys が無い旧試行は読まない（错题本と同じ扱い：正解と推定しない）。
 */
export const eventsFromLedger = (
  ledger: Readonly<Record<string, LedgerAttemptLike[] | undefined>>,
  vocabIdBySurfaceReading?: ReadonlyMap<string, string>,
): KnowledgeEvent[] => {
  const out: KnowledgeEvent[] = [];
  for (const [targetId, attempts] of Object.entries(ledger)) {
    for (const a of attempts ?? []) {
      if (!Array.isArray(a.wrongKeys)) continue;
      const wrong = new Set(a.wrongKeys);
      for (const q of a.questionKeys) {
        const hit = questionKeyToItem(q, vocabIdBySurfaceReading);
        if (!hit) continue;
        out.push({
          at: a.completedAt, dateKey: a.dateKey, itemId: hit.itemId, channel: hit.channel,
          kind: 'answer', ok: !wrong.has(q), source: `ledger:${targetId}`, questionKey: q,
        });
      }
    }
  }
  return out;
};

/** CourseSessionRecord のうち、ここで読む部分だけ */
export interface SessionLike {
  id: string;
  missionId: string;
  startedAt: string;
  completionStatus: string;
  targetUsedIndependently?: boolean;
  report?: { targetUsage?: 'self' | 'hint' | 'none' } | null;
}

/** セッションの missionId → 文法ID。advconv-／bizconv-（Phase 6 の practice 会話）と、会話コースの対応表 */
const grammarOfSessionMission = (missionId: string, missionGrammar?: ReadonlyMap<string, string>): string | null => {
  const adv = /^advconv-(.+)$/.exec(missionId);
  if (adv) return parseKnowledgeId(adv[1])?.kind === 'grammar' ? adv[1] : null;
  const biz = /^bizconv-.+:(.+)$/.exec(missionId);
  if (biz) return parseKnowledgeId(biz[1])?.kind === 'grammar' ? biz[1] : null;
  const mapped = missionGrammar?.get(missionId);
  return mapped && parseKnowledgeId(mapped)?.kind === 'grammar' ? mapped : null;
};

/**
 * AI会話の完了セッション → conversation の出来事。
 * advconv-<grammarId>（文法の practice）はそのまま、会話コースの w03m1… は対応表（Phase 6）で文法へ。
 */
export const eventsFromSessions = (
  sessions: readonly SessionLike[], dateKeyOf: (iso: string) => string,
  missionGrammar?: ReadonlyMap<string, string>,
): KnowledgeEvent[] => {
  const out: KnowledgeEvent[] = [];
  for (const s of sessions) {
    if (s.completionStatus !== 'completed') continue;
    const itemId = grammarOfSessionMission(s.missionId, missionGrammar);
    if (!itemId) continue;
    // 「自分で使えた」だけを成功にする。ヒント付きは成功に数えない（誇張しない）
    const ok = s.report?.targetUsage === 'self' || s.targetUsedIndependently === true;
    out.push({
      at: s.startedAt, dateKey: dateKeyOf(s.startedAt), itemId, channel: 'conversation',
      kind: 'conversation', ok, source: `session:${s.id}`,
    });
  }
  return out;
};

/* ────────────────────────────────────────────────────────────
   knowledgeLog（台帳が持てない出来事の記録）
   ──────────────────────────────────────────────────────────── */

export const KNOWLEDGE_LOG_KEEP = 400;

/** append-only。上限を超えたら古いものから落とす（jsonb を太らせない） */
export const appendKnowledgeEvent = (
  log: readonly KnowledgeEvent[] | undefined, ev: KnowledgeEvent, keep = KNOWLEDGE_LOG_KEEP,
): KnowledgeEvent[] => {
  const next = [...(log ?? []), ev];
  return next.length > keep ? next.slice(next.length - keep) : next;
};

const isKnowledgeEvent = (x: unknown): x is KnowledgeEvent => {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.at === 'string' && typeof r.dateKey === 'string' && typeof r.itemId === 'string'
    && (r.channel === 'recognition' || r.channel === 'production' || r.channel === 'conversation')
    && (r.kind === 'answer' || r.kind === 'retry' || r.kind === 'restate' || r.kind === 'conversation')
    && typeof r.ok === 'boolean' && typeof r.source === 'string';
};

/** 保存データから読み戻す。壊れた要素は落とす（画面に空の状態を出さない） */
export const restoreKnowledgeLog = (raw: unknown): KnowledgeEvent[] =>
  Array.isArray(raw) ? raw.filter(isKnowledgeEvent).slice(-KNOWLEDGE_LOG_KEEP) : [];

/* ────────────────────────────────────────────────────────────
   状態の導出
   ──────────────────────────────────────────────────────────── */

const statusOf = (c: ChannelState): ChannelStatus => {
  if (c.attempts === 0) return 'untested';
  if (c.lastOk === false) return 'failing';
  return c.streak >= 3 ? 'solid' : 'shaky';
};

export const deriveKnowledgeState = (events: readonly KnowledgeEvent[]): KnowledgeState => {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const state: KnowledgeState = {};
  for (const e of sorted) {
    const item = state[e.itemId] ?? (state[e.itemId] = {
      itemId: e.itemId, kind: kindOf(e.itemId),
      recognition: emptyChannel(), production: emptyChannel(), conversation: emptyChannel(),
      lastActivityAt: null,
    });
    const c = item[e.channel];
    c.attempts += 1;
    if (e.ok) { c.correct += 1; c.streak += 1; c.lastCorrectDateKey = e.dateKey; }
    else { c.streak = 0; c.lastWrongDateKey = e.dateKey; }
    c.lastAt = e.at; c.lastOk = e.ok;
    item.lastActivityAt = e.at;
  }
  for (const item of Object.values(state)) {
    item.recognition.status = statusOf(item.recognition);
    item.production.status = statusOf(item.production);
    item.conversation.status = statusOf(item.conversation);
  }
  return state;
};

/** 全部まとめて：台帳・セッション・knowledgeLog → 状態 */
export const buildKnowledgeState = (input: {
  ledger: Readonly<Record<string, LedgerAttemptLike[] | undefined>>;
  sessions?: readonly SessionLike[];
  knowledgeLog?: readonly KnowledgeEvent[];
  vocabIdBySurfaceReading?: ReadonlyMap<string, string>;
  /** 会話コースの missionId → grammarId（conversationKnowledge.buildMissionGrammarMap） */
  missionGrammar?: ReadonlyMap<string, string>;
  dateKeyOf: (iso: string) => string;
}): KnowledgeState => deriveKnowledgeState([
  ...eventsFromLedger(input.ledger, input.vocabIdBySurfaceReading),
  ...eventsFromSessions(input.sessions ?? [], input.dateKeyOf, input.missionGrammar),
  ...(input.knowledgeLog ?? []),
]);

/* ────────────────────────────────────────────────────────────
   復習への接続（既存の错题本へ戻す）
   ──────────────────────────────────────────────────────────── */

const DAY_MS = 86400000;
const daysBetween = (fromKey: string, toKey: string): number =>
  Math.round((Date.parse(toKey) - Date.parse(fromKey)) / DAY_MS);
const addDays = (key: string, n: number): string =>
  new Date(Date.parse(key) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * 「忘れかけ」の間隔。この教室の看板「第1・3・7・30天复习」と同じ。
 * 連続正解数が n なら、次に見るべきなのは最後の正解から INTERVALS[min(n,4)-1] 日後。
 */
export const FADE_INTERVALS_DAYS = [1, 3, 7, 30] as const;

const fadingOn = (c: ChannelState, dateKey: string): boolean => {
  if (c.status !== 'solid' && c.status !== 'shaky') return false;
  if (!c.lastCorrectDateKey) return false;
  const idx = Math.min(Math.max(c.streak, 1), FADE_INTERVALS_DAYS.length) - 1;
  return daysBetween(c.lastCorrectDateKey, dateKey) >= FADE_INTERVALS_DAYS[idx];
};

export interface DueKnowledge {
  /** 昨日、どこかの経路で間違えた項目 */
  wrongYesterday: string[];
  /** 正解はしているが、間隔が空いて忘れかけている項目（recognition 基準） */
  fading: string[];
}

export const dueKnowledgeItems = (state: KnowledgeState, dateKey: string): DueKnowledge => {
  const yesterday = addDays(dateKey, -1);
  const wrongYesterday: string[] = []; const fading: string[] = [];
  for (const it of Object.values(state)) {
    const channels = [it.recognition, it.production, it.conversation];
    if (channels.some((c) => c.lastWrongDateKey === yesterday)) wrongYesterday.push(it.itemId);
    else if (fadingOn(it.recognition, dateKey)) fading.push(it.itemId);
  }
  return { wrongYesterday, fading };
};

/**
 * 知識項目 → 既存の復習（错题本）の問題キー。
 * 新しい復習エンジンを作らず、**今の復習バトルにそのまま渡せる形**へ戻す。
 * 未克服（resolution !== 'overcome'）のものだけ。順序は itemIds の順（＝推薦順）。
 */
export const reviewKeysForItems = (
  notebookEntries: readonly { questionKey: string; targetId: string; resolution: string }[],
  itemIds: readonly string[],
  vocabIdBySurfaceReading?: ReadonlyMap<string, string>,
): string[] => {
  const byItem = new Map<string, string[]>();
  for (const e of notebookEntries) {
    if (e.resolution === 'overcome') continue;
    const hit = questionKeyToItem(e.questionKey, vocabIdBySurfaceReading);
    const id = hit?.itemId ?? e.targetId;
    const list = byItem.get(id) ?? [];
    list.push(e.questionKey);
    byItem.set(id, list);
  }
  const out: string[] = [];
  for (const id of itemIds) for (const k of byItem.get(id) ?? []) if (!out.includes(k)) out.push(k);
  return out;
};

/* ────────────────────────────────────────────────────────────
   Next Best Action
   ──────────────────────────────────────────────────────────── */

export type NextActionKind =
  | 'production_retry'     // 選択では分かるが、言えなかった → 産出をやり直す
  | 'review_recognition'   // 選択問題で間違えた → 復習へ
  | 'production_first'     // 選択は安定・産出は未確認 → 一度言ってみる
  | 'refresh'              // 忘れかけ → 間隔復習
  | 'conversation_apply'   // 選択も産出も安定・会話は未 → AI会話で使う
  | 'prerequisite_review'; // 関連項目（グラフの隣）も崩れている → そちらを先に

export interface NextAction {
  itemId: string;
  action: NextActionKind;
  /** 小さいほど先 */
  priority: number;
  reasonJa: string;
  reasonZh: string;
  /** prerequisite_review のとき、先にやる隣の項目 */
  viaItemId?: string;
}

export interface NextActionOptions {
  dateKey: string;
  /** 知識グラフの辺（knowledgeGraph.buildGrammarGraph の edges）。無ければ隣接は見ない */
  edges?: readonly { from: string; to: string }[];
  /** 対象にする項目（例：いまの級の文法だけ）。無ければ状態にある全部 */
  candidateIds?: readonly string[];
  limit?: number;
}

export const nextBestActions = (state: KnowledgeState, opts: NextActionOptions): NextAction[] => {
  const yesterday = addDays(opts.dateKey, -1);
  const ids = opts.candidateIds ?? Object.keys(state);
  const neighbours = new Map<string, string[]>();
  for (const e of opts.edges ?? []) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }
  const out: NextAction[] = [];
  for (const id of ids) {
    const it = state[id];
    if (!it) continue;
    const r = it.recognition; const p = it.production; const c = it.conversation;
    const recentBoost = (ch: ChannelState) => (ch.lastWrongDateKey === yesterday ? -10 : 0);

    // 1. 選択では分かる／産出で失敗（会話で使えなかったも同じ扱い）
    if ((r.status === 'solid' || r.status === 'shaky') && (p.status === 'failing' || c.status === 'failing')) {
      out.push({
        itemId: id, action: 'production_retry', priority: 10 + recentBoost(p.status === 'failing' ? p : c),
        reasonJa: '選択問題では分かっているのに、自分で言えなかった。言い直しを優先',
        reasonZh: '选择题会做，但自己说不出来。优先改口练习',
      });
      continue;
    }
    // 2. 選択問題で間違えた
    if (r.status === 'failing') {
      const bad = (neighbours.get(id) ?? []).find((n) => state[n]?.recognition.status === 'failing');
      if (bad) {
        out.push({
          itemId: id, action: 'prerequisite_review', priority: 20 + recentBoost(r), viaItemId: bad,
          reasonJa: '関連する項目も崩れている。そちらを先に見直す',
          reasonZh: '相关项目也没掌握，先复习那一个',
        });
      } else {
        out.push({
          itemId: id, action: 'review_recognition', priority: 30 + recentBoost(r),
          reasonJa: r.lastWrongDateKey === yesterday ? '昨日間違えた' : '選択問題で間違えたまま',
          reasonZh: r.lastWrongDateKey === yesterday ? '昨天答错了' : '选择题还没答对',
        });
      }
      continue;
    }
    // 3. 選択は安定・産出は未確認
    if (r.status === 'solid' && p.status === 'untested' && c.status === 'untested') {
      out.push({
        itemId: id, action: 'production_first', priority: 40,
        reasonJa: '選択問題は安定。自分で言えるかは未確認', reasonZh: '选择题已稳定，还没确认能否自己说出来',
      });
      continue;
    }
    // 4. 忘れかけ
    if (fadingOn(r, opts.dateKey)) {
      out.push({
        itemId: id, action: 'refresh', priority: 50,
        reasonJa: '正解はしているが、間隔が空いた', reasonZh: '虽然答对过，但已经隔了一段时间',
      });
      continue;
    }
    // 5. 選択も産出も安定・会話は未
    if (r.status === 'solid' && (p.status === 'solid' || p.status === 'shaky') && c.status === 'untested') {
      out.push({
        itemId: id, action: 'conversation_apply', priority: 60,
        reasonJa: '言えるようになった。会話で使ってみる段階', reasonZh: '已经能说出来了，到了在会话中使用的阶段',
      });
    }
  }
  out.sort((a, b) => a.priority - b.priority || (state[b.itemId].lastActivityAt ?? '').localeCompare(state[a.itemId].lastActivityAt ?? ''));
  return opts.limit ? out.slice(0, opts.limit) : out;
};

/**
 * 弱点文法の並べ替え（AdvShell の weakGrammarIds へ渡す前に通す）。
 * 以前は「最後の試行が80%未満」の順序なし・N2/N3 のみだった。ここでは
 * **産出で失敗しているものを先**に、次に昨日間違えたもの、その後は元の順。
 * 台帳に無い項目（未挑戦）は入れない＝出題できないものを推薦しない。
 */
export const rankWeakGrammarIds = (
  weakIds: readonly string[], state: KnowledgeState, dateKey: string,
): string[] => {
  const actions = nextBestActions(state, { dateKey, candidateIds: weakIds });
  const rank = new Map(actions.map((a, i) => [a.itemId, a.priority * 1000 + i]));
  return [...weakIds].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
};

/** 「選択では分かるが自分では言えない」項目（Phase 3 の目標そのもの） */
export const knownButCannotProduce = (state: KnowledgeState): string[] =>
  Object.values(state)
    .filter((it) => (it.recognition.status === 'solid' || it.recognition.status === 'shaky')
      && (it.production.status === 'failing' || it.conversation.status === 'failing'))
    .map((it) => it.itemId);
