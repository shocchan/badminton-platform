// @vitest-environment jsdom
// 新しいことばを覚える画面（2026-09-06）。見たいのは学習ループが成立していること:
//   ① 先に「見て覚える」。最初から当てさせない
//   ② 答えたらその場で結果と理由が出る
//   ③ まちがえた問題は同じセッションでもう一度出る
//   ④ 終わったら台帳へ1回だけ記録する（図鑑に載る）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AdvVocabLearn } from './AdvVocabLearn';
import type { LearnSession } from '../../../lib/aiLesson/course/adventure/vocab/vocabLearn';

afterEach(cleanup);

const session: LearnSession = {
  words: [{
    id: '懸念|けねん', surface: '懸念', reading: 'けねん', level: 'N1',
    glossZh: '担忧；挂虑', exampleJa: '物価の上昇を懸念する声が広がっています。',
    exampleZh: '担忧物价上涨的声音正在扩散。',
    explanationJa: '「懸念」は悪くなるのではないかという心配です。',
    explanationZh: '「懸念」是担心会变糟。', collocationsJa: ['懸念を示す'],
  }],
  questions: [
    {
      key: 'vocab:懸念:けねん:meaning', wordId: '懸念|けねん', type: 'vocab-meaning',
      promptJa: null, promptZh: '「懸念」是什么意思？', targetJapanese: '懸念',
      choices: [
        { choiceId: 'a', textJa: '担忧；挂虑', isCorrect: true },
        { choiceId: 'b', textJa: '安心', isCorrect: false },
        { choiceId: 'c', textJa: '疲劳', isCorrect: false },
        { choiceId: 'd', textJa: '期待', isCorrect: false },
      ],
      explanationZh: '担忧；挂虑',
    },
  ],
};

const base = { lang: 'ja' as const, session, mixedReview: false, remainingUnseen: 4541 };

describe('新しいことばを覚える', () => {
  it('①はじめは「見て覚える」画面で、選択肢は出ない', () => {
    render(<AdvVocabLearn {...base} onFinish={vi.fn()} onBack={vi.fn()} onMore={vi.fn()} />);
    expect(screen.getByText('懸念')).toBeTruthy();
    expect(screen.getByText('物価の上昇を懸念する声が広がっています。')).toBeTruthy();
    expect(screen.queryByText('安心')).toBeNull();
    expect(screen.getByRole('button', { name: /たしかめる/ })).toBeTruthy();
  });

  it('②答えるとその場で結果と意味が出る', () => {
    render(<AdvVocabLearn {...base} onFinish={vi.fn()} onBack={vi.fn()} onMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /たしかめる/ }));
    fireEvent.click(screen.getByRole('button', { name: /担忧；挂虑/ }));
    expect(screen.getByText('正解！')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'つづける' })).toBeTruthy();
  });

  it('③まちがえた問題はもう一度出る', () => {
    render(<AdvVocabLearn {...base} onFinish={vi.fn()} onBack={vi.fn()} onMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /たしかめる/ }));
    fireEvent.click(screen.getByRole('button', { name: '安心' }));
    expect(screen.getByText('もう一度おぼえよう')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'つづける' }));
    // 同じ問題が「さっきまちがえた問題です」つきで戻ってくる
    expect(screen.getByText(/さっきまちがえた問題です/)).toBeTruthy();
  });

  it('④終わると台帳へ1回だけ記録し、覚えた語を出す', () => {
    const onFinish = vi.fn();
    render(<AdvVocabLearn {...base} onFinish={onFinish} onBack={vi.fn()} onMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /たしかめる/ }));
    fireEvent.click(screen.getByRole('button', { name: /担忧；挂虑/ }));
    fireEvent.click(screen.getByRole('button', { name: 'つづける' }));
    expect(screen.getByText('1語ぶん終わりました')).toBeTruthy();
    expect(screen.getByText(/そのうち 1語は一度も間違えませんでした/)).toBeTruthy();
    expect(onFinish).toHaveBeenCalledTimes(1);
    // 図鑑との関係を画面で説明している（勝手に「習得」にしない）
    expect(screen.getByText(/図鑑の「習得」になるのは、別の日にも正解できたとき/)).toBeTruthy();
  });

  it('まちがえた語は「もう一度」と出る（覚えた扱いにしない）', () => {
    render(<AdvVocabLearn {...base} onFinish={vi.fn()} onBack={vi.fn()} onMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /たしかめる/ }));
    fireEvent.click(screen.getByRole('button', { name: '安心' }));
    fireEvent.click(screen.getByRole('button', { name: 'つづける' }));
    fireEvent.click(screen.getByRole('button', { name: /担忧；挂虑/ }));
    fireEvent.click(screen.getByRole('button', { name: 'つづける' }));
    expect(screen.getByText(/そのうち 0語は一度も間違えませんでした/)).toBeTruthy();
    expect(screen.getByText('もう一度')).toBeTruthy();
  });

  it('中国語画面では中国語で出る', () => {
    render(<AdvVocabLearn {...base} lang="zh" onFinish={vi.fn()} onBack={vi.fn()} onMore={vi.fn()} />);
    expect(screen.getByText('担忧；挂虑')).toBeTruthy();
    expect(screen.getByRole('button', { name: /来确认一下/ })).toBeTruthy();
  });
});
