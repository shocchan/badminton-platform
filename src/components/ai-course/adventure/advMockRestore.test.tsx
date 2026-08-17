// @vitest-environment jsdom
// ミニ模試の「途中まで答えた答案が消えない」ことを実コンポーネントで確かめる。
//
// 2026-08-17、語彙の出題プールを全量生成から部分生成（vocabSubset）へ変えた。
// プールが attemptSeed 以外に依存すると restoreMockSession が復元失敗を返し、
// **時間制限つき模試の答案が丸ごと消える**（advMockSession.ts の「答えたキーが1つでも
// プールに無ければ null」）。純関数テストだけでなく、画面の配線でも固定しておく。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

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

/**
 * 模試の締めで保存を2回投げない（2026-08-18 監査P1）。
 *
 * 以前は `onPersist(null)`（mockSessionを消すだけ＝結果を含まない保存）と
 * `onFinish(graded)`（mastery・mockLog・XPを含む保存）を同じtickに撃っていた。
 * どちらも await せずに投げるので、到着順が入れ替わると
 * **20分かけた模試の記録が丸ごと消える**（保存RPCはトップレベル置換）。
 */
describe('ミニ模試の締め（保存は1回だけ）', () => {
  /** 語彙bankを読まない軽量プール（この検査に本物の語は要らない） */
  const fakeQuestion = (key: string): AdvBattleQuestion => ({
    key, type: 'rec', level: 'n3', skill: 'charactersVocabulary', examSection: 'languageKnowledge',
    targetJapanese: `対象${key}`, questionJa: `設問${key}`, questionZh: `问题${key}`,
    choices: ['a', 'b', 'c', 'd'].map((c) => ({ choiceId: `${key}-${c}`, textJa: `選択${c}`, isCorrect: c === 'a' })),
    explanation: {
      meaningJa: '', meaningZh: '', whyCorrectJa: '', whyCorrectZh: '',
      exampleJa: null, exampleZh: null, sourceItemId: `src-${key}`, sourceLabel: key,
    },
    sourceItemId: `src-${key}`, difficulty: 2, timed: true, variantId: `${key}-v`,
    reviewState: 'authored', status: 'authored',
  });

  it('最終セクションを採点しても onPersist(null) を撃たない（保存は onFinish の1回）', () => {
    const pools = new Map<string, AdvBattleQuestion[]>([
      ['vocab', Array.from({ length: 12 }, (_, i) => fakeQuestion(`v${i}`))],
    ]);
    const oneSection = buildMockSpec('N3', { vocabCount: 12, grammarCount: 0, readingCount: 0, listeningCount: 0 });
    expect(oneSection.sections).toHaveLength(1);
    const rt = startMockSession(oneSection, pools, 'short', SEED, '2026-08-18T00:00:00Z')!;
    // 全問回答済みの状態から再開する（未回答の警告を挟まずに提出できる）
    const answers: Record<string, string> = {};
    for (const p of rt.sections[0].presented) answers[p.key] = p.choices[0].choiceId;
    const state: MockSessionState = { ...rt.state, answers };

    const events: string[] = [];
    const onPersist = vi.fn((s: MockSessionState | null) => { events.push(s === null ? 'persist:null' : 'persist'); });
    const onFinish = vi.fn(() => { events.push('finish'); });
    render(
      <AdvMockRunner
        lang="ja" spec={oneSection} pools={pools} attemptSeed={state.attemptSeed}
        seenKeys={new Set()} savedState={state}
        onPersist={onPersist} onFinish={onFinish} onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'このセクションを始める' }));
    const last = rt.sections[0].questions.length;
    fireEvent.click(screen.getByRole('button', { name: `問題${last}（回答済み）` }));
    fireEvent.click(screen.getByRole('button', { name: 'このセクションを終える' }));
    fireEvent.click(screen.getByRole('button', { name: '採点する' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onPersist).not.toHaveBeenCalledWith(null);
    // 結果を含まない保存が、結果を含む保存の後に飛んでいない
    expect(events[events.length - 1]).toBe('finish');
  });
});
