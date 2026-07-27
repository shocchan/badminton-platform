// @vitest-environment jsdom
// 教材レビュー画面・構造化ふりがな表示のテスト（Phase 2E-1 §11-§17・§32-§33）。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import VocabReviewPanel from './VocabReviewPanel';
import { RubySegments, RubyWord } from './RubyText';
import { resolveFuriganaMode } from '../../../../lib/aiLesson/course/vocabFurigana';
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { allVocabularyItems } from '../../../../lib/aiLesson/course/foundationVocabBank';
import { VOCAB_REVIEW_LOCAL_KEY } from '../../../../lib/aiLesson/course/vocabReviewStore';
import { REVIEW_I18N } from './vocabReviewI18n';

afterEach(cleanup);
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
const t = aiCourseI18n.ja;
const items = allVocabularyItems();
const base = { t, items, onOpenItem: () => {}, onBack: () => {} };

describe('構造化ふりがな表示（§11-§13）', () => {
  const segs = [
    { text: '日本', reading: 'にほん' },
    { text: 'に' },
    { text: '住', reading: 'す', isTarget: true },
    { text: 'んでいます。' },
    { text: '印鑑', reading: 'いんかん', level: 'hard' as const },
  ];
  it('ruby/rt で描画され、HTML文字列を挿入しない', () => {
    const { container } = render(<p><RubySegments segments={segs} mode="all" /></p>);
    const rts = Array.from(container.querySelectorAll('rt')).map((r) => r.textContent);
    expect(rts).toContain('にほん');
    expect(rts).toContain('す');
    expect(container.innerHTML).not.toContain('dangerously');
  });
  it('読み問題では対象語のrubyを隠す（hideTargetReading）・他の語は表示', () => {
    const { container } = render(<p><RubySegments segments={segs} mode="all" hideTargetReading /></p>);
    const rts = Array.from(container.querySelectorAll('rt')).map((r) => r.textContent);
    expect(rts).not.toContain('す');       // 対象語の読みを事前に出さない（正解漏洩なし）
    expect(rts).toContain('にほん');
    expect(container.textContent).toContain('住');  // 本文は欠けない
  });
  it('hardモードは難読のみ・noneは非表示（本文は完全なまま）', () => {
    const { container: hard } = render(<p><RubySegments segments={segs} mode="hard" /></p>);
    const hardRts = Array.from(hard.querySelectorAll('rt')).map((r) => r.textContent);
    expect(hardRts).toEqual(['いんかん']);
    const { container: none } = render(<p><RubySegments segments={segs} mode="none" /></p>);
    expect(none.querySelectorAll('rt').length).toBe(0);
    expect(none.textContent).toContain('日本に住んでいます。');
  });
  it('resolveFuriganaMode: 設定と文脈から決定（off=none・hard_onlyは弱点でall）', () => {
    expect(resolveFuriganaMode('always', {})).toBe('all');
    expect(resolveFuriganaMode('first_time', { isFirstTime: true })).toBe('all');
    expect(resolveFuriganaMode('first_time', {})).toBe('hard');
    expect(resolveFuriganaMode('hard_only', {})).toBe('hard');
    expect(resolveFuriganaMode('hard_only', { isWeak: true })).toBe('all');
    expect(resolveFuriganaMode('off', {})).toBe('none');
  });
  it('RubyWord: show=falseでは読みを出さない（altやaria経由でも漏らさない）', () => {
    const { container } = render(<p><RubyWord text="読む" reading="よむ" show={false} /></p>);
    expect(container.textContent).toBe('読む');
    expect(container.innerHTML).not.toContain('よむ');
  });
});

describe('教材レビュー画面（§14-§17）', () => {
  it('タイトル・進捗・フィルター・intro（正式状態は変わらない旨）が表示される', () => {
    render(<VocabReviewPanel {...base} />);
    expect(screen.getByText(REVIEW_I18N.ja.title)).toBeTruthy();
    expect(screen.getByText(REVIEW_I18N.ja.intro)).toBeTruthy();
    expect(screen.getByLabelText(REVIEW_I18N.ja.filterLabel)).toBeTruthy();
    expect(screen.getByText(REVIEW_I18N.ja.notApproved)).toBeTruthy();
    expect(screen.getByText(new RegExp('1 / '))).toBeTruthy();
  });
  it('問題なし→sessionStorageのレビュー領域のみに保存（学習者進捗へ書かない・decisionでapprovedにならない）', async () => {
    render(<VocabReviewPanel {...base} />);
    fireEvent.click(screen.getByText(`${REVIEW_I18N.ja.decisionOk} (A)`));
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem(VOCAB_REVIEW_LOCAL_KEY)!);
      expect(Object.keys(raw.entries).length).toBe(1);
      expect(Object.values(raw.entries)[0]).toMatchObject({ decision: 'ok', reviewerMode: 'labPreview' });
    });
    expect(window.sessionStorage.getItem('ai_course_vocab_preview_v1')).toBeNull();
    expect(items.every((i) => i.review === 'draft')).toBe(true);
  });
  it('キーボードショートカット: A=問題なし・入力欄フォーカス中は無効（§17）', async () => {
    render(<VocabReviewPanel {...base} />);
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem(VOCAB_REVIEW_LOCAL_KEY)!);
      expect(Object.keys(raw.entries).length).toBe(1);
    });
    // 入力欄フォーカス中は無効
    window.localStorage.removeItem(VOCAB_REVIEW_LOCAL_KEY);
    const noteBox = screen.getByLabelText(new RegExp(REVIEW_I18N.ja.noteLabel));
    noteBox.focus();
    fireEvent.keyDown(window, { key: 'a' });
    expect(window.localStorage.getItem(VOCAB_REVIEW_LOCAL_KEY)).toBeNull();
  });
  it('J/Kで前後へ移動（onOpenItemに次のitemIdが渡る）', async () => {
    const onOpenItem = vi.fn();
    render(<VocabReviewPanel {...base} onOpenItem={onOpenItem} />);
    fireEvent.keyDown(window, { key: 'j' });
    await waitFor(() => expect(onOpenItem).toHaveBeenCalled());
  });
  it('不正JSONインポートは失敗を表示し何も変更しない', async () => {
    render(<VocabReviewPanel {...base} />);
    fireEvent.change(screen.getByLabelText(REVIEW_I18N.ja.importBtn), { target: { value: '{{{broken' } });
    fireEvent.click(screen.getByText(REVIEW_I18N.ja.importBtn));
    await waitFor(() => expect(screen.getByText(REVIEW_I18N.ja.importFail)).toBeTruthy());
    expect(window.localStorage.getItem(VOCAB_REVIEW_LOCAL_KEY)).toBeNull();
  });
  it('フィルター: false friendで件数が絞られ、該当語（先生・都合等）だけになる', async () => {
    render(<VocabReviewPanel {...base} />);
    fireEvent.change(screen.getByLabelText(REVIEW_I18N.ja.filterLabel), { target: { value: 'false_friend' } });
    await waitFor(() => {
      const counter = screen.getAllByText(new RegExp('^1 / ')).find((el) => el.className.includes('font-mono'))!;
      const totalShown = Number(counter.textContent!.split('/')[1].trim());
      expect(totalShown).toBeGreaterThanOrEqual(4);   // 先生・勉強・都合・大変（+Sense override語）
      expect(totalShown).toBeLessThan(items.length);
    });
  });
});
