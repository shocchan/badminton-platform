import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export const Footer = () => {
  const year = new Date().getFullYear();
  const { lang } = useLanguage();

  return (
    <footer className="bg-gray-900 text-gray-400 mt-16">
      {/* メインフッター */}
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">

          {/* ブランド */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🏸</span>
              <span className="text-white font-extrabold text-base">{lang === 'ja' ? '川口・蕨バドミントン交流会' : '川口・蕨羽毛球交流会'}</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-500">
              {lang === 'ja'
                ? '川口・蕨エリアで開催するバドミントン交流大会。初心者から上級者まで、誰でも楽しめる大会を目指しています。'
                : '在川口・蕨地区举办的羽毛球交流比赛。致力于打造一个从初学者到高手都能尽情享受的赛事。'}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">{lang === 'ja' ? '📍 川口・蕨エリア' : '📍 川口・蕨地区'}</span>
              <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">{lang === 'ja' ? '🏸 全レベル歓迎' : '🏸 全级别欢迎'}</span>
            </div>
          </div>

          {/* ナビゲーション */}
          <div>
            <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">{lang === 'ja' ? 'サイトマップ' : '网站地图'}</h3>
            <nav className="flex flex-col gap-2.5">
              <Link to="/" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> {lang === 'ja' ? '大会案内' : '赛事信息'}
              </Link>
              <Link to="/level-guide" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> {lang === 'ja' ? 'クラス案内' : '级别说明'}
              </Link>
              <Link to="/blog" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> {lang === 'ja' ? 'ブログ' : '博客'}
              </Link>
              <Link to="/faq" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> {lang === 'ja' ? '大会FAQ' : '赛事常见问题'}
              </Link>
              <Link to="/cancel-policy" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> {lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}
              </Link>
            </nav>
          </div>

          {/* 参加案内 */}
          <div>
            <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">{lang === 'ja' ? '大会参加について' : '参赛须知'}</h3>
            <div className="flex flex-col gap-2.5 text-sm text-gray-500">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">📅</span>
                <span>{lang === 'ja' ? '不定期開催（各大会ページで日程確認）' : '不定期举办（请查看各赛事页面）'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">👟</span>
                <span>{lang === 'ja' ? '体育館シューズ持参必須' : '必须自带室内运动鞋'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">🏸</span>
                <span>{lang === 'ja' ? '羽毛シャトル持参（超初級ダブルスを除く）' : '需自带羽毛球（超初级双打除外）'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">⚡</span>
                <span>{lang === 'ja' ? '最低4試合以上保証' : '保证至少4场比赛'}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ボトムバー */}
      <div className="border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
          <p>© {year} 川口・蕨バドミントン交流会. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/faq" className="hover:text-gray-400 transition-colors">{lang === 'ja' ? '大会FAQ' : '赛事常见问题'}</Link>
            <Link to="/cancel-policy" className="hover:text-gray-400 transition-colors">{lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
