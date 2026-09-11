// 招待リンク限定のページ（/:lang/invite?invite=CODE）。2026-09-11 CEO決定。
//
// 「検索に出ない・招待された人だけ」の7日間無料。診断ではなく**学習が始まる**と伝える。
// 締め切りは固定日のカウントダウン、定員は「100名」とだけ（残り数は出さない）。
// 申し込みはメールだけ。既存の ai-course-auth（招待コード照合＋メールOTP）をそのまま使う。
// 個人リンクをメールで送る形は、送信の直し（Resend）が入ってから切り替える。
//
// 書かない: 問題数・合格の断定・AI会話が使える（docs/ai-course/marketing/FREE_TRIAL_COPY.md §1）。
// 強めに言ってよい: 「合格を目指す」「話せる自分へ」（目標・方向として）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, KeyRound, Loader2, Mail, Lock } from 'lucide-react';
import { sendEmailOtp, verifyEmailOtp, type OtpSendCode } from '../../lib/aiLesson/course/courseAuth';
import { LEGAL_PUBLISH } from '../../lib/aiLesson/course/legal/legalFacts';
import { legalPathFor } from '../../lib/aiLesson/course/legal/legalContent';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { INVITE_CAMPAIGN, countdownTo, daysUntil, inviteCodeFromSearch } from '../../lib/aiLesson/course/plans/inviteCampaign';

type L = 'ja' | 'zh';
const RESEND_COOLDOWN_SEC = 60;

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
    formLabel: '填邮箱，验证码会发到邮箱',
    emailPh: 'you@example.com',
    send: '免费开始7天',
    sending: '发送中…',
    resendIn: (s: number) => `${s} 秒后可重新发送`,
    fine: '无需付款、不会自动续费。输入邮件里的验证码就能进入。',
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
      invalid_invite: '这个邀请链接已失效或已满员。', otp_cooldown: (s: number) => `发送太频繁，请等 ${s} 秒。`,
      otp_hourly_limit: '发送次数已达上限，请一小时后再试。', invalid_email: '邮箱格式不正确。',
      network: '网络连接不太顺利，请再试一次。', unknown: '出了点问题，请稍后再试。', invalid_code: '验证码不正确或已过期。',
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
    formLabel: 'メールアドレスを入れると、確認コードが届きます',
    emailPh: 'you@example.com',
    send: '無料で7日間はじめる',
    sending: '送信中…',
    resendIn: (s: number) => `再送できるまで ${s} 秒`,
    fine: '支払いも自動更新もありません。届いた確認コードを入れるだけで入れます。',
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
      invalid_invite: 'この招待リンクは使えなくなっています（定員または期限）。', otp_cooldown: (s: number) => `送信のしすぎです。あと ${s} 秒お待ちください。`,
      otp_hourly_limit: '送信回数が上限に達しました。1時間ほどおいてからお試しください。', invalid_email: 'メールアドレスの形式が正しくありません。',
      network: '通信がうまくいきませんでした。もう一度お試しください。', unknown: 'エラーが発生しました。少し待ってからもう一度お試しください。', invalid_code: 'コードが正しくないか、期限切れです。',
    },
  },
} as const;

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDeadline = (lang: L) => {
  const d = new Date(INVITE_CAMPAIGN.deadlineISO);
  const m = d.getMonth() + 1, day = d.getDate();
  return lang === 'zh' ? `${m}月${day}日` : `${m}月${day}日`;
};

export function InviteLandingPage() {
  const { lang: rawLang } = useParams();
  const lang: L = rawLang === 'zh' ? 'zh' : 'ja';
  const t = T[lang];
  const navigate = useNavigate();
  const invite = inviteCodeFromSearch(typeof window === 'undefined' ? '' : window.location.search);
  const [cd, setCd] = useState(() => countdownTo(INVITE_CAMPAIGN.deadlineISO));
  const examDays = daysUntil(INVITE_CAMPAIGN.examDateISO);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [consented, setConsented] = useState(false);
  const [closedByServer, setClosedByServer] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const id = setInterval(() => setCd(countdownTo(INVITE_CAMPAIGN.deadlineISO)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (cooldown <= 0) return; const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000); return () => window.clearTimeout(id); }, [cooldown]);
  useEffect(() => { trackCourse('view_ai_course_invite', { lang }); }, [lang]);

  const msg = useCallback((c: OtpSendCode | undefined, retry?: number) => {
    const e = t.err;
    if (c === 'otp_cooldown') return e.otp_cooldown(retry ?? RESEND_COOLDOWN_SEC);
    if (c === 'invalid_invite' || c === 'otp_hourly_limit' || c === 'invalid_email' || c === 'network') return e[c];
    return e.unknown;
  }, [t]);

  const send = async (isResend: boolean) => {
    if (busy || cooldown > 0 || !email.trim()) return;
    setError('');
    setBusy(true);
    const r = await sendEmailOtp(email, invite);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'invalid_invite') setClosedByServer(true);
      setError(msg(r.code, r.retryAfter));
      if (r.code === 'otp_cooldown' && r.retryAfter) setCooldown(r.retryAfter);
      return;
    }
    trackCourse('send_ai_course_invite_otp', { lang });
    setCooldown(RESEND_COOLDOWN_SEC);
    if (!isResend) setStep('code');
  };
  const verify = async () => {
    if (busy || code.trim().length < 4) return;
    setError('');
    setBusy(true);
    const r = await verifyEmailOtp(email, code);
    setBusy(false);
    if (!r.ok) { setError(t.err.invalid_code); return; }
    trackCourse('login_ai_course', { method: 'otp' });
    navigate(`/${lang}/ai-course`, { replace: true });
  };
  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const closed = cd.closed || closedByServer;
  const other: L = lang === 'zh' ? 'ja' : 'zh';

  return (
    <div className="min-h-screen bg-[#eef1f5] text-[#14203a]">
      <Helmet>
        <title>{lang === 'zh' ? '7天日语实力诊断（邀请专用）' : '7日間の実力診断（招待専用）'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="mx-auto w-full max-w-md px-3 pb-14 pt-3">
        <div className="overflow-hidden rounded-3xl border border-[#dbe1ea] bg-white shadow-[0_12px_40px_rgba(20,32,58,.08)]">
          <div className="flex items-center justify-between border-b border-[#dbe1ea] px-4 py-3">
            <div className="flex items-center gap-2 text-[15px] font-bold"><span className="inline-block h-5 w-5 rounded-md bg-[#1f4a80]" aria-hidden />{t.brand}</div>
            <Link to={`/${other}/invite${window.location.search}`} className="rounded-full border border-[#dbe1ea] px-3 py-1 text-xs text-[#43506a]">{other === 'zh' ? '中文' : '日本語'}</Link>
          </div>

          <div className="flex items-center gap-3 bg-[#12345e] px-4 py-3 text-[12.5px] text-[#e9f0fa]">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white/10"><KeyRound className="h-4 w-4" aria-hidden /></span>
            <div><b className="block text-[13px] text-white">{t.inviteOnly}</b>{t.inviteOnlySub}</div>
          </div>

          {!invite ? (
            <div className="px-5 py-14 text-center">
              <h1 className="font-serif text-xl font-bold">{t.noInviteH}</h1>
              <p className="mt-2 text-sm text-[#43506a]">{t.noInviteP}</p>
            </div>
          ) : (
            <>
              <div className="px-5 pb-1 pt-6">
                <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-[#b8302e]"><i className="inline-block h-0.5 w-4 bg-[#b8302e]" aria-hidden />{t.eyebrow(examDays)}</span>
                <h1 className="mt-3 font-serif text-[30px] font-black leading-[1.28] [text-wrap:balance]">
                  {t.h1a}<br /><span className="border-b-[3px] border-[#c9a24a] text-[#1f4a80]">{t.h1b}</span>
                </h1>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#43506a]">{t.lead}</p>
                <div className="mt-3 flex gap-1.5">{['N3', 'N2', 'N1'].map((l) => <span key={l} className="rounded-md border-[1.5px] border-[#14203a] px-2 py-0.5 font-mono text-[13px] font-semibold">{l}</span>)}</div>
              </div>

              {closed ? (
                <div className="mx-5 mt-4 rounded-2xl border border-[#dbe1ea] bg-[#f5f7fa] p-5 text-center">
                  <Lock className="mx-auto h-6 w-6 text-[#7b869c]" aria-hidden />
                  <h2 className="mt-2 font-serif text-lg font-bold">{t.closedH}</h2>
                  <p className="mt-1 text-sm text-[#43506a]">{t.closedP}</p>
                </div>
              ) : (
                <>
                  <div className="mx-5 mt-4 rounded-2xl border border-[#b8302e]/35 bg-[#fbeceb] px-4 pb-3 pt-3.5" aria-live="polite" data-testid="invite-countdown">
                    <div className="flex items-baseline justify-between text-xs font-bold text-[#b8302e]"><span>{t.deadline}</span><small className="font-medium text-[#7b869c]">{fmtDeadline(lang)} 23:59 (JST)</small></div>
                    <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
                      <span className="text-[44px] font-semibold leading-none">{cd.days}</span><span className="text-sm font-bold text-[#43506a]">{t.day}</span>
                      <span className="text-[26px] font-semibold">{pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)}</span>
                    </div>
                  </div>
                  <div className="mx-5 mt-2.5 flex items-center gap-3 rounded-2xl border border-[#dbe1ea] bg-[#f5f7fa] px-3.5 py-2.5">
                    <span className="grid h-12 w-12 flex-none -rotate-6 place-items-center rounded-full border-2 border-[#b8302e] text-center font-serif text-[12px] font-black leading-[1.1] text-[#b8302e]" aria-hidden>{INVITE_CAMPAIGN.seats}<br />{lang === 'zh' ? '名' : '名'}</span>
                    <div><b className="block text-sm">{t.seats}</b><span className="text-xs text-[#43506a]">{t.seatsSub}</span></div>
                  </div>
                  <button type="button" onClick={scrollToForm} className="mx-5 mt-3.5 block w-[calc(100%-2.5rem)] rounded-xl bg-[#b8302e] py-3.5 text-center text-base font-bold text-white">{t.cta} →</button>
                  <p className="mx-5 mt-1.5 text-center text-[11.5px] text-[#7b869c]">{t.ctaSub}</p>
                </>
              )}

              <section className="px-5 pt-7">
                <h2 className="font-serif text-xl font-black leading-snug [text-wrap:balance]">{t.s1h}</h2>
                <p className="mb-3 text-[13px] text-[#43506a]">{t.s1sub}</p>
                <div className="grid gap-2">
                  {[t.p1, t.p2, t.p3].map(([h, b], i) => (
                    <div key={h} className="grid grid-cols-[30px_1fr] gap-2.5 rounded-xl bg-[#f5f7fa] px-3 py-2.5">
                      <span className="font-serif text-lg font-black text-[#1f4a80]">{['一', '二', '三'][i]}</span>
                      <div><b className="block text-[14.5px]">{h}</b><span className="text-[12.5px] text-[#43506a]">{b}</span></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-[#dbe1ea] bg-[#f5f7fa]" aria-hidden>
                  <div className="flex items-center gap-1.5 border-b border-[#dbe1ea] bg-white px-3 py-2 text-[11px] text-[#7b869c]"><i className="h-2 w-2 rounded-full bg-[#dbe1ea]" /><i className="h-2 w-2 rounded-full bg-[#dbe1ea]" /><i className="h-2 w-2 rounded-full bg-[#dbe1ea]" />{t.shot}</div>
                  <div className="m-2.5 rounded-xl border border-[#dbe1ea] bg-white px-3 py-2.5 text-[12.5px]"><div className="text-[11px] text-[#7b869c]">{t.shotA[0]}</div><div className="text-[15px] font-bold">{t.shotA[1]}</div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dbe1ea]"><i className="block h-full w-1/3 bg-[#1f4a80]" /></div></div>
                  <div className="m-2.5 rounded-xl border border-[#dbe1ea] bg-white px-3 py-2.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2"><div><div className="text-[11px] text-[#7b869c]">{t.shotB[0]}</div><div className="text-[15px] font-bold">{t.shotB[1]}</div></div><span className="rounded-lg bg-[#1f4a80] px-3 py-1.5 text-xs font-bold text-white">{t.shotB[2]}</span></div>
                    <ol className="mt-1.5 list-decimal pl-[18px] text-[#43506a]">{t.shotList.map((s) => <li key={s}>{s}</li>)}</ol>
                    <div className="mt-1.5 text-[11.5px] font-bold text-[#b8302e]">{t.shotWarn}</div>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-[#7b869c]">{t.shotCap}</p>
              </section>

              <section className="px-5 pt-7">
                <h2 className="mb-3 font-serif text-xl font-black">{t.s2h}</h2>
                <div className="ml-2 border-l-2 border-[#dbe1ea] pl-3.5">
                  {t.days.map(([d, h, b]) => (
                    <div key={d} className="relative pb-3 pt-1 before:absolute before:-left-[20px] before:top-[11px] before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-white before:bg-[#1f4a80]">
                      <span className="font-mono text-[11px] font-semibold text-[#1f4a80]">{d}</span><b className="block text-sm">{h}</b><span className="text-[12.5px] text-[#43506a]">{b}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="px-5 pt-7">
                <h2 className="mb-3 font-serif text-xl font-black">{t.s3h}</h2>
                <div className="grid gap-2">{t.lv.map(([l, b]) => <div key={l} className="grid grid-cols-[44px_1fr] items-start gap-2.5"><span className="rounded-md border-[1.5px] border-[#14203a] py-px text-center font-mono text-[13px] font-semibold">{l}</span><span className="text-[13px] text-[#43506a]">{b}</span></div>)}</div>
              </section>

              <div className="mx-5 mt-6 rounded-2xl bg-[#12345e] px-5 py-5 text-white">
                <p className="font-serif text-lg font-black leading-snug [text-wrap:balance]">{t.bold}</p>
                <p className="mt-1.5 text-[12.5px] text-[#c9d6e8]">{t.boldSub}</p>
              </div>

              <div className="mx-5 mt-5 rounded-2xl border border-[#dbe1ea] bg-[#f5f7fa] px-3.5 py-3 text-[13px]">
                <b className="mb-1 block">{t.honestH}</b>
                <ul className="list-disc pl-[18px] text-[#43506a]">{t.honest.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>

              {!closed && (
                <div ref={formRef} id="apply" className="mx-5 mt-5 rounded-2xl border border-[#dbe1ea] bg-[#f5f7fa] p-4">
                  {step === 'email' ? (
                    <>
                      <label htmlFor="invite-mail" className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold"><Mail className="h-3.5 w-3.5" aria-hidden />{t.formLabel}</label>
                      <input id="invite-mail" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder={t.emailPh}
                        className="w-full rounded-xl border border-[#dbe1ea] bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1f4a80]" />
                      {LEGAL_PUBLISH && (
                        <div className="mt-2 rounded-xl border border-[#dbe1ea] bg-white p-3">
                          <label className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f4a80]" /><span>{t.consent}</span></label>
                          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
                            <Link to={legalPathFor(lang, 'terms')} className="text-[#1f4a80] underline">{t.consentTerms}</Link>
                            <Link to={legalPathFor(lang, 'privacy')} className="text-[#1f4a80] underline">{t.consentPrivacy}</Link>
                            <Link to={legalPathFor(lang, 'ai-disclosure')} className="text-[#1f4a80] underline">{t.consentAi}</Link>
                          </p>
                        </div>
                      )}
                      {error && <p className="mt-2 text-sm text-[#b8302e]">{error}</p>}
                      <button type="button" onClick={() => void send(false)} disabled={busy || !email.trim() || cooldown > 0 || (LEGAL_PUBLISH && !consented)}
                        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#b8302e] py-3.5 text-base font-bold text-white disabled:opacity-40">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? t.sending : cooldown > 0 ? t.resendIn(cooldown) : t.send}{!busy && cooldown === 0 && <ArrowRight className="h-4 w-4" aria-hidden />}
                      </button>
                      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#7b869c]">{t.fine}</p>
                    </>
                  ) : (
                    <>
                      <label htmlFor="invite-code" className="mb-1.5 block text-[12.5px] font-bold">{t.codeLabel}</label>
                      <p className="mb-2 text-xs text-[#43506a]">{t.codeHint(email)}</p>
                      <input id="invite-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="12345678"
                        className="w-full rounded-xl border border-[#dbe1ea] bg-white px-3 py-3 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1f4a80]" />
                      {error && <p className="mt-2 text-sm text-[#b8302e]">{error}</p>}
                      <button type="button" onClick={() => void verify()} disabled={busy || code.trim().length < 4}
                        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f4a80] py-3.5 text-base font-bold text-white disabled:opacity-40">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t.verify}
                      </button>
                      <div className="mt-2.5 flex flex-wrap justify-between gap-2 text-xs">
                        <button type="button" onClick={() => void send(true)} disabled={busy || cooldown > 0} className="underline disabled:opacity-40">{cooldown > 0 ? t.resendIn(cooldown) : t.resend}</button>
                        <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="underline">{t.changeEmail}</button>
                      </div>
                      <p className="mt-2 text-[11px] text-[#7b869c]">{t.notArrived}</p>
                    </>
                  )}
                </div>
              )}

              <div className="px-5 pt-5">
                {t.faq.map(([q, a]) => <details key={q} className="border-t border-[#dbe1ea] py-2.5"><summary className="cursor-pointer text-[13.5px] font-bold">{q}</summary><p className="mt-1.5 text-[12.5px] text-[#43506a]">{a}</p></details>)}
              </div>
              <div className="mt-4 border-t border-[#dbe1ea] px-5 pb-6 pt-4 text-[11.5px] text-[#7b869c]">{t.foot(fmtDeadline(lang))}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteLandingPage;
