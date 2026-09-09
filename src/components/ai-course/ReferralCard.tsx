// 紹介カード（2026-09-09 P1-5 / D-5）。
//
// 【いつ出すか】
// ログイン直後には出さない。AI会話を数回終えた・復習を終えた・続けて来ている——
// **「役に立った」と本人が感じたあと**にだけ出す（判定は referral.shouldShowReferral）。
// 閉じられたら30日は出さない。
//
// 【やらないこと】
// - 自動送信しない。コピーできるところまで
// - 効かない割引を約束しない（Stripeのクーポン未設定なら割引の文言を出さない）
// - 感想を書くことを条件にしない（口コミとは完全に別）
import { useState } from 'react';
import { Gift, Copy, Check, X } from 'lucide-react';
import { referralMessage, referralUrl, referralCodeDisplay } from '../../lib/aiLesson/course/referral';
import type { MyReferral } from '../../lib/aiLesson/course/referralApi';

export const ReferralCard = ({ lang, referral, onDismiss }: {
  lang: 'ja' | 'zh';
  referral: MyReferral;
  onDismiss: () => void;
}) => {
  const zh = lang === 'zh';
  const [copied, setCopied] = useState<string | null>(null);
  const url = referralUrl(referral.code, lang);
  const message = referralMessage(referral.code, lang, referral.inviteeDiscountReady, referral.inviteeDiscountPercent);
  const capped = referral.rewardedDays >= referral.rewardDaysCap;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { /* コピーできない端末では、下に出しているURLを長押しで選べる */ }
  };

  return (
    <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5"
      aria-label={zh ? '介绍给朋友' : '友達に紹介する'}>
      <div className="flex items-start gap-2">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            {zh ? '觉得有用的话，也可以介绍给为日语发愁的朋友' : '役に立ったと思ったら、日本語で困っている友達にも紹介できます'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-700">
            {referral.inviteeDiscountReady
              ? (zh
                ? `从你的链接进来的朋友，第一个月可以便宜${referral.inviteeDiscountPercent}%。`
                : `あなたのリンクから来た友達は、初月が${referral.inviteeDiscountPercent}%オフになります。`)
              : (zh ? '把链接发给朋友就可以。' : 'リンクを送るだけです。')}
            {!capped && (zh
              ? `朋友开始付费学习后，你的学习期间会延长${referral.rewardDaysPerPurchase}天。`
              : `友達が有料で学習を始めたら、あなたの利用期間が${referral.rewardDaysPerPurchase}日のびます。`)}
          </p>
          {capped && (
            <p className="mt-1 text-xs text-gray-600">
              {zh
                ? `已经延长了${referral.rewardedDays}天（上限${referral.rewardDaysCap}天）。谢谢你的介绍。`
                : `これまでに${referral.rewardedDays}日のびました（上限${referral.rewardDaysCap}日）。紹介ありがとうございます。`}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy('msg', message)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-sm font-bold text-white active:scale-[0.98]">
              {copied === 'msg' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {zh ? '复制发给微信' : 'WeChat用の文をコピー'}
            </button>
            <button type="button" onClick={() => void copy('url', url)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 text-sm font-bold text-amber-800">
              {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {zh ? '只复制链接' : 'リンクだけコピー'}
            </button>
          </div>

          <p className="mt-2 break-all text-[11px] text-gray-500">{url}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {zh ? '你的介绍码' : 'あなたの紹介コード'}：{referralCodeDisplay(referral.code)}
            {referral.invited > 0 && (zh ? `・已经有${referral.invited}人打开过` : `・これまでに${referral.invited}人が開きました`)}
          </p>
        </div>
        <button type="button" onClick={onDismiss}
          aria-label={zh ? '关闭' : '閉じる'}
          className="-mt-1 -mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
};

export default ReferralCard;
