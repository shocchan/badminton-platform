// 川口・蕨バドミントン交流会（バド本体）の法務文書に載せる「事実」の単一情報源。
//
// AI講座側（src/lib/aiLesson/course/legal/legalFacts.ts）と同じ設計方針を採る:
// **法務文書に推測で事実を書かない。** CEOしか答えられない事実は確定するまで null にし、
// null を含むページは公開しない。「準備中」と書いたページを出すことも、
// もっともらしい住所や電話番号を作文することも、どちらもしない。
//
// 何が足りないかは pendingKawabadoLegalFacts() が機械的に返す。

/** 自由文の法務事実は ja / zh を対で持つ（片方だけだと中国語ページに日本語条文が出る） */
export interface Bilingual { ja: string; zh: string }

export interface KawabadoLegalFacts {
  /**
   * 特商法: 事業者の名称（屋号 + 代表者名）。
   * 特定商取引法は個人事業主に「氏名」の表示を求めており、屋号だけでは要件を満たさない。
   * **このフィールドは特商法表記ページでのみ使う。**
   */
  operatorName: string | null;
  /**
   * プライバシーポリシー・利用規約など、氏名の表示義務が無い文書で使う呼称。
   * 本名を不必要に露出させないため、特商法ページ以外はこちらを使う。
   */
  displayName: string;
  /** 特商法: 所在地。「請求により遅滞なく開示」を採る場合は 'on_request' */
  address: string | 'on_request' | null;
  /** 特商法: 電話番号。同上 */
  phone: string | 'on_request' | null;
  /** 問い合わせ窓口 */
  contactEmail: string;
  /** 販売価格の説明（大会・通常活動で異なるため文章で持つ） */
  priceDescription: Bilingual | null;
  /** 参加費以外に必要な費用 */
  additionalFees: Bilingual | null;
  /** 支払方法 */
  paymentMethods: Bilingual[] | null;
  /** 支払時期 */
  paymentTiming: Bilingual | null;
  /** 役務（イベント）の提供時期 */
  serviceTiming: Bilingual | null;
  /** 返金・キャンセルの方針 */
  refundPolicy: Bilingual | null;
  /** 取得する個人情報の項目 */
  personalDataItems: Bilingual | null;
  /** 利用目的 */
  personalDataPurpose: Bilingual | null;
  /** 案内メールの配信停止方法 */
  optOut: Bilingual | null;
  /** 保存期間 */
  retentionPeriod: Bilingual | null;
  /** 第三者提供・委託先 */
  thirdParties: Bilingual | null;
  /** 準拠法・管轄 */
  governingLaw: Bilingual | null;
  /** データの保管先（コードから確認できるのでCEO確認不要） */
  dataHosting: string;
}

export const KAWABADO_LEGAL_FACTS: KawabadoLegalFacts = {
  // 事業者情報は AI講座側でCEOが確定させた値と同一（2026-08-02にバド本体への適用も承認）
  operatorName: 'kawabado 安田翔',
  // 特商法ページ以外は屋号のみ（CEO指示 2026-08-02。氏名の表示義務は特商法だけにかかる）
  displayName: 'kawabado',
  address: 'on_request',
  phone: 'on_request',
  contactEmail: 'info@kawabado.com',

  // 以下はいずれもコード・既存ページから確認できる事実
  priceDescription: {
    ja: '参加費はイベントごとに異なります。各大会・各通常活動のページに税込価格を表示しています（通常活動は1回600円〜、大会は1名1,000円〜。ダブルスの大会はペア単位の金額を表示することがあります）。',
    zh: '参加费因活动而异。各赛事・各常规活动页面均标示含税价格（常规活动每次600日元起，赛事每人1,000日元起。双打赛事有时会标示每组的金额）。',
  },
  additionalFees: {
    ja: '決済手数料の上乗せはありません（参加費と同額をお支払いいただきます）。大会によってはシャトルの持参をお願いする場合があります（各大会ページに表示）。会場までの交通費はお客様のご負担です。',
    zh: '不额外收取支付手续费（支付金额与参加费相同）。部分赛事需自备羽毛球（详见各赛事页面）。前往会场的交通费由客户承担。',
  },
  paymentMethods: [
    { ja: 'クレジットカード（Stripe）', zh: '信用卡（Stripe）' },
    { ja: 'PayPay', zh: 'PayPay' },
    { ja: 'WeChat Pay / Alipay（Stripe）', zh: '微信支付 / 支付宝（Stripe）' },
  ],
  paymentTiming: {
    ja: 'クレジットカード・WeChat Pay・Alipay は申込時にお支払いいただきます。PayPayは、申込後にお送りするご案内メールに記載の期限までにお支払いください。',
    zh: '信用卡・微信支付・支付宝在报名时支付。PayPay请在报名后发送的指引邮件所载期限前完成支付。',
  },
  serviceTiming: {
    ja: '各大会・各通常活動のページに記載した開催日時に、記載の会場で提供します。',
    zh: '在各赛事・各常规活动页面所载的日期时间，于所载会场提供。',
  },
  refundPolicy: {
    ja: 'キャンセル期限は大会ごとに設定し、各大会ページに表示しています。期限内にキャンセルされた場合は参加費を返金します。ただしクレジットカードでお支払いの場合は、キャンセル手数料として10%を差し引いた額の返金となります。キャンセル期限を過ぎたキャンセル、当日キャンセル、無断欠席については返金できません。',
    zh: '取消期限按各赛事设定，并在各赛事页面标示。在期限内取消的，将退还参加费。但以信用卡支付的，将扣除10%的取消手续费后退款。超过取消期限的取消、当日取消及无故缺席，恕不退款。',
  },
  personalDataItems: {
    ja: 'お名前、メールアドレス、電話番号、ペアの方のお名前（ダブルスの場合）、備考欄にご記入いただいた内容、および申込・キャンセルの履歴を取得します。クレジットカード番号は当会では取得・保存せず、決済代行会社（Stripe）が直接取り扱います。',
    zh: '我们收集姓名、电子邮箱、电话号码、搭档姓名（双打时）、备注栏填写的内容，以及报名和取消的记录。本会不收集或保存信用卡号，该信息由支付服务商（Stripe）直接处理。',
  },
  personalDataPurpose: {
    // 個人情報保護法は利用目的を「できる限り特定」するよう求めているため、
    // 「事業活動全般」のような包括表現は避け、実際に行う範囲を列挙している。
    // 今後の告知配信を想定し、案内・お知らせの送付と、活動の改善・運営を明示的に含める。
    ja: '申込内容の確認、参加者名簿の作成、当日の受付、開催内容の変更や中止のご連絡、お支払いおよび返金の手続き、お問い合わせへの回答に利用します。あわせて、今後の大会・通常活動・イベントのご案内、当会からのお知らせやアンケートの送付、および活動内容の改善と運営のために利用します。上記と関連性を有すると合理的に認められる範囲を超えて利用する場合は、あらためてご本人の同意をいただきます。',
    zh: '用于确认报名内容、编制参加者名单、当日接待、通知活动内容变更或取消、办理支付与退款手续，以及回复咨询。此外，还用于发送今后赛事・常规活动・活动的通知、本会的公告与问卷，以及改进活动内容与运营。若需超出与上述目的具有合理关联性的范围使用，将另行取得本人同意。',
  },
  /** 案内メールの配信停止方法（特定電子メール法で受信拒否の方法の明示が求められる） */
  optOut: {
    ja: 'ご案内やお知らせの配信は、いつでも停止できます。下記のお問い合わせ窓口までご連絡いただければ、以後お送りしません。配信を停止しても、お申し込みいただいたイベントに関する連絡（変更・中止のご案内など）はお送りします。',
    zh: '通知与公告的发送可随时停止。请联系下述咨询窗口，此后我们将不再发送。即使停止发送，与您已报名活动相关的联络（如变更・取消通知等）仍会发送。',
  },
  retentionPeriod: {
    ja: 'イベント終了後、会計処理および運営上の記録として保存します。削除のご希望があった場合は、法令上保存が必要な情報を除き、合理的な期間内に削除します。',
    zh: '活动结束后，作为会计处理及运营记录予以保存。如提出删除请求，除法律要求必须保存的信息外，将在合理期限内删除。',
  },
  thirdParties: {
    ja: '法令に基づく場合を除き、ご本人の同意なく第三者へ提供することはありません。ただし、決済処理のためStripe、データの保管のためSupabase、メール送信のためResendに、業務上必要な範囲で取り扱いを委託しています。なお、通常活動の申込では、参加者の把握のためお名前を各活動ページの参加者一覧に表示します。',
    zh: '除法律规定的情形外，未经本人同意不会向第三方提供。但为处理支付委托Stripe、为保存数据委托Supabase、为发送邮件委托Resend，在业务必要范围内处理相关信息。此外，常规活动的报名中，为便于掌握参加者情况，会在各活动页面的参加者名单中显示姓名。',
  },
  governingLaw: {
    ja: '日本法を準拠法とし、さいたま地方裁判所またはさいたま簡易裁判所を第一審の専属的合意管轄裁判所とします。',
    zh: '以日本法为准据法，并约定埼玉地方法院或埼玉简易法院为第一审专属管辖法院。',
  },
  dataHosting: 'Supabase（PostgreSQL）',
};

/** CEOの確認が要る事実のうち、まだ埋まっていないもののキー。 */
export const pendingKawabadoLegalFacts = (
  f: KawabadoLegalFacts = KAWABADO_LEGAL_FACTS
): (keyof KawabadoLegalFacts)[] => {
  const required: (keyof KawabadoLegalFacts)[] = [
    'operatorName', 'address', 'phone', 'priceDescription', 'additionalFees',
    'paymentMethods', 'paymentTiming', 'serviceTiming', 'refundPolicy',
    'personalDataItems', 'personalDataPurpose', 'optOut', 'retentionPeriod',
    'thirdParties', 'governingLaw',
  ];
  return required.filter((k) => {
    const v = f[k];
    return v === null || (Array.isArray(v) && v.length === 0);
  });
};

/** 未確定の事実が無いときだけ公開する */
export const KAWABADO_LEGAL_PUBLISH = pendingKawabadoLegalFacts().length === 0;

/** staging で中身を確認するためのプレビュー指定 */
export const isKawabadoLegalPreview = (search: string): boolean =>
  new URLSearchParams(search).get('legal') === 'preview';
