// @vitest-environment jsdom
// ミニ模試の「途中まで答えた答案が消えない」ことを実コンポーネントで確かめる。
//
// 2026-08-17、語彙の出題プールを全量生成から部分生成（vocabSubset）へ変えた。
// プールが attemptSeed 以外に依存すると restoreMockSession が復元失敗を返し、
// **時間制限つき模試の答案が丸ごと消える**（advMockSession.ts の「答えたキーが1つでも
// プールに無ければ null」）。純関数テストだけでなく、画面の配線でも固定しておく。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup); // vitest globals無効のため明示クリーンアップ

import { AdvMockRunner } from './AdvMockRunner';
import { buildMockSpec } from '../../../lib/aiLesson/course/adventure/advMock';
import { startMockSession, type MockSessionState } from '../../../lib/aiLesson/course/adventure/advMockSession';
import { mockVocabPool, clearVocabSubsetCache } from '../../../lib/aiLesson/course/adventure/vocab/vocabSubset';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';

const LEVEL = 'N3' as const;
const SEED = 20260817001;
const spec = buildMockSpec(LEVEL, { vocabCount: 999, grammarCount: 0, readingCount: 0, listeningCount: 0 });

/** 途中まで答えた保存状態を作る（生徒が5問答えてアプリを閉じた状態） */
const savedStateWithAnswers = (): MockSessionState => {
  const rt = startMockSession(spec, mockVocabPool(LEVEL, SEED), 'short', SEED, '2026-08-17T00:00:00Z');
  if (!rt) throw new Error('模試セッションが作れない（プールが空）');
  const answers: Record<string, string> = {};
  for (const q of rt.sections[0].questions.slice(0, 5)) answers[q.key] = q.choices[0].choiceId;
  expect(Object.keys(answers)).toHaveLength(5);
  return { ...rt.state, answers };
};

const renderRunner = (
  pools: Map<string, AdvBattleQuestion[]>,
  state: MockSessionState,
  onPersist = vi.fn(),
) => {
  render(
    <AdvMockRunner
      lang="ja" spec={spec} pools={pools} attemptSeed={state.attemptSeed}
      seenKeys={new Set()} savedState={state}
      onPersist={onPersist} onFinish={vi.fn()} onClose={vi.fn()}
    />,
  );
  return onPersist;
};

describe('ミニ模試の途中復帰', () => {
  it('保存した attemptSeed から作り直したプールで再開できる（答案が消えない）', () => {
    const state = savedStateWithAnswers();
    // リロード相当: キャッシュを捨て、保存された attemptSeed だけからプールを作り直す
    clearVocabSubsetCache();
    const onPersist = renderRunner(mockVocabPool(LEVEL, state.attemptSeed), state);

    expect(screen.queryByText(/再開できませんでした/)).toBeNull();
    expect(screen.getByRole('button', { name: 'このセクションを始める' })).toBeTruthy();
    // 復元失敗時だけ保存状態を捨てる（=null保存）。成功したので呼ばれない
    expect(onPersist).not.toHaveBeenCalledWith(null);
  }, 300_000);

  it('プールが噛み合わないときは黙って捨てず、理由を出して最初からにする（行き止まりを作らない）', () => {
    const state = savedStateWithAnswers();
    const onPersist = renderRunner(new Map(), state);

    expect(screen.getByText(/再開できませんでした/)).toBeTruthy();
    expect(onPersist).toHaveBeenCalledWith(null);
  }, 300_000);
});
