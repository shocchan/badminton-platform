// @vitest-environment jsdom
// サーバーを進捗の正準にする（PAID STUDENT MINIMUM LINE §3）。
//
//   1. サーバーが読めないとき、古いローカルで「成功のふり」をしない
//   2. 別の生徒が同じブラウザでログインしたら、前の生徒のキャッシュを破棄する
//   3. 学習者の保存に失敗したら、握りつぶさず再送キューに積む
//
// どれも「たまたま動く」ではなく、壊れたときの倒れ方を決めるテスト。

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authGetUser = vi.fn();
const fromChain = vi.fn();
vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: authGetUser },
    from: fromChain,
    rpc: vi.fn(),
  },
}));

const { courseRepository, LearnerLoadError } = await import('./courseRepository');

const LS_LEARNER = 'kawabado.aiCourse.v1.learner';
const LS_PENDING = 'kawabado.aiCourse.v1.pending';
const LS_OWNER = 'kawabado.aiCourse.v1.owner';

const user = (id: string) => ({ data: { user: { id } } });

/** select経路: maybeSingle が結果を返す */
const selectReturns = (result: { data: unknown; error: unknown }) => {
  fromChain.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
  });
};
/** update経路: 失敗させる */
const updateFails = () => {
  fromChain.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    update: () => ({ eq: async () => ({ error: { message: 'boom' } }) }),
  });
};

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('サーバー正準の学習データ', () => {
  it('サーバーが読めないときは、古いローカルを返さず LearnerLoadError', async () => {
    authGetUser.mockResolvedValue(user('U1'));
    localStorage.setItem(LS_OWNER, 'U1');
    localStorage.setItem(LS_LEARNER, JSON.stringify({ id: 'stale', displayName: '古いデータ' }));
    selectReturns({ data: null, error: { message: 'network' } });

    await expect(courseRepository.getLearner()).rejects.toBeInstanceOf(LearnerLoadError);
  });

  it('行が無い（未作成）ときは null（ヒアリングへ進んでよい）', async () => {
    authGetUser.mockResolvedValue(user('U1'));
    selectReturns({ data: null, error: null });
    expect(await courseRepository.getLearner()).toBeNull();
  });

  it('別の生徒がログインしたら、前の生徒のキャッシュを破棄する', async () => {
    authGetUser.mockResolvedValue(user('U2'));
    localStorage.setItem(LS_OWNER, 'U1');
    localStorage.setItem(LS_LEARNER, JSON.stringify({ id: 'A', displayName: '前の生徒' }));
    localStorage.setItem(LS_PENDING, JSON.stringify([{ kind: 'progress', payload: {} }]));
    selectReturns({ data: null, error: null });

    await courseRepository.getLearner();

    expect(localStorage.getItem(LS_LEARNER)).toBeNull();     // 他人のデータが残らない
    expect(localStorage.getItem(LS_PENDING)).toBeNull();     // 他人の書き込みを再送しない
    expect(localStorage.getItem(LS_OWNER)).toBe('U2');
  });

  it('別の生徒がログインしたら、消費時間も引き継がない', async () => {
    // 引き継ぐと、次の生徒が買った60分が最初から減っている状態になる
    authGetUser.mockResolvedValue(user('U2'));
    localStorage.setItem(LS_OWNER, 'U1');
    localStorage.setItem('ai_course_active_seconds_v1', '1800');
    localStorage.setItem('ai_course_trial_grants_v1', '{"grants":[]}');
    selectReturns({ data: null, error: null });

    await courseRepository.getLearner();

    expect(localStorage.getItem('ai_course_active_seconds_v1')).toBeNull();
    expect(localStorage.getItem('ai_course_trial_grants_v1')).toBeNull();
  });

  it('同じ生徒ならキャッシュは残る', async () => {
    authGetUser.mockResolvedValue(user('U1'));
    localStorage.setItem(LS_OWNER, 'U1');
    localStorage.setItem(LS_LEARNER, JSON.stringify({ id: 'A' }));
    selectReturns({ data: null, error: null });
    await courseRepository.getLearner();
    expect(localStorage.getItem(LS_LEARNER)).not.toBeNull();
  });

  it('学習者の保存に失敗したら再送キューへ積む（握りつぶさない）', async () => {
    authGetUser.mockResolvedValue(user('U1'));
    localStorage.setItem(LS_OWNER, 'U1');
    updateFails();

    await courseRepository.updateLearner({ settings: { uiLanguage: 'ja' } as never });

    const q = JSON.parse(localStorage.getItem(LS_PENDING) ?? '[]');
    expect(q.length).toBe(1);
    expect(q[0].kind).toBe('learner');
  });
});
