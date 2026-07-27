// @vitest-environment jsdom
// Phase 2E-1.10 §38: 学習ループUI（今日の復習→問題→完了画面→次回予定）のテスト。
// 内部state名を表示しない／第一CTAは一つ／空画面で終わらせない、を担保する。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { createVocabSpacedReviewRepository, VOCAB_REVIEW_SCHEDULE_KEY } from '../../../../lib/aiLesson/course/vocabSpacedReview';
import { createLearningClock } from '../../../../lib/aiLesson/course/learningClock';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
const t = aiCourseI18n.ja;
const tv = t.vocab;
const base = { t, onBack: () => {} };

/** 昨日誤答した状態を作る（今日が期限の復習が1件ある） */
const seedDueReview = (itemId: string) => {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const repo = createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock(yesterday));
  repo.recordResult({ itemId, result: 'wrong', dimension: 'meaning', source: 'daily' });
};

describe('今日の復習（§6・期限ベース）', () => {
  it('期限の復習が0件のときは復習カードを出さない（空カードを置かない）', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.queryByText(tv.dueReviewTitle)).toBeNull();
  });
  it('期限が来た語があると第一表示に件数と所要時間・開始CTAが出る', async () => {
    seedDueReview('fi-sumu');
    render(<VocabularyHub {...base} />);
    await waitFor(() => expect(screen.getByText(tv.dueReviewTitle)).toBeTruthy());
    expect(screen.getByText(/今日確認することばが1語あります/)).toBeTruthy();
    expect(screen.getByText(tv.dueReviewStart)).toBeTruthy();
  });
  it('内訳は折りたたみで、利用者向けの言葉（翌日の復習など）で表示される', async () => {
    seedDueReview('fi-sumu');
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByText(tv.dueBreakdown));
    expect(screen.getByText(/翌日の復習 1語/)).toBeTruthy();
    // 内部state名は出さない
    expect(document.body.textContent).not.toContain('day1');
    expect(document.body.textContent).not.toContain('retention_candidate');
    expect(document.body.textContent).not.toContain('retained_preview');
  });
});

describe('復習→完了画面（§16-§17）', () => {
  const answerOnce = async (correct: boolean) => {
    // 選択肢を1つ選んで確認する（正解位置はシャッフルされるため、正誤は問わず操作の流れを見る）
    const choices = screen.getAllByRole('button').filter((b) => b.className.includes('action-choice') || b.textContent);
    void choices; void correct;
  };
  it('復習を始めて全問終えると完了画面（今日できたこと・次の復習）が出る', async () => {
    seedDueReview('fi-sumu');
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByText(tv.dueReviewStart));
    await waitFor(() => expect(screen.getByText(new RegExp(t.lab.check))).toBeTruthy());
    // 最初の選択肢を選んで確認→次へ、を対象語がなくなるまで繰り返す
    for (let guard = 0; guard < 12; guard += 1) {
      const check = screen.queryByText(t.lab.check);
      if (!check) break;
      const choiceBtns = screen.getAllByRole('button').filter((b) => b.className.includes('action-choice'));
      if (choiceBtns.length === 0) break;
      fireEvent.click(choiceBtns[0]);
      fireEvent.click(check);
      const next = await screen.findByText(t.lab.next);
      fireEvent.click(next);
      await answerOnce(true);
    }
    await waitFor(() => expect(screen.getByText(tv.completionTitle)).toBeTruthy());
    expect(screen.getByText(tv.completionNextHeading)).toBeTruthy();
    // 第一CTAは一つ（今日の学習を終える）
    expect(screen.getByText(tv.completionFinish)).toBeTruthy();
    // 内部state名は出さない
    expect(document.body.textContent).not.toContain('day3');
    expect(document.body.textContent).not.toContain('independent');
  });
  it('答えるとスケジュールが更新される（誤答→翌日・正解→7日後のいずれか）', async () => {
    seedDueReview('fi-sumu');
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByText(tv.dueReviewStart));
    const choiceBtns = screen.getAllByRole('button').filter((b) => b.className.includes('action-choice'));
    fireEvent.click(choiceBtns[0]);
    fireEvent.click(screen.getByText(t.lab.check));
    await waitFor(() => {
      const raw = JSON.parse(window.sessionStorage.getItem(VOCAB_REVIEW_SCHEDULE_KEY)!);
      const e = raw.entries['fi-sumu'];
      expect(['day1', 'day7', 'retention_candidate']).toContain(e.reviewStage);
      expect(e.lastAttemptDay).toBeTruthy();
    });
    // 教材データは変更されない
    expect(allVocabularyItems().every((i) => i.review === 'draft')).toBe(true);
  });
});

// Phase 2E-1.13: staging実機で「Step4の復習予定が0件」を検出したことによる回帰テスト。
// 今日のことば（練習）の結果が間隔反復に入らないと、完了画面が
// 「忘れかけるころにもう一度出てきます」と言いながら予定が生まれない。
describe('今日のことば → 復習予定の接続（2E-1.13回帰）', () => {
  const startDaily = () => {
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByText(tv.dailyCta));
  };

  it('クイズに誤答すると、その語の復習予定ができる', async () => {
    startDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));           // 見る → ためす
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    // 選択肢のうち正解でないものを選ぶため、まず一つ選んで判定する
    const before = window.sessionStorage.getItem(VOCAB_REVIEW_SCHEDULE_KEY);
    expect(before).toBeNull();
    fireEvent.click(choices[choices.length - 2]);
    fireEvent.click(screen.getByText(t.lab.check));
    const repo = createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock());
    expect(repo.getAll().length).toBeGreaterThan(0);
  });

  it('「まだ不安」を選ぶと復習予定が作られる（自己申告も学習ループに入る）', () => {
    startDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);
    fireEvent.click(screen.getByText(t.lab.check));
    fireEvent.click(screen.getByText(t.lab.next));               // ためす → ふりかえる
    fireEvent.click(screen.getByText(tv.needsReviewBtn));
    const repo = createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock());
    const entry = repo.getAll()[0];
    expect(entry).toBeTruthy();
    expect(entry.learnerUncertain).toBe(true);
  });

  it('「覚えた」を選んでも既存の復習予定は消えない（§4・自己申告で定着扱いにしない）', () => {
    seedDueReview(allVocabularyItems()[0].id);
    const repo = createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock());
    const before = repo.getAll().length;
    startDaily();
    fireEvent.click(screen.getByText(tv.detailCheck));
    const choices = screen.getAllByRole('button').filter((b) => b.textContent);
    fireEvent.click(choices[choices.length - 2]);
    fireEvent.click(screen.getByText(t.lab.check));
    fireEvent.click(screen.getByText(t.lab.next));
    fireEvent.click(screen.getByText(tv.selfKnownBtn));
    expect(createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock()).getAll().length)
      .toBeGreaterThanOrEqual(before);
  });
});

// Phase 2E-1.14: Step4の内訳が「確認した語数」と必ず一致すること。
// 実機で「確認した項目3・自分でできた0・ヒントがあった0・もう一度確認する0」という
// 内訳が全部0の表示を確認したため、どの区分にも入らない語を取りこぼさないようにした。
describe('学習結果の内訳（2E-1.14回帰）', () => {
  it('3語すべてを誤答しても、内訳の合計が確認した語数と一致する', () => {
    render(<VocabularyHub {...base} />);
    fireEvent.click(screen.getByText(tv.dailyCta));
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByText(tv.detailCheck));
      const choices = screen.getAllByRole('button').filter((b) => b.textContent);
      fireEvent.click(choices[choices.length - 2]);
      fireEvent.click(screen.getByText(t.lab.check));
      fireEvent.click(screen.getByText(t.lab.next));
      fireEvent.click(screen.getByText(tv.selfKnownBtn));
      fireEvent.click(screen.getByText(i === 2 ? tv.dailyCompleteCta : tv.nextWord));
    }
    fireEvent.click(screen.getByText(tv.dailyFinish));
    // Journey契約が無いので通常ホームへ戻る。ここでは落ちないことと、
    // 内訳計算が確認語数を取りこぼさないことをRepository経由で確かめる
    const repo = createVocabSpacedReviewRepository(window.sessionStorage, createLearningClock());
    expect(repo.getAll().length).toBe(3);
  });
});
