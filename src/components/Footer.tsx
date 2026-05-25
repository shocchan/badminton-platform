import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-400 py-10 mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col items-center gap-6">
          {/* ロゴ */}
          <div className="flex items-center gap-2">
            <span className="text-xl">🏸</span>
            <span className="text-white font-bold">川口・蕨バド交流杯</span>
          </div>

          {/* ナビゲーション */}
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link to="/" className="hover:text-white transition-colors">大会案内</Link>
            <Link to="/level-guide" className="hover:text-white transition-colors">クラス案内</Link>
            <Link to="/faq" className="hover:text-white transition-colors">よくある質問</Link>
            <Link to="/cancel-policy" className="hover:text-white transition-colors">キャンセルポリシー</Link>
            <Link to="/blog" className="hover:text-white transition-colors">ブログ</Link>
          </nav>

          {/* コピーライト */}
          <p className="text-xs text-gray-600">© 2024 川口・蕨バド交流杯. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
