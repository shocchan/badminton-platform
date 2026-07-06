import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';

type Category = 'activity' | 'tournament' | 'sponsor' | 'other';

const I18N = {
  ja: {
    metaTitle: 'お問い合わせ・スポンサー窓口 | 川口・蕨バドミントン交流会',
    metaDescription:
      '川口・蕨バドミントン交流会へのお問い合わせフォーム。通常活動・大会について、協賛・スポンサーのご相談もこちらから。',
    breadcrumbHome: 'ホーム',
    breadcrumbSelf: 'お問い合わせ',
    title: '📮 お問い合わせ',
    lead: '通常活動・大会についてのご質問、協賛のご相談など、お気軽にどうぞ。通常2〜3日以内にメールで返信します。',
    name: 'お名前',
    namePlaceholder: '山田 太郎',
    email: 'メールアドレス',
    emailPlaceholder: 'example@email.com',
    category: 'お問い合わせの種類',
    categories: {
      activity: '通常活動について',
      tournament: '大会について',
      sponsor: 'スポンサー・協賛について',
      other: 'その他',
    },
    message: 'お問い合わせ内容',
    messagePlaceholder: 'ご質問・ご相談内容をご記入ください',
    submit: '送信する →',
    submitting: '送信中...',
    successTitle: '送信しました！',
    successBody: 'お問い合わせありがとうございます。通常2〜3日以内にメールで返信いたします。',
    backHome: 'ホームに戻る',
    errorRequired: 'すべての項目を入力してください。',
    errorEmail: '有効なメールアドレスを入力してください。',
    errorSubmit: '送信に失敗しました。時間をおいてもう一度お試しください。',
    sponsorTitle: '🤝 スポンサー・協賛のご案内',
    sponsorBody:
      '川口・蕨バドミントン交流会では、大会・通常活動を応援してくださるスポンサー・協賛企業を募集しています。中国・ベトナム・インドネシア・フィリピンなど多国籍なメンバーが集まるコミュニティです。',
    sponsorItems: [
      '🏆 大会での賞品・景品のご提供',
      '📣 公式サイト・大会ページでのご紹介',
      '🏸 会場でのチラシ設置・バナー掲示',
    ],
    sponsorCta: '上のフォームで「スポンサー・協賛について」を選択してご連絡ください。',
  },
  zh: {
    metaTitle: '联系我们・赞助合作 | 川口・蕨羽毛球交流会',
    metaDescription:
      '川口・蕨羽毛球交流会的联系表单。关于日常活动、赛事的咨询，以及赞助合作洽谈都可以从这里联系。',
    breadcrumbHome: '首页',
    breadcrumbSelf: '联系我们',
    title: '📮 联系我们',
    lead: '关于日常活动、赛事的问题，或赞助合作洽谈，欢迎随时联系。我们通常会在2〜3天内通过邮件回复。',
    name: '姓名',
    namePlaceholder: '王小明',
    email: '邮箱地址',
    emailPlaceholder: 'example@email.com',
    category: '咨询类型',
    categories: {
      activity: '关于日常活动',
      tournament: '关于赛事',
      sponsor: '关于赞助合作',
      other: '其他',
    },
    message: '咨询内容',
    messagePlaceholder: '请填写您的问题或咨询内容',
    submit: '发送 →',
    submitting: '发送中...',
    successTitle: '发送成功！',
    successBody: '感谢您的咨询。我们通常会在2〜3天内通过邮件回复。',
    backHome: '返回首页',
    errorRequired: '请填写所有项目。',
    errorEmail: '请输入有效的邮箱地址。',
    errorSubmit: '发送失败。请稍后再试。',
    sponsorTitle: '🤝 赞助合作',
    sponsorBody:
      '川口・蕨羽毛球交流会正在招募支持赛事和日常活动的赞助商。我们是一个汇集了中国、越南、印度尼西亚、菲律宾等多国成员的国际化社区。',
    sponsorItems: [
      '🏆 提供赛事奖品',
      '📣 在官网・赛事页面进行介绍',
      '🏸 在会场放置传单・悬挂横幅',
    ],
    sponsorCta: '请在上方表单中选择「关于赞助合作」与我们联系。',
  },
};

export const ContactPage = () => {
  const { lang } = useLanguage();
  const l = lang === 'zh' ? 'zh' : 'ja';
  const t = I18N[l];

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: 'activity' as Category,
    message: '',
    website: '', // ハニーポット（人間には見えない。botが埋めたら弾く）
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.website) return; // ハニーポット
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setError(t.errorRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t.errorEmail);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: insertError } = await supabase.from('contacts').insert([{
        name: formData.name.trim(),
        email: formData.email.trim(),
        category: formData.category,
        message: formData.message.trim(),
        lang: l,
      }]);
      if (insertError) throw insertError;
      setDone(true);
    } catch (err) {
      console.error(err);
      setError(t.errorSubmit);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white';

  return (
    <>
      <Helmet>
        <title>{t.metaTitle}</title>
        <meta name="description" content={t.metaDescription} />
        <meta property="og:title" content={t.metaTitle} />
        <meta property="og:description" content={t.metaDescription} />
        <meta property="og:url" content={`https://kawabado.com/${l}/contact`} />
        <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
        <link rel="canonical" href={`https://kawabado.com/${l}/contact`} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/contact" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/contact" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/contact" />
      </Helmet>
      <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: t.breadcrumbHome, path: `/${l}/` },
          { label: t.breadcrumbSelf },
        ]} />

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">{t.title}</h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">{t.lead}</p>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">{t.successTitle}</h2>
            <p className="text-gray-600 text-sm mb-6">{t.successBody}</p>
            <a
              href={`/${l}/`}
              className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              {t.backHome}
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-bold text-gray-700 mb-1.5">
                {t.name} <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-name"
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={t.namePlaceholder}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="block text-sm font-bold text-gray-700 mb-1.5">
                {t.email} <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-email"
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder={t.emailPlaceholder}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="contact-category" className="block text-sm font-bold text-gray-700 mb-1.5">
                {t.category} <span className="text-red-500">*</span>
              </label>
              <select
                id="contact-category"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value as Category })}
                className={inputClass}
              >
                {(Object.keys(t.categories) as Category[]).map(key => (
                  <option key={key} value={key}>{t.categories[key]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-sm font-bold text-gray-700 mb-1.5">
                {t.message} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="contact-message"
                value={formData.message}
                onChange={e => setFormData({ ...formData, message: e.target.value })}
                placeholder={t.messagePlaceholder}
                rows={6}
                className={inputClass}
                required
              />
            </div>

            {/* ハニーポット：botだけが埋めるダミー項目 */}
            <input
              type="text"
              value={formData.website}
              onChange={e => setFormData({ ...formData, website: e.target.value })}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-gray-300 text-white font-bold py-3.5 rounded-xl transition-colors text-sm sm:text-base"
            >
              {loading ? t.submitting : t.submit}
            </button>
          </form>
        )}

        {/* スポンサー・協賛セクション */}
        <section className="mt-10 bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-3">{t.sponsorTitle}</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{t.sponsorBody}</p>
          <ul className="space-y-2 mb-4">
            {t.sponsorItems.map(item => (
              <li key={item} className="text-sm text-gray-800 font-medium">{item}</li>
            ))}
          </ul>
          <p className="text-sm text-amber-800 font-semibold">{t.sponsorCta}</p>
        </section>
      </main>
    </>
  );
};
