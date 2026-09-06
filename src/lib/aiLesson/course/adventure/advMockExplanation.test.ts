// 模試の間違い直しが、**どの級でも同じだけ揃っている**こと（2026-09-06 CEO確認）。
//
// 級を増やすたびに「問題は出るが解説が空」が起きうる。実際に模試を1回組み立てて、
// 間違い直しに残る材料（設問／本文／選択肢／解説ja・zh／正解）が全問そろうことを見る。
// 聴解はN1では作らない方針なので、科目の数は級によって違ってよい。
import { describe, it, expect } from 'vitest';
import { buildMockSpec, MOCK_LEVELS } from './advMock';
import { loadGrammarPools } from './advContent';
import { mockVocabPool } from './vocab/vocabSubset';
import { readingPool } from './reading/readingBank';
import { listeningPool } from './listening/listeningBank';
import { startMockSession, toMockWrongDetails } from './advMockSession';

const NOW = '2026-09-06T00:00:00.000Z';

describe('模試の間違い直しの材料', () => {
  for (const level of MOCK_LEVELS) {
    it(`${level}: 全問に設問（または本文）・選択肢・解説ja/zh・正解がある`, async () => {
      const pools = await loadGrammarPools();
      const vPool = level === 'N1' || level === 'N2' || level === 'N3'
        ? mockVocabPool(level, 42) : new Map();
      const rPool = readingPool(level);
      const lPool = listeningPool(level);

      let vocabCount = 0; let grammarCount = 0;
      for (const qs of [...pools.byItem.values(), ...vPool.values()]) {
        for (const q of qs) {
          if (q.skill === 'charactersVocabulary') vocabCount += 1;
          else if (q.skill === 'grammar') grammarCount += 1;
        }
      }
      const readingCount = [...rPool.values()].reduce((n, v) => n + v.length, 0);
      const listeningCount = [...lPool.values()].reduce((n, v) => n + v.length, 0);
      const spec = buildMockSpec(level, { vocabCount, grammarCount, readingCount, listeningCount });

      const merged = new Map(pools.byItem);
      for (const [k, v] of vPool) merged.set(k, v);
      for (const [k, v] of rPool) merged.set(k, v);
      for (const [k, v] of lPool) merged.set(k, v);

      const rt = startMockSession(spec, merged, 'short', 4242, NOW);
      expect(rt, `${level}: 模試を組み立てられない`).toBeTruthy();

      // 1問も答えていない＝全問が間違い直しに載る。ここで材料の欠けが全部見える
      const details = toMockWrongDetails(rt!);
      const total = rt!.sections.reduce((n, s) => n + s.questions.length, 0);
      expect(details.length, `${level}: 出題数と間違い直しの数が合わない`).toBe(total);
      expect(details.length).toBeGreaterThan(0);

      const missing: string[] = [];
      for (const d of details) {
        const miss: string[] = [];
        if (!d.stemJa && !d.stemZh && !d.passageJa && !d.transcriptJa) miss.push('設問も本文も無い');
        if (!d.whyJa) miss.push('解説(ja)が空');
        if (!d.whyZh) miss.push('解説(zh)が空');
        if ((d.choicesJa?.length ?? 0) < 3) miss.push('選択肢が3つ未満');
        if (!d.correctTextJa) miss.push('正解が空');
        if (miss.length) missing.push(`${d.sectionLabelJa}${d.index} ${d.key}: ${miss.join('/')}`);
      }
      expect(missing, `${level} の間違い直しに欠けがある`).toEqual([]);
    }, 120_000);
  }
});
