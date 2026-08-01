// バド本体の法務3ページの本文。事実は kawabadoLegalFacts.ts だけを参照し、
// ここには「文書の構造」しか書かない（事実の二重管理を作らない）。
import {
  KAWABADO_LEGAL_FACTS,
  type KawabadoLegalFacts,
  type Bilingual,
} from './kawabadoLegalFacts';

export type KawabadoLegalPageId = 'tokushoho' | 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface KawabadoLegalPage {
  id: KawabadoLegalPageId;
  title: string;
  intro: string;
  sections: LegalSection[];
}

type Lang = 'ja' | 'zh';

const pick = (v: Bilingual | null, lang: Lang): string => (v ? v[lang] : '');

const ON_REQUEST: Record<Lang, string> = {
  ja: '請求があった場合、遅滞なく開示します（下記のメールアドレスまでご連絡ください）。',
  zh: '如有请求，将无迟延地予以披露（请通过下述电子邮箱联系）。',
};

const disclosable = (v: string | 'on_request' | null, lang: Lang): string =>
  v === 'on_request' ? ON_REQUEST[lang] : (v ?? '');

export const kawabadoLegalPath = (lang: Lang, id: KawabadoLegalPageId): string =>
  `/${lang}/${id}`;

export const buildKawabadoLegalPages = (
  lang: Lang,
  f: KawabadoLegalFacts = KAWABADO_LEGAL_FACTS
): KawabadoLegalPage[] => {
  const ja = lang === 'ja';
  const methods = (f.paymentMethods ?? []).map((m) => m[lang]).join(ja ? '／' : '／');

  return [
    {
      id: 'tokushoho',
      title: ja ? '特定商取引法に基づく表記' : '基于特定商业交易法的标示',
      intro: ja
        ? '特定商取引法に基づき、以下のとおり表示します。'
        : '根据日本《特定商业交易法》，标示如下。',
      sections: [
        { heading: ja ? '販売事業者' : '销售事业者', body: [f.operatorName ?? ''] },
        { heading: ja ? '運営統括責任者' : '运营负责人', body: [f.operatorName ?? ''] },
        { heading: ja ? '所在地' : '所在地', body: [disclosable(f.address, lang)] },
        { heading: ja ? '電話番号' : '电话号码', body: [disclosable(f.phone, lang)] },
        { heading: ja ? 'メールアドレス' : '电子邮箱', body: [f.contactEmail] },
        { heading: ja ? '販売価格' : '销售价格', body: [pick(f.priceDescription, lang)] },
        {
          heading: ja ? '商品代金以外の必要料金' : '商品价款以外的必要费用',
          body: [pick(f.additionalFees, lang)],
        },
        { heading: ja ? 'お支払い方法' : '支付方式', body: [methods] },
        { heading: ja ? 'お支払い時期' : '支付时间', body: [pick(f.paymentTiming, lang)] },
        {
          heading: ja ? 'サービスの提供時期' : '服务提供时间',
          body: [pick(f.serviceTiming, lang)],
        },
        {
          heading: ja ? 'キャンセル・返金について' : '关于取消与退款',
          body: [pick(f.refundPolicy, lang)],
        },
      ],
    },
    {
      id: 'privacy',
      title: ja ? 'プライバシーポリシー' : '隐私政策',
      intro: ja
        ? `${f.operatorName}（以下「当会」）は、お申し込みいただいた方の個人情報を以下のとおり取り扱います。`
        : `${f.operatorName}（以下称"本会"）按以下方式处理报名者的个人信息。`,
      sections: [
        {
          heading: ja ? '取得する情報' : '收集的信息',
          body: [pick(f.personalDataItems, lang)],
        },
        {
          heading: ja ? '利用目的' : '使用目的',
          body: [pick(f.personalDataPurpose, lang)],
        },
        {
          heading: ja ? '第三者への提供・委託' : '向第三方提供与委托',
          body: [pick(f.thirdParties, lang)],
        },
        {
          heading: ja ? '保管方法と保存期間' : '保管方式与保存期限',
          body: [
            ja
              ? `お預かりした情報は ${f.dataHosting} に保管し、アクセスできる者を運営者に限定しています。`
              : `所收集的信息保存于 ${f.dataHosting}，并将可访问者限定为运营者。`,
            pick(f.retentionPeriod, lang),
          ],
        },
        {
          heading: ja ? '開示・訂正・削除のご請求' : '披露・更正・删除的请求',
          body: [
            ja
              ? `ご本人からのご請求により、保有する個人情報の開示・訂正・利用停止・削除に応じます。${f.contactEmail} までご連絡ください。`
              : `根据本人的请求，我们将对所持有的个人信息进行披露、更正、停止使用或删除。请联系 ${f.contactEmail}。`,
          ],
        },
        {
          heading: ja ? 'アクセス解析' : '访问分析',
          body: [
            ja
              ? '当サイトでは、利用状況の把握のためアクセス解析ツールを使用することがあります。これらは個人を特定する情報を含みません。ブラウザの設定により無効にすることができます。'
              : '本网站可能使用访问分析工具以掌握使用情况。这些工具不包含可识别个人的信息。可通过浏览器设置将其停用。',
          ],
        },
        {
          heading: ja ? 'お問い合わせ窓口' : '咨询窗口',
          body: [f.contactEmail],
        },
      ],
    },
    {
      id: 'terms',
      title: ja ? '利用規約' : '使用条款',
      intro: ja
        ? `この規約は、${f.operatorName}（以下「当会」）が主催する大会・通常活動へのお申し込みおよびご参加の条件を定めるものです。お申し込みをもって、この規約に同意いただいたものとします。`
        : `本条款规定了参加 ${f.operatorName}（以下称"本会"）主办的赛事及常规活动的报名与参加条件。报名即视为同意本条款。`,
      sections: [
        {
          heading: ja ? '第1条（申し込み）' : '第1条（报名）',
          body: [
            ja
              ? '各イベントのページからお申し込みください。定員に達している場合はキャンセル待ちとしてお受けします。空きが出た場合はメールでご連絡します。'
              : '请从各活动页面报名。名额已满时将作为候补受理。有空位时将通过邮件联系。',
          ],
        },
        {
          heading: ja ? '第2条（参加費）' : '第2条（参加费）',
          body: [pick(f.priceDescription, lang), pick(f.paymentTiming, lang)],
        },
        {
          heading: ja ? '第3条（キャンセル）' : '第3条（取消）',
          body: [
            pick(f.refundPolicy, lang),
            ja
              ? '当日のキャンセルや無断欠席は、他の参加者および運営に影響します。繰り返し違反された場合、以後のお申し込みをお断りすることがあります。'
              : '当日取消或无故缺席会影响其他参加者及运营。屡次违反者，本会可能谢绝其今后的报名。',
          ],
        },
        {
          heading: ja ? '第4条（開催の変更・中止）' : '第4条（活动的变更与取消）',
          body: [
            ja
              ? '会場の都合、天災、感染症の流行その他やむを得ない事由により、開催内容の変更または中止を行う場合があります。この場合はご登録のメールアドレスへご連絡し、当会の都合による中止のときは参加費を全額返金します。'
              : '因场馆情况、天灾、传染病流行或其他不可避免的事由，本会可能变更或取消活动内容。届时将通过您登记的邮箱联系，若因本会原因取消，将全额退还参加费。',
          ],
        },
        {
          heading: ja ? '第5条（参加者の責任・免責）' : '第5条（参加者的责任与免责）',
          body: [
            ja
              ? 'バドミントンは身体を動かす競技です。ご自身の体調を確認のうえご参加ください。活動中に生じた負傷・疾病・事故、および所持品の紛失・盗難・破損について、当会に故意または重大な過失がある場合を除き、当会は責任を負いません。傷害保険への加入は各自でご検討ください。'
              : '羽毛球是需要身体活动的运动。请在确认自身身体状况后参加。对于活动期间发生的受伤、疾病、事故，以及随身物品的遗失、被盗、损坏，除本会存在故意或重大过失外，本会不承担责任。是否投保意外伤害保险请各自判断。',
          ],
        },
        {
          heading: ja ? '第6条（禁止事項）' : '第6条（禁止事项）',
          body: [
            ja
              ? '他の参加者への迷惑行為、会場の規則に反する行為、営業・勧誘・宗教活動、無断での撮影および撮影物の公開、その他当会が不適切と判断する行為を禁止します。違反された場合、ご退場いただくことがあります。この場合の参加費は返金しません。'
              : '禁止对其他参加者的骚扰行为、违反场馆规定的行为、商业推销・劝诱・宗教活动、未经许可的拍摄及公开所拍摄内容，以及本会认为不适当的其他行为。若有违反，本会可能请其离场。此情形下的参加费不予退还。',
          ],
        },
        {
          heading: ja ? '第7条（個人情報の取り扱い）' : '第7条（个人信息的处理）',
          body: [
            ja
              ? '個人情報の取り扱いについては、別途定めるプライバシーポリシーによります。なお、通常活動では参加状況を共有するため、お名前を各活動ページの参加者一覧に表示します。'
              : '个人信息的处理依据另行制定的隐私政策。此外，常规活动中为共享参加情况，会在各活动页面的参加者名单中显示姓名。',
          ],
        },
        {
          heading: ja ? '第8条（規約の変更）' : '第8条（条款的变更）',
          body: [
            ja
              ? 'この規約は必要に応じて変更することがあります。変更後の規約は当ページに掲載した時点から適用します。'
              : '本条款可能根据需要进行变更。变更后的条款自登载于本页面时起适用。',
          ],
        },
        {
          heading: ja ? '第9条（準拠法・管轄）' : '第9条（准据法与管辖）',
          body: [pick(f.governingLaw, lang)],
        },
      ],
    },
  ];
};

/** 本文が空のセクションを落とす（事実がnullのまま表示されるのを防ぐ） */
export const renderableKawabadoLegalPage = (p: KawabadoLegalPage): KawabadoLegalPage => ({
  ...p,
  sections: p.sections
    .map((s) => ({ ...s, body: s.body.filter((b) => b.trim() !== '') }))
    .filter((s) => s.body.length > 0),
});
