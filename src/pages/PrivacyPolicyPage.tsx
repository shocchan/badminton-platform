import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';

// プライバシーポリシー。実際のデータフロー（Supabase / Stripe / Resend / 計測タグ）に
// 即した内容のみ記載する。運営者の正式表記を変更する場合はここを更新。
type Section = { title: string; body: string[] };

const JA: { intro: string; sections: Section[]; established: string } = {
  intro:
    '川口・蕨バドミントン交流会（kawabado、以下「当会」）は、大会・活動の運営にあたり取得する個人情報を、以下の方針に基づき取り扱います。',
  established: '制定日：2026年7月22日',
  sections: [
    {
      title: '1. 取得する情報',
      body: [
        '大会・活動への申し込み時：お名前、メールアドレス、（ダブルスの場合）ペアのお相手のお名前',
        'お問い合わせ時：お名前、メールアドレス、お問い合わせ内容',
        '会員登録時：メールアドレス等のアカウント情報',
        'クレジットカード決済をご利用の場合、カード情報は決済代行会社（Stripe, Inc.）が直接取り扱い、当会のサーバーには保存されません。',
      ],
    },
    {
      title: '2. 利用目的',
      body: [
        '大会・活動の運営（申し込み受付、参加確認、組み合わせ作成、キャンセル対応）',
        '確認メール・重要なお知らせの送信',
        '参加費の決済および返金対応',
        'お問い合わせへの回答',
        'サービス改善のためのアクセス解析',
      ],
    },
    {
      title: '3. 第三者提供',
      body: [
        '法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供することはありません。',
        '大会の組み合わせ表・結果に表示されるお名前（ニックネーム可）については、申し込み時にご確認のうえご記入ください。',
      ],
    },
    {
      title: '4. 業務委託先（外部サービス）',
      body: [
        '当会は運営にあたり以下の外部サービスを利用しており、必要な範囲で情報が各サービスに送信・保管されます。',
        'データベース・認証：Supabase（申し込み情報・会員情報の保管）',
        '決済処理：Stripe（クレジットカード決済）',
        'メール配信：Resend（確認メール等の送信）',
        'ホスティング：Cloudflare Pages',
      ],
    },
    {
      title: '5. Cookie・外部送信（アクセス解析・広告）',
      body: [
        '当サイトでは、利用状況の把握や広告効果測定のため、Google アナリティクス（Google LLC）および Meta ピクセル（Meta Platforms, Inc.）を利用する場合があります。',
        'これらのツールは Cookie 等を通じて閲覧情報を各社に送信します。送信される情報に氏名・メールアドレスは含まれません。',
        'Cookie はブラウザ設定で無効化できます。各ツールのオプトアウト方法は各社のページをご確認ください。',
      ],
    },
    {
      title: '6. 開示・訂正・削除のご請求',
      body: [
        'ご自身の個人情報の開示・訂正・削除をご希望の場合は、お問い合わせフォームよりご連絡ください。ご本人確認のうえ、速やかに対応します。',
      ],
    },
    {
      title: '7. 改定',
      body: [
        '本ポリシーの内容は、法令の変更やサービス内容の変更に応じて改定することがあります。重要な変更は当サイト上でお知らせします。',
      ],
    },
    {
      title: '8. お問い合わせ窓口',
      body: ['川口・蕨バドミントン交流会（kawabado）運営事務局', '当サイトのお問い合わせフォームよりご連絡ください。'],
    },
  ],
};

const ZH: typeof JA = {
  intro:
    '川口・蕨羽毛球交流会（kawabado，以下称"本会"）就运营大会及活动所取得的个人信息，依照以下方针进行处理。',
  established: '制定日期：2026年7月22日',
  sections: [
    {
      title: '1. 收集的信息',
      body: [
        '报名大会・活动时：姓名、邮箱地址、（双打时）搭档姓名',
        '咨询时：姓名、邮箱地址、咨询内容',
        '注册会员时：邮箱地址等账户信息',
        '使用信用卡支付时，卡片信息由支付服务商（Stripe, Inc.）直接处理，不会保存在本会服务器上。',
      ],
    },
    {
      title: '2. 使用目的',
      body: [
        '大会・活动的运营（受理报名、确认参加、编排对阵、处理取消）',
        '发送确认邮件及重要通知',
        '参加费的支付及退款处理',
        '回复咨询',
        '用于改善服务的访问分析',
      ],
    },
    {
      title: '3. 向第三方提供',
      body: [
        '除法律规定的情形外，未经本人同意不会向第三方提供个人信息。',
        '大会对阵表・结果中显示的姓名（可使用昵称），请在报名时确认后填写。',
      ],
    },
    {
      title: '4. 委托的外部服务',
      body: [
        '本会在运营中使用以下外部服务，信息将在必要范围内发送并保管于各服务。',
        '数据库・认证：Supabase（保管报名信息・会员信息）',
        '支付处理：Stripe（信用卡支付）',
        '邮件发送：Resend（确认邮件等）',
        '网站托管：Cloudflare Pages',
      ],
    },
    {
      title: '5. Cookie・外部发送（访问分析・广告）',
      body: [
        '本网站为了解使用状况及测量广告效果，可能使用 Google Analytics（Google LLC）及 Meta Pixel（Meta Platforms, Inc.）。',
        '这些工具通过 Cookie 等向各公司发送浏览信息。所发送的信息不包含姓名・邮箱地址。',
        '您可以通过浏览器设置禁用 Cookie。各工具的退出方法请参阅各公司页面。',
      ],
    },
    {
      title: '6. 信息的公开・更正・删除',
      body: ['如需公开・更正・删除您本人的个人信息，请通过咨询表单联系我们。确认本人身份后将尽快处理。'],
    },
    {
      title: '7. 修订',
      body: ['本方针可能根据法律变更或服务内容变更进行修订。重要变更将在本网站上通知。'],
    },
    {
      title: '8. 咨询窗口',
      body: ['川口・蕨羽毛球交流会（kawabado）运营事务局', '请通过本网站的咨询表单联系我们。'],
    },
  ],
};

export const PrivacyPolicyPage = () => {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const t = zh ? ZH : JA;
  const title = zh ? '隐私政策' : 'プライバシーポリシー';
  const canonical = `https://kawabado.com/${zh ? 'zh' : 'ja'}/privacy-policy`;

  return (
    <>
      <Helmet>
        <title>{`${title} | 川口・蕨バドミントン交流会`}</title>
        <meta name="description" content={zh ? '川口・蕨羽毛球交流会的个人信息处理方针。' : '川口・蕨バドミントン交流会の個人情報の取り扱い方針です。'} />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Breadcrumbs items={[{ label: zh ? '首页' : 'ホーム', path: `/${lang}/` }, { label: title }]} />
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        <p className="text-xs text-gray-400 mb-6">{t.established}</p>
        <p className="text-sm text-gray-600 leading-relaxed mb-8">{t.intro}</p>

        <div className="space-y-6">
          {t.sections.map(s => (
            <section key={s.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <h2 className="text-sm font-bold text-gray-900 mb-2">{s.title}</h2>
              <ul className="space-y-1.5">
                {s.body.map(line => (
                  <li key={line} className="text-sm text-gray-600 leading-relaxed">{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link to={`/${lang}/contact`} className="text-sm text-blue-600 hover:underline">
            {zh ? '前往咨询表单 →' : 'お問い合わせフォームへ →'}
          </Link>
        </div>
      </main>
    </>
  );
};

export default PrivacyPolicyPage;
