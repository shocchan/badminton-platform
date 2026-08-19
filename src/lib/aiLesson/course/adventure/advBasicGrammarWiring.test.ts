// 初級文法（N5/N4）の配線テスト。2026-08-17 新設。
//
// 直した問題（これが再発すると初心者は文法をまったく学べない）:
// 基礎キャンプ / N3の橋 stage には文法targetが1つも無く、
// 診断で基礎帯と測られた学習者には「単元のことば」しか出ていなかった。
//
// ここで守るのは3つ:
// 1. 基礎帯のルートに初級文法の束が入る
// 2. その束が**実際に出題できる**（プールが空でない・mastery可能な問題数がある）
// 3. 攻略判定（stageMasteryTargetIds）が束を数える＝攻略済みにならない穴が無い
import { describe, it, expect } from 'vitest';
import { generateRoute, stageMasteryTargetIds } from './advRoute';
import { loadGrammarPools, stageContent, MIN_BUNDLE_QUESTIONS } from './advContent';
import { N5_UNIT_IDS, N4_UNIT_IDS, loadAllBasicDrafts } from '../basicGrammarChunks';
import { buildVariantPool, type GrammarDraftLike } from './advVariants';
import type { AdvDiagnosisResult } from './advTypes';

const NOW = '2026-08-17T09:00:00.000Z';

const diagnosis: AdvDiagnosisResult = {
  completedAt: NOW,
  knowledgeBand: 'pre_n5',
  conversationBand: 'needs_assessment',
  vocabularyGapIds: [], grammarGapIds: [],
  listeningConfidence: 'none',
  supportNeed: 'whenStuck',
  recommendedStartAreaId: 'area01-minato',
  routeExplanationJa: '', routeExplanationZh: '',
  askedQuestionKeys: [], conversationSampled: false,
};

/** 李さん相当: ほぼゼロから最短でN3 */
const beginnerRoute = () => generateRoute({
  goalType: 'jlpt', targetJlpt: 'N3', knowledgeBand: 'pre_n5',
  conversationBand: 'needs_assessment', diagnosis, nowISO: NOW,
});

describe('基礎帯のルートに初級文法が入る', () => {
  it('基礎キャンプにN5文法6束・N3の橋にN4文法8束が乗る', () => {
    const r = beginnerRoute();
    const camp = r.stages.find((s) => s.kind === 'foundation_camp');
    const bridge = r.stages.find((s) => s.kind === 'n3_bridge');
    expect(camp?.targets.basicUnits).toEqual(N5_UNIT_IDS);
    expect(bridge?.targets.basicUnits).toEqual(N4_UNIT_IDS);
  });

  it('N3帯以上の学習者には基礎キャンプ自体が出ない（背伸びさせない・遠回りさせない）', () => {
    const r = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n3_late',
      conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
    });
    expect(r.stages.some((s) => s.kind === 'foundation_camp')).toBe(false);
  });
});

describe('**実際に出題できる**（空のstageを作らない）', () => {
  it('全項目がどこかの束に属し、束はすべてmastery可能な問題数（17問以上）を持つ', async () => {
    const pools = await loadGrammarPools();
    // 単元は必ず実在する束へ解決される（合流で行き先を失う単元が無い）
    for (const u of [...N5_UNIT_IDS, ...N4_UNIT_IDS]) {
      const b = pools.basicBundleByUnit.get(u);
      expect(b, `${u} の束が無い`).toBeTruthy();
      expect((pools.basicByUnit.get(b!) ?? []).length, `${b} が空`).toBeGreaterThan(0);
    }
    // 17問 = 別日3回×80%＋7日後確認を「未出の問題」で通すのに要る下限
    const thin: string[] = [];
    for (const b of pools.basicByUnit.keys()) {
      const n = (pools.byItem.get(b) ?? []).length;
      if (n < MIN_BUNDLE_QUESTIONS) thin.push(`${b}: ${n}問`);
    }
    expect(thin, `攻略不能な束: ${thin.join(', ')}`).toEqual([]);
  });

  it('基礎キャンプが学習ステップとバトル対象を返す（文法stepが0本にならない）', async () => {
    const pools = await loadGrammarPools();
    const camp = beginnerRoute().stages.find((s) => s.kind === 'foundation_camp')!;
    const c = await stageContent(camp, new Set(), new Set());
    expect(c.nextGrammarIds.length).toBeGreaterThan(20);
    // バトルは束IDで行う＝項目単位のプール枯渇を避ける
    for (const u of N5_UNIT_IDS) expect(c.battleTargetIds).toContain(pools.basicBundleByUnit.get(u));
    // 単元のことばも従来どおり残る（文法に置き換えたのではなく足した）
    expect(c.nextUnitIds.length).toBeGreaterThan(0);
  });

  it('攻略済みの束は次の対象から外れる（同じところを回り続けない）', async () => {
    const pools = await loadGrammarPools();
    const camp = beginnerRoute().stages.find((s) => s.kind === 'foundation_camp')!;
    const first = pools.basicBundleByUnit.get(N5_UNIT_IDS[0])!;
    const c = await stageContent(camp, new Set([first]), new Set());
    expect(c.battleTargetIds).not.toContain(first);
    const rest = new Set(N5_UNIT_IDS.map((u) => pools.basicBundleByUnit.get(u)!).filter((b) => b !== first));
    for (const b of rest) expect(c.battleTargetIds).toContain(b);
  });
});

describe('攻略判定に穴が無い', () => {
  it('stage攻略の対象に初級文法の束が数えられる', async () => {
    const pools = await loadGrammarPools();
    const camp = beginnerRoute().stages.find((s) => s.kind === 'foundation_camp')!;
    const ids = stageMasteryTargetIds(camp, pools.n3Ids, pools.n2ByUnit, pools.n3BundleByItem, pools.basicByUnit, pools.basicBundleByUnit);
    for (const u of N5_UNIT_IDS) expect(ids).toContain(pools.basicBundleByUnit.get(u));
    // 合流で消えた単元IDが混ざると永久に攻略できないstageになる
    for (const id of ids) if (/^n[45]g-/.test(id)) expect(pools.basicByUnit.has(id), id).toBe(true);
  });

  it('項目→束の対応が張られている（項目IDのまま台帳に書かれない）', async () => {
    const pools = await loadGrammarPools();
    for (const [b, ids] of pools.basicByUnit) {
      for (const id of ids) expect(pools.n3BundleByItem.get(id), id).toBe(b);
    }
  });
});

describe('学習者に見せる中身の安全性', () => {
  it('初級バトルの誤答にN3/N2の表現が混ざらない（プールを帯で閉じている）', async () => {
    const pools = await loadGrammarPools();
    const basicIds = new Set([...pools.basicByUnit.values()].flat());
    for (const b of new Set(N5_UNIT_IDS.map((u) => pools.basicBundleByUnit.get(u)!))) {
      for (const q of pools.byItem.get(b) ?? []) {
        expect(q.level, `${q.key} のlevel`).toBe('foundation');
        // 出典は必ず初級項目
        expect(basicIds.has(q.sourceItemId), `${q.key} の出典 ${q.sourceItemId}`).toBe(true);
      }
    }
  });
});

describe('基礎帯の難易度（2026-08-19 CEO指摘「N5にしては難しい」の再発防止）', () => {
  // 実測で判明した難しさの実体は3点だった（難易度監査 2026-08-19）:
  //   (a) meaning/form の太字主行が日本語のメタ言語（「〜の意味に最も近いものはどれですか。」）
  //   (b) N5にも form（選択肢が「名詞／動詞・形容詞の普通形」等の術語列）が出ていた
  //   (c) N5 の cloze 誤答にN4敬語（「伺う」「いたす」）が混入して字面が不自然
  // ここが崩れると、基礎帯の学習者は設問・選択肢を読めない問題に再び当たる。
  const foundationPool = async () => {
    const drafts = (await loadAllBasicDrafts()) as unknown as GrammarDraftLike[];
    return { drafts, pool: buildVariantPool(drafts, 'foundation') };
  };
  /** 誤答解説「これは「〜」の意味です。」「「〜」は…の意味で…」から出典patternを取り出す */
  const srcPatternOf = (why: string | undefined): string | null => why?.match(/「([^」]+)」/u)?.[1] ?? null;

  it('foundationのmeaning/formは設問の主行が中国語（questionJa=null・questionZh必須・見出しは残る）', async () => {
    const { pool } = await foundationPool();
    let seen = 0;
    for (const qs of pool.byItem.values()) {
      for (const q of qs) {
        if (q.type !== 'meaning' && q.type !== 'form') continue;
        seen += 1;
        expect(q.questionJa, `${q.key} に日本語メタ設問が残っている`).toBeNull();
        expect(q.questionZh.trim().length, `${q.key} のquestionZhが空`).toBeGreaterThan(0);
        // 「何の文型を問われているか」は見出し（targetJapanese）で見え続けること
        expect(q.targetJapanese, `${q.key} の見出しが消えている`).toBeTruthy();
      }
    }
    expect(seen).toBeGreaterThan(100); // meaning+form が生成されていること（消して0にする抜け道の封じ）
  });

  it('N5項目にはformを出さない。落とした項目にも rec/meaning/cloze が残る', async () => {
    const { drafts, pool } = await foundationPool();
    for (const d of drafts) {
      const qs = pool.byItem.get(d.grammarId) ?? [];
      if (d.level === 'N5') {
        expect(qs.some((q) => q.type === 'form'), `${d.grammarId} にN5のformが出ている`).toBe(false);
        expect(qs.length, `${d.grammarId} の出題が空（formを落とした代わりが無い）`).toBeGreaterThan(0);
      }
    }
    // N4のformは残す（接続はN4帯の主対象。全消しで検査を通す抜け道の封じ）
    const n4form = [...pool.byItem.values()].flat().filter((q) => q.type === 'form').length;
    expect(n4form).toBeGreaterThanOrEqual(10);
  });

  it('N5のcloze/meaning誤答はN5項目からだけ採られる（N4敬語の字面を混ぜない）', async () => {
    const { drafts, pool } = await foundationPool();
    const byId = new Map(drafts.map((d) => [d.grammarId, d]));
    const byPattern = new Map(drafts.map((d) => [d.pattern, d]));
    const bad: string[] = [];
    for (const [id, qs] of pool.byItem) {
      if (byId.get(id)?.level !== 'N5') continue;
      for (const q of qs) {
        if (q.type !== 'cloze' && q.type !== 'meaning') continue;
        for (const c of q.choices) {
          if (c.isCorrect) continue;
          const pat = srcPatternOf(c.whyWrongJa ?? c.whyWrongZh);
          const src = pat ? byPattern.get(pat) : undefined;
          if (!src) { bad.push(`${q.key}: 誤答「${c.textJa}」の出典が特定できない`); continue; }
          if (src.level !== 'N5') bad.push(`${q.key}: 誤答「${c.textJa}」が${String(src.level)}項目「${src.pattern}」から来ている`);
        }
      }
    }
    expect(bad, `帯を跨いだ誤答 ${bad.length}件:\n${bad.slice(0, 10).join('\n')}`).toEqual([]);
  });
});

describe('stageに書いた項目数が実数と一致する', () => {
  // 2026-08-18: 初級文法を108→148項目に増やしたとき、N5/N4ルートのstage説明に
  // 書いてある「48項目」「60項目」が更新されず、オンボーディングの経路プレビューで
  // 生徒に嘘の数字を見せていた。数字を書くなら実数と突き合わせる。
  const purposeOf = (target: 'N5' | 'N4', kind: string) => {
    const r = generateRoute({
      goalType: 'jlpt', targetJlpt: target, knowledgeBand: 'pre_n5',
      conversationBand: 'needs_assessment', diagnosis, nowISO: NOW,
    });
    const st = r.stages.find((s) => s.kind === kind)!;
    return `${st.purposeJa}\n${st.purposeZh}`;
  };

  it('N5基礎キャンプの説明にある項目数 = N5束の実項目数', async () => {
    const all = await loadAllBasicDrafts();
    const n5 = all.filter((d) => N5_UNIT_IDS.includes(d.unit)).length;
    const text = purposeOf('N5', 'foundation_camp');
    for (const n of text.match(/(\d+)\s*(?:項目|项)/g) ?? []) {
      expect(Number(n.replace(/\D/g, '')), `stage説明「${text}」が実数 ${n5} と食い違う`).toBe(n5);
    }
    expect(/\d+\s*(?:項目|项)/.test(text), '項目数の記述が消えた（テストの前提が崩れた）').toBe(true);
  });

  it('N4文法攻略の説明にある項目数 = N4束の実項目数', async () => {
    const all = await loadAllBasicDrafts();
    const n4 = all.filter((d) => N4_UNIT_IDS.includes(d.unit)).length;
    const text = purposeOf('N4', 'n3_bridge');
    for (const n of text.match(/(\d+)\s*(?:項目|项)/g) ?? []) {
      expect(Number(n.replace(/\D/g, '')), `stage説明「${text}」が実数 ${n4} と食い違う`).toBe(n4);
    }
    expect(/\d+\s*(?:項目|项)/.test(text), '項目数の記述が消えた（テストの前提が崩れた）').toBe(true);
  });
});
