// 中国語母語者向け 同形語プロファイル（cognate-aware question engine の中核・§12）。
//
// 目的: 中国語と同じ漢字の語に「意味を選ぶだけ」の問題を大量に出さない。
// 語ごとに「中国語の同形語との関係」を分類し、その語で*測る価値のある*次元だけを出題する。
//
// 分類は AI が語ごとに個別判断したもの（authorship='individually_authored_by_ai'）。
// 人間の執筆・確認ではない。reviewStatus は human_review_candidate で、approved へは自動昇格しない。
import type { FoundationItem } from '../foundationTypes';

export type CognateClass =
  /** 同じ漢字・意味もほぼ同じ（例: 意見・問題）。意味当ては初回導入のみ */
  | 'mostly_same'
  /** 同じ漢字だが意味範囲がずれる（例: 家族・予定・高い）。範囲差と可否が焦点 */
  | 'partial_overlap'
  /** 同じ漢字だが意味が違う（例: 先生・約束・勉強する・全然）。転移誤用が焦点 */
  | 'false_friend'
  /** 中国語に同形語がない／和語（例: 友達・頑張る・気持ち・動詞の活用形） */
  | 'japanese_specific';

/** 測定できる学習次元（既存FoundationDimensionより広い。問題型選択に使う） */
export type LearningDimension =
  | 'reading'        // 読み方
  | 'core_meaning'   // 中心意味（初回導入のみ）
  | 'scope_contrast' // 中日の意味範囲差・使える／使えない
  | 'transfer_error' // 母語転移による誤用の訂正
  | 'particle'       // 助詞
  | 'conjugation'    // 活用
  | 'collocation'    // よく一緒に使う語
  | 'context'        // 文脈での選択
  | 'register'       // 場面・丁寧さ
  | 'production';    // 産出（並べ替え・応答）

/**
 * 【二層taxonomyの片側・エンジン用4分類】
 * この cognateClass は「出題次元の選択」（buildAssessQuestions のルーティング）専用。
 * UI・図鑑・フィルター・正準統計は vocabularyLevelMeta.ts の7分類（levelMetaOf/aggregateCognates）
 * を使う。両者は目的が異なる別レイヤーであり、数値を突き合わせる際は必ずどちらの分類かを明記する
 * （過去報告 ff8/partial10/mostly54/jp68 は本4分類、図鑑の ff9/partial46 は7分類。docs/ai-course/cognate-taxonomy.md）。
 */
export interface CognateProfile {
  itemId: string;
  cognateClass: CognateClass;
  /** 中国語の同形語（あれば）とその意味。false_friend/partial_overlapでは必須 */
  zhCognate: string | null;
  zhCognateMeaning: string | null;
  /** 転移誤用の代表例（false_friend/partial_overlapで必須）。「なぜ間違えるか」 */
  transferRiskZh: string | null;
  /** 高リスク（誤用が実害になる）語か。Coverage Contractでcontrast必須になる */
  highRisk: boolean;
  /** 分類の主体。AIによる個別判断であり、人間の確認は未実施 */
  authorship: 'individually_authored_by_ai';
  reviewStatus: 'human_review_candidate';
}

const p = (
  itemId: string, cognateClass: CognateClass,
  zhCognate: string | null = null, zhCognateMeaning: string | null = null,
  transferRiskZh: string | null = null, highRisk = false,
): CognateProfile => ({ itemId, cognateClass, zhCognate, zhCognateMeaning, transferRiskZh, highRisk,
  authorship: 'individually_authored_by_ai', reviewStatus: 'human_review_candidate' });

/**
 * 明示プロファイル。中国語話者にとって判断が分かれる語を優先して収録する。
 * 未収録の語は inferCognateProfile() が保守的に推定する（推定値も出題方針には使えるが、
 * highRisk扱いにはしない）。
 */
export const COGNATE_PROFILES: CognateProfile[] = [
  // ── false_friend（同じ漢字・意味が違う。最優先で誤用対策が要る） ──
  p('fi-sensei', 'false_friend', '先生', '（中）成年男性への敬称・夫',
    '中国語の「先生」＝Mr.。日本語の「先生」は教師・医師・弁護士等の専門職への呼称。初対面の男性に「先生」と呼ぶと誤り', true),
  p('fi-benkyo', 'false_friend', '勉强', '（中）気が進まないのに無理に／かろうじて',
    '中国語の「勉强」は「無理に」。日本語の「勉強する」は学習すること。「勉強しました」を「無理をしました」の意味で使う誤りが起きる', true),
  p('fi-yakusoku', 'false_friend', '约束', '（中）拘束する・制限する',
    '中国語の「约束」は「拘束・制限」。日本語の「約束」は取り決め。「約束します」を「制限します」の意味に取り違えやすい', true),
  p('fi-muri', 'false_friend', '无理', '（中）道理がない・理不尽',
    '中国語の「无理」は「理不尽」。日本語の「無理」は不可能・無茶。「無理です」を「理不尽です」と受け取る誤解が起きる', true),
  p('fi-jouzu', 'false_friend', '上手', '（中）着手する・慣れてくる',
    '中国語の「上手」は動詞的な「取りかかる」。日本語の「上手」は技能が高いこと。褒め言葉として使えることに気づきにくい', true),
  p('fi-zenzen', 'false_friend', '全然', '（中）まったく（肯定にも使う）',
    '中国語の「全然」は肯定にも付く。日本語の「全然」は基本的に否定と呼応する（全然わかりません）', true),
  p('fi-taihen', 'false_friend', '大变', '（中）大きく変わる',
    '日本語の「大変」は「とても／苦労が多い」。中国語の字面から「大きな変化」と取ると意味がずれる', true),
  p('fi-yasui', 'false_friend', '安', '（中）安全・安定',
    '中国語の「安」は安全。日本語の「安い」は値段が低いこと。「安いです」を「安全です」と誤解しやすい', true),

  // ── partial_overlap（同じ漢字・意味範囲がずれる） ──
  p('fi-kazoku', 'partial_overlap', '家族', '（中）一族・血縁集団まで含むことがある',
    '日本語の「家族」は同居する近親が中心。中国語の広い「家族」の感覚で使うと範囲がずれる', true),
  p('fi-yotei', 'partial_overlap', '预定', '（中）あらかじめ予約・確定する',
    '日本語の「予定」は「これからの計画・スケジュール」。中国語の「预定（予約する）」は日本語では「予約」', true),
  p('fi-takai', 'partial_overlap', '高', '（中）高さのみ。値段には「贵」',
    '日本語の「高い」は「高さ」と「値段」の両方。中国語の感覚だと値段に「高い」を使う発想が出にくい', true),
  p('fi-jouhou', 'partial_overlap', '情报', '（中）諜報・機密情報の語感が強い',
    '日本語の「情報」は日常的なinformation全般。中国語の「情报」の語感で使うと硬すぎる', false),
  p('fi-genki', 'partial_overlap', '元气', '（中）元気・生命力（やや書き言葉）',
    '日本語の「元気ですか」は日常の挨拶。中国語の「元气」は健康・活力の意味で挨拶には使わない', false),
  p('fi-komaru', 'partial_overlap', '困', '（中）眠い・閉じ込められる',
    '日本語の「困る」は「どうしていいか分からない」。中国語の「困」＝眠いの意味は日本語にはない', true),
  p('fi-kibishii', 'partial_overlap', '严', '（中）厳格（人にも規則にも）',
    '日本語の「厳しい」は人・規則に加え「状況が厳しい（difficult）」にも使う', false),
  p('fi-soudan', 'partial_overlap', '相谈', '（中）ほぼ使わない語',
    '日本語の「相談する」は日常語。中国語では「商量」。同形語がないので語形で覚える必要がある', false),
  p('fi-byouin', 'partial_overlap', '病院', '（中）「医院」が一般的',
    '日本語は「病院」、中国語は「医院」。漢字が入れ替わるので書き間違いが起きやすい', false),
  p('fi-kaisha', 'partial_overlap', '会社', '（中）「公司」が一般的',
    '日本語は「会社」、中国語は「公司」。字面が一致しないので語形の記憶が必要', false),

  // ── japanese_specific（中国語に同形語がない／和語・活用が焦点） ──
  ...['fi-tomodachi', 'fi-ganbaru', 'fi-kimochi', 'fi-kibun', 'fi-tsugou', 'fi-shigoto',
    'fi-suki', 'fi-oboeru', 'fi-wasureru', 'fi-nareru', 'fi-erabu', 'fi-shiraberu',
    'fi-kuraberu', 'fi-omou', 'fi-kangaeru', 'fi-kanjiru', 'fi-tsutaeru',
    'fi-kawaru', 'fi-kaeru-change', 'fi-fueru', 'fi-heru', 'fi-hajimeru', 'fi-owaru',
    'fi-tsuzukeru', 'fi-tsuzuku', 'fi-kimeru', 'fi-kimaru', 'fi-au', 'fi-neru',
    'fi-hairu', 'fi-deru', 'fi-noru', 'fi-oriru', 'fi-okiru', 'fi-sumu', 'fi-hataraku',
    'fi-taberu', 'fi-miru', 'fi-hanasu', 'fi-kiku', 'fi-kaku', 'fi-yomu', 'fi-kau',
    'fi-kaeru', 'fi-wakaru', 'fi-nomu', 'fi-tsukau', 'fi-tsukuru', 'fi-iku', 'fi-kuru',
    'fi-suru', 'fi-aru', 'fi-iru-exist', 'fi-kudasai', 'fi-nanji', 'fi-ikura', 'fi-ikutsu',
    'fi-kore', 'fi-basu', 'fi-oishii', 'fi-tabun', 'fi-nakanaka', 'fi-yatto',
    'fi-tsumari', 'fi-sorede', 'fi-kanarazu', 'fi-namae', 'fi-shusshin'].map(id => p(id, 'japanese_specific')),

  // ── mostly_same（同形・ほぼ同義。意味当ては初回導入のみ・以後は読み/文脈/産出） ──
  ...['fi-chugoku', 'fi-nihon', 'fi-gakusei', 'fi-kaishain', 'fi-nihongo', 'fi-neko',
    'fi-densha', 'fi-en', 'fi-ie', 'fi-eki', 'fi-gakkou', 'fi-kusuri', 'fi-mizu',
    'fi-okane', 'fi-ookii', 'fi-chiisai', 'fi-atarashii', 'fi-furui', 'fi-atsui',
    'fi-samui', 'fi-isogashii', 'fi-tanoshii', 'fi-muzukashii', 'fi-chikai', 'fi-tooi',
    'fi-ooi', 'fi-sukunai', 'fi-shizuka', 'fi-benri', 'fi-kantan', 'fi-yuumei',
    'fi-riyuu', 'fi-iken', 'fi-keiken', 'fi-shuukan', 'fi-houhou', 'fi-mondai',
    'fi-joukyou', 'fi-kankei', 'fi-kyoumi', 'fi-ureshii', 'fi-kanashii', 'fi-sabishii',
    'fi-hazukashii', 'fi-hitsuyou', 'fi-fukuzatsu', 'fi-jiyuu', 'fi-saikin',
    'fi-setsumei', 'fi-renraku', 'fi-kakunin', 'fi-junbi', 'fi-yoyaku', 'fi-riyou'].map(id => p(id, 'mostly_same')),
];

const BY_ID = new Map(COGNATE_PROFILES.map(c => [c.itemId, c]));

const hasKanji = (s: string) => /[一-鿿]/.test(s);

/**
 * プロファイル取得。未登録語は保守的に推定する（推定はhighRisk=falseに固定し、
 * 「同形語だから簡単」と誤って断定しない）。
 */
export const cognateProfileFor = (item: FoundationItem): CognateProfile => {
  const known = BY_ID.get(item.id);
  if (known) return known;
  // 漢字を含まない語は同形語問題が成立しない → 日本語固有として扱う
  return p(item.id, hasKanji(item.lemma) ? 'partial_overlap' : 'japanese_specific');
};

/**
 * その語で「測る価値のある」次元（§12の方針表）。
 * introduced=false（初回導入）のときだけ core_meaning を許可する。
 */
export const dimensionsFor = (profile: CognateProfile, introduced: boolean): LearningDimension[] => {
  switch (profile.cognateClass) {
    case 'mostly_same':
      // 意味は中国語から推測できる。読み・使い方・産出で測る
      return introduced
        ? ['reading', 'collocation', 'context', 'register', 'production']
        : ['core_meaning', 'reading', 'collocation', 'context'];
    case 'partial_overlap':
      return ['scope_contrast', 'context', 'transfer_error', 'collocation', 'production'];
    case 'false_friend':
      return ['transfer_error', 'scope_contrast', 'context', 'register', 'production'];
    case 'japanese_specific':
      return introduced
        ? ['reading', 'collocation', 'context', 'conjugation', 'production']
        : ['core_meaning', 'reading', 'context', 'conjugation'];
  }
};

/**
 * 単純な意味当て（core_meaning）を出してよいか。
 * - 既に導入済みの語には出さない（記憶ではなく推測で解けてしまう）
 * - mostly_same の語は初回であっても出さない（中国語と同じ漢字を選ぶだけになる）
 */
export const allowsCoreMeaningQuestion = (profile: CognateProfile, introduced: boolean): boolean =>
  !introduced && profile.cognateClass !== 'mostly_same';

/** highRisk語（contrast問題が必須になる） */
export const highRiskCognateIds = (): string[] =>
  COGNATE_PROFILES.filter(c => c.highRisk).map(c => c.itemId);
