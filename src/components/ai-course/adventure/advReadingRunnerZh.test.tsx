// @vitest-environment jsdom
// zh画面の「其他选项为什么不对」に日本語がそのまま出ないことの回帰テスト。
// 読解の本文・選択肢は日本語のままで正しい（それが読解）が、誤答理由は解説なので
// zh画面では中国語で出す。runner側が whyWrongZh を無視していた不具合の再発防止。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
afterEach(cleanup);
import { AdvReadingRunner } from './AdvReadingRunner';
import { readingSetsFor } from '../../../lib/aiLesson/course/adventure/reading/readingBank';

const KANA = /[ぁ-ゟ゠-ヿ]/;

const reasonsShown = () => {
  const heading = screen.getByText(/ほかの選択肢が違う理由|其他选项为什么不对/);
  return Array.from(heading.parentElement!.querySelectorAll('li'))
    .map((n) => (n.textContent ?? '').split(' — ').slice(1).join(' — '));
};

describe('読解runner: zh画面の誤答理由', () => {
  for (const lvl of ['N5', 'N4'] as const) {
    it(`${lvl}: 全セットのzh理由にかなが出ない（実レンダリング）`, () => {
      const sets = readingSetsFor(lvl);
      expect(sets.length).toBe(48);
      const leaks: string[] = [];
      for (const set of sets) {
        render(<AdvReadingRunner lang="zh" sets={[set]} onFinish={() => {}} onClose={() => {}} />);
        const wrong = set.choices.find((c) => !c.isCorrect)!;
        fireEvent.click(screen.getByRole('button', { name: wrong.textJa }));
        for (const r of reasonsShown()) if (KANA.test(r)) leaks.push(`${set.setId}: ${r}`);
        cleanup();
      }
      expect(leaks).toEqual([]);
    });
  }

  it('ja画面は日本語のまま（退行していない）', () => {
    const set = readingSetsFor('N5')[0];
    render(<AdvReadingRunner lang="ja" sets={[set]} onFinish={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: set.choices.find((c) => !c.isCorrect)!.textJa }));
    const shown = reasonsShown();
    for (const c of set.choices.filter((c) => !c.isCorrect)) expect(shown).toContain(c.whyWrongJa);
  });

  it('zh画面には対応する中国語が出る（1問の実文面）', () => {
    const set = readingSetsFor('N5')[0];
    render(<AdvReadingRunner lang="zh" sets={[set]} onFinish={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: set.choices.find((c) => !c.isCorrect)!.textJa }));
    const shown = reasonsShown();
    console.log('[zh]', JSON.stringify(shown, null, 1));
    for (const c of set.choices.filter((c) => !c.isCorrect)) expect(shown).toContain(c.whyWrongZh);
  });
});
