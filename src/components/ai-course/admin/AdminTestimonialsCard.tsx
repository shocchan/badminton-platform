// 受講者の声（管理・2026-08-26 Phase S7 / 2026-09-09 P1-6 で承認フローを完成）。
//
// 【この画面の仕事】
// 集まった感想を読み、**掲載してよいと言われたものだけ**を人が承認する。
// 自動公開はしない。許諾が無い行には承認ボタンを出さない（押せてしまう形にしない）。
//
// 【原文を書き換えない】
// 誤字などを直したいときは「掲載用の編集案」に入れる。原文は必ず残り、
// 両方を並べて見られる。AIが勝手に美化する道は作らない。
import { useEffect, useState } from 'react';
import { MessageSquare, Check, EyeOff, Loader2, Ban, RotateCcw, Pencil } from 'lucide-react';
import {
  adminListTestimonials, adminApproveTestimonial, adminRejectTestimonial,
  adminUnrejectTestimonial, adminSetTestimonialEdit, bucketOf, sortForAdmin, publishText,
  type TestimonialRow, type TestimonialBucket,
} from '../../../lib/aiLesson/course/admin/adminTestimonials';

const BUCKET_LABEL: Record<TestimonialBucket, string> = {
  awaiting_review: '確認待ち（掲載OKをもらった）',
  no_consent: '掲載しない（本人の許可なし）',
  published: '掲載中',
  rejected: '却下した',
};

const BUCKET_STYLE: Record<TestimonialBucket, string> = {
  awaiting_review: 'bg-amber-50 text-amber-800 border-amber-200',
  no_consent: 'bg-gray-50 text-gray-500 border-gray-200',
  published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-gray-100 text-gray-500 border-gray-300',
};

export const AdminTestimonialsCard = () => {
  const [rows, setRows] = useState<TestimonialRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = async () => {
    const r = await adminListTestimonials();
    setFailed(r.failed);
    setRows(sortForAdmin(r.rows));
  };
  useEffect(() => { void load(); }, []);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    await fn();
    await load();
    setBusy(null);
  };

  const saveEdit = async (t: TestimonialRow) => {
    await run(t.id, () => adminSetTestimonialEdit(t.id, draft));
    setEditing(null);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
          <MessageSquare className="h-4 w-4 text-blue-600" />受講者の声
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
            const isEditing = editing === t.id;
            return (
              <li key={t.id} className={`rounded-xl border px-3 py-2.5 ${BUCKET_STYLE[b]}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="font-bold">{BUCKET_LABEL[b]}</span>
                  <span className="text-gray-500">{t.createdAtISO.slice(0, 10)}</span>
                  <span className="text-gray-500">{t.locale === 'zh' ? '中文' : '日本語'}</span>
                  {t.context && <span className="text-gray-500">{t.context}</span>}
                  <span className="text-gray-500">
                    {t.anonymous ? '匿名希望' : t.displayName ? `呼び名: ${t.displayName}` : '呼び名なし（匿名で掲載）'}
                  </span>
                </div>

                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">{t.body}</p>

                {/* 編集案がある行は、原文と並べて見せる（どちらを載せるか一目で分かる） */}
                {t.editedBody && !isEditing && (
                  <div className="mt-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                    <p className="text-[11px] font-bold text-blue-900">掲載する文（編集案）</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">{t.editedBody}</p>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-2">
                    <label htmlFor={`edit-${t.id}`} className="block text-[11px] font-bold text-gray-700">
                      掲載する文（原文は残ります。誤字直しなど軽い調整だけにしてください）
                    </label>
                    <textarea id={`edit-${t.id}`} value={draft} rows={3}
                      onChange={(e) => setDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px]" />
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" onClick={() => void saveEdit(t)} disabled={busy === t.id}
                        className="min-h-9 rounded-lg bg-blue-600 px-3 text-[12px] font-bold text-white disabled:opacity-50">
                        保存
                      </button>
                      <button type="button" onClick={() => { setEditing(null); setDraft(''); }}
                        className="min-h-9 rounded-lg border border-gray-300 px-3 text-[12px] font-bold text-gray-700">
                        やめる
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {/* 許諾が無い行には承認ボタンを出さない（押せてしまう形を作らない） */}
                  {t.consentPublish && t.rejectedAtISO === null && (
                    <button type="button" onClick={() => void run(t.id, () => adminApproveTestimonial(t.id, t.approvedAtISO === null))}
                      disabled={busy === t.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-current px-3 text-[12px] font-bold disabled:opacity-50">
                      {busy === t.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        : t.approvedAtISO === null
                          ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                      {t.approvedAtISO === null ? '掲載してよいことにする' : '掲載を取り下げる'}
                    </button>
                  )}
                  {t.rejectedAtISO === null ? (
                    <button type="button" onClick={() => void run(t.id, () => adminRejectTestimonial(t.id, ''))}
                      disabled={busy === t.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-[12px] font-bold text-gray-600 disabled:opacity-50">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />却下する
                    </button>
                  ) : (
                    <button type="button" onClick={() => void run(t.id, () => adminUnrejectTestimonial(t.id))}
                      disabled={busy === t.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-[12px] font-bold text-gray-600 disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />却下をやめる
                    </button>
                  )}
                  {t.consentPublish && !isEditing && (
                    <button type="button" onClick={() => { setEditing(t.id); setDraft(publishText(t)); }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-[12px] font-bold text-gray-600">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.editedBody ? '編集案を直す' : '掲載用に少し直す'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        承認した感想は、LPの「使っている人の声」の下に自動で並びます（許諾＋承認が揃ったものだけ）。
        本人の許可が無い感想は、改善のために読むだけで掲載できません。
        感想を書くことは、割引・紹介の報酬・無料期間の条件にしていません。
      </p>
    </div>
  );
};

export default AdminTestimonialsCard;
