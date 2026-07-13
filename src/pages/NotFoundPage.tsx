import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Trophy, CalendarDays, Home } from 'lucide-react';

export const NotFoundPage = () => {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <Helmet>
        <title>ページが見つかりません | 川口・蕨バドミントン交流会</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="w-full max-w-md text-center">
        {/* シャトルが落ちたイラスト */}
        <svg viewBox="0 0 200 140" className="mx-auto mb-6 w-48" aria-hidden="true">
          <ellipse cx="100" cy="122" rx="52" ry="8" fill="#e5e7eb" />
          <g transform="rotate(38 100 80)">
            <path d="M100 60 L82 28 L88 26 L100 52 L112 26 L118 28 Z" fill="#93c5fd" />
            <path d="M100 56 L90 30 L96 28 L100 50 L104 28 L110 30 Z" fill="#bfdbfe" />
            <circle cx="100" cy="68" r="12" fill="#f9fafb" stroke="#d1d5db" strokeWidth="3" />
          </g>
          <text x="100" y="30" textAnchor="middle" fontSize="34" fontWeight="800" fill="#1f2937">
            404
          </text>
        </svg>

        <h1 className="text-xl font-bold text-gray-900">ページが見つかりませんでした</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          お探しのページは移動または削除された可能性があります。
          <br />
          アウトです。次のラリーへどうぞ！
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/ja/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-500 active:scale-[0.98]"
          >
            <Trophy className="h-4 w-4" />
            大会一覧へ
          </Link>
          <div className="flex gap-3">
            <Link
              to="/ja/activity"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <CalendarDays className="h-4 w-4 text-emerald-500" />
              通常活動
            </Link>
            <Link
              to="/ja/blog"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Home className="h-4 w-4 text-blue-500" />
              ブログ
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};
