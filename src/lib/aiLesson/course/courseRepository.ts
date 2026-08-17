// コースの保存層（Supabase + localStorageフォールバック/オフラインキュー）
//
// 方針:
// - 認証済み(supabase.auth)なら Supabase を正とし、RLSで本人のみ読み書き
// - 通信失敗時は localStorage の pending キューへ積み、次回接続時に flush
// - 進捗・learnerは localStorage にもキャッシュし、オフラインでも直近状態を表示
// - カリキュラム本体は静的（courseData）。ここでは生徒データのみ扱う

import { supabase } from '../../../services/supabaseClient';
import type {
  AdminOverrides,
  CourseSessionRecord,
  CourseUtterance,
  FeedbackInput,
  ItemProgress,
  Learner,
  LearnerSettings,
  LessonReport,
  SpeechMetrics,
} from './types';
import type { GrowthSnapshot } from './courseGrowth';
import type { SpeechSample } from './courseBeforeAfter';
import { jstTodayISO } from './courseUsage';

const LS = {
  learner: 'kawabado.aiCourse.v1.learner',
  progress: 'kawabado.aiCourse.v1.progress',
  pending: 'kawabado.aiCourse.v1.pending',
  resume: 'kawabado.aiCourse.v1.resume',
};

/**
 * 端末ローカルキャッシュを全消去する。
 * ログアウト時と「キャッシュの持ち主 ≠ いまのログインユーザー」を検知したときに呼ぶ。
 * 共有端末で前のアカウントの学習データが次のログイン者に見えるのを防ぐ（アカウント混線防止）
 */
export const clearCourseLocalCache = (): void => {
  try { for (const k of Object.values(LS)) localStorage.removeItem(k); } catch { /* private mode */ }
};

const readLS = <T>(key: string): T | null => {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
};
const writeLS = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
};

// ── 行 <-> ドメイン変換 ──
export type LearnerRow = {
  id: string; user_id: string; created_at?: string; display_name: string; preferred_language: string;
  estimated_level: string; difficulty_level: number; current_week: number; is_active: boolean;
  hearing: Record<string, unknown>; settings: LearnerSettings; admin_overrides: AdminOverrides;
};

export const rowToLearner = (r: LearnerRow): Learner => ({
  id: r.id, userId: r.user_id, startedAtISO: r.created_at ?? null, displayName: r.display_name,
  preferredLanguage: (r.preferred_language === 'ja' ? 'ja' : 'zh'),
  estimatedLevel: r.estimated_level, difficultyLevel: (r.difficulty_level as Learner['difficultyLevel']),
  currentWeek: r.current_week, isActive: r.is_active,
  hearing: r.hearing ?? {}, settings: r.settings ?? {} as LearnerSettings,
  adminOverrides: r.admin_overrides ?? {},
});

type ProgressRow = {
  item_id: string; mastery_state: string; mastery_score: number;
  first_learned_at: string; last_practiced_at: string; next_review_at: string | null;
  review_stage: string; successful_reviews: number; failed_reviews: number;
};
const rowToProgress = (r: ProgressRow): ItemProgress => ({
  itemId: r.item_id, masteryState: r.mastery_state as ItemProgress['masteryState'],
  masteryScore: Number(r.mastery_score), firstLearnedAt: r.first_learned_at,
  lastPracticedAt: r.last_practiced_at, nextReviewAt: r.next_review_at,
  reviewStage: r.review_stage as ItemProgress['reviewStage'],
  successfulReviews: r.successful_reviews, failedReviews: r.failed_reviews,
});

// ── pending キュー（オフライン時の書き込みを保持） ──
interface PendingOp {
  kind: 'progress' | 'session' | 'utterances' | 'feedback' | 'usage' | 'learner';
  payload: unknown;
  at: string;
}
const queuePending = (op: Omit<PendingOp, 'at'>): void => {
  const q = readLS<PendingOp[]>(LS.pending) ?? [];
  q.push({ ...op, at: new Date().toISOString() });
  writeLS(LS.pending, q.slice(-100));
};

/** ai_start_session が返す拒否理由（安全なコードのみ。内部情報は含まない） */
export type StartSessionCode =
  | 'no_learner'
  | 'learner_suspended'
  | 'session_already_active'
  | 'daily_session_limit'
  | 'daily_time_limit'
  | 'monthly_session_limit'
  | 'monthly_time_limit'
  | 'network'
  | 'unknown';

export interface StartSessionResult {
  ok: boolean;
  sessionId?: string | null;
  remainingSessions?: number;
  /** 今月あと何回できるか（月次アッパー基準） */
  remainingMonthly?: number;
  code?: StartSessionCode;
}

export interface CourseRepository {
  getCurrentUserId(): Promise<string | null>;
  getLearner(): Promise<Learner | null>;
  createLearner(input: {
    displayName: string; preferredLanguage: 'ja' | 'zh'; estimatedLevel: string;
    difficultyLevel: number; currentWeek: number; hearing: Record<string, unknown>;
    settings: LearnerSettings; adminOverrides?: AdminOverrides;
  }): Promise<Learner | null>;
  updateLearner(patch: Partial<{
    displayName: string; estimatedLevel: string; difficultyLevel: number;
    currentWeek: number; isActive: boolean; settings: LearnerSettings; adminOverrides: AdminOverrides;
  }>): Promise<void>;
  listProgress(): Promise<ItemProgress[]>;
  upsertProgress(learnerId: string, p: ItemProgress): Promise<void>;
  /** サーバー側で上限確認＋セッション予約を原子的に行う（クライアント判定に依存しない） */
  createSession(learnerId: string, s: Omit<CourseSessionRecord, 'id'>): Promise<StartSessionResult>;
  finalizeSession(sessionId: string, patch: Partial<CourseSessionRecord>, utterances: CourseUtterance[], learnerId: string): Promise<void>;
  listRecentSessions(limit?: number): Promise<CourseSessionRecord[]>;
  /** 成長のBefore/After用: 生徒の確定発話を古い→新しい順で取得 */
  loadStudentUtterances(learnerId: string, limit?: number): Promise<SpeechSample[]>;
  /** 進行中（in_progress）の自分のセッションを1件取得（端末間の再開判定用） */
  getActiveSession(): Promise<CourseSessionRecord | null>;
  /** セッションの発話を時系列で取得（テキスト会話の端末間復元用） */
  listSessionUtterances(sessionId: string, limit?: number): Promise<{ speaker: string; transcript: string }[]>;
  /** 発話を逐次保存（テキスト会話のターン毎チェックポイント。失敗は無視） */
  appendUtterances(sessionId: string, learnerId: string, utts: CourseUtterance[]): Promise<void>;
  /** 成長スナップショットを保存（同一 trigger は上書きせず維持＝append-only） */
  saveGrowthSnapshot(learnerId: string, snapshot: GrowthSnapshot): Promise<void>;
  listGrowthSnapshots(learnerId: string): Promise<GrowthSnapshot[]>;
  saveFeedback(learnerId: string, sessionId: string | null, fb: FeedbackInput): Promise<void>;
  recordUsage(learnerId: string, seconds: number, costUsd: number): Promise<void>;
  flushPending(): Promise<void>;
  // 中断・再開
  saveResume(state: unknown): void;
  loadResume<T>(): T | null;
  clearResume(): void;
  // キャッシュ
  cachedLearner(): Learner | null;
  cachedProgress(): ItemProgress[];
}

const createRepository = (): CourseRepository => ({
  async getCurrentUserId() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  },

  async getLearner() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return readLS<Learner>(LS.learner);
    // 別ユーザーのキャッシュは返さず、その場で全消去する（共有端末のアカウント混線防止）。
    // これが無いと「新規ユーザーでログイン→DBに行が無い→前の人のキャッシュを表示」が起きる
    const cached = readLS<Learner>(LS.learner);
    const own = cached && cached.userId === u.user.id ? cached : null;
    if (cached && !own) clearCourseLocalCache();
    const { data, error } = await supabase.from('ai_learners').select('*').eq('user_id', u.user.id).maybeSingle();
    if (error) return own;   // 通信失敗時だけ「自分の」キャッシュへフォールバック
    if (!data) return null;  // 行が無い＝新規。ヒアリングへ進ませる
    const learner = rowToLearner(data as LearnerRow);
    writeLS(LS.learner, learner);
    return learner;
  },

  async createLearner(input) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase.from('ai_learners').insert({
      user_id: u.user.id,
      display_name: input.displayName,
      preferred_language: input.preferredLanguage,
      estimated_level: input.estimatedLevel,
      difficulty_level: input.difficultyLevel,
      current_week: input.currentWeek,
      hearing: input.hearing,
      settings: input.settings,
      admin_overrides: input.adminOverrides ?? {},
    }).select('*').single();
    if (error || !data) return null;
    const learner = rowToLearner(data as LearnerRow);
    writeLS(LS.learner, learner);
    return learner;
  },

  async updateLearner(patch) {
    const cached = readLS<Learner>(LS.learner);
    if (cached) writeLS(LS.learner, { ...cached, ...patch });
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const row: Record<string, unknown> = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.estimatedLevel !== undefined) row.estimated_level = patch.estimatedLevel;
    if (patch.difficultyLevel !== undefined) row.difficulty_level = patch.difficultyLevel;
    if (patch.currentWeek !== undefined) row.current_week = patch.currentWeek;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    if (patch.adminOverrides !== undefined) row.admin_overrides = patch.adminOverrides;

    // settings は保護つきRPCで保存する（2026-08-15 耐久性監査P0/F1）:
    // 先生の発行キー（answerSheets / interviewPrep.enabledAt）はDB側の現在値が勝ち、
    // クライアントが知らないトップレベルキーも温存される。RPC未配備・失敗時は従来updateへフォールバック
    if (patch.settings !== undefined) {
      const { data: saved, error: rpcError } = await supabase.rpc('ai_save_learner_settings', {
        p_settings: patch.settings,
      });
      if (!rpcError && saved) {
        // マージ結果（発行データ入り）をキャッシュへ反映＝発行直後の取り込みが次の保存で完了する
        const nowCached = readLS<Learner>(LS.learner);
        if (nowCached) writeLS(LS.learner, { ...nowCached, settings: saved as Learner['settings'] });
      } else {
        row.settings = patch.settings;
      }
    }

    if (Object.keys(row).length > 0) {
      row.updated_at = new Date().toISOString();
      const { error } = await supabase.from('ai_learners').update(row).eq('user_id', u.user.id);
      if (error) {
        // 学習データの書込失敗を握りつぶさない（監査OPS-1）。
        // LSキャッシュが常に最新のローカル状態なので、再送は「キャッシュの現在値を送り直す」マーカー1件でよい
        // （patchを積むと、後続の成功後に古いpatchが再送され進捗を巻き戻すため）
        const q = (readLS<PendingOp[]>(LS.pending) ?? []).filter((op) => op.kind !== 'learner');
        q.push({ kind: 'learner', payload: { userId: u.user.id }, at: new Date().toISOString() });
        writeLS(LS.pending, q.slice(-100));
      }
    }
  },

  async listProgress() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return readLS<ItemProgress[]>(LS.progress) ?? [];
    const learner = await this.getLearner();
    if (!learner) return readLS<ItemProgress[]>(LS.progress) ?? [];
    const { data, error } = await supabase.from('ai_item_progress').select('*').eq('learner_id', learner.id);
    if (error || !data) return readLS<ItemProgress[]>(LS.progress) ?? [];
    const list = (data as ProgressRow[]).map(rowToProgress);
    writeLS(LS.progress, list);
    return list;
  },

  async upsertProgress(learnerId, p) {
    // localキャッシュを先に更新（オフラインでも進捗が見える）
    const cached = readLS<ItemProgress[]>(LS.progress) ?? [];
    const next = [...cached.filter((x) => x.itemId !== p.itemId), p];
    writeLS(LS.progress, next);
    const { error } = await supabase.from('ai_item_progress').upsert({
      learner_id: learnerId, item_id: p.itemId, mastery_state: p.masteryState,
      mastery_score: p.masteryScore, first_learned_at: p.firstLearnedAt,
      last_practiced_at: p.lastPracticedAt, next_review_at: p.nextReviewAt,
      review_stage: p.reviewStage, successful_reviews: p.successfulReviews,
      failed_reviews: p.failedReviews, updated_at: new Date().toISOString(),
    }, { onConflict: 'learner_id,item_id' });
    if (error) queuePending({ kind: 'progress', payload: { learnerId, p } });
  },

  async createSession(_learnerId, s) {
    // 直接 insert はRLSで禁止。ai_start_session RPC が
    // 「停止中でないか・本日の回数/時間の上限・同時セッション」を確認してから
    // セッション行を作る（確認と予約を1トランザクションで行う）。
    const { data, error } = await supabase.rpc('ai_start_session', {
      p_mission_id: s.missionId,
      p_lesson_kind: s.lessonKind,
      p_mode: s.mode,
      p_difficulty: s.difficulty,
      p_target_expression: s.targetExpression,
    });
    if (error || !data) return { ok: false, code: 'network' };
    const r = data as { ok: boolean; code?: string; sessionId?: string; remainingSessions?: number; remainingMonthly?: number };
    if (!r.ok) return { ok: false, code: (r.code as StartSessionCode) ?? 'unknown' };
    return { ok: true, sessionId: r.sessionId ?? null, remainingSessions: r.remainingSessions ?? 0, remainingMonthly: r.remainingMonthly };
  },

  async finalizeSession(sessionId, patch, utterances, learnerId) {
    const row: Record<string, unknown> = {};
    if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
    if (patch.durationSeconds !== undefined) row.duration_seconds = patch.durationSeconds;
    if (patch.completionStatus !== undefined) row.completion_status = patch.completionStatus;
    if (patch.endReason !== undefined) row.end_reason = patch.endReason;
    if (patch.targetUsed !== undefined) row.target_used = patch.targetUsed;
    if (patch.targetUsedIndependently !== undefined) row.target_used_independently = patch.targetUsedIndependently;
    if (patch.hintsUsed !== undefined) row.hints_used = patch.hintsUsed;
    if (patch.chineseSupportUsed !== undefined) row.chinese_support_used = patch.chineseSupportUsed;
    if (patch.errorCode !== undefined) row.error_code = patch.errorCode;
    if (patch.estimatedCostUsd !== undefined) row.estimated_cost_usd = patch.estimatedCostUsd;
    if (patch.report !== undefined) row.report = patch.report;
    if (patch.speechMetrics !== undefined) row.speech_metrics = patch.speechMetrics;
    const { error } = await supabase.from('ai_learning_sessions').update(row).eq('id', sessionId);
    if (error) { queuePending({ kind: 'session', payload: { sessionId, patch } }); return; }
    if (utterances.length > 0) {
      const rows = utterances.map((u) => ({
        session_id: sessionId, learner_id: learnerId, speaker: u.speaker,
        transcript: u.transcript, at_ms: u.atMs, is_final: u.isFinal, related_target: u.relatedTarget,
      }));
      const { error: uErr } = await supabase.from('ai_session_utterances').insert(rows);
      if (uErr) queuePending({ kind: 'utterances', payload: { sessionId, learnerId, utterances } });
    }
  },

  async listRecentSessions(limit = 20) {
    const learner = await this.getLearner();
    if (!learner) return [];
    const { data, error } = await supabase.from('ai_learning_sessions').select('*')
      .eq('learner_id', learner.id).order('started_at', { ascending: false }).limit(limit);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      id: r.id as string, missionId: r.mission_id as string, mode: r.mode as 'voice' | 'text',
      lessonKind: r.lesson_kind as CourseSessionRecord['lessonKind'], difficulty: r.difficulty as number,
      startedAt: r.started_at as string, endedAt: r.ended_at as string | null,
      durationSeconds: r.duration_seconds as number,
      completionStatus: r.completion_status as CourseSessionRecord['completionStatus'],
      endReason: r.end_reason as string | null, targetExpression: r.target_expression as string,
      targetUsed: r.target_used as boolean, targetUsedIndependently: r.target_used_independently as boolean,
      hintsUsed: r.hints_used as number, chineseSupportUsed: r.chinese_support_used as boolean,
      errorCode: r.error_code as string | null, estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
      report: (r.report as LessonReport) ?? null,
      speechMetrics: (r.speech_metrics && typeof (r.speech_metrics as SpeechMetrics).studentTurns === 'number'
        ? (r.speech_metrics as SpeechMetrics) : undefined),
    }));
  },

  async loadStudentUtterances(learnerId, limit = 40) {
    // 古い→新しい順に、生徒の確定発話を取得（Before/After用）。低信頼除外は純関数側で行う
    const { data, error } = await supabase.from('ai_session_utterances')
      .select('transcript, created_at, session_id, is_final')
      .eq('learner_id', learnerId).eq('speaker', 'student').eq('is_final', true)
      .order('created_at', { ascending: true }).limit(limit);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      transcript: r.transcript as string,
      dateISO: (r.created_at as string) ?? '',
      sessionId: (r.session_id as string) ?? '',
    }));
  },

  async getActiveSession() {
    // 進行中セッション（別端末で開始されたものを含む）。最新1件のみ
    const learner = await this.getLearner();
    if (!learner) return null;
    const { data, error } = await supabase.from('ai_learning_sessions').select('*')
      .eq('learner_id', learner.id).eq('completion_status', 'in_progress')
      .order('started_at', { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return null;
    const r = data[0] as Record<string, unknown>;
    return {
      id: r.id as string, missionId: r.mission_id as string, mode: r.mode as 'voice' | 'text',
      lessonKind: r.lesson_kind as CourseSessionRecord['lessonKind'], difficulty: r.difficulty as number,
      startedAt: r.started_at as string, endedAt: r.ended_at as string | null,
      durationSeconds: r.duration_seconds as number,
      completionStatus: r.completion_status as CourseSessionRecord['completionStatus'],
      endReason: r.end_reason as string | null, targetExpression: r.target_expression as string,
      targetUsed: r.target_used as boolean, targetUsedIndependently: r.target_used_independently as boolean,
      hintsUsed: r.hints_used as number, chineseSupportUsed: r.chinese_support_used as boolean,
      errorCode: r.error_code as string | null, estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
      report: (r.report as LessonReport) ?? null,
    } as CourseSessionRecord;
  },

  async listSessionUtterances(sessionId, limit = 60) {
    // テキスト会話の端末間復元用（自分のセッションのみRLSで読める）
    const { data, error } = await supabase.from('ai_session_utterances')
      .select('speaker, transcript, at_ms')
      .eq('session_id', sessionId).eq('is_final', true)
      .order('at_ms', { ascending: true }).limit(limit);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      speaker: r.speaker as string, transcript: r.transcript as string,
    }));
  },

  async appendUtterances(sessionId, learnerId, utts) {
    // ターン毎チェックポイント（fire-and-forget）。失敗しても会話は止めない
    if (utts.length === 0) return;
    const rows = utts.map((u) => ({
      session_id: sessionId, learner_id: learnerId, speaker: u.speaker,
      transcript: u.transcript, at_ms: u.atMs, is_final: u.isFinal, related_target: u.relatedTarget,
    }));
    await supabase.from('ai_session_utterances').insert(rows).then(() => undefined, () => undefined);
  },

  async saveGrowthSnapshot(learnerId, snapshot) {
    // 同一 trigger が既にあれば維持（append-only）。onConflict で何もしない
    const { error } = await supabase.from('ai_growth_snapshots').upsert({
      learner_id: learnerId,
      trigger_kind: snapshot.triggerKind,
      session_count: snapshot.sessionCount,
      data: snapshot,
    }, { onConflict: 'learner_id,trigger_kind', ignoreDuplicates: true });
    if (error) { /* 成長保存の失敗は学習を止めない */ }
  },

  async listGrowthSnapshots(learnerId) {
    const { data, error } = await supabase.from('ai_growth_snapshots')
      .select('data').eq('learner_id', learnerId).order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as { data: GrowthSnapshot }[]).map((r) => r.data).filter(Boolean);
  },

  async saveFeedback(learnerId, sessionId, fb) {
    const { error } = await supabase.from('ai_feedback').insert({
      learner_id: learnerId, session_id: sessionId, difficulty_rating: fb.difficultyRating,
      speed_rating: fb.speedRating ?? null, zh_support_rating: fb.zhSupportRating ?? null,
      remembered: fb.remembered ?? null, comment: fb.comment ?? null,
    });
    if (error) queuePending({ kind: 'feedback', payload: { learnerId, sessionId, fb } });
  },

  async recordUsage(learnerId, seconds, costUsd) {
    // 回数(sessions_count)は ai_start_session が予約時に加算済み。
    // ここで再加算すると二重計上になるため、秒数とコストのみ積む。
    // 加算専用RPC優先（二層防御・総監査P1 2026-08-17）。利用量を絶対値で
    // 上書きできる直接upsertは、RPC未適用の旧環境向けフォールバックに残すのみ
    // （remote適用後は 20260817010000 のrevokeで直接書き込み自体が塞がれる）
    const { error: rpcError } = await supabase.rpc('ai_record_usage', {
      p_seconds: Math.round(seconds), p_cost_usd: costUsd,
    });
    if (!rpcError) return;
    const today = jstTodayISO();
    const { data } = await supabase.from('ai_usage_daily').select('*')
      .eq('learner_id', learnerId).eq('usage_date', today).maybeSingle();
    const prev = data as { sessions_count: number; seconds_used: number; estimated_cost_usd: number } | null;
    const { error } = await supabase.from('ai_usage_daily').upsert({
      learner_id: learnerId, usage_date: today,
      sessions_count: prev?.sessions_count ?? 0,
      seconds_used: (prev?.seconds_used ?? 0) + seconds,
      estimated_cost_usd: Number(prev?.estimated_cost_usd ?? 0) + costUsd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'learner_id,usage_date' });
    if (error) queuePending({ kind: 'usage', payload: { learnerId, seconds, costUsd } });
  },

  async flushPending() {
    const q = readLS<PendingOp[]>(LS.pending) ?? [];
    if (q.length === 0) return;
    const remaining: PendingOp[] = [];
    for (const op of q) {
      try {
        if (op.kind === 'progress') {
          const { learnerId, p } = op.payload as { learnerId: string; p: ItemProgress };
          await this.upsertProgress(learnerId, p);
        } else if (op.kind === 'feedback') {
          const { learnerId, sessionId, fb } = op.payload as { learnerId: string; sessionId: string | null; fb: FeedbackInput };
          await this.saveFeedback(learnerId, sessionId, fb);
        } else if (op.kind === 'usage') {
          const { learnerId, seconds, costUsd } = op.payload as { learnerId: string; seconds: number; costUsd: number };
          await this.recordUsage(learnerId, seconds, costUsd);
        } else if (op.kind === 'learner') {
          const { userId } = op.payload as { userId: string };
          const { data: u } = await supabase.auth.getUser();
          const cached = readLS<Learner>(LS.learner);
          if (u.user && u.user.id === userId && cached && cached.userId === userId) {
            // LSキャッシュ（常に最新のローカル状態）から学習データを送り直す。
            // 学習者クライアントが書くのは settings と displayName のみ（difficulty等はadmin側の管轄なので触らない）。
            // settings は保護つきRPC優先（発行キーをDB側優先でマージ・耐久性監査P0）
            const { error: rpcError } = await supabase.rpc('ai_save_learner_settings', {
              p_settings: cached.settings,
            });
            const row: Record<string, unknown> = { display_name: cached.displayName, updated_at: new Date().toISOString() };
            if (rpcError) row.settings = cached.settings;
            const { error } = await supabase.from('ai_learners').update(row).eq('user_id', userId);
            if (error) remaining.push(op);
          }
          // ユーザー不一致・キャッシュ消失時は適用せず破棄（他人のrowへ書かない）
        }
        // session/utterances は sessionId 依存のため簡易にスキップ（次回セッションで再送不要）
      } catch {
        remaining.push(op);
      }
    }
    writeLS(LS.pending, remaining);
  },

  saveResume(state) { writeLS(LS.resume, state); },
  loadResume<T>() { return readLS<T>(LS.resume); },
  clearResume() { try { localStorage.removeItem(LS.resume); } catch { /* noop */ } },
  cachedLearner() { return readLS<Learner>(LS.learner); },
  cachedProgress() { return readLS<ItemProgress[]>(LS.progress) ?? []; },
});

export const courseRepository: CourseRepository = createRepository();
