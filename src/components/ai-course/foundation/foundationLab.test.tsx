// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { FoundationLabShell } from './FoundationLabShell';
import { aiCourseI18n } from '../../../locales/aiCourse';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });

const t = aiCourseI18n.ja;

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
