// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FoundationLabShell } from './FoundationLabShell';
import { aiCourseI18n } from '../../../locales/aiCourse';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });

const t = aiCourseI18n.ja;

describe('しくみラボ 3領域構造（§3/§4）', () => {
  it('主要タブは今日・単元・記録の3つだけ（旧5タブは主要ナビに出ない）', () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    expect(screen.getAllByRole('tab').length).toBe(3);
    expect(screen.getByRole('tab', { name: t.lab.tabToday })).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.lab.tabUnits })).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.lab.tabRecords })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'ことば' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'しくみ' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '復習' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '履歴' })).toBeNull();
  });
  it('初期画面は「今日」: 大カード1枚＋主要CTA1つ＋進み具合＋単元導線＋非保存表記', () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    expect(screen.getByText(t.lab.todayCardTitle)).toBeTruthy();
    // 未着手→第1単元の内容が本文に出る（決定的推薦）
    expect(screen.getByText(t.lab.todayBody('自己紹介で使う基本のことば'))).toBeTruthy();
    expect(screen.getAllByText(t.lab.ctaStart).length).toBe(1); // 第一CTAは一つ
    expect(screen.getByText(t.lab.progressHeading)).toBeTruthy();
    expect(screen.getByText(t.lab.chooseUnit)).toBeTruthy();
    expect(screen.getByText(t.lab.notSaved)).toBeTruthy();
    // 今日のファーストビューへ全単元一覧・検索・品詞フィルターを出さない（§4）
    expect(screen.queryByPlaceholderText(t.lab.searchWords)).toBeNull();
    expect(screen.queryByText('助詞「は・が・を」')).toBeNull();
  });
  it('「単元」タブ: 6単元が学習順カードで並び、補助導線（ことば/しくみから探す）がある', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: t.lab.tabUnits }));
    await waitFor(() => expect(screen.getByText('自己紹介で使う基本のことば')).toBeTruthy());
    expect(screen.getByText('助詞「は・が・を」')).toBeTruthy();
    expect(screen.getByText('数字・時間・値段と買い物')).toBeTruthy();
    expect(screen.getAllByText(t.lab.statusNotStarted).length).toBe(6);
    expect(screen.getByText(t.lab.browseWords)).toBeTruthy();
    expect(screen.getByText(t.lab.browseRules)).toBeTruthy();
    // ソフト前提の短い案内（単元2）
    expect(screen.getAllByText(t.lab.prereqShort('自己紹介で使う基本のことば')).length).toBeGreaterThanOrEqual(1); // unit2に加えunit4-6にも同一前提の案内
  });
  it('「記録」タブ: 復習・履歴が1画面に統合され、空状態が表示される', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: t.lab.tabRecords }));
    await waitFor(() => expect(screen.getByText(t.lab.recordsReviewHeading)).toBeTruthy());
    expect(screen.getByText(t.lab.recordsRecentHeading)).toBeTruthy();
    expect(screen.getByText(t.lab.emptyReview)).toBeTruthy();
    expect(screen.getByText(t.lab.emptyHistory)).toBeTruthy();
    expect(screen.getByText(t.lab.resetButton)).toBeTruthy();
  });
  it('zh: 3タブ（今天学习/课程/学习记录）と今日カードが表示される', () => {
    const tz = aiCourseI18n.zh;
    render(<FoundationLabShell t={tz} onBack={() => {}} />);
    expect(screen.getByRole('tab', { name: tz.lab.tabToday })).toBeTruthy();
    expect(screen.getByRole('tab', { name: tz.lab.tabUnits })).toBeTruthy();
    expect(screen.getByRole('tab', { name: tz.lab.tabRecords })).toBeTruthy();
    expect(screen.getByText(tz.lab.todayCardTitle)).toBeTruthy();
  });
});

describe('言語切替・URL復元（§19）', () => {
  it('t差し替え（言語切替相当）でも記録ビューが維持され、sessionStorage進捗が消えない', async () => {
    window.sessionStorage.setItem('ai_course_foundation_preview_v1', JSON.stringify({ schemaVersion: 2, attempts: [{ attemptId: 'fu-selfintro-1:1', unitId: 'fu-selfintro-1', attemptNumber: 1, attemptSeed: 2, startedAt: '2026-07-26T09:00:00.000Z', completedAt: null, locale: 'ja', answers: [{ questionId: 'fq-r1', targetId: 'fi-hataraku', dimension: 'reading', correct: true, errorTag: 'reading_hataraku', attemptedAt: '2026-07-26T09:00:10.000Z' }] }] }));
    const { rerender } = render(<FoundationLabShell t={aiCourseI18n.ja} onBack={() => {}} initial={{ section: 'records' }} />);
    await waitFor(() => expect(screen.getByText(aiCourseI18n.ja.lab.recordsReviewHeading)).toBeTruthy());
    rerender(<FoundationLabShell t={aiCourseI18n.zh} onBack={() => {}} initial={{ section: 'records' }} />);
    await waitFor(() => expect(screen.getByText(aiCourseI18n.zh.lab.recordsReviewHeading)).toBeTruthy());
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_foundation_preview_v1')!);
    expect(raw.attempts.length).toBe(1);
    expect(raw.attempts[0].attemptSeed).toBe(2);
  });
  it('不正unitはラボトップへ正規化（1回のみ・ループなし）', async () => {
    const states: unknown[] = [];
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'records', unit: 'fu-bogus' }} onStateChange={(s) => states.push(s)} />);
    await waitFor(() => expect(screen.getByText(t.lab.recordsReviewHeading)).toBeTruthy());
    expect(states).toContainEqual({ section: 'records', unit: null, step: null });
  });
  it('unit＋step=quizで未完了attemptがあれば途中の問題から再開・新attemptを作らない', async () => {
    window.sessionStorage.setItem('ai_course_foundation_preview_v1', JSON.stringify({ schemaVersion: 2, attempts: [{ attemptId: 'fu-selfintro-1:1', unitId: 'fu-selfintro-1', attemptNumber: 1, attemptSeed: 3, startedAt: '2026-07-26T09:00:00.000Z', completedAt: null, locale: 'ja', answers: [{ questionId: 'fq-r1', targetId: 'fi-hataraku', dimension: 'reading', correct: true, errorTag: 'reading_hataraku', attemptedAt: '2026-07-26T09:00:10.000Z' }] }] }));
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'quiz' }} />);
    await waitFor(() => expect(screen.getByText('2 / 11')).toBeTruthy());
    expect(JSON.parse(window.sessionStorage.getItem('ai_course_foundation_preview_v1')!).attempts.length).toBe(1);
  });
  it('step=quizでもattempt履歴が無ければ単元introへ（勝手にattempt生成しない）', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'quiz' }} />);
    await waitFor(() => expect(screen.getByText(t.lab.start)).toBeTruthy());
    expect(window.sessionStorage.getItem('ai_course_foundation_preview_v1')).toBeNull();
  });
});

describe('問題画面（タップ式・§13）', () => {
  it('一問一画面: 進捗バー・選択肢カード・あとで確認が表示され、回答前は次へが出ない', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'rules' }} />);
    await waitFor(() => expect(screen.getByText(t.lab.startQuiz)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.startQuiz));
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy());
    expect(screen.getByText(t.lab.skipQuestion)).toBeTruthy();
    expect(screen.queryByText(t.lab.next)).toBeNull(); // 回答前
    // 選択肢をタップ→確認→解説と次へ
    const q1Choice = screen.getByText('はたらく');
    fireEvent.click(q1Choice);
    fireEvent.click(screen.getByText(t.lab.check));
    await waitFor(() => expect(screen.getByText(t.lab.correct)).toBeTruthy());
    expect(screen.getByText(t.lab.next)).toBeTruthy();
  });
  it('「あとで確認」を選ぶと専用の文言が出て次へ進める（不正解の叱責をしない）', async () => {
    render(<FoundationLabShell t={t} onBack={() => {}} initial={{ section: 'today', unit: 'fu-selfintro-1', step: 'rules' }} />);
    await waitFor(() => expect(screen.getByText(t.lab.startQuiz)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.startQuiz));
    await waitFor(() => expect(screen.getByText(t.lab.skipQuestion)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.skipQuestion));
    await waitFor(() => expect(screen.getByText(t.lab.skippedNote)).toBeTruthy());
    expect(screen.getByText(t.lab.next)).toBeTruthy();
  });
});
