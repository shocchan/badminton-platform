// cloze の選択肢に「語として壊れた断片」が1つも出ないことの全件検査。
//
// 背景（2026-08-17 実測）:
//   matchKeys は「例文のどこに文型が出ているか」を探すための照合キーで、活用形に当てるため
//   語の途中で切ってある（「てしま」⊂てしまいます／「と思い」⊂と思います／「ておい」⊂ておいてください）。
//   これを cloze の選択肢テキストへそのまま転用していたため、
//   誤答スロット1227のうち121（cloze 409問中106問＝25.9%）に日本語として読めない断片が出ていた。
//   pattern に 〜 が2つある項目では「〜に〜られる」→「にられる」のように、
//   **日本語として存在しない文字列**が誤答に並んでいた。
//
// ここで守る不変条件:
//   cloze の全選択肢（正解・誤答とも）は、その出典項目の pattern 由来の表示形か、
//   「より長い既知形の途中で切られていない」matchKey のどちらかであること。
import { describe, it, expect } from 'vitest';
import {
  buildVariantPool, displayFormsOf, distractorTextsOf, isDisplayableMatchKey, matchKeysOf,
  type AdvBattleQuestion, type GrammarDraftLike,
} from './advVariants';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';
import { loadAllBasicDrafts } from '../basicGrammarChunks';

const loadAllN2 = async (): Promise<GrammarDraftLike[]> => {
  const all: GrammarDraftLike[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) all.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);
  return all;
};

interface Bank { name: string; level: 'foundation' | 'n3' | 'n2'; drafts: GrammarDraftLike[]; alias: Set<string> }

const loadBanks = async (): Promise<Bank[]> => [
  { name: 'basic', level: 'foundation', drafts: (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[], alias: new Set() },
  { name: 'n3', level: 'n3', drafts: N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], alias: new Set() },
  { name: 'n2', level: 'n2', drafts: await loadAllN2(), alias: new Set(Object.keys(N2_GRAMMAR_ALIASES)) },
];

const collectCloze = (banks: Bank[]): { bank: string; q: AdvBattleQuestion }[] => {
  const out: { bank: string; q: AdvBattleQuestion }[] = [];
  for (const b of banks) {
    const pool = buildVariantPool(b.drafts, b.level, b.alias);
    for (const qs of pool.byItem.values()) for (const q of qs) if (q.type === 'cloze') out.push({ bank: b.name, q });
  }
  return out;
};

/** 誤答の解説文「「〜てしまいます」は…の意味で、この文には合いません。」から出典patternを取り出す */
const patternFromWhy = (why: string | undefined): string | null => {
  const m = why?.match(/^「([^」]+)」/u);
  return m ? m[1] : null;
};

/** その項目が学習者に見せてよいテキストの集合 */
const readableTextsOf = (d: GrammarDraftLike): Set<string> => {
  const forms = displayFormsOf(d);
  const keys = matchKeysOf(d);
  return new Set([
    ...forms,
    ...keys.filter((k) => isDisplayableMatchKey(k, forms, keys)),
    ...distractorTextsOf(d),
  ]);
};

describe('cloze の選択肢に語として壊れた断片が出ない（全バンク全件）', () => {
  it('誤答テキストは必ず出典項目の「読める表示形」である', async () => {
    const banks = await loadBanks();
    const byPattern = new Map<string, GrammarDraftLike>();
    for (const b of banks) for (const d of b.drafts) if (!byPattern.has(d.pattern)) byPattern.set(d.pattern, d);

    const clozes = collectCloze(banks);
    expect(clozes.length).toBeGreaterThan(0);

    const bad: string[] = [];
    let checked = 0;
    for (const { bank, q } of clozes) {
      for (const c of q.choices) {
        if (c.isCorrect) continue;
        const pat = patternFromWhy(c.whyWrongJa);
        const src = pat ? byPattern.get(pat) : undefined;
        // 出典が特定できない誤答は、そもそも解説が壊れているので失敗させる
        if (!src) { bad.push(`${bank} ${q.key}: 誤答「${c.textJa}」の出典が特定できない (why=${c.whyWrongJa ?? 'なし'})`); continue; }
        checked += 1;
        if (!readableTextsOf(src).has(c.textJa)) {
          bad.push(`${bank} ${q.key}: 誤答「${c.textJa}」は出典「${src.pattern}」の読める表示形ではない`);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(bad, `語として壊れた誤答 ${bad.length}件:\n${bad.slice(0, 30).join('\n')}`).toEqual([]);
  });

  it('正解テキストも語の途中で切れていない', async () => {
    const banks = await loadBanks();
    const byId = new Map<string, GrammarDraftLike>();
    for (const b of banks) for (const d of b.drafts) byId.set(d.grammarId, d);

    const bad: string[] = [];
    for (const { bank, q } of collectCloze(banks)) {
      const correct = q.choices.find((c) => c.isCorrect);
      const src = byId.get(q.sourceItemId);
      if (!correct || !src) { bad.push(`${bank} ${q.key}: 正解または出典が無い`); continue; }
      if (!readableTextsOf(src).has(correct.textJa)) {
        bad.push(`${bank} ${q.key}: 正解「${correct.textJa}」が語の途中で切れている（出典「${src.pattern}」）`);
      }
    }
    expect(bad, `語として壊れた正解 ${bad.length}件:\n${bad.slice(0, 30).join('\n')}`).toEqual([]);
  });

  it('2026-08-17に実測した断片24キーは選択肢に一切現れない（回帰用の実測リスト）', async () => {
    // 修正前に「cloze の誤答として実際に出題されていた」ことを実測で確認したキー
    const MEASURED_BROKEN = [
      'と思い', 'し、', 'と言い', 'にられる', 'やなど', 'に決まって', 'に相違', 'てしま',
      'ここ・そこ・あそこ', 'に過ぎ', 'に違いな', 'にわたっ', 'に基づ', 'ようにし', 'ことになり',
      'に住', 'に伴っ', 'にほかなら', 'ずにはいられ', 'だれ・なに・どこ', 'ていき', 'てみ',
      'に反し', 'で働',
      // 正解として出ていた分＋後から見つかった分
      'ざるを得', 'ないことはな', 'てあり', 'てきま', 'ておき', 'ておい', 'へ帰', 'に置', 'ことにし',
      // pattern がスロットを跨いで接着された自動生成キー
      'もも', 'たりたりする', 'やらやら',
      // 文法書のラベル（日本語ではない）
      '動詞て形', '動詞ない形', '動詞た形', '普通形', 'い形容詞', 'な形容詞', '名詞',
    ];
    const banned = new Set(MEASURED_BROKEN);
    const hits: string[] = [];
    for (const { bank, q } of collectCloze(await loadBanks())) {
      for (const c of q.choices) {
        if (banned.has(c.textJa)) hits.push(`${bank} ${q.key}: ${c.isCorrect ? '正解' : '誤答'}に「${c.textJa}」`);
      }
    }
    expect(hits, `断片が復活している ${hits.length}件:\n${hits.slice(0, 30).join('\n')}`).toEqual([]);
  });

  it('cloze の総数が実測水準を下回らない（断片を消すために出題を削っていないこと）', async () => {
    // 2026-08-17 の推移（すべて実測）:
    //   409問 → 416問（断片の除去）→ **343問**（語幹の切断を止めた分の減少）
    //
    // 最後の -73 は意図した減少。「毎朝、コーヒーを飲＿＿、会社に行きます。」正解「んで」のように
    // **穴が語の内部へ食い込んでいた47問**（と、その例文しか無かった項目のぶん）を出さなくした。
    // 語幹だけが残る文は、学習者に何を問われているか読めず、文法も測っていない。
    // 数を守るためにこれを戻すことはしない（advVariants.splitsWordStem のテストが本体）。
    const clozes = collectCloze(await loadBanks());
    expect(clozes.length).toBeGreaterThanOrEqual(340);
  });

  it('**cloze を減らした結果、出題が1問も無くなった項目は無い**（数より大事な不変条件）', async () => {
    // 総数の下限より、こちらが本命。cloze が作れなくても rec / meaning / form が残ればよい。
    // 「この文法は学べない」項目を作らないことだけは絶対に守る
    const empty: string[] = [];
    for (const b of await loadBanks()) {
      const pool = buildVariantPool(b.drafts, b.level, b.alias);
      for (const id of pool.stats.itemsWithZeroQuestions) empty.push(`${b.name}:${id}`);
    }
    expect(empty, `出題0問の項目 ${empty.length}件`).toEqual([]);
  });
});
