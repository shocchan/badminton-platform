// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { VocabularyHub } from './VocabularyHub';
import { aiCourseI18n } from '../../../../locales/aiCourse';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); });
const t = aiCourseI18n.ja;
const base = { t, onBack: () => {}, onGoConversation: () => {} };

describe('ことば図鑑トップ（§7・3ブロック構成）', () => {
  it('今日のことば・カテゴリー・復習の3ブロックのみ＋非保存表記', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.categoriesHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.reviewHeading)).toBeTruthy();
    expect(screen.getByText(t.vocab.notSavedVocab)).toBeTruthy();
    // トップへ大きな検索欄・全語一覧を出さない（§31・§7）
    expect(screen.queryByPlaceholderText(t.vocab.searchPlaceholder)).toBeNull();
  });
  it('優先4カテゴリ（動詞/い形/な形/名詞）が大きく・語数付きで表示される', () => {
    render(<VocabularyHub {...base} />);
    expect(screen.getByText(t.vocab.catVerbs)).toBeTruthy();
    expect(screen.getByText(t.vocab.catIAdj)).toBeTruthy();
    expect(screen.getByText(t.vocab.catNaAdj)).toBeTruthy();
    expect(screen.getByText(t.vocab.catNouns)).toBeTruthy();
    expect(screen.getByText(t.vocab.wordsCount(27))).toBeTruthy(); // 動詞27語
  });
  it('zhでもトップが表示される', () => {
    render(<VocabularyHub {...base} t={aiCourseI18n.zh} />);
    expect(screen.getByText(aiCourseI18n.zh.vocab.todayWordsHeading)).toBeTruthy();
  });
});

describe('カテゴリ・詳細・自己評価（§18-§21）', () => {
  it('動詞カテゴリで語彙カード（読み・意味・状態）が並ぶ', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'category', category: 'verbs' }} />);
    await waitFor(() => expect(screen.getByText('行く')).toBeTruthy());
    expect(screen.getByText('帰る')).toBeTruthy();
    expect(screen.getAllByText(t.vocab.states.unseen).length).toBeGreaterThan(5);
  });
  it('詳細画面: 覚えた/まだ不安を切替可能・変更できる・encounterが記録される', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-iku' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.detailUsage)).toBeTruthy());
    fireEvent.click(screen.getByText(t.vocab.selfKnownBtn));
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.entries['fi-iku'].selfAssessment).toBe('self_known');
    fireEvent.click(screen.getByText(t.vocab.needsReviewBtn));
    const raw2 = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw2.entries['fi-iku'].selfAssessment).toBe('needs_review');
    expect(raw2.entries['fi-iku'].encounterCount).toBeGreaterThanOrEqual(1);
  });
  it('反対語リンク: 大きい⇔小さいを行き来できる', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-ookii' }} />);
    await waitFor(() => expect(screen.getByText(/小さい/)).toBeTruthy());
  });
  it('不正itemIdはことばトップへ正規化（§59）', async () => {
    const states: unknown[] = [];
    render(<VocabularyHub {...base} initial={{ view: 'detail', itemId: 'fi-bogus' }} onStateChange={(s) => states.push(s)} />);
    await waitFor(() => expect(screen.getByText(t.vocab.todayWordsHeading)).toBeTruthy());
    expect(states).toContainEqual({ view: 'top', category: null, itemId: null });
  });
});

describe('今日の3語フロー（§25-§26）', () => {
  it('画像カード→意味確認（タップ選択）→覚えた/まだ不安→次の語', async () => {
    render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    // カード表示→確認へ
    fireEvent.click(screen.getByText(t.vocab.detailCheck));
    await waitFor(() => expect(screen.getByText(t.lab.check)).toBeTruthy());
    // 選択肢（意味）が3択・タップのみ
    const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('border-2'));
    expect(buttons.length).toBe(3);
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText(t.lab.check));
    await waitFor(() => expect(screen.getByText(t.lab.next)).toBeTruthy());
    fireEvent.click(screen.getByText(t.lab.next));
    // 自己評価
    await waitFor(() => expect(screen.getByText(t.vocab.selfPrompt)).toBeTruthy());
    fireEvent.click(screen.getByText(t.vocab.selfKnownBtn));
    fireEvent.click(screen.getByText(t.lab.next));
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(2, 3))).toBeTruthy());
  });
  it('決定的理由が表示される（架空AI分析なし）・同日は同じ3語', async () => {
    const r1 = render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    expect(screen.getByText(t.vocab.reasons.core_a)).toBeTruthy();
    r1.unmount();
    // 再マウント（リロード相当）でも同じ日の3語は固定
    const raw = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw.dailyWords.itemIds.length).toBe(3);
    render(<VocabularyHub {...base} initial={{ view: 'daily' }} />);
    await waitFor(() => expect(screen.getByText(t.vocab.dailyStep(1, 3))).toBeTruthy());
    const raw2 = JSON.parse(window.sessionStorage.getItem('ai_course_vocab_preview_v1')!);
    expect(raw2.dailyWords.itemIds).toEqual(raw.dailyWords.itemIds);
  });
});
