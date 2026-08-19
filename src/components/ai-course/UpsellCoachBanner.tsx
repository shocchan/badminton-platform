// 1か月AI自学プランの利用者にだけ出す、6か月伴走コースの案内バナー。
//
// - 表示判定は planUpsell.upsellMomentFor（対象外の人には呼び出し側で出さない）
// - 邪魔にしない: 1行＋ボタンの小さなカード。閉じると7日間出ない
// - 成果の約束をしない。相談先はWeChat・メール（LPの無料相談と同じ窓口）
// - plan_id 列（migration 20260819100000）が remote に無い間は誰にも表示されない
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LP } from '../../pages/ai-lesson/landing/lpContent';
import { UPSELL_COPY, type UpsellMoment } from '../../lib/aiLesson/course/plans/planUpsell';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

export function UpsellCoachBanner({ lang, moment, onDismiss }: {
  lang: 'ja' | 'zh';
  moment: UpsellMoment;
  onDismiss: () => void;
}) {
  const copy = UPSELL_COPY[lang];
  const c = LP.consultation;
  const [openContact, setOpenContact] = useState(false);
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackCourse('view_ai_course_upsell', { moment, plan: 'ai-month' });
  }, [moment]);

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl px-4 pt-3">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-relaxed text-amber-900">{copy.body}</p>
          <button type="button" onClick={onDismiss} aria-label={copy.dismiss}
            className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-amber-900/70 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {openContact ? (
          <div className="mt-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2.5 text-left">
            <p className="text-xs font-bold text-amber-900">
              {lang === 'zh' ? '微信号' : 'WeChat ID'}: <span className="select-all font-extrabold">{c.wechatIdPlaceholder}</span>
            </p>
            <p className="mt-1 text-xs text-amber-900/90">
              {lang === 'zh' ? '添加好友后发送「想咨询陪跑课程」即可。' : '友だち追加のうえ「伴走コース相談」と送ってください。'}
            </p>
            <a
              href={`mailto:${c.email}?subject=${encodeURIComponent(lang === 'zh' ? '咨询6个月陪跑课程' : '6か月伴走コースの相談')}`}
              onClick={() => trackCourse('click_ai_course_upsell_consult', { moment, method: 'email' })}
              className="mt-1.5 inline-block text-xs font-bold text-amber-900 underline underline-offset-2">
              {lang === 'zh' ? `或发邮件到 ${c.email}` : `またはメール: ${c.email}`}
            </a>
          </div>
        ) : (
          <button type="button"
            onClick={() => {
              trackCourse('click_ai_course_upsell_consult', { moment, method: 'open' });
              setOpenContact(true);
            }}
            className="mt-2 inline-flex items-center min-h-9 rounded-full bg-amber-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
            {copy.cta}
          </button>
        )}
      </div>
    </div>
  );
}

export default UpsellCoachBanner;
