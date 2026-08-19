// @vitest-environment jsdom
// 次の道カードの受入テスト。
//
// いちばん守りたいこと:
// - **引き継がれることを明言する**（不安で押せないカードは無いのと同じ）
// - 「合格」と書かない（言えるのはstage攻略の実測だけ・合格保証表現の禁止）
// - N2制覇では無い道（N1）を約束しない
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AdvNextRoadCard } from './AdvNextRoadCard';

afterEach(cleanup);

describe('次の道カード（N5制覇 → N4）', () => {
  it('制覇の祝いと次の目的地（実データのDESTINATIONラベル）を出す', () => {
    render(<AdvNextRoadCard lang="ja" clearedLevel="N5" nextLevel="N4" onAdvance={vi.fn()} />);
    expect(screen.getByText(/N5の道を制覇しました/)).toBeTruthy();
    expect(screen.getByText(/次の目的地：N4・トオリミチ/)).toBeTruthy();
  });

  it('攻略済みが引き継がれることを明言する（ja）', () => {
    render(<AdvNextRoadCard lang="ja" clearedLevel="N5" nextLevel="N4" onAdvance={vi.fn()} />);
    expect(screen.getByText(/攻略済みの地域はそのまま引き継がれ/)).toBeTruthy();
    expect(screen.getByText(/最初からやり直しにはなりません/)).toBeTruthy();
  });

  it('攻略済みが引き継がれることを明言する（zh）', () => {
    render(<AdvNextRoadCard lang="zh" clearedLevel="N5" nextLevel="N4" onAdvance={vi.fn()} />);
    expect(screen.getByText(/已攻略的地区会原样保留/)).toBeTruthy();
    expect(screen.getByText(/不会从头再来/)).toBeTruthy();
  });

  it('CTAで onAdvance(次レベル) が発火する', () => {
    const onAdvance = vi.fn();
    render(<AdvNextRoadCard lang="ja" clearedLevel="N5" nextLevel="N4" onAdvance={onAdvance} />);
    fireEvent.click(screen.getByRole('button', { name: /N4への道をひらく/ }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenCalledWith('N4');
  });

  it('「合格」「保証」と書かない（合格保証表現の禁止）', () => {
    const { container } = render(
      <AdvNextRoadCard lang="ja" clearedLevel="N5" nextLevel="N4" onAdvance={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(/合格|保証/);
    cleanup();
    const zh = render(<AdvNextRoadCard lang="zh" clearedLevel="N5" nextLevel="N4" onAdvance={vi.fn()} />);
    expect(zh.container.textContent).not.toMatch(/合格|保证/);
  });
});

describe('次の道カード（N2制覇＝ソラノ塔）', () => {
  it('次の道は約束せず、N1が未対応であることを正直に言う（CTAなし）', () => {
    const { container } = render(
      <AdvNextRoadCard lang="ja" clearedLevel="N2" nextLevel={null} onAdvance={vi.fn()} />,
    );
    expect(screen.getByText(/ソラノ塔まで、すべての道を制覇しました/)).toBeTruthy();
    expect(screen.getByText(/N1は今後追加予定です/)).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });
});
