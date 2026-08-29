// JLPT ASSESSMENT INTEGRITY の受入テスト（§16）。
// 1) 言語整合性  2) 正解位置バイアス  3) 試験科目モデル  4) distractor妥当性
import { describe, it, expect } from 'vitest';
import { checkText, runLanguageCheck, stripQuoted } from './advLanguageIntegrity';
import { collectLearnerVisibleTexts } from './advLanguageCollect';
import {
  presentQuestion, presentBattle, balancedPositions, analyzeDistribution,
  isCorrectAnswer, correctPositionOf, seededFisherYates,
} from './advChoiceOrder';
import { buildVariantPool, type AdvBattleQuestion, type GrammarDraftLike } from './advVariants';
import { checkQuestionValidity, endingCategory, connectionHead, isConnectionCompatible } from './advQuestionValidity';
import {
  battleScopeName, masteryScopeName, nowTrainingLabel, skillOfQuestionType,
  EXAM_STRUCTURE, OVERALL_READINESS_REQUIREMENT,
} from './advExamSkills';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';

const mkQ = (key: string, nChoices = 4, correctAt = 0): AdvBattleQuestion => ({
  key, type: 'cloze', level: 'n2', skill: 'grammar', examSection: 'languageKnowledge',
  targetJapanese: 'ターゲット', questionJa: '設問', questionZh: '问题',
  choices: Array.from({ length: nChoices }, (_, i) => ({
    choiceId: `choice-${String.fromCharCode(97 + i)}`,
    textJa: `選択肢${i}`,
    isCorrect: i === correctAt,
  })),
  explanation: {
    meaningJa: 'm', meaningZh: 'm', whyCorrectJa: 'w', whyCorrectZh: 'w',
    exampleJa: null, exampleZh: null, sourceItemId: 'src', sourceLabel: 'p',
  },
  sourceItemId: 'src', difficulty: 2, timed: false, variantId: key,
  reviewState: 'validated_beta', status: 'validated_beta',
});

// ────────────────────────────────────────────
describe('言語整合性（§1〜§4）', () => {
  const base = { itemId: 'x', route: 'battle', origin: 'canonical' as const };

  it('未許可Scriptを検出し、code pointと推奨処理を返す', () => {
    const v = checkText({ ...base, field: 'explanationZh', locale: 'zh', text: '「〜以上は＋должен」的结构' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('unauthorized_script');
    expect(v[0].script).toBe('Cyrillic');
    expect(v[0].codePoints[0]).toMatch(/^U\+04/);
    expect(v[0].recommendation).toBe('FIX_SOURCE');
  });

  it('Hangul・Greek・Thai・Arabicなども同様にFAIL', () => {
    for (const [text, script] of [['〜반면', 'Hangul'], ['αβ', 'Greek'], ['ไทย', 'Thai'], ['عربى', 'Arabic']] as const) {
      const v = checkText({ ...base, field: 'f', locale: 'zh', text });
      expect(v.some((x) => x.script === script)).toBe(true);
    }
  });

  it('U+FFFD・undefined混入・空必須をFAILにする', () => {
    expect(checkText({ ...base, field: 'f', locale: 'ja', text: 'あ�い' })[0].kind).toBe('replacement_char');
    expect(checkText({ ...base, field: 'f', locale: 'ja', text: '正解は undefined です' })[0].kind).toBe('nullish_text');
  });

  it('zhフィールドは引用内の日本語だけ許可（地の文の仮名はFAIL）', () => {
    expect(checkText({ ...base, field: 'explanationZh', locale: 'zh', text: '「〜以上は」＋义务 的结构' })).toHaveLength(0);
    const bad = checkText({ ...base, field: 'explanationZh', locale: 'zh', text: '这个语法 とても 常用' });
    expect(bad.some((v) => v.kind === 'unquoted_kana_in_zh')).toBe(true);
    expect(stripQuoted('「あいう」えお')).toBe('えお');
  });

  it('正常な日本語UI・中国語UIは通る', () => {
    expect(checkText({ ...base, field: 'f', locale: 'ja', text: '今日の冒険を始める' })).toHaveLength(0);
    expect(checkText({ ...base, field: 'f', locale: 'zh', text: '开始今天的冒险' })).toHaveLength(0);
    expect(checkText({ ...base, field: 'f', locale: 'ja', text: 'N2合格まであと128日（JLPT）' })).toHaveLength(0);
  });

  it('【全教材・全UI】learner-visibleに未許可Scriptが0件', async () => {
    const texts = await collectLearnerVisibleTexts();
    expect(texts.length).toBeGreaterThan(3000);
    const report = runLanguageCheck(texts);
    const scriptViolations = report.violations.filter((v) => v.kind === 'unauthorized_script');
    if (scriptViolations.length > 0) {
      // 失敗時は itemId/field/route/locale/substring/codePoint を必ず出す
      console.error(scriptViolations.slice(0, 20).map((v) =>
        `${v.itemId} | ${v.field} | ${v.route} | ${v.locale} | ${v.script} | ${v.offending} | ${v.codePoints.join(' ')}`).join('\n'));
    }
    expect(scriptViolations).toHaveLength(0);
    expect(report.violations.filter((v) => v.kind === 'replacement_char')).toHaveLength(0);
    expect(report.violations.filter((v) => v.kind === 'mojibake')).toHaveLength(0);
    expect(report.violations.filter((v) => v.kind === 'nullish_text')).toHaveLength(0);
  });

  /**
   * 中国語の解説に日本語の地の文が混ざっていない（2026-08-22）。
   *
   * 以前は 970 件が「警告」のまま放置され、中国語で学ぶ生徒の画面に
   * 「起点は小さな出来事でよい」のような**日本語の解説**がそのまま出ていた。
   * 全部中国語へ直したので、ここを 0 に固定して二度と増やさない。
   * 文法用語（た形・ます形…）と世界の固有名詞（ソラノ塔…）は許可済み
   * （ZH_ALLOWED_JA_TERMS / ZH_ALLOWED_JA_NAMES）。日本語の例は「」でくくること。
   */
  it('【全教材・全UI】中国語フィールドに引用外の日本語が0件', async () => {
    const texts = await collectLearnerVisibleTexts();
    const report = runLanguageCheck(texts);
    const kana = report.warnings.filter((v) => v.kind === 'unquoted_kana_in_zh');
    if (kana.length > 0) {
      console.error(kana.slice(0, 20).map((v) =>
        `${v.itemId} | ${v.field} | ${v.sourceFile ?? ''} | ${v.offending}`).join('\n'));
    }
    expect(kana).toHaveLength(0);
  });
});

// ────────────────────────────────────────────
describe('正解位置バイアス（§11〜§14）', () => {
  it('採点はchoiceIdで行い、表示位置を使わない', () => {
    const q = mkQ('q1', 4, 2);
    const p = presentQuestion(q, 12345);
    expect(p.correctChoiceId).toBe('choice-c');
    expect(isCorrectAnswer(p, 'choice-c')).toBe(true);
    expect(isCorrectAnswer(p, 'choice-a')).toBe(false);
    expect(isCorrectAnswer(p, null)).toBe(false);
    // 表示順が変わっても正解IDは不変
    const p2 = presentQuestion(q, 999);
    expect(p2.correctChoiceId).toBe('choice-c');
  });

  it('同一attemptでは順番が固定（rerender・reload相当）', () => {
    const q = mkQ('q2');
    const a = presentQuestion(q, 777);
    const b = presentQuestion(q, 777);
    expect(a.presentedChoiceOrder).toEqual(b.presentedChoiceOrder);
  });

  it('新しいattemptでは順番が変わりうる', () => {
    const q = mkQ('q3');
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => presentQuestion(q, s).presentedChoiceOrder.join(','));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('seededFisherYatesは決定的', () => {
    expect(seededFisherYates([1, 2, 3, 4, 5], 42)).toEqual(seededFisherYates([1, 2, 3, 4, 5], 42));
  });

  // 2026-08-29: 小さいseedで xorshift32 の初回出力がほぼ0になり、
  // 「正解が必ず4番目」になっていた（個人パックで実際に発生）
  it('seededFisherYates: 小さい連番seedでも先頭要素の位置が偏らない', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 200; seed += 1) {
      counts[seededFisherYates([0, 1, 2, 3], seed).indexOf(0)] += 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(200 / 4 / 2);
  });

  it('balancedPositions: 20問4択で各位置5問・3連続なし', () => {
    const pos = balancedPositions(new Array(20).fill(4), 20260731);
    const counts = [0, 0, 0, 0];
    for (const p of pos) counts[p] += 1;
    expect(counts).toEqual([5, 5, 5, 5]);
    for (let i = 2; i < pos.length; i++) {
      expect(pos[i] === pos[i - 1] && pos[i - 1] === pos[i - 2]).toBe(false);
    }
  });

  it('balancedPositions: 5問は各位置差が最大1・3択にも収まる', () => {
    const pos5 = balancedPositions(new Array(5).fill(4), 7);
    const c5 = [0, 0, 0, 0];
    for (const p of pos5) c5[p] += 1;
    expect(Math.max(...c5) - Math.min(...c5)).toBeLessThanOrEqual(1);
    const pos3 = balancedPositions([3, 3, 3, 3, 3, 3], 9);
    expect(pos3.every((p) => p < 3)).toBe(true);
  });

  // 【2026-08-18 回帰】3択と4択が混ざると balancedPositions のフォールバック分岐
  // （プールに条件を満たす候補が残っていない場合）が3連続回避を素通りし、
  // 正解位置が3問続けて同じになっていた。実測すると3連続の**69%が位置1（先頭）**に出る。
  // 「答えがそのまま出ちゃう」典型なので、以下の実データ由来ケースで恒久的に固定する。
  it('balancedPositions: 選択肢数が混在しても3連続しない（フォールバック分岐の回帰）', () => {
    // 未修正版で実際に3連続が出た組み合わせ（counts, seed）
    const repro: [number[], number][] = [
      [[3, 3, 4, 4, 3, 3, 4, 3, 3, 4, 4, 4], 1399526603],
      [[4, 3, 3, 3, 3, 3, 4, 3, 4, 4, 3, 3], 847723943],
      [[3, 3, 3, 3, 3, 4, 3, 3, 3], 787698345],
      [[4, 4, 4, 4, 4, 4, 4, 4, 4, 4], 522074072],
    ];
    for (const [counts, seed] of repro) {
      const pos = balancedPositions(counts, seed);
      expect(pos).toHaveLength(counts.length);
      for (let i = 0; i < pos.length; i++) {
        // 位置は必ずその問題の選択肢数に収まる（はみ出すと指定が無視され偏る）
        expect(pos[i]).toBeGreaterThanOrEqual(0);
        expect(pos[i]).toBeLessThan(counts[i]);
      }
      const streaks: string[] = [];
      for (let i = 2; i < pos.length; i++) {
        if (pos[i] === pos[i - 1] && pos[i - 1] === pos[i - 2]) {
          streaks.push(`counts=${counts.join(',')} seed=${seed} pos=${pos.join(',')} at=${i}`);
        }
      }
      expect(streaks).toEqual([]);
    }
  });

  it('balancedPositions: 2〜4択のランダム編成20,000通りで3連続ゼロ', () => {
    let rng = 123456789;
    const rnd = () => {
      rng ^= rng << 13; rng >>>= 0; rng ^= rng >> 17; rng ^= rng << 5; rng >>>= 0;
      return rng / 0x100000000;
    };
    const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    let streakViolations = 0;
    let rangeViolations = 0;
    for (let t = 0; t < 20000; t++) {
      const n = ri(3, 16);
      const counts = Array.from({ length: n }, () => ri(2, 4));
      const pos = balancedPositions(counts, ri(0, 2 ** 31 - 1));
      for (let i = 0; i < n; i++) if (pos[i] < 0 || pos[i] >= counts[i]) { rangeViolations += 1; break; }
      for (let i = 2; i < n; i++) {
        if (pos[i] === pos[i - 1] && pos[i - 1] === pos[i - 2]) { streakViolations += 1; break; }
      }
    }
    expect(rangeViolations).toBe(0);
    expect(streakViolations).toBe(0);
  });

  it('presentBattleは指定位置に正解を置く', () => {
    const qs = Array.from({ length: 12 }, (_, i) => mkQ(`b${i}`, 4, i % 4));
    const presented = presentBattle(qs, 424242);
    const counts = [0, 0, 0, 0];
    for (const p of presented) counts[correctPositionOf(p)] += 1;
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it('【10,000 battle】正解位置分布が均等・先頭偏りなし・3連続なし', () => {
    const battles: ReturnType<typeof presentBattle>[] = [];
    for (let b = 0; b < 10000; b++) {
      // 実運用に近い構成: 7問（通常敵）・正解の元位置は素材側でばらつく
      const qs = Array.from({ length: 7 }, (_, i) => mkQ(`s${b}-${i}`, 4, (b + i) % 4));
      battles.push(presentBattle(qs, b * 7919 + 13));
    }
    const stats = analyzeDistribution(battles, 4);
    expect(stats.totalQuestions).toBe(70000);
    for (const p of stats.positionPct) {
      expect(p).toBeGreaterThanOrEqual(20);
      expect(p).toBeLessThanOrEqual(30);
    }
    expect(stats.maxStreak).toBeLessThanOrEqual(2);
    expect(stats.chiSquare).toBeLessThanOrEqual(16.27);
    expect(stats.pass).toBe(true);
  });

  it('素材側の正解が全て先頭でも、提示は偏らない（元データのバイアス吸収）', () => {
    const battles: ReturnType<typeof presentBattle>[] = [];
    for (let b = 0; b < 2000; b++) {
      const qs = Array.from({ length: 8 }, (_, i) => mkQ(`z${b}-${i}`, 4, 0)); // 全問 index0 が正解
      battles.push(presentBattle(qs, b + 1));
    }
    const stats = analyzeDistribution(battles, 4);
    expect(stats.positionPct[0]).toBeLessThan(30);
    expect(stats.pass).toBe(true);
  });
});

// ────────────────────────────────────────────
describe('試験科目モデル（§5〜§10）', () => {
  it('N2/N3の実試験構造を持つ', () => {
    expect(EXAM_STRUCTURE.N2.map((p) => p.minutes)).toEqual([105, 50]);
    expect(EXAM_STRUCTURE.N3.map((p) => p.minutes)).toEqual([30, 70, 40]);
    expect(EXAM_STRUCTURE.N3[0].skills).toEqual(['charactersVocabulary']);
  });

  it('文法だけのバトルを「模試」と呼ばない（§5）', () => {
    expect(battleScopeName(['grammar'], 'N2', 'ja')).toBe('N2文法バトル');
    expect(battleScopeName(['grammar'], 'N2', 'zh')).toBe('N2语法战斗');
    expect(battleScopeName(['grammar', 'charactersVocabulary'], 'N2', 'ja')).toBe('N2知識バトル');
    expect(battleScopeName(['grammar', 'charactersVocabulary', 'reading', 'listening'], 'N2', 'ja')).toBe('N2総合模試');
    expect(masteryScopeName(['grammar'], 'N2', 'ja')).toBe('N2文法攻略率');
  });

  it('今鍛えている科目のラベルがja/zhで出る', () => {
    expect(nowTrainingLabel('grammar', 'ja')).toBe('言語知識｜文法');
    expect(nowTrainingLabel('grammar', 'zh')).toBe('语言知识｜语法');
    expect(nowTrainingLabel('listening', 'ja')).toBe('聴解');
  });

  it('問題タイプ→試験科目のタグ付け', () => {
    expect(skillOfQuestionType('cloze')).toBe('grammar');
    expect(skillOfQuestionType('u-core_meaning')).toBe('charactersVocabulary');
    expect(skillOfQuestionType('u-conjugation')).toBe('grammar');
    expect(skillOfQuestionType('passage')).toBe('reading');
  });

  it('総合判定の要件は4技能×最低evidence', () => {
    expect(OVERALL_READINESS_REQUIREMENT.requiredSkills).toHaveLength(4);
    expect(OVERALL_READINESS_REQUIREMENT.requiredSkills).not.toContain('timeManagement');
  });
});

// ────────────────────────────────────────────
describe('distractor妥当性（§3）', () => {
  it('CEOが見つけた不正問題を検出する', () => {
    const v = checkQuestionValidity({
      promptJa: null, promptZh: '「日本で働く以上は、＿＿」后面最自然的是？',
      choices: ['敬語を覚えるべきです', '日本は島国です', '天気がいいです', '桜がきれいです'],
      answerIndex: 0,
    });
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('semantic_disconnection');
    expect(v.issues).toContain('ending_category_giveaway');
  });

  it('同じ機能・同じ文末の選択肢セットは妥当', () => {
    const v = checkQuestionValidity({
      promptJa: null, promptZh: '哪个句子最自然？',
      choices: ['担当になった以上は、最後まで責任を持つべきです', '担当になったところで、最後まで責任を持つべきです',
        '担当になったばかりに、最後まで責任を持つべきです', '担当になったあげく、最後まで責任を持つべきです'],
      answerIndex: 0,
    });
    expect(v.blocking).toHaveLength(0);
  });

  it('文末カテゴリの判定', () => {
    expect(endingCategory('敬語を覚えるべきです')).toBe('obligation');
    expect(endingCategory('天気がいいです')).toBe('plainState');
    expect(endingCategory('買わなかった')).toBe('negative');
    expect(endingCategory('合格した')).toBe('past');
    expect(endingCategory('因为太紧张')).toBe('nonJapanese');
  });

  it('接続互換の判定（clozeのdistractor条件）', () => {
    expect(connectionHead('動詞た形／名詞＋の ＋あげく')).toBe('verbTa');
    expect(isConnectionCompatible('verbTa', 'verbTa')).toBe(true);
    expect(isConnectionCompatible('verbTa', 'verbDict')).toBe(false);
    expect(isConnectionCompatible('verbTa', 'unknown')).toBe(true);
  });

  it('【実データ全件】出題される問題はすべて妥当性blocking 0・複数正解0', async () => {
    const n2: GrammarDraftLike[] = [];
    for (const no of N2_UNIT_FILE_NUMBERS) n2.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);
    for (const [drafts, lvl, alias] of [
      [n2, 'n2', new Set(Object.keys(N2_GRAMMAR_ALIASES))] as const,
      [N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3', new Set<string>()] as const,
    ]) {
      const pool = buildVariantPool(drafts as GrammarDraftLike[], lvl, alias);
      for (const qs of pool.byItem.values()) {
        for (const q of qs) {
          expect(q.choices.filter((c) => c.isCorrect)).toHaveLength(1);
          const v = checkQuestionValidity({
            promptJa: q.questionJa, promptZh: q.questionZh,
            choices: q.choices.map((c) => c.textJa),
            answerIndex: q.choices.findIndex((c) => c.isCorrect),
          });
          expect(v.blocking).toEqual([]);
        }
      }
      // 保留した問題はIDつきで可視化される（silent dropしない）
      for (const h of pool.held) {
        expect(h.sourceItemId).toBeTruthy();
        expect(h.issues.length).toBeGreaterThan(0);
        expect(['HOLD', 'SAFE_FALLBACK']).toContain(h.disposition);
      }
    }
  });
});
