// 招待リンク限定のページ（/:lang/invite?invite=CODE）。2026-09-11 CEO決定。
//
// **販売LPと同じ見た目・同じ部品で作る**（「いつもの商品の、今回だけの特別版」に見せる）。
// LPと違うのは: 冒頭の「招待された人だけ」の帯、固定日のカウントダウン、100名限定、
// 料金の代わりにメールだけの申込欄。診断ではなく**学習が始まる**と伝える。
// 申し込みは既存の ai-course-auth（招待コード照合＋メールOTP）をそのまま使う。
// 個人リンクをメールで送る形は、送信の直し（Resend）が入ってから切り替える。
//
// 書かない: 問題数・合格の断定・AI会話が使える（docs/ai-course/marketing/FREE_TRIAL_COPY.md §1）。
// 強めに言ってよい: 「合格を目指す」「話せる自分へ」（目標・方向として）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { KeyRound, Loader2, Mail, Lock } from 'lucide-react';
import { signupWithInvite, type InviteSignupCode } from '../../lib/aiLesson/course/courseAuth';
import { LEGAL_PUBLISH } from '../../lib/aiLesson/course/legal/legalFacts';
import { legalPathFor } from '../../lib/aiLesson/course/legal/legalContent';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { INVITE_CAMPAIGN, countdownTo, daysUntil, inviteCodeFromSearch } from '../../lib/aiLesson/course/plans/inviteCampaign';
import { VARIANTS } from './landing/lpContent';
import { Reveal, SectionHeading, CtaButton, ArrowRight, Check } from './landing/lpUi';
import { imgUrl } from './landing/lpHelpers';
import { currentLpTheme } from './landing/lpTheme';
import { PainPointsSection, DailyLearningFlow } from './landing/sectionsA';
import { PlatformFeatures } from './landing/sectionsB';
import { HumanCoachSection, TestimonialsSection } from './landing/sectionsC';
import { FaqSection } from './landing/sectionsE';
import { LifeScenesSection } from './landing/sectionsScenes';
import { LegalFooterLinks } from './legal/LegalPage';

type L = 'ja' | 'zh';

const T = {
  zh: {
    brand: '日语搭档',
    inviteOnly: '仅限从这个链接进来的人',
    inviteOnlySub: '搜索找不到这一页。是安田直接发给你的邀请。',
    eyebrow: (d: number) => `12月JLPT还有${d}天`,
    h1a: '目标：考过。',
    h1b: '然后，开口说。',
    lead: '词汇・语法・阅读——先量出你现在缺什么，然后每天10分钟，只补那里。不是刷题，是把有限的时间用在对的地方。',
    deadline: '报名截止',
    day: '天',
    seats: '限量100个账号・7天免费',
    seatsSub: '先到先得。满员后这个链接就打不开了。',
    cta: '免费开始7天',
    ctaSub: '只需邮箱・无需付款・不用输入任何代码',
    s1h: '不是「测一下」，是从第一天就开始学',
    s1sub: '测出你在哪，只是为了决定今天学什么。',
    p1: ['只补你缺的：词汇・语法・阅读', '8分钟测出词汇和语法的位置。之后出的题，全是你做错过、快忘掉的那些。会的题不再出现。'],
    p2: ['每天只做「今天这4件」', '打开就知道今天做什么、大概几分钟。不用自己想计划。'],
    p3: ['知道剩下的时间够不够', '按考试日倒推，告诉你「每周要吃透几项才赶得上」。现在的速度够不够，一眼就看到。'],
    shot: '实际画面（示意）',
    shotA: ['距离N2还有86天', 'N3语法攻略（攻略率 34%）'],
    shotB: ['今天只做这4件・约17分钟', '复习 7题', '开始'],
    shotList: ['复习7题（约3分钟）', '学一个新语法（约5分钟）', '阅读训练（约5分钟）', '新单词5个（约4分钟）'],
    shotWarn: '要在考试前学完，每周需吃透2项（现在是每周0.3）',
    shotCap: '※ 这7天里能打开的是前3个地区的内容。',
    s2h: '7天，这样过',
    days: [
      ['DAY 1', '8分钟，知道自己在哪', '词汇和语法分别在什么位置。当天就开始补第一处。'],
      ['DAY 2–6', '每天10分钟，只做你缺的', '错过的题在快忘的时候再出来。阅读和语法，按你的弱点排。'],
      ['DAY 3', '一次模拟考', '哪一科最弱，用分数看清楚。'],
      ['DAY 7', '决定接下来的时间怎么用', '错题本、单词图鉴、测试结果都留着。继续与否，由你决定。'],
    ],
    s3h: '给12月要考的你',
    lv: [
      ['N3', '「看得懂但做不对」的语法，一个个查清楚。阅读从短文开始。'],
      ['N2', '178个语法点里，只练你不稳的。词汇按频度补，阅读练速度。'],
      ['N1', '词汇量是关键。每天5个新词＋错过的复现，阅读用长文。'],
    ],
    bold: '说得出来的日语，从考得过的基础开始。',
    boldSub: '这7天先把基础补齐。之后想开口的话，AI会话在正式课程里等你。',
    honestH: '先说清楚',
    honest: ['这7天不含AI会话。是考试・语法・词汇・阅读的部分。', '听力练习目前只有N3和N2有音频。', '7天后结束。测试结果・错题本・单词图鉴不会清空。', '不保证考试合格。'],
    formLabel: '填邮箱，账号和个人链接会发到邮箱',
    emailPh: 'you@example.com',
    send: '免费开始7天',
    sending: '发送中…',
    resendIn: (s: number) => `${s} 秒后可重新发送`,
    fine: '无需付款、不会自动续费。邮件里有ID・密码・个人链接。打开个人链接就能进入，不用输密码。',
    sentH: '发好了，请查收邮件',
    sentP: (e: string) => `已发送到 ${e}。邮件里有个人链接，点开就能开始。没收到的话请先看垃圾邮件文件夹，等几分钟仍未收到可以再发一次。`,
    sentAgain: '换一个邮箱',
    codeLabel: '验证码',
    codeHint: (e: string) => `请查看发送到 ${e} 的邮件，输入收到的验证码。`,
    verify: '进入',
    resend: '重新发送验证码',
    changeEmail: '更换邮箱',
    notArrived: '没收到的话，请先看垃圾邮件文件夹。',
    consent: '我同意使用条款与隐私政策',
    consentTerms: '使用条款', consentPrivacy: '隐私政策', consentAi: '关于AI的使用',
    faq: [
      ['7天后会怎样？', '账号和记录都留着。想继续的话，那时会看到方案；不继续也没有任何费用。'],
      ['每天要花多久？', '第一天8分钟测试，之后每天大约10分钟。打开就知道今天做什么。'],
      ['用手机就行吗？', '可以。微信里打开也行。'],
    ],
    foot: (d: string) => `限量100个账号・报名截止到${d}。只对收到这个链接的人开放。`,
    closedH: '报名已截止',
    closedP: '这个链接的名额已满，或已过截止日期。谢谢你的关注。',
    noInviteH: '这个链接不完整',
    noInviteP: '请用安田发给你的原始链接打开。',
    err: {
      invalid_invite: '这个邀请链接已失效或已满员。', rate_limited: '短时间内尝试太多次，请等15分钟后再试。',
      already_registered: '这个邮箱已经注册过了。请用之前收到的个人链接进入，或者从登录页面用ID和密码登录。',
      mail_failed: '账号已创建，但邮件没有发出去。请直接联系安田，我们会把个人链接发给你。', invalid_email: '邮箱格式不正确。',
      network: '网络连接不太顺利，请再试一次。', unknown: '出了点问题，请稍后再试。',
    },
  },
  ja: {
    brand: '日本語の相棒',
    inviteOnly: 'このリンクから開いた人だけ',
    inviteOnlySub: '検索には出てきません。しょっちゃんから直接送った招待です。',
    eyebrow: (d: number) => `12月のJLPTまで、あと${d}日`,
    h1a: '目標は、合格。',
    h1b: 'その先に、話せる自分。',
    lead: 'ことば・文法・読解。いま足りない所を先に量って、毎日10分、そこだけを埋める。問題を解き散らかす学習ではなく、限られた時間を正しい場所に使う学習です。',
    deadline: '申し込み期限',
    day: '日',
    seats: '100アカウント限定・7日間無料',
    seatsSub: '先着順。定員に達した時点で、このリンクは開けなくなります。',
    cta: '無料で7日間はじめる',
    ctaSub: 'メールアドレスだけ・支払いなし・コード入力なし',
    s1h: '「診断」ではなく、初日から学習が始まる',
    s1sub: '現在地を量るのは、今日なにを学ぶかを決めるためです。',
    p1: ['足りない所だけを埋める: ことば・文法・読解', '8分でことばと文法の位置を測ります。その後に出るのは、間違えた問題と忘れかけた問題だけ。できる問題は出ません。'],
    p2: ['毎日「今日はこの4つだけ」', '開いた瞬間に、今日やることと所要時間が出ます。計画を自分で考えなくていい。'],
    p3: ['残り時間で足りるかが見える', '試験日から逆算して「週に何項目の定着が必要か」を出します。今のペースで間に合うかが、その場で分かります。'],
    shot: '実際の画面（イメージ）',
    shotA: ['N2まであと86日', 'N3文法攻略（攻略率 34%）'],
    shotB: ['今日はこの4つだけ・約17分', '復習 7問', 'はじめる'],
    shotList: ['復習 7問（約3分）', '新しい文法を学ぶ（約5分）', '読解トレーニング（約5分）', '新しいことば5語（約4分）'],
    shotWarn: '受験日までに終えるには週2項目の定着が必要です（いまは週0.3）',
    shotCap: '※ この7日で開けるのは、最初の3地域までです。',
    s2h: '7日間の流れ',
    days: [
      ['DAY 1', '8分で、現在地が分かる', 'ことばと文法がそれぞれどこにいるか。その日のうちに最初の穴を埋め始めます。'],
      ['DAY 2–6', '毎日10分、足りない所だけ', '間違えた問題は忘れそうな日にもう一度。読解と文法は、弱い所から順に出ます。'],
      ['DAY 3', 'ミニ模試を1回', 'どの科目がいちばん弱いかを、点数で見ます。'],
      ['DAY 7', '残りの時間の使い方が決まる', '錯題本・単語図鑑・診断結果は残ります。続けるかどうかは、そのとき決めてください。'],
    ],
    s3h: '12月に受ける人へ',
    lv: [
      ['N3', '「読めるのに解けない」文法を一つずつ確かめる。読解は短い文から。'],
      ['N2', '文法178項目のうち、あやふやな所だけ。ことばは頻度順に、読解は速さを。'],
      ['N1', '鍵はことばの量。毎日5語＋間違えた語の再登場、読解は長文で。'],
    ],
    bold: '話せる日本語は、合格できる基礎から。',
    boldSub: 'この7日で基礎を埋める。その先で話したくなったら、AI会話が本コースで待っています。',
    honestH: '先に正直に書きます',
    honest: ['この7日にAI会話は含みません。試験・文法・ことば・読解の部分です。', '聴解の音源はいまN3・N2だけです。', '7日で終わります。診断結果・錯題本・単語図鑑は消えません。', '合格を保証するものではありません。'],
    formLabel: 'メールアドレスを入れると、アカウントと個人リンクが届きます',
    emailPh: 'you@example.com',
    send: '無料で7日間はじめる',
    sending: '送信中…',
    resendIn: (s: number) => `再送できるまで ${s} 秒`,
    fine: '支払いも自動更新もありません。メールにID・パスワード・個人リンクが入っています。個人リンクを開くだけで入れます。',
    sentH: '送りました。メールを確認してください',
    sentP: (e: string) => `${e} 宛に送りました。メールの個人リンクを開くと始まります。届かないときは迷惑メールフォルダを確認し、数分待っても届かなければもう一度送れます。`,
    sentAgain: '別のメールアドレスで送る',
    codeLabel: '確認コード',
    codeHint: (e: string) => `${e} 宛のメールを確認して、届いたコードを入力してください。`,
    verify: '入る',
    resend: 'コードを再送する',
    changeEmail: 'メールアドレスを変更する',
    notArrived: '届かないときは、迷惑メールフォルダを確認してください。',
    consent: '利用規約とプライバシーポリシーに同意します',
    consentTerms: '利用規約', consentPrivacy: 'プライバシーポリシー', consentAi: 'AIの利用について',
    faq: [
      ['7日が終わったらどうなりますか', 'アカウントと記録は残ります。続けたい人にはそのときプランが出ます。続けなくても費用は一切かかりません。'],
      ['1日どれくらいかかりますか', '初日は8分の診断、その後は毎日10分ほど。開けば今日やることが出ます。'],
      ['スマホだけでできますか', 'できます。WeChatの中で開いても使えます。'],
    ],
    foot: (d: string) => `100アカウント限定・${d}まで。このリンクを受け取った人だけに開いています。`,
    closedH: '受付は終了しました',
    closedP: 'このリンクは定員に達したか、締め切りを過ぎています。ご関心ありがとうございました。',
    noInviteH: 'このリンクは途中で切れています',
    noInviteP: 'しょっちゃんから届いた元のリンクで開いてください。',
    err: {
      invalid_invite: 'この招待リンクは使えなくなっています（定員または期限）。', rate_limited: '短い時間に何度も試されました。15分ほどおいてからもう一度お試しください。',
      already_registered: 'このメールアドレスは登録済みです。前に届いた個人リンクから入るか、ログイン画面でIDとパスワードでログインしてください。',
      mail_failed: 'アカウントはできましたが、メールを送れませんでした。しょっちゃんに直接連絡してください。個人リンクをお渡しします。', invalid_email: 'メールアドレスの形式が正しくありません。',
      network: '通信がうまくいきませんでした。もう一度お試しください。', unknown: 'エラーが発生しました。少し待ってからもう一度お試しください。',
    },
  },
} as const;
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDeadline = () => { const d = new Date(INVITE_CAMPAIGN.deadlineISO); return `${d.getMonth() + 1}月${d.getDate()}日`; };

/** 7日で開くもの／本コースで待っているもの。LPの機能一覧の直前に置き、期待を正しくそろえる */
const SCOPE = {
  zh: {
    h: '这7天能打开的，和正式课程里等你的',
    open: ['8分钟水平测试', '语法・词汇・阅读（冒险的前3个地区）', '错题本・单词图鉴', '1次模拟考'],
    later: ['AI会话（每天开口练习）', '真人日语教练的一对一', '6个月的完整路线'],
    openH: '7天免费里有', laterH: '正式课程里等你',
  },
  ja: {
    h: 'この7日で開くもの、本コースで待っているもの',
    open: ['8分の実力診断', '文法・ことば・読解（冒険の最初の3地域）', '錯題本・単語図鑑', 'ミニ模試 1回'],
    later: ['AI会話（毎日話す練習）', '日本語コーチの個別レッスン', '6か月のロードマップ'],
    openH: '7日間無料に入っているもの', laterH: '本コースで待っているもの',
  },
} as const;

export function InviteLandingPage() {
  const { lang: rawLang } = useParams();
  const lang: L = rawLang === 'zh' ? 'zh' : 'ja';
  const t = T[lang];
  const sc = SCOPE[lang];
  const v = VARIANTS.shoko;
  const invite = inviteCodeFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  const [theme] = useState(currentLpTheme);
  const [cd, setCd] = useState(() => countdownTo(INVITE_CAMPAIGN.deadlineISO));
  const examDays = daysUntil(INVITE_CAMPAIGN.examDateISO);

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consented, setConsented] = useState(false);
  const [closedByServer, setClosedByServer] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const id = setInterval(() => setCd(countdownTo(INVITE_CAMPAIGN.deadlineISO)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { trackCourse('view_ai_course_invite', { lang }); }, [lang]);

  const msg = useCallback((c: InviteSignupCode): string => {
    const e = t.err;
    if (c === 'invalid_invite' || c === 'rate_limited' || c === 'already_registered' || c === 'mail_failed' || c === 'invalid_email' || c === 'network') return e[c];
    return e.unknown;
  }, [t]);

  const send = async () => {
    if (busy || !email.trim()) return;
    setError(''); setBusy(true);
    const r = await signupWithInvite(email, invite, lang);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'invalid_invite') setClosedByServer(true);
      setError(msg(r.code));
      return;
    }
    trackCourse('signup_ai_course_invite', { lang });
    setStep('sent');
  };
  const toForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const closed = cd.closed || closedByServer;
  const other: L = lang === 'zh' ? 'ja' : 'zh';
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const [ww, wh] = v.imageSize.wave;

  const countdownBlock = (
    <div className="rounded-3xl bg-lp-card border-2 border-lp-coral/40 p-5 shadow-[0_8px_22px_rgba(55,43,38,0.06)]" aria-live="polite" data-testid="invite-countdown">
      <div className="flex items-baseline justify-between text-[0.85rem] font-extrabold text-lp-coral-deep">
        <span>{t.deadline}</span><span className="font-bold text-lp-ink-soft">{fmtDeadline()} 23:59 (JST)</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums text-lp-ink">
        <span className="text-[3rem] font-extrabold leading-none">{cd.days}</span><span className="text-base font-extrabold text-lp-ink-soft">{t.day}</span>
        <span className="text-[1.75rem] font-extrabold">{pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)}</span>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-3">
        <span className="grid h-12 w-12 flex-none -rotate-6 place-items-center rounded-full border-2 border-lp-coral-deep text-center text-[0.75rem] font-extrabold leading-[1.1] text-lp-coral-deep" aria-hidden>{INVITE_CAMPAIGN.seats}<br />名</span>
        <div><b className="block text-[0.98rem] text-lp-ink">{t.seats}</b><span className="text-[0.85rem] text-lp-ink-soft">{t.seatsSub}</span></div>
      </div>
    </div>
  );

  return (
    <div data-lp-theme={theme} className="lp-paper bg-lp-ivory text-lp-ink min-h-screen [font-feature-settings:'palt']">
      <Helmet>
        <html lang={lang === 'ja' ? 'ja' : 'zh'} />
        <title>{lang === 'zh' ? '7天日语实力诊断（邀请专用）' : '7日間の実力診断（招待専用）'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="sticky top-0 z-50 bg-lp-ivory/85 backdrop-blur border-b border-lp-line">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-[0.95rem] sm:text-[1.05rem] whitespace-nowrap">
            <span className="inline-grid place-items-center w-8 h-8 shrink-0 rounded-full bg-lp-coral text-white text-sm" aria-hidden="true">和</span>
            <span>{lang === 'ja' ? '日本語の相棒' : '你的日语搭档'}</span>
          </div>
          <div className="flex items-center gap-3 whitespace-nowrap">
            <Link to={`/${other}/invite${search}`} className="text-[0.92rem] font-bold text-lp-ink-soft hover:text-lp-ink underline underline-offset-4 min-h-11 flex items-center">{other === 'zh' ? '中文' : '日本語'}</Link>
            {invite && !closed && (
              <button type="button" onClick={toForm} className="inline-flex items-center justify-center min-h-11 px-3.5 rounded-full bg-lp-coral text-white font-extrabold text-[0.88rem] shadow-[0_3px_0_var(--color-lp-coral-deep)] active:translate-y-0.5">{t.cta}</button>
            )}
          </div>
        </div>
      </header>

      <div className="overflow-x-hidden" style={{ overflowX: 'clip' }}>
      <main>
        {/* 招待された人だけ、の帯。LPには無い、このページだけのもの */}
        <div className="bg-lp-pine text-white">
          <div className="mx-auto max-w-6xl px-5 py-3 flex items-center gap-3 text-[0.9rem]">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white/15"><KeyRound className="h-4 w-4" aria-hidden /></span>
            <div><b className="block">{t.inviteOnly}</b><span className="text-white/85">{t.inviteOnlySub}</span></div>
          </div>
        </div>

        {!invite ? (
          <section className="py-24 text-center px-5">
            <h1 className="text-2xl font-extrabold">{t.noInviteH}</h1>
            <p className="mt-3 text-lp-ink-soft">{t.noInviteP}</p>
          </section>
        ) : (
          <>
            {/* ヒーロー。LPと同じ組み方（左に文、右に先生）。文だけ今回のもの */}
            <section className="relative pt-8 sm:pt-12 pb-6">
              <div className="mx-auto max-w-6xl px-5 grid md:grid-cols-[1.05fr_.95fr] gap-10 items-center">
                <div className="text-center md:text-left">
                  <span className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">
                    <span className="inline-block w-5 h-[3px] rounded bg-lp-coral" aria-hidden="true" />{t.eyebrow(examDays)}
                  </span>
                  <h1 className="mt-4 font-extrabold text-lp-ink text-[clamp(2rem,6vw,3.4rem)] leading-[1.24] text-balance">
                    <span className="block">{t.h1a}</span>
                    <span className="block relative text-lp-coral-deep"><span className="relative z-10">{t.h1b}</span><span className="absolute left-0 right-0 bottom-[0.05em] h-[0.34em] rounded bg-lp-gold/85 -rotate-1 z-0" aria-hidden="true" /></span>
                  </h1>
                  <p className="mt-5 inline-block rounded-xl bg-lp-pine text-white font-extrabold text-[1.02rem] px-4 py-2">{t.seats}</p>
                  <p className="mt-4 text-[1.08rem] text-lp-ink-soft leading-relaxed max-w-[30em] mx-auto md:mx-0">{t.lead}</p>
                  <div className="mt-4 flex gap-2 justify-center md:justify-start">{['N3', 'N2', 'N1'].map((l) => <span key={l} className="rounded-lg border-2 border-lp-ink px-2.5 py-0.5 font-mono text-[0.95rem] font-extrabold">{l}</span>)}</div>
                  {!closed && (
                    <div className="mt-7 flex flex-col sm:flex-row gap-3.5 justify-center md:justify-start items-center">
                      <CtaButton variant="primary" onClick={toForm} event="click_ai_course_invite_cta" eventParams={{ location: 'hero', lang }}>{t.cta}<ArrowRight /></CtaButton>
                      <span className="text-[0.85rem] text-lp-ink-soft">{t.ctaSub}</span>
                    </div>
                  )}
                </div>
                <div className="relative mx-auto w-full max-w-[420px]">
                  <img src={imgUrl(v.images.wave)} width={ww} height={wh} alt={v.name[lang]} decoding="async"
                    className="w-full h-auto drop-shadow-[0_18px_30px_rgba(55,43,38,0.18)]" />
                  <div className="absolute -left-2 top-6 max-w-[62%] rounded-2xl rounded-bl-sm bg-white border border-lp-line px-4 py-3 text-[0.95rem] font-bold text-lp-ink shadow-[0_8px_22px_rgba(55,43,38,0.12)] whitespace-pre-line">{v.hero.bubble[lang]}</div>
                </div>
              </div>
              <div className="mx-auto max-w-6xl px-5 mt-8 grid md:grid-cols-2 gap-6 items-start">
                {closed ? (
                  <div className="rounded-3xl bg-lp-card border border-lp-line p-6 text-center md:col-span-2">
                    <Lock className="mx-auto h-6 w-6 text-lp-ink-soft" aria-hidden />
                    <h2 className="mt-2 text-xl font-extrabold">{t.closedH}</h2>
                    <p className="mt-1 text-lp-ink-soft">{t.closedP}</p>
                  </div>
                ) : (
                  <>
                    {countdownBlock}
                    <div className="rounded-3xl bg-lp-card border border-lp-line p-6">
                      <p className="text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">{t.s1h}</p>
                      <ul className="mt-3 space-y-2.5">
                        {[t.p1, t.p2, t.p3].map(([h]) => <li key={h} className="flex items-start gap-2.5 font-bold text-lp-ink"><Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{h}</li>)}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ここから下はLPと同じ部品。使った先の生活が思い浮かぶ順に */}
            <PainPointsSection lang={lang} />
            <LifeScenesSection lang={lang} />

            {/* 7日で開くもの／本コースで待っているもの（LPの機能一覧の前に、期待をそろえる） */}
            <section id="scope" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
              <div className="mx-auto max-w-5xl px-5">
                <Reveal><SectionHeading title={sc.h} /></Reveal>
                <div className="grid sm:grid-cols-2 gap-5">
                  <Reveal className="h-full"><div className="h-full rounded-3xl bg-lp-card border-2 border-lp-pine p-6">
                    <p className="font-extrabold text-lp-pine">{sc.openH}</p>
                    <ul className="mt-3 space-y-2">{sc.open.map((s) => <li key={s} className="flex items-start gap-2 text-lp-ink"><Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{s}</li>)}</ul>
                  </div></Reveal>
                  <Reveal delay={80} className="h-full"><div className="h-full rounded-3xl bg-lp-card border border-lp-line p-6">
                    <p className="font-extrabold text-lp-ink-soft">{sc.laterH}</p>
                    <ul className="mt-3 space-y-2 text-lp-ink-soft">{sc.later.map((s) => <li key={s} className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-lp-coral-deep" aria-hidden>→</span>{s}</li>)}</ul>
                  </div></Reveal>
                </div>
              </div>
            </section>

            <PlatformFeatures lang={lang} />
            <DailyLearningFlow v={v} lang={lang} />

            {/* 7日の流れと級ごとの一言（このページだけ） */}
            <section id="seven-days" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
              <div className="mx-auto max-w-3xl px-5">
                <Reveal><SectionHeading title={t.s2h} lead={t.s1sub} /></Reveal>
                <Reveal delay={60}>
                  <ol className="rounded-3xl bg-lp-card border border-lp-line divide-y divide-lp-line overflow-hidden">
                    {t.days.map(([d, h, b]) => (
                      <li key={d} className="flex items-start gap-3.5 px-5 py-4">
                        <span className="mt-0.5 shrink-0 rounded-full bg-lp-pine-soft px-2.5 py-1 font-mono text-[0.8rem] font-extrabold text-lp-pine">{d}</span>
                        <div><b className="block text-lp-ink">{h}</b><span className="text-[0.95rem] text-lp-ink-soft">{b}</span></div>
                      </li>
                    ))}
                  </ol>
                </Reveal>
                <Reveal delay={120}>
                  <div className="mt-8 rounded-3xl bg-lp-card border border-lp-line p-6">
                    <p className="font-extrabold text-lp-ink mb-3">{t.s3h}</p>
                    <div className="space-y-3">{t.lv.map(([l, b]) => <div key={l} className="grid grid-cols-[48px_1fr] items-start gap-3"><span className="rounded-lg border-2 border-lp-ink py-0.5 text-center font-mono font-extrabold">{l}</span><span className="text-[0.95rem] text-lp-ink-soft leading-relaxed">{b}</span></div>)}</div>
                  </div>
                </Reveal>
                <Reveal delay={160}>
                  <div className="mt-8 rounded-3xl bg-lp-pine text-white p-6">
                    <p className="text-[1.25rem] font-extrabold leading-snug text-balance">{t.bold}</p>
                    <p className="mt-2 text-white/85">{t.boldSub}</p>
                  </div>
                </Reveal>
              </div>
            </section>

            <HumanCoachSection lang={lang} />
            <TestimonialsSection lang={lang} />

            {/* 正直な但し書き ＋ 申込 */}
            <section id="apply" ref={formRef} className="scroll-mt-20 py-16 sm:py-24">
              <div className="mx-auto max-w-3xl px-5">
                <Reveal>
                  <div className="rounded-3xl bg-lp-ivory-2 border border-lp-line p-6 mb-6">
                    <p className="font-extrabold text-lp-ink mb-2">{t.honestH}</p>
                    <ul className="space-y-1.5 text-[0.95rem] text-lp-ink-soft list-disc pl-5">{t.honest.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                </Reveal>
                {closed ? (
                  <div className="rounded-3xl bg-lp-card border border-lp-line p-6 text-center">
                    <h2 className="text-xl font-extrabold">{t.closedH}</h2><p className="mt-1 text-lp-ink-soft">{t.closedP}</p>
                  </div>
                ) : (
                  <Reveal delay={60}>
                    <div className="rounded-3xl bg-lp-card border-2 border-lp-coral/40 p-6 shadow-[0_8px_22px_rgba(55,43,38,0.06)]">
                      <div className="mb-5">{countdownBlock}</div>
                      {step === 'email' ? (
                        <>
                          <label htmlFor="invite-mail" className="mb-2 flex items-center gap-2 font-extrabold text-lp-ink"><Mail className="h-4 w-4" aria-hidden />{t.formLabel}</label>
                          <input id="invite-mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder={t.emailPh}
                            className="w-full min-h-12 rounded-2xl border border-lp-line bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-lp-pine" />
                          {LEGAL_PUBLISH && (
                            <div className="mt-3 rounded-2xl border border-lp-line bg-white p-3">
                              <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-lp-pine" /><span>{t.consent}</span></label>
                              <p className="mt-1.5 flex flex-wrap gap-x-3 text-[0.8rem]">
                                <Link to={legalPathFor(lang, 'terms')} className="underline underline-offset-2 text-lp-pine">{t.consentTerms}</Link>
                                <Link to={legalPathFor(lang, 'privacy')} className="underline underline-offset-2 text-lp-pine">{t.consentPrivacy}</Link>
                                <Link to={legalPathFor(lang, 'ai-disclosure')} className="underline underline-offset-2 text-lp-pine">{t.consentAi}</Link>
                              </p>
                            </div>
                          )}
                          {error && <p className="mt-3 text-sm font-bold text-lp-coral-deep">{error}</p>}
                          <div className="mt-4">
                            <CtaButton variant="primary" fullWidth onClick={() => void send()} disabled={busy || !email.trim() || (LEGAL_PUBLISH && !consented)}>
                              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? t.sending : t.send}{!busy && <ArrowRight />}
                            </CtaButton>
                          </div>
                          <p className="mt-3 text-[0.85rem] text-lp-ink-soft leading-relaxed">{t.fine}</p>
                        </>
                      ) : (
                        <div className="text-center" data-testid="invite-sent">
                          <Mail className="mx-auto h-8 w-8 text-lp-pine" aria-hidden />
                          <h3 className="mt-2 text-xl font-extrabold">{t.sentH}</h3>
                          <p className="mt-2 text-[0.95rem] text-lp-ink-soft">{t.sentP(email)}</p>
                          <button type="button" onClick={() => { setStep('email'); setError(''); }} className="mt-4 underline underline-offset-2 text-sm">{t.sentAgain}</button>
                        </div>
                      )}
                    </div>
                  </Reveal>
                )}
                <Reveal delay={100}>
                  <div className="mt-8">
                    {t.faq.map(([q, a]) => <details key={q} className="border-t border-lp-line py-3"><summary className="cursor-pointer font-extrabold">{q}</summary><p className="mt-2 text-[0.95rem] text-lp-ink-soft">{a}</p></details>)}
                  </div>
                </Reveal>
              </div>
            </section>

            <FaqSection lang={lang} />
          </>
        )}
      </main>

      <footer className="border-t border-lp-line py-10">
        <div className="mx-auto max-w-6xl px-5 flex flex-wrap items-center justify-between gap-4 text-[0.9rem] text-lp-ink-soft">
          <div className="flex items-center gap-2 font-extrabold text-lp-ink"><span className="inline-grid place-items-center w-7 h-7 rounded-full bg-lp-coral text-white text-xs" aria-hidden="true">和</span>{lang === 'ja' ? '日本語の相棒' : '你的日语搭档'}</div>
          <span>{t.foot(fmtDeadline())}</span>
        </div>
        <div className="mx-auto max-w-6xl px-5 mt-6 text-lp-ink-soft"><LegalFooterLinks lang={lang} /></div>
        <div className="h-24 sm:hidden" aria-hidden="true" />
      </footer>
      </div>

      {/* スマホ下部の固定CTA（LPと同じ位置・同じ見た目） */}
      {invite && !closed && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-lp-ivory/95 backdrop-blur border-t border-lp-line px-4 py-3">
          <CtaButton variant="primary" fullWidth onClick={toForm} event="click_ai_course_invite_cta" eventParams={{ location: 'sticky', lang }}>{t.cta}<ArrowRight /></CtaButton>
        </div>
      )}
    </div>
  );
}

export default InviteLandingPage;
