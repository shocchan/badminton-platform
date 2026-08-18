// 先生からの一言（週1）パネル（AiCourseAdminPage の TeacherNotePanel を移設。2026-08-18 管理ページ刷新）。
//
// ロジック・下書き生成・警告・週1上書き仕様は移設元と不変。変更点は props 契約のみ:
// - onApplied: () => Promise<void> になり、**await してから**完了表示を出す。
//   親（ページ）は adminGetLearner で learner 行を単行再取得してから resolve する。
//   （学習設計調整→先生コメントの連続適用で1回目が消える stale settings 上書きの対策）
//
// 設計の要点:
// - **下書きは事実だけ**を並べる（buildNoteDraft）。ほめ言葉や見通しは先生が自分の言葉で足す
// - 送信前に約束・断定・脅しを検出して警告する（ブロックはしない・判断は人間）
// - 同じ週に2回書いたら上書き（週1の約束を守り、通知を溜めない）

import { useState } from 'react';
import type { AdminLearnerRow } from '../../../lib/aiLesson/course/courseAdminApi';
import { adminUpdateLearner } from '../../../lib/aiLesson/course/courseAdminApi';
import { readAdvProfile, writeAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import {
  buildNoteDraft, noteBodyWarnings, appendNote, noteIdFor, weekStartKeyOf, jstDateKeyOf,
} from '../../../lib/aiLesson/course/adventure/advTeacherNote';

export const AdminTeacherNotePanel = ({ learner, onApplied }: {
  learner: AdminLearnerRow;
  onApplied: () => Promise<void>;
}) => {
  const prof = readAdvProfile(learner.settings);
  const [bodyJa, setBodyJa] = useState('');
  const [bodyZh, setBodyZh] = useState('');
  const [author, setAuthor] = useState('しょっちゃん先生');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!prof) return null;
  const warnings = noteBodyWarnings(bodyJa);
  const notes = prof.teacherNotes ?? [];
  const latest = notes[notes.length - 1] ?? null;

  const fillDraft = () => {
    const d = buildNoteDraft(prof, new Date().toISOString());
    setBodyJa(d.ja);
    setBodyZh(d.zh);
    setSent(false);
  };

  const send = async () => {
    if (busy || bodyJa.trim().length === 0) return;
    setBusy(true);
    const nowISO = new Date().toISOString();
    const weekStartKey = weekStartKeyOf(jstDateKeyOf(nowISO));
    const next = appendNote(notes, {
      id: noteIdFor(weekStartKey),
      weekStartKey,
      bodyJa: bodyJa.trim(),
      bodyZh: bodyZh.trim() || undefined,
      authorLabel: author.trim(),
      createdAtISO: nowISO,
      readAtISO: null,
    });
    const settings = writeAdvProfile(learner.settings, { ...prof, teacherNotes: next }, nowISO);
    const ok = await adminUpdateLearner(learner.id, { settings });
    if (ok) {
      // 親の learner 行再取得が終わるまで待つ（次の操作が古い settings を土台にしないため）
      await onApplied();
      setSent(true);
      setBodyJa('');
      setBodyZh('');
    }
    setBusy(false);
  };

  return (
    <div className="bg-white border border-rose-200 rounded-xl p-4 mb-3">
      <p className="text-sm font-bold text-gray-800">先生からの一言（週1）</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        生徒のホームに1件だけ出ます。同じ週にもう一度書くと上書きされます。
        下書きは実測の事実だけを並べたものです。ほめ言葉や見通しは先生の言葉で足してください。
      </p>
      {latest && (
        <p className="mt-2 text-[11px] text-gray-500">
          直近: {latest.weekStartKey}の週・{latest.readAtISO ? '既読' : '未読'}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <button type="button" onClick={fillDraft}
          className="w-full min-h-11 py-2 rounded-lg text-sm font-bold border border-rose-300 text-rose-700">
          今週の事実から下書きを作る
        </button>
        <div>
          <label className="text-xs text-gray-500">日本語（必須）</label>
          <textarea value={bodyJa} onChange={(e) => { setBodyJa(e.target.value); setSent(false); }} rows={5}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">中国語（任意・空なら日本語だけ出ます）</label>
          <textarea value={bodyZh} onChange={(e) => setBodyZh(e.target.value)} rows={4}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">差出人の表示名</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)}
            className="w-full min-h-11 mt-1 px-3 border border-gray-300 rounded-lg text-sm" />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 p-2.5">
            <p className="text-xs font-bold text-amber-800">送る前に確認してください</p>
            <ul className="mt-1 space-y-0.5">
              {warnings.map((w) => <li key={w.ja} className="text-xs text-amber-800">・{w.ja}</li>)}
            </ul>
          </div>
        )}

        <button type="button" disabled={busy || bodyJa.trim().length === 0} onClick={() => { void send(); }}
          className="w-full min-h-11 py-2 rounded-lg text-sm font-bold bg-rose-600 text-white disabled:opacity-40">
          {busy ? '送信中…' : '生徒のホームに出す'}
        </button>
        {sent && <p className="text-xs font-bold text-emerald-700">出しました（生徒が次に開いたときに表示されます）</p>}
      </div>
    </div>
  );
};
