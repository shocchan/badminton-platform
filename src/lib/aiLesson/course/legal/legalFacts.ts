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

export interface LegalFacts {
  /** 特商法: 事業者の名称（屋号 + 代表者名） */
  operatorName: string | null;
  /** 特商法: 所在地。「請求により遅滞なく開示」を採る場合は 'on_request' */
  address: string | 'on_request' | null;
  /** 特商法: 電話番号。同上 */
  phone: string | 'on_request' | null;
  /** 問い合わせ窓口（確定済み） */
  contactEmail: string;
  /** 販売価格（税込・円）。半年伴走コース */
  priceJpyTaxIncluded: number | null;
  /** 支払方法 */
  paymentMethods: string[] | null;
  /** 支払時期 */
  paymentTiming: string | null;
  /** 役務の提供時期 */
  serviceStartTiming: string | null;
  /** 返金・中途解約の方針 */
  refundPolicy: string | null;
  /** 会話音声・transcriptの保存期間 */
  retentionPeriod: string | null;
  /** 削除申請への対応期限（日数） */
  deletionSlaDays: number | null;
  /** learnerの発話をサービス改善に使ってよいか */
  improvementUseAllowed: boolean | null;
  /** 受講可能な最低年齢。18未満を認める場合は保護者同意の条件も要る */
  minimumAge: number | null;
  /** 実際に会話内容が送信される外部AI事業者 */
  externalAiVendors: string[] | null;
  /** 準拠法・管轄 */
  governingLaw: string | null;
  /** データの保管先 */
  dataHosting: string;
}

/**
 * 現時点で確定している事実だけを入れている。
 * null は「まだ聞けていない」であって「無い」ではない。
 */
export const LEGAL_FACTS: LegalFacts = {
  operatorName: null,
  address: null,
  phone: null,
  contactEmail: 'info@kawabado.com',
  priceJpyTaxIncluded: null,
  paymentMethods: null,
  paymentTiming: null,
  serviceStartTiming: null,
  refundPolicy: null,
  retentionPeriod: null,
  deletionSlaDays: null,
  improvementUseAllowed: null,
  minimumAge: null,
  externalAiVendors: null,
  governingLaw: null,
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
