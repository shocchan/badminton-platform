// @vitest-environment jsdom
// Decision Console UIテスト（Phase 2E-1.7 §8・§16）。
// 判断ドラフト保存は正式承認ではない（バナー明示・教材review状態は不変・2段階確定）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import VocabDecisionConsole from './VocabDecisionConsole';
import { DECISION_I18N } from './vocabReviewI18n';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { VOCAB_DECISION_LOCAL_KEY } from '../../../../lib/aiLesson/course/vocabDecisionStore';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());
const td = DECISION_I18N.ja;
const base = { t: aiCourseI18n.ja, onBack: () => {} };

describe('Decision Console（labPreview限定・ローカル判断ドラフト）', () => {
  it('バナー（教材未反映・正式承認ではない）と語数/判断事項数の分離表示', () => {
    render(<VocabDecisionConsole {...base} />);
    expect(screen.getByText(td.banner)).toBeTruthy();
    expect(screen.getByText(/対象語数 \d+・判断事項数 \d+/)).toBeTruthy();
    // P0のfi-namae（例文判断）が先頭に見える
    expect(screen.getAllByText('名前').length).toBeGreaterThanOrEqual(1);
  });
  it('詳細→状態選択→保存の2段階でlocalStorage v3へ保存（即確定しない・教材はdraftのまま）', async () => {
    render(<VocabDecisionConsole {...base} />);
    fireEvent.click(screen.getAllByText(td.detailOpen)[0]);   // fi-namae:example
    const saveBtn = screen.getByText(td.save).closest('button')!;
    expect(saveBtn.getAttribute('aria-disabled')).toBe('true');   // 選択前は確定できない
    fireEvent.click(saveBtn);
    expect(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)).toBeNull();
    fireEvent.click(screen.getByLabelText(td.statuses.needs_context));
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem(VOCAB_DECISION_LOCAL_KEY)!);
      expect(raw.schemaVersion).toBe(3);
      expect(raw.entries['fi-namae:example'].status).toBe('needs_context');
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
      expect(raw.entries['fi-namae:example'].status).toBe('pending');
      expect(raw.entries['fi-namae:example'].history.length).toBe(2);
    });
    // P0フィルター: fi-namaeの判断事項（例文・中国語訳・role）だけになる（語単位で潰さない）
    fireEvent.change(screen.getByLabelText(td.filterPriority), { target: { value: 'P0' } });
    await waitFor(() => {
      expect(screen.getAllByText(td.detailOpen).length).toBe(3);
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
});
