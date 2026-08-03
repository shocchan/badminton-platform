// 生徒の入口ページ（PAID STUDENT PILOT §1）。/:lang/ai-course/login
//
// ここが「渡されたID＋パスワードで入る」唯一の入口。
// すでにログイン済みなら学習アプリへ送る（ログイン画面で足止めしない）。

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { StudentLogin } from '../../components/ai-course/StudentLogin';
import { getSession } from '../../lib/aiLesson/course/courseAuth';

export function AiCourseLoginPage() {
  const params = useParams();
  const navigate = useNavigate();
  const lang: 'ja' | 'zh' = params.lang === 'zh' ? 'zh' : 'ja';
  const [checking, setChecking] = useState(true);

  // ログイン済みなら素通しする
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void getSession().then((u) => {
        if (!alive) return;
        if (u) navigate(`/${lang}/ai-course`, { replace: true });
        else setChecking(false);
      }).catch(() => { if (alive) setChecking(false); });
    }, 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [lang, navigate]);

  return (
    <>
      <Helmet>
        <title>{lang === 'zh' ? '登录｜AI日语陪伴学习系统' : 'ログイン｜AI日本語伴走システム'}</title>
        {/* 生徒専用の入口。検索には載せない */}
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {checking ? (
        <div className="flex min-h-[50vh] items-center justify-center" role="status">
          <p className="text-sm text-gray-500">{lang === 'zh' ? '正在确认…' : '確認しています…'}</p>
        </div>
      ) : (
        <StudentLogin lang={lang} onLoggedIn={() => navigate(`/${lang}/ai-course`, { replace: true })} />
      )}
    </>
  );
}

export default AiCourseLoginPage;
