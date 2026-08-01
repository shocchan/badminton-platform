// @vitest-environment jsdom
// 監査コンソールが「実際の問題バンクを読み込んで描画できる」ことを、
// mockデータではなく**本物の教材**を通して確認する。
//
// ここで確認しないこと: 管理者ログインそのもの（Supabase側の責務）。
// 管理者でない場合に中身を出さないことは確認する。
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isCourseAdmin = vi.fn();
vi.mock('../../lib/aiLesson/course/courseAuth', () => ({ isCourseAdmin: () => isCourseAdmin() }));

import QuestionBankConsole from './QuestionBankConsole';

const loaded = () =>
  waitFor(() => expect(screen.getByText(/問題バンク監査コンソール/)).toBeTruthy(), { timeout: 120_000 });

describe('問題バンク監査コンソール', () => {
  beforeEach(() => { isCourseAdmin.mockReset(); });
  afterEach(() => { cleanup(); });

  it('管理者でなければ中身を出さない', async () => {
    isCourseAdmin.mockResolvedValue(false);
    render(<QuestionBankConsole />);
    await waitFor(() => expect(screen.getByText(/管理者専用です/)).toBeTruthy());
    expect(screen.queryByText(/問題バンク監査コンソール/)).toBeNull();
  });

  it('権限取得に失敗したときも中身を出さない（fail closed）', async () => {
    isCourseAdmin.mockRejectedValue(new Error('network'));
    render(<QuestionBankConsole />);
    await waitFor(() => expect(screen.getByText(/管理者専用です/)).toBeTruthy());
  });

  it('本物の問題バンクを読み込み、一意件数と一覧を描画する', async () => {
    isCourseAdmin.mockResolvedValue(true);
    render(<QuestionBankConsole />);
    await loaded();

    // 件数は「合計」ではなく questionId 基準の一意件数
    const head = screen.getByText(/全 [\d,]+ 問（questionId基準の一意件数）/).textContent ?? '';
    const total = Number((head.match(/全 ([\d,]+) 問/)?.[1] ?? '0').replace(/,/g, ''));
    expect(total).toBeGreaterThan(10_000);

    // 1ページ目が既定の50件（見出し行を除く）
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(50);
  }, 180_000);

  it('検索・フィルタ・ページサイズ・詳細展開が動く', async () => {
    isCourseAdmin.mockResolvedValue(true);
    render(<QuestionBankConsole />);
    await loaded();
    const count = () => Number((screen.getByText(/件 \//).textContent?.match(/([\d,]+) 件/)?.[1] ?? '0').replace(/,/g, ''));
    const all = count();

    // 警告ありのみ → 減る
    fireEvent.click(screen.getByLabelText(/警告ありのみ/));
    const warned = count();
    expect(warned).toBeGreaterThan(0);
    expect(warned).toBeLessThan(all);
    fireEvent.click(screen.getByLabelText(/警告ありのみ/));

    // 正解位置フィルタ: 1〜4 の合計が全体に一致する（取りこぼしが無い）
    const posSel = screen.getByLabelText(/正解位置/);
    let sum = 0;
    for (const p of ['1', '2', '3', '4']) {
      fireEvent.change(posSel, { target: { value: p } });
      sum += count();
    }
    expect(sum).toBe(all);
    fireEvent.change(posSel, { target: { value: 'all' } });

    // 単元バンクだけに絞れる
    fireEvent.change(screen.getByLabelText(/バンク/), { target: { value: 'unit-grammar' } });
    expect(count()).toBeGreaterThan(0);
    expect(count()).toBeLessThan(all);
    fireEvent.change(screen.getByLabelText(/バンク/), { target: { value: 'all' } });

    // ページサイズ
    fireEvent.change(screen.getByLabelText(/1ページ/), { target: { value: '200' } });
    expect(document.querySelectorAll('tbody tr').length).toBe(200);
    fireEvent.change(screen.getByLabelText(/1ページ/), { target: { value: '50' } });

    // ランダム100問
    fireEvent.click(screen.getByRole('button', { name: 'ランダム100問を抽出' }));
    expect(count()).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: '抽出を解除' }));
    expect(count()).toBe(all);

    // キーワード検索
    fireEvent.change(screen.getByLabelText(/キーワード/), { target: { value: '勉強' } });
    expect(count()).toBeGreaterThan(0);
    expect(count()).toBeLessThan(all);
    fireEvent.change(screen.getByLabelText(/キーワード/), { target: { value: '' } });

    // 詳細展開: 選択肢と出所が出る
    const firstId = document.querySelector('tbody button')?.textContent ?? '';
    fireEvent.click(document.querySelector('tbody button') as HTMLElement);
    await waitFor(() => expect(screen.getByText(/source file:/)).toBeTruthy());
    expect(screen.getByText(/（正解）/)).toBeTruthy();
    expect(firstId.length).toBeGreaterThan(0);
  }, 180_000);

  it('読み取り専用（入力欄はフィルタだけで、教材を書き換える導線が無い）', async () => {
    isCourseAdmin.mockResolvedValue(true);
    render(<QuestionBankConsole />);
    await loaded();
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent ?? '');
    for (const forbidden of ['保存', '更新', '削除', '承認', '昇格', '編集']) {
      expect(labels.some((l) => l.includes(forbidden))).toBe(false);
    }
    // 人間レビュー欄は列だけ用意し、値は未記録のまま
    fireEvent.click(document.querySelector('tbody button') as HTMLElement);
    await waitFor(() => expect(screen.getByText(/人間レビュー:/)).toBeTruthy());
    const dl = screen.getByText(/人間レビュー:/).closest('div') as HTMLElement;
    expect(within(dl).getByText(/未記録/)).toBeTruthy();
  }, 180_000);
});
