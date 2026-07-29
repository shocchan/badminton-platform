// @vitest-environment jsdom
// オモイデ庭園（復習の統合入口・§13）と冒険の記録カード（§14）のテスト。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { OmoideGardenPanel } from './OmoideGardenPanel';
import { AdventureRecordCard } from './AdventureRecordCard';
import { localUnitStorageKey } from '../../../lib/aiLesson/course/n3unit/localUnitStorage';
import { emptyRunState } from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import { N2_QUEST_KEY_PREFIX } from '../../../lib/aiLesson/course/n2quest/n2QuestProgress';
import { n3ScheduledReviewCount, n2LearnedCount, n3UnitsDoneCount } from '../../../lib/aiLesson/course/rpg/gardenCounts';

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

const noop = () => {};
const baseProps = {
  conversationReviewsDue: 2,
  onOpenVocabReview: noop, onOpenConversationHistory: noop,
  onOpenN3: noop, onOpenN2: noop, onOpenAdventure: noop, onBack: noop,
};

describe('OmoideGardenPanel（復習の統合入口）', () => {
  it('語彙・会話・文法・塔・再会クエストの5入口がすべて実導線を持つ', () => {
    const fns = {
      onOpenVocabReview: vi.fn(), onOpenConversationHistory: vi.fn(),
      onOpenN3: vi.fn(), onOpenN2: vi.fn(), onOpenAdventure: vi.fn(),
    };
    render(<OmoideGardenPanel {...baseProps} {...fns} />);
    fireEvent.click(screen.getByText('ことばとの再会'));
    fireEvent.click(screen.getByText('会話の思い出'));
    fireEvent.click(screen.getByText('文法のことばと再会'));
    fireEvent.click(screen.getByText('塔の文型を読み直す'));
    fireEvent.click(screen.getByText('再会クエスト'));
    expect(fns.onOpenVocabReview).toHaveBeenCalledTimes(1);
    expect(fns.onOpenConversationHistory).toHaveBeenCalledTimes(1);
    expect(fns.onOpenN3).toHaveBeenCalledTimes(1);
    expect(fns.onOpenN2).toHaveBeenCalledTimes(1);
    expect(fns.onOpenAdventure).toHaveBeenCalledTimes(1);
  });

  it('期限0でも空画面にせず、次の行動を提示する（§16 Empty）', () => {
    render(<OmoideGardenPanel {...baseProps} conversationReviewsDue={0} />);
    expect(screen.getByText('今日の期限の再会はありません。先に進んでも、読み直してもかまいません。')).toBeTruthy();
    expect(screen.getByText('ことばとの再会')).toBeTruthy();
  });

  it('N3の復習予定件数がlocalStorageから導出される', () => {
    const st = { ...emptyRunState('n3u-03-move', 1), reviewScheduledItemIds: ['fi-iku', 'fi-kuru'] };
    window.localStorage.setItem(localUnitStorageKey('n3u-03-move'), JSON.stringify(st));
    render(<OmoideGardenPanel {...baseProps} />);
    const row = screen.getByText('文法のことばと再会');
    expect(row.textContent).toContain('2');
  });
});

describe('AdventureRecordCard（冒険と実力の分離）', () => {
  it('エリア・N3単元・N2文型の進みを表示し、実力とは別物と明記する', () => {
    window.localStorage.setItem(localUnitStorageKey('n3u-01-self'),
      JSON.stringify({ ...emptyRunState('n3u-01-self', 1), phase: 'result', completedAtMs: 2 }));
    window.localStorage.setItem(N2_QUEST_KEY_PREFIX + 'n2g-001',
      JSON.stringify({ recognizedAtMs: 1, producedAtMs: 2 }));
    render(<AdventureRecordCard />);
    expect(screen.getByText('ミナモ列島の冒険の進み')).toBeTruthy();
    expect(screen.getByText(/二つは別のものです/)).toBeTruthy();
    expect(n3UnitsDoneCount(window.localStorage)).toBe(1);
    expect(n2LearnedCount(window.localStorage)).toBe(1);
  });
});

describe('gardenCounts（壊れた値で止まらない）', () => {
  it('壊れたJSONは0件扱い', () => {
    window.localStorage.setItem(localUnitStorageKey('n3u-02-daily'), '{broken');
    window.localStorage.setItem(N2_QUEST_KEY_PREFIX + 'n2g-002', 'not-json');
    expect(n3ScheduledReviewCount(window.localStorage)).toBe(0);
    expect(n2LearnedCount(window.localStorage)).toBe(0);
  });
});
