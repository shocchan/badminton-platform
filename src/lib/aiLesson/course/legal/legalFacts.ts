// 法務文書に載せる「事実」の単一情報源（Phase Release Closure）。
//
// ここが重要な設計判断: 法務文書に**推測で事実を書かない**。
// CEOしか答えられない事実（氏名・所在地・価格・返金・保存期間など）は
// 確定するまで `null` のままにし、null の項目を含むページは学習者へ公開しない。
//
// 「準備中」と書いたページを出すことも、もっともらしい住所や電話番号を
// 作文することも、どちらもしない。前者は未完成の公開、後者は虚偽になる。
//
// CEOの回答が届いたら、このファイルの値を埋めて `LEGAL_PUBLISH` を true にするだけでよい。
// 何が足りないかは `pendingLegalFacts()` が機械的に返す。
//
// ⚠️ **価格をここに書かない。** 商品が複数になったので、価格の正準は planCatalog。
//    ここに数値を持つと、カタログを直したのに特商法表記だけ古い、という食い違いが起きる。
import { publishedPlans, PROVISIONAL_TERMS_NOTICE } from '../plans/planCatalog';

/**
 * 自由文の法務事実は ja / zh を対で持つ。
 * CEOが決めた内容（日本語）を正とし、zh はその忠実な訳を置く。
 * 片方だけにすると、中国語ページに日本語の条文がそのまま出てしまう。
 */
export interface Bilingual { ja: string; zh: string }

export interface LegalFacts {
  /** 特商法: 事業者の名称（屋号 + 代表者名） */
  operatorName: string | null;
  /** 特商法: 所在地。「請求により遅滞なく開示」を採る場合は 'on_request' */
  address: string | 'on_request' | null;
  /** 特商法: 電話番号。同上 */
  phone: string | 'on_request' | null;
  /** 問い合わせ窓口（確定済み） */
  contactEmail: string;
  /**
   * 販売価格。**planCatalog から自動で組み立てる**（ここに数値を直接書かない）。
   * 公開中のプランが1つも無ければ null＝未確定として扱い、法務ページを公開しない。
   */
  priceJpyTaxIncluded: Bilingual | null;
  /** 支払方法 */
  paymentMethods: { ja: string; zh: string }[] | null;
  /** 支払時期 */
  paymentTiming: Bilingual | null;
  /** 役務の提供時期 */
  serviceStartTiming: Bilingual | null;
  /** 返金・中途解約の方針 */
  refundPolicy: Bilingual | null;
  /** 会話音声・transcriptの保存期間 */
  retentionPeriod: Bilingual | null;
  /** 削除申請への対応期限（日数） */
  deletionSlaDays: number | null;
  /** learnerの発話をサービス改善に使ってよいか */
  improvementUseAllowed: boolean | null;
  /** 受講可能な最低年齢。18未満を認める場合は保護者同意の条件も要る */
  minimumAge: number | null;
  /** 実際に会話内容が送信される外部AI事業者 */
  externalAiVendors: string[] | null;
  /** 準拠法・管轄 */
  governingLaw: Bilingual | null;
  /** データの保管先 */
  dataHosting: string;
}

/**
 * 特商法表記に載せる販売価格を planCatalog から組み立てる。
 *
 * 商品が複数あるので「¥100,000」の1行では足りない。公開中のプランを全部並べる。
 * 公開中が0件なら null＝未確定として扱い、`LEGAL_PUBLISH` が false になる
 * （価格が書けない状態で特商法表記を出さない）。
 */
const catalogPriceFact = (): Bilingual | null => {
  const plans = publishedPlans();
  if (plans.length === 0) return null;
  return {
    ja: plans.map((p) => `${p.nameJa}：${p.priceLabelJa}`).join('\n'),
    zh: plans.map((p) => `${p.nameZh}：${p.priceLabelZh}`).join('\n'),
  };
};

/**
 * 現時点で確定している事実だけを入れている。
 * null は「まだ聞けていない」であって「無い」ではない。
 */
export const LEGAL_FACTS: LegalFacts = {
  // CEO最終入力（2026-07-31・APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE と同時受領）。
  // 記録: docs/ai-course/production/human-gate-evidence.md
  operatorName: 'kawabado 安田翔',
  address: 'on_request',
  phone: 'on_request',
  contactEmail: 'info@kawabado.com',
  priceJpyTaxIncluded: catalogPriceFact(),
  paymentMethods: [{ ja: '銀行振込', zh: '银行转账' }],
  paymentTiming: { ja: '申込時に一括', zh: '报名时一次性支付' },
  serviceStartTiming: {
    ja: '決済確認後、招待コードの発行をもって開始',
    zh: '确认付款后，以发放邀请码作为开始',
  },
  // CEO決定（2026-08-02・複数プラン化にともない再変更）。
  //
  // **全商品へ同じ返金方針を固定しない。** 体験パス・1か月・6か月では期間も提供物も違う。
  // 特定商取引法の「特定継続的役務提供（語学教室）」に該当するかの確認が終わるまでは、
  // 「返金不可」「8日経過後は返金なし」といった**個別の条件を断定しない**。
  // 正準は planCatalog の PROVISIONAL_TERMS_NOTICE（法務ページ・LP・申込フォームで同じ文言を出す）。
  // → docs/ai-course/legal-open-questions.md
  refundPolicy: PROVISIONAL_TERMS_NOTICE,
  retentionPeriod: {
    ja: '受講期間中および受講終了後1年間保存します。ただし、退会または削除の申請があった場合は、法令上保存が必要な情報を除き、合理的な期間内に削除します。',
    zh: '在学习期间以及学习结束后保存1年。但如果提出退出或删除申请，除法律要求必须保存的信息外，将在合理期限内删除。',
  },
  deletionSlaDays: 30,
  improvementUseAllowed: false,
  minimumAge: 13,
  externalAiVendors: ['OpenAI'],
  governingLaw: {
    ja: '日本法を準拠法とし、さいたま地方裁判所またはさいたま簡易裁判所を第一審の専属的合意管轄裁判所とします。',
    zh: '以日本法为准据法，并约定埼玉地方法院或埼玉简易法院为第一审专属管辖法院。',
  },
  // コードから確認できる事実（Supabase / ブラウザ内保存）なのでCEO確認を要しない
  dataHosting: 'Supabase（PostgreSQL）およびブラウザ内のローカル保存',
};

/** CEOの確認が要る事実のうち、まだ埋まっていないもののキー。 */
export const pendingLegalFacts = (f: LegalFacts = LEGAL_FACTS): (keyof LegalFacts)[] => {
  const required: (keyof LegalFacts)[] = [
    'operatorName', 'address', 'phone', 'priceJpyTaxIncluded', 'paymentMethods',
    'paymentTiming', 'serviceStartTiming', 'refundPolicy', 'retentionPeriod',
    'deletionSlaDays', 'improvementUseAllowed', 'minimumAge', 'externalAiVendors',
    'governingLaw',
  ];
  return required.filter((k) => f[k] === null);
};

/**
 * 法務文書を学習者へ公開してよいか。
 * 事実が1つでも欠けている間は false（＝未完成のページを見せない）。
 * ページの実装・route・i18n・testは完成しているので、
 * CEOの回答が入って pendingLegalFacts() が空になれば自動的に true になる。
 */
export const LEGAL_PUBLISH = pendingLegalFacts().length === 0;

/**
 * staging でCEOが中身を確認するためのプレビュー。
 * `?legal=preview` のときだけ、未確定項目に印を付けた状態で表示する。
 * 本番の学習者導線からは決して辿れない。
 */
export const isLegalPreview = (search: string): boolean =>
  new URLSearchParams(search).get('legal') === 'preview';
