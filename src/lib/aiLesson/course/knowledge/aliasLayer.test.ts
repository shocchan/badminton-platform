/*
 * Alias層（2026-09-10 Phase 2-2）。
 *
 * 守りたいこと:
 *   ・「無い」と「書き方が違うだけ」を取り違えない
 *   ・〜ています／〜ている を別教材にしない（同じ概念の丁寧体／普通体）
 *   ・当てずっぽうで繋がない（決められないものは ambiguous / none）
 *   ・既存の表示文字列は1文字も変えない（読むだけ）
 */
import { describe, it, expect } from 'vitest';
import {
  splitQualifier, formVariants, buildAliasIndex, resolveAlias, resolvePartial, classifyUnresolved,
} from './aliasLayer';

const items = [
  { grammarId: 'n5g-wa', pattern: '〜は（主題）' },
  { grammarId: 'n5g-teimasu-progressive', pattern: '〜ています（進行）' },
  { grammarId: 'n5g-teimasu-state', pattern: '〜ています（状態）' },
  { grammarId: 'n4g-soudesu-denbun', pattern: '〜そうです（伝聞）' },
  { grammarId: 'n4g-soudesu-youtai', pattern: '〜そうです（様態）' },
  { grammarId: 'n4g-hazudesu', pattern: '〜はずです' },
  { grammarId: 'n5g-mashou-masenka', pattern: '〜ましょう／〜ませんか' },
  { grammarId: 'n4g-tameni', pattern: '〜ために' },
  { grammarId: 'n2g-142', pattern: '〜はともかくとして' },
  { grammarId: 'n3g-taritari', pattern: '〜たり、〜たりする' },
  { grammarId: 'n4g-toomoimasu', pattern: '〜と思います' },
];
const index = buildAliasIndex(items);

describe('splitQualifier', () => {
  it('括弧の曖昧さ回避を芯と分ける', () => {
    expect(splitQualifier('〜そうです（伝聞）')).toEqual({ core: '〜そうです', qualifier: '伝聞' });
    expect(splitQualifier('〜ために')).toEqual({ core: '〜ために', qualifier: null });
  });
});

describe('formVariants', () => {
  it('丁寧体と普通体を同じ概念の別形として生む', () => {
    expect(formVariants('〜はずだ')).toContain('はずです');
    expect(formVariants('〜ている')).toContain('ています');
  });
  it('末尾の助詞の有無を吸収する（〜ため ↔ 〜ために）', () => {
    expect(formVariants('〜ため')).toContain('ために');
    expect(formVariants('〜次第では')).toContain('次第');
  });
});

describe('resolveAlias', () => {
  it('括弧付きの教材へ、括弧なしの参照から届く', () => {
    expect(resolveAlias(index, '〜は')).toEqual({ kind: 'exact', id: 'n5g-wa' });
  });

  it('**〜ています は別教材ではなく、既存2項目のどちらか**（括弧が無いと決められない＝ambiguous）', () => {
    const r = resolveAlias(index, '〜ています');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.ids.sort()).toEqual(['n5g-teimasu-progressive', 'n5g-teimasu-state']);
  });

  it('括弧があれば1つに決まる', () => {
    expect(resolveAlias(index, '〜そうだ（伝聞）')).toEqual({ kind: 'variant', id: 'n4g-soudesu-denbun' });
  });

  it('丁寧体／普通体の違いは variant', () => {
    expect(resolveAlias(index, '〜はずだ')).toEqual({ kind: 'variant', id: 'n4g-hazudesu' });
  });

  it('複合パターンの片側から届く（〜ませんか → 〜ましょう／〜ませんか）', () => {
    expect(resolveAlias(index, '〜ませんか').kind).not.toBe('none');
  });

  it('**当たらなければ none**（近い項目へ当てずっぽうで繋がない）', () => {
    expect(resolveAlias(index, '〜につれて')).toEqual({ kind: 'none' });
  });
});

describe('resolvePartial', () => {
  it('既存項目の一部は partial として既存へ繋ぐ（新教材にしない）', () => {
    expect(resolvePartial(index, '〜はともかく')?.id).toBe('n2g-142');
    expect(resolvePartial(index, '〜たり〜たり')?.id).toBe('n3g-taritari');
    expect(resolvePartial(index, '〜と思う')?.id).toBe('n4g-toomoimasu');
  });
  it('2文字以下の芯では見ない（何にでも含まれて誤爆する）', () => {
    expect(resolvePartial(index, '〜は')).toBe(null);
  });
});

describe('classifyUnresolved', () => {
  it('alias / partial / non-item / missing に分かれる', () => {
    const rows = classifyUnresolved(index, [
      { display: '〜ため', refs: 6 },
      { display: '〜はともかく', refs: 2 },
      { display: '〜より', refs: 2 },
      { display: '〜につれて', refs: 4 },
      { display: '〜ています', refs: 5 },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.display, r.cls]));
    expect(by['〜ため']).toBe('alias');
    expect(by['〜はともかく']).toBe('partial');
    expect(by['〜より']).toBe('non-item');
    expect(by['〜につれて']).toBe('missing');
    expect(by['〜ています']).toBe('ambiguous');
  });

  it('人が決めた対応表が機械の規則より先に効く（誤爆していた partial を上書き）', () => {
    const rows = classifyUnresolved(index, [
      { display: '〜結果', refs: 2 }, { display: '〜ですよね', refs: 2 }, { display: '〜てくださる', refs: 2 },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.display, r]));
    expect(by['〜結果']).toMatchObject({ cls: 'alias', id: 'n3g-takekka' });
    expect(by['〜ですよね']).toMatchObject({ cls: 'alias', id: 'n5g-ne-yo' });
    expect(by['〜てくださる']).toMatchObject({ cls: 'alias', id: 'n4g-tekureru' });
  });

  it('**「未解決＝新教材」にしない**：missing 以外は既存へ繋がる', () => {
    const rows = classifyUnresolved(index, [
      { display: '〜ため', refs: 6 }, { display: '〜はともかく', refs: 2 },
    ]);
    for (const r of rows) expect(r.id, r.display).toBeTruthy();
  });
});
