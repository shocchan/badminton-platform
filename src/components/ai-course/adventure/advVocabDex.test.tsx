// @vitest-environment jsdom
// 単語図鑑の画面（2026-09-06）。見たいのは3つ:
//   ①「何語中いくつ集めた」が最初から見える（全体の大きさを隠さない）
//   ② 未発見の語は中身を見せない（集める動機になる／検索でも漏らさない）
//   ③ 数え方を画面に書いている（原則13: 数字を作らない）
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AdvVocabDex } from './AdvVocabDex';
import type { DexCard, DexView } from '../../../lib/aiLesson/course/adventure/vocab/vocabDexData';

afterEach(cleanup);

const card = (over: Partial<DexCard> = {}): DexCard => ({
  id: '懸念|けねん', surface: '懸念', reading: 'けねん', level: 'N1',
  glossZh: '担忧；挂虑', exampleJa: '物価の上昇を懸念する声が広がっています。',
  exampleZh: '担忧物价上涨的声音正在扩散。',
  explanationJa: '「懸念」は悪くなるのではないかという心配です。', explanationZh: '「懸念」是担心会变糟。',
  collocationsJa: ['懸念を示す'], state: 'mastered',
  metCount: 5, correctCount: 4, wrongCount: 1, aspects: ['reading', 'meaning'],
  lastMetDateKey: '2026-09-05', ...over,
});

const view = (over: Partial<DexView> = {}): DexView => ({
  cards: [card(), card({ id: '危惧|きぐ', surface: '危惧', reading: 'きぐ', state: 'unseen', metCount: 0, correctCount: 0, wrongCount: 0, aspects: [], lastMetDateKey: null })],
  progress: { total: 4546, met: 0, familiar: 0, mastered: 1, discovered: 1 },
  byLevel: [{ level: 'N1', discovered: 1, total: 317 }],
  ...over,
});

describe('単語図鑑', () => {
  it('集めた数と総数が最初から見える', () => {
    render(<AdvVocabDex lang="ja" view={view()} onBack={vi.fn()} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('/ 4546')).toBeTruthy();
    expect(screen.getByText(/N1 1\/317/)).toBeTruthy();
  });

  it('数え方を画面に書いている', () => {
    render(<AdvVocabDex lang="ja" view={view()} onBack={vi.fn()} />);
    expect(screen.getByText(/別の日に3回以上正解/)).toBeTruthy();
    expect(screen.getByText(/正誤を記録していない古い記録/)).toBeTruthy();
  });

  it('出会った語は開ける・未発見の語は表記を出さない', () => {
    render(<AdvVocabDex lang="ja" view={view()} onBack={vi.fn()} />);
    expect(screen.getByText('懸念')).toBeTruthy();
    expect(screen.queryByText('危惧')).toBeNull();
    // 未発見は文字数ぶんの「？」だけ
    expect(screen.getByText('？？')).toBeTruthy();
  });

  it('未発見の語は検索でも出てこない', () => {
    render(<AdvVocabDex lang="ja" view={view()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('出会った単語をさがす'), { target: { value: '危惧' } });
    expect(screen.queryByText('危惧')).toBeNull();
    expect(screen.getByText(/まだ出会っていない単語は検索できません/)).toBeTruthy();
  });

  it('語を開くと意味・例文・自分の記録が読める', () => {
    render(<AdvVocabDex lang="ja" view={view()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /懸念/ }));
    expect(screen.getByText('担忧；挂虑')).toBeTruthy();
    expect(screen.getByText('物価の上昇を懸念する声が広がっています。')).toBeTruthy();
    expect(screen.getByText(/出会った 5回／正解 4回／まちがえ 1回/)).toBeTruthy();
    expect(screen.getByText(/最後に出会った日: 2026-09-05/)).toBeTruthy();
  });

  it('「まちがえた」でしぼると、間違えたことのある語だけになる', () => {
    const v = view({
      cards: [
        card({ id: 'a|a', surface: '甲', reading: 'こう', wrongCount: 0, state: 'met' }),
        card({ id: 'b|b', surface: '乙', reading: 'おつ', wrongCount: 2, state: 'familiar' }),
      ],
    });
    render(<AdvVocabDex lang="ja" view={v} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'まちがえた' }));
    expect(screen.getByText('乙')).toBeTruthy();
    expect(screen.queryByText('甲')).toBeNull();
  });

  it('中国語画面では中国語で出る', () => {
    render(<AdvVocabDex lang="zh" view={view()} onBack={vi.fn()} />);
    expect(screen.getByText('单词图鉴')).toBeTruthy();
    expect(screen.getByText(/在战斗和模拟考中遇见的单词/)).toBeTruthy();
  });
});
