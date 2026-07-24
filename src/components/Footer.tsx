import { Link } from 'react-router-dom';
import { CalendarDays, Footprints, Feather, Zap, MapPin, Users, ChevronRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { LogoMark } from './LogoMark';

export const Footer = () => {
  const year = new Date().getFullYear();
  const { lang } = useLanguage();
  // 内部リンクは常に正規URL（言語プレフィックス付き）にして 301 と言語コンテキスト喪失を防ぐ
  const homeLang = lang === 'zh' ? 'zh' : 'ja';

  return (
    <footer className="bg-gray-900 text-gray-400 mt-16">
      {/* メインフッター */}
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">

          {/* ブランド */}
          <div className="sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <LogoMark className="h-8 w-8 flex-shrink-0" />
              <span className="text-white font-extrabold text-base tracking-tight">{lang === 'ja' ? '川口・蕨バドミントン交流会' : '川口・蕨羽毛球交流会'}</span>
            </div>
            <p className="text-sm leading-relaxed text-gray-400">
              {lang === 'ja'
                ? '川口・蕨エリアで開催するバドミントン交流大会。初心者から上級者まで、誰でも楽しめる大会を目指しています。'
                : '在川口・蕨地区举办的羽毛球交流比赛。致力于打造一个从初学者到高手都能尽情享受的赛事。'}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                <MapPin className="h-3 w-3" /> {lang === 'ja' ? '川口・蕨エリア' : '川口・蕨地区'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                <Users className="h-3 w-3" /> {lang === 'ja' ? '全レベル歓迎' : '全级别欢迎'}
              </span>
            </div>
          </div>

          {/* ナビゲーション */}
          <div>
            <h2 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">{lang === 'ja' ? 'サイトマップ' : '网站地图'}</h2>
            <nav aria-label="フッターナビゲーション" className="flex flex-col gap-2.5">
              <Link to={`/${homeLang}/`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会案内' : '赛事信息'}
              </Link>
              <Link to={`/${homeLang}/tournaments`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会一覧' : '赛事列表'}
              </Link>
              <Link to={`/${homeLang}/level-guide`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'クラス案内' : '级别说明'}
              </Link>
              <Link to={`/${homeLang}/first-time`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '初参加ガイド' : '首次参加指南'}
              </Link>
              <Link to={`/${homeLang}/blog`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'ブログ' : '博客'}
              </Link>
              <Link to={`/${homeLang}/tournaments/gallery`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会レポート' : '往届赛事回顾'}
              </Link>
              <Link to={`/${homeLang}/faq`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会FAQ' : '赛事常见问题'}
              </Link>
              <Link to={`/${homeLang}/venues`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '会場ガイド' : '会场指南'}
              </Link>
              <Link to={`/${homeLang}/privacy-policy`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'プライバシーポリシー' : '隐私政策'}
              </Link>
              <Link to={`/${homeLang}/tokushoho`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '特定商取引法に基づく表記' : '特定商业交易法标示'}
              </Link>
              <Link to={`/${homeLang}/cancel-policy`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}
              </Link>
              <Link to={`/${homeLang}/contact`} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'お問い合わせ・スポンサー窓口' : '联系我们・赞助合作'}
              </Link>
            </nav>
          </div>

          {/* 参加案内 */}
          <div>
            <h2 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">{lang === 'ja' ? '大会参加について' : '参赛须知'}</h2>
            <div className="flex flex-col gap-2.5 text-sm text-gray-400">
              <div className="flex items-start gap-2">
                <CalendarDays className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-600" />
                <span>{lang === 'ja' ? '不定期開催（各大会ページで日程確認）' : '不定期举办（请查看各赛事页面）'}</span>
              </div>
              <div className="flex items-start gap-2">
                <Footprints className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-600" />
                <span>{lang === 'ja' ? '体育館シューズ持参必須' : '必须自带室内运动鞋'}</span>
              </div>
              <div className="flex items-start gap-2">
                <Feather className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-600" />
                <span>{lang === 'ja' ? '羽毛シャトル持参（超初級ダブルスを除く）' : '需自带羽毛球（超初级双打除外）'}</span>
              </div>
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-600" />
                <span>{lang === 'ja' ? '最低4試合以上保証' : '保证至少4场比赛'}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ボトムバー */}
      <div className="border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <p>© {year} 川口・蕨バドミントン交流会. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to={`/${homeLang}/faq`} className="hover:text-gray-200 transition-colors">{lang === 'ja' ? '大会FAQ' : '赛事常见问题'}</Link>
            <Link to={`/${homeLang}/cancel-policy`} className="hover:text-gray-200 transition-colors">{lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
