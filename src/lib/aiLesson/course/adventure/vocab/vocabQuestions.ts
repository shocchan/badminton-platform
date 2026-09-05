// 層Cコンテンツ → 語彙問題（EXAM COVERAGE CLOSURE §6）。
//
// 鉄則:
// - **選択式のみ**。自由入力はJLPTルートに置かない。
// - 採点は choiceId のみ。表示位置は使わない（提示順は advChoiceOrder が決める）。
// - 誤答は「意味が近すぎて正解が2つになる」ものを避ける。作れなければその観点は出さない。
// - 決定的に生成する（seedのみに依存。実行時LLMは使わない）。
import type { AdvBattleQuestion, AdvChoice } from '../advVariants';
import type { VocabOriginalContent, VocabAspect } from './vocabContent';
import { VOCAB_ASPECT_LABELS } from './vocabContent';
import { activeContent } from './vocabContent';
import { ALL_VOCAB_CONTENT } from './content/vocabContentBank';

const LEVEL_TO_BAND: Record<string, AdvBattleQuestion['level']> = {
  N5: 'foundation', N4: 'foundation', N3: 'n3', N2: 'n2', N1: 'n2',
};

/** 決定的な擬似乱数（seedのみに依存） */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const pickDistinct = <T>(pool: T[], count: number, seed: number, exclude: (t: T) => boolean): T[] => {
  const usable = pool.filter((t) => !exclude(t));
  const r = rng(seed);
  const out: T[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (out.length < count && used.size < usable.length && guard < 500) {
    guard += 1;
    const i = Math.floor(r() * usable.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(usable[i]);
  }
  return out;
};

/**
 * 長さのつり合いを取った誤答選び（2026-08-22 CEO指摘の問題設計監査）。
 *
 * 誤答を完全ランダムに採ると、**正解だけが長い**選択肢ができる。
 * 例:「それ」の意味 → 「那个（离听话人近）」（正解・最長）／「更；再多」／「桌子（餐桌）」／「排列；摆放」
 * 日本語を知らなくても「一番長いのを選ぶ」で当たってしまい、実力が測れない
 * （監査実測: 意味問題 3,686 問のうち 778 問＝21% がこの形だった）。
 *
 * そこで、**正解と字数が近い候補**の帯から誤答を採る。帯の中では従来どおり seed で
 * 決定的にランダムなので、出題の多様性は保ったまま「長さで当てる」だけを潰せる。
 * 帯が足りないときは従来の全候補に戻す（問題を作れなくするより、長さの偏りを許す）。
 */
/** 表示上の字数（サロゲートペアを1字と数える） */
const charLen = (t: string): number => [...(t ?? '')].length;

const pickDistinctNearLength = <T>(
  pool: T[], count: number, seed: number, exclude: (t: T) => boolean,
  textOf: (t: T) => string, targetText: string,
): T[] => {
  const usable = pool.filter((t) => !exclude(t));
  const target = charLen(targetText);
  // 帯の広さ: 必要数の6倍（最低12件）。狭すぎると毎回同じ誤答になり、広すぎると効かない
  const bandSize = Math.max(count * 6, 12);
  if (usable.length <= bandSize) return pickDistinct(pool, count, seed, exclude);
  // 字数の差でヒストグラムを作り、必要件数に届く差までを帯にする。
  // 全体ソート（O(n log n) × 問題数）だと語彙全体の生成が目に見えて遅くなるので、
  // 1語あたり**プールを2回なめるだけ**（O(n)）で済ませる。並び順は元のまま＝決定性も保つ
  const dist = usable.map((t) => Math.abs(charLen(textOf(t)) - target));
  const hist: number[] = [];
  for (const d of dist) hist[d] = (hist[d] ?? 0) + 1;
  let acc = 0;
  let maxD = 0;
  for (let d = 0; d < hist.length; d += 1) {
    acc += hist[d] ?? 0;
    maxD = d;
    if (acc >= bandSize) break;
  }
  const band = usable.filter((_, i) => dist[i] <= maxD);
  return pickDistinct(band, count, seed, () => false);
};

const choice = (id: string, textJa: string, isCorrect: boolean, whyWrongZh?: string): AdvChoice => ({
  choiceId: id, textJa, isCorrect, whyWrongZh,
});

/**
 * 訳が実質同じかどうか。
 *
 * 完全一致だけを見ていたため、「学习」（勉強）と「学习（有计划地学）」（学習）が
 * 別物として扱われ、**意味問題に正解が2つ**入っていた（Pilotサンプル監査で発覚）。
 * 括弧の補足・区切り記号を落とし、語義の中心が重なるかで判定する。
 */
/**
 * 訳文字列 → 語義の中心。**同じ文字列を何度も割り直さない**（2026-08-17 実測）。
 * 語彙が3,349語に増えたとき、1語ぶんの出題を作るたびに同レベル全語（約1,500件）の訳を
 * 割り直しており、プール生成に8.3秒かかっていた。生徒のスマホでは画面が固まる時間になる。
 * 訳は不変なので文字列キーで持ち回してよい（同じ入力には必ず同じ配列を返す）。
 */
const glossCoreCache = new Map<string, string[]>();
const glossCore = (g: string): string[] => {
  const hit = glossCoreCache.get(g);
  if (hit) return hit;
  const out = g
    .replace(/[（(][^）)]*[）)]/g, '')     // 括弧の補足は語義の中心ではない
    .split(/[；;、,／/]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  glossCoreCache.set(g, out);
  return out;
};

/** どちらかの語義がもう一方に含まれていたら「近すぎる」＝誤答に使わない */
const glossTooClose = (a: string, b: string): boolean => {
  const A = glossCore(a); const B = glossCore(b);
  if (A.length === 0 || B.length === 0) return a === b;
  return A.some((x) => B.some((y) => x === y || (x.length >= 2 && y.includes(x)) || (y.length >= 2 && x.includes(y))));
};

/**
 * 中国語の訳が日本語表記をそのまま含む語（日中同形語）。
 * 「表示『温泉』的词是哪个？→ 温泉」のように、**中国語の設問文に答えがそのまま出る**ため、
 * 訳を手がかりにする観点（意味・紛らわしい語）は出題しない。
 */
/**
 * 表記のかなの形。漢字の連なりを1つの「漢」に潰す（剥がれる → 漢がれる）。
 *
 * 表記問題（この読みを漢字で書くと？）の誤答は、**送り仮名の形が正解と一致する**
 * ものに限る。一致していないと、語を1つも知らなくても形だけで当たってしまう。
 * 実例（lin さんのN2バトル 2026-08-29）:
 *   「はがれる」を漢字で書くと？ → 剥がれる／落ち着く／持ち込む／立ち寄る
 *   「〜がれる」で終わるのは1つだけなので、読めなくても正解が分かる。
 */
const kanaShape = (surface: string): string => surface.replace(/[一-鿿々〆ヶ]+/g, '漢');

/** 漢字を1文字でも共有しているか（交換 と 交感）。表記問題の誤答として一番効く */
const sharesKanji = (a: string, b: string): boolean => {
  const set = new Set([...a].filter((ch) => /[一-鿿]/.test(ch)));
  return [...b].some((ch) => set.has(ch));
};

const glossRevealsSurface = (c: VocabOriginalContent): boolean =>
  c.glossZh.includes(c.surface) || c.surface.includes(c.glossZh);

/**
 * 選択肢を確定する。表示テキストが重複したものは落とす
 * （同じ表記で読みが違う語がプールに並ぶため。例: 一日 いちにち／ついたち）。
 * 4択にならなければ null を返し、その観点は出題しない。
 */
const finalizeChoices = (choices: AdvChoice[]): AdvChoice[] | null => {
  const seen = new Set<string>();
  const out: AdvChoice[] = [];
  for (const c of choices) {
    const text = c.textJa.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(c);
  }
  if (out.length !== 4) return null;
  if (out.filter((c) => c.isCorrect).length !== 1) return null;
  return out;
};

/**
 * 見出し語が定型文に文字として含まれると、画面に答えが出てしまう
 * （「＿＿＿に入る**言葉**はどれですか」で答えが「言葉」、「**漢字**で書くと」で答えが「漢字」等・
 * 2026-08-16 CEO報告の水平展開）。衝突しない言い回しを選ぶ。全部衝突したら null＝出題しない。
 */
const pickPrompt = (
  surface: string, cands: Array<[string, string]>,
  // **中国語の定型文も見る**（2026-08-17）。中国語側だけに見出し語が現れる語がある。
  // 実例: 見出し語「表示」は、中文テンプレート「表示「〜」的词是哪个？」の動詞と同じ字面で、
  // 中国語画面の設問にそのまま答えが出ていた（ja側だけの検査では素通りしていた）
): [string, string] | null => cands.find(([ja, zh]) => !ja.includes(surface) && !zh.includes(surface)) ?? null;

const baseQuestion = (
  c: VocabOriginalContent, aspect: VocabAspect, i: number,
  questionJa: string, questionZh: string, choices: AdvChoice[],
): AdvBattleQuestion => ({
  key: `vocab:${c.surface}:${c.reading}:${aspect}`,
  type: `vocab-${aspect}`,
  level: LEVEL_TO_BAND[c.level] ?? 'n3',
  skill: 'charactersVocabulary',
  examSection: 'languageKnowledge',
  // 表記問題の見出しは**読み**を出す。漢字（＝正解の選択肢そのもの）を見出しに出すと
  // 画面に答えが見えてしまう（2026-08-16 CEO報告: ミニ模試「今にも」）
  targetJapanese: aspect === 'orthography' ? c.reading
    : aspect === 'meaning' || aspect === 'reading' ? c.surface : null,
  questionJa,
  questionZh,
  choices,
  explanation: {
    meaningJa: `${c.surface}（${c.reading}）`,
    meaningZh: c.glossZh,
    whyCorrectJa: c.exampleJa,
    whyCorrectZh: c.exampleZh,
    exampleJa: c.exampleJa,
    exampleZh: c.exampleZh,
    sourceItemId: c.wordId,
    sourceLabel: c.surface,
  },
  sourceItemId: c.wordId,
  difficulty: c.level === 'N5' || c.level === 'N4' ? 1 : c.level === 'N3' ? 2 : 3,
  timed: false,
  variantId: `${c.wordId}-${aspect}-${i}`,
  reviewState: 'validated_beta',
  status: 'validated_beta',
});

/**
 * プール1つぶんの索引。**同じ配列で何度呼んでも作り直さない**（2026-08-17 実測）。
 * 1語ごとに pool 全体（3,349語）を filter / find で走査していたため O(n²) になっており、
 * vocabPool(N3) 1回に8.3秒かかっていた。索引は pool の並び順を保つので出題内容は変わらない。
 */
interface PoolIndex {
  /** レベル → active_beta の語（pool の並び順） */
  byLevel: Map<string, VocabOriginalContent[]>;
  /** 表記 → 最初に見つかる active_beta の語（従来の pool.find と同じ選び方） */
  bySurface: Map<string, VocabOriginalContent>;
  /**
   * 読み → その読みを持つ表記（同音異字）。2026-08-22 の問題設計監査で、
   * 「かみ」を漢字で書くとどれですか → 加味 / 神 / 髪 が**別々の問題として3つ**でき、
   * しかも互いが誤答に入りうる＝正しい漢字を選んでも不正解になる状態だった
   */
  readingSurfaces: Map<string, string[]>;
  /**
   * 表記 → その表記の読み（同表記異音）。「一日」＝ ついたち / いちにち のように、
   * 同じ見出しで意味も読みも違う語があると、意味問題は設問が同一のまま正解が2つに割れ、
   * 読み問題は**正しい読みを選んでも不正解**になりうる（2026-08-22 問題設計監査）
   */
  surfaceReadings: Map<string, string[]>;
  /**
   * 空欄化した例文 → その文にそのまま当てはまる語。「新しい＿＿＿を買いました」は
   * 靴でもバッグでもラケットでも成り立つので、**それらを誤答にすると正解が3つ**になる
   */
  blankedExampleSurfaces: Map<string, string[]>;
}
const poolIndexCache = new WeakMap<VocabOriginalContent[], PoolIndex>();
const poolIndex = (pool: VocabOriginalContent[]): PoolIndex => {
  const hit = poolIndexCache.get(pool);
  if (hit) return hit;
  const byLevel = new Map<string, VocabOriginalContent[]>();
  const bySurface = new Map<string, VocabOriginalContent>();
  const readingSurfaces = new Map<string, string[]>();
  const surfaceReadings = new Map<string, string[]>();
  const blankedExampleSurfaces = new Map<string, string[]>();
  for (const o of pool) {
    if (o.state !== 'active_beta') continue;
    const list = byLevel.get(o.level);
    if (list) list.push(o); else byLevel.set(o.level, [o]);
    if (!bySurface.has(o.surface)) bySurface.set(o.surface, o);
    const rs = readingSurfaces.get(o.reading);
    if (rs) { if (!rs.includes(o.surface)) rs.push(o.surface); } else readingSurfaces.set(o.reading, [o.surface]);
    const sr = surfaceReadings.get(o.surface);
    if (sr) { if (!sr.includes(o.reading)) sr.push(o.reading); } else surfaceReadings.set(o.surface, [o.reading]);
    if (o.exampleJa.includes(o.surface)) {
      const blanked = o.exampleJa.replaceAll(o.surface, '＿＿＿');
      const list = blankedExampleSurfaces.get(blanked);
      if (list) { if (!list.includes(o.surface)) list.push(o.surface); } else blankedExampleSurfaces.set(blanked, [o.surface]);
    }
  }
  const idx: PoolIndex = { byLevel, bySurface, readingSurfaces, surfaceReadings, blankedExampleSurfaces };
  poolIndexCache.set(pool, idx);
  return idx;
};

/**
 * 1語ぶんの観点別問題を作る。
 * 誤答が作れない観点は**出さない**（無理に作って正解が2つになるのを避ける）。
 */
export const buildVocabQuestions = (
  c: VocabOriginalContent, pool: VocabOriginalContent[], seed: number,
): AdvBattleQuestion[] => {
  if (c.state !== 'active_beta') return [];
  const out: AdvBattleQuestion[] = [];
  const idx = poolIndex(pool);
  // レベル別の配列は pool の並び順のまま（=従来の filter と同じ並び）。
  // 出題は seed から決定的に選ぶので、**並びが変わると出る問題が変わる**。ここは崩さない
  const sameLevel = (idx.byLevel.get(c.level) ?? []).filter((o) => o.surface !== c.surface);

  // ① 意味: 見出し語 → 正しい中国語訳
  //   日中同形語（訳が表記をそのまま含む）は、設問を読むだけで答えが分かるので出さない
  const meaningWrong = pickDistinctNearLength(sameLevel, 3, seed + 1,
    (o) => glossTooClose(o.glossZh, c.glossZh), (o) => o.glossZh, c.glossZh);
  if (!glossRevealsSurface(c) && meaningWrong.length === 3) {
    const ch = finalizeChoices([
      choice(`${c.wordId}-m0`, c.glossZh, true),
      ...meaningWrong.map((o, i) => choice(`${c.wordId}-m${i + 1}`, o.glossZh, false, `这是「${o.surface}」的意思`)),
    ]);
    // 「一日」（ついたち／いちにち）のような同表記異音は、読みを添えないと正解が2つに割れる
    const head = (idx.surfaceReadings.get(c.surface)?.length ?? 1) > 1
      ? `${c.surface}（${c.reading}）` : c.surface;
    if (ch) {
      out.push(baseQuestion(c, 'meaning', 0,
        `「${head}」の意味はどれですか。`, `「${head}」是什么意思？`, ch));
    }
  }

  // ② 読み: 漢字を含む語だけ（かな語は読み問題にならない）
  //   誤答は**実在する語の読み**から採る。かなを1文字ずらした「ふきゅぬ」のような
  //   非語を並べると、日本語を知らなくても消去法で当たってしまい、何も測れない
  //   （Pilotサンプル監査: reading観点38問中28問が機能していなかった）。
  if (/[一-鿿]/.test(c.surface)) {
    // 同じ表記の別の読み（一日＝ついたち／いちにち）を誤答に入れると、
    // **正しい読みを選んでも不正解**になる。除いたうえで、設問に意味を添えてどちらの語か決める
    const otherReadings = (idx.surfaceReadings.get(c.surface) ?? []).filter((r) => r !== c.reading);
    /**
     * 誤答は実在語の読みから採る。**どの語の読みなのかまで言う**（2026-08-23 監査）。
     * 以前の「这是别的词的读音（これは別の語の読みです）」は情報量ゼロで、
     * 間違えた人が次に何を覚えればいいのか分からなかった。
     * 出典の語を名指しすれば、1問で2語ぶんの学びになる。
     */
    // 送り仮名は画面に出ている。「剥がれる」の読みを聞かれて誤答が「おちつく」では、
    // 語を知らなくても「〜がれる」で終わるものを選べば当たる（2026-08-29 lin さんの実測）。
    // 送り仮名を持つ語では、誤答の読みも同じ送り仮名で終わるものに限る。
    const okurigana = /[ぁ-ん]+$/.exec(c.surface)?.[0] ?? '';
    const okuriganaOk = (r: string): boolean => !okurigana || r.endsWith(okurigana);
    const readingPool = sameLevel.filter((o) => Math.abs([...o.reading].length - [...c.reading].length) <= 1
      && okuriganaOk(o.reading));
    const realSources = pickDistinct(
      readingPool,
      3, seed + 17, (o) => o.reading === c.reading || otherReadings.includes(o.reading),
    );
    const seen = new Set<string>();
    const uniq = realSources.filter((o) => {
      if (o.reading === c.reading || otherReadings.includes(o.reading) || seen.has(o.reading)) return false;
      seen.add(o.reading);
      return true;
    });
    if (uniq.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-r0`, c.reading, true),
        ...uniq.map((o, i) => choice(
          `${c.wordId}-r${i + 1}`, o.reading, false,
          // 訳が表記を含む語は、訳を出すと答えが透ける。その場合は語だけを示す
          glossRevealsSurface(o) ? `这是「${o.surface}」的读音` : `这是「${o.surface}」（${o.glossZh}）的读音`,
        )),
      ]);
      const hint = otherReadings.length > 0 && !glossRevealsSurface(c) ? `（${c.glossZh}）` : '';
      if (ch) {
        out.push(baseQuestion(c, 'reading', 1,
          `「${c.surface}」${hint}の読み方はどれですか。`, `「${c.surface}」${hint}怎么读？`, ch));
      }
    }
  }

  // ③ 表記: 読み → 正しい漢字表記
  if (/[一-鿿]/.test(c.surface)) {
    // 同音異字（かみ = 神 / 髪 / 加味）。誤答に入れると**正しい漢字なのに不正解**になる。
    // 設問にも意味を添えて、どの語のことか1つに決める（2026-08-22 問題設計監査）
    const homophones = (idx.readingSurfaces.get(c.reading) ?? []).filter((sf) => sf !== c.surface);
    // 誤答は**送り仮名の形が同じ**ものだけ（形で当てられないようにする・2026-08-29）。
    // そのうえで、漢字を共有する語（交換 に対する 交感）を優先する。JLPTの表記問題は
    // 「読みは分かるが、どの字か」を問う形式で、字がまるごと無関係な語を並べるものではない。
    const shape = kanaShape(c.surface);
    const okuri = /[ぁ-ん]+$/.exec(c.surface)?.[0] ?? '';
    // 表記は「どの字か」を問う形式なので、誤答が他の級の語でも問題は成立する。
    // 同級だけに絞ると、送り仮名が同じ語が3つ集まらず出題そのものが消えてしまう
    const orthCands = idx.byLevel.size > 0
      ? pool.filter((o) => o.state === 'active_beta' && o.surface !== c.surface)
      : sameLevel;
    const orthPool = orthCands.filter((o) => /[一-鿿]/.test(o.surface)
      && o.surface !== c.surface && !homophones.includes(o.surface)
      // 同義語（景色／風景）を誤答にすると、意味で選ぶ人には正解が2つに見える
      && o.glossZh !== c.glossZh
      // 送り仮名が違う語は、読みの末尾と見比べるだけで消せる＝問題として成立しない
      && (/[ぁ-ん]+$/.exec(o.surface)?.[0] ?? '') === okuri
      && charLen(o.surface) === charLen(c.surface));
    // 良い誤答の順: ①かなの形も同じで漢字を共有（交換／交感） ②かなの形が同じ ③送り仮名だけ同じ
    const tiers = [
      orthPool.filter((o) => kanaShape(o.surface) === shape && sharesKanji(c.surface, o.surface)),
      orthPool.filter((o) => kanaShape(o.surface) === shape && !sharesKanji(c.surface, o.surface)),
      orthPool.filter((o) => kanaShape(o.surface) !== shape),
    ];
    const orthWrong: VocabOriginalContent[] = [];
    for (const tier of tiers) {
      if (orthWrong.length >= 3) break;
      orthWrong.push(...pickDistinctNearLength(
        tier, 3 - orthWrong.length, seed + 2, () => false, (o) => o.reading, c.reading,
      ));
    }
    // 訳が表記をそのまま含む語（日中同形）に意味を足すと答えが見えるので、その場合は足さない
    const hint = homophones.length > 0 && !glossRevealsSurface(c) ? `（${c.glossZh}）` : '';
    const orthPrompt = pickPrompt(c.surface, [
      [`「${c.reading}」${hint}を漢字で書くとどれですか。`, `「${c.reading}」${hint}的汉字写法是哪个？`],
      [`「${c.reading}」${hint}はどう書きますか。`, `「${c.reading}」${hint}怎么写？`],
    ]);
    if (orthWrong.length === 3 && orthPrompt) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-o0`, c.surface, true),
        ...orthWrong.map((o, i) => choice(`${c.wordId}-o${i + 1}`, o.surface, false,
          // 読みだけでは「で、その語は何？」が残る。訳が表記を割らない語には意味も添える
          glossRevealsSurface(o) ? `这是「${o.reading}」` : `这是「${o.reading}」（${o.glossZh}）`)),
      ]);
      if (ch) {
        out.push(baseQuestion(c, 'orthography', 2, orthPrompt[0], orthPrompt[1], ch));
      }
    }
  }

  // ④ 用法: よく一緒に使う形。
  //   各選択肢は**自分の見出し語を＿＿に置き換えて**出す。正解だけに見出し語が
  //   そのまま残ると、意味を知らなくても文字探しで当たってしまう（表記問題の
  //   見出し漏れと同時に修正・2026-08-16）。置き換えできない語（活用形の連語など）は使わない
  {
    const blankSelf = (surface: string, colloc: string): string | null => {
      const b = colloc.replace(surface, '＿＿');
      return b === colloc ? null : b;
    };
    const correctBlanked = c.collocationsJa.length > 0 && !glossRevealsSurface(c)
      ? blankSelf(c.surface, c.collocationsJa[0]) : null;
    if (correctBlanked) {
      // 連語は正解のほうが長くなりやすい（例: 正解「＿＿がかかる」／誤答「＿＿風」）。
      // 空欄化した**表示どおりの文字列**で長さをそろえる
      // 空欄化すると同じ文字列になる語がある（「頭を＿＿」など）。3件ちょうど採ると
      // 重複を落とした時点で足りなくなり、seed次第で用法問題が消える。多めに採って上から3件使う
      const usageWrong = pickDistinctNearLength(
        sameLevel.filter((o) => o.collocationsJa.length > 0 && blankSelf(o.surface, o.collocationsJa[0]) !== null),
        8, seed + 3,
        (o) => o.collocationsJa.some((x) => c.collocationsJa.includes(x)),
        (o) => blankSelf(o.surface, o.collocationsJa[0]) ?? o.collocationsJa[0], correctBlanked,
      );
      const seenTexts = new Set([correctBlanked]);
      const wrongBlanked = usageWrong
        .map((o) => ({ o, b: blankSelf(o.surface, o.collocationsJa[0])! }))
        .filter(({ b }) => !seenTexts.has(b) && (seenTexts.add(b), true))
        .slice(0, 3);
      if (wrongBlanked.length === 3) {
        const ch = finalizeChoices([
          choice(`${c.wordId}-u0`, correctBlanked, true),
          ...wrongBlanked.map(({ o, b }, i) => choice(`${c.wordId}-u${i + 1}`, b, false, `这是「${o.surface}」的搭配`)),
        ]);
        if (ch) {
          // 設問文に「＿＿」を書かない（正解の選択肢も＿＿で始まるため、文字一致を作らない）
          out.push(baseQuestion(c, 'usage', 3,
            `「${c.surface}」を使う言い方はどれですか。空らんには「${c.surface}」が入ります。`,
            `哪个是「${c.surface}」的常用搭配？空格处填「${c.surface}」。`, ch));
        }
      }
    } else if (c.collocationsJa.length > 0 && !glossRevealsSurface(c)) {
      // 活用で見出し語がそのまま現れない連語（やる→やってみる）は従来形式で出す。
      // 正解の文字列に見出し語が含まれないので、文字探しでは当たらない。
      // 誤答に見出し語を含む連語が混ざると逆に紛れるので除く
      const usageWrong = pickDistinct(
        sameLevel.filter((o) => o.collocationsJa.length > 0 && !o.collocationsJa[0].includes(c.surface)),
        3, seed + 3,
        (o) => o.collocationsJa.some((x) => c.collocationsJa.includes(x)),
      );
      if (usageWrong.length === 3) {
        const ch = finalizeChoices([
          choice(`${c.wordId}-u0`, c.collocationsJa[0], true),
          ...usageWrong.map((o, i) => choice(`${c.wordId}-u${i + 1}`, o.collocationsJa[0], false, `这是「${o.surface}」的搭配`)),
        ]);
        if (ch) {
          out.push(baseQuestion(c, 'usage', 3,
            `「${c.surface}」を使う言い方はどれですか。`, `哪个是「${c.surface}」的常用搭配？`, ch));
        }
      }
    }
  }

  // ⑤ 文脈: 例文の見出し語を空欄にして選ばせる
  //   「新しい＿＿＿を買いました」は靴でもバッグでもラケットでも成り立つ。
  //   同じ空欄文になる語を誤答に入れると**正解が複数**になるので、そこだけ外す
  //   （2026-08-22 問題設計監査。問題ごと落とすと語彙が痩せるので、誤答の選び方で直す）
  const alsoFits = c.exampleJa.includes(c.surface)
    ? (idx.blankedExampleSurfaces.get(c.exampleJa.replaceAll(c.surface, '＿＿＿')) ?? [])
      .filter((sf) => sf !== c.surface)
    : [];
  if (c.exampleJa.includes(c.surface)) {
    const ctxWrong = pickDistinctNearLength(sameLevel, 3, seed + 4,
      (o) => glossTooClose(o.glossZh, c.glossZh) || alsoFits.includes(o.surface), (o) => o.surface, c.surface);
    if (ctxWrong.length === 3) {
      // replaceAll: 例文に見出し語が2回出ると、1回だけの置換では答えが残る
      const blanked = c.exampleJa.replaceAll(c.surface, '＿＿＿');
      const ch = finalizeChoices([
        choice(`${c.wordId}-c0`, c.surface, true),
        ...ctxWrong.map((o, i) => choice(`${c.wordId}-c${i + 1}`, o.surface, false, `「${o.surface}」的意思是${o.glossZh}`)),
      ]);
      const ctxPrompt = pickPrompt(c.surface, [
        ['＿＿＿に入る言葉はどれですか。', '空格里应该填哪个词？'],
        ['＿＿＿のところに合うのはどれですか。', '空格处应该填哪一个？'],
      ]);
      if (ch && ctxPrompt) {
        out.push(baseQuestion(c, 'context', 4,
          `${blanked}\n${ctxPrompt[0]}`, `${blanked}\n${ctxPrompt[1]}`, ch));
      }
    }
  }

  // ⑥ 紛らわしい語: 明示的に登録したものだけ（勝手に近い語を選ばない）
  const confusables = c.confusableSurfaces
    .map((s) => idx.bySurface.get(s))
    .filter((o): o is VocabOriginalContent => !!o && !glossTooClose(o.glossZh, c.glossZh));
  if (confusables.length >= 2 && !glossRevealsSurface(c)) {
    const extra = pickDistinctNearLength(sameLevel, 3 - confusables.length, seed + 5,
      (o) => glossTooClose(o.glossZh, c.glossZh) || confusables.some((x) => x.surface === o.surface),
      (o) => o.surface, c.surface);
    const wrong = [...confusables, ...extra].slice(0, 3);
    if (wrong.length === 3) {
      const ch = finalizeChoices([
        choice(`${c.wordId}-x0`, c.surface, true),
        ...wrong.map((o, i) => choice(`${c.wordId}-x${i + 1}`, o.surface, false, `「${o.surface}」是${o.glossZh}`)),
      ]);
      const confPrompt = pickPrompt(c.surface, [
        [`「${c.glossZh}」という意味の言葉はどれですか。`, `表示「${c.glossZh}」的词是哪个？`],
        [`「${c.glossZh}」という意味なのはどれですか。`, `表示「${c.glossZh}」的是哪个？`],
      ]);
      if (ch && confPrompt) {
        out.push(baseQuestion(c, 'confusable', 5, confPrompt[0], confPrompt[1], ch));
      }
    }
  }

  return out;
};

/**
 * 生成結果のキャッシュ。
 *
 * 層Cが2,000語規模になり、1回の `vocabPool()` で1万問前後を組み立てるようになった。
 * 生成は **seed から決定的** なので、同じ (level, seed) の結果を使い回してよい。
 * バトル・模試・カバレッジ表示で何度も呼ばれるため、これが無いと毎回まるごと作り直す。
 */
const poolCache = new Map<string, Map<string, AdvBattleQuestion[]>>();

/**
 * 出題プールの既定seed。**変えると全生徒の出題が総入れ替えになる**ので固定。
 * 部分生成（vocabSubset.ts）も必ずこの値を使う（同じ語に同じ問題が当たる根拠）。
 */
export const VOCAB_POOL_SEED = 20260801;

/** 目標レベル → 出題に載せるJLPTレベル。**部分生成と共有する**（別々に書くとズレる） */
export const VOCAB_SCOPE: Record<'N1' | 'N2' | 'N3', readonly string[]> = {
  N3: ['N5', 'N4', 'N3'],
  N2: ['N5', 'N4', 'N3', 'N2'],
  // N1は下の級を全部含む（本試験の出題範囲がそうなっている）。
  // N1語彙は2026-09-05から構築中なので、当面は下の級の比重が高い
  N1: ['N5', 'N4', 'N3', 'N2', 'N1'],
};

/**
 * scope済みの active_beta 配列。**level ごとに1本だけ作って使い回す**。
 * ・並びが同じ＝添字 i が同じ＝ seed（`VOCAB_POOL_SEED + i * 31`）が同じ
 *   → 全量生成でも部分生成でも、同じ語には**同じ問題**が当たる
 * ・buildVocabQuestions 内の poolIndex は WeakMap のキーがこの配列なので、
 *   使い回すと索引の作り直しも起きない
 */
const scopedActiveCache = new Map<string, VocabOriginalContent[]>();
export const vocabScopedActive = (level: 'N1' | 'N2' | 'N3'): VocabOriginalContent[] => {
  const hit = scopedActiveCache.get(level);
  if (hit) return hit;
  const scope = VOCAB_SCOPE[level];
  const arr = activeContent(ALL_VOCAB_CONTENT).filter((c) => scope.includes(c.level));
  scopedActiveCache.set(level, arr);
  return arr;
};

/**
 * targetId（`vocab-<level>`）→ 問題。**全語ぶんを作る**ので3〜5秒かかる（3,349語 / 約16,500問）。
 *
 * 生徒の画面（AdvShell）はこれを呼ばない。1回のバトル・模試に要るのは数十語だけなので、
 * `vocabSubset.ts` の部分生成を使う（2026-08-17）。ここは
 * 「バンク全体を見たい」用途（内部コンソール・カバレッジ集計・テスト）専用。
 */
export const vocabPool = (level: 'N1' | 'N2' | 'N3', seed = VOCAB_POOL_SEED): Map<string, AdvBattleQuestion[]> => {
  const cacheKey = `${level}:${seed}`;
  const hit = poolCache.get(cacheKey);
  if (hit) return hit;
  const active = vocabScopedActive(level);
  const map = new Map<string, AdvBattleQuestion[]>();
  active.forEach((c, i) => {
    const qs = buildVocabQuestions(c, active, seed + i * 31);
    if (qs.length === 0) return;
    const target = `vocab-${c.level.toLowerCase()}`;
    map.set(target, [...(map.get(target) ?? []), ...qs]);
  });
  poolCache.set(cacheKey, map);
  return map;
};

export interface VocabQuestionCoverage {
  level: 'N2' | 'N3';
  activeWords: number;
  wordsWithQuestions: number;
  questions: number;
  byAspect: Record<string, number>;
  /** §6: CORE は 4〜6観点。満たしていない語 */
  belowAspectTarget: string[];
}

export const vocabQuestionCoverage = (level: 'N2' | 'N3', seed = VOCAB_POOL_SEED): VocabQuestionCoverage => {
  const active = vocabScopedActive(level);
  const byAspect: Record<string, number> = {};
  const below: string[] = [];
  let questions = 0; let withQ = 0;
  active.forEach((c, i) => {
    const qs = buildVocabQuestions(c, active, seed + i * 31);
    if (qs.length > 0) withQ += 1;
    questions += qs.length;
    const aspects = new Set(qs.map((q) => q.type.replace('vocab-', '')));
    for (const a of aspects) byAspect[a] = (byAspect[a] ?? 0) + 1;
    if (aspects.size < 4) below.push(`${c.surface}(${aspects.size})`);
  });
  return {
    level, activeWords: active.length, wordsWithQuestions: withQ,
    questions, byAspect, belowAspectTarget: below,
  };
};

export { VOCAB_ASPECT_LABELS };
