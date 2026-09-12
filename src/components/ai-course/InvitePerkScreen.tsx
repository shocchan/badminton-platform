// 「紹介おめでとう」画面（2026-09-12 CEO決定）。
//
// 自分の招待コードから申し込んだ人が7日間を始めると、ログイン時にこの画面が出て
// 特典を1つ選ぶ。選ぶまでホームの代わりに出す（見逃さない）。あとで選ぶこともできる。
import { useState } from 'react';
import { Gift, Check, Loader2, ExternalLink } from 'lucide-react';
import {
  PERK_OPTIONS, GRAMMAR_DECK_URL, chooseInvitePerk, perkTitle,
  type InvitePerk, type InvitePerkId,
} from '../../lib/aiLesson/course/invitePerks';
import { formatUntilJst } from '../../lib/aiLesson/course/courseAccess';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

export function InvitePerkScreen({ lang, perk, onDone, onLater }: {
  lang: 'ja' | 'zh';
  /** 未選択の権利1件 */
  perk: InvitePerk;
  /** 選び終えた（ホームへ） */
  onDone: () => void;
  /** あとで選ぶ（ホームへ・次回ログイン時にまた出る） */
  onLater: () => void;
}) {
  const zh = lang === 'zh';
  const [picked, setPicked] = useState<InvitePerkId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ perk: InvitePerkId; validUntilISO: string | null } | null>(null);

  const who = perk.inviteeName
    ? (zh ? `${perk.inviteeName} 通过你的链接开始了7天学习。` : `${perk.inviteeName}さんが、あなたのリンクから7日間の学習を始めました。`)
    : (zh ? '有人通过你的链接开始了7天学习。' : 'あなたのリンクから、7日間の学習を始めた人がいます。');

  const confirm = async () => {
    if (!picked || busy) return;
    setBusy(true); setError(null);
    const r = await chooseInvitePerk(perk.id, picked);
    setBusy(false);
    if (!r.ok) {
      setError(r.code === 'no_access'
        ? (zh ? '现在没有可延长的使用期限。请选择其他奖励，或联系老师。' : 'いま延長できる受講期限がありません。ほかの特典を選ぶか、先生にご連絡ください。')
        : (zh ? '暂时无法保存。请稍后再试。' : 'いま保存できませんでした。少し待ってからもう一度お試しください。'));
      return;
    }
    trackCourse('choose_invite_perk', { perk: picked });
    setResult({ perk: picked, validUntilISO: r.validUntilISO });
  };

  if (result) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <div className="rounded-2xl border border-emerald-100 bg-white p-6 text-center shadow-sm" data-testid="invite-perk-done">
          <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mx-auto">
            <Check className="w-7 h-7" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-xl font-extrabold text-gray-900">{perkTitle(result.perk, lang)}</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {result.perk === 'month' && (result.validUntilISO
              ? (zh ? `使用期限已延长到 ${formatUntilJst(result.validUntilISO, 'zh')}。` : `受講期限が ${formatUntilJst(result.validUntilISO, 'ja')} までになりました。`)
              : (zh ? '使用期限已延长30天。' : '受講期限が30日のびました。'))}
            {result.perk === 'mv' && (zh ? '收到了。老师会为你制作，做好后通过微信发给你。' : '承りました。先生がつくって、できあがったらWeChatでお渡しします。')}
            {result.perk === 'grammar' && (zh ? '请从下面的按钮打开。以后也可以随时从这里打开。' : '下のボタンから開けます。このあとも同じリンクで見られます。')}
          </p>
          {result.perk === 'grammar' && (
            <a href={GRAMMAR_DECK_URL} target="_blank" rel="noopener"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700">
              {zh ? '打开语法完全版' : '文法完全版を開く'}<ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={onDone}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700">
            {zh ? '回到学习' : '学習にもどる'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm" data-testid="invite-perk-screen">
        <div className="text-center">
          <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mx-auto">
            <Gift className="w-7 h-7" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-xl font-extrabold text-gray-900">{zh ? '推荐成功，恭喜！' : '紹介おめでとうございます！'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{who}</p>
          <p className="mt-1 text-sm font-bold text-gray-800">{zh ? '请选一个谢礼：' : 'お礼にひとつ選んでください。'}</p>
        </div>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label={zh ? '奖励' : '特典'}>
          {PERK_OPTIONS.map((o) => {
            const on = picked === o.id;
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(o.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <span className="block text-base font-bold text-gray-900">{o[lang].title}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-600">{o[lang].body}</span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <button type="button" disabled={!picked || busy} onClick={() => void confirm()}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-50 hover:bg-blue-700">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          {zh ? '就选这个' : 'これにする'}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-500">{zh ? '选择后不能更改。' : '選んだあとは変えられません。'}</p>
        <button type="button" onClick={onLater}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-bold text-gray-500 underline-offset-2 hover:underline">
          {zh ? '以后再选' : 'あとで選ぶ'}
        </button>
      </div>
    </div>
  );
}

export default InvitePerkScreen;
