import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';

type Category = 'activity' | 'tournament' | 'sponsor' | 'other';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

const I18N = {
  ja: {
    metaTitle: 'お問い合わせ・スポンサー窓口 | 川口・蕨バドミントン交流会',
    metaDescription:
      '川口・蕨バドミントン交流会へのお問い合わせフォーム。通常活動・大会について、協賛・スポンサーのご相談もこちらから。',
    breadcrumbHome: 'ホーム',
    breadcrumbSelf: 'お問い合わせ',
    title: 'お問い合わせ',
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
    successTitle: '送信しました',
    successBody: 'お問い合わせありがとうございます。通常2〜3日以内にメールで返信いたします。',
    backHome: 'ホームに戻る',
    errorRequired: 'すべての項目を入力してください。',
    errorEmail: '有効なメールアドレスを入力してください。',
    errorSubmit: '送信に失敗しました。時間をおいてもう一度お試しください。',
    sponsorLabel: 'Official Sponsorship',
    sponsorTitle: 'スポンサー・協賛のご案内',
    sponsorLead:
      '川口・蕨バドミントン交流会は、中国・ベトナム・インドネシア・フィリピンなど多国籍なメンバーが集う国際コミュニティです。交流杯はこれまで3回開催、週1〜2回の通常活動を継続運営。地域とアジアをつなぐこの場を、貴社のブランド体験の舞台としてご活用ください。',
    sponsorItems: [
      {
        icon: '🏆',
        title: '冠スポンサー・賞品提供',
        body: '大会名への冠掲出や、表彰式での賞品授与。参加者の記憶に深く残るブランド体験をお届けします。',
      },
      {
        icon: '📣',
        title: '公式サイト・SNS掲載',
        body: '公式サイト・大会ページにロゴとリンクを掲載。多国籍コミュニティへダイレクトにリーチできます。',
      },
      {
        icon: '🏸',
        title: '会場プロモーション',
        body: '会場でのバナー掲示・チラシ設置・サンプリング。地域に根ざした確かな接点を築きます。',
      },
    ],
    sponsorCta: '協賛について相談する',
    sponsorNote: 'ご予算・目的に応じて柔軟にご提案いたします。まずはお気軽にご相談ください。',
  },
  zh: {
    metaTitle: '联系我们・赞助合作 | 川口・蕨羽毛球交流会',
    metaDescription:
      '川口・蕨羽毛球交流会的联系表单。关于日常活动、赛事的咨询，以及赞助合作洽谈都可以从这里联系。',
    breadcrumbHome: '首页',
    breadcrumbSelf: '联系我们',
    title: '联系我们',
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
    successTitle: '发送成功',
    successBody: '感谢您的咨询。我们通常会在2〜3天内通过邮件回复。',
    backHome: '返回首页',
    errorRequired: '请填写所有项目。',
    errorEmail: '请输入有效的邮箱地址。',
    errorSubmit: '发送失败。请稍后再试。',
    sponsorLabel: 'Official Sponsorship',
    sponsorTitle: '赞助合作方案',
    sponsorLead:
      '川口・蕨羽毛球交流会是汇集中国、越南、印度尼西亚、菲律宾等多国成员的国际社区。交流杯至今已举办3届，日常活动每周稳定开展1〜2次。诚邀贵司把这个连接本地与亚洲的舞台，作为品牌体验的绝佳场景。',
    sponsorItems: [
      {
        icon: '🏆',
        title: '冠名赞助・提供奖品',
        body: '赛事冠名或在颁奖仪式上提供奖品，为参加者打造难以忘怀的品牌体验。',
      },
      {
        icon: '📣',
        title: '官网・页面宣传展示',
        body: '在官网及赛事页面展示贵司标志与链接，直接触达多国籍社区。',
      },
      {
        icon: '🏸',
        title: '会场现场推广',
        body: '会场横幅、传单放置、产品体验活动，建立扎根本地的可靠接触点。',
      },
    ],
    sponsorCta: '洽谈赞助合作',
    sponsorNote: '我们将根据贵司的预算与目标灵活提案，欢迎随时咨询。',
  },
};

export const ContactPage = () => {
  const { lang } = useLanguage();
  const l = lang === 'zh' ? 'zh' : 'ja';
  const t = I18N[l];
  const formRef = useRef<HTMLFormElement>(null);

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

  const handleSponsorCta = () => {
    setFormData(f => ({ ...f, category: 'sponsor' }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

      // info@ への通知メール（失敗しても問い合わせ自体は保存済みなので送信成功扱い）
      fetch(`${EDGE_BASE}/notify-contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          category: formData.category,
          message: formData.message.trim(),
          lang: l,
        }),
      }).catch(() => { /* 通知失敗は無視 */ });

      setDone(true);
    } catch (err) {
      console.error(err);
      setError(t.errorSubmit);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors';

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

        <div className="text-center mb-10">
          <p className="text-xs font-bold tracking-[0.35em] uppercase text-gray-400 mb-3">Contact</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4">📮 {t.title}</h1>
          <div className="w-12 h-px bg-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">{t.lead}</p>
        </div>

        {done ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-lg shadow-gray-100 p-10 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">{t.successTitle}</h2>
            <p className="text-gray-600 text-sm mb-8">{t.successBody}</p>
            <a
              href={`/${l}/`}
              className="inline-flex items-center justify-center bg-gray-900 hover:bg-gray-700 text-white font-bold px-8 py-3.5 rounded-xl transition-colors text-sm"
            >
              {t.backHome}
            </a>
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl border border-gray-100 shadow-lg shadow-gray-100 p-6 sm:p-9 space-y-6 scroll-mt-24"
          >
            <div>
              <label htmlFor="contact-name" className="block text-sm font-bold text-gray-800 mb-2">
                {t.name} <span className="text-red-400">*</span>
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
              <label htmlFor="contact-email" className="block text-sm font-bold text-gray-800 mb-2">
                {t.email} <span className="text-red-400">*</span>
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
              <label htmlFor="contact-category" className="block text-sm font-bold text-gray-800 mb-2">
                {t.category} <span className="text-red-400">*</span>
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
              <label htmlFor="contact-message" className="block text-sm font-bold text-gray-800 mb-2">
                {t.message} <span className="text-red-400">*</span>
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
              className="w-full bg-gray-900 hover:bg-gray-700 active:bg-gray-800 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl transition-colors text-sm sm:text-base tracking-wide"
            >
              {loading ? t.submitting : t.submit}
            </button>
          </form>
        )}

        {/* スポンサー・協賛セクション（VIP仕様） */}
        <section className="relative mt-14 overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 border border-amber-300/25 p-7 sm:p-10 text-white shadow-2xl">
          {/* 金の光の装飾 */}
          <div className="absolute -top-28 -right-28 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-28 -left-28 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent pointer-events-none" />

          <div className="relative">
            <p className="text-amber-300 text-[11px] font-bold tracking-[0.35em] uppercase mb-4">{t.sponsorLabel}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-5 leading-snug">{t.sponsorTitle}</h2>
            <div className="w-16 h-px bg-gradient-to-r from-amber-300 to-transparent mb-6" />
            <p className="text-gray-300 text-sm leading-relaxed mb-9">{t.sponsorLead}</p>

            <div className="grid sm:grid-cols-3 gap-4 mb-9">
              {t.sponsorItems.map(item => (
                <div
                  key={item.title}
                  className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 hover:border-amber-300/40 hover:bg-white/[0.07] transition-colors"
                >
                  <div className="w-11 h-11 rounded-full bg-amber-400/10 border border-amber-300/40 flex items-center justify-center text-xl mb-4">
                    {item.icon}
                  </div>
                  <h3 className="font-bold text-sm text-amber-50 mb-2">{item.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleSponsorCta}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-300 to-yellow-500 hover:from-amber-200 hover:to-yellow-400 text-gray-900 font-extrabold px-10 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 text-sm sm:text-base tracking-wide"
            >
              {t.sponsorCta} →
            </button>
            <p className="text-xs text-gray-500 mt-5">{t.sponsorNote}</p>
          </div>
        </section>
      </main>
    </>
  );
};
