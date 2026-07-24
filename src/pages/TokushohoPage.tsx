import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';

// 特定商取引法に基づく表記。
// 個人事業者のため、氏名・住所・電話番号は「請求があった場合に遅滞なく開示する」
// 省略方式（消費者庁ガイドライン準拠）を採用。キャンセル・返金条件は
// CancelPolicyPage / locales/entry.ts の現行規定と一致させること。
type Row = { label: string; body: string[] };

const JA: Row[] = [
  { label: '事業者名称', body: ['川口・蕨バドミントン交流会（kawabado）'] },
  {
    label: '運営責任者・所在地・電話番号',
    body: ['請求があった場合には、遅滞なく開示いたします。お問い合わせフォームよりご請求ください。'],
  },
  { label: 'お問い合わせ', body: ['当サイトのお問い合わせフォームよりご連絡ください。メールにて遅滞なく回答いたします。'] },
  { label: '販売価格', body: ['各大会・活動ページに表示する参加費（消費税込）。', '別途、シャトル持参制の大会ではシャトルのご用意が必要です（会場での購入は1球500円）。'] },
  { label: '販売価格以外の必要料金', body: ['インターネット接続にかかる通信費はお客様のご負担となります。', '銀行振込の場合の振込手数料はお客様のご負担となります。'] },
  {
    label: 'お支払い方法・時期',
    body: [
      'クレジットカード（Stripe）：申し込み時にお支払いが確定します。',
      'PayPay・銀行振込：申し込み後、各大会ページおよび確認メールに記載の支払い期限までにお支払いください。',
    ],
  },
  { label: '役務の提供時期', body: ['各大会・活動の開催日時に提供します（日時は各ページに記載）。'] },
  { label: '申し込みの締め切り', body: ['各大会の開催14日前を申し込み締め切りとします。'] },
  {
    label: 'キャンセル・返金',
    body: [
      'キャンセル期限（大会開催14日前）までのお申し出：返金いたします。ただしクレジットカード決済の場合は、キャンセル手数料として参加費の10%を差し引いて返金します。',
      'キャンセル期限を過ぎたお申し出：理由のいかんにかかわらず返金できません。',
      '返金は確認後、3〜5営業日以内に対応します。',
      '主催者都合で中止となった場合は、全額返金いたします。',
      '詳細はキャンセルポリシーをご確認ください。',
    ],
  },
];

const ZH: Row[] = [
  { label: '经营者名称', body: ['川口・蕨羽毛球交流会（kawabado）'] },
  { label: '运营负责人・所在地・电话号码', body: ['如有请求，将及时予以公开。请通过咨询表单提出请求。'] },
  { label: '联系方式', body: ['请通过本网站的咨询表单联系我们。我们将通过邮件及时回复。'] },
  { label: '销售价格', body: ['各大会・活动页面显示的参加费（含消费税）。', '需自带羽毛球的大会，请自行准备羽毛球（会场购买为每球500日元）。'] },
  { label: '销售价格以外的必要费用', body: ['互联网通信费由客户承担。', '银行转账的手续费由客户承担。'] },
  {
    label: '支付方式・支付时间',
    body: ['信用卡（Stripe）：报名时即完成支付。', 'PayPay・银行转账：报名后，请在各大会页面及确认邮件中记载的支付期限前完成支付。'],
  },
  { label: '服务提供时间', body: ['在各大会・活动的举办日期提供（日期见各页面）。'] },
  { label: '报名截止', body: ['各大会举办日的14天前为报名截止日。'] },
  {
    label: '取消・退款',
    body: [
      '在取消期限（大会举办14天前）之前提出：予以退款。但信用卡支付的情况下，将扣除参加费的10%作为取消手续费后退款。',
      '超过取消期限提出：无论理由如何，均无法退款。',
      '退款将在确认后3〜5个工作日内处理。',
      '因主办方原因中止时，将全额退款。',
      '详情请参阅取消政策。',
    ],
  },
];

export const TokushohoPage = () => {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const rows = zh ? ZH : JA;
  const title = zh ? '特定商业交易法标示' : '特定商取引法に基づく表記';

  // ページ meta は Worker + useStaticPageMeta で管理。
  useStaticPageMeta();

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Breadcrumbs items={[{ label: zh ? '首页' : 'ホーム', path: `/${lang}/` }, { label: title }]} />
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
          {rows.map(r => (
            <div key={r.label} className="px-5 py-4 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
              <div className="text-sm font-bold text-gray-900 mb-1.5 sm:mb-0">{r.label}</div>
              <ul className="space-y-1">
                {r.body.map(line => (
                  <li key={line} className="text-sm text-gray-600 leading-relaxed">{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-4 justify-center text-sm">
          <Link to={`/${lang}/cancel-policy`} className="text-blue-600 hover:underline">
            {zh ? '取消政策 →' : 'キャンセルポリシー →'}
          </Link>
          <Link to={`/${lang}/privacy-policy`} className="text-blue-600 hover:underline">
            {zh ? '隐私政策 →' : 'プライバシーポリシー →'}
          </Link>
          <Link to={`/${lang}/contact`} className="text-blue-600 hover:underline">
            {zh ? '咨询表单 →' : 'お問い合わせ →'}
          </Link>
        </div>
      </main>
    </>
  );
};

export default TokushohoPage;
