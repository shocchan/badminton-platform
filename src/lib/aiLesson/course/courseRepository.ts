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
} from './types';

const LS = {
  learner: 'kawabado.aiCourse.v1.learner',
  progress: 'kawabado.aiCourse.v1.progress',
  pending: 'kawabado.aiCourse.v1.pending',
  resume: 'kawabado.aiCourse.v1.resume',
};

const readLS = <T>(key: string): T | null => {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
};
const writeLS = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
};

// ── 行 <-> ドメイン変換 ──
type LearnerRow = {
  id: string; user_id: string; display_name: string; preferred_language: string;
  estimated_level: string; difficulty_level: number; current_week: number; is_active: boolean;
  hearing: Record<string, unknown>; settings: LearnerSettings; admin_overrides: AdminOverrides;
};

const rowToLearner = (r: LearnerRow): Learner => ({
  id: r.id, userId: r.user_id, displayName: r.display_name,
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
  kind: 'progress' | 'session' | 'utterances' | 'feedback' | 'usage';
  payload: unknown;
  at: string;
}
const queuePending = (op: Omit<PendingOp, 'at'>): void => {
  const q = readLS<PendingOp[]>(LS.pending) ?? [];
  q.push({ ...op, at: new Date().toISOString() });
  writeLS(LS.pending, q.slice(-100));
};

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
  createSession(learnerId: string, s: Omit<CourseSessionRecord, 'id'>): Promise<string | null>;
  finalizeSession(sessionId: string, patch: Partial<CourseSessionRecord>, utterances: CourseUtterance[], learnerId: string): Promise<void>;
  listRecentSessions(limit?: number): Promise<CourseSessionRecord[]>;
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
    const { data, error } = await supabase.from('ai_learners').select('*').eq('user_id', u.user.id).maybeSingle();
    if (error || !data) return readLS<Learner>(LS.learner);
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
    if (patch.settings !== undefined) row.settings = patch.settings;
    if (patch.adminOverrides !== undefined) row.admin_overrides = patch.adminOverrides;
    row.updated_at = new Date().toISOString();
    await supabase.from('ai_learners').update(row).eq('user_id', u.user.id);
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

  async createSession(learnerId, s) {
    const { data, error } = await supabase.from('ai_learning_sessions').insert({
      learner_id: learnerId, mission_id: s.missionId, mode: s.mode, lesson_kind: s.lessonKind,
      difficulty: s.difficulty, started_at: s.startedAt, target_expression: s.targetExpression,
      completion_status: 'in_progress', curriculum_version: 'v1',
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
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
    }));
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
    // 当日行を読み、加算してupsert
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('ai_usage_daily').select('*')
      .eq('learner_id', learnerId).eq('usage_date', today).maybeSingle();
    const prev = data as { sessions_count: number; seconds_used: number; estimated_cost_usd: number } | null;
    const { error } = await supabase.from('ai_usage_daily').upsert({
      learner_id: learnerId, usage_date: today,
      sessions_count: (prev?.sessions_count ?? 0) + 1,
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
