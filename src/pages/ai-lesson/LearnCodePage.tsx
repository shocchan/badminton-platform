// 個人専用URL（/:lang/learn/:code）。**押すだけで学習が始まる**入口（2026-09-09 P0-2）。
//
// WeChatで渡すのはこのURL1本。開いた瞬間にコードでログインし、学習画面へ送る。
// 学習者に見せる操作は「もう一度ためす」だけ。うまくいかない人のために、
// ログイン画面（コード入力・ID＋パスワード）への道を必ず残す。
//
// URLに入っているコードはセッションが成立したら履歴から消す（戻るボタンや
// 共有スクリーンショットで残り続けないように）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { ShokoAvatar } from '../../components/ai-course/ShokoAvatar';
import { signInWithLearningCode, getSession, type CodeLoginCode } from '../../lib/aiLesson/course/courseAuth';
import { isValidLearningCode } from '../../lib/aiLesson/course/learningCode';

type Phase = 'working' | 'failed';

const TXT = {
  ja: {
    title: '学習の入口',
    working: 'ログインしています…',
    workingNote: 'パスワードは要りません。そのままお待ちください。',
    failedTitle: 'この入口を開けませんでした',
    invalid: 'リンクが古くなっているか、途中で切れている可能性があります。',
    tooMany: '短い時間に何度も試されました。15分ほどおいてから、もう一度お試しください。',
    unavailable: '通信がうまくいきませんでした。電波のよい場所でもう一度お試しください。',
    retry: 'もう一度ためす',
    toLogin: 'ログイン画面をひらく',
    ask: 'うまくいかないときは、WeChatで先生に「入れません」と送ってください。すぐに新しい入口をお渡しします。',
  },
  zh: {
    title: '学习入口',
    working: '正在登录…',
    workingNote: '不需要密码，请稍等。',
    failedTitle: '打不开这个入口',
    invalid: '链接可能已经过期，或者在复制时被截断了。',
    tooMany: '短时间内尝试了太多次。请等15分钟后再试。',
    unavailable: '网络连接不太顺利。请在信号好的地方再试一次。',
    retry: '再试一次',
    toLogin: '打开登录页面',
    ask: '打不开的时候，请在微信上告诉老师「进不去」，我们会马上发给你新的入口。',
  },
} as const;

export function LearnCodePage() {
  const { lang: rawLang, code } = useParams();
  const lang: 'ja' | 'zh' = rawLang === 'zh' ? 'zh' : 'ja';
  const t = TXT[lang];
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('working');
  const [reason, setReason] = useState<CodeLoginCode>('invalid_code');
  // 二重実行よけ（StrictModeの2回マウントで generate_link を2本焼かない）
  const started = useRef(false);

  const go = useCallback(() => {
    // コードをURLから消してから学習画面へ（戻る操作でコードが残らない）
    window.history.replaceState(null, '', `/${lang}/ai-course`);
    navigate(`/${lang}/ai-course`, { replace: true });
  }, [lang, navigate]);

  const attempt = useCallback(async () => {
    const raw = code ?? '';
    if (!isValidLearningCode(raw)) { setReason('invalid_code'); setPhase('failed'); return; }
    setPhase('working');
    // 既にこの端末でログイン済みなら、コードを使わずそのまま入る（トークンを無駄に焼かない）
    const current = await getSession();
    if (current) { go(); return; }
    const r = await signInWithLearningCode(raw);
    if (r.ok) { go(); return; }
    setReason(r.code ?? 'invalid_code');
    setPhase('failed');
  }, [code, go]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void attempt();
  }, [attempt]);

  const message = reason === 'too_many_attempts' ? t.tooMany
    : reason === 'invalid_code' ? t.invalid
      : t.unavailable;

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <html lang={lang} />
        <title>{t.title} | kawabado</title>
        {/* コードがURLに入るので、検索にも履歴にも残さない */}
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm sm:p-8">
          <ShokoAvatar size={72} className="mx-auto mb-3 ring-4 ring-blue-50" />
          {phase === 'working' ? (
            <div role="status" aria-live="polite">
              <p className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t.working}
              </p>
              <p className="mt-2 text-sm text-gray-500">{t.workingNote}</p>
            </div>
          ) : (
            <div>
              <p className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />{t.failedTitle}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{message}</p>
              <button
                type="button"
                onClick={() => { started.current = true; void attempt(); }}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
              >
                {t.retry}<ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <Link
                to={`/${lang}/ai-course/login`}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700"
              >
                {t.toLogin}
              </Link>
              <p className="mt-4 text-[11px] leading-relaxed text-gray-500">{t.ask}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LearnCodePage;
