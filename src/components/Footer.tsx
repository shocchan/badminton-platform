import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Footprints, Feather, Zap, MapPin, Users, ChevronRight, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { trackRelatedServiceClick } from '../lib/analytics';
import { LogoMark } from './LogoMark';
import { KawabadoLegalLinks } from '../pages/KawabadoLegalPage';

export const Footer = () => {
  const year = new Date().getFullYear();
  const { lang } = useLanguage();
  // 関連サービスへの導線が「どのページから」踏まれているかを残すため（2026-08-24）。
  // クエリは付けない（個人を特定しうる値を計測へ渡さない）
  const { pathname } = useLocation();
  // 言語プレフィックス付きの内部リンク。
  // 以前は `/faq` `/blog` のような接頭辞なしURLを指しており、
  //   ①クリックのたびに /ja/... への内部リダイレクトを1回挟む（クロール上も無駄なホップ）
  //   ②中国語で見ている人がフッターを踏むと日本語ページへ飛ばされる
  // という2つの問題があった（2026-08-23 修正）。
  const l = lang === 'zh' ? 'zh' : 'ja';
  const to = (path: string) => (path ? `/${l}/${path}` : `/${l}/`);

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
              <Link to={to('')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会案内' : '赛事信息'}
              </Link>
              <Link to={to('level-guide')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'クラス案内' : '级别说明'}
              </Link>
              <Link to={to('blog')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'ブログ' : '博客'}
              </Link>
              <Link to={to('faq')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会FAQ' : '赛事常见问题'}
              </Link>
              <Link to={to('international')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '国際交流について' : '关于国际交流'}
              </Link>
              <Link to={to('venues')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '会場ガイド' : '会场指南'}
              </Link>
              {/* 地域ページ（2026-08-28）。sitemapに載せるだけでは弱いので、
                  全ページのフッターから内部リンクを1本ずつ通す */}
              <Link to={to('kawaguchi')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '川口市のバドミントンサークル' : '川口市的羽毛球社团'}
              </Link>
              <Link to={to('toda')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '戸田からのアクセス' : '从户田出发的交通'}
              </Link>
              {/* 大会一覧・主催者（2026-08-31）。/tournaments はルートが無いまま
                  既定のtitleのページを見せていた。about は「誰がやっているか」の受け皿 */}
              <Link to={to('tournaments')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会一覧' : '赛事一览'}
              </Link>
              <Link to={to('about')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'カワバドについて' : '关于kawabado'}
              </Link>
              <Link to={to('cancel-policy')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}
              </Link>
              <Link to={to('contact')} className="text-sm hover:text-white transition-colors flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" /> {lang === 'ja' ? 'お問い合わせ・スポンサー窓口' : '联系我们・赞助合作'}
              </Link>
            </nav>
            {/* 関連サービス（2026-08-22）。**大会案内の並びには混ぜない**。
                AI日本語コースは別事業なので、区切り線の下に小さく置く。
                目的は2つ: ①Googleがコースのページを見つける経路を作る（sitemapだけだと弱い）
                ②バドの中国語話者コミュニティに、探せば辿り着ける場所を1つ用意する */}
            <div className="mt-5 border-t border-gray-800 pt-4">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-gray-600">
                {lang === 'ja' ? '関連サービス' : '相关服务'}
              </p>
              <Link to={to('ai-course')}
                onClick={() => trackRelatedServiceClick('ai_course', pathname)}
                className="flex items-center gap-2 text-sm transition-colors hover:text-white">
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
                {lang === 'ja' ? 'AI日本語コース（中国語話者向け）' : 'AI日语课程 · 翔子老师'}
              </Link>
              {/* wildflow は別ドメイン・別ブランドの媒体（同じ運営者）。
                  サイト外へ出るので、外部リンクであることを見た目でも伝える。

                  rel に nofollow を足した理由（2026-08-24）:
                  全ページのフッターから別ドメインへ dofollow で出ていて、逆向きの被リンクは0本。
                  検索エンジンから見ると「サイト全体規模の一方向リンク」で、
                  評価を渡すつもりが無いのに渡している状態だった。
                  リンク自体は人にとって有用なので残し、評価だけ渡さない。
                  あわせて「同じ運営者」であることを文字で書き、踏む前に関係が分かるようにする */}
              <a href="https://wild-flow.com/" target="_blank" rel="noopener noreferrer nofollow"
                onClick={() => trackRelatedServiceClick('wildflow', pathname)}
                className="mt-2.5 flex items-center gap-2 text-sm transition-colors hover:text-white">
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
                <span>
                  {lang === 'ja' ? 'wildflow（フィジカル×ライフスタイル）' : 'wildflow（身体与生活方式媒体）'}
                </span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-gray-600" aria-hidden="true" />
                <span className="sr-only">{lang === 'ja' ? '（新しいタブで開きます）' : '（在新标签页打开）'}</span>
              </a>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                {lang === 'ja'
                  ? '当交流会と同じ運営者が運営している別サイトです。'
                  : '由本交流会的同一运营者运营的另一个网站。'}
              </p>
            </div>
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
          {/* 法務ページ（2026-08-24 追加）。有料の申込を受けている以上、
              特商法表記・プライバシーポリシー・利用規約は全ページから辿れる場所に置く。
              リンク数が増えるので折り返し可にする。

              統合（2026-08-28）: 両ブランチが独立に同じ3リンクを足していた。
              ここは security 側の <KawabadoLegalLinks /> を採用する。
              理由は、あちらは KAWABADO_LEGAL_PUBLISH を見ていて、
              事実が未確定で非公開のうちはリンク自体を出さないため。
              こちら側の直書きリンクだと、踏んだ先がトップへ Navigate する
              「行き止まりのリンク」がフッターに5本並ぶ状態になっていた。
              リンク文言とURLも法務ページ定義（buildKawabadoLegalPages）が正で、
              二重管理にならない。
              一方 faq / cancel-policy は、こちら側の to() を残す。
              接頭辞なしURLだと ①/ja/... への内部リダイレクトが1回挟まる
              ②中国語で見ている人が日本語ページへ飛ばされる、の2点が起きるため */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <Link to={to('faq')} className="hover:text-gray-200 transition-colors">{lang === 'ja' ? '大会FAQ' : '赛事常见问题'}</Link>
            <Link to={to('cancel-policy')} className="hover:text-gray-200 transition-colors">{lang === 'ja' ? '大会キャンセルポリシー' : '赛事取消政策'}</Link>
            <KawabadoLegalLinks className="hover:text-gray-200 transition-colors" />
          </div>
        </div>
      </div>
    </footer>
  );
};
