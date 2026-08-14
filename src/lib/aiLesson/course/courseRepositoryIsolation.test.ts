// @vitest-environment jsdom
// アカウント混線防止の受入テスト（2026-08-14 実バグ: 共有端末で別ユーザーのキャッシュが表示された）。
//
// いちばん守りたいこと:
// - **DBに行が無い新規ユーザーに、前のユーザーのキャッシュを絶対に返さない**
// - 別ユーザーのキャッシュを見つけたら、その場でローカルキャッシュを消す
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: { uid: string; row: unknown } = { uid: 'user-B', row: null };

vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: state.uid } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
    }),
  },
}));

import { courseRepository, clearCourseLocalCache } from './courseRepository';

const LEARNER_KEY = 'kawabado.aiCourse.v1.learner';

beforeEach(() => {
  localStorage.clear();
  state.uid = 'user-B';
  state.row = null;
});

describe('learnerキャッシュのアカウント分離', () => {
  it('**DBに行が無い新規ユーザーへ、前のユーザーのキャッシュを返さない**（混線防止）', async () => {
    // 前のユーザー（user-A）のキャッシュが端末に残っている状況
    localStorage.setItem(LEARNER_KEY, JSON.stringify({ id: 'l-A', userId: 'user-A', displayName: 'sho' }));
    const learner = await courseRepository.getLearner();
    expect(learner).toBeNull();
    // 残骸も消えている
    expect(localStorage.getItem(LEARNER_KEY)).toBeNull();
  });

  it('自分自身のキャッシュはDB通信失敗時のフォールバックとして残る', async () => {
    localStorage.setItem(LEARNER_KEY, JSON.stringify({ id: 'l-B', userId: 'user-B', displayName: '李' }));
    state.row = null; // 行なしでもキャッシュ所有者は本人
    const learner = await courseRepository.getLearner();
    // 行が無い場合は null（新規扱い）だが、本人キャッシュは消されない
    expect(learner).toBeNull();
    expect(localStorage.getItem(LEARNER_KEY)).not.toBeNull();
  });

  it('clearCourseLocalCache は学習キャッシュ一式を消す', () => {
    localStorage.setItem(LEARNER_KEY, JSON.stringify({ id: 'x' }));
    localStorage.setItem('kawabado.aiCourse.v1.progress', '[]');
    clearCourseLocalCache();
    expect(localStorage.getItem(LEARNER_KEY)).toBeNull();
    expect(localStorage.getItem('kawabado.aiCourse.v1.progress')).toBeNull();
  });
});
