// 受講者の声（管理・2026-08-26 Phase S7）。
//
// 【この画面の仕事】
// 集まった感想を読み、**掲載してよいと言われたものだけ**を人が承認する。
// 自動公開はしない。許諾が無い行には承認ボタンを出さない（押せてしまう形にしない）。
//
// LPに載っている「声」は現在1件（告知文）で、実際の感想はゼロ。
// 架空の口コミを作らない方針を守ったまま実績を積むための入口がここ。
import { useEffect, useState } from 'react';
import { MessageSquare, Check, EyeOff, Loader2 } from 'lucide-react';
import {
  adminListTestimonials, adminApproveTestimonial, bucketOf, sortForAdmin,
  type TestimonialRow, type TestimonialBucket,
} from '../../../lib/aiLesson/course/admin/adminTestimonials';

const BUCKET_LABEL: Record<TestimonialBucket, string> = {
  awaiting_review: '確認待ち（掲載OKをもらった）',
  no_consent: '掲載しない（本人の許可なし）',
  published: '掲載中',
};

const BUCKET_STYLE: Record<TestimonialBucket, string> = {
  awaiting_review: 'bg-amber-50 text-amber-800 border-amber-200',
  no_consent: 'bg-gray-50 text-gray-500 border-gray-200',
  published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export const AdminTestimonialsCard = () => {
  const [rows, setRows] = useState<TestimonialRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const r = await adminListTestimonials();
    setFailed(r.failed);
    setRows(sortForAdmin(r.rows));
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (t: TestimonialRow) => {
    setBusy(t.id);
    await adminApproveTestimonial(t.id, t.approvedAtISO === null);
    await load();
    setBusy(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-blue-600" />受講者の声
        </p>
        <p className="text-xs text-gray-500">許可をもらったものだけ、押して掲載</p>
      </div>

      {rows === null && <p className="mt-2 text-sm text-gray-400">読み込み中…</p>}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          読み込めませんでした（0件と区別できないため、件数は出していません）
        </p>
      )}
      {rows !== null && !failed && rows.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">
          まだ1件もありません。会話を3回終えた生徒のレポート画面に、任意の入力欄が出ます。
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((t) => {
            const b = bucketOf(t);
            return (
              <li key={t.id} className={`rounded-xl border px-3 py-2.5 ${BUCKET_STYLE[b]}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="font-bold">{BUCKET_LABEL[b]}</span>
                  <span className="text-gray-500">{t.createdAtISO.slice(0, 10)}</span>
                  <span className="text-gray-500">{t.locale === 'zh' ? '中文' : '日本語'}</span>
                  {t.context && <span className="text-gray-500">{t.context}</span>}
                  <span className="text-gray-500">
                    {t.displayName ? `呼び名: ${t.displayName}` : '匿名で掲載'}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">{t.body}</p>

                {/* 許諾が無い行には承認ボタンを出さない（押せてしまう形を作らない） */}
                {t.consentPublish && (
                  <button type="button" onClick={() => void toggle(t)} disabled={busy === t.id}
                    className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-current px-3 text-[12px] font-bold disabled:opacity-50">
                    {busy === t.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      : t.approvedAtISO === null
                        ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t.approvedAtISO === null ? '掲載してよいことにする' : '掲載を取り下げる'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        承認しても、LPへの反映は手作業です（自動では公開されません）。
        本人の許可が無い感想は、改善のために読むだけで掲載できません。
      </p>
    </div>
  );
};

export default AdminTestimonialsCard;
