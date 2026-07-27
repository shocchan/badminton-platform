// @vitest-environment jsdom
// 学習Journeyのイラスト・可視化（2E-1.13）。
// 図は「理解の補助」であって唯一の情報源にしない、という設計をテストで担保する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { JourneyStepper, ResultBars, ReviewTimeline } from './LearningIllustrations';
import { STEP_ILLUSTRATIONS } from './stepIllustrationMap';

afterEach(cleanup);

const STEPS = [
  { key: 'goal', label: '目的' }, { key: 'check', label: '短い確認' },
  { key: 'practice', label: '最初の練習' }, { key: 'done', label: '今日のまとめ' },
];

describe('JourneyStepper', () => {
  it('現在のステップだけに aria-current="step" が付く', () => {
    render(<JourneyStepper steps={STEPS} currentIndex={2} ariaLabel="ステップ 3 / 4" />);
    const current = document.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('最初の練習');
  });

  it('4ステップすべてのラベルが文字として読める（色や形だけに依存しない）', () => {
    render(<JourneyStepper steps={STEPS} currentIndex={0} ariaLabel="ステップ 1 / 4" />);
    STEPS.forEach((s) => expect(screen.getByText(s.label)).toBeTruthy());
  });

  it('完了済みステップはチェック、未来のステップは番号で示される', () => {
    const { container } = render(
      <JourneyStepper steps={STEPS} currentIndex={2} ariaLabel="ステップ 3 / 4" />);
    const text = container.textContent ?? '';
    expect(text).toContain('✓');   // 1・2は完了
    expect(text).toContain('4');   // 4は未来なので番号のまま
  });
});

describe('ResultBars', () => {
  it('件数が数字テキストとしても読める', () => {
    render(<ResultBars total={5} bars={[
      { label: '自分でできた', count: 3, tone: 'good' },
      { label: 'もう一度確認', count: 2, tone: 'review' },
    ]} />);
    expect(screen.getByText('自分でできた')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('0件の項目は描かない（0を強調して落ち込ませない）', () => {
    render(<ResultBars total={3} bars={[
      { label: '自分でできた', count: 3, tone: 'good' },
      { label: 'ヒントがあった', count: 0, tone: 'support' },
    ]} />);
    expect(screen.queryByText('ヒントがあった')).toBeNull();
  });

  it('total が 0 でも幅計算で例外にならない（ゼロ除算しない）', () => {
    expect(() => render(<ResultBars total={0} bars={[
      { label: 'もう一度確認', count: 0, tone: 'review' },
    ]} />)).not.toThrow();
  });
});

describe('ReviewTimeline', () => {
  it('今日と各予定日のラベル・件数が文字として読める', () => {
    render(<ReviewTimeline todayLabel="今日" points={[
      { label: '明日', count: 2, emphasis: true },
      { label: '3日後', count: 1 },
      { label: '7日後', count: 0 },
    ]} />);
    ['今日', '明日', '3日後', '7日後'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('0件の予定日も存在自体は示す（予定がないことも情報）', () => {
    render(<ReviewTimeline todayLabel="今日" points={[{ label: '7日後', count: 0 }]} />);
    expect(screen.getByText('7日後')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});

describe('ステップイラスト', () => {
  it('既定では装飾扱いになる（隣の見出しと二重に読み上げさせない）', () => {
    const keys = ['goal', 'check', 'practice', 'done'] as const;
    keys.forEach((k) => {
      const Illustration = STEP_ILLUSTRATIONS[k];
      const { container } = render(<Illustration />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('role')).toBeNull();
      expect(svg?.getAttribute('focusable')).toBe('false');
      cleanup();
    });
  });

  it('隣接テキストが無い場所ではラベルを渡して意味のある画像にできる', () => {
    const { container } = render(<STEP_ILLUSTRATIONS.goal label="学習の目的" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('学習の目的');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('外部リソースを読み込まない（画像リクエスト・script を含まない）', () => {
    const { container } = render(<STEP_ILLUSTRATIONS.done />);
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('http');
  });
});
