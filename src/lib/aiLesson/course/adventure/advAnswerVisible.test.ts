// 「答えがそのまま見えている問題」を出さないことの全件検査（2026-08-18 CEO指示）。
//
// 既存の3つの検査が守っていた範囲:
//   - quality/assessAnswerLeak.test.ts … n3unit の設問「」内の語の漏洩だけ
//   - advVariants.test.ts (c) …………… **rec問題**の見出し漏洩だけ
//   - advReading.test.ts ……………………… 読解の長さバイアス・逐語一致だけ
// この3つの外側（cloze / meaning / form の漏洩、文法問題の長さバイアス、
// 選択肢の「形」で当てられるテル）が無検査で、実測すると以下が残っていた:
//   ① form 38問中13問で、設問に出ている見出しが正解の中に写っていた
//      （「〜なければなりません」の接続はどれですか。→ 正解「動詞ない形の「ない」→「なければ」」）
//   ② 初級の新規40項目の meaning で「一番長い選択肢を選ぶ」だけで正解率75%（偶然25%）
//   ③ 漢字を含む選択肢がちょうど1つの cloze 136問のうち50問（37%）で、それが正解
//
// 検出器は**実装とは独立に**素朴に書く（実装と同じ関数で測ると循環になる）。
import { describe, it, expect } from 'vitest';
import { buildVariantPool, type AdvBattleQuestion, type GrammarDraftLike } from './advVariants';
import { lengthBiasStats, chanceUpperBoundPct, CHANCE_LOWER_BOUND_PCT } from './advChoiceLengthBias';
import { ALL_READING_SETS } from './reading/readingBank';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';
import { loadAllBasicDrafts } from '../basicGrammarChunks';

interface Bank { name: string; level: 'foundation' | 'n3' | 'n2'; drafts: GrammarDraftLike[]; alias: Set<string> }

const loadBanks = async (): Promise<Bank[]> => {
  const n2: GrammarDraftLike[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) n2.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);
  return [
    { name: 'basic', level: 'foundation', drafts: (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[], alias: new Set() },
    { name: 'n3', level: 'n3', drafts: N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], alias: new Set() },
    { name: 'n2', level: 'n2', drafts: n2, alias: new Set(Object.keys(N2_GRAMMAR_ALIASES)) },
  ];
};

const collect = async (): Promise<{ bank: string; d: GrammarDraftLike; q: AdvBattleQuestion }[]> => {
  const out: { bank: string; d: GrammarDraftLike; q: AdvBattleQuestion }[] = [];
  for (const b of await loadBanks()) {
    const byId = new Map(b.drafts.map((x) => [x.grammarId, x]));
    for (const qs of buildVariantPool(b.drafts, b.level, b.alias).byItem.values()) {
      for (const q of qs) {
        const d = byId.get(q.sourceItemId);
        if (d) out.push({ bank: b.name, d, q });
      }
    }
  }
  return out;
};

const loadAllN2ForBias = async (): Promise<{ grammarId: string; unit: number }[]> => {
  const out: { grammarId: string; unit: number }[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) {
    for (const d of await loadN2DraftUnitFile(no)) {
      if (!N2_GRAMMAR_ALIASES[d.grammarId as keyof typeof N2_GRAMMAR_ALIASES]) out.push({ grammarId: d.grammarId, unit: d.unit });
    }
  }
  return out;
};

const hasKanji = (s: string) => /[一-鿿]/u.test(s);
const correctOf = (q: AdvBattleQuestion) => q.choices.find((c) => c.isCorrect)!.textJa;
const wrongsOf = (q: AdvBattleQuestion) => q.choices.filter((c) => !c.isCorrect).map((c) => c.textJa);

describe('設問に出ている見出しが正解の中に写っていない（form問題）', () => {
  // form は questionJa 自体が `「<pattern>」の接続はどれですか。` なので、
  // rec のように targetJapanese を隠しても漏洩は消えない。出題そのものを止めるしかない。
  it('**全バンクで、見出しの断片が正解にだけ現れる form 問題が0件**', async () => {
    const leaks: string[] = [];
    for (const { bank, d, q } of await collect()) {
      if (q.type !== 'form') continue;
      const correct = correctOf(q);
      const wrongs = wrongsOf(q);
      // 素朴な総当たり: 見出しの連続部分文字列を全部試す（実装のDPとは別アルゴリズム）
      for (let i = 0; i < d.pattern.length; i++) {
        for (let j = i + 1; j <= d.pattern.length; j++) {
          const cue = d.pattern.slice(i, j).replace(/[〜～（）()・／/、,\s]/gu, '');
          if (cue.length === 0) continue;
          if (!correct.includes(cue) || wrongs.some((w) => w.includes(cue))) continue;
          leaks.push(`[${bank}] 「${d.pattern}」の接続はどれですか。→ 手がかり「${cue}」が正解「${correct.slice(0, 40)}」だけに`);
          i = d.pattern.length; break;
        }
      }
    }
    expect(leaks, `見出しで解ける form 問題 ${leaks.length}件:\n${leaks.slice(0, 10).join('\n')}`).toEqual([]);
  }, 120_000);

  it('form を全部消して0件にしていない（2026-08-18 実測: 72問）', async () => {
    const n = (await collect()).filter((x) => x.q.type === 'form').length;
    expect(n).toBeGreaterThanOrEqual(60);
  }, 120_000);
});

describe('選択肢の「形」で当てられない', () => {
  it('**漢字を含む選択肢がちょうど1つの cloze が0件**（漢字の有無で正解が分かる／分からないの両方向）', async () => {
    const bad: string[] = [];
    for (const { bank, q } of await collect()) {
      if (q.type !== 'cloze') continue;
      const withKanji = q.choices.filter((c) => hasKanji(c.textJa));
      if (withKanji.length === 1 || withKanji.length === q.choices.length - 1) {
        bad.push(`[${bank}] ${q.targetJapanese} → ${q.choices.map((c) => `${c.textJa}${c.isCorrect ? '(正)' : ''}`).join('・')}`);
      }
    }
    expect(bad, `漢字の有無が手がかりになる cloze ${bad.length}件:\n${bad.slice(0, 10).join('\n')}`).toEqual([]);
  }, 120_000);

  it('cloze を消して数を減らしていない（2026-08-18 実測: 3バンク合計383問）', async () => {
    const n = (await collect()).filter((x) => x.q.type === 'cloze').length;
    expect(n).toBeGreaterThanOrEqual(340);
  }, 120_000);
});

describe('文法問題の長さバイアスが偶然水準内（type別）', () => {
  // 判定基準は読解と同一（advChoiceLengthBias）。
  // 「一番長い／短い選択肢を選ぶ」戦略も、その逆戦略（唯一最長を消す）も成立しないこと。
  it('meaning: 唯一最長／唯一最短が偶然水準・戦略正解率33%以下', async () => {
    const all = await collect();
    for (const bank of ['basic', 'n3', 'n2']) {
      const qs = all.filter((x) => x.bank === bank && x.q.type === 'meaning').map((x) => x.q);
      const st = lengthBiasStats(qs.map((q) => ({ setId: q.key, choices: q.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
      const bound = chanceUpperBoundPct(st.n);
      expect(st.n, `${bank}/meaning が生成されていない`).toBeGreaterThan(50);
      expect(st.uniqueLongestPct, `${bank}/meaning 唯一最長=正解 ${st.uniqueLongestPct}% (許容${bound}%)`).toBeLessThanOrEqual(bound);
      expect(st.uniqueShortestPct, `${bank}/meaning 唯一最短=正解 ${st.uniqueShortestPct}%`).toBeLessThanOrEqual(bound);
      // 逆戦略（唯一最長を消して3択にする）が有利にならないこと
      expect(st.uniqueLongestPct, `${bank}/meaning 唯一最長が少なすぎ（逆戦略が成立）`).toBeGreaterThanOrEqual(CHANCE_LOWER_BOUND_PCT);
      expect(st.uniqueShortestPct, `${bank}/meaning 唯一最短が少なすぎ（逆戦略が成立）`).toBeGreaterThanOrEqual(CHANCE_LOWER_BOUND_PCT);
    }
  }, 120_000);

  // 【なぜ rec も見るか】rec は人が書いた authored 問題で、生成ロジックでは直せない。
  // 実測（2026-08-18・修正前）: n2/rec は **「一番長い選択肢を選ぶ」だけで正解率80.9%**
  // （唯一最長=正解 75.3%・偶然25%）、n3/rec も 64.7%（唯一最長 54.2%）だった。
  // 誤答を正解より短く書く癖が178+76項目に通しで入っていたため、
  // N2目標の学習者は日本語を読まずに文法認識問題の8割を正解できた。
  // 誤答側を（意味を変えずに）書き足して長さ順位を偶然へ寄せてある。
  // 【この検査が壊れたら】新しい項目の誤答が短すぎる。誤答を書き足して直すこと。
  //   出題を消して比率を合わせるのは禁止（n の下限で検出する）。
  it('**rec（authored）: 全バンクで「最長を選ぶ」戦略が偶然水準**', async () => {
    const all = await collect();
    for (const [bank, minN] of [['basic', 140], ['n3', 55], ['n2', 145]] as const) {
      const qs = all.filter((x) => x.bank === bank && x.q.type === 'rec').map((x) => x.q);
      const st = lengthBiasStats(qs.map((q) => ({ setId: q.key, choices: q.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
      const bound = chanceUpperBoundPct(st.n);
      expect(st.n, `${bank}/rec の出題が減っている（消して比率を合わせない）`).toBeGreaterThanOrEqual(minN);
      expect(st.uniqueLongestPct, `${bank}/rec 唯一最長=正解 ${st.uniqueLongestPct}% > 許容${bound}%`).toBeLessThanOrEqual(bound);
      expect(st.uniqueShortestPct, `${bank}/rec 唯一最短=正解 ${st.uniqueShortestPct}% > 許容${bound}%`).toBeLessThanOrEqual(bound);
      // 逆戦略（唯一最長／唯一最短を消して3択にする）が有利にならないこと
      expect(st.uniqueLongestPct, `${bank}/rec 唯一最長が少なすぎ（逆戦略が成立）`).toBeGreaterThanOrEqual(CHANCE_LOWER_BOUND_PCT);
      expect(st.uniqueShortestPct, `${bank}/rec 唯一最短が少なすぎ（逆戦略が成立）`).toBeGreaterThanOrEqual(CHANCE_LOWER_BOUND_PCT);
      expect(st.pickLongestAccuracyPct, `${bank}/rec 「最長を選ぶ」だけで正解率 ${st.pickLongestAccuracyPct}%`).toBeLessThanOrEqual(33);
      expect(st.pickShortestAccuracyPct, `${bank}/rec 「最短を選ぶ」だけで正解率 ${st.pickShortestAccuracyPct}%`).toBeLessThanOrEqual(33);
    }
  }, 120_000);

  // 束（unit）は学習者が一度に浴びる単位。平均で隠れる偏りをここで見る。
  it('**rec: N2のどの束（unit）を切っても「最長を選ぶ」が偶然水準**', async () => {
    const n2 = await loadAllN2ForBias();
    const unitOf = new Map(n2.map((d) => [d.grammarId, d.unit]));
    const qs = (await collect()).filter((x) => x.bank === 'n2' && x.q.type === 'rec').map((x) => x.q);
    for (const unit of [...new Set(n2.map((d) => d.unit))].sort((a, b) => a - b)) {
      const subset = qs.filter((q) => unitOf.get(q.sourceItemId) === unit);
      const st = lengthBiasStats(subset.map((x) => ({ setId: x.key, choices: x.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
      const bound = chanceUpperBoundPct(st.n);
      expect(st.n, `n2 unit-${unit} の rec が消えている`).toBeGreaterThan(4);
      expect(st.uniqueLongestPct, `n2 unit-${unit}/rec: 唯一最長=正解 ${st.uniqueLongestPct}% > 許容${bound}% (n=${st.n})`).toBeLessThanOrEqual(bound);
      expect(st.uniqueShortestPct, `n2 unit-${unit}/rec: 唯一最短=正解 ${st.uniqueShortestPct}% > 許容${bound}% (n=${st.n})`).toBeLessThanOrEqual(bound);
    }
  }, 120_000);

  // 【なぜ四分位で見るか】バンク全体の平均では隠れる。
  // 実測(2026-08-18・修正前): basic/meaning 全体では 唯一最長25.7% で合格に見えるのに、
  // **説明文が長い項目だけを集めると 77.8%**（n3 55.6% / n2 51.2%）。
  // 誤答を「先頭から3つ」採っていたため、説明の長い項目では誤答が構造的に短くなっていた。
  // ※ ここで見るのは uniqueLongest/uniqueShortest だけ。「最長を選ぶ正解率」は
  //    正解の長さで層別した時点で上がるのが当たり前（条件付けの副作用）なので使わない。
  it('**meaning: 正解glossの長さ四分位ごとに見ても長さ順位が偶然**（平均で隠れる偏りの検出）', async () => {
    const all = await collect();
    for (const bank of ['basic', 'n3', 'n2']) {
      const qs = all.filter((x) => x.bank === bank && x.q.type === 'meaning').map((x) => x.q);
      const sorted = [...qs].sort((a, b) => correctOf(a).length - correctOf(b).length);
      const q = Math.floor(sorted.length / 4);
      for (const [label, subset] of [['最短四分位', sorted.slice(0, q)], ['最長四分位', sorted.slice(-q)]] as const) {
        const st = lengthBiasStats(subset.map((x) => ({ setId: x.key, choices: x.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
        const bound = chanceUpperBoundPct(st.n);
        expect(st.uniqueLongestPct, `${bank}/meaning ${label}: 唯一最長=正解 ${st.uniqueLongestPct}% > 許容${bound}%`).toBeLessThanOrEqual(bound);
        expect(st.uniqueShortestPct, `${bank}/meaning ${label}: 唯一最短=正解 ${st.uniqueShortestPct}% > 許容${bound}%`).toBeLessThanOrEqual(bound);
      }
    }
  }, 120_000);

  // 【なぜ束（unit）で見るか】学習者が一度に浴びるのは束の中身。
  // 役割を項目IDのhashで振ると、束のような小さいスライスで役割が固まる
  // （実測: hash方式にした直後 n4g-unit-8 の meaning が 唯一最長64.3%／最長を選ぶ71.4%）。
  // 並び順の巡回（itemIndex % 4）にして、どの束を切っても偶然水準に収まることを固定する。
  it('**初級文法: どの束（unit）を切り出しても長さ順位が偶然水準**', async () => {
    const basic = (await loadAllBasicDrafts());
    const unitOf = new Map(basic.map((d) => [d.grammarId, d.unit]));
    const qs = (await collect()).filter((x) => x.bank === 'basic').map((x) => x.q);
    for (const unit of [...new Set(basic.map((d) => d.unit))].sort()) {
      for (const [label, subset] of [
        ['全type', qs.filter((q) => unitOf.get(q.sourceItemId) === unit)],
        ['meaning', qs.filter((q) => q.type === 'meaning' && unitOf.get(q.sourceItemId) === unit)],
      ] as const) {
        const st = lengthBiasStats(subset.map((x) => ({ setId: x.key, choices: x.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
        const bound = chanceUpperBoundPct(st.n);
        expect(st.n, `${unit}/${label} の出題が消えている`).toBeGreaterThan(4);
        expect(st.uniqueLongestPct, `${unit}/${label}: 唯一最長=正解 ${st.uniqueLongestPct}% > 許容${bound}% (n=${st.n})`).toBeLessThanOrEqual(bound);
        expect(st.uniqueShortestPct, `${unit}/${label}: 唯一最短=正解 ${st.uniqueShortestPct}% > 許容${bound}% (n=${st.n})`).toBeLessThanOrEqual(bound);
      }
    }
  }, 120_000);

  it('初級文法（N5/N4・148項目）全体で「最長を選ぶ」「最短を選ぶ」が偶然水準near', async () => {
    const qs = (await collect()).filter((x) => x.bank === 'basic').map((x) => x.q);
    const st = lengthBiasStats(qs.map((q) => ({ setId: q.key, choices: q.choices.map((c) => ({ textJa: c.textJa, isCorrect: c.isCorrect })) })));
    expect(st.pickLongestAccuracyPct, `「最長を選ぶ」戦略の正解率 ${st.pickLongestAccuracyPct}%`).toBeLessThanOrEqual(33);
    expect(st.pickShortestAccuracyPct, `「最短を選ぶ」戦略の正解率 ${st.pickShortestAccuracyPct}%`).toBeLessThanOrEqual(33);
  }, 120_000);
});

describe('設問の「」内の語が正解にだけ入っていない（初級文法の全問）', () => {
  // 基準は quality/assessAnswerLeak.test.ts と同一。あちらは n3unit だけを見ていた。
  it('**全問で0件**', async () => {
    const leaked: string[] = [];
    for (const { bank, q } of await collect()) {
      const correct = correctOf(q);
      const wrongs = wrongsOf(q);
      const stem = `${q.questionJa ?? ''} ${q.questionZh ?? ''}`;
      for (const [, w] of stem.matchAll(/「([^」]{1,12})」/gu)) {
        if (w.length < 2 || !correct.includes(w)) continue;
        if (wrongs.some((c) => c.includes(w))) continue;
        // meaning / form は設問に見出しを出すのが仕様。見出しそのものは別テストで守る
        if (q.type === 'meaning' || q.type === 'form') continue;
        leaked.push(`[${bank}] ${q.key}: 設問「${w}」→ 正解「${correct}」`);
      }
    }
    expect(leaked, `設問を読むだけで解ける問題 ${leaked.length}件:\n${leaked.slice(0, 10).join('\n')}`).toEqual([]);
  }, 120_000);
});

describe('新規読解（N5/N4・96セット）の「形」で当てられない', () => {
  const newSets = () => ALL_READING_SETS.filter((s) => s.sourceLevel === 'N5' || s.sourceLevel === 'N4');

  it('N5/N4 が96セット揃っている（消して0件にしていない）', () => {
    expect(newSets().length).toBe(96);
  });

  // 「ちょうど1つだけ形が違う選択肢」が正解である割合が偶然（25%）から外れないこと。
  // 完全に0にすると「浮いている選択肢は正解ではない」という逆テルになるので、上限だけでなく件数も見る。
  const shapeTell = (name: string, odd: (t: string) => boolean) => {
    const sets = newSets().filter((s) => s.choices.filter((c) => odd(c.textJa)).length === 1);
    const hit = sets.filter((s) => odd(s.choices.find((c) => c.isCorrect)!.textJa));
    const pct = sets.length === 0 ? 0 : (hit.length / sets.length) * 100;
    const bound = chanceUpperBoundPct(sets.length);
    expect(pct, `${name}: 浮いた選択肢が正解 ${hit.length}/${sets.length} (${pct.toFixed(1)}% > 許容${bound}%)\n対象: ${hit.map((s) => s.setId).join(', ')}`)
      .toBeLessThanOrEqual(bound);
  };

  it('「1つだけ漢字を含む」選択肢が正解に偏らない', () => shapeTell('漢字', hasKanji));
  it('「1つだけ仮名だけ」の選択肢が正解に偏らない', () => shapeTell('かなのみ', (t) => !hasKanji(t)));
  it('「1つだけ読点を含む」選択肢が正解に偏らない', () => shapeTell('読点', (t) => /、/u.test(t)));
});
