// 友達を招待すると +7日（2026-09-13 CEO決定）。
//
// - ポップ: 1日目の診断を終えた直後に1回だけ出す（「役に立った」直後）。閉じたら次回からはホーム上のカード
// - 文面とリンクはそのままコピーできる。自動送信はしない
// - 「特典があるから紹介したい」と思える見せ方: +7日を主役に、進み具合（あと◯人）を見せる
import { useState } from 'react';
import { Gift, Copy, Check, X, Users } from 'lucide-react';
import { inviteMessage, inviteUrl, type MyReferralInvite } from '../../lib/aiLesson/course/referralInvite';

const useCopy = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { /* コピーできない端末では、表示しているURLを長押しで選べる */ }
  };
  return { copied, copy };
};

const Body = ({ lang, invite, compact }: { lang: 'ja' | 'zh'; invite: MyReferralInvite; compact?: boolean }) => {
  const zh = lang === 'zh';
  const { copied, copy } = useCopy();
  // 送る相手は中国語話者。リンクも文面も中文で固定（画面が日本語でも）
  const url = inviteUrl(invite.code, 'zh');
  const message = inviteMessage(invite.code, lang);
  const left = Math.max(0, invite.cap - invite.rewarded);
  const capped = left === 0;
  return (
    <div>
      <p className={`${compact ? 'text-sm' : 'text-lg'} font-extrabold text-gray-900 leading-snug`}>
        {zh ? `每邀请1位朋友，你的使用期限 +${invite.days}天` : `友達1人につき、あなたの受講期限が +${invite.days}日`}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-700">
        {zh
          ? `朋友用你的链接免费学7天。朋友做完第1天的测试后，你的期限自动延长。最多${invite.cap}人（+${invite.cap * invite.days}天）。`
          : `友達はあなたのリンクから7日間無料。友達が1日目の診断を終えると、あなたの期限が自動でのびます。最大${invite.cap}人（+${invite.cap * invite.days}日）。`}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-bold text-amber-900" data-testid="invite-progress">
        <Users className="h-3.5 w-3.5" aria-hidden />
        {capped
          ? (zh ? `已延长${invite.rewarded}人份。谢谢！` : `${invite.rewarded}人分のびました。ありがとうございます！`)
          : (zh ? `已延长 ${invite.rewarded}/${invite.cap} 人・还可以再邀请${left}人` : `${invite.rewarded}/${invite.cap}人・あと${left}人まで`)}
        {invite.waiting > 0 && (zh ? `・${invite.waiting}人已注册，等待完成测试` : `・${invite.waiting}人が登録済み（診断待ち）`)}
      </p>

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-800" data-testid="invite-message">{message}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy('msg', message)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-sm font-bold text-white active:scale-[0.98]">
          {copied === 'msg' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {zh ? '复制文字＋链接（发微信）' : '文とリンクをコピー（WeChat用）'}
        </button>
        <button type="button" onClick={() => void copy('url', url)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 text-sm font-bold text-amber-800">
          {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {zh ? '只复制链接' : 'リンクだけコピー'}
        </button>
      </div>
      <p className="mt-2 break-all text-[11px] text-gray-500">{url}</p>
    </div>
  );
};

/** 診断直後に1回だけ出すポップ */
export const InviteFriendsPopup = ({ lang, invite, onClose }: { lang: 'ja' | 'zh'; invite: MyReferralInvite; onClose: () => void }) => {
  const zh = lang === 'zh';
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true"
      aria-label={zh ? '邀请朋友' : '友達を招待'} data-testid="invite-friends-popup" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Gift className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-amber-700">{zh ? '第1天完成！送你一个礼物' : '1日目おつかれさま！お礼にひとつ'}</p>
            <Body lang={lang} invite={invite} />
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? '关闭' : '閉じる'}
            className="-mt-1 -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={onClose}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 text-sm font-bold text-gray-700">
          {zh ? '以后再说' : 'あとで'}
        </button>
      </div>
    </div>
  );
};

/** ホーム上部に残す小さいカード（折りたたみ） */
export const InviteFriendsCard = ({ lang, invite }: { lang: 'ja' | 'zh'; invite: MyReferralInvite }) => {
  const zh = lang === 'zh';
  const [open, setOpen] = useState(false);
  const left = Math.max(0, invite.cap - invite.rewarded);
  return (
    <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5" aria-label={zh ? '邀请朋友' : '友達を招待'} data-testid="invite-friends-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <Gift className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-bold text-gray-900">
          {zh ? `邀请朋友，每人 +${invite.days}天` : `友達を招待して +${invite.days}日`}
          <span className="ml-2 text-[12px] font-medium text-amber-800">
            {left > 0 ? (zh ? `还可以${left}人` : `あと${left}人`) : (zh ? '已达上限' : '上限に達しました')}
          </span>
        </span>
        <span className="text-xs text-gray-500">{open ? '−' : '＋'}</span>
      </button>
      {open && <div className="mt-3"><Body lang={lang} invite={invite} compact /></div>}
    </section>
  );
};

export default InviteFriendsPopup;
