// 川口・蕨バドミントン交流会（バド本体）の法務文書に載せる「事実」の単一情報源。
//
// AI講座側（src/lib/aiLesson/course/legal/legalFacts.ts）と同じ設計方針を採る:
// **法務文書に推測で事実を書かない。** CEOしか答えられない事実は確定するまで null にし、
// null を含むページは公開しない。「準備中」と書いたページを出すことも、
// もっともらしい住所や電話番号を作文することも、どちらもしない。
//
// 何が足りないかは pendingKawabadoLegalFacts() が機械的に返す。
//
// 【事実の出どころ（2026-08-28 統合時に再確認）】
//   参加費        … src/lib/tournamentTypes.ts（シングルス1,500円/人・ダブルス2,000円/ペア）
//                    src/pages/ActivityPage.tsx（通常活動 600円〜・シャトル代込み）
//   支払方法      … src/lib/payment.ts の SELECTABLE_PAYMENT_METHODS
//                    = 'credit' | 'paypay' | 'wechat_alipay'
//                    （'bank'（銀行振込）は2026-08-28に選択肢から外した。型には過去の
//                      申し込みの表示のために残っているが、これから申し込む人は選べない）
//                    src/components/PaymentMethodSelector.tsx（追加受付中も WeChat Pay /
//                      Alipay は選べる。creditOnly が落とすのは PayPay だけ）
//   手数料        … src/lib/payment.ts「決済手数料の上乗せはしない（全支払い方法で参加費は同額）」
//   締切・追加受付 … src/lib/entryDeadline.ts（開催14日前 23:59 JST／late_entry_until）
//   返金          … supabase/functions/process-cancel/index.ts
//                    （自動返金は payment_method === 'credit' のときだけ。entryFee の10%控除）
//                    src/pages/CancelEntryPage.tsx（クレカ以外は振込/PayPayで返金）
//                    src/pages/CancelPolicyPage.tsx（確認後3〜5営業日）
//   取得する情報  … supabase/migrations/20260824110000_activity_entries_contact.sql
//                    （通常活動に email 任意・user_id を追加）
// 実装と表記が食い違ったときは**実装を正とし、この表を直す**（実装を表記に合わせない）。

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
  /** 申込期限・追加受付など、申し込みにかかる特別な条件 */
  salesConditions: Bilingual | null;
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
  // （src/lib/aiLesson/course/legal/legalFacts.ts と1文字も変えない。片方だけ直すと事実が2つになる）
  operatorName: 'kawabado 安田翔',
  // 特商法ページ以外は屋号のみ（CEO指示 2026-08-02。氏名の表示義務は特商法だけにかかる）
  displayName: 'kawabado',
  address: 'on_request',
  phone: 'on_request',
  contactEmail: 'info@kawabado.com',

  // 以下はいずれもコード・既存ページから確認できる事実
  priceDescription: {
    // 金額は tournamentTypes.ts の表示値。大会ごとの例外（超初級ダブルスは3,000円/ペア）が
    // あるので、金額を言い切らず「各大会ページの表示が優先」と逃げ道を残す
    ja: '参加費は各大会・各通常活動のページに表示しています。表示している金額が、当会にお支払いいただく総額です。通常活動は1回600円〜（シャトル代込み）、大会はシングルスが1名1,500円、ダブルス・ミックスダブルスが1ペア2,000円を基本としています。金額は大会ごとに異なることがあるため、各大会ページの表示が優先します。',
    zh: '参加费标示于各赛事・各常规活动页面。所标示的金额即为您需向本会支付的全部金额。常规活动每次600日元起（含羽毛球费用），赛事以单打每人1,500日元、双打・混合双打每组2,000日元为基准。金额可能因赛事而异，以各赛事页面的标示为准。',
  },
  additionalFees: {
    // payment.ts:「決済手数料の上乗せはしない（全支払い方法で参加費は同額）」
    // 銀行振込の振込手数料には触れない（2026-08-28に選択肢から外したので、これから申し込む人には起きない）
    ja: '決済手数料の上乗せはありません（表示している参加費と同額をお支払いいただきます）。超初級ダブルス以外の大会ではシャトルのご持参が必要です（お忘れの場合は会場で1球500円でご購入いただけます）。体育館用シューズなどの用具、会場までの交通費はお客様のご負担です。',
    zh: '不额外收取支付手续费（支付金额与所标示的参加费相同）。除超初级双打以外的赛事需自带羽毛球（如忘记携带，可在会场以每颗500日元购买）。室内运动鞋等用具，以及前往会场的交通费由客户承担。',
  },
  // SELECTABLE_PAYMENT_METHODS と同じ3種を同じ順で並べる。
  // 銀行振込は2026-08-28に申込画面から外したのでここにも載せない（載せると実装より広い約束になる）
  paymentMethods: [
    { ja: 'クレジットカード（Stripe）', zh: '信用卡（Stripe）' },
    { ja: 'PayPay', zh: 'PayPay' },
    { ja: 'WeChat Pay / Alipay（Stripe）', zh: '微信支付 / 支付宝（Stripe）' },
  ],
  paymentTiming: {
    // 追加受付中に落ちるのは PayPay だけ（PaymentMethodSelector: paypay は !creditOnly、
    // wechat_alipay は redirectAvailable）。「カードのみ」と書くと実装より狭い案内になるため
    // 「オンライン決済のみ」と書き、使える手段を並べる
    ja: 'クレジットカード・WeChat Pay・Alipay は申込時にお支払いいただきます。PayPayは、申込後にお送りするご案内メールに記載の期限までにお支払いください。追加受付を実施している大会では、オンライン決済（クレジットカード・WeChat Pay・Alipay）のみとなり、お申し込みと同時に決済が完了します。通常活動のお支払い方法は各活動ページに記載しています（通常活動にオンライン決済はありません）。',
    zh: '信用卡・微信支付・支付宝在报名时支付。PayPay请在报名后发送的指引邮件所载期限前完成支付。设有追加报名的赛事仅限使用在线支付（信用卡・微信支付・支付宝），报名的同时完成付款。常规活动的支付方式记载于各活动页面（常规活动不提供在线支付）。',
  },
  serviceTiming: {
    ja: '各大会・各通常活動のページに記載した開催日時に、記載の会場で提供します。',
    zh: '在各赛事・各常规活动页面所载的日期时间，于所载会场提供。',
  },
  salesConditions: {
    // src/lib/entryDeadline.ts の共通ルール（14日前 23:59 JST）と追加受付（late_entry_until）
    ja: '大会のお申し込みは、原則として開催日の14日前 23:59（日本時間）で締め切ります。定員に達している場合はキャンセル待ちとしてお受けします。追加受付を実施する大会に限り、締切後もオンライン決済（クレジットカード・WeChat Pay・Alipay）でお申し込みいただけます。',
    zh: '赛事报名原则上于举办日的14天前23:59（日本时间）截止。名额已满时将作为候补受理。仅设有追加报名的赛事，在截止后仍可通过在线支付（信用卡・微信支付・支付宝）报名。',
  },
  refundPolicy: {
    // process-cancel/index.ts: 自動返金は payment_method === 'credit' のときだけ。
    //   refundAmount = entryFee - round(entryFee * 0.1)
    // CancelEntryPage.tsx: クレカ以外は「主催者より銀行振込またはPayPayにて返金」
    //   → WeChat Pay / Alipay もこの「クレカ以外」の経路に入る（自動返金の対象外）
    // CancelPolicyPage.tsx: 「返金は確認後、3〜5営業日以内に対応します」
    ja: 'キャンセル期限は原則として開催日の14日前で、各大会ページに表示しています。期限内にキャンセルされた場合、クレジットカードでお支払い済みのときはキャンセル手数料として10%を差し引いた額を同じカードへ返金します。クレジットカード以外（PayPay・WeChat Pay・Alipay）でお支払い済みのときは、主催者から銀行振込またはPayPayでお支払いいただいた参加費を返金します（ご連絡の確認後3〜5営業日以内）。キャンセル期限を過ぎたキャンセル、当日キャンセル、無断欠席は返金できません。キャンセル期限後の追加受付でお申し込みいただいた分も返金できません。当会の都合で中止した場合は参加費を全額返金します。',
    zh: '取消期限原则上为举办日的14天前，并标示于各赛事页面。在期限内取消的，若已用信用卡支付，将扣除10%的取消手续费后退回原卡。若通过信用卡以外的方式（PayPay・微信支付・支付宝）支付，主办方将通过银行转账或PayPay退还您已支付的参加费（确认联络后3〜5个工作日内）。超过取消期限的取消、当日取消及无故缺席，恕不退款。在取消期限之后通过追加报名申请的，同样不予退款。若因本会原因取消举办，将全额退还参加费。',
  },
  personalDataItems: {
    // 通常活動の email（任意）・user_id は 20260824110000_activity_entries_contact.sql で追加
    ja: '大会のお申し込みでは、お名前、メールアドレス、電話番号、ペアの方のお名前（ダブルスの場合）、備考欄にご記入いただいた内容、および申込・キャンセルの履歴を取得します。通常活動のお申し込みでは、お名前と、任意でご入力いただいたメールアドレスを取得します（メールアドレスは空欄のままでもお申し込みいただけます）。ログインしてお申し込みいただいた場合は、アカウントの識別子をあわせて保存します。クレジットカード番号は当会では取得・保存せず、決済代行会社（Stripe）が直接取り扱います。',
    zh: '赛事报名时，我们收集姓名、电子邮箱、电话号码、搭档姓名（双打时）、备注栏填写的内容，以及报名与取消的记录。常规活动报名时，我们收集姓名，以及您选填的电子邮箱（邮箱留空也可以完成报名）。若您登录后报名，我们会一并保存账号标识。本会不收集或保存信用卡号，该信息由支付服务商（Stripe）直接处理。',
  },
  personalDataPurpose: {
    // 個人情報保護法は利用目的を「できる限り特定」するよう求めているため、
    // 「事業活動全般」のような包括表現は避け、実際に行う範囲を列挙している。
    // 通常活動のメールアドレス（任意）は「次回の活動案内・開催前のお知らせ」のために取得しており、
    // 画面（ActivityPage の emailHint）で伝えている内容とここを一致させる。
    ja: '申込内容の確認、参加者名簿の作成、当日の受付、開催前のお知らせ（リマインドを含む）、開催内容の変更や中止のご連絡、お支払いおよび返金の手続き、お問い合わせへの回答に利用します。あわせて、今後の大会・通常活動のご案内、当会からのお知らせやアンケートの送付、および活動内容の改善と運営のために利用します。上記と関連性を有すると合理的に認められる範囲を超えて利用する場合は、あらためてご本人の同意をいただきます。',
    zh: '用于确认报名内容、编制参加者名单、当日接待、发送举办前的提醒、告知活动内容的变更或取消、办理支付与退款手续，以及回复咨询。此外，还用于发送今后赛事・常规活动的通知、本会的公告与问卷，以及改进活动内容与运营。若需超出与上述目的具有合理关联性的范围使用，将另行取得本人同意。',
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
    ja: '法令に基づく場合を除き、ご本人の同意なく第三者へ提供することはありません。ただし、決済処理のためStripe、データの保管のためSupabase、メール送信のためResendに、業務上必要な範囲で取り扱いを委託しています。なお、通常活動の申込では、参加状況を共有するためお名前を各活動ページの参加者一覧に表示します（メールアドレスは表示しません）。',
    zh: '除法律规定的情形外，未经本人同意不会向第三方提供。但为处理支付委托Stripe、为保存数据委托Supabase、为发送邮件委托Resend，在业务必要范围内处理相关信息。此外，常规活动的报名中，为共享参加情况，会在各活动页面的参加者名单中显示姓名（不显示电子邮箱）。',
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
    'paymentMethods', 'paymentTiming', 'serviceTiming', 'salesConditions', 'refundPolicy',
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
