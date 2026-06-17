import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../services/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import type { Lang } from '../contexts/LanguageContext';

interface Group {
  id: string;
  slug: string;
  name: string;
  enable_member_charge: boolean;
}

interface Activity {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  price: number;
  status: 'open' | 'closed' | 'cancelled';
  address?: string;
  notes?: string;
  group_id?: string;
}

interface ActivityEntry {
  id: string;
  activity_id: string;
  name: string;
  member_type: 'member' | 'normal';
  source: 'line' | 'wechat' | 'web';
  cancel_code: string;
  quantity: number;
  status: 'confirmed' | 'waitlist';
  notes: string;
  created_at: string;
}

const WECHAT_ID = 'Shocchance';

const T: Record<Lang, {
  memberBadge: string;
  normalBadge: string;
  submitMember: string;
  submitNormal: string;
  namePlaceholder: string;
  full: string;
  remaining: (n: number) => string;
  used: (u: number, c: number) => string;
  waitlistBadge: string;
  waitlistSection: string;
  confirmedSection: string;
  cancelLink: string;
  cancelTitle: string;
  cancelNamePh: string;
  cancelCodePh: string;
  cancelBtn: string;
  cancelSubmitting: string;
  cancelSuccess: string;
  cancelPartial: (n: number, r: number) => string;
  cancelError: string;
  cancelPolicy: string;
  cancelRules: string[];
  successTitle: string;
  successWaitlist: string;
  successCodeLabel: string;
  successNote: string;
  submitting: string;
  backLink: string;
  notFound: string;
  cancelled: string;
  price: (p: number) => string;
  memberBanner: string;
  memberBannerNote: string;
  memberNote: string;
  fullNote: string;
  waitlistSubmitNormal: string;
  waitlistSubmitMember: string;
  personUnit: string;
  closed: string;
  closedNote: string;
  receiving: string;
  participants: string;
  payment: string;
  share: string;
  copyUrl: string;
  shareCancel: string;
  deadline: string;
  deadlineLabel: string;
  nameError: string;
  submitError: string;
  cancelNameCodeError: string;
}> = {
  ja: {
    memberBadge: 'チャージ済み',
    normalBadge: '通常',
    submitMember: 'チャージ済み会員で申し込む',
    submitNormal: '今すぐ申し込む',
    namePlaceholder: 'お名前',
    full: '満員',
    remaining: (n) => `残り${n}枠`,
    used: (u, c) => `${u}/${c}人`,
    waitlistBadge: '補欠',
    waitlistSection: '補欠リスト',
    confirmedSection: '参加確定',
    cancelLink: 'キャンセルはこちら',
    cancelTitle: '申し込みキャンセル',
    cancelNamePh: 'お名前（申し込み時と同じ）',
    cancelCodePh: '4桁のキャンセルコード',
    cancelBtn: 'キャンセルする',
    cancelSubmitting: 'キャンセル中...',
    cancelSuccess: 'キャンセルが完了しました。',
    cancelPartial: (n, r) => `${n}人分をキャンセルしました。残り${r}人分は有効です。`,
    cancelError: 'コードが違います。コードを忘れた場合は主催者にご連絡ください。',
    cancelPolicy: `※コードを忘れた場合は主催者（WeChat ID：${WECHAT_ID}）までご連絡ください。無断キャンセルは原則禁止・費用発生の対象となります。`,
    cancelRules: [
      '【キャンセルルール】24時間前までにキャンセルしてください。',
      '24時間以内のキャンセルの場合：',
      '1️⃣ 補欠・代替あり → 補欠者が繰り上がるか自分で代わりを見つけた場合は費用なし',
      '2️⃣ 補欠・代替なし → 空きが生じた場合は通常料金が発生します ⚠️',
      '（※ 自分で代替者を見つける場合、補欠順は問いません。ただし事前にご連絡ください）',
    ],
    successTitle: '申し込みが完了しました！',
    successWaitlist: '補欠として登録しました！繰り上がった場合にご連絡します。',
    successCodeLabel: 'キャンセルコード：',
    successNote: 'このコードはキャンセル時に必要です。スクリーンショットを保存してください。',
    submitting: '送信中...',
    backLink: '申し込みに戻る',
    notFound: 'この活動は見つかりませんでした。',
    cancelled: 'この活動は中止になりました。',
    price: (p) => `¥${p.toLocaleString()} / 人`,
    memberBanner: '💳 チャージ済み会員の方へ',
    memberBannerNote: '事前チャージ済みの方は「チャージ済み会員」ボタンでお申し込みください。残高から自動で引き落とされます。',
    memberNote: '※チャージ済みの方はこちら',
    fullNote: '定員に達しています。補欠として申し込むことができます。',
    waitlistSubmitNormal: '補欠で申し込む（通常）',
    waitlistSubmitMember: '補欠で申し込む（チャージ済み）',
    personUnit: '人',
    closed: '締め切り',
    closedNote: '開始時刻を過ぎたため締め切られました',
    receiving: '受付中',
    participants: '参加人数',
    payment: '支払い方法',
    share: 'シェア',
    copyUrl: 'URLをコピー',
    shareCancel: 'キャンセル',
    deadline: '受付終了',
    deadlineLabel: '締め切りまで',
    nameError: 'お名前を入力してください',
    submitError: '申し込みに失敗しました。もう一度お試しください。',
    cancelNameCodeError: 'お名前とキャンセルコードを入力してください',
  },
  zh: {
    memberBadge: '充值会员',
    normalBadge: '普通',
    submitMember: '充值会员报名',
    submitNormal: '立即报名',
    namePlaceholder: '您的姓名',
    full: '已满',
    remaining: (n) => `剩余${n}名`,
    used: (u, c) => `${u}/${c}人`,
    waitlistBadge: '候补',
    waitlistSection: '候补名单',
    confirmedSection: '已确认参加',
    cancelLink: '取消报名',
    cancelTitle: '取消报名',
    cancelNamePh: '您的姓名（报名时填写的）',
    cancelCodePh: '4位取消码',
    cancelBtn: '确认取消',
    cancelSubmitting: '取消中...',
    cancelSuccess: '取消成功。',
    cancelPartial: (n, r) => `已取消${n}人份。剩余${r}人份仍有效。`,
    cancelError: '取消码不正确。如忘记取消码，请联系主办方。',
    cancelPolicy: `※如忘记取消码，请联系主办方（微信ID：${WECHAT_ID}）。擅自爽约原则上禁止，可能产生费用。`,
    cancelRules: [
      '【取消规则】请提前 24小时 以上取消报名。',
      '若在24小时内取消：',
      '1️⃣ 有人补位 → 如有候补顺次上位，或您自行找友人替补，则无需扣费',
      '2️⃣ 无人补位 → 若最终无人补位导致空缺，需按正常标准扣费 ⚠️',
      '（※ 自行找人替补不受候补顺序限制，但请提前私聊告知）',
    ],
    successTitle: '报名成功！',
    successWaitlist: '已加入候补名单！有空位时将联系您。',
    successCodeLabel: '取消码：',
    successNote: '取消报名时需要此码。请截图保存。',
    submitting: '提交中...',
    backLink: '返回报名页面',
    notFound: '未找到该活动。',
    cancelled: '该活动已取消。',
    price: (p) => `¥${p.toLocaleString()} / 人`,
    memberBanner: '💳 充值会员专享',
    memberBannerNote: '已预充值的会员请点击「充值会员」按钮报名。费用将自动从余额中扣除。',
    memberNote: '※已充值会员请选此项',
    fullNote: '报名已满。您可以加入候补名单。',
    waitlistSubmitNormal: '候补报名（普通）',
    waitlistSubmitMember: '候补报名（会员）',
    personUnit: '名',
    closed: '已截止',
    closedNote: '活动开始后报名已自动关闭',
    receiving: '报名中',
    participants: '参加人数',
    payment: '支付方式',
    share: '分享',
    copyUrl: '复制链接',
    shareCancel: '取消',
    deadline: '报名已截止',
    deadlineLabel: '距截止还有',
    nameError: '请输入姓名',
    submitError: '报名失败，请重试。',
    cancelNameCodeError: '请输入姓名和取消码',
  },
  ko: {
    memberBadge: '충전 회원',
    normalBadge: '일반',
    submitMember: '충전 회원으로 신청',
    submitNormal: '지금 신청하기',
    namePlaceholder: '이름',
    full: '마감',
    remaining: (n) => `잔여 ${n}자리`,
    used: (u, c) => `${u}/${c}명`,
    waitlistBadge: '대기',
    waitlistSection: '대기 명단',
    confirmedSection: '참가 확정',
    cancelLink: '취소하기',
    cancelTitle: '신청 취소',
    cancelNamePh: '이름（신청 시 입력한 이름）',
    cancelCodePh: '4자리 취소 코드',
    cancelBtn: '취소 확인',
    cancelSubmitting: '취소 중...',
    cancelSuccess: '취소가 완료되었습니다.',
    cancelPartial: (n, r) => `${n}명분을 취소했습니다. 나머지 ${r}명분은 유효합니다.`,
    cancelError: '코드가 올바르지 않습니다. 코드를 잊으셨다면 주최자에게 문의해 주세요.',
    cancelPolicy: `※코드를 잊으셨다면 주최자（WeChat ID：${WECHAT_ID}）에게 문의해 주세요. 무단 취소는 원칙적으로 금지되며 비용이 발생할 수 있습니다.`,
    cancelRules: [
      '【취소 규칙】24시간 전까지 취소해 주세요.',
      '24시간 이내 취소의 경우：',
      '1️⃣ 대기자·대체자 있음 → 대기자가 올라오거나 직접 대체자를 구한 경우 비용 없음',
      '2️⃣ 대기자·대체자 없음 → 공석이 생길 경우 정상 요금이 발생합니다 ⚠️',
      '（※ 직접 대체자를 구할 경우 대기 순서 무관. 단, 사전에 연락 필수）',
    ],
    successTitle: '신청이 완료되었습니다！',
    successWaitlist: '대기자로 등록되었습니다！자리가 나면 연락드리겠습니다.',
    successCodeLabel: '취소 코드：',
    successNote: '이 코드는 취소 시 필요합니다. 스크린샷을 저장해 주세요.',
    submitting: '전송 중...',
    backLink: '신청 페이지로 돌아가기',
    notFound: '이 활동을 찾을 수 없습니다.',
    cancelled: '이 활동은 취소되었습니다.',
    price: (p) => `¥${p.toLocaleString()} / 명`,
    memberBanner: '💳 충전 회원 안내',
    memberBannerNote: '사전 충전 회원은 「충전 회원」 버튼으로 신청해 주세요. 잔액에서 자동으로 차감됩니다.',
    memberNote: '※충전 회원은 여기',
    fullNote: '정원이 찼습니다. 대기자로 신청할 수 있습니다.',
    waitlistSubmitNormal: '대기 신청（일반）',
    waitlistSubmitMember: '대기 신청（충전 회원）',
    personUnit: '명',
    closed: '마감',
    closedNote: '시작 시각이 지나 접수가 마감되었습니다',
    receiving: '접수 중',
    participants: '참가 인원',
    payment: '결제 방법',
    share: '공유',
    copyUrl: 'URL 복사',
    shareCancel: '취소',
    deadline: '접수 마감',
    deadlineLabel: '마감까지',
    nameError: '이름을 입력해 주세요',
    submitError: '신청에 실패했습니다. 다시 시도해 주세요.',
    cancelNameCodeError: '이름과 취소 코드를 입력해 주세요',
  },
};

const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));

const SUFFIXES = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const expandEntries = (entries: ActivityEntry[]) => {
  const totals: Record<string, number> = {};
  entries.forEach(e => { totals[e.name] = (totals[e.name] || 0) + e.quantity; });

  const counters: Record<string, number> = {};
  return entries.flatMap(e => {
    const total = totals[e.name];
    return Array.from({ length: e.quantity }, () => {
      counters[e.name] = (counters[e.name] || 0) + 1;
      const n = counters[e.name];
      return {
        ...e,
        displayName: total > 1 ? `${e.name}${SUFFIXES[n - 1] ?? n}` : e.name,
      };
    });
  });
};

const CopyListButton = ({ activity, entries, lang }: { activity: Activity; entries: ActivityEntry[]; lang: Lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const confirmed = entries.filter(e => e.status === 'confirmed');
    const waitlist = entries.filter(e => e.status === 'waitlist');
    const suffixes = ['①', '②', '③'];

    const expand = (list: ActivityEntry[]) =>
      list.flatMap(e =>
        Array.from({ length: e.quantity }, (_, i) => ({
          name: e.quantity > 1 ? `${e.name}${suffixes[i] ?? i + 1}` : e.name,
          notes: [e.member_type === 'member' ? 'チャージ済み' : '', e.notes || ''].filter(Boolean).join(' '),
        }))
      );

    const confirmedRows = expand(confirmed);
    const waitlistRows = expand(waitlist);

    const header = `【${activity.title}】`;
    const lines = confirmedRows.map((r, i) => `【${i + 1}】姓名: ${r.name}; 备注: ${r.notes}`).join('\n');
    const waitlistLabel = lang === 'ko' ? '--- 대기 ---' : lang === 'ja' ? '--- 補欠 ---' : '--- 候补 ---';
    const waitlistLines = waitlistRows.length
      ? '\n' + waitlistLabel + '\n' +
        waitlistRows.map((r, i) => `[候补${i + 1}] 姓名: ${r.name}; 备注: ${r.notes}`).join('\n')
      : '';

    navigator.clipboard.writeText(`${header}\n${lines}${waitlistLines}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const label = lang === 'ko'
    ? '참가자 명단 복사（WeChat용）'
    : lang === 'ja'
      ? '参加者リストをコピー（WeChat用）'
      : '复制参与者名单（微信用）';

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-600 transition-colors mb-2 mx-auto"
    >
      {copied ? '✅ コピーしました！' : `📋 ${label}`}
    </button>
  );
};

const VENUE_IMAGES: Record<string, string> = {
  '芝園公民館': '/venues/shibaen-kouminkan.jpg',
  '蕨市民体育館': '/venues/warabi-taiikukan.jpg',
};

const getDeadline = (date: string, startTime: string): Date => {
  const dt = new Date(`${date}T${startTime}`);
  dt.setHours(dt.getHours() + 1);
  return dt;
};

const isExpiredActivity = (date: string, startTime: string): boolean =>
  new Date() > getDeadline(date, startTime);

const useCountdown = (deadline: Date | null) => {
  const [label, setLabel] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const diff = deadline.getTime() - Date.now();
      if (diff <= 0) { setExpired(true); setLabel(''); return; }
      const totalH = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const d = Math.floor(totalH / 24);
      const remH = totalH % 24;
      if (d > 0) {
        setLabel(`${d}日${remH}時間${m}分${s}秒`);
      } else if (remH > 0) {
        setLabel(`${remH}時間${m}分${s}秒`);
      } else {
        setLabel(`${m}分${s}秒`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return { label, expired };
};

const formatDate = (dateStr: string, lang: Lang) => {
  const d = new Date(dateStr);
  if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`;
  if (lang === 'ko') {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  }
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
};

// グループをslugで取得するフック（RPC経由でRLS問題を回避）
const useGroup = (groupSlug: string) => {
  const [group, setGroup] = useState<Group | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    // get_group_id RPCでIDを取得し、その後グループ情報をRPCで取得
    supabase
      .rpc('get_group_info', { group_slug: groupSlug })
      .single()
      .then(({ data }) => {
        if (data) {
          setGroup(data as Group);
          setGroupId((data as Group).id);
        }
      });
  }, [groupSlug]);

  return { group, groupId };
};

// ── 単一活動ページ ─────────────────────────────────────────
export const ActivityPage = ({ lang: langProp, groupSlug = 'kawaguchi-warabi', forceLang }: { lang?: Lang; groupSlug?: string; forceLang?: Lang }) => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { lang: ctxLang } = useLanguage();
  const lang = forceLang ?? langProp ?? ctxLang;
  const t = T[lang];
  const formRef = useRef<HTMLDivElement>(null);
  const [shareToast, setShareToast] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);

  const { group } = useGroup(groupSlug);

  const source = (() => {
    const p = searchParams.get('from') || 'web';
    return ['line', 'wechat', 'web'].includes(p) ? (p as 'line' | 'wechat' | 'web') : 'web';
  })();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);

  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [entryNotes, setEntryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState('');
  const [successIsWaitlist, setSuccessIsWaitlist] = useState(false);
  const [formError, setFormError] = useState('');

  const [cancelName, setCancelName] = useState('');
  const [cancelCode, setCancelCode] = useState('');
  const [cancelQty, setCancelQty] = useState(1);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelMsg, setCancelMsg] = useState('');
  const [cancelError, setCancelError] = useState('');

  const confirmedEntries = entries.filter(e => e.status === 'confirmed');
  const waitlistEntries = entries.filter(e => e.status === 'waitlist');
  const confirmedCount = confirmedEntries.reduce((s, e) => s + e.quantity, 0);
  const remaining = activity ? Math.max(0, activity.capacity - confirmedCount) : 0;
  const isFull = remaining <= 0;

  const deadline = activity ? getDeadline(activity.date, activity.start_time) : null;
  const { label: countdownLabel, expired: autoExpired } = useCountdown(deadline);
  const isClosed = activity?.status === 'closed' || autoExpired;

  const handleShare = () => setShowShareModal(true);
  const origin = window.location.origin;

  const basePath = groupSlug === 'kawaguchi-warabi' ? '' : `/${groupSlug}`;

  const handleCopyLine = async () => {
    if (!activity) return;
    const lineUrl = `${origin}${basePath}/activity/${id}?from=line`;
    const d = new Date(activity.date);
    const days = ['日','月','火','水','木','金','土'];
    const dateStr = `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`;
    const text = [
      `📅 ${dateStr} ${activity.start_time.slice(0,5)}〜${activity.end_time.slice(0,5)}`,
      `📍 ${activity.location}`,
      `💴 ¥${activity.price.toLocaleString()} / 人`,
      '',
      '▶ 申し込みはこちら',
      lineUrl,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setShareToast(lang === 'ko' ? '✅ LINE 공유 텍스트를 복사했습니다' : '✅ LINEシェア用テキストをコピーしました');
    setTimeout(() => setShareToast(''), 2500);
    setShowShareModal(false);
  };

  const handleCopyWeChat = async () => {
    if (!activity) return;
    const cnPath = groupSlug === 'kawaguchi-warabi' ? '/activity-cn' : `/${groupSlug}/activity-cn`;
    const wechatUrl = `${origin}${cnPath}/${id}?from=wechat`;
    const d = new Date(activity.date);
    const zhDays = ['日','一','二','三','四','五','六'];
    const dateStr = `${d.getMonth()+1}月${d.getDate()}日（周${zhDays[d.getDay()]}）`;
    const text = [
      `📅 ${dateStr} ${activity.start_time.slice(0,5)}〜${activity.end_time.slice(0,5)}`,
      `📍 ${activity.location}`,
      `💴 ¥${activity.price.toLocaleString()} / 人`,
      '',
      '▶ 点击报名',
      wechatUrl,
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setShareToast('✅ 已复制微信分享文字');
    setTimeout(() => setShareToast(''), 2500);
    setShowShareModal(false);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareToast(t.copyUrl + ' ✅');
    setTimeout(() => setShareToast(''), 2500);
    setShowShareModal(false);
  };

  const fetchActivity = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('activities').select('*').eq('id', id).single();
    if (data) setActivity(data);
  }, [id]);

  const fetchEntries = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('activity_id', id)
      .order('created_at', { ascending: true });
    if (data) setEntries(data);
  }, [id]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchActivity(), fetchEntries()]);
      setLoading(false);
    })();
  }, [fetchActivity, fetchEntries]);

  useEffect(() => {
    if (!id) return;
    supabase.rpc('increment_activity_view', { activity_id: id })
      .then(({ error }) => { if (error) console.error('increment_activity_view error:', error); });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`activity_${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'activity_entries',
        filter: `activity_id=eq.${id}`,
      }, fetchEntries)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchEntries]);

  const handleSubmit = async (memberType: 'member' | 'normal') => {
    const submitName = name.trim();
    if (!submitName) {
      setFormError(t.nameError);
      return;
    }
    setFormError('');
    setSubmitting(true);
    const code = generateCode();
    const cap = activity?.capacity ?? 0;
    const confirmedQty = Math.min(qty, Math.max(0, cap - confirmedCount));
    const waitlistQty = qty - confirmedQty;
    const base = { activity_id: id, name: submitName, member_type: memberType, source, cancel_code: code, notes: entryNotes.trim() };

    const results: { error: unknown }[] = [];
    if (confirmedQty > 0) results.push(await supabase.from('activity_entries').insert({ ...base, quantity: confirmedQty, status: 'confirmed' }));
    if (waitlistQty > 0) results.push(await supabase.from('activity_entries').insert({ ...base, quantity: waitlistQty, status: 'waitlist' }));

    setSubmitting(false);
    const anyError = results.some(r => r.error);
    if (anyError) {
      setFormError(t.submitError);
    } else {
      setSuccessCode(code);
      setSuccessIsWaitlist(confirmedQty === 0);
      setEntryNotes('');
      setName('');
      setQty(1);
      fetchEntries();
    }
  };

  const handleCancel = async () => {
    if (!cancelName.trim() || !cancelCode.trim()) {
      setCancelError(t.cancelNameCodeError);
      return;
    }
    setCancelSubmitting(true);
    setCancelError('');
    setCancelMsg('');

    const { data: rows } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('activity_id', id)
      .eq('name', cancelName.trim())
      .eq('cancel_code', cancelCode.trim())
      .order('status', { ascending: false });

    if (!rows || rows.length === 0) {
      setCancelError(t.cancelError);
      setCancelSubmitting(false);
      return;
    }

    let remaining = cancelQty;
    for (const row of rows) {
      if (remaining <= 0) break;
      const toRemove = Math.min(remaining, row.quantity);
      remaining -= toRemove;
      if (toRemove >= row.quantity) {
        await supabase.from('activity_entries').delete().eq('id', row.id);
      } else {
        await supabase.from('activity_entries').update({ quantity: row.quantity - toRemove }).eq('id', row.id);
      }
    }

    const totalQty = rows.reduce((s: number, r: ActivityEntry) => s + r.quantity, 0);
    const leftQty = totalQty - cancelQty;
    setCancelMsg(leftQty <= 0 ? t.cancelSuccess : t.cancelPartial(cancelQty, leftQty));
    setCancelSubmitting(false);
    setCancelName(''); setCancelCode(''); setCancelQty(1);
    fetchEntries();
  };

  const enableMemberCharge = group?.enable_member_charge ?? false;

  // 言語切り替えUI（chaoxianzuは3言語、それ以外は2言語）
  const LangSwitcher = () => {
    const { groupSlug: gs } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const switchLang = (l: Lang) => {
      const parts = location.pathname.split('/').filter(Boolean);
      if (gs === 'chaoxianzu') { parts[1] = l; } else { parts[0] = l; }
      navigate('/' + parts.join('/'));
    };

    if (groupSlug === 'chaoxianzu') {
      return (
        <div className="flex gap-1 text-xs">
          {(['ja', 'zh', 'ko'] as Lang[]).map(l => (
            <button key={l} onClick={() => switchLang(l)}
              className={`px-2 py-0.5 rounded-full border transition-colors ${lang === l ? 'bg-white text-green-700 border-white font-bold' : 'text-white/80 border-white/40 hover:border-white'}`}>
              {l === 'ja' ? '日本語' : l === 'zh' ? '中文' : '한국어'}
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="flex gap-1 text-xs">
        {(['ja', 'zh'] as Lang[]).map(l => (
          <button key={l} onClick={() => switchLang(l)}
            className={`px-2 py-0.5 rounded-full border transition-colors ${lang === l ? 'bg-white text-green-700 border-white font-bold' : 'text-white/80 border-white/40 hover:border-white'}`}>
            {l === 'ja' ? '日本語' : '中文'}
          </button>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!activity) return (
    <main className="max-w-lg mx-auto px-4 py-12 text-center text-gray-500">{t.notFound}</main>
  );

  if (activity.status === 'cancelled') return (
    <main className="max-w-lg mx-auto px-4 py-12 text-center text-gray-500">{t.cancelled}</main>
  );

  const notesPlaceholder = lang === 'ko'
    ? '비고（선택）예：처음 참가합니다.'
    : lang === 'zh'
      ? '备注（选填）例：我是第一次参加。'
      : '備考（任意）例：初参加です。';

  return (
    <main className="max-w-lg mx-auto px-4 pb-28 pt-0">
      {shareToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-xs px-4 py-2 rounded-xl shadow-lg whitespace-nowrap">
          {shareToast}
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowShareModal(false)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base mb-4 text-center">{t.share}</h3>
            <div className="space-y-2.5">
              <button onClick={handleCopyLine}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#06C755] text-white hover:opacity-90 transition-opacity">
                <img src="/icons/line.png" alt="LINE" className="w-9 h-9 flex-shrink-0 rounded-xl" />
                <span className="font-bold text-base">LINE{lang === 'ko' ? '으로 공유' : 'でシェア'}</span>
              </button>
              <button onClick={handleCopyWeChat}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-[#07C160] text-white hover:opacity-90 transition-opacity">
                <svg viewBox="0 0 40 40" className="w-9 h-9 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="10" fill="white" fillOpacity="0.2"/>
                  <path d="M17.5 9C11.1 9 6 13.2 6 18.4c0 2.9 1.6 5.5 4.2 7.2l-1 3.4 3.8-1.9c1.1.3 2.3.5 3.5.5 6.4 0 11.5-4.2 11.5-9.4S23.9 9 17.5 9z" fill="white"/>
                  <path d="M34 23.5c0-4.4-4.4-8-9.8-8-.3 0-.6 0-.9.1 1.1 1.4 1.7 3 1.7 4.8 0 4.7-4.5 8.5-10 8.5-.5 0-1 0-1.5-.1C15.3 31 18 32.5 21 32.5c1 0 2-.2 3-.4l3.3 1.7-.9-3c2.2-1.5 3.6-3.7 3.6-6.3z" fill="white" fillOpacity="0.85"/>
                  <circle cx="14.5" cy="18" r="1.3" fill="#07C160"/>
                  <circle cx="19.5" cy="18" r="1.3" fill="#07C160"/>
                </svg>
                <span className="font-bold text-base">WeChat{lang === 'ko' ? '으로 공유' : 'でシェア'}</span>
              </button>
              <button onClick={handleCopyUrl}
                className="flex items-center gap-4 w-full px-5 py-3.5 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <svg viewBox="0 0 36 36" className="w-9 h-9 flex-shrink-0" fill="none">
                  <rect width="36" height="36" rx="9" fill="#e5e7eb"/>
                  <path d="M15 21a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M21 15a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" stroke="#6b7280" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span className="font-medium text-base">{t.copyUrl}</span>
              </button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600">
              {t.shareCancel}
            </button>
          </div>
        </div>
      )}

      {/* ヘッダーカード */}
      <div className="text-white px-5 pt-6 pb-5 -mx-4 mb-4"
        style={{ background: 'linear-gradient(160deg, #4ade80 0%, #22c55e 30%, #16a34a 70%, #15803d 100%)' }}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <LangSwitcher />
          <button onClick={handleShare} className="flex-shrink-0 bg-white/20 hover:bg-white/30 rounded-xl p-2 transition-colors" title={t.share}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
        <h1 className="text-xl font-bold leading-snug" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>{activity.title}</h1>
        <div className="mt-3 space-y-1.5 text-green-50 text-sm">
          <p>📅 {formatDate(activity.date, lang)}　{activity.start_time.slice(0,5)}〜{activity.end_time.slice(0,5)}</p>
          <p>📍 {activity.location}</p>
          {activity.address && <p className="text-green-100 text-xs">{activity.address}</p>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-2xl font-extrabold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>{t.price(activity.price)}</span>
          {isClosed
            ? <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg">{t.closed}</span>
            : isFull
              ? <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-lg">{t.full}</span>
              : <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(255,120,0,0.9)', color: '#fff' }}>{t.receiving}</span>
          }
        </div>
      </div>

      {/* 情報行 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 mb-4">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-lg">👥</span>
          <div className="flex-1">
            <p className="text-xs text-gray-400">{t.participants}</p>
            <p className="text-sm font-bold text-gray-800">{t.used(confirmedCount, activity.capacity)}{waitlistEntries.length > 0 ? `　${lang === 'ko' ? `대기 ${waitlistEntries.reduce((s,e)=>s+e.quantity,0)}명` : lang === 'ja' ? `補欠${waitlistEntries.reduce((s,e)=>s+e.quantity,0)}人` : `候补${waitlistEntries.reduce((s,e)=>s+e.quantity,0)}名`}` : ''}</p>
          </div>
          <div className="w-20">
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(100, (confirmedCount / activity.capacity) * 100)}%` }} />
            </div>
            <p className={`text-xs mt-0.5 text-right ${isFull ? 'text-red-500' : 'text-emerald-600'}`}>
              {isFull ? t.full : t.remaining(remaining)}
            </p>
          </div>
        </div>
        {activity.notes && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">{t.payment}</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.notes}</p>
          </div>
        )}
      </div>

      {/* 参加確定リスト */}
      {confirmedEntries.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-emerald-200 mb-3">
          <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'linear-gradient(90deg, #16a34a, #15803d)' }}>
            <span className="text-white text-xs font-bold tracking-wide">✅ {t.confirmedSection}</span>
            <span className="ml-auto text-green-200 text-xs">{confirmedCount}/{activity.capacity}{t.personUnit}</span>
          </div>
          <div className="bg-emerald-50 px-4 py-2.5 space-y-1">
            {expandEntries(confirmedEntries).map((e, i) => (
              <p key={`conf-${e.id}-${i}`} className="text-sm text-gray-700 flex items-center gap-1.5">
                <span className="text-emerald-500 w-5 text-right flex-shrink-0 font-bold">{i + 1}.</span>
                <span className="font-medium">{e.displayName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  e.member_type === 'member'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {e.member_type === 'member' ? t.memberBadge : t.normalBadge}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 補欠リスト */}
      {waitlistEntries.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-yellow-300 mb-3">
          <div className="bg-yellow-400 px-4 py-2 flex items-center gap-2">
            <span className="text-yellow-900 text-xs font-bold tracking-wide">⏳ {t.waitlistSection}</span>
            <span className="ml-auto text-yellow-800 text-xs">{waitlistEntries.reduce((s,e)=>s+e.quantity,0)}{t.personUnit}</span>
          </div>
          <div className="bg-yellow-50 px-4 py-2.5 space-y-1">
            {expandEntries(waitlistEntries).map((e, i) => (
              <p key={`wl-${e.id}-${i}`} className="text-sm text-gray-700 flex items-center gap-1.5">
                <span className="text-yellow-600 w-12 text-right flex-shrink-0 text-xs font-bold">{t.waitlistBadge}{i + 1}.</span>
                <span className="font-medium">{e.displayName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  e.member_type === 'member'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {e.member_type === 'member' ? t.memberBadge : t.normalBadge}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <CopyListButton activity={activity} entries={entries} lang={lang} />
      )}

      {successCode && (
        <div className={`border rounded-xl p-4 mb-4 ${successIsWaitlist ? 'bg-yellow-50 border-yellow-300' : 'bg-green-50 border-green-200'}`}>
          <p className={`font-bold text-sm mb-1 ${successIsWaitlist ? 'text-yellow-800' : 'text-green-800'}`}>
            {successIsWaitlist ? t.successWaitlist : t.successTitle}
          </p>
          <p className={`text-sm ${successIsWaitlist ? 'text-yellow-700' : 'text-green-700'}`}>
            {t.successCodeLabel}
            <span className="font-bold text-xl tracking-[0.2em] ml-1">{successCode}</span>
          </p>
          <p className={`text-xs mt-1.5 ${successIsWaitlist ? 'text-yellow-600' : 'text-green-600'}`}>
            {t.successNote}
          </p>
        </div>
      )}

      {!showCancel ? (
        <div ref={formRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {isClosed ? (
            <div className="text-center py-6">
              <p className="text-3xl mb-2">🔒</p>
              <p className="font-bold text-gray-700">{t.deadline}</p>
              <p className="text-sm text-gray-400 mt-1">{t.closedNote}</p>
            </div>
          ) : (
          <>
          {enableMemberCharge && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-bold text-green-800">{t.memberBanner}</p>
              <p className="text-xs text-green-700 mt-0.5">{t.memberBannerNote}</p>
            </div>
          )}

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={qty}
            onChange={e => setQty(Number(e.target.value))}
            disabled={activity.status === 'closed'}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {[1, 2, 3].map(n => <option key={n} value={n}>{n}{t.personUnit}</option>)}
          </select>

          <textarea
            value={entryNotes}
            onChange={e => setEntryNotes(e.target.value)}
            placeholder={notesPlaceholder}
            rows={2}
            disabled={activity.status === 'closed'}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:bg-gray-50"
          />

          {formError && <p className="text-red-500 text-xs mb-3">{formError}</p>}

          {isFull && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3 text-sm text-yellow-800 font-medium">
              {t.fullNote}
            </div>
          )}

          <div className="flex flex-col gap-3 mt-2">
            {/* 通常申し込みボタン */}
            <button
              onClick={() => handleSubmit('normal')}
              disabled={submitting}
              className="w-full py-4 rounded-2xl font-bold text-base text-white active:scale-[0.98] transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(160deg, #6ee7b7 0%, #10b981 30%, #059669 70%, #047857 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 20px rgba(5,150,105,0.45)',
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              <span className="flex items-center justify-center gap-2 text-lg tracking-wide">
                <span>🏸</span>
                <span>{submitting ? t.submitting : isFull ? t.waitlistSubmitNormal : t.submitNormal}</span>
              </span>
            </button>

            {/* チャージ会員ボタン（enable_member_charge=trueのグループのみ） */}
            {enableMemberCharge && (
              <button
                onClick={() => handleSubmit('member')}
                disabled={submitting}
                className="w-full relative overflow-hidden py-4 rounded-2xl font-bold text-base active:scale-[0.98] transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(160deg, #fef08a 0%, #fbbf24 25%, #f59e0b 55%, #d97706 80%, #92400e 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 20px rgba(217,119,6,0.5)',
                  color: '#431407',
                  textShadow: '0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2 text-lg tracking-wide">
                  <span>💳</span>
                  <span>{submitting ? t.submitting : isFull ? t.waitlistSubmitMember : t.submitMember}</span>
                </span>
                <span className="absolute bottom-1 right-3 text-[10px] font-normal opacity-60">{t.memberNote}</span>
              </button>
            )}
          </div>

          <button onClick={() => setShowCancel(true)} className="w-full text-center text-sm text-gray-400 mt-4 underline">
            {t.cancelLink}
          </button>
          </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 mb-4">{t.cancelTitle}</h2>
          <input
            type="text"
            value={cancelName}
            onChange={e => setCancelName(e.target.value)}
            placeholder={t.cancelNamePh}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="text"
            value={cancelCode}
            onChange={e => setCancelCode(e.target.value)}
            placeholder={t.cancelCodePh}
            maxLength={4}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={cancelQty}
            onChange={e => setCancelQty(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {[1, 2, 3].map(n => <option key={n} value={n}>{n}{t.personUnit}</option>)}
          </select>

          {cancelError && <p className="text-red-500 text-sm mb-3">{cancelError}</p>}
          {cancelMsg && <p className="text-green-600 text-sm mb-3">{cancelMsg}</p>}

          <button
            onClick={handleCancel}
            disabled={cancelSubmitting}
            className="w-full bg-gray-700 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 mb-4"
          >
            {cancelSubmitting ? t.cancelSubmitting : t.cancelBtn}
          </button>

          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 space-y-1.5">
            {t.cancelRules.map((rule, i) => (
              <p key={i} className={i === 0 ? 'font-semibold text-gray-700' : ''}>{rule}</p>
            ))}
            <p className="pt-2 border-t border-gray-200">{t.cancelPolicy}</p>
          </div>

          <button
            onClick={() => { setShowCancel(false); setCancelError(''); setCancelMsg(''); }}
            className="w-full text-center text-sm text-gray-400 mt-3 underline"
          >
            {t.backLink}
          </button>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {isClosed ? (
              <p className="text-xs font-bold text-red-500">{t.deadline}</p>
            ) : countdownLabel ? (
              <>
                <p className="text-[10px] text-gray-400">{t.deadlineLabel}</p>
                <p className="text-sm font-bold text-red-500 tabular-nums">{countdownLabel}</p>
              </>
            ) : null}
          </div>
          <button
            onClick={handleShare}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold transition-colors"
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {t.share}
          </button>
        </div>
      </div>
    </main>
  );
};

// ── 活動カレンダー ─────────────────────────────────────────────
const ActivityCalendar = ({ activities, selectedDate, onSelect, lang }: {
  activities: Activity[];
  selectedDate: string | null;
  onSelect: (d: string | null) => void;
  lang: Lang;
}) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const toStr = (day: number) => `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const byDate: Record<string, true> = {};
  activities.forEach(a => { byDate[a.date] = true; });

  const dayNames = lang === 'ko'
    ? ['일', '월', '화', '수', '목', '금', '토']
    : ['日', '月', '火', '水', '木', '金', '土'];

  const thisMonth = lang === 'ko' ? '이번 달' : '今月';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={() => month === 0 ? (setMonth(11), setYear(y=>y-1)) : setMonth(m=>m-1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold">‹</button>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-gray-900 text-sm">{year}年 {month+1}月</span>
          {(year !== today.getFullYear() || month !== today.getMonth()) && (
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
              className="text-xs text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-full font-medium">{thisMonth}</button>
          )}
        </div>
        <button onClick={() => month === 11 ? (setMonth(0), setYear(y=>y+1)) : setMonth(m=>m+1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold">›</button>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map((d, i) => (
            <div key={d} className={`text-center text-xs font-bold py-1 ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-400'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({length: firstDow}).map((_,i) => <div key={`e${i}`} />)}
          {Array.from({length: daysInMonth}).map((_,i) => {
            const day = i+1;
            const ds = toStr(day);
            const hasActivity = byDate[ds];
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const dow = new Date(year, month, day).getDay();
            return (
              <div key={day} onClick={() => hasActivity && onSelect(isSelected ? null : ds)}
                className={`rounded-lg flex flex-col items-center py-1 px-0.5 min-h-[40px] transition-colors ${
                  hasActivity ? 'cursor-pointer' : 'cursor-default'
                } ${isSelected ? 'bg-emerald-500 text-white' :
                   isToday ? 'bg-emerald-50 border border-emerald-300' : 'hover:bg-gray-50'}`}
              >
                <span className={`text-xs font-semibold mb-0.5 ${
                  isSelected ? 'text-white' :
                  dow===0 ? 'text-red-500' : dow===6 ? 'text-blue-500' : 'text-gray-700'
                }`}>{day}</span>
                {hasActivity && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const LIST_T: Record<Lang, {
  title: string;
  empty: string;
  emptyDate: string;
  clearFilter: string;
  price: (p: number) => string;
  detailLink: (id: string, groupSlug: string) => string;
}> = {
  ja: {
    title: '通常活動',
    empty: '現在受付中の活動はありません',
    emptyDate: 'この日の活動はありません',
    clearFilter: '✕ 絞り込み解除',
    price: (p) => `¥${p.toLocaleString()} / 人`,
    detailLink: (id, groupSlug) => groupSlug === 'kawaguchi-warabi' ? `/activity/${id}` : `/${groupSlug}/activity/${id}`,
  },
  zh: {
    title: '日常活动',
    empty: '目前没有活动',
    emptyDate: '当天没有活动',
    clearFilter: '✕ 取消筛选',
    price: (p) => `¥${p.toLocaleString()} / 人`,
    detailLink: (id, groupSlug) => groupSlug === 'kawaguchi-warabi' ? `/activity-cn/${id}?from=wechat` : `/${groupSlug}/activity-cn/${id}?from=wechat`,
  },
  ko: {
    title: '배드민턴 모임',
    empty: '현재 접수 중인 모임이 없습니다',
    emptyDate: '이 날의 모임이 없습니다',
    clearFilter: '✕ 필터 해제',
    price: (p) => `¥${p.toLocaleString()} / 명`,
    detailLink: (id, groupSlug) => `/${groupSlug}/activity-kr/${id}`,
  },
};

// ── 活動一覧ページ ─────────────────────────────────────────────
const ActivityListBase = ({ lang = 'ja', groupSlug = 'kawaguchi-warabi', forceLang }: { lang?: Lang; groupSlug?: string; forceLang?: Lang }) => {
  const effectiveLang = forceLang ?? lang;
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { group, groupId } = useGroup(groupSlug);
  const t = LIST_T[effectiveLang];

  useEffect(() => {
    if (!groupId) return;
    supabase
      .from('activities')
      .select('*')
      .eq('group_id', groupId)
      .neq('status', 'cancelled')
      .is('archived_at', null)
      .order('date', { ascending: true })
      .then(({ data }) => { if (data) setActivities(data); setLoading(false); });
  }, [groupId]);

  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})`; };

  const activeActivities = activities.filter(a => !isExpiredActivity(a.date, a.start_time));
  const displayed = selectedDate ? activeActivities.filter(a => a.date === selectedDate) : activeActivities;

  if (loading || !group) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );

  const activityMeta = effectiveLang === 'zh'
    ? { title: '常规活动列表 | 川口・蕨羽毛球交流会', description: '在川口市・蕨市公民馆举办的羽毛球常规活动列表。参加费600日元起。' }
    : { title: '通常活動 一覧 | 川口・蕨バドミントン交流会', description: '川口市・蕨市の公民館で開催するバドミントン通常活動の一覧。芝園公民館・幸栄公民館など。参加費600円〜。' };

  return (
    <>
      <Helmet>
        <title>{activityMeta.title}</title>
        <meta name="description" content={activityMeta.description} />
        <meta property="og:title" content={activityMeta.title} />
        <meta property="og:description" content={activityMeta.description} />
        <meta property="og:url" content={`https://kawabado.com/${effectiveLang}/activity`} />
        <meta property="og:locale" content={effectiveLang === 'zh' ? 'zh_CN' : 'ja_JP'} />
        <link rel="canonical" href={`https://kawabado.com/${effectiveLang}/activity`} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/activity" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/activity" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/activity" />
      </Helmet>
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.title}</h1>
      {groupSlug !== 'kawaguchi-warabi' && (
        <p className="text-sm text-gray-500 mb-4">{group.name}</p>
      )}

      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 lg:items-start">
        <div className="lg:sticky lg:top-6 mb-4 lg:mb-0">
          <ActivityCalendar
            activities={activeActivities}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            lang={effectiveLang}
          />
          {selectedDate && (
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-sm font-medium text-gray-600">{fmt(selectedDate)} の活動</p>
              <button onClick={() => setSelectedDate(null)} className="text-xs text-emerald-600 hover:underline">
                {t.clearFilter}
              </button>
            </div>
          )}
        </div>

        <div>
          {displayed.length === 0 ? (
            <p className="text-center py-12 text-gray-400">
              {selectedDate ? t.emptyDate : t.empty}
            </p>
          ) : (
            <div className="space-y-3">
              {displayed.map(a => {
                const venueImg = VENUE_IMAGES[a.location] ?? null;
                return (
                  <Link
                    key={a.id}
                    to={t.detailLink(a.id, groupSlug)}
                    className="block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {venueImg ? (
                      <div className="h-32 overflow-hidden">
                        <img src={venueImg} alt={a.location} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-16 bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
                        <span className="text-white text-2xl">🏸</span>
                      </div>
                    )}
                    <div className="p-4">
                      <p className="font-bold text-gray-900">{a.title}</p>
                      {a.address && <p className="text-xs text-gray-400 mt-0.5">📍 {a.address}</p>}
                      <p className="text-emerald-600 font-bold mt-1">{t.price(a.price)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
};

export const ActivityListPage = ({ groupSlug = 'kawaguchi-warabi', forceLang }: { groupSlug?: string; forceLang?: Lang }) => {
  const { lang } = useLanguage();
  return <ActivityListBase lang={forceLang ?? lang} groupSlug={groupSlug} />;
};
export const ActivityListPageCN = ({ groupSlug = 'kawaguchi-warabi' }: { groupSlug?: string }) =>
  <ActivityListBase lang="zh" groupSlug={groupSlug} />;

export default ActivityPage;
