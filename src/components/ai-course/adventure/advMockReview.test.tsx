// @vitest-environment jsdom
// 模試の間違い直し画面。見たいのは「解説が読めること」と「無いものを有るふりをしないこと」。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AdvMockReview } from './AdvMockReview';
import type { AdvMockLogEntry } from '../../../lib/aiLesson/course/adventure/advTypes';

const entry = (over: Partial<AdvMockLogEntry> = {}): AdvMockLogEntry => ({
  mockId: 'm1', dateKey: '2026-08-25', level: 'N2', mode: 'short',
  totalCorrect: 8, totalQuestions: 20, totalUnanswered: 0,
  sectionsFinishedInTime: 3, sectionCount: 3, skills: ['vocabulary'],
  completedAt: '2026-08-25T11:00:00.000Z',
  wrong: [{
    key: 'q1', sectionLabelJa: '言語知識', sectionLabelZh: '语言知识', index: 3,
    stemJa: '「挑戦」の読みは？', stemZh: '「挑戦」怎么读？', pickedTextJa: 'とうせん',
    correctTextJa: 'ちょうせん',
    whyJa: '「挑」は音読みで「ちょう」です。', whyZh: '「挑」音读为「ちょう」。',
  }],
  ...over,
});

describe('模試の間違い直し', () => {
  afterEach(cleanup);

  it('1回だけなら、開いてすぐ問題文・選んだ答え・正解・解説が読める', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry()]} onBack={vi.fn()} />);
    expect(screen.getByText('「挑戦」の読みは？')).toBeTruthy();
    expect(screen.getByText(/✕ とうせん/)).toBeTruthy();
    expect(screen.getByText(/◯ ちょうせん/)).toBeTruthy();
    expect(screen.getByText('「挑」は音読みで「ちょう」です。')).toBeTruthy();
  });

  it('複数回あれば一覧から選ぶ（何問間違えたかが一覧で分かる）', () => {
    render(<AdvMockReview lang="ja"
      mockLog={[entry({ mockId: 'm1', dateKey: '2026-08-20' }), entry({ mockId: 'm2', dateKey: '2026-08-25' })]}
      onBack={vi.fn()} />);
    // 新しい順
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('2026-08-'));
    expect(buttons[0]?.textContent).toContain('2026-08-25');
    expect(buttons[0]?.textContent).toContain('間違い 1問');
    fireEvent.click(buttons[0]!);
    expect(screen.getByText('「挑戦」の読みは？')).toBeTruthy();
  });

  it('解説が残っていない古い回は「残っていない」と書く（作らない）', () => {
    render(<AdvMockReview lang="ja" mockLog={[entry({ wrong: undefined })]} onBack={vi.fn()} />);
    expect(screen.getByText(/解説を保存していません/)).toBeTruthy();
  });

  it('全問正解の回は「全問正解」と出す（0件の解説カードを出さない）', () => {
    render(<AdvMockReview lang="ja"
      mockLog={[entry({ wrong: [], totalCorrect: 20, totalQuestions: 20 })]} onBack={vi.fn()} />);
    expect(screen.getByText(/全問正解でした/)).toBeTruthy();
  });

  it('1回も終えていなければ、その理由まで書く（行き止まりにしない）', () => {
    render(<AdvMockReview lang="ja" mockLog={[]} onBack={vi.fn()} />);
    expect(screen.getByText(/まだ最後まで終えた模試がありません/)).toBeTruthy();
    expect(screen.getByText(/途中でやめた回は記録に入りません/)).toBeTruthy();
  });

  it('中国語では解説も中国語で出す', () => {
    render(<AdvMockReview lang="zh" mockLog={[entry()]} onBack={vi.fn()} />);
    expect(screen.getByText('「挑」音读为「ちょう」。')).toBeTruthy();
    expect(screen.getByText(/答对 8／20题/)).toBeTruthy();
  });
});
