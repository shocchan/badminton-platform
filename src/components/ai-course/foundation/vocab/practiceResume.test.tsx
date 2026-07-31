// @vitest-environment jsdom
// Phase 2E-1.14 §3-§4: 練習の再開位置。
// 再読込しても済んだフェーズをやり直させない／未確定の選択は確定扱いにしない、を担保する。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { createJourneyTaskRepository } from '../../../../lib/aiLesson/course/journeyTaskContract';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
const t = aiCourseI18n.ja;
const tv = t.vocab;
const base = { t, onBack: () => {}, labPreview: true };

/** 初回Journeyの「最初の練習」から来た状態を作る */
const startPracticeTask = () => {
  const repo = createJourneyTaskRepository(window.sessionStorage);
  repo.startTask({ journeyId: 'j1', taskType: 'practice', taskId: 'practice-1', returnStep: 'done' });
  return repo;
};

const openDaily = () => {
  render(<VocabularyHub {...base} />);
  fireEvent.click(screen.getByText(tv.dailyCta));
};

/** 再読込に相当（componentのstateは失われ、保存済みの状態だけが残る） */
const reload = () => { cleanup(); render(<VocabularyHub {...base} initial={{ view: 'daily' }} />); };

describe('練習の再開位置', () => {
  it('card完了までは進行位置が保存される', () => {
    const repo = startPracticeTask();
    openDaily();
    expect(repo.get()?.taskProgress).toBeUndefined();
    fireEvent.click(screen.getByText(tv.detailCheck));
    expect(repo.get()?.taskProgress).toEqual({ wordIndex: 0, phase: 'quiz', completedWordIds: [], totalWords: 3 });
  });

  it('選択しただけで確定していない回答は保存しない（再読込で正解扱いにしない）', () => {
    const repo = startPracticeTask();
    openDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));
    const before = JSON.stringify(repo.get()?.taskProgress);
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);   // 選ぶだけ
    expect(JSON.stringify(repo.get()?.taskProgress)).toBe(before);
  });

  it('再読込すると保存済みのフェーズから再開する（cardをやり直させない）', () => {
    startPracticeTask();
    openDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));   // card → quiz
    reload();
    // quizの画面（確定ボタン）が出ていて、cardの「確認する」ではない
    expect(screen.queryByText(t.lab.check)).toBeTruthy();
  });

  it('2語目へ進んだあと再読込しても1語目に戻らない', () => {
    startPracticeTask();
    openDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);
    fireEvent.click(screen.getByText(t.lab.check));
    fireEvent.click(screen.getByText(t.lab.next));
    fireEvent.click(screen.getByText(tv.selfKnownBtn));
    fireEvent.click(screen.getByText(tv.nextWord));
    reload();
    expect(screen.getByText(tv.dailyStep(2, 3))).toBeTruthy();
  });

  it('契約が無いとき（通常の復習として開いたとき）も落ちずに先頭から始まる', () => {
    openDaily();
    expect(screen.getByText(tv.dailyStep(1, 3))).toBeTruthy();
  });

  it('完了済みの契約では進行位置を書き換えない', () => {
    const repo = startPracticeTask();
    const c = repo.get()!;
    repo.completeTask({
      journeyId: 'j1', taskId: 'practice-1', token: c.completionToken,
      snapshot: { checkedCount: 3, independentCount: 3, supportedCount: 0, needsReviewCount: 0, partial: false },
    });
    const before = repo.get()?.taskProgress;
    openDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));
    expect(repo.get()?.taskProgress).toEqual(before);
  });
});

// 診断の再開（§4 Journey C）: 途中で再読込しても同じ問題を続けられること。
describe('診断の再開位置', () => {
  const startDiagnosticTask = () => {
    const repo = createJourneyTaskRepository(window.sessionStorage);
    repo.startTask({ journeyId: 'j1', taskType: 'diagnostic', taskId: 'diag-1', returnStep: 'practice' });
    return repo;
  };
  const openDiagnostic = () => render(<VocabularyHub {...base} initial={{ view: 'diagnostic' }} />);
  const answerOne = () => {
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);
    fireEvent.click(screen.getByText(t.lab.check));
  };

  it('回答を確定すると、その時点の出題セットと位置が保存される', () => {
    const repo = startDiagnosticTask();
    openDiagnostic();
    expect(repo.get()?.taskProgress?.diagnostic).toBeUndefined();
    answerOne();
    const d = repo.get()?.taskProgress?.diagnostic;
    expect(d?.index).toBe(1);
    expect((d?.questions.length ?? 0)).toBeGreaterThan(1);
  });

  it('選んだだけでは保存しない（再読込で確定扱いにしない）', () => {
    const repo = startDiagnosticTask();
    openDiagnostic();
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);
    expect(repo.get()?.taskProgress?.diagnostic).toBeUndefined();
  });

  it('再読込しても同じ出題セットの続きから再開する', () => {
    const repo = startDiagnosticTask();
    openDiagnostic();
    answerOne();
    fireEvent.click(screen.getByText(t.lab.next));
    const saved = repo.get()!.taskProgress!.diagnostic!;
    cleanup();
    openDiagnostic();
    const after = repo.get()!.taskProgress!.diagnostic!;
    // 保存済みのセットがそのまま使われる（作り直して別の問題にならない）
    expect(after.questions.map((q) => q.itemId)).toEqual(saved.questions.map((q) => q.itemId));
    expect(screen.getByText(`${saved.index + 1} / ${saved.questions.length}`)).toBeTruthy();
  });

  it('契約が完了していれば保存済みセットを使わず新しい診断を始める', () => {
    const repo = startDiagnosticTask();
    openDiagnostic();
    answerOne();
    const c = repo.get()!;
    repo.completeTask({
      journeyId: 'j1', taskId: 'diag-1', token: c.completionToken,
      snapshot: { checkedCount: 1, independentCount: 1, supportedCount: 0, needsReviewCount: 0, partial: false },
    });
    cleanup();
    openDiagnostic();
    expect(screen.getByText(/^1 \/ \d+$/)).toBeTruthy();
  });
});
