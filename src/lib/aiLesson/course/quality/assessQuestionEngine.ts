// Assess問題の生成エンジン（§11-§13）。
//
// 原則:
// 1. assess画面には答えを載せない（中国語訳・注記・ふりがなを出さない）。teach画面と分離する。
// 2. 語ごとに「測る価値のある次元」だけを出す（cognateProfile）。
//    中国語と同じ漢字の語に「意味を選ぶだけ」の問題を出さない。
// 3. 生成は決定的（乱数なし）。同じ入力からは常に同じ問題が出る。
import type { FoundationItem } from '../foundationTypes';
import { cognateProfileFor, allowsCoreMeaningQuestion, type LearningDimension, type CognateProfile } from './cognateProfile';
import { contrastQuestionsFor } from './cognateContrastBank';

export interface AssessQuestion {
  questionId: string;
  itemId: string;
  dimension: LearningDimension;
  /** choice=選択式 / order=並べ替え（産出）。orderではchoicesがトークン、正解順はorderAnswer */
  kind: 'choice' | 'order';
  promptJa: string;
  promptZh: string;
  choices: string[];
  answerIndex: number;
  /** kind='order' のときの正解順（choicesを並べ替えた結果） */
  orderAnswer?: string[];
  /** 解説は回答後にのみ表示する（事前表示はleakage） */
  explanationJa: string;
  explanationZh: string;
}

const hasKanji = (s: string) => /[一-鿿]/.test(s);

/** seed文字列の決定的hash（arrangeと同系・乱数なし） */
const seedHash = (seed: string): number => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h;
};

/**
 * 決定的な他選択肢の選び方（乱数なし）。
 * QP-1対応: pool先頭固定だと誤答が毎回同じ語（姓名・出身…）になるため、
 * 対象語idのhashで開始位置を回転させる。同じ入力からは常に同じ結果。
 */
const pickDistractors = <T>(pool: T[], exclude: (t: T) => boolean, n: number, seed = ''): T[] => {
  const cand = pool.filter(t => !exclude(t));
  if (cand.length <= n || !seed) return cand.slice(0, n);
  const start = seedHash(seed) % cand.length;
  return [...cand.slice(start), ...cand.slice(0, start)].slice(0, n);
};

/**
 * 長さのつり合いを取った誤答選び（2026-08-22 問題設計監査）。
 *
 * 「一番長い選択肢を選ぶ」だけで当たる問題が単元教材に残っていた
 * （実測: 中心意味 u-core_meaning は最長を選ぶ戦略で 54.2%＝偶然25%の2倍）。
 * 正解と字数の近い候補の帯から採ることで、長さが手がかりにならないようにする。
 * 帯の中の順序は従来どおり seed の回転で決まるので、出題は決定的なまま。
 */
const pickDistractorsNearLength = <T>(
  pool: T[], exclude: (t: T) => boolean, n: number, seed: string,
  textOf: (t: T) => string, targetText: string,
): T[] => {
  const cand = pool.filter(t => !exclude(t));
  const bandSize = Math.max(n * 6, 12);
  if (cand.length <= bandSize) return pickDistractors(pool, exclude, n, seed);
  const target = [...targetText].length;
  const dist = cand.map(t => Math.abs([...textOf(t)].length - target));
  const hist: number[] = [];
  for (const d of dist) hist[d] = (hist[d] ?? 0) + 1;
  let acc = 0; let maxD = 0;
  for (let d = 0; d < hist.length; d += 1) {
    acc += hist[d] ?? 0;
    maxD = d;
    if (acc >= bandSize) break;
  }
  const band = cand.filter((_, i) => dist[i] <= maxD);
  return pickDistractors(band, () => false, n, seed);
};

/** 選択肢の並びを決定的に整える（正解の位置が常に同じにならないよう、idのhashで回転） */
const arrange = (correct: string, distractors: string[], seed: string): { choices: string[]; answerIndex: number } => {
  const all = [correct, ...distractors];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const shift = h % all.length;
  const choices = [...all.slice(shift), ...all.slice(0, shift)];
  return { choices, answerIndex: choices.indexOf(correct) };
};

/** 読み問題（漢字語のみ）。ふりがなを出さない画面でのみ成立する */
const readingQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  if (!hasKanji(item.lemma)) return null;
  const distractors = pickDistractorsNearLength(pool,
    p => p.id === item.id || p.readingKana === item.readingKana
      || Math.abs(p.readingKana.length - item.readingKana.length) > 1, 2, item.id + 'r',
    p => p.readingKana, item.readingKana)
    .map(p => p.readingKana);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(item.readingKana, distractors, item.id + 'r');
  return {
    questionId: `aq-${item.id}-reading`, itemId: item.id, dimension: 'reading', kind: 'choice',
    promptJa: `「${item.displayForm}」の読み方は？`, promptZh: `「${item.displayForm}」怎么读？`,
    choices, answerIndex,
    explanationJa: `${item.displayForm}＝${item.readingKana}`,
    explanationZh: `「${item.displayForm}」读作「${item.readingKana}」。`,
  };
};

/**
 * 穴埋めフレームで「意味的にも成立してしまう」誤答語幹（夜間監査 2026-07-30・G2基準）。
 * 例: 「名前を＿＿きます」に 聞 は正解になり得る。機械では意味判定できないため
 * 目視監査の結果をここに固定する（新語追加時はこのリストも見直す）。
 * 除外の結果 安全な誤答が2つ未満になった語は、cloze自体を出さない（無理に出題しない）。
 */
/**
 * フレーム自体が開放的で、どの誤答でも意味が成立し得る語（目視監査 2026-07-30）。
 * 「友だちが＿＿ます」「映画を＿＿ます」「11時に＿＿ます」型は除外語を並べても
 * きりがないため、clozeを出さない（他のStage2次元で測る）。
 */
const CLOZE_SUPPRESS = new Set(['fi-kuru', 'fi-miru', 'fi-neru']);

const CLOZE_DISTRACTOR_UNSAFE: Record<string, string[]> = {
  'fi-miru': ['決め', '考え', '比べ', '忘れ', '食べ', '教え'],   // 映画を＿＿ます: 決める/比べる等も成立
  'fi-neru': ['起き', '食べ', '決め', '忘れ', '見', '出'],       // 時刻だけのフレームは多くの動詞が成立
  'fi-hataraku': ['聞', '書', '読'],                             // 会社で＿＿いています: 聞く/書くも成立
  'fi-kaku': ['聞'],                                             // 名前を聞きます は正しい文
  'fi-kiku': ['書'],                                             // 音楽を書きます（作曲）が成立し得る
  'fi-kau': ['使'],                                              // 水を使います が成立
  'fi-tsukau': ['買'],                                           // スマホを買います が成立
  'fi-iku': ['聞', '書'],                                        // 学校に聞きます/書きます（問い合わせ/宛先）が成立し得る
  'fi-kaeru': ['入'],                                            // 家に入ります が成立
  'fi-hairu': ['帰', '決ま'],                                            // 店に帰ります（店員視点）が成立し得る
  'fi-noru': ['入', '決ま'],                                             // 電車に入ります が口語で成立し得る
  'fi-au': ['買'],                                               // 友達に買います（〜てあげる文脈）が成立し得る
  'fi-heru': ['分か', '変わ', '決ま'],                           // 体重が変わりました/分かりました が成立
  'fi-deru': ['決め', '比べ', '見', '考え'],                     // 家を決めます/比べます/見ます（内見）が成立
};

/** て形・た形の活用クラス（語幹フレームの誤答選定用・QP-2）。動詞以外はnull */
const teFormClass = (item: FoundationItem): string | null => {
  if (item.partOfSpeech !== 'verb') return null;
  if (item.verbGroup === 'g2') return 'te';
  if (item.verbGroup === 'g3') return item.lemma.endsWith('する') || item.lemma === 'する' ? 'shite' : 'kite';
  const last = item.lemma.slice(-1);
  if (last === 'む' || last === 'ぶ' || last === 'ぬ') return 'nde';
  if (last === 'く') return item.lemma === '行く' ? 'tte' : 'ite';
  if (last === 'ぐ') return 'ide';
  if (last === 'す') return 'shite';
  return 'tte'; // う・つ・る
};

/**
 * 文脈（穴埋め）問題。例文から対象語を伏せ、同じ品詞の語と選ばせる。
 * 中国語訳を出さないので答えが漏れない。活用形は例文の実表記を使う。
 */
/**
 * 穴埋め用の語幹。2文字動詞（住む・読む…）は従来語幹が縮まらず、活用された例文
 * （住んでいます）と一致せずclozeが生成できなかった。漢字1字＋かな1字の語は
 * 漢字部分を語幹として使う（全かな語は誤マッチを避けるため縮めない）。
 */
const clozeStemOf = (x: FoundationItem): string =>
  x.lemma.length > 2 ? x.lemma.slice(0, x.lemma.length - 1)
    : x.lemma.length === 2 && hasKanji(x.lemma[0]) && !hasKanji(x.lemma[1]) ? x.lemma[0]
    : x.lemma;

const clozeQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  if (CLOZE_SUPPRESS.has(item.id)) return null;
  const sentence = item.exampleJa;
  if (!sentence) return null;
  // 例文中の実際の表記を探す（活用で語尾が変わるため、語幹から順に試す）
  const stem = clozeStemOf(item);
  const surface = [item.displayForm, item.lemma, stem].find(s => s && sentence.includes(s));
  if (!surface) return null;
  const blanked = sentence.replace(surface, '＿＿');
  const formOf = (p: FoundationItem) => {
    const st = clozeStemOf(p);
    return surface === item.displayForm ? p.displayForm : (surface === item.lemma ? p.lemma : st);
  };
  // 長さで正解が分かってしまわないよう、対象語と近い長さの語を誤答に選ぶ。
  // QP-2対応: 語幹フレーム（＿＿んでいます等）では、同じ活用クラスの動詞だけを誤答にする。
  // クラス不一致の誤答（働→＿＿んで）は形だけで消去できてしまい、意味を測れない。
  const stemFrame = item.partOfSpeech === 'verb' && surface !== item.displayForm && surface !== item.lemma;
  // 空欄の直後（継続部）。誤答語幹はこの継続部と組み合わせて実在の活用形になる必要がある。
  const contAfterBlank = stemFrame ? sentence.slice(sentence.indexOf(surface) + surface.length) : '';
  const conjFits = (p: FoundationItem): boolean => {
    if (!stemFrame) return true;
    const st = clozeStemOf(p);
    const joined = st + contAfterBlank;
    // ます系（買います）・ました系（買いました）
    const m = masuForm(p.lemma, p.verbGroup);
    if (m && joined.startsWith(m)) return true;
    if (m && m.endsWith('ます') && joined.startsWith(m.slice(0, -2) + 'ました')) return true;
    // て形・た形系（読んで/読んだ・書いて/書いた…）
    const cls = teFormClass(p);
    const ends = cls === 'nde' ? ['んで', 'んだ'] : cls === 'ite' ? ['いて', 'いた'] : cls === 'ide' ? ['いで', 'いだ']
      : cls === 'tte' ? ['って', 'った'] : cls === 'shite' ? ['して', 'した'] : cls === 'kite' ? ['きて', 'きた']
      : cls === 'te' ? ['て', 'た'] : [];
    for (const e of ends) if (joined.startsWith(st + e)) return true;
    return false;
  };
  const unsafe = new Set(CLOZE_DISTRACTOR_UNSAFE[item.id] ?? []);
  const candidates = pool
    .filter(p => p.id !== item.id && p.partOfSpeech === item.partOfSpeech && p.meaningZh !== item.meaningZh)
    .filter(p => conjFits(p))
    .map(p => formOf(p))
    .filter((f): f is string => !!f && f !== surface && !unsafe.has(f) && Math.abs(f.length - surface.length) <= 1);
  const start = candidates.length > 2 ? seedHash(item.id + 'c') % candidates.length : 0;
  const distractors = [...candidates.slice(start), ...candidates.slice(0, start)].slice(0, 2);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(surface, distractors, item.id + 'c');
  return {
    questionId: `aq-${item.id}-context`, itemId: item.id, dimension: 'context', kind: 'choice',
    promptJa: `${blanked}\n＿＿に入る言葉は？`, promptZh: `＿＿处应该填哪个词？`,
    choices, answerIndex,
    explanationJa: `${sentence}`,
    explanationZh: item.exampleZh ?? '',
  };
};

/**
 * 語をその語自身で置き換えた空欄形（「仕事をする」→「仕事を＿＿」）。
 * 語が含まれていなければ null（空欄が作れない形は出題に使わない）。
 */
const blankOwnWord = (form: string, it: FoundationItem): string | null => {
  for (const w of [it.displayForm, it.lemma].filter((s) => s && s.length > 0)) {
    if (form.includes(w)) return form.replace(w, '＿＿');
  }
  return null;
};

/**
 * コロケーション問題（commonFormsJaがある語）。
 *
 * 【2026-08-17 CEO実機報告で作り直し】
 * 以前は「「する」を使う自然な言い方はどれ？」と聞いて
 *   日本に来る／**仕事をする**／学校に行く
 * を並べていた。誤答から対象語を除外するガード（複数正解の防止・G2監査 2026-07-29）が
 * ある以上、**対象語を含む選択肢＝正解**が構造的に確定してしまい、
 * 日本語を知らなくても字面の一致だけで解けていた。
 *
 * そこで全部の選択肢を**それぞれ自分の語で**空欄にする:
 *   「する」が入るのはどれ？ → 仕事を＿＿／日本に＿＿／学校に＿＿
 * こうすると「どの枠が する を取るか」を知らないと解けない＝測りたいものを測る。
 * 空欄が作れない形は出題しない（存在するふりをしない）。
 */
const collocationQuestion = (item: FoundationItem, pool: FoundationItem[]): AssessQuestion | null => {
  const forms = item.commonFormsJa ?? [];
  if (forms.length === 0) return null;
  const correct = blankOwnWord(forms[0], item);
  if (!correct) return null;
  // 誤答も自分の語で空欄にする。対象語を含む形は複数正解の危険があるので従来どおり外す
  const containsTarget = (s: string) => s.includes(item.displayForm) || s.includes(item.lemma);
  const distractors = pickDistractors(pool, p => p.id === item.id || !(p.commonFormsJa ?? []).length, 8, item.id + 'k')
    .map((p) => {
      const f = (p.commonFormsJa ?? [])[0];
      return f && !containsTarget(f) ? blankOwnWord(f, p) : null;
    })
    .filter((s): s is string => !!s && s !== correct)
    .slice(0, 2);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(correct, distractors, item.id + 'k');
  return {
    questionId: `aq-${item.id}-collocation`, itemId: item.id, dimension: 'collocation', kind: 'choice',
    promptJa: `「${item.displayForm}」が入るのはどれ？`,
    promptZh: `哪个空里可以填「${item.displayForm}」？`,
    choices, answerIndex,
    explanationJa: `よく使う形: ${forms.join('・')}`,
    explanationZh: `常用搭配：${forms.map((f) => `「${f}」`).join('')}`,
  };
};

/** 中心意味問題（japanese_specificの初回のみ）。中国語訳を選ばせる */
const coreMeaningQuestion = (item: FoundationItem, pool: FoundationItem[], profile: CognateProfile, introduced: boolean): AssessQuestion | null => {
  if (!allowsCoreMeaningQuestion(profile, introduced)) return null;
  // 日中同形語は中国語訳に見出し語がそのまま入る（「出身」→「出身地；来自」）。
  // 「「出身」の意味は？」と漢字で聞くと、字面を照合するだけで解けてしまう（2026-08-17）。
  // 出題自体は落とさない（この語こそ導入が要る）。**見出しを読みに替えて**漢字の一致を断つ。
  // 読みが無ければ照合を断てないので、そのときだけ出題しない。
  const revealsSurface = item.meaningZh.includes(item.displayForm) || item.displayForm.includes(item.meaningZh);
  const askedForm = revealsSurface ? (item.readingKana ?? '') : item.displayForm;
  if (askedForm.length === 0 || item.meaningZh.includes(askedForm)) return null;
  const distractors = pickDistractorsNearLength(pool,
    p => p.id === item.id || p.meaningZh === item.meaningZh, 2, item.id + 'm',
    p => p.meaningZh, item.meaningZh)
    .map(p => p.meaningZh);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(item.meaningZh, distractors, item.id + 'm');
  return {
    questionId: `aq-${item.id}-meaning`, itemId: item.id, dimension: 'core_meaning', kind: 'choice',
    promptJa: `「${askedForm}」の意味は？`, promptZh: `「${askedForm}」是什么意思？`,
    choices, answerIndex,
    explanationJa: `${item.displayForm}（${item.readingKana}）`,
    explanationZh: item.meaningZh,
  };
};

/**
 * 活用問題（動詞のStage 2）。ます形を問う。
 * verbGroupから機械的に正解を作り、誤答は他グループの規則を適用した形にする。
 */
const masuForm = (lemma: string, group: FoundationItem['verbGroup']): string | null => {
  if (group === 'g3') {
    if (lemma.endsWith('する')) return lemma.slice(0, -2) + 'します';
    if (lemma === '来る') return '来ます';
    return null;
  }
  if (group === 'g2') return lemma.endsWith('る') ? lemma.slice(0, -1) + 'ます' : null;
  if (group === 'g1') {
    const map: Record<string, string> = { 'う': 'い', 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち',
      'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り' };
    const last = lemma.slice(-1);
    return map[last] ? lemma.slice(0, -1) + map[last] + 'ます' : null;
  }
  return null;
};

const conjugationQuestion = (item: FoundationItem): AssessQuestion | null => {
  if (item.partOfSpeech !== 'verb' || !item.verbGroup) return null;
  const correct = masuForm(item.lemma, item.verbGroup);
  if (!correct) return null;
  // 誤答: 他グループの規則を当てはめた形（文法的に「ありそう」だが誤り）
  const wrongs = new Set<string>();
  for (const g of ['g1', 'g2', 'g3'] as const) {
    if (g === item.verbGroup) continue;
    const w = masuForm(item.lemma, g);
    if (w && w !== correct) wrongs.add(w);
  }
  wrongs.add(item.lemma + 'ます'); // 語幹を変えない典型的な誤り
  // 可能形（e段）との取り違えも中国語話者に多い誤り
  if (item.verbGroup === 'g1') {
    const eRow: Record<string, string> = { 'う': 'え', 'く': 'け', 'ぐ': 'げ', 'す': 'せ', 'つ': 'て',
      'ぬ': 'ね', 'ぶ': 'べ', 'む': 'め', 'る': 'れ' };
    const last = item.lemma.slice(-1);
    if (eRow[last]) wrongs.add(item.lemma.slice(0, -1) + eRow[last] + 'ます');
  }
  // 二類・三類は「他グループの規則を当てた形」がどれも正解より長くなるため、
  // **一番短いのを選ぶ**だけで当たっていた（2026-08-22 実測: 最短戦略50%／偶然33%）。
  // て形（食べる→食べて）は ます形ではないので誤答として正しく、しかも正解より短い。
  // 長さの手がかりを消すために、正解以下の長さの誤答を1つ確保する
  const teForm = (() => {
    const cls = teFormClass(item);
    if (!cls) return null;
    const st = item.lemma.length > 1 ? item.lemma.slice(0, -1) : item.lemma;
    if (cls === 'te') return `${st}て`;
    if (cls === 'shite') return item.lemma.endsWith('する') ? `${item.lemma.slice(0, -2)}して` : `${st}して`;
    if (cls === 'kite') return '来て';
    if (cls === 'nde') return `${st}んで`;
    if (cls === 'ite') return `${st}いて`;
    if (cls === 'ide') return `${st}いで`;
    if (cls === 'tte') return `${st}って`;
    return null;
  })();
  const pool = [...wrongs].filter(w => w !== correct);
  const L = [...correct].length;
  const same = pool.filter(w => [...w].length === L);
  const short = pool.filter(w => [...w].length < L);
  const long = pool.filter(w => [...w].length > L);
  // 同じ字数の誤答が2つあればそれが最良（長さが完全に手がかりにならない）。
  // 足りなければ「正解より短い」を1つ入れて、長いものだけが並ぶ形を避ける
  if (same.length + short.length === 0 && teForm && teForm !== correct && !pool.includes(teForm)) short.push(teForm);
  const distractors = [...same, ...short.slice(0, 1), ...long, ...short.slice(1)].slice(0, 2);
  if (distractors.length < 2) return null;
  const { choices, answerIndex } = arrange(correct, distractors, item.id + 'j');
  return {
    questionId: `aq-${item.id}-conjugation`, itemId: item.id, dimension: 'conjugation', kind: 'choice',
    promptJa: `「${item.displayForm}」のます形は？`, promptZh: `「${item.displayForm}」的ます形是？`,
    choices, answerIndex,
    explanationJa: `${item.displayForm}（${item.verbGroup === 'g1' ? '一類' : item.verbGroup === 'g2' ? '二類' : '三類'}）→ ${correct}`,
    explanationZh: `「${item.displayForm}」→「${correct}」`,
  };
};

/**
 * 産出問題（Stage 3）。意味を見て、その語を含む文をトークンから組み立てる。
 * 中国語訳は「何を言うか」の指示であり、日本語の語順という答えは示さない。
 */
const productionQuestion = (item: FoundationItem): AssessQuestion | null => {
  const sentence = item.exampleJa;
  if (!sentence || !item.exampleZh) return null;
  // 句読点で切り、助詞の前後で分割して3〜6トークンにする
  const core = sentence.replace(/[。！？]$/u, '');
  const tokens = core.split(/(?<=[はがをにでへとも])/u).map(t => t.trim()).filter(Boolean);
  if (tokens.length < 3 || tokens.length > 6) return null;
  // トークンが対象語を含むこと（その語を使う産出であること）を確認
  const stem = item.lemma.length > 2 ? item.lemma.slice(0, item.lemma.length - 1) : item.lemma;
  if (!tokens.some(t => t.includes(item.displayForm) || t.includes(stem))) return null;
  return {
    questionId: `aq-${item.id}-production`, itemId: item.id, dimension: 'production', kind: 'order',
    promptJa: `「${item.displayForm}」を使って、この意味の文を作ってください。`,
    promptZh: `用「${item.displayForm}」，把这个意思的句子排好：${item.exampleZh}`,
    choices: rotate(tokens), answerIndex: 0, orderAnswer: tokens,
    explanationJa: sentence,
    explanationZh: item.exampleZh,
  };
};

/** 決定的な並べ替え（元順と必ず異なる回転） */
const rotate = (tokens: string[]): string[] =>
  tokens.length < 2 ? tokens : [...tokens.slice(1), tokens[0]];

/** contrast bank由来（false_friend・partial_overlapの高リスク語） */
const contrastQuestions = (item: FoundationItem): AssessQuestion[] =>
  contrastQuestionsFor(item.id).map((c, i) => ({
    questionId: `aq-${item.id}-contrast${i}`, itemId: item.id, dimension: c.dimension, kind: 'choice' as const,
    promptJa: c.promptJa, promptZh: c.promptZh, choices: c.choices, answerIndex: c.answerIndex,
    explanationJa: c.explanationJa, explanationZh: c.explanationZh,
  }));

export interface BuildOptions {
  /** その語を既に導入済みか（core_meaningの可否に影響） */
  introduced: boolean;
  /** 最大問題数（Unit全体の分量調整用） */
  max?: number;
}

/**
 * 1語ぶんのassess問題を、cognate classに応じた優先順で生成する。
 * 生成できない次元は静かにskipされる（データが足りない語で無理に出題しない）。
 */
/**
 * UI/図鑑taxonomy（levelMeta 7分類）では対照注意だが、エンジンtaxonomy（4分類）が
 * japanese_specificのため対照問題が流れなかった語の明示override（分類自体は変更しない）。
 */
const CONTRAST_ROUTED_JAPANESE_SPECIFIC = new Set(['fi-shusshin', 'fi-tsugou']);

export const buildAssessQuestions = (
  item: FoundationItem, pool: FoundationItem[], opts: BuildOptions,
): AssessQuestion[] => {
  const profile = cognateProfileFor(item);
  const out: AssessQuestion[] = [];
  const push = (q: AssessQuestion | null) => { if (q) out.push(q); };

  switch (profile.cognateClass) {
    case 'false_friend':
      // 転移誤用が最優先。意味当ては出さない
      out.push(...contrastQuestions(item));
      push(clozeQuestion(item, pool));
      push(conjugationQuestion(item));
      push(readingQuestion(item, pool));
      push(productionQuestion(item));
      break;
    case 'partial_overlap':
      out.push(...contrastQuestions(item));
      push(clozeQuestion(item, pool));
      push(collocationQuestion(item, pool));
      push(conjugationQuestion(item));
      push(readingQuestion(item, pool));
      push(productionQuestion(item));
      break;
    case 'mostly_same':
      // 意味は推測できるので、読み・文脈・活用・産出で測る
      push(readingQuestion(item, pool));
      push(clozeQuestion(item, pool));
      push(conjugationQuestion(item));
      push(collocationQuestion(item, pool));
      push(productionQuestion(item));
      break;
    case 'japanese_specific':
      push(coreMeaningQuestion(item, pool, profile, opts.introduced));
      // CEO指示（2026-07-30）: UI/図鑑7分類ではfalse_friend扱いの「出身」「都合」は、
      // エンジン4分類（japanese_specific）を維持したまま、対照バンクの実問題だけを
      // 通常出題へ接続する（最小override・二重出題はquestionId dedupeで防止）。
      // coreMeaningの後に置くことで、初学者は導入問題から始まり対照は追加分になる。
      if (CONTRAST_ROUTED_JAPANESE_SPECIFIC.has(item.id)) out.push(...contrastQuestions(item));
      push(clozeQuestion(item, pool));
      push(conjugationQuestion(item));
      push(readingQuestion(item, pool));
      push(collocationQuestion(item, pool));
      push(productionQuestion(item));
      break;
  }
  const deduped = out.filter((q, i) => out.findIndex(o => o.questionId === q.questionId) === i);
  return opts.max ? deduped.slice(0, opts.max) : deduped;
};

/** その語をassessできるか（1問も作れない語はCoverage上 untested になる） */
export const canAssess = (item: FoundationItem, pool: FoundationItem[]): boolean =>
  buildAssessQuestions(item, pool, { introduced: false }).length > 0;
