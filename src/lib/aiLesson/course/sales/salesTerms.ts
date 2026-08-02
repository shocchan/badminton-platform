// 販売時に同意してもらう規約のバージョン。
//
// 購入記録に残すので、あとから「この人が同意したのはどの版か」を特定できる。
// 規約の本文を変えたら**必ずここを上げる**（上げ忘れると、変更前後の購入が区別できなくなる）。
//
// 日付形式にしているのは、法務ページの改定日とそのまま突き合わせられるようにするため。
export const CURRENT_SALES_TERMS_VERSION = '2026-08-02';

/** 同意の対象になる文書（購入画面と法務ページの対応をずらさないための一覧） */
export const AGREED_DOCUMENT_IDS = ['terms', 'cancel-policy', 'tokushoho'] as const;
export type AgreedDocumentId = typeof AGREED_DOCUMENT_IDS[number];
