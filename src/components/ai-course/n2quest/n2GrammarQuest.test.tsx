// @vitest-environment jsdom
// N2文法攻略UIのフローテスト（FOREST FIRST §10・§24 Journey C）。
// 単元一覧→文型一覧→詳細→確認問題→使用練習→次の文型→単元完了→Reviewまで。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { N2GrammarQuestPanel } from './N2GrammarQuestPanel';
import { shuffleRecognition, N2_QUEST_KEY_PREFIX } from '../../../lib/aiLesson/course/n2quest/n2QuestProgress';
import { N2_GRAMMAR_DRAFTS } from '../../../lib/aiLesson/course/n2GrammarDrafts';

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); });

const noop = () => {};

const openUnit1FirstItem = async () => {
  render(<N2GrammarQuestPanel onBack={noop} />);
  fireEvent.click(screen.getByText('第1単元'));
  // lazy chunk読込後に文型一覧が出る
  const first = [...N2_GRAMMAR_DRAFTS].filter(d => d.unit === 1)
    .sort((a, b) => a.grammarId.localeCompare(b.grammarId))[0];
  await waitFor(() => expect(screen.getByText(first.pattern)).toBeTruthy());
  return first;
};

describe('N2GrammarQuestPanel（ソラノ塔）', () => {
  it('単元一覧に12単元が並ぶ（準備中の階を作らない）', () => {
    render(<N2GrammarQuestPanel onBack={noop} />);
    for (let u = 1; u <= 12; u++) expect(screen.getByText(`第${u}単元`)).toBeTruthy();
    expect(screen.queryByText(/準備中|coming soon/i)).toBeNull();
  });

  it('詳細→確認問題→使用練習→完了まで一通り進める（Journey C）', async () => {
    const first = await openUnit1FirstItem();
    fireEvent.click(screen.getByText(first.pattern));
    // 詳細: 中国語説明・接続・例文
    expect(screen.getByText(first.explanationZh)).toBeTruthy();
    expect(screen.getByText(first.formation)).toBeTruthy();
    expect(screen.getByText(first.examplesJa[0])).toBeTruthy();
    // 確認問題（決定的シャッフル後の正解を選ぶ）
    fireEvent.click(screen.getByText('確認問題へ'));
    const sh = shuffleRecognition(first.grammarId, first.recognition.options, first.recognition.answerIndex);
    fireEvent.click(screen.getByText(sh.options[sh.answerIndex]));
    fireEvent.click(screen.getByText('こたえあわせ'));
    expect(screen.getByText('正解です')).toBeTruthy();
    // 使用練習: 目標表現を含む文
    fireEvent.click(screen.getByText('使用練習へ'));
    const key = first.production.expected[0].replace(/^〜/, '');
    fireEvent.change(screen.getByLabelText('自分の文を書く'), { target: { value: `わたしは${key}という形を使います。` } });
    fireEvent.click(screen.getByText('書けたか確認する'));
    expect(await screen.findByText(`「${first.pattern}」の学習を記録しました（この端末）`)).toBeTruthy();
    // 進捗がlocalStorageへ入る（サーバー保存とは言わない）
    expect(window.localStorage.getItem(N2_QUEST_KEY_PREFIX + first.grammarId)).toContain('recognizedAtMs');
  });

  it('誤答では答えの位置を丸暗記させず、もう一度選べる', async () => {
    const first = await openUnit1FirstItem();
    fireEvent.click(screen.getByText(first.pattern));
    fireEvent.click(screen.getByText('確認問題へ'));
    const sh = shuffleRecognition(first.grammarId, first.recognition.options, first.recognition.answerIndex);
    const wrong = sh.options.find((_, i) => i !== sh.answerIndex)!;
    fireEvent.click(screen.getByText(wrong));
    fireEvent.click(screen.getByText('こたえあわせ'));
    expect(screen.getByText('もう一度考えてみましょう')).toBeTruthy();
    expect(screen.getByText('もう一度えらぶ')).toBeTruthy();
  });

  it('使用練習で目標表現が無ければ例を出して再入力・「読むだけ」でも先へ進める（行き止まりなし）', async () => {
    const first = await openUnit1FirstItem();
    fireEvent.click(screen.getByText(first.pattern));
    fireEvent.click(screen.getByText('確認問題へ'));
    const sh = shuffleRecognition(first.grammarId, first.recognition.options, first.recognition.answerIndex);
    fireEvent.click(screen.getByText(sh.options[sh.answerIndex]));
    fireEvent.click(screen.getByText('こたえあわせ'));
    fireEvent.click(screen.getByText('使用練習へ'));
    fireEvent.change(screen.getByLabelText('自分の文を書く'), { target: { value: '今日は晴れです。' } });
    fireEvent.click(screen.getByText('書けたか確認する'));
    expect(screen.getByText(new RegExp(`「${first.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}」を文の中に入れてみましょう`))).toBeTruthy();
    fireEvent.click(screen.getByText('今日は読むだけにする'));
    expect(await screen.findByText(`「${first.pattern}」の学習を記録しました（この端末）`)).toBeTruthy();
  });

  it('unit 11 には同義判断待ちの n2g-162（〜矢先に）も表示される（180/180）', async () => {
    render(<N2GrammarQuestPanel onBack={noop} />);
    fireEvent.click(screen.getByText('第11単元'));
    await waitFor(() => expect(screen.getByText('〜矢先に')).toBeTruthy());
    // 内部メタ（統合判断・pairedWith等）はlearnerに出さない
    expect(screen.queryByText(/統合|merge|判断待ち/)).toBeNull();
  });

  it('会話の広場への接続（onGoConversation）が完了画面に出る', async () => {
    const goConv = vi.fn();
    render(<N2GrammarQuestPanel onBack={noop} onGoConversation={goConv} />);
    fireEvent.click(screen.getByText('第1単元'));
    const first = [...N2_GRAMMAR_DRAFTS].filter(d => d.unit === 1)
      .sort((a, b) => a.grammarId.localeCompare(b.grammarId))[0];
    await waitFor(() => expect(screen.getByText(first.pattern)).toBeTruthy());
    fireEvent.click(screen.getByText(first.pattern));
    fireEvent.click(screen.getByText('確認問題へ'));
    const sh = shuffleRecognition(first.grammarId, first.recognition.options, first.recognition.answerIndex);
    fireEvent.click(screen.getByText(sh.options[sh.answerIndex]));
    fireEvent.click(screen.getByText('こたえあわせ'));
    fireEvent.click(screen.getByText('使用練習へ'));
    fireEvent.click(screen.getByText('今日は読むだけにする'));
    fireEvent.click(await screen.findByText('会話の広場で使ってみる'));
    expect(goConv).toHaveBeenCalledTimes(1);
  });

  it('learner画面に開発用語を出さない', async () => {
    const { container } = render(<N2GrammarQuestPanel onBack={noop} />);
    for (const banned of ['試作', 'draft', 'sandbox', 'labPreview', 'reviewStatus']) {
      expect(container.textContent?.includes(banned), banned).toBe(false);
    }
  });
});
