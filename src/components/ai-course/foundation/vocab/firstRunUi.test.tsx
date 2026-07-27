// @vitest-environment jsdom
// Phase 2E-1.11 §16: 初回Journey UI・Recovery・Error BoundaryのUIテスト。
// 内部用語を学習者へ出さない／第一CTAは一つ／既存進捗を消さない、を担保する。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import FirstRunJourney from './FirstRunJourney';
import { LearnerRecovery, LearnerErrorBoundary } from './LearnerRecovery';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { FIRST_RUN_STORAGE_KEY } from '../../../../lib/aiLesson/course/firstRunJourney';
import { VOCAB_STORAGE_KEY, createVocabProgressRepository } from '../../../../lib/aiLesson/course/vocabProgress';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
const t = aiCourseI18n.ja;
const tv = t.vocab;
const noop = () => {};
const base = { t, onStartCheck: noop, onStartPractice: noop, onHome: noop, onComplete: noop };

// 学習者へ見せてはいけない内部用語（§4の避ける表現）
const INTERNAL_TERMS = ['remedial', 'diagnostic role', 'effectiveSeverity', 'retained_preview',
  'masteryState', 'roleDriven', 'contextual', 'verified', 'day1', 'day3', 'independent'];

describe('初回Journeyの4ステップ（§4-§5・§11）', () => {
  it('Step1: 進捗1/4・目的4択・第一CTAは選択肢のみ（内部用語なし）', () => {
    render(<FirstRunJourney {...base} />);
    expect(screen.getByText(/ステップ 1 \/ 4/)).toBeTruthy();
    expect(screen.getAllByText(tv.frGoalHeading).length).toBeGreaterThanOrEqual(1);
    for (const g of Object.values(tv.frGoals)) expect(screen.getByText(g)).toBeTruthy();
    for (const term of INTERNAL_TERMS) expect(document.body.textContent).not.toContain(term);
  });
  it('目的を選ぶとStep2へ進み、進捗と説明が変わる（試験ではないと明示）', async () => {
    render(<FirstRunJourney {...base} />);
    fireEvent.click(screen.getByText(tv.frGoals.jlpt_n3));
    await waitFor(() => expect(screen.getByText(/ステップ 2 \/ 4/)).toBeTruthy());
    expect(screen.getByText(tv.frCheckNote)).toBeTruthy();
    expect(screen.getByText(tv.frCheckStart)).toBeTruthy();
    const raw = JSON.parse(window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY)!);
    expect(raw.goal).toBe('jlpt_n3');
  });
  it('戻っても選んだ目的は消えない（§5）', async () => {
    render(<FirstRunJourney {...base} />);
    fireEvent.click(screen.getByText(tv.frGoals.work));
    await waitFor(() => expect(screen.getByText(tv.frBack)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.frBack));
    await waitFor(() => expect(screen.getByText(/ステップ 1 \/ 4/)).toBeTruthy());
    expect(JSON.parse(window.sessionStorage.getItem(FIRST_RUN_STORAGE_KEY)!).goal).toBe('work');
  });
  it('Step3の推薦理由は学習者向けの言葉のみ・第一CTAは一つ', async () => {
    render(<FirstRunJourney {...base} />);
    fireEvent.click(screen.getByText(tv.frGoals.daily_conversation));
    await waitFor(() => expect(screen.getByText(tv.frCheckStart)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.frNext));
    await waitFor(() => expect(screen.getByText(tv.frPracticeStart)).toBeTruthy());
    expect(screen.getByText(tv.frReasonDaily)).toBeTruthy();
    for (const term of INTERNAL_TERMS) expect(document.body.textContent).not.toContain(term);
  });
  it('Step4で復習の仕組みを一文で説明し、定着を断定しない', async () => {
    render(<FirstRunJourney {...base} />);
    fireEvent.click(screen.getByText(tv.frGoals.life_in_japan));
    await waitFor(() => screen.getByText(tv.frNext));
    fireEvent.click(screen.getByText(tv.frNext));
    await waitFor(() => screen.getByText(tv.frPracticeStart));
    fireEvent.click(screen.getByText(tv.frPracticeStart));
    await waitFor(() => expect(screen.getByText(tv.frDoneHeading)).toBeTruthy());
    expect(screen.getByText(tv.frReviewExplain)).toBeTruthy();
    expect(document.body.textContent).not.toContain('マスター');
    expect(document.body.textContent).not.toContain('完全習得');
  });
  it('壊れた保存データでは初回設定のやり直しだけを提示（学習記録は消さないと明記）', () => {
    window.sessionStorage.setItem(FIRST_RUN_STORAGE_KEY, '{{{broken');
    render(<FirstRunJourney {...base} />);
    expect(screen.getByText(tv.recCorruptHeading)).toBeTruthy();
    expect(screen.getByText(tv.recCorruptBody)).toBeTruthy();
    // 危険操作を出さない
    expect(document.body.textContent).not.toContain('すべての進捗を削除');
  });
});

describe('Recovery UI（§7・§11）', () => {
  it('問題を読み込めない: 再試行が第一CTA・技術詳細は出さない', () => {
    const onRetry = vi.fn();
    render(<LearnerRecovery t={t} kind="load_fail" onRetry={onRetry} onHome={noop} devDetail="TypeError: x is undefined" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByText(tv.recRetry));
    expect(onRetry).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('TypeError');   // labPreview未指定なら出さない
  });
  it('問題不足: 学習を止めず代替へ進める・補助CTAは最大2つ', () => {
    const onAlt = vi.fn();
    render(<LearnerRecovery t={t} kind="empty_pool" onAlternative={onAlt} onHome={noop} />);
    fireEvent.click(screen.getByText(tv.recEmptyAlt));
    expect(onAlt).toHaveBeenCalled();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeLessThanOrEqual(3);   // 第一CTA + 補助最大2
  });
  it('labPreviewでのみ開発者向け詳細を折りたたみで出す', () => {
    render(<LearnerRecovery t={t} kind="render_error" onHome={noop} devDetail="Error: boom" labPreview />);
    expect(screen.getByText('developer detail')).toBeTruthy();
    expect(screen.getByText('Error: boom')).toBeTruthy();
  });
});

describe('Error Boundary（§8・無限ループ防止）', () => {
  const Boom = () => { throw new Error('render failed'); };
  it('描画エラーを捕まえてホームへ戻れる・再試行は上限付き', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onHome = vi.fn();
    render(<LearnerErrorBoundary t={t} onHome={onHome}><Boom /></LearnerErrorBoundary>);
    expect(screen.getByText(tv.recErrorHeading)).toBeTruthy();
    fireEvent.click(screen.getByText(tv.frGoHome));
    expect(onHome).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('再試行を上限まで使うと再試行ボタンを出さない（無限エラーループを防ぐ）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LearnerErrorBoundary t={t} onHome={noop}><Boom /></LearnerErrorBoundary>);
    for (let i = 0; i < LearnerErrorBoundary.MAX_RETRY; i += 1) {
      const retry = screen.queryByText(tv.recRetry);
      if (retry) fireEvent.click(retry);
    }
    expect(screen.queryByText(tv.recRetry)).toBeNull();
    spy.mockRestore();
  });
});

describe('既存利用者への影響（§3・§12）', () => {
  it('学習履歴がある人には初回案内を出さない', () => {
    const repo = createVocabProgressRepository(window.sessionStorage);
    repo.recordEncounter('fi-sumu');
    render(<VocabularyHub t={t} onBack={noop} />);
    expect(screen.queryByText(tv.frGoalHeading)).toBeNull();
  });
  it('履歴がない人にだけ初回案内が出る・既存の学習進捗キーを壊さない', async () => {
    render(<VocabularyHub t={t} onBack={noop} />);
    await waitFor(() => expect(screen.getByText(tv.frGoalHeading)).toBeTruthy());
    const before = window.sessionStorage.getItem(VOCAB_STORAGE_KEY);
    fireEvent.click(screen.getByText(tv.frNext));
    expect(window.sessionStorage.getItem(VOCAB_STORAGE_KEY)).toBe(before);
  });
});

// Phase 2E-1.15 §3-§6: Step4はクイズ正誤・本人の感じ方・これからの予定を別の軸で見せる。
describe('Step4の結果表示（2E-1.15）', () => {
  const seedDone = (learnerResult: Record<string, unknown> | undefined) => {
    window.sessionStorage.setItem('ai_course_first_run_v1', JSON.stringify({
      schemaVersion: 1, step: 'done', goal: 'daily_conversation', checkDone: true, practiceDone: true,
      completedAt: null, startedAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z',
    }));
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify({
      schemaVersion: 2, journeyId: '2026-07-28T00:00:00.000Z',
      activeTaskType: 'practice', activeTaskId: 'p1', activeTaskStatus: 'completed',
      taskStartedAt: '2026-07-28T00:00:00.000Z', taskCompletedAt: '2026-07-28T00:10:00.000Z',
      returnStep: 'done', completionToken: 'tok', usedTokens: ['tok'], completedTaskIds: ['p1'],
      completionSnapshot: {
        checkedCount: 3, independentCount: 0, supportedCount: 0, needsReviewCount: 0, partial: false,
        learnerResult,
      },
    }));
  };

  it('クイズ誤答＋「覚えたと思う」を「正しく答えられた」に見せない', async () => {
    seedDone({
      checkedCount: 3, correctCount: 0, incorrectCount: 3, notAnsweredCount: 0,
      answeredWithSupportCount: null, feltConfidentCount: 3, feltUnsureCount: 0,
      scheduledForReviewCount: 3, nextReviewDate: '2026-07-29', partial: false,
    });
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.lrChecked(3))).toBeTruthy());
    expect(screen.getByText(`・${tv.lrCorrect(0)}`)).toBeTruthy();
    expect(screen.getByText(`・${tv.lrIncorrect(3)}`)).toBeTruthy();
    // 本人の感じ方は別の見出しの下にある
    expect(screen.getByText(tv.lrFeelHeading)).toBeTruthy();
    expect(screen.getByText(`・${tv.lrConfident(3)}`)).toBeTruthy();
  });

  it('クイズの結果・感じ方・次の予定はそれぞれ別の見出しを持つ', async () => {
    seedDone({
      checkedCount: 2, correctCount: 1, incorrectCount: 1, notAnsweredCount: 0,
      answeredWithSupportCount: null, feltConfidentCount: 1, feltUnsureCount: 1,
      scheduledForReviewCount: 2, nextReviewDate: '2026-07-29', partial: false,
    });
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.lrQuizHeading)).toBeTruthy());
    expect(screen.getByText(tv.lrFeelHeading)).toBeTruthy();
    expect(screen.getByText(tv.lrNextHeading)).toBeTruthy();
    expect(screen.getByText(tv.lrScheduled(2))).toBeTruthy();
  });

  it('復習予定が0件でも「予定なし」と正直に伝える', async () => {
    seedDone({
      checkedCount: 1, correctCount: 1, incorrectCount: 0, notAnsweredCount: 0,
      answeredWithSupportCount: null, feltConfidentCount: 0, feltUnsureCount: 0,
      scheduledForReviewCount: 0, nextReviewDate: null, partial: false,
    });
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.lrNoSchedule)).toBeTruthy());
  });

  it('内部用語を画面に出さない', async () => {
    seedDone({
      checkedCount: 1, correctCount: 0, incorrectCount: 1, notAnsweredCount: 0,
      answeredWithSupportCount: null, feltConfidentCount: 1, feltUnsureCount: 0,
      scheduledForReviewCount: 1, nextReviewDate: '2026-07-29', partial: false,
    });
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.lrQuizHeading)).toBeTruthy());
    ['independent', 'supported', 'needsReview', 'retained', 'mastery', 'snapshot', 'partial snapshot']
      .forEach((w) => expect(document.body.textContent).not.toContain(w));
  });

  it('旧版のsnapshot（学習者向けモデルなし）でも落ちず、確認した数だけ見せる', async () => {
    seedDone(undefined);
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(`・${tv.frResultChecked(3)}`)).toBeTruthy());
  });
});
