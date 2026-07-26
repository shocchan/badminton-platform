// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FoundationLabShell } from './FoundationLabShell';
import { aiCourseI18n } from '../../../locales/aiCourse';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });

const t = aiCourseI18n.ja;

describe('言語切替・URL復元（§7/§10）', () => {
  it('t差し替え（言語切替相当）でもviewが維持され、sessionStorage進捗が消えない', async () => {
    window.sessionStorage.setItem('ai_course_foundation_preview_v1', JSON.stringify({ schemaVersion: 1, attempts: [{ attemptId: 'fu-selfintro-1:1', unitId: 'fu-selfintro-1', attemptNumber: 1, attemptSeed: 2, startedAt: '2026-07-26T09:00:00.000Z', completedAt: null, locale: 'ja', answers: [{ questionId: 'fq-r1', targetId: 'fi-hataraku', dimension: 'reading', correct: true, errorTag: 'reading_hataraku', attemptedAt: '2026-07-26T09:00:10.000Z' }] }] }));
    const { rerender } = render(<FoundationLabShell t={aiCourseI18n.ja} onBack={() => {}} initial={{ section: 'review' }} />);
    await waitFor(() => expect(screen.getByText(aiCourseI18n.ja.lab.reviewNote)).toBeTruthy());
    rerender(<FoundationLabShell t={aiCourseI18n.zh} onBack={() => {}} initial={{ section: 'review' }} />);
    await waitFor(() => expect(screen.getByText(aiCourseI18n.zh.lab.reviewNote)).toBeTruthy());
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_foundation_preview_v1')!);
    expect(raw.attempts.length).toBe(1);
    expect(raw.attempts[0].answers.length).toBe(1);
    expect(raw.attempts[0].attemptSeed).toBe(2);
  });
  it('initial.section=historyで履歴タブから開始・不正unitはラボトップへ正規化', async () => {
    const states: unknown[] = [];
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'history', unit: 'fu-bogus' }} onStateChange={(s) => states.push(s)} />);
    await waitFor(() => expect(screen.getByText(t.lab.emptyHistory)).toBeTruthy());
    // 不正unitは開かれず、正規化コールバックが一度だけ発火
    expect(states).toContainEqual({ section: 'history', unit: null, step: null });
  });
  it('initial.unit=単元1・step=quizで未完了attemptがあれば小テストへ直行し、attemptを新規作成しない', async () => {
    window.sessionStorage.setItem('ai_course_foundation_preview_v1', JSON.stringify({ schemaVersion: 1, attempts: [{ attemptId: 'fu-selfintro-1:1', unitId: 'fu-selfintro-1', attemptNumber: 1, attemptSeed: 3, startedAt: '2026-07-26T09:00:00.000Z', completedAt: null, locale: 'ja', answers: [{ questionId: 'fq-r1', targetId: 'fi-hataraku', dimension: 'reading', correct: true, errorTag: 'reading_hataraku', attemptedAt: '2026-07-26T09:00:10.000Z' }] }] }));
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'quiz' }} />);
    // 2問目（index 1）から再開（1問回答済み）
    await waitFor(() => expect(screen.getByText('2 / 11')).toBeTruthy());
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_foundation_preview_v1')!);
    expect(raw.attempts.length).toBe(1); // 新attemptを作らない
  });
  it('step=quizでもattempt履歴が無ければ教材introへ（勝手にattempt生成しない）', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'quiz' }} />);
    await waitFor(() => expect(screen.getByText(t.lab.start)).toBeTruthy());
    expect(window.sessionStorage.getItem('ai_course_foundation_preview_v1')).toBeNull();
  });
});

describe('しくみラボ シェル（5領域・§7）', () => {
  it('5領域タブと今日のおすすめ・単元一覧・非保存表記を表示', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    for (const label of [t.lab.tabToday, t.lab.tabWords, t.lab.tabRules, t.lab.tabReview, t.lab.tabHistory]) {
      expect(screen.getAllByRole('tab', { name: label }).length).toBe(1);
    }
    expect(screen.getByText(t.lab.todayHeading)).toBeTruthy();
    expect(screen.getByText(t.lab.unitListHeading)).toBeTruthy();
    expect(screen.getByText(t.lab.notSaved)).toBeTruthy();
    expect(screen.getByText(t.lab.draftNote)).toBeTruthy();
  });
  it('未着手状態では第1単元が推薦される（決定的・架空AI分析なし）', () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    expect(screen.getByText(t.lab.recNext('自己紹介で使う基本のことば'))).toBeTruthy();
  });
  it('履歴タブ: 空状態→リセットは確認つき', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: t.lab.tabHistory }));
    await waitFor(() => expect(screen.getByText(t.lab.emptyHistory)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.resetButton));
    expect(screen.getByText(t.lab.resetConfirm)).toBeTruthy();
  });
  it('復習タブ: 空状態と「正式保存ではない」注記', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: t.lab.tabReview }));
    await waitFor(() => expect(screen.getByText(t.lab.emptyReview)).toBeTruthy());
    expect(screen.getByText(t.lab.reviewNote)).toBeTruthy();
  });
  it('ことばタブ: 検索欄と語彙（読み・意味・状態）を表示し、正解一覧は露出しない', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: t.lab.tabWords }));
    await waitFor(() => expect(screen.getByPlaceholderText(t.lab.searchWords)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('出身').length).toBeGreaterThan(0));
    // 問題の解説文（正解解説）が一覧に露出していない
    expect(screen.queryByText('働く＝はたらく。')).toBeNull();
  });
  it('zhでも5領域が表示される', () => {
    const tz = aiCourseI18n.zh;
    render(<FoundationLabShell t={tz} onBack={() => {}} />);
    expect(screen.getAllByRole('tab', { name: tz.lab.tabToday }).length).toBe(1);
    expect(screen.getByText(tz.lab.todayHeading)).toBeTruthy();
  });
});
