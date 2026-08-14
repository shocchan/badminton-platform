// @vitest-environment jsdom
// バトル中の相棒の応援（§8・CEO要望 2026-08-14「相棒も活躍する場面を」）。
//
// いちばん守りたいこと:
// - 誤答時に相棒の励ましが出る（責めない文言）
// - 3問連続正解で相棒が褒める（1問目・2問目では出ない＝うるさくしない）
// - 相棒は**表示のみ**。採点・出題には関与しない（選択肢は全問そのまま出る）
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AdvBattleRunner } from './AdvBattleRunner';
import type { AdvBattleQuestion } from '../../../lib/aiLesson/course/adventure/advVariants';

const q = (i: number, type: string): AdvBattleQuestion => ({
  key: `t:q${i}`,
  type,
  level: 'n3',
  skill: 'grammar',
  examSection: 'languageKnowledge',
  targetJapanese: `対象${i}`,
  questionJa: `設問${i}`,
  questionZh: `问题${i}`,
  choices: [
    { choiceId: `q${i}-ok`, textJa: '正しい', isCorrect: true },
    { choiceId: `q${i}-x1`, textJa: 'ちがう一', isCorrect: false },
    { choiceId: `q${i}-x2`, textJa: 'ちがう二', isCorrect: false },
    { choiceId: `q${i}-x3`, textJa: 'ちがう三', isCorrect: false },
  ],
  explanation: {
    meaningJa: '意味', meaningZh: '意思',
    whyCorrectJa: '正解の理由', whyCorrectZh: '正确的理由',
    exampleJa: null, exampleZh: null,
    sourceItemId: `src-${i}`, sourceLabel: `出典${i}`,
  },
  sourceItemId: `src-${i}`,
  difficulty: 2,
  timed: false,
  variantId: `q${i}-v`,
  reviewState: 'authored',
  status: 'authored',
});

const renderBattle = () => {
  const pool = new Map<string, AdvBattleQuestion[]>([
    ['t1', Array.from({ length: 8 }, (_, i) => q(i, i % 2 === 0 ? 'rec' : 'use'))],
  ]);
  render(
    <AdvBattleRunner
      lang="ja" tier="normal" targetId="t1" targetLabel="対象" targetIds={['t1']}
      pool={pool} seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
      dateKey="2026-08-14" nowISO="2026-08-14T10:00:00.000Z" level="N3"
      companionId="natsu"
      onFinish={vi.fn()} onClose={vi.fn()} />,
  );
};

const answer = (textJa: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(textJa) }));
};
const next = () => {
  fireEvent.click(screen.getByRole('button', { name: /つぎの問題|結果を見る/ }));
};

afterEach(cleanup);

describe('バトル中の相棒の応援', () => {
  it('誤答すると相棒の励ましが出る（正解時1問目では出ない）', () => {
    renderBattle();
    answer('ちがう一');
    expect(screen.getByText(/だいじょうぶ。解説をいっしょに読も/)).toBeTruthy();
    next();
    answer('正しい');
    // 1問だけの正解では褒めは出ない（うるさくしない）
    expect(screen.queryByText(/すごい集中力/)).toBeNull();
  });

  it('3問連続正解で相棒が褒める', () => {
    renderBattle();
    answer('正しい');
    expect(screen.queryByText(/連続！/)).toBeNull();
    next();
    answer('正しい');
    expect(screen.queryByText(/連続！/)).toBeNull();
    next();
    answer('正しい');
    expect(screen.getByText(/3問連続！すごい集中力/)).toBeTruthy();
  });

  it('相棒がいても選択肢は4つ全部出る（採点・出題に関与しない）', () => {
    renderBattle();
    expect(screen.getByRole('button', { name: /^正しい$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ちがう一/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ちがう二/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ちがう三/ })).toBeTruthy();
  });
});
