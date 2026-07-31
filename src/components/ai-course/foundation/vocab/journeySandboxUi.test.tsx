// @vitest-environment jsdom
// Phase 2E-1.14 §7: 検証用サンドボックスの学習者向け入口。
// 最大の目的は「検証のために通常の学習記録を退避・削除しなくてよくする」こと（R9の教訓）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import {
  JOURNEY_SANDBOX_KEY, isJourneySandboxActive, LEARNER_PROGRESS_KEYS,
} from '../../../../lib/aiLesson/course/courseStorageRegistry';
import { VOCAB_STORAGE_KEY } from '../../../../lib/aiLesson/course/vocabProgress';
import { FIRST_RUN_STORAGE_KEY } from '../../../../lib/aiLesson/course/firstRunJourney';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
const t = aiCourseI18n.ja;
const tv = t.vocab;
const base = { t, onBack: () => {}, labPreview: true };

/** 通常側に「学習済みの記録」を作る（検証で失われてはいけないもの） */
const seedNormalProgress = () => {
  window.sessionStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify({
    schemaVersion: 2, entries: { 'fi-sumu': { itemId: 'fi-sumu', selfAssessment: 'self_known', tests: [] } },
  }));
  window.sessionStorage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1, step: 'done', goal: 'daily_conversation',
    checkDone: true, practiceDone: true, completedAt: '2026-07-01T00:00:00.000Z',
    startedAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }));
};

const startSandbox = () => {
  render(<VocabularyHub {...base} />);
  fireEvent.click(screen.getByText(tv.sandboxEntry));
};

describe('サンドボックス入口', () => {
  it('開始しても通常の学習記録とJourney状態を一切書き換えない', () => {
    seedNormalProgress();
    // 通常表示のマウントで走る正規化を先に済ませ、その後の値を基準にする
    render(<VocabularyHub {...base} />);
    const beforeProgress = window.sessionStorage.getItem(VOCAB_STORAGE_KEY);
    const beforeJourney = window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY);
    fireEvent.click(screen.getByText(tv.sandboxEntry));
    expect(window.sessionStorage.getItem(VOCAB_STORAGE_KEY)).toBe(beforeProgress);
    expect(window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY)).toBe(beforeJourney);
    expect(isJourneySandboxActive(window.sessionStorage)).toBe(true);
  });

  it('動作中は検証モードであることを常に表示する', async () => {
    startSandbox();
    await waitFor(() => expect(screen.getByText(tv.sandboxBanner)).toBeTruthy());
  });

  it('sandbox内の操作は sandbox キーの中だけに書かれる', async () => {
    seedNormalProgress();
    startSandbox();
    await waitFor(() => expect(screen.getAllByText(tv.frGoalHeading).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(tv.frGoals.jlpt_n3));
    const box = JSON.parse(window.sessionStorage.getItem(JOURNEY_SANDBOX_KEY) ?? '{}');
    expect(Object.keys(box)).toContain(FIRST_RUN_STORAGE_KEY);
    // 通常側のJourneyは完了のまま（sandboxの目的選択に引きずられない）
    const normal = JSON.parse(window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY) ?? '{}');
    expect(normal.goal).toBe('daily_conversation');
    expect(normal.completedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('終了すると sandbox キーだけが消え、学習進捗キーは残る', async () => {
    seedNormalProgress();
    startSandbox();
    await waitFor(() => expect(screen.getByText(tv.sandboxBanner)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.sandboxEnd));
    expect(window.sessionStorage.getItem(JOURNEY_SANDBOX_KEY)).toBeNull();
    LEARNER_PROGRESS_KEYS.forEach((k) => {
      if (k === VOCAB_STORAGE_KEY) expect(window.sessionStorage.getItem(k)).not.toBeNull();
    });
    expect(window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY)).not.toBeNull();
  });

  it('検証モードでないときは案内バナーを出さない', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.queryByText(tv.sandboxBanner)).toBeNull();
  });

  it('再読込に相当する再マウントでも検証モードが続く（キーの存在で判定する）', async () => {
    startSandbox();
    cleanup();
    render(<VocabularyHub {...base} />);
    await waitFor(() => expect(screen.getByText(tv.sandboxBanner)).toBeTruthy());
  });
});
