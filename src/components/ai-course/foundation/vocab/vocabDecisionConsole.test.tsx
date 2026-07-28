// @vitest-environment jsdom
// Decision Console UIテスト（Phase 2E-1.7 §8・§16）。
// 判断ドラフト保存は正式承認ではない（バナー明示・教材review状態は不変・2段階確定）。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import VocabDecisionConsole from './VocabDecisionConsole';
import { DECISION_I18N } from './vocabReviewI18n';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { VOCAB_DECISION_LOCAL_KEY } from '../../../../lib/aiLesson/course/vocabDecisionStore';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
const td = DECISION_I18N.ja;
const base = { t: aiCourseI18n.ja, onBack: () => {} };

describe('Decision Console（labPreview限定・ローカル判断ドラフト）', () => {
  it('バナー（教材未反映・正式承認ではない）と語数/判断事項数の分離表示', () => {
    render(<VocabDecisionConsole {...base} />);
    expect(screen.getByText(td.banner)).toBeTruthy();
    expect(screen.getByText(/対象語数 \d+・判断事項数 \d+/)).toBeTruthy();
    // P0（語継承）のfi-namae:roleが先頭に見える（example/meaning_zhはCEO判断でキュー外・2026-07-28）
    expect(screen.getAllByText('名前').length).toBeGreaterThanOrEqual(1);
  });
  it('詳細→状態選択→保存の2段階でlocalStorage v3へ保存（即確定しない・教材はdraftのまま）', async () => {
    render(<VocabDecisionConsole {...base} />);
    fireEvent.click(screen.getAllByText(td.detailOpen)[0]);   // fi-namae:role（現在の先頭P0）
    const saveBtn = screen.getByText(td.save).closest('button')!;
    expect(saveBtn.getAttribute('aria-disabled')).toBe('true');   // 選択前は確定できない
    fireEvent.click(saveBtn);
    expect(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)).toBeNull();
    fireEvent.click(screen.getByLabelText(td.statuses.needs_context));
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)!);
      expect(raw.schemaVersion).toBe(3);
      expect(raw.entries['fi-namae:role'].status).toBe('needs_context');
    });
    expect(screen.getAllByText(td.saved).length).toBeGreaterThanOrEqual(1);   // aria-live通知
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
  });
  it('reopenで未判断へ戻せる・フィルターでP0のみに絞れる', async () => {
    render(<VocabDecisionConsole {...base} />);
    fireEvent.click(screen.getAllByText(td.detailOpen)[0]);
    fireEvent.click(screen.getByLabelText(td.statuses.keep_current));
    fireEvent.click(screen.getByText(td.save));
    await waitFor(() => expect(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)).toBeTruthy());
    fireEvent.click(screen.getByText(td.reopen));
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)!);
      expect(raw.entries['fi-namae:role'].status).toBe('pending');
      expect(raw.entries['fi-namae:role'].history.length).toBe(2);
    });
    // P0フィルター: 残るP0はfi-namae:roleの1件だけ（example/meaning_zhはCEO判断済み）
    fireEvent.change(screen.getByLabelText(td.filterPriority), { target: { value: 'P0' } });
    await waitFor(() => {
      expect(screen.getAllByText(td.detailOpen).length).toBe(1);
      expect(screen.queryAllByText('P2').length).toBe(0);
    });
  });
  it('不正JSONインポートはエラー表示のみで何も変更しない', async () => {
    render(<VocabDecisionConsole {...base} />);
    fireEvent.change(screen.getByLabelText(new RegExp(td.importPlaceholder)), { target: { value: '{{{broken' } });
    fireEvent.click(screen.getByText(td.importBtn));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('JSON'));
    expect(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)).toBeNull();
  });
  it('2E-1.8: バナーは主メッセージ＋展開可能な補足（安全文言は維持）・priority由来の凡例表示', () => {
    render(<VocabDecisionConsole {...base} />);
    expect(screen.getByText(td.banner)).toBeTruthy();
    expect(screen.getByText(td.bannerMore)).toBeTruthy();
    expect(screen.getByText(td.banner2)).toBeTruthy();   // details内にDOMとして存在
    expect(screen.getByText(/priority内訳: 独立 \d+・語から継承 \d+/)).toBeTruthy();
  });
  it('2E-1.8: 詳細に監査情報（由来）が折りたたみで出る・継承P0は†付き表示', () => {
    render(<VocabDecisionConsole {...base} />);
    fireEvent.click(screen.getAllByText(td.detailOpen)[0]);   // fi-namae:role（語のP0を継承）
    expect(screen.getByText(td.provenanceHeading)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(td.prioInherited)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('P0†').length).toBeGreaterThanOrEqual(1);
  });
  it('2E-1.8: 語彙詳細を見るボタンがonOpenItemを呼ぶ・roleの意味説明はrole判断のみ', () => {
    const onOpenItem = vi.fn();
    render(<VocabDecisionConsole {...base} onOpenItem={onOpenItem} />);
    fireEvent.click(screen.getAllByText(td.detailOpen)[1]);   // 2件目（meaning_zh系・roleではない）
    expect(screen.queryByText(td.roleHelpHeading)).toBeNull();
    // role判断（先頭のfi-namae:role）を開くと定義説明が出る
    fireEvent.click(screen.getAllByText(td.detailOpen)[0]);
    expect(screen.getByText(td.roleHelpHeading)).toBeTruthy();
    fireEvent.click(screen.getByText(td.openWord));
    expect(onOpenItem).toHaveBeenCalledWith('fi-namae');
  });
  it('2E-1.8: フィルター文脈がsessionStorageへ保存され再マウントで復元される（§6.3）', async () => {
    const { unmount } = render(<VocabDecisionConsole {...base} />);
    fireEvent.change(screen.getByLabelText(td.filterPriority), { target: { value: 'P0' } });
    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem('ai_course_decision_console_ui_v1')!).prio).toBe('P0'));
    unmount();
    render(<VocabDecisionConsole {...base} />);
    await waitFor(() => expect(screen.getAllByText(td.detailOpen).length).toBe(1));   // P0フィルター維持（P0はrole 1件）
  });
  it('2E-1.8: 判断後に教材値が変わるとstale警告が行に出る（自動確定・削除しない）', async () => {
    // 直接localStorageへ「古いsnapshot付きドラフト」を注入して描画
    window.localStorage.setItem(VOCAB_DECISION_LOCAL_KEY, JSON.stringify({
      schemaVersion: 3, sourceDatasetVersion: 'phase-2e-1.5',
      entries: { 'fi-namae:role': {
        decisionId: 'fi-namae:role', status: 'keep_current', updatedAt: 'x',
        history: [{ status: 'keep_current', at: 'x' }],
        snapshotCurrentValueJa: '（旧い値）', snapshotProposedValueJa: '（旧い提案）', datasetVersion: 'phase-2e-1.5',
      } },
    }));
    render(<VocabDecisionConsole {...base} />);
    expect(screen.getAllByText(td.freshness.stale).length).toBeGreaterThanOrEqual(1);
    // ドラフト自体は消えない
    const raw = JSON.parse(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)!);
    expect(raw.entries['fi-namae:role'].status).toBe('keep_current');
  });
});
