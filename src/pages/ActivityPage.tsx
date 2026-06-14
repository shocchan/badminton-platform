import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

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
  created_at: string;
}

const WECHAT_ID = 'Shocchance';

const T = {
  ja: {
    memberBadge: 'チャージ済み',
    normalBadge: '通常',
    submitMember: '申し込む（チャージ済み会員）',
    submitNormal: '申し込む（通常）',
    namePlaceholder: 'お名前',
    full: '満員',
    remaining: (n: number) => `残り${n}枠`,
    used: (u: number, c: number) => `${u}/${c}人`,
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
    cancelPartial: (n: number, r: number) => `${n}人分をキャンセルしました。残り${r}人分は有効です。`,
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
    price: (p: number) => `¥${p.toLocaleString()} / 人`,
    memberBanner: '💳 チャージ済み会員の方へ',
    memberBannerNote: '事前チャージ済みの方は「チャージ済み会員」ボタンでお申し込みください。残高から自動で引き落とされます。',
    memberNote: '※チャージ済みの方はこちら',
    fullNote: '定員に達しています。補欠として申し込むことができます。',
    waitlistSubmitNormal: '補欠で申し込む（通常）',
    waitlistSubmitMember: '補欠で申し込む（チャージ済み）',
    personUnit: '人',
  },
  zh: {
    memberBadge: '充值会员',
    normalBadge: '普通',
    submitMember: '报名（充值会员）',
    submitNormal: '报名（普通）',
    namePlaceholder: '您的姓名',
    full: '已满',
    remaining: (n: number) => `剩余${n}名`,
    used: (u: number, c: number) => `${u}/${c}人`,
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
    cancelPartial: (n: number, r: number) => `已取消${n}人份。剩余${r}人份仍有效。`,
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
    price: (p: number) => `¥${p.toLocaleString()} / 人`,
    memberBanner: '💳 充值会员专享',
    memberBannerNote: '已预充值的会员请点击「充值会员」按钮报名。费用将自动从余额中扣除。',
    memberNote: '※已充值会员请选此项',
    fullNote: '报名已满。您可以加入候补名单。',
    waitlistSubmitNormal: '候补报名（普通）',
    waitlistSubmitMember: '候补报名（会员）',
    personUnit: '名',
  },
};

const generateCode = () => String(Math.floor(1000 + Math.random() * 9000));

const expandEntries = (entries: ActivityEntry[]) =>
  entries.flatMap(e => {
    if (e.quantity <= 1) return [{ ...e, displayName: e.name }];
    const suffixes = ['①', '②', '③'];
    return Array.from({ length: e.quantity }, (_, i) => ({
      ...e,
      displayName: `${e.name}${suffixes[i] ?? String(i + 1)}`,
    }));
  });

const formatDate = (dateStr: string, lang: 'ja' | 'zh') => {
  const d = new Date(dateStr);
  if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
};

// ── 単一活動ページ ─────────────────────────────────────────
export const ActivityPage = ({ lang = 'ja' }: { lang?: 'ja' | 'zh' }) => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const t = T[lang];

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
    if (!name.trim()) {
      setFormError(lang === 'ja' ? 'お名前を入力してください' : '请输入姓名');
      return;
    }
    setFormError('');
    setSubmitting(true);
    const code = generateCode();
    const entryStatus = isFull ? 'waitlist' : 'confirmed';
    const { error } = await supabase.from('activity_entries').insert({
      activity_id: id,
      name: name.trim(),
      member_type: memberType,
      source,
      cancel_code: code,
      quantity: qty,
      status: entryStatus,
    });
    setSubmitting(false);
    if (error) {
      setFormError(lang === 'ja' ? '申し込みに失敗しました。もう一度お試しください。' : '报名失败，请重试。');
    } else {
      setSuccessCode(code);
      setSuccessIsWaitlist(entryStatus === 'waitlist');
      setName('');
      setQty(1);
      fetchEntries();
    }
  };

  const handleCancel = async () => {
    if (!cancelName.trim() || !cancelCode.trim()) {
      setCancelError(lang === 'ja' ? 'お名前とキャンセルコードを入力してください' : '请输入姓名和取消码');
      return;
    }
    setCancelSubmitting(true);
    setCancelError('');
    setCancelMsg('');
    const { data } = await supabase
      .from('activity_entries')
      .select('*')
      .eq('activity_id', id)
      .eq('name', cancelName.trim())
      .eq('cancel_code', cancelCode.trim())
      .maybeSingle();
    if (!data) {
      setCancelError(t.cancelError);
      setCancelSubmitting(false);
      return;
    }
    const newQty = data.quantity - cancelQty;
    if (newQty <= 0) {
      await supabase.from('activity_entries').delete().eq('id', data.id);
      setCancelMsg(t.cancelSuccess);
    } else {
      await supabase.from('activity_entries').update({ quantity: newQty }).eq('id', data.id);
      setCancelMsg(t.cancelPartial(cancelQty, newQty));
    }
    setCancelSubmitting(false);
    setCancelName(''); setCancelCode(''); setCancelQty(1);
    fetchEntries();
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

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{activity.title}</h1>
        <p className="text-gray-500 mt-1">
          {formatDate(activity.date, lang)}　{activity.start_time.slice(0, 5)}〜{activity.end_time.slice(0, 5)}
        </p>
        <p className="text-gray-500">{activity.location}</p>
        <p className="text-2xl font-bold text-blue-600 mt-1">{t.price(activity.price)}</p>
        {(activity.address || activity.notes) && (
          <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 space-y-1">
            {activity.address && <p>📍 {activity.address}</p>}
            {activity.notes && <p className="whitespace-pre-wrap">💳 {activity.notes}</p>}
          </div>
        )}
      </div>

      {/* 定員バー */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-blue-400'}`}
            style={{ width: `${Math.min(100, (confirmedCount / activity.capacity) * 100)}%` }}
          />
        </div>
        <span className={`text-sm font-medium flex-shrink-0 ${isFull ? 'text-red-500' : 'text-gray-700'}`}>
          {isFull ? t.full : t.remaining(remaining)}　{t.used(confirmedCount, activity.capacity)}
        </span>
      </div>

      {/* ② 参加確定リスト */}
      {confirmedEntries.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-blue-200 mb-3">
          <div className="bg-blue-600 px-4 py-2 flex items-center gap-2">
            <span className="text-white text-xs font-bold tracking-wide">✅ {t.confirmedSection}</span>
            <span className="ml-auto text-blue-200 text-xs">{confirmedCount}/{activity.capacity}{t.personUnit}</span>
          </div>
          <div className="bg-blue-50 px-4 py-2.5 space-y-1">
            {expandEntries(confirmedEntries).map((e, i) => (
              <p key={`conf-${e.id}-${i}`} className="text-sm text-gray-700 flex items-center gap-1.5">
                <span className="text-blue-400 w-5 text-right flex-shrink-0 font-bold">{i + 1}.</span>
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

      {/* ② 補欠リスト */}
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

      {/* 申し込み完了 */}
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

      {/* メインフォーム / キャンセルフォーム */}
      {!showCancel ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {/* 会員バナー */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-bold text-green-800">{t.memberBanner}</p>
            <p className="text-xs text-green-700 mt-0.5">{t.memberBannerNote}</p>
          </div>

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            disabled={activity.status === 'closed'}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
          />
          <select
            value={qty}
            onChange={e => setQty(Number(e.target.value))}
            disabled={activity.status === 'closed'}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {[1, 2, 3].map(n => <option key={n} value={n}>{n}{t.personUnit}</option>)}
          </select>

          {formError && <p className="text-red-500 text-xs mb-3">{formError}</p>}

          {isFull && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-3 text-sm text-yellow-800 font-medium">
              {t.fullNote}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit('normal')}
              disabled={submitting || activity.status === 'closed'}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:bg-gray-300"
            >
              {submitting ? t.submitting : isFull ? t.waitlistSubmitNormal : t.submitNormal}
            </button>
            <div className="flex-1 flex flex-col gap-1">
              <button
                onClick={() => handleSubmit('member')}
                disabled={submitting || activity.status === 'closed'}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 transition-colors disabled:bg-gray-300"
              >
                {submitting ? t.submitting : isFull ? t.waitlistSubmitMember : t.submitMember}
              </button>
              <p className="text-xs text-green-700 text-center font-medium">{t.memberNote}</p>
            </div>
          </div>

          <button
            onClick={() => setShowCancel(true)}
            className="w-full text-center text-sm text-gray-400 mt-4 underline"
          >
            {t.cancelLink}
          </button>
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

          {/* キャンセルポリシー */}
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
    </main>
  );
};

// ── 活動一覧ページ（管理者がURLをコピーするため） ─────────────
export const ActivityListPage = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('activities')
      .select('*')
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
      .then(({ data }) => { if (data) setActivities(data); setLoading(false); });
  }, []);

  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const fmt = (d: string) => { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}(${days[dt.getDay()]})`; };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">活動一覧</h1>
      {activities.length === 0 ? (
        <p className="text-center py-16 text-gray-400">現在受付中の活動はありません</p>
      ) : (
        <div className="space-y-3">
          {activities.map(a => (
            <Link
              key={a.id}
              to={`/activity/${a.id}`}
              className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
            >
              <p className="font-bold text-gray-900">{a.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{fmt(a.date)}　{a.start_time.slice(0,5)}〜{a.end_time.slice(0,5)}</p>
              <p className="text-sm text-gray-500">{a.location}</p>
              <p className="text-blue-600 font-bold mt-1">¥{a.price.toLocaleString()} / 人</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
};

export default ActivityPage;
