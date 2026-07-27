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

// Phase 2E-1.15 §7-§8: 保存データの版が食い違うときのRecovery。
describe('保存データの版が食い違うとき（2E-1.15）', () => {
  const seedJourney = () => window.sessionStorage.setItem('ai_course_first_run_v1', JSON.stringify({
    schemaVersion: 1, step: 'practice', goal: 'daily_conversation', checkDone: true, practiceDone: false,
    completedAt: null, startedAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z',
  }));
  const seedProgress = () => window.sessionStorage.setItem('ai_course_vocab_preview_v1', JSON.stringify({
    schemaVersion: 2, entries: { 'fi-sumu': { itemId: 'fi-sumu', selfAssessment: 'self_known', tests: [] } },
  }));

  it('保存データの方が新しい場合は上書きせず、読み直しを案内する', async () => {
    seedJourney(); seedProgress();
    const before = window.sessionStorage.getItem('ai_course_journey_task_v1');
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify({
      schemaVersion: 99, journeyId: 'j', activeTaskId: 't', activeTaskStatus: 'in_progress',
    }));
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.recNewerHeading)).toBeTruthy());
    // 保存状態を書き換えていない
    expect(JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!).schemaVersion).toBe(99);
    expect(before).toBeNull();
    // 学習記録は無傷
    expect(window.sessionStorage.getItem('ai_course_vocab_preview_v1')).not.toBeNull();
  });

  it('読めない保存データでは自動で完了扱いにせず、初回だけやり直せる', async () => {
    seedJourney(); seedProgress();
    window.sessionStorage.setItem('ai_course_journey_task_v1', '{壊れたJSON');
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.recUnreadableHeading)).toBeTruthy());
    // 第一CTAは「この初回学習を最初から始める」（2E-1.16 §7）
    expect(screen.getByText(tv.recUnreadableCta)).toBeTruthy();
    // 学習記録と復習予定は消さない
    expect(window.sessionStorage.getItem('ai_course_vocab_preview_v1')).not.toBeNull();
  });

  it('Recovery画面に技術用語を出さない', async () => {
    seedJourney();
    window.sessionStorage.setItem('ai_course_journey_task_v1', '{"schemaVersion":0,"journeyId":"j","activeTaskId":"t","activeTaskStatus":"in_progress"}');
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.recUnreadableHeading)).toBeTruthy());
    ['schema', 'token', 'contract', 'localStorage', 'incompatible', 'hydration']
      .forEach((w) => expect(document.body.textContent).not.toContain(w));
  });

  it('古いが移行できる版はRecoveryを出さず、そのまま学習を続けられる', async () => {
    seedJourney();
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify({
      schemaVersion: 1, journeyId: 'j', activeTaskId: 't', activeTaskStatus: 'in_progress',
      activeTaskType: 'practice', taskStartedAt: 'x', taskCompletedAt: null, returnStep: 'done',
      completionToken: 'tok', usedTokens: [], completedTaskIds: [], completionSnapshot: null,
    }));
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getAllByText(tv.frPracticeHeading).length).toBeGreaterThan(0));
    expect(screen.queryByText(tv.recUnreadableHeading)).toBeNull();
    expect(screen.queryByText(tv.recNewerHeading)).toBeNull();
  });
});

// Phase 2E-1.15 §10: 部分成功Recovery（契約completed・stepが前）。
describe('部分成功Recovery（2E-1.15 E2）', () => {
  it('契約は完了しているのにstepが前なら、その場でStep4を表示する', async () => {
    window.sessionStorage.setItem('ai_course_first_run_v1', JSON.stringify({
      schemaVersion: 1, step: 'practice', goal: 'daily_conversation', checkDone: true, practiceDone: true,
      completedAt: null, startedAt: '2026-07-28T05:00:00.000Z', updatedAt: '2026-07-28T05:00:00.000Z',
    }));
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify({
      schemaVersion: 2, journeyId: '2026-07-28T05:00:00.000Z',
      activeTaskType: 'practice', activeTaskId: 'p-e2', activeTaskStatus: 'completed',
      taskStartedAt: 'x', taskCompletedAt: 'y', returnStep: 'done',
      completionToken: 'tok-e2', usedTokens: ['tok-e2'], completedTaskIds: ['p-e2'],
      completionSnapshot: {
        checkedCount: 3, independentCount: 0, supportedCount: 0, needsReviewCount: 0, partial: false,
        learnerResult: {
          checkedCount: 3, correctCount: 2, incorrectCount: 1, notAnsweredCount: 0,
          answeredWithSupportCount: null, feltConfidentCount: 2, feltUnsureCount: 1,
          scheduledForReviewCount: 3, nextReviewDate: '2026-07-29', partial: false,
        },
      },
    }));
    render(<FirstRunJourney {...base} />);
    // 1回目のrenderでStep4が見える（保存だけして画面が前のまま、にならない）
    await waitFor(() => expect(screen.getByText(tv.frDoneHeading)).toBeTruthy());
    expect(screen.getByText(tv.lrChecked(3))).toBeTruthy();
    // tokenとcompletedTaskIdsは触らない
    const c = JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!);
    expect(c.usedTokens).toEqual(['tok-e2']);
    expect(c.completedTaskIds).toEqual(['p-e2']);
    // Journeyのstepだけが修復されている
    expect(JSON.parse(window.sessionStorage.getItem('ai_course_first_run_v1')!).step).toBe('done');
  });
});

// Phase 2E-1.16 §3-§4: 練習は終わったのに契約が未完了、からの復帰。
describe('contract_pending Recovery（2E-1.16 E1）', () => {
  const WORDS = ['fi-namae', 'fi-shusshin', 'fi-chugoku'];
  const seedPending = () => {
    window.sessionStorage.setItem('ai_course_first_run_v1', JSON.stringify({
      schemaVersion: 1, step: 'done', goal: 'daily_conversation', checkDone: true, practiceDone: true,
      completedAt: null, startedAt: '2026-07-28T05:00:00.000Z', updatedAt: '2026-07-28T05:00:00.000Z',
    }));
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify({
      schemaVersion: 2, journeyId: '2026-07-28T05:00:00.000Z',
      activeTaskType: 'practice', activeTaskId: 'p-e1', activeTaskStatus: 'in_progress',
      taskStartedAt: 'x', taskCompletedAt: null, returnStep: 'done',
      completionToken: 'tok-e1', usedTokens: [], completedTaskIds: [], completionSnapshot: null,
      taskProgress: { wordIndex: 3, phase: 'assess', completedWordIds: WORDS, totalWords: 3 },
    }));
    // 練習の結果と復習予定は保存済み
    window.sessionStorage.setItem('ai_course_vocab_preview_v1', JSON.stringify({
      schemaVersion: 2,
      entries: Object.fromEntries(WORDS.map((id, i) => [id, {
        itemId: id, selfAssessment: i === 2 ? 'needs_review' : 'self_known',
        imageViewed: true, firstSeenAt: null, lastSeenAt: null, encounterCount: 1,
        tests: [{ dimension: 'meaning', correct: i !== 1, attemptedAt: '2026-07-28T05:00:00.000Z' }],
      }])),
    }));
    window.sessionStorage.setItem('ai_course_vocab_schedule_preview_v1', JSON.stringify({
      schemaVersion: 1,
      entries: Object.fromEntries(WORDS.map((id) => [id, {
        itemId: id, weakDimensions: [], lastAttemptAt: '2026-07-28T05:00:00.000Z',
        lastAttemptDay: '2026-07-28', nextReviewAt: '2026-07-29', reviewStage: 'day1',
        consecutiveIndependent: 0, lastResult: 'wrong', source: 'daily',
        updatedAt: '2026-07-28T05:00:00.000Z',
      }])),
    }));
  };
  const scheduleCount = () =>
    Object.keys(JSON.parse(window.sessionStorage.getItem('ai_course_vocab_schedule_preview_v1')!).entries).length;

  it('練習が終わっていれば「結果画面へ進む」を出す（学習はやり直させない）', async () => {
    seedPending();
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.cpHeading)).toBeTruthy());
    expect(screen.getByText(tv.cpCta)).toBeTruthy();
    // 練習の再開を促すカードは出さない
    expect(screen.queryByText(tv.frResumePractice)).toBeNull();
  });

  it('進むと契約だけ完了し、復習予定は増えない', async () => {
    seedPending();
    const before = scheduleCount();
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.cpCta)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.cpCta));
    const c = JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!);
    expect(c.activeTaskStatus).toBe('completed');
    expect(c.completedTaskIds).toEqual(['p-e1']);
    expect(c.usedTokens).toEqual(['tok-e1']);
    expect(scheduleCount()).toBe(before);
  });

  it('結果は保存済みの回答から作られ、実際の内訳と一致する', async () => {
    seedPending();
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.cpCta)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.cpCta));
    const c = JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!);
    const r = c.completionSnapshot.learnerResult;
    expect(r.checkedCount).toBe(3);
    expect(r.correctCount).toBe(2);      // 2語正解・1語誤答
    expect(r.incorrectCount).toBe(1);
    expect(r.feltUnsureCount).toBe(1);   // 1語だけ「まだ不安」
    expect(r.answeredWithSupportCount).toBeNull();
  });

  it('二度押しても completedTaskIds も token も増えない', async () => {
    seedPending();
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.cpCta)).toBeTruthy());
    fireEvent.click(screen.getByText(tv.cpCta));
    const after = JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!);
    expect(after.completedTaskIds).toHaveLength(1);
    expect(after.usedTokens).toHaveLength(1);
  });

  it('練習が途中なら（総数に達していなければ）この復帰は出さない', async () => {
    seedPending();
    const c = JSON.parse(window.sessionStorage.getItem('ai_course_journey_task_v1')!);
    c.taskProgress.completedWordIds = ['fi-namae'];
    c.taskProgress.wordIndex = 1;
    window.sessionStorage.setItem('ai_course_journey_task_v1', JSON.stringify(c));
    render(<FirstRunJourney {...base} />);
    await waitFor(() => expect(screen.getByText(tv.frDoneHeading)).toBeTruthy());
    expect(screen.queryByText(tv.cpHeading)).toBeNull();
  });
});
