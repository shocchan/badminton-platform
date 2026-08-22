// 文法問題のvariant決定的生成（§18・D-007/D-008 ＋ ASSESSMENT INTEGRITY §10〜§15）。
//
// 原則:
// - 実行時LLM生成はしない。既存draft本文からの決定的変換のみ（seed固定・テストで全件検査可能）
// - distractorは「同義・類似」を両方向に除外し、接続互換・文末互換を満たすものだけ採る
// - **正解はindexではなくchoiceIdで保持**（表示順はattempt時にシャッフルする＝位置バイアス排除）
// - 生成できない項目は生成しない（存在するふりをしない）
// - 機械検査（漏洩0・重複0・複数正解0・解説必須・出典必須・妥当性）を通った問題だけ emit
import { seededShuffle } from './advDiagnosis';
import {
  checkQuestionValidity, connectionHead, isConnectionCompatible, endingCategory, contentTokens,
  type ValidityIssue,
} from './advQuestionValidity';
import { skillOfQuestionType, SECTION_OF_SKILL, type ExamSection, type ExamSkill } from './advExamSkills';

/** N2GrammarDraft / N3GrammarDraft 共通の構造（structural typing・両方に適合） */
export interface GrammarDraftLike {
  grammarId: string;
  /**
   * JLPTレベル（'N5' | 'N4' | 'N3' | 'N2'）。任意（既存バンクはすべて持っている）。
   * foundationバンク内の**N5項目だけ**をさらに区別するために読む
   * （N5の誤答プール絞り・N5のform非出題。2026-08-19 難易度監査）。n3/n2の生成では一切参照しない。
   */
  level?: string;
  pattern: string;
  meaningJa: string;
  explanationZh: string;
  formation: string;
  examplesJa: string[];
  examplesZh: string[];
  similarPatterns: string[];
  recognition: {
    promptZh: string; options: string[]; answerIndex: number; explanationZh: string;
    /**
     * 誤答の理由（日本語）。**中国語画面にはそのまま出さない**（2026-08-22）。
     * 以前は whyJa / whyZh の両方にこの1本を流していたため、
     * 中国語で学ぶ生徒の画面に日本語の解説がそのまま出ていた。
     */
    distractorReason?: string;
    /** 誤答の理由（中国語）。無いときは中国語の定型文にフォールバックする */
    distractorReasonZh?: string;
  };
  contrast?: string;
  matchKeys?: string[];
}

export type AdvQuestionType = 'rec' | 'cloze' | 'meaning' | 'form';

/** 選択肢。正解は **isCorrect** が持ち、表示位置では判定しない（§11） */
export interface AdvChoice {
  /** 安定ID。表示順が変わっても不変（採点キー） */
  choiceId: string;
  textJa: string;
  /** 中国語gloss（あれば）。無い場合はtextJaをそのまま表示 */
  textZh?: string;
  isCorrect: boolean;
  /** なぜ違うか（§4「他の選択肢が違う理由」） */
  whyWrongJa?: string;
  whyWrongZh?: string;
}

/** 正解後に表示する説明（§4の必須項目） */
export interface AdvExplanation {
  meaningJa: string;
  meaningZh: string;
  whyCorrectJa: string;
  whyCorrectZh: string;
  exampleJa: string | null;
  exampleZh: string | null;
  sourceItemId: string;
  /** 出典の文法項目の表記（〜以上は 等） */
  sourceLabel: string;
}

export interface AdvBattleQuestion {
  /** `${type}:${grammarId}` or `${type}:${grammarId}:${i}`（未出判定・台帳共有キー） */
  key: string;
  /** 文法variantは AdvQuestionType。単元問題は `u-${dimension}` */
  type: string;
  level: 'foundation' | 'n3' | 'n2';
  /** 鍛えている試験科目（§10） */
  skill: ExamSkill;
  examSection: ExamSection;
  /** 学習対象の日本語（zh画面でもそのまま表示する・§2） */
  targetJapanese: string | null;
  /** 設問文（ja / zh を分離。片方しか無い場合はnull） */
  questionJa: string | null;
  questionZh: string;
  choices: AdvChoice[];
  explanation: AdvExplanation;
  sourceItemId: string;
  difficulty: 1 | 2 | 3;
  timed: boolean;
  variantId: string;
  reviewState: 'generated_draft' | 'validated_beta' | 'authored';
  status: 'authored' | 'validated_beta';
}

/**
 * patternの照合キー（〜・（）・／を除いた実表記の候補）。
 *
 * **これは「例文のどこに文型が出ているか」を探すための照合用キーであり、
 * 学習者に見せる表示テキストではない。** 活用に当てるため語の途中で切ってある
 * （「てしま」⊂てしまいます／「と思い」⊂と思います）。表示には displayFormsOf を使う。
 *
 * 〜 は**スロット境界**なので削除ではなく分割する。削除すると離れた2片が接着して
 * 「〜に〜られる」→「にられる」のように日本語として存在しない文字列ができる
 * （2026-08-17 実測: 「にられる」が cloze 誤答に9回・「やなど」が8回出ていた）。
 */
export const matchKeysOf = (d: GrammarDraftLike): string[] => {
  if (d.matchKeys && d.matchKeys.length > 0) return d.matchKeys;
  const parts = d.pattern
    .split(/[／/]/)
    .flatMap((p) => p.replace(/（[^）]*）/g, '').split(/[〜～]/))
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [d.pattern.replace(/[〜～]/g, '')];
};

const KANJI_RE = /[一-鿿]/u;
const KEY_PUNCT_RE = /[、。，,．.！!？?・＋+（）()「」『』／/\\\s…]/u;
/**
 * 文法書のラベル（日本語の語ではない）。「動詞て形」「い形容詞」「普通形」等は
 * pattern に出てくるが、選択肢としてそのまま出すと**日本語でないものを選ばせる**ことになる。
 */
const META_LABEL_RE = /(動詞|名詞|形容詞|普通形|辞書形|ない形|た形|て形|ます形|可能形|受身形|使役形|意向形|イ形|ナ形|数量詞|疑問詞|副詞|語幹)/u;

/**
 * 選択肢としてそのまま画面に出せる表示形（pattern から作る）。
 *
 * pattern は人が書いた見出しなので、単独で読める日本語であることが保証されている
 * （meaning/form 問題の設問文でも「「〜に違いない」の意味は」と既に表示している）。
 * 〜 はスロット境界として分割し、／・＋ は代替表記・結合として分割、（注記）は落とす。
 * 1文字（「に」「で」「も」）は blank に何でも入ってしまうので採らない。
 */
export const displayFormsOf = (d: GrammarDraftLike): string[] => {
  const out: string[] = [];
  for (const alt of d.pattern.replace(/[（(][^）)]*[）)]/gu, '').split(/[／/・]/u)) {
    for (const seg of alt.split(/[〜～＋+]/u)) {
      const t = seg.replace(KEY_PUNCT_RE, '').trim();
      if (t.length >= 2 && !META_LABEL_RE.test(t) && !out.includes(t)) out.push(t);
    }
  }
  // 長い＝具体的な形を優先（短い形ほど別の文にも当てはまり「誤答なのに正しい」危険が増える）
  return out.sort((a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0));
};

/**
 * matchKeys を学習者に見せるテキスト（cloze の正解／誤答）に流用してよいかの判定。
 *
 * 「切断」は**より長い既知の形との関係**で決まる。同じ項目が持つ pattern 由来の表示形か、
 * 同じ項目の別の matchKey が自分を接頭辞に含むなら、それは語の途中で切ったキー
 * （「ておい」⊂「ておいてください」／「に違いな」⊂「に違いない」）。
 * `siblings` には自分自身を含めてよい（自分自身は longer 判定に掛からない）。
 */
export const isDisplayableMatchKey = (key: string, forms: string[], siblings: string[] = []): boolean => {
  if (key.length < 2) return false;
  if (KEY_PUNCT_RE.test(key)) return false;
  // より長い既知形の途中で切られている。
  // ただし「切れ目のあとが助詞・です・する」なら、そこは語の切れ目であって語中ではない
  // （「たばかり」＋です／「まま」＋に／「抜きで」＋は／「ことに」＋します は単独で読める）。
  // 「ます」「ない」「て」「いる」は活用の続きなので切れ目として認めない
  // （「と思い」＋ます／「ざるを得」＋ない／「に伴っ」＋て／「に決まって」＋いる は断片）。
  const SEPARABLE_TAIL = /^(です|でし|だ|する|し|は|が|を|に|で|と|も|の|か|へ|や|から|まで|より)/u;
  const cutMidWord = [...forms, ...siblings]
    .some((f) => f.length > key.length && f.startsWith(key) && !SEPARABLE_TAIL.test(f.slice(key.length)));
  if (cutMidWord) return false;
  // 促音で終わる＝て形/た形の活用途中（「と思っ」「ちゃっ」）
  if (/[っッ]$/u.test(key)) return false;
  // 仮名の直後の漢字1字で終わる＝助詞＋動詞語幹の切断（「で働」「に住」「へ帰」）
  const last = key[key.length - 1] ?? '';
  const prev = key[key.length - 2] ?? '';
  if (KANJI_RE.test(last) && !KANJI_RE.test(prev)) return false;
  return true;
};

/** cloze の誤答テキストとして使ってよい候補（長い順）。空なら誤答に採用しない */
export const distractorTextsOf = (d: GrammarDraftLike): string[] => {
  const forms = displayFormsOf(d);
  if (forms.length > 0) return forms;
  // pattern 自体が文法書のラベル（「動詞て形」「い形容詞＋名詞」）の項目は誤答源にしない。
  // matchKeys には「書いて」「な部屋」のような**活用例**しか無く、単独の選択肢にならない。
  if (META_LABEL_RE.test(d.pattern)) return [];
  // 「〜で（場所）」のように pattern が1文字に潰れる助詞項目だけ、matchKeys を表示に流用する
  const keys = matchKeysOf(d);
  return keys.filter((k) => isDisplayableMatchKey(k, forms, keys));
};

const normalizePattern = (p: string): string => p.replace(/[〜～（）()／/\s]/g, '');

const hasKanaText = (s: string): boolean => /[぀-ゟ゠-ヿ]/u.test(s);
/** 漢字を含むか（選択肢の「漢字テル」検査に使う） */
const hasKanji = (s: string): boolean => /[一-鿿]/u.test(s);

/**
 * 見出し（pattern）から学習者が読み取れる断片。
 * （）内は語釈（場所・到着点／進行 等）なので落とす。
 * 「〜」は空欄マーカーなので**区切りとして扱う**（「たとえ〜ても」→「たとえ」「ても」）。
 */
const headingSegments = (pattern: string): string[] => {
  const stripped = pattern.replace(/（[^）]*）/gu, '').replace(/\([^)]*\)/gu, '');
  return stripped.split(/[〜～／/・、,]+/u).map((s) => s.replace(/\s+/gu, '').trim()).filter((s) => s.length > 0);
};

/** 最長共通部分文字列の長さ（活用違いを跨いで「見た目が一致する塊」を測る） */
const longestCommonSubstring = (a: string, b: string): number => {
  if (a.length === 0 || b.length === 0) return 0;
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
};

/**
 * 見出しが正解を割ってしまうか（rec問題で targetJapanese を出してよいかの判定）。
 *
 * 【なぜ作り直したか】
 * 旧実装は `correctText.includes(self.pattern)` を前提にしていたが、pattern には必ず
 * 「〜」「（）」「／」のいずれかが入るため選択肢に literal 一致することが構造的にありえず、
 * **全317問で一度も発火しないデッドコード**だった（2026-08-17 実測）。
 * そこで包含方向にも活用形にも依存しない「手がかり照合」に置き換える。
 *
 * 【判定】次の2つの検出器の論理和。どちらも「見出しが正解だけを指し、
 * 他の選択肢を指す手がかりが無い」ときにだけ true になる（＝曖昧なら隠さない）。
 *   検出器1（literal）: 見出しの断片／見出しに現れる matchKey が
 *     正解にだけ含まれ、かつ「正解に無く誤答にある」断片が1つも無い。
 *     → 「〜に（場所・到着点）」の「に」のような1文字の助詞を拾える。
 *   検出器2（活用許容）: 見出しの断片と各選択肢の最長共通部分文字列を
 *     断片長で正規化した一致度を比べ、正解の一致度が誤答の最大より厳密に大きい。
 *     → 「〜かもしれない」対「かもしれません」のような活用違いを拾える。
 *     1文字一致は偶然が多いので、絶対長2文字以上を要求する（1文字は検出器1が担当）。
 *
 * 【なぜ「隠さない」側に倒す条件を入れたか】
 * 見出しが候補を全部並べている場合（「これ・それ・あれ」「〜ましょう／〜ませんか」
 * 「あげます／くれます／もらいます」）は各断片が別々の選択肢を指すので手がかりにならない。
 * ここで隠すと漏洩は減らないのに「何を問われているか」だけが失われる。
 *
 * 【中国語glossの選択肢を対象外にする理由】
 * 選択肢が中国語のとき、promptZh 側が対象の日本語文を丸ごと引用している
 * （例: 「日本語を勉強し始めました」是什么意思？）。見出しを隠しても日本語は設問に残るので
 * 漏洩は1件も減らない。さらに漢字の一致は中国語話者にとって意味を読む正規の経路であり、
 * 漏洩として扱うと意味問題が成立しなくなる。
 */
export /**
 * 誤答理由の中国語版を決める（2026-08-22）。
 * authored な distractorReason は日本語のものと中国語のものが混在している。
 * **引用の外に仮名が残る＝日本語の説明**なので、その場合は中国語の定型文に置き換える。
 */
const UNQUOTED_KANA = /[\u3041-\u309F\u30A1-\u30FA]/;
export const zhDistractorReason = (
  zh: string | undefined, ja: string | undefined, pattern: string,
): string => {
  if (zh && zh.trim().length > 0) return zh;
  if (ja) {
    const plain = ja
      .replace(/「[^」]*」/g, '').replace(/『[^』]*』/g, '')
      .replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
    if (!UNQUOTED_KANA.test(plain)) return ja;   // 中国語で書かれている＝そのまま使える
  }
  return `不符合「${pattern}」的用法。`;
};

export const headingRevealsAnswer = (
  d: GrammarDraftLike, correct: string, wrongs: string[],
): boolean => {
  if (correct.length === 0 || wrongs.length === 0) return false;
  // 選択肢が日本語（かな入り）のときだけ文字照合が成立する
  if (!hasKanaText(correct) || !wrongs.every(hasKanaText)) return false;

  const segments = headingSegments(d.pattern);
  if (segments.length === 0) return false;

  // ── 検出器1: literal な断片一致 ──
  const headingFlat = segments.join('');
  const cues = new Set<string>(segments);
  for (const k of matchKeysOf(d)) {
    if (k.length > 0 && headingFlat.includes(k)) cues.add(k);
  }
  let literalPointsCorrect = false;
  let literalPointsWrong = false;
  for (const cue of cues) {
    const inCorrect = correct.includes(cue);
    const inWrong = wrongs.some((w) => w.includes(cue));
    if (inCorrect && !inWrong) literalPointsCorrect = true;
    if (!inCorrect && inWrong) literalPointsWrong = true;
  }
  if (literalPointsCorrect && !literalPointsWrong) return true;

  // ── 検出器2: 活用違いを跨ぐ一致度比較 ──
  const strength = (opt: string): { ratio: number; abs: number } => {
    let ratio = 0; let abs = 0;
    for (const seg of segments) {
      const len = longestCommonSubstring(seg, opt);
      const r = len / seg.length;
      if (r > ratio) { ratio = r; abs = len; }
      else if (r === ratio && len > abs) abs = len;
    }
    return { ratio, abs };
  };
  const c = strength(correct);
  const worstWrong = Math.max(...wrongs.map((w) => strength(w).ratio));
  return c.abs >= 2 && c.ratio > worstWrong;
};

/**
 * 同族文型の保守的検出:
 * ① 2文字以上の連続部分文字列を共有（一方だ/一方で 等）
 * ② 漢字を1文字でも共有（上では/上は/以上は の「上」族 等）
 */
const sharesStem = (a: string, b: string): boolean => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  for (let len = Math.min(s.length, 4); len >= 2; len--) {
    for (let i = 0; i + len <= s.length; i++) {
      if (l.includes(s.slice(i, i + len))) return true;
    }
  }
  const kanji = (t: string) => new Set(t.match(/[一-鿿]/g) ?? []);
  const ka = kanji(a);
  for (const c of kanji(b)) if (ka.has(c)) return true;
  return false;
};

/** 同義・類似の除外集合（両方向） */
export const buildExclusionSet = (self: GrammarDraftLike, all: GrammarDraftLike[]): Set<string> => {
  const ex = new Set<string>([self.grammarId]);
  const selfNorm = normalizePattern(self.pattern);
  const selfSims = new Set(self.similarPatterns.map(normalizePattern));
  for (const o of all) {
    if (o.grammarId === self.grammarId) continue;
    const oNorm = normalizePattern(o.pattern);
    if (selfSims.has(oNorm)) { ex.add(o.grammarId); continue; }
    if (o.similarPatterns.some((sp) => normalizePattern(sp) === selfNorm)) { ex.add(o.grammarId); continue; }
    if (sharesStem(selfNorm, oNorm)) { ex.add(o.grammarId); continue; }
  }
  return ex;
};

/** 機械検査（§18/§30）。1つでも失敗した問題はemitしない */
export const validateQuestion = (q: AdvBattleQuestion): string[] => {
  const issues: string[] = [];
  if (q.choices.length < 3) issues.push('choices<3');
  const texts = q.choices.map((c) => c.textJa.trim());
  if (new Set(texts).size !== texts.length) issues.push('duplicate_choice');
  const correctList = q.choices.filter((c) => c.isCorrect);
  if (correctList.length !== 1) issues.push(correctList.length === 0 ? 'no_correct' : 'multiple_correct');
  const ids = q.choices.map((c) => c.choiceId);
  if (new Set(ids).size !== ids.length) issues.push('duplicate_choice_id');
  const correct = correctList[0]?.textJa.trim() ?? '';
  if (correct.length === 0) issues.push('empty_correct');
  if (correct.length > 0 && q.questionZh.includes(correct)) issues.push('answer_leakage_zh');
  if (correct.length > 0 && q.questionJa !== null && q.questionJa.includes(correct)) issues.push('answer_leakage_ja');
  if (q.explanation.whyCorrectZh.trim().length === 0) issues.push('missing_explanation_zh');
  if (q.explanation.whyCorrectJa.trim().length === 0) issues.push('missing_explanation_ja');
  if (q.explanation.sourceItemId.trim().length === 0) issues.push('missing_source');
  return issues;
};

/** 文字列seed（キーから決定的に） */
export const hashSeed = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};

const CHOICE_IDS = ['choice-a', 'choice-b', 'choice-c', 'choice-d', 'choice-e'];

/** 選択肢配列を作る。**correctは常に配列先頭に置かず、choiceIdは元の並びで固定**（採点はisCorrect） */
const mkChoices = (
  correct: { ja: string; zh?: string },
  wrongs: { ja: string; zh?: string; whyJa?: string; whyZh?: string }[],
): AdvChoice[] => {
  const all = [
    { ...correct, isCorrect: true, whyJa: undefined as string | undefined, whyZh: undefined as string | undefined },
    ...wrongs.map((w) => ({ ...w, isCorrect: false })),
  ];
  return all.map((c, i) => ({
    choiceId: CHOICE_IDS[i] ?? `choice-${i}`,
    textJa: c.ja,
    textZh: c.zh,
    isCorrect: c.isCorrect,
    whyWrongJa: c.isCorrect ? undefined : c.whyJa,
    whyWrongZh: c.isCorrect ? undefined : c.whyZh,
  }));
};

/**
 * 選択肢の長さ均質性（§3「文体・時制・registerが揃う」の機械的近似）。
 * 長さが極端に違うと、内容を読まずに正解を推測できてしまう。
 * 検査（lengthSpread 3.2）より厳しめの 2.2 倍以内で採る。
 */
const lengthCompatible = (correct: string, cand: string): boolean => {
  const a = correct.length; const b = cand.length;
  if (a === 0 || b === 0) return false;
  const ratio = a >= b ? a / b : b / a;
  return ratio <= 2.2;
};

const meaningClause = (d: GrammarDraftLike): string | null => {
  const first = d.explanationZh.split('。')[0]?.trim() ?? '';
  if (first.length < 2 || first.length > 40) return null;
  const keys = matchKeysOf(d);
  if (!keys.some((k) => first.includes(k))) return first;
  // 中国語の説明は「「は」提示主题」のように**見出しを鉤括弧で引用してから**説明することが多い。
  // そのまま弾くと助詞（は・が・を…）は意味問題を1問も作れず、他項目の誤答にもなれなかった
  // （初級文法を入れて発覚。2026-08-17）。鉤括弧ごと落として説明部分だけを使う。
  const stripped = first.replace(/[「『][^」』]*[」』]/gu, '').replace(/^[，、,：:・\s]+/u, '').trim();
  if (stripped.length < 2 || stripped.length > 40) return null;
  // 括弧の外にまだ見出しが残っているなら答えが漏れるので使わない
  if (keys.some((k) => stripped.includes(k))) return null;
  return stripped;
};

const mkExplanation = (d: GrammarDraftLike, whyJa: string, whyZh: string, exIdx = 0): AdvExplanation => ({
  meaningJa: d.meaningJa,
  meaningZh: d.explanationZh,
  whyCorrectJa: whyJa,
  whyCorrectZh: whyZh,
  exampleJa: d.examplesJa[exIdx] ?? d.examplesJa[0] ?? null,
  exampleZh: d.examplesZh[exIdx] ?? d.examplesZh[0] ?? null,
  sourceItemId: d.grammarId,
  sourceLabel: d.pattern,
});

interface GenContext {
  self: GrammarDraftLike;
  level: 'foundation' | 'n3' | 'n2';
  /** distractor候補（除外集合適用済み・決定的順） */
  distractorPool: GrammarDraftLike[];
  /**
   * バンク内での項目の並び順（0始まり・ファイル読み込み順で安定）。
   * 長さバイアスの「役割」を hash ではなくこの index の巡回で決める。
   * hash だと束（unit）のような小さいスライスで役割が偏り、
   * 「その束では最長を選べば当たる」状態が実際に起きる
   * （実測 2026-08-18: hash方式で n4g-unit-8 の meaning が「最長を選ぶ」71.4%）。
   */
  itemIndex: number;
}

const baseFields = (type: AdvQuestionType, level: 'foundation' | 'n3' | 'n2', d: GrammarDraftLike) => {
  const skill = skillOfQuestionType(type);
  return {
    type, level, skill, examSection: SECTION_OF_SKILL[skill],
    sourceItemId: d.grammarId,
    timed: false,
    reviewState: (type === 'rec' ? 'authored' : 'validated_beta') as AdvBattleQuestion['reviewState'],
    status: (type === 'rec' ? 'authored' : 'validated_beta') as AdvBattleQuestion['status'],
  };
};

/** 1) authored recognition（既存問題の取り込み）。妥当性検査を通ったものだけ採用 */
const genRecognition = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const rec = self.recognition;
  const validity = checkQuestionValidity({
    promptJa: null, promptZh: rec.promptZh, choices: rec.options, answerIndex: rec.answerIndex,
    synonymGroups: [self.similarPatterns],
  });
  if (!validity.ok) return null; // 不適切なauthored問題はHOLD（呼び出し側で記録）

  const correctText = rec.options[rec.answerIndex];
  const wrongs = rec.options
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => i !== rec.answerIndex)
    .map(({ o }) => ({
      ja: o,
      whyJa: rec.distractorReason ?? `「${self.pattern}」の使い方に合いません。`,
      // 中国語版: 明示の訳 → （日本語が地の文に無ければ）そのまま流用 → 定型文。
      // 日本語の解説を中国語画面へ素通しさせない
      whyZh: zhDistractorReason(rec.distractorReasonZh, rec.distractorReason, self.pattern),
    }));
  // 見出し（pattern）が正解選択肢を割ってしまう場合は見出しを出さない。
  // 判定は headingRevealsAnswer（包含方向にも活用形にも依存しない手がかり照合）。
  // 見出しを消すだけで問題自体は消えない＝保守側の変更。
  const revealsAnswer = headingRevealsAnswer(self, correctText, wrongs.map((w) => w.ja));
  return {
    ...baseFields('rec', ctx.level, self),
    key: `rec:${self.grammarId}`,
    targetJapanese: revealsAnswer ? null : self.pattern,
    questionJa: null,
    questionZh: rec.promptZh,
    choices: mkChoices({ ja: correctText }, wrongs),
    explanation: mkExplanation(self, `「${self.pattern}」は${self.meaningJa}という意味です。`, rec.explanationZh),
    difficulty: 2,
    variantId: `rec-${self.grammarId}`,
  };
};

const CLOZE_Q_JA = '＿＿に入る言葉はどれですか。';
const CLOZE_Q_ZH = '填入＿＿的是哪一个？';

/** 2) cloze（例文の文型部分を＿＿に）。distractorは接続互換のある別文型のみ */
/**
 * 漢字のあとに続けても語を割らない助詞・助動詞（名詞の直後に立てる形）。
 * これ以外の仮名始まりのキーが漢字の直後に来ている場合、そこは**活用語尾**であり、
 * 穴を開けると語幹だけが文に残る。
 */
const PARTICLES_AFTER_NOUN = new Set([
  'に', 'で', 'へ', 'を', 'は', 'が', 'と', 'も', 'の', 'か', 'や', 'ね', 'よ',
  'から', 'まで', 'より', 'など', 'だけ', 'しか', 'ほど', 'くらい', 'ぐらい', 'ばかり',
  'さえ', 'でも', 'には', 'では', 'とは', 'にも', 'へは', 'をも', 'との', 'への', 'からの',
  'ので', 'のに', 'のは', 'のが', 'のを', 'なら', 'だと', 'だし', 'だから',
  'です', 'でした', 'だった', 'ですか', 'ですが', 'でしょう',
]);

/**
 * 穴が語の内部へ食い込むか（2026-08-17 実測で47問見つかった defect）。
 *
 * 実例: 「毎朝、コーヒーを飲＿＿、会社に行きます。」正解「んで」。
 * matchKeys は**照合のために**活用語尾で切ってあるので（て形の「んで」「って」など）、
 * そのまま穴にすると語幹の「飲」だけが文に残り、
 *   ・学習者には何を問われているか読めない
 *   ・誤答（「せる」「あれ」）と並べても文法を測っていない
 * という二重の壊れ方をする。
 *
 * 判定: 穴の直前が漢字で、キーが仮名で始まり、かつ名詞の直後に立てる助詞でないなら
 * 「活用語尾を切った」とみなして、その例文では cloze を作らない。
 * 「病院に行きます」の「に」のような正当な助詞の穴は残る（PARTICLES_AFTER_NOUN にある）。
 */
export const splitsWordStem = (ex: string, key: string): boolean => {
  const at = ex.indexOf(key);
  if (at <= 0) return false;
  const before = ex[at - 1];
  if (!/[一-鿿]/u.test(before)) return false;          // 直前が漢字でなければ語幹の切断ではない
  if (!/^[ぁ-ゟ]/u.test(key)) return false;            // 漢字・カタカナ始まりは語の頭
  return !PARTICLES_AFTER_NOUN.has(key);
};

const genCloze = (ctx: GenContext): AdvBattleQuestion[] => {
  const { self } = ctx;
  const keys = matchKeysOf(self);
  // 穴の位置＝**正解として画面に出る文字列**。matchKeys は照合用に語の途中で切ってあるので
  // （「てしま」「と言っ」「れそう」）、そのまま穴にすると正解が断片になる。
  // ここでは「語として読める形」だけを穴の候補にし、当たる形が無い例文は cloze にしない
  // （項目には rec/meaning/form が残るので「存在するふり」にはならない）。
  //
  // matchKeys を明示していない項目には表示形を足さない。「ここ・そこ・あそこ」のように
  // 「穴にすると他の選択肢も成立してしまうから cloze を作らせない」という
  // 作問側の意図的な判断を、こちらが勝手に覆さないため。
  const hitKeys = (() => {
    const forms = displayFormsOf(self);
    const explicit = !!(self.matchKeys && self.matchKeys.length > 0);
    const all = explicit ? [...new Set([...forms, ...keys])] : keys;
    const readable = all.filter((k) => forms.includes(k) || isDisplayableMatchKey(k, forms, keys));
    // 読める形の中では短い方を先に試す。穴は文型そのものだけを隠すのが基本で、
    // 正解だけ極端に長いと選択肢の長さが手がかりになってしまう（§3）
    return explicit
      ? readable.sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0))
      : readable;
  })();
  const selfHead = connectionHead(self.formation);
  const out: AdvBattleQuestion[] = [];
  const order = self.examplesJa.map((_, i) => i).sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
  for (const exIdx of order) {
    const ex = self.examplesJa[exIdx];
    // 候補を順に試す。1つ目が「答えが文中に残る」形でも、次の候補なら綺麗に穴が開くことがある
    // （「〜たり〜たりします」は表示形「たり」だと文中にもう1つ残るが「たりしました」なら残らない）
    let hit: string | null = null;
    let blanked = '';
    for (const k of hitKeys) {
      if (k.length < 2 || !ex.includes(k)) continue;
      if (splitsWordStem(ex, k)) continue;   // 語の途中に穴を開けない（下の注記）
      const b = ex.replace(k, '＿＿');
      if (b === ex) continue;
      // 文型が例文に2回以上出る場合、1回だけの置換では答えが同じ文中に残る（2026-08-17 監査P1）。
      // 照合は matchKeys と採用した正解だけで行う（表示形まで含めると
      // 「たとえ〜ても」の「ても」のように**穴と無関係な断片**で例文ごと落ちる）
      if ([...keys, k].some((x) => x.length >= 2 && b.includes(x))) continue;
      hit = k;
      blanked = b;
      break;
    }
    if (!hit) continue;
    // §3: 文法的に接続できる（接続互換）distractorのみ。
    // 誤答テキストは **matchKeys ではなく displayFormsOf（＝pattern 由来の表示形）** から採る。
    // matchKeys は照合用に語の途中で切ってあるため、そのまま出すと「てしま」「に違いな」
    // 「にられる」のような日本語として読めない断片が誤答に並ぶ（2026-08-17 実測 121スロット）。
    const hasKana = (s: string) => /[぀-ゟ゠-ヿ]/u.test(s);
    const cands = ctx.distractorPool
      .filter((d) => isConnectionCompatible(selfHead, connectionHead(d.formation)))
      .map((d) => ({
        d,
        ks: distractorTextsOf(d)
          // 仮名の有無が選択肢間でばらつくと「日本語文と中国語glossの混在」と同じ不均質になる
          .filter((k) => k !== hit && !ex.includes(k) && lengthCompatible(hit, k) && hasKana(k) === hasKana(hit))
          // §3 構造均質性: 正解と長さが近い表示形から使う（長さが手がかりにならないように）
          .sort((a, b) => Math.abs(a.length - hit.length) - Math.abs(b.length - hit.length)
            || (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0)),
      }))
      .filter((x) => x.ks.length > 0);
    const picked: { d: GrammarDraftLike; k: string }[] = [];
    // 妥当性検査（§3 構造均質性 lengthSpread 3.2）に落ちる組み合わせは**選ぶ前に**避ける。
    // 落としてから捨てると、その例文の cloze ごと消える
    const spreadOk = (cand: string): boolean => {
      const lens = [hit.length, ...picked.map((p) => p.k.length), cand.length];
      return Math.max(...lens) / Math.max(1, Math.min(...lens)) <= 3.2;
    };
    // 同じく §3 意味的近接。設問＋正解と内容語を共有する誤答を先に採る
    const ref = new Set([...contentTokens(`${CLOZE_Q_JA}${CLOZE_Q_ZH}`), ...contentTokens(hit)]);
    const connected = (cand: string): boolean => [...contentTokens(cand)].some((t) => ref.has(t));
    const takeFrom = (
      c: { d: GrammarDraftLike; ks: string[] }, needConnected: boolean, extra?: (k: string) => boolean,
    ): boolean => {
      if (picked.some((p) => p.d.grammarId === c.d.grammarId)) return false;
      // 表示形が複数ある項目（〜ていきます／〜てきます）は、先頭が既出と衝突しても次を試す
      const k = c.ks.find((cand) => (!needConnected || connected(cand))
        && (!extra || extra(cand))
        && spreadOk(cand)
        && !picked.some((p) => p.k === cand || sharesStem(normalizePattern(p.k), normalizePattern(cand))));
      if (!k) return false;
      picked.push({ d: c.d, k });
      return true;
    };
    // 【漢字テルの封じ】正解にだけ漢字が入っていると、日本語を読まずに
    // 「漢字のある選択肢を選ぶ」だけで当たってしまう
    //   （2026-08-18 実測: 漢字を含む選択肢がちょうど1つの cloze 136問中50問＝37%が正解。偶然25%）。
    // 仮名の有無を揃えているのと同じ理由で、漢字の有無も揃える。
    // 逆向き（正解にだけ漢字が無い）も同じテルになるので、まず**同じ漢字有無**の候補から採る。
    const sameKanji = (k: string) => hasKanji(k) === hasKanji(hit);
    for (const c of cands) { if (picked.length >= 3) break; takeFrom(c, true, sameKanji); }
    for (const c of cands) { if (picked.length >= 3) break; takeFrom(c, false, sameKanji); }
    for (const c of cands) { if (picked.length >= 3) break; takeFrom(c, true); }
    for (const c of cands) { if (picked.length >= 3) break; takeFrom(c, false); }
    if (picked.length < 3) continue;
    // 漢字を含む誤答を1つも確保できなかった例文は cloze にしない
    // （数より「字面で解けない」を優先。項目には rec / meaning / form が残る）
    if (hasKanji(hit) && !picked.some((p) => hasKanji(p.k))) continue;
    out.push({
      ...baseFields('cloze', ctx.level, self),
      key: `cloze:${self.grammarId}:${exIdx}`,
      targetJapanese: blanked,
      questionJa: CLOZE_Q_JA,
      questionZh: CLOZE_Q_ZH,
      choices: mkChoices(
        { ja: hit },
        picked.map(({ d, k }) => ({
          ja: k,
          whyJa: `「${d.pattern}」は${d.meaningJa}の意味で、この文には合いません。`,
          whyZh: `「${d.pattern}」的意思不同，与此句不符。`,
        })),
      ),
      explanation: mkExplanation(
        self,
        `この文は${self.meaningJa}を表すので「${self.pattern}」が入ります。接続は${self.formation}です。`,
        `${self.explanationZh}・接续：『${self.formation}』`,
        exIdx,
      ),
      difficulty: 2,
      variantId: `cloze-${self.grammarId}-${exIdx}`,
    });
    if (out.length >= 2) break;
  }
  return out;
};

/** 3) meaning（意味の選択）。選択肢は全て中国語gloss＝構造均質 */
const genMeaning = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  const correct = meaningClause(self);
  if (!correct) return null;

  // 候補を**全部集めてから**選ぶ。distractorPool の先頭3件をそのまま採ると、
  // 説明文が長い項目では「正解だけ極端に長い」が構造的に残る
  //   （2026-08-18 実測: 初級の新規40項目で 唯一最長=正解 75%・「最長を選ぶ」だけで正解率75%。
  //    gloss の中央値が新規24字／既存16字と偏っていたため、既存から採った誤答が必ず短くなっていた）。
  const cands: { d: GrammarDraftLike; m: string }[] = [];
  const seen = new Set<string>();
  for (const d of ctx.distractorPool) {
    const m = meaningClause(d);
    if (!m || m === correct || seen.has(m)) continue;
    if (!lengthCompatible(correct, m)) continue;
    seen.add(m);
    cands.push({ d, m });
  }

  // §3 長さバイアス: 正解の長さ順位を**偶然と同じ分布**へ寄せる。
  // 「正解が唯一最長になることを常に避ける」と、今度は
  // 「唯一最長を消して3択にする」逆戦略が偶然水準を超える（advChoiceLengthBias の
  // CHANCE_LOWER_BOUND_PCT と同じ考え方）。4択なら 唯一最長25%・唯一最短25%・中間50% が偶然。
  // そこで並び順の巡回で役割を決め（0:最長 1:最短 2,3:中間）、達成できないときだけ中間へ落とす。
  // 巡回にすると、どの連続スライス（束・ファイル）を切っても比率が偶然水準に保たれる。
  const roll = ctx.itemIndex % 4;
  const picked: { d: GrammarDraftLike; m: string }[] = [];
  const spreadOk = (cand: string): boolean => {
    const lens = [correct.length, ...picked.map((p) => p.m.length), cand.length];
    return Math.max(...lens) / Math.max(1, Math.min(...lens)) <= 3.2;
  };
  const take = (ok: (m: string) => boolean): boolean => {
    const c = cands.find((x) => !picked.includes(x) && ok(x.m) && spreadOk(x.m));
    if (c) picked.push(c);
    return !!c;
  };
  const fill = (): void => {
    while (picked.length < 3 && take(() => true)) { /* 残りは元の順で埋める */ }
  };
  if (roll === 0 && cands.filter((c) => c.m.length < correct.length).length >= 3) {
    // 正解が唯一最長になる組み合わせ
    for (let i = 0; i < 3; i++) take((m) => m.length < correct.length);
  } else if (roll === 1 && cands.filter((c) => c.m.length > correct.length).length >= 3) {
    // 正解が唯一最短になる組み合わせ
    for (let i = 0; i < 3; i++) take((m) => m.length > correct.length);
  } else {
    // 中間: 正解以上と正解以下を1つずつ確保（同着でよい）
    take((m) => m.length >= correct.length);
    take((m) => m.length <= correct.length);
  }
  fill();
  if (picked.length < 3) return null;

  const wrongs = picked.map(({ d, m }) => ({
    ja: m,
    whyJa: `これは「${d.pattern}」の意味です。`,
    whyZh: `这是「${d.pattern}」的意思。`,
  }));
  return {
    ...baseFields('meaning', ctx.level, self),
    key: `meaning:${self.grammarId}`,
    targetJapanese: self.pattern,
    // 基礎帯（N5/N4）は設問の主行を中国語だけにする（2026-08-19 難易度監査P1）。
    // 「「〜」の意味に最も近いものはどれですか。」という**日本語のメタ言語**が太字の主行に来ると、
    // N5学習者には設問自体が読めない（CEO指摘「N5にしては難しい」の実体の1つ）。
    // questionZh は従来から全問に併記済みで、AdvBattleRunner / AdvMockRunner は questionJa=null に対応している。
    // 対象の文型そのものは targetJapanese（見出し）として引き続き表示される。
    questionJa: ctx.level === 'foundation' ? null : `「${self.pattern}」の意味に最も近いものはどれですか。`,
    questionZh: `「${self.pattern}」的意思最接近哪一个？`,
    choices: mkChoices({ ja: correct }, wrongs),
    explanation: mkExplanation(
      self,
      `「${self.pattern}」は${self.meaningJa}という意味です。`,
      self.explanationZh,
    ),
    difficulty: 1,
    variantId: `meaning-${self.grammarId}`,
  };
};

/**
 * form問題で、**設問に書いてある見出しがそのまま正解の中に写っている**か。
 *
 * 【なぜ rec の headingRevealsAnswer と別に要るか】
 * form問題は `questionJa =「〜なければなりません」の接続はどれですか。` のように
 * **設問文そのものに pattern が入る**。rec のように targetJapanese を隠しても漏洩は消えない。
 * 一方で正解は formation（「動詞ない形の「ない」→「なければ」」）なので、
 * 見出しの連続2文字以上が正解にだけ現れると、日本語を知らなくても字面で選べてしまう。
 *   実測（2026-08-18・全3バンク）: 「〜なければなりません」→ 正解に「なければ」、
 *   「辞書形とます形の対応」→ 正解「動詞ます形」、「〜そうです（様態）」→ 正解に「元気そうです」。
 *
 * 【判定】見出しの連続部分文字列（区切り記号を除く）が正解に含まれ、
 * かつどの誤答にも含まれないものが1つでもあれば true。
 * 見出しの断片が誤答にも現れているなら手がかりにならないので false（＝曖昧なら消さない）。
 *
 * 【1文字も見る理由】「〜ておきます」→ 正解「動詞て形」、「〜ば〜ほど」→ 正解「動詞ば形」のように、
 * **たった1文字の仮名が正解にだけ入る**形が form では多い。2文字以上に限ると
 * 全84問中12問がこの形で残る（2026-08-18 実測）。form は最も冗長な出題タイプで、
 * 落としても各項目には rec / meaning / cloze が残るため、取りこぼしより安全側に倒す。
 */
export const formationRevealsAnswer = (pattern: string, correct: string, wrongs: string[]): boolean => {
  if (wrongs.length === 0) return false;
  for (let i = 0; i < pattern.length; i++) {
    for (let j = i + 1; j <= pattern.length; j++) {
      const cue = pattern.slice(i, j).replace(/[〜～（）()・／/、,\s]/gu, '');
      if (cue.length < 1) continue;
      if (correct.includes(cue) && !wrongs.some((w) => w.includes(cue))) return true;
    }
  }
  return false;
};

/** 4) formation（接続の選択） */
const genFormation = (ctx: GenContext): AdvBattleQuestion | null => {
  const { self } = ctx;
  // N5項目には form を出さない（2026-08-19 難易度監査P3）。
  // form の選択肢は「名詞／動詞・形容詞の普通形」のような**文法用語の列**で、
  // 主行を中国語にしても選択肢自体がN5学習者には読めない（実測: N5のform 3問が全問この形）。
  // form は最も冗長な出題タイプで、落としても各項目には rec / meaning / cloze が残る
  // （itemsWithZeroQuestions=0 の検査は advClozeChoiceIntegrity.test にある）。
  // N4のform は残す: N4帯はて形・ない形等の用語をN5単元で学習済みで、接続問題の主対象。
  if (ctx.level === 'foundation' && self.level === 'N5') return null;
  const stripTail = (f: string): string => f.split('＋')[0].trim();
  const correctBody = stripTail(self.formation.trim());
  if (correctBody.length < 3) return null;
  const wrongs: { ja: string; whyJa?: string; whyZh?: string }[] = [];
  for (const d of ctx.distractorPool) {
    const body = stripTail(d.formation.trim());
    if (body.length < 3 || body === correctBody || wrongs.some((w) => w.ja === body)) continue;
    if (!lengthCompatible(correctBody, body)) continue;
    wrongs.push({
      ja: body,
      whyJa: `これは「${d.pattern}」の接続です。`,
      whyZh: `这是「${d.pattern}」的接续。`,
    });
    if (wrongs.length >= 3) break;
  }
  if (wrongs.length < 3) return null;
  // 設問に出ている見出しが正解の中に写っている（＝字面で解ける）なら出さない。
  // form を落としても rec / meaning / cloze が残るので「学べない項目」は生まれない
  // （itemsWithZeroQuestions を全バンクで0に保つ検査が advClozeChoiceIntegrity.test にある）。
  if (formationRevealsAnswer(self.pattern, correctBody, wrongs.map((w) => w.ja))) return null;
  return {
    ...baseFields('form', ctx.level, self),
    key: `form:${self.grammarId}`,
    targetJapanese: self.pattern,
    // 基礎帯は設問の主行を中国語だけにする（2026-08-19 難易度監査P1・meaning側と同じ理由）
    questionJa: ctx.level === 'foundation' ? null : `「${self.pattern}」の接続はどれですか。`,
    questionZh: `「${self.pattern}」的接续是哪一个？`,
    choices: mkChoices({ ja: correctBody }, wrongs),
    explanation: mkExplanation(
      self,
      `「${self.pattern}」の接続は「${self.formation}」です。`,
      `接续：『${self.formation}』`,
    ),
    difficulty: 3,
    variantId: `form-${self.grammarId}`,
  };
};

export interface HeldQuestion {
  key: string;
  sourceItemId: string;
  issues: ValidityIssue[];
  disposition: 'HOLD' | 'SAFE_FALLBACK';
  /** 参考: 正解の文末カテゴリ */
  correctCategory: string;
}

export interface VariantPoolResult {
  byItem: Map<string, AdvBattleQuestion[]>;
  rejected: { key: string; issues: string[] }[];
  /** 妥当性で保留した authored 問題（監査対象・§3のHOLD分類） */
  held: HeldQuestion[];
  stats: {
    items: number; questions: number;
    byType: Record<AdvQuestionType, number>;
    multiVariantItems: number;
    itemsWithZeroQuestions: string[];
  };
}

/**
 * 項目群からvariantプールを構築（決定的）。
 * aliasIds は出題対象から除外（canonicalのみ）。
 */
export const buildVariantPool = (
  drafts: GrammarDraftLike[], level: 'foundation' | 'n3' | 'n2', aliasIds: Set<string> = new Set(),
): VariantPoolResult => {
  const canonical = drafts.filter((d) => !aliasIds.has(d.grammarId));
  const byItem = new Map<string, AdvBattleQuestion[]>();
  const rejected: { key: string; issues: string[] }[] = [];
  const held: HeldQuestion[] = [];
  const byType: Record<AdvQuestionType, number> = { rec: 0, cloze: 0, meaning: 0, form: 0 };
  let itemIndex = 0;

  for (const self of canonical) {
    const exclusion = buildExclusionSet(self, canonical);
    const pool = canonical.filter((d) => !exclusion.has(d.grammarId));
    // N5項目の誤答はN5項目からだけ採る（2026-08-19 難易度監査P5）。
    // バンク一括の誤答プールだと、N5のclozeにN4敬語（「伺う」「いたす」等）の表示形が
    // 誤答として混入していた（実測）。難しくはならないが、N5の学習者には不自然な字面になる。
    // 「初級の誤答をN3/N2に混ぜない」（advContent.ts のバンク分離）と同じ考え方を、帯の中でも1段下へ適用する。
    // shuffleの**後**に絞る＝N5由来の誤答の並びは従来と同一（既存出題の変化を最小にする）。
    const rotatedAll = seededShuffle(pool, hashSeed(self.grammarId));
    const rotated = level === 'foundation' && self.level === 'N5'
      ? rotatedAll.filter((d) => d.level === 'N5')
      : rotatedAll;
    const ctx: GenContext = { self, level, distractorPool: rotated, itemIndex: itemIndex++ };

    const rec = genRecognition(ctx);
    if (!rec) {
      const v = checkQuestionValidity({
        promptJa: null, promptZh: self.recognition.promptZh,
        choices: self.recognition.options, answerIndex: self.recognition.answerIndex,
        synonymGroups: [self.similarPatterns],
      });
      held.push({
        key: `rec:${self.grammarId}`, sourceItemId: self.grammarId,
        issues: v.issues, disposition: 'HOLD',
        correctCategory: v.detail.correctCategory,
      });
    }

    const candidates: AdvBattleQuestion[] = [
      ...(rec ? [rec] : []),
      ...genCloze(ctx),
      ...[genMeaning(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
      ...[genFormation(ctx)].filter((q): q is AdvBattleQuestion => q !== null),
    ];
    const ok: AdvBattleQuestion[] = [];
    for (const q of candidates) {
      const issues = validateQuestion(q);
      // 生成問題にも同じ妥当性基準を課す（選択肢の不均質・意味的断絶を出さない）
      const validity = checkQuestionValidity({
        promptJa: q.questionJa, promptZh: q.questionZh,
        choices: q.choices.map((c) => c.textJa),
        answerIndex: q.choices.findIndex((c) => c.isCorrect),
      });
      const all = [...issues, ...validity.blocking];
      if (all.length === 0) ok.push(q);
      else rejected.push({ key: q.key, issues: all });
    }
    byItem.set(self.grammarId, ok);
    for (const q of ok) byType[q.type as AdvQuestionType] += 1;
    // HOLDで0問になった項目は SAFE_FALLBACK として記録（存在するふりをしない）
    if (ok.length === 0) {
      const h = held.find((x) => x.sourceItemId === self.grammarId);
      if (h) h.disposition = 'SAFE_FALLBACK';
    }
  }

  const questions = [...byItem.values()].reduce((n, qs) => n + qs.length, 0);
  const multiVariantItems = [...byItem.values()].filter((qs) => new Set(qs.map((q) => q.type)).size >= 2).length;
  const itemsWithZeroQuestions = [...byItem.entries()].filter(([, qs]) => qs.length === 0).map(([id]) => id);
  return {
    byItem, rejected, held,
    stats: { items: canonical.length, questions, byType, multiVariantItems, itemsWithZeroQuestions },
  };
};

/** 監査用: endingCategory を再エクスポート（scriptから使う） */
export { endingCategory };
