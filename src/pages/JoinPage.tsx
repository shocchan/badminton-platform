import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../services/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';

const EDGE_BASE = (import.meta.env.VITE_SUPABASE_URL as string).replace('supabase.co', 'supabase.co/functions/v1');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const content = {
  ja: {
    title: '川口・蕨バドミントン特典登録 | kawabado',
    description: '大会・活動情報の最速お知らせ＋川口・蕨エリアの無料券・割引券を登録者に優先お届け。',
    heading: '川口・蕨バドミントン特典登録',
    benefits: [
      '川口・蕨エリアの店舗特典を不定期でお届け',
      '大会・活動情報を誰よりも早くお届け',
      '登録者限定のサプライズ特典あり🎉',
    ],
    namePlaceholder: 'お名前',
    contactLabel: '連絡先（いずれか1つ必須）',
    wechatLabel: 'WeChat ID',
    emailLabel: 'メールアドレス',
    bothOk: '※両方入力もOKです',
    submit: '登録する',
    privacy: '※個人情報は特典・情報提供のみに使用します',
    success: '登録ありがとうございます！\nしょっちゃんからWeChat / メールでご連絡します🏸',
    errorRequired: 'お名前とWeChat IDまたはメールアドレスを入力してください',
    errorEmail: 'メールアドレスの形式が正しくありません',
    errorServer: '登録に失敗しました。もう一度お試しください。',
  },
  zh: {
    title: '川口・蕨羽毛球优惠注册 | kawabado',
    description: '第一时间获取大会・活动信息，以及川口・蕨地区免费券・折扣券优先配送。',
    heading: '川口・蕨羽毛球优惠注册',
    benefits: [
      '川口・蕨地区店铺特典不定期配送',
      '第一时间获取大会・活动信息',
      '会员限定惊喜特典🎉',
    ],
    namePlaceholder: '您的姓名',
    contactLabel: '联系方式（至少填写一项）',
    wechatLabel: '微信号',
    emailLabel: '邮箱地址',
    bothOk: '※两项都填写也可以',
    submit: '立即注册',
    privacy: '※个人信息仅用于优惠及信息提供',
    success: '感谢注册！\n翔会通过微信 / 邮件与您联系🏸',
    errorRequired: '请填写姓名和微信号或邮箱地址',
    errorEmail: '邮箱地址格式不正确',
    errorServer: '注册失败，请重试。',
  },
} as const;

export const JoinPage = () => {
  const { lang } = useLanguage();
  const t = content[lang === 'zh' ? 'zh' : 'ja'];

  const [name, setName] = useState('');
  const [wechatId, setWechatId] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const source = (() => {
    const s = new URLSearchParams(window.location.search).get('from') ?? '';
    return ['line', 'wechat', 'web'].includes(s) ? (s as 'line' | 'wechat' | 'web') : 'web';
  })();

  const handleSubmit = async () => {
    setError('');

    if (!name.trim() || (!wechatId.trim() && !email.trim())) {
      setError(t.errorRequired);
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.errorEmail);
      return;
    }

    setLoading(true);

    const { error: supabaseError } = await supabase
      .from('subscribers')
      .insert({
        name: name.trim(),
        wechat_id: wechatId.trim() || null,
        email: email.trim() || null,
        language: lang === 'zh' ? 'zh' : 'ja',
        source,
      });

    if (supabaseError) {
      setLoading(false);
      setError(t.errorServer);
      return;
    }

    await fetch(`${EDGE_BASE}/send-welcome`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim() || null,
        wechat_id: wechatId.trim() || null,
        language: lang === 'zh' ? 'zh' : 'ja',
      }),
    });

    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🏸</div>
        <p className="text-lg whitespace-pre-line">{t.success}</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <link rel="canonical" href={`https://kawabado.com/${lang}/join`} />
      </Helmet>

      <div className="max-w-md mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-center mb-6">{t.heading}</h1>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8">
          <ul className="space-y-2">
            {t.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-green-600 font-bold mt-0.5">✅</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder={t.namePlaceholder + ' *'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-lg px-4 py-3 text-sm"
          />

          <div>
            <p className="text-sm text-gray-600 mb-2">{t.contactLabel}</p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder={t.wechatLabel}
                value={wechatId}
                onChange={(e) => setWechatId(e.target.value)}
                className="w-full border rounded-lg px-4 py-3 text-sm"
              />
              <input
                type="email"
                placeholder={t.emailLabel}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-3 text-sm"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{t.bothOk}</p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-green-600 text-white rounded-xl py-4 font-bold text-lg disabled:opacity-60"
          >
            {loading ? '...' : t.submit}
          </button>

          <p className="text-xs text-gray-400 text-center">{t.privacy}</p>
        </div>
      </div>
    </>
  );
};
