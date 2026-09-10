/*
 * Practical Axis のタグ付け（2026-09-10 Phase 2-1）。
 *
 * 守りたいこと:
 *   ・**間違ったタグを出さない**（数を増やすより優先する）
 *   ・根拠が必ず残る（あとから人が直せる）
 *   ・既存の語彙データを1語も書き換えていない
 *   ・「病院で必要な語」「会社で依頼するときの語」が実際に引ける
 */
import { describe, it, expect } from 'vitest';
import {
  tagWord, tagWords, wordsInDomain, wordsInDomainSituation, tagQaReport, qaSamples,
  type TaggableWord,
} from './practicalTagger';
import { PRACTICAL_DOMAINS, SITUATION_TAGS, DOMAIN_LABELS, SITUATION_LABELS } from './practicalAxis';
import { vocabScopedActive } from '../adventure/vocab/vocabQuestions';

const w = (o: Partial<TaggableWord> & { wordId: string; surface: string }): TaggableWord => o;

describe('タグの付け方', () => {
  it('見出し語そのものが分野語なら strong', () => {
    const t = tagWord(w({ wordId: 'x1', surface: '病院' }));
    expect(t.domains).toEqual([{ domain: 'health', confidence: 'strong', via: '病院', source: 'surface' }]);
  });

  it('説明文はその語の**定義**なので strong（例文とは違う）', () => {
    const t = tagWord(w({
      wordId: 'x2', surface: '代金',
      explanationJa: '「代金」は買った物に対して払うお金です。',
    }));
    expect(t.domains.map((d) => d.domain).sort()).toContain('money');
    for (const d of t.domains) expect(d.confidence).toBe('strong');
  });

  it('**例文は根拠にしない**（例文の分野語は「その1文の状況」であって語の分野ではない）', () => {
    // 実データで起きていた誤判定そのもの
    const t = tagWord(w({ wordId: 'x3', surface: '今日', exampleJa: '今日は仕事が忙しいです。' }));
    expect(t.domains).toEqual([]);
  });

  it('**1文字の手がかり語は完全一致だけ**（「意味」が「味」に当たって food になった事故）', () => {
    expect(tagWord(w({ wordId: 'x4', surface: '意味' })).domains).toEqual([]);
    // 「金」そのものは money（完全一致なので採る）
    expect(tagWord(w({ wordId: 'x5', surface: '金' })).domains.map((d) => d.domain)).toContain('money');
  });

  it('連語は weak（使われ方であって、その語の分野とは限らない）', () => {
    const t = tagWord(w({ wordId: 'x6', surface: '広い', collocationsJa: ['部屋が広い'] }));
    const housing = t.domains.find((d) => d.domain === 'housing');
    expect(housing?.confidence).toBe('weak');
    expect(housing?.source).toBe('collocation');
  });

  it('1語が複数の分野を持てる', () => {
    const t = tagWord(w({
      wordId: 'x7', surface: '予約',
      explanationJa: '「予約」は病院やレストランで席や時間を先に決めておくことです。',
    }));
    const ds = t.domains.map((d) => d.domain);
    expect(ds).toContain('health');
    expect(ds).toContain('food');
  });

  it('**手がかりが無ければ何も付けない**（「たぶんsocial」で埋めない）', () => {
    expect(tagWord(w({ wordId: 'x8', surface: 'それ', exampleJa: 'それは私のかばんです。' })).domains).toEqual([]);
  });

  it('根拠が必ず残る（あとから人が直せる）', () => {
    for (const d of tagWord(w({ wordId: 'x9', surface: '駅' })).domains) {
      expect(d.via.length).toBeGreaterThan(0);
      expect(['surface', 'definition', 'collocation']).toContain(d.source);
    }
  });
});

describe('引ける（この軸の目的）', () => {
  const words: TaggableWord[] = [
    w({ wordId: 'v1', surface: '病院', level: 'N5' }),
    w({ wordId: 'v2', surface: '会社', level: 'N4' }),
    w({ wordId: 'v3', surface: 'お願い', level: 'N5', explanationJa: '「お願い」は相手に何かを頼むときの言葉です。会社でも使います。' }),
    w({ wordId: 'v4', surface: 'それ', level: 'N5' }),
  ];
  const tagged = tagWords(words);
  const byId = new Map(words.map((x) => [x.wordId, x]));

  it('「病院で必要な語」が引ける', () => {
    expect(wordsInDomain(tagged, byId, 'health').map((x) => x.surface)).toEqual(['病院']);
  });

  it('級で絞れる（JLPT Axis と併用できる）', () => {
    expect(wordsInDomain(tagged, byId, 'health', { level: 'N4' })).toEqual([]);
    expect(wordsInDomain(tagged, byId, 'health', { level: 'N5' }).length).toBe(1);
  });

  it('**「会社で依頼するときの語」が引ける**（どこで × 何をする）', () => {
    const got = wordsInDomainSituation(tagged, byId, 'work', 'requesting');
    expect(got.map((x) => x.surface)).toContain('お願い');
  });

  it('既定では weak を出さない（画面に出すのは確かなものだけ）', () => {
    const only = [w({ wordId: 'v9', surface: '広い', collocationsJa: ['部屋が広い'] })];
    const t = tagWords(only);
    const m = new Map(only.map((x) => [x.wordId, x]));
    expect(wordsInDomain(t, m, 'housing')).toEqual([]);
    expect(wordsInDomain(t, m, 'housing', { includeWeak: true }).length).toBe(1);
  });
});

describe('分野・場面の定義', () => {
  it('全分野・全場面に日本語と中国語のラベルがある', () => {
    for (const d of PRACTICAL_DOMAINS) {
      expect(DOMAIN_LABELS[d].ja.length, d).toBeGreaterThan(0);
      expect(/[ぁ-んァ-ヴ]/.test(DOMAIN_LABELS[d].zh), `${d} の中国語にかな`).toBe(false);
    }
    for (const s of SITUATION_TAGS) {
      expect(SITUATION_LABELS[s].ja.length, s).toBeGreaterThan(0);
      expect(/[ぁ-んァ-ヴ]/.test(SITUATION_LABELS[s].zh), `${s} の中国語にかな`).toBe(false);
    }
  });
});

describe('**本番の語彙4,697語に当てたQA**', () => {
  const all = vocabScopedActive('N1' as never) as unknown as TaggableWord[];
  const tagged = tagWords(all);
  const r = tagQaReport(all, tagged);

  it('語彙データを1語も書き換えていない（タグは別レイヤー）', () => {
    // タグ付けは純関数。元の配列の要素にプロパティが増えていないこと
    expect(Object.keys(all[0])).not.toContain('domains');
    expect(Object.keys(all[0])).not.toContain('situations');
    expect(tagged.length).toBe(all.length);
  });

  it('strong 根拠のタグが1,000語以上に付く', () => {
    expect(r.taggedStrong).toBeGreaterThanOrEqual(1000);
  });

  it('**弱い根拠のタグが少ない**（多いと軸が信用されない）', () => {
    // 例文を根拠にしていた時は2,660本あった。定義文へ替えて大幅に減った
    expect(r.suspicious).toBeLessThan(600);
  });

  it('10分野すべてに語がある（空の入口を作らない）', () => {
    for (const d of PRACTICAL_DOMAINS) {
      expect(r.perDomain[d]?.strong ?? 0, `${d} に strong の語が無い`).toBeGreaterThan(20);
    }
  });

  it('全級にタグ付きの語がある', () => {
    for (const lv of ['N1', 'N2', 'N3', 'N4', 'N5']) {
      expect(r.perLevel[lv]?.tagged ?? 0, `${lv} にタグ付きの語が無い`).toBeGreaterThan(30);
    }
  });

  it('複数分野を持つ語がある（1語1分野に押し込めていない）', () => {
    expect(r.multiDomainRatio).toBeGreaterThan(0.02);
  });

  it('**タグの無い語が残るのは正常**（機能語・抽象語に分野は無い）', () => {
    expect(r.untagged).toBeGreaterThan(0);
    const s = qaSamples(all, tagged, 3);
    expect(s.untagged.length).toBeGreaterThan(0);
  });

  it('人が確かめるための見本が出せる', () => {
    const s = qaSamples(all, tagged, 5);
    expect(s.strong.length).toBeGreaterThan(0);
    for (const line of s.strong) expect(line).toMatch(/→ \w+ \[(surface|definition|collocation):/);
  });
});
