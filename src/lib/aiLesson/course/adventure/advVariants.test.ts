// variant生成の全件機械検査（§18/§30: 漏洩0・重複0・複数正解対策・決定性）。
// 実データ（N2 178 canonical＋N3 76）に対して回す＝「存在するふり」をテストで排除。
import { describe, it, expect } from 'vitest';
import {
  buildVariantPool, buildExclusionSet, validateQuestion, matchKeysOf,
  headingRevealsAnswer, splitsWordStem, type AdvBattleQuestion, type GrammarDraftLike,
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

describe('advVariants 実データ全件検査', () => {
  it('N2: canonical 178全項目にプールが生成され、全問が機械検査PASS・キー重複0', async () => {
    const drafts = await loadAllN2();
    const pool = buildVariantPool(drafts, 'n2', new Set(Object.keys(N2_GRAMMAR_ALIASES)));
    expect(pool.stats.items).toBe(178);
    // 妥当性検査で保留した authored rec を除いた実数（存在するふりをしない）
    expect(pool.stats.byType.rec + pool.held.filter((h) => h.key.startsWith('rec:')).length).toBe(178);
    expect(pool.held.length).toBeGreaterThan(0);
    // CEOが実画面で見つけた不正問題は必ず保留されている
    expect(pool.held.some((h) => h.sourceItemId === 'n2g-003')).toBe(true);
    expect(pool.byItem.get('n2g-003')?.some((q) => q.type === 'rec')).toBeFalsy();
    const keys = new Set<string>();
    for (const qs of pool.byItem.values()) {
      expect(qs.length).toBeGreaterThanOrEqual(1);
      for (const q of qs) {
        expect(validateQuestion(q)).toEqual([]);
        expect(keys.has(q.key)).toBe(false);
        keys.add(q.key);
      }
    }
    // §18: 複数variant（タイプ2種以上）を持つ項目が大多数であること（暗記対策の実効性）
    expect(pool.stats.multiVariantItems).toBeGreaterThanOrEqual(150);
    expect(pool.stats.questions).toBeGreaterThanOrEqual(400);
    // 妥当性で1問も残らない項目は「存在するふり」になるため0であること
    expect(pool.stats.itemsWithZeroQuestions).toEqual([]);
  });

  it('N3: 76全項目にプールが生成され、全問PASS', () => {
    const pool = buildVariantPool(N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3');
    expect(pool.stats.items).toBe(76);
    expect(pool.stats.byType.rec + pool.held.filter((h) => h.key.startsWith('rec:')).length).toBe(76);
    for (const qs of pool.byItem.values()) for (const q of qs) expect(validateQuestion(q)).toEqual([]);
    expect(pool.stats.multiVariantItems).toBeGreaterThanOrEqual(60);
    expect(pool.stats.itemsWithZeroQuestions).toEqual([]);
  });

  it('決定的: 2回ビルドで同一結果', async () => {
    const drafts = await loadAllN2();
    const a = buildVariantPool(drafts.slice(0, 30), 'n2');
    const b = buildVariantPool(drafts.slice(0, 30), 'n2');
    expect(JSON.stringify([...a.byItem.entries()])).toBe(JSON.stringify([...b.byItem.entries()]));
  });

  it('同義・同族はdistractorから除外される（複数正解の主対策・D-008）', async () => {
    const drafts = await loadAllN2();
    const byId = new Map(drafts.map((d) => [d.grammarId, d]));
    // 例: 「〜上では」(n2g-006) と「〜上は」(n2g-007) は同族（上を共有）
    const jouDewa = byId.get('n2g-006');
    if (jouDewa) {
      const ex = buildExclusionSet(jouDewa, drafts);
      expect(ex.has('n2g-007')).toBe(true);
    }
    // similarPatterns両方向: あげく ↔ 末に
    const ageku = byId.get('n2g-001');
    if (ageku) {
      const ex = buildExclusionSet(ageku, drafts);
      for (const d of drafts) {
        if (d.similarPatterns.some((p) => p.includes('あげく'))) expect(ex.has(d.grammarId)).toBe(true);
      }
    }
    // clozeのdistractorが除外集合と交差しないことを全件で確認
    const pool = buildVariantPool(drafts, 'n2', new Set(Object.keys(N2_GRAMMAR_ALIASES)));
    const keyToId = new Map<string, string>();
    for (const d of drafts) for (const k of matchKeysOf(d)) if (!keyToId.has(k)) keyToId.set(k, d.grammarId);
    for (const [id, qs] of pool.byItem) {
      const self = byId.get(id);
      if (!self) continue;
      const ex = buildExclusionSet(self, drafts.filter((d) => !(d.grammarId in N2_GRAMMAR_ALIASES)));
      for (const q of qs) {
        if (q.type !== 'cloze') continue;
        for (const c of q.choices) {
          if (c.isCorrect) continue;
          const owner = keyToId.get(c.textJa);
          if (owner) expect(ex.has(owner)).toBe(false);
        }
      }
    }
  });

  it('生成不能はrejected/欠落として可視化される（存在するふりをしない）', () => {
    const minimal: GrammarDraftLike = {
      grammarId: 'x-001', pattern: '〜てすと', meaningJa: '', explanationZh: '', formation: '',
      examplesJa: ['この文に文型は含まれない'], examplesZh: [''], similarPatterns: [],
      recognition: { promptZh: 'p', options: ['a', 'a', 'b', 'c'], answerIndex: 0, explanationZh: 'e' },
    };
    const pool = buildVariantPool([minimal], 'n3');
    // recognitionは重複選択肢で妥当性検査に落ち、cloze/meaning/formは材料不足で生成なし
    expect(pool.byItem.get('x-001') ?? []).toHaveLength(0);
    const held = pool.held.find((h) => h.key === 'rec:x-001');
    expect(held).toBeTruthy();
    expect(held?.issues).toContain('duplicate_choice');
    // 0問になった項目は SAFE_FALLBACK として明示される
    expect(held?.disposition).toBe('SAFE_FALLBACK');
    expect(pool.stats.itemsWithZeroQuestions).toContain('x-001');
  });
});

// ─────────────────────────────────────────────────────────────
// rec問題の見出し漏洩ガード（2026-08-17）
//
// 背景: 旧ガードは `正解.includes(pattern)` を前提にしていたが、pattern には必ず
// 「〜」「（）」「／」が入るため選択肢に literal 一致することが構造的にありえず、
// 全317問で一度も発火しないデッドコードだった。結果、見出し（targetJapanese）と
// 選択肢の文字照合だけで解ける rec 問題が実在していた。
// ─────────────────────────────────────────────────────────────

/**
 * 【ガード実装とは独立に書いた検出器】
 * headingRevealsAnswer を一切呼ばず、学習者がやることをそのまま書く:
 *   画面に出ている見出しを読み、その断片が「1つの選択肢にだけ」現れていないか探す。
 * 実装が DP なのに対しこちらは素朴な部分文字列の総当たりで、意図的に別アルゴリズムにしてある。
 * ガードを弱める変更が入るとこの検査が落ちる（＝再発防止の要）。
 */
const sharedRun = (a: string, b: string): number => {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j <= a.length; j++) {
      const piece = a.slice(i, j);
      if (piece.length > best && b.includes(piece)) best = piece.length;
    }
  }
  return best;
};

const solvableByHeadingAlone = (
  d: GrammarDraftLike, heading: string, correct: string, wrongs: string[],
): string | null => {
  const kana = (s: string) => /[぀-ゟ゠-ヿ]/u.test(s);
  // 選択肢が中国語glossのときは日本語の文字照合が成立しない
  // （かつ promptZh 側が対象の日本語文を丸ごと引用しているので見出しを消しても漏れは減らない）
  if (!kana(correct) || !wrongs.every(kana)) return null;
  const alts = heading.replace(/（[^）]*）/gu, '').replace(/\([^)]*\)/gu, '')
    .split(/[〜～／/・、,]+/u).map((p) => p.replace(/\s+/gu, '')).filter((p) => p.length > 0);
  if (alts.length === 0) return null;
  const flat = alts.join('');
  const cands = [...new Set([...alts, ...matchKeysOf(d).filter((k) => k.length > 0 && flat.includes(k))])];
  // 見出しの断片が誤答を指しているなら、見出しは手がかりとして割れない
  // （「これ・それ・あれ」「〜ましょう／〜ませんか」のように候補を全部並べている見出し）
  if (cands.some((c) => !correct.includes(c) && wrongs.some((w) => w.includes(c)))) return null;
  const literal = cands.find((c) => correct.includes(c) && !wrongs.some((w) => w.includes(c)));
  if (literal) return literal;
  // 活用違いを跨ぐ手がかり（「〜かもしれない」→「かもしれません」の「かもしれ」）
  const runCorrect = Math.max(...alts.map((a) => sharedRun(a, correct)));
  const runWrong = Math.max(...wrongs.map((w) => Math.max(...alts.map((a) => sharedRun(a, w)))));
  return runCorrect >= 2 && runCorrect > runWrong ? `run:${runCorrect}` : null;
};

const recQuestionsOf = (qs: AdvBattleQuestion[]): AdvBattleQuestion[] => qs.filter((q) => q.type === 'rec');

describe('rec問題の見出し漏洩ガード', () => {
  it('(a) 助詞型（見出しの方が長く、キーが正解だけを指す）では見出しを隠す', async () => {
    // 合成ケース: pattern「〜に（場所・到着点）」の方が正解より長く、
    // 旧ガードの前提 `正解.includes(pattern)` は成立しない構図
    const particle: GrammarDraftLike = {
      grammarId: 'test-ni', pattern: '〜に（場所・到着点）', meaningJa: '到着点',
      explanationZh: '表示落点', formation: '場所の名詞 ＋に',
      examplesJa: ['大阪に住んでいます。'], examplesZh: ['住在大阪。'], similarPatterns: [],
      recognition: {
        promptZh: '哪个最自然？',
        options: ['東京に住んでいます', '東京で住んでいます', '東京へ住んでいます', '東京の近くで住んでいます'],
        answerIndex: 0, explanationZh: '落点用「に」',
      },
    };
    expect(particle.recognition.options[0].includes(particle.pattern)).toBe(false); // 旧ガードは発火しない
    expect(headingRevealsAnswer(particle, '東京に住んでいます',
      ['東京で住んでいます', '東京へ住んでいます', '東京の近くで住んでいます'])).toBe(true);

    // 実データでも同じ構図（n5g-ni-goal）で見出しが消えていること
    const basic = (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[];
    const pool = buildVariantPool(basic, 'foundation');
    const rec = recQuestionsOf(pool.byItem.get('n5g-ni-goal') ?? []);
    expect(rec).toHaveLength(1);
    expect(rec[0].targetJapanese).toBeNull();
    // 見出しを消しても設問（中国語）だけで答えられる＝問題は成立したまま
    expect(rec[0].questionZh.length).toBeGreaterThan(0);
  });

  it('(b) 通常のN3文型（見出しが全選択肢に共通）では見出しを残す', () => {
    const pool = buildVariantPool(N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3');
    // 「〜にとって」「〜ふりをする」「〜みたい」は誤答にも文型が入っており、
    // 見出しは手がかりにならない。ここを消すと「何を問われているか」だけが失われる
    for (const id of ['n3g-nitotte', 'n3g-furiwosuru', 'n3g-mitai']) {
      const rec = recQuestionsOf(pool.byItem.get(id) ?? []);
      expect(rec.length, `${id} のrec問題が消えている`).toBe(1);
      expect(rec[0].targetJapanese, `${id} の見出しが不要に消えている`).not.toBeNull();
    }
  });

  it('(c) 全バンクで「見出しが出ていて答えが割れる rec 問題」が0件', async () => {
    const banks: { name: string; level: 'foundation' | 'n3' | 'n2'; drafts: GrammarDraftLike[]; alias: Set<string> }[] = [
      { name: 'basic', level: 'foundation', drafts: (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[], alias: new Set() },
      { name: 'n3', level: 'n3', drafts: N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], alias: new Set() },
      { name: 'n2', level: 'n2', drafts: await loadAllN2(), alias: new Set(Object.keys(N2_GRAMMAR_ALIASES)) },
    ];
    const leaks: string[] = [];
    let shown = 0; let hidden = 0;
    for (const b of banks) {
      const pool = buildVariantPool(b.drafts, b.level, b.alias);
      const byId = new Map(b.drafts.map((d) => [d.grammarId, d]));
      for (const qs of pool.byItem.values()) {
        for (const q of recQuestionsOf(qs)) {
          if (q.targetJapanese === null) { hidden += 1; continue; }
          shown += 1;
          const d = byId.get(q.sourceItemId);
          if (!d) continue;
          const correct = q.choices.find((c) => c.isCorrect)?.textJa ?? '';
          const wrongs = q.choices.filter((c) => !c.isCorrect).map((c) => c.textJa);
          const cue = solvableByHeadingAlone(d, q.targetJapanese, correct, wrongs);
          if (cue) leaks.push(`${b.name}/${q.sourceItemId}: 見出し「${q.targetJapanese}」の「${cue}」が正解「${correct}」だけを指す`);
        }
      }
    }
    expect(leaks).toEqual([]);
    // 「全部隠して0件」という抜け道を塞ぐ: 見出しは大多数の問題で残っていること
    expect(shown).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(hidden / (shown + hidden)).toBeLessThan(0.2);
  });

  it('(d) ガードは出題数を減らさない（見出しを消すだけ）', async () => {
    const basic = (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[];
    const pool = buildVariantPool(basic, 'foundation');
    // 初級108項目すべてが rec を持つ（妥当性HOLD分を足して項目数と一致）
    expect(pool.stats.byType.rec + pool.held.filter((h) => h.key.startsWith('rec:')).length)
      .toBe(pool.stats.items);
    expect(pool.stats.itemsWithZeroQuestions).toEqual([]);
    // 見出しを隠した問題も選択肢・解説・出典を保持している
    for (const qs of pool.byItem.values()) {
      for (const q of recQuestionsOf(qs)) {
        if (q.targetJapanese !== null) continue;
        expect(q.choices.length).toBeGreaterThanOrEqual(3);
        expect(q.choices.filter((c) => c.isCorrect)).toHaveLength(1);
        expect(q.questionZh.trim().length).toBeGreaterThan(0);
        expect(q.explanation.sourceItemId).toBe(q.sourceItemId);
        expect(validateQuestion(q)).toEqual([]);
      }
    }
  });

  it('(e) 見出しが候補を全部並べている項目は隠さない（消しすぎの防止）', async () => {
    const basic = (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[];
    const pool = buildVariantPool(basic, 'foundation');
    // 「これ・それ・あれ」型: 各断片が別々の選択肢を指すので見出しは手がかりにならない。
    // 「〜で（手段・道具）」型: 「で」は誤答にも入っている。
    for (const id of ['n5g-kore-sore-are', 'n5g-koko-soko-asoko', 'n5g-mashou-masenka',
      'n5g-de-means', 'n4g-juju-mono', 'n5g-kunarimasu-ninarimasu']) {
      const rec = recQuestionsOf(pool.byItem.get(id) ?? []);
      expect(rec.length, `${id} のrec問題が消えている`).toBe(1);
      expect(rec[0].targetJapanese, `${id} の見出しが不要に消えている`).not.toBeNull();
    }
  });
});

// ── 穴が語の内部へ食い込まない（2026-08-17 実測で47問見つかった defect の再発防止） ──
//
// 実例: 「毎朝、コーヒーを飲＿＿、会社に行きます。」正解「んで」。
// matchKeys は照合のために活用語尾で切ってあるので、そのまま穴にすると語幹だけが文に残る。
// 学習者には何を問われているか読めず、誤答（「せる」「あれ」）と並べても文法を測っていない。
describe('cloze の穴が語の内部を割らない', () => {
  it('活用語尾を穴にしない／名詞のあとの助詞は穴にしてよい', () => {
    // 割る: 「飲んで」の「んで」だけを抜くと「飲」が残る
    expect(splitsWordStem('毎朝、コーヒーを飲んで、会社に行きます。', 'んで')).toBe(true);
    expect(splitsWordStem('きのうは頭が痛かったので、休みました。', 'かった')).toBe(true);
    expect(splitsWordStem('先月、東京から埼玉に引っ越した。', 'した')).toBe(true);
    // ます形なら「し」は仮名の直後なので語幹の切断ではない
    expect(splitsWordStem('先月、東京から埼玉に引っ越しました。', 'した')).toBe(false);
    // 割らない: 名詞のあとの助詞・助動詞
    expect(splitsWordStem('毎日、病院に行きます。', 'には')).toBe(false);
    expect(splitsWordStem('休みの日は映画や美術館などに行きます。', 'など')).toBe(false);
    expect(splitsWordStem('これは学校からの手紙です。', 'からの')).toBe(false);
    // 直前が仮名なら語幹の切断ではない
    expect(splitsWordStem('ゆっくり歩いています。', 'ています')).toBe(false);
  });

  it('**全バンクで、漢字の直後に活用語尾の穴が開いている cloze が0件**', async () => {
    const { N3_GRAMMAR_DRAFTS } = await import('../n3GrammarDrafts');
    const { loadAllBasicDrafts } = await import('../basicGrammarChunks');
    const banks: Array<[string, GrammarDraftLike[], 'foundation' | 'n3' | 'n2']> = [
      ['basic', (await loadAllBasicDrafts()) as never, 'foundation'],
      ['n3', N3_GRAMMAR_DRAFTS as never, 'n3'],
    ];
    const broken: string[] = [];
    for (const [name, drafts, level] of banks) {
      for (const qs of buildVariantPool(drafts, level).byItem.values()) {
        for (const q of qs) {
          if (q.type !== 'cloze' || !q.targetJapanese) continue;
          const correct = q.choices.find((c) => c.isCorrect)!.textJa;
          const at = q.targetJapanese.indexOf('＿＿');
          const before = at > 0 ? q.targetJapanese[at - 1] : '';
          // ここは splitsWordStem を使わずに独立して判定する（実装と同じ関数で測ると循環になる）
          if (/[一-鿿]/u.test(before) && /^[ぁ-ゟ]/u.test(correct) && !PARTICLE_OK.has(correct)) {
            broken.push(`[${name}] ${q.targetJapanese} → ${correct}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  }, 120_000);
});

/** 名詞の直後に立てる助詞（この並びは advVariants の実装とは独立に書く） */
const PARTICLE_OK = new Set([
  'に', 'で', 'へ', 'を', 'は', 'が', 'と', 'も', 'の', 'か', 'や', 'ね', 'よ',
  'から', 'まで', 'より', 'など', 'だけ', 'しか', 'ほど', 'くらい', 'ぐらい', 'ばかり',
  'さえ', 'でも', 'には', 'では', 'とは', 'にも', 'へは', 'をも', 'との', 'への', 'からの',
  'ので', 'のに', 'のは', 'のが', 'のを', 'なら', 'だと', 'だし', 'だから',
  'です', 'でした', 'だった', 'ですか', 'ですが', 'でしょう',
]);
