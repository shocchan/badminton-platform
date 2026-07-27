// @vitest-environment jsdom
// 語彙詳細→Decision Console導線バッジ（2E-1.8 §6.2）。未処理なしなら出さない・labPreview領域限定。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import VocabDecisionBadge from './VocabDecisionBadge';
import { DECISION_I18N } from './vocabReviewI18n';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { VOCAB_DECISION_LOCAL_KEY } from '../../../../lib/aiLesson/course/vocabDecisionStore';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());
const td = DECISION_I18N.ja;
const t = aiCourseI18n.ja;

describe('VocabDecisionBadge', () => {
  it('未処理判断がある語（fi-namae）は件数付きで表示・クリックでonOpen', () => {
    const onOpen = vi.fn();
    render(<VocabDecisionBadge t={t} itemId="fi-namae" onOpen={onOpen} />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain(`${td.statuses.pending} 3`);
    expect(btn.textContent).toContain('P0 3');
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalled();
  });
  it('判断事項が無い語（fi-sensei）は何も描画しない', () => {
    const { container } = render(<VocabDecisionBadge t={t} itemId="fi-sensei" onOpen={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
  it('全件判断済みなら表示しない（deferredだけ残ればdeferred表示）', () => {
    const entries: Record<string, unknown> = {};
    for (const id of ['fi-namae:example', 'fi-namae:meaning_zh']) {
      entries[id] = { decisionId: id, status: 'keep_current', updatedAt: 'x', history: [] };
    }
    entries['fi-namae:role'] = { decisionId: 'fi-namae:role', status: 'deferred', updatedAt: 'x', history: [] };
    window.localStorage.setItem(VOCAB_DECISION_LOCAL_KEY, JSON.stringify({ schemaVersion: 3, sourceDatasetVersion: 'phase-2e-1.5', entries }));
    render(<VocabDecisionBadge t={t} itemId="fi-namae" onOpen={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain(`${td.statuses.deferred} 1`);
  });
});
