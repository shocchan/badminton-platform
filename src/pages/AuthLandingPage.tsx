import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export const AuthLandingPage = () => {
  const navigate = useNavigate();
  const { lang } = useLanguage();

  const content = lang === 'zh' ? {
    title: '川口・蕨羽毛球交流会',
    subtitle: '从初级到高级全级别欢迎',
    desc: '在埼玉县川口市・蕨市举办的平日夜间羽毛球交流活动。保证最低4场比赛以上。',
    meritTitle: '会员注册的好处',
    merits: [
      { emoji: '🏸', title: '羽毛球对决游戏', desc: '获取免费券奖品' },
      { emoji: '📱', title: '我的页面', desc: '随时查看和展示免费券' },
      { emoji: '✅', title: '参加比赛报名', desc: '更方便快捷' },
    ],
    loginBtn: '登录',
    signupBtn: '新规注册',
    note: '全级别欢迎。初心者から上级者まで楽しめます。',
  } : {
    title: '川口・蕨バドミントン交流会',
    subtitle: '初級から上級まで全級別歓迎',
    desc: '埼玉県川口市・蕨市エリアで開催する平日夜間バドミントン交流活動。最低4試合以上保証。',
    meritTitle: '会員登録のメリット',
    merits: [
      { emoji: '🏸', title: 'バド対決ゲーム', desc: '景品（無料券）を獲得' },
      { emoji: '📱', title: 'マイページ', desc: 'いつでも無料券を確認・提示' },
      { emoji: '✅', title: '大会参加申込', desc: 'よりスムーズに' },
    ],
    loginBtn: 'ログイン',
    signupBtn: '新規登録',
    note: '初心者から上級者まで楽しめます。',
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* ヒーロー */}
      <section className="px-4 py-16 sm:py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="text-6xl sm:text-7xl mb-4">🏸</div>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
            {content.title}
          </h1>
          <p className="text-xl sm:text-2xl text-blue-600 font-semibold mb-4">
            {content.subtitle}
          </p>
          <p className="text-gray-600 text-lg mb-8">
            {content.desc}
          </p>

          {/* アクションボタン */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              onClick={() => navigate(`/${lang}/login`)}
              className="px-8 py-4 bg-white border-2 border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors text-lg"
            >
              🔓 {content.loginBtn}
            </button>
            <button
              onClick={() => navigate(`/${lang}/signup`)}
              className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors text-lg shadow-lg"
            >
              ✨ {content.signupBtn}
            </button>
          </div>

          <p className="text-sm text-gray-500">{content.note}</p>
        </div>
      </section>

      {/* メリット表示 */}
      <section className="px-4 py-12 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            🎁 {content.meritTitle}
          </h2>

          <div className="grid sm:grid-cols-3 gap-8">
            {content.merits.map((merit, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl mb-4">{merit.emoji}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {merit.title}
                </h3>
                <p className="text-gray-600">{merit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA再表示 */}
      <section className="px-4 py-12 bg-gradient-to-r from-blue-500 to-blue-600">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="text-3xl font-bold text-white mb-6">
            {lang === 'zh' ? '准备开始了吗？' : 'さあ始めましょう！'}
          </h3>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(`/${lang}/login`)}
              className="px-6 py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-gray-100 transition-colors"
            >
              {content.loginBtn}
            </button>
            <button
              onClick={() => navigate(`/${lang}/signup`)}
              className="px-6 py-3 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 transition-colors"
            >
              {content.signupBtn}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};
