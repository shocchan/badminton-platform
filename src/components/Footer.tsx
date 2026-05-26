import { Link } from 'react-router-dom';

export const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-400 mt-16">
      {/* メインフッター */}
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">

          {/* ブランド */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🏸</span>
              <span className="text-white font-extrabold text-base">川口・蕨バド交流杯</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-500">
              川口・蕨エリアで開催するバドミントン交流大会。初心者から上級者まで、誰でも楽しめる大会を目指しています。
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">📍 川口・蕨エリア</span>
              <span className="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">🏸 全レベル歓迎</span>
            </div>
          </div>

          {/* ナビゲーション */}
          <div>
            <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">サイトマップ</h3>
            <nav className="flex flex-col gap-2.5">
              <Link to="/" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> 大会案内
              </Link>
              <Link to="/level-guide" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> クラス案内
              </Link>
              <Link to="/blog" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> ブログ
              </Link>
              <Link to="/faq" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> よくある質問
              </Link>
              <Link to="/cancel-policy" className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <span className="text-gray-600">›</span> キャンセルポリシー
              </Link>
            </nav>
          </div>

          {/* 参加案内 */}
          <div>
            <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">参加について</h3>
            <div className="flex flex-col gap-2.5 text-sm text-gray-500">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">📅</span>
                <span>不定期開催（各大会ページで日程確認）</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">👟</span>
                <span>体育館シューズ持参必須</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">🏸</span>
                <span>羽毛シャトル持参（超初級ダブルスを除く）</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0">⚡</span>
                <span>最低3試合以上保証</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ボトムバー */}
      <div className="border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
          <p>© {year} 川口・蕨バド交流杯. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/faq" className="hover:text-gray-400 transition-colors">FAQ</Link>
            <Link to="/cancel-policy" className="hover:text-gray-400 transition-colors">キャンセルポリシー</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
