// 管理ページ タブ「教材レビュー」（Task 3・2026-08-21）。
//
// 狙い: 教材544件（語彙140 / N2文法180 / 聴解224）はすべてAI生成のままで、
// 日本語ネイティブの確認が1件も入っていない。CEOが**毎日少しずつ**確認できる導線を作る。
//
// 守っていること:
// - 一括で確認済みにする操作を置かない（1件ずつだけ）
// - 教材本文はここから編集できない（判定とメモだけ）。本文の直しはコード側で行う
// - 未保存のメモがあるまま別の項目へ移るときは確認する
// - 状態が無い項目は「未確認」＝暗黙に確認済みにしない
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, History, SkipForward } from 'lucide-react';
import {
  allReviewableItems, filterReviewItems, nextUnreviewedIndex, reviewProgressOf,
  CONTENT_KIND_LABELS, type ContentKind, type ReviewStatus, type ReviewableItem,
} from '../../../lib/aiLesson/course/admin/contentReviewQueue';
import {
  adminListContentReviews, adminSetContentReview, adminContentReviewHistory,
  reviewKeyOf, type ContentReviewState, type ContentReviewHistoryRow,
} from '../../../lib/aiLesson/course/admin/contentReviewApi';

const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: '未確認', needs_fix: '修正必要', reviewed: '確認済み',
};
const STATUS_STYLE: Record<ReviewStatus, string> = {
  unreviewed: 'bg-gray-100 text-gray-700',
  needs_fix: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-green-100 text-green-800',
};

const jstDay = (iso: string): string =>
  iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';

export const AdminContentReviewTab = () => {
  const items = useMemo(() => allReviewableItems(), []);
  const [states, setStates] = useState<Map<string, ContentReviewState>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ContentKind | ''>('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ReviewStatus | ''>('');
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ContentReviewHistoryRow[] | null>(null);

  const load = useCallback(() => {
    adminListContentReviews()
      .then((m) => { setStates(m); setLoaded(true); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '取得に失敗しました'));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(
    () => filterReviewItems({ items, statuses: new Map([...states].map(([k, v]) => [k, v.status])), kind, category, status, query }),
    [items, states, kind, category, status, query],
  );

  const current: ReviewableItem | undefined = filtered[Math.min(index, Math.max(0, filtered.length - 1))];
  const curKey = current ? reviewKeyOf(current.kind, current.id) : '';
  const curState = curKey ? states.get(curKey) : undefined;
  const curStatus: ReviewStatus = curState?.status ?? 'unreviewed';

  // 項目が変わったらメモを読み直す（保存済みの内容を初期値にする）
  useEffect(() => {
    setNote(curState?.note ?? '');
    setDirty(false);
    setHistory(null);
  }, [curKey, curState?.note]);

  const categories = useMemo(() => {
    const src = kind ? items.filter((i) => i.kind === kind) : items;
    return [...new Set(src.map((i) => i.category))].sort();
  }, [items, kind]);

  const progress = useMemo(
    () => reviewProgressOf(items, new Map([...states].map(([k, v]) => [k, v.status]))),
    [items, states],
  );
  const todayKey = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const todayCount = useMemo(
    () => [...states.values()].filter((s) => jstDay(s.reviewedAtISO) === todayKey).length,
    [states, todayKey],
  );

  /** 未保存のメモがあるまま移動しようとしたら確認する */
  const confirmLeave = (): boolean =>
    !dirty || window.confirm('保存していないメモがあります。破棄して移動しますか？');

  const move = (next: number) => {
    if (!confirmLeave()) return;
    setIndex(Math.max(0, Math.min(next, filtered.length - 1)));
  };

  const save = async (nextStatus: ReviewStatus) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await adminSetContentReview(current.kind, current.id, nextStatus, note);
      if (!ok) { setError('保存できませんでした（管理者権限が必要です）'); return; }
      setStates((prev) => {
        const m = new Map(prev);
        m.set(curKey, {
          status: nextStatus, note,
          reviewedBy: curState?.reviewedBy ?? '',
          reviewedAtISO: new Date().toISOString(),
          revisions: (curState?.revisions ?? 0) + 1,
        });
        return m;
      });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const goNextUnreviewed = () => {
    if (!confirmLeave()) return;
    const i = nextUnreviewedIndex(filtered, new Map([...states].map(([k, v]) => [k, v.status])), index);
    if (i >= 0) setIndex(i);
  };

  const showHistory = async () => {
    if (!current) return;
    try { setHistory(await adminContentReviewHistory(current.kind, current.id)); }
    catch { setHistory([]); }
  };

  return (
    <div className="space-y-4">
      {/* 進捗 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5 mb-2">
          <BookOpenCheck className="w-4 h-4 text-blue-600" />教材レビューの進捗
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['未確認', progress.unreviewed, 'text-gray-800'],
            ['修正必要', progress.needsFix, 'text-amber-700'],
            ['確認済み', progress.reviewed, 'text-green-700'],
            ['今日の確認', todayCount, 'text-blue-700'],
          ] as const).map(([label, n, cls]) => (
            <div key={label} className="rounded-xl border border-gray-200 p-2.5">
              <p className="text-[11px] text-gray-500">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${cls}`}>{n}<span className="text-xs font-normal text-gray-400"> / {progress.total}</span></p>
            </div>
          ))}
        </div>
        {!loaded && !error && <p className="mt-2 text-xs text-gray-400">判定を読み込み中…</p>}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>

      {/* 絞り込み */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select aria-label="教材種別" value={kind}
            onChange={(e) => { setKind(e.target.value as ContentKind | ''); setCategory(''); setIndex(0); }}
            className="min-h-11 rounded-lg border border-gray-300 px-2 text-sm">
            <option value="">すべての種別</option>
            {(Object.keys(CONTENT_KIND_LABELS) as ContentKind[]).map((k) => (
              <option key={k} value={k}>{CONTENT_KIND_LABELS[k]}</option>
            ))}
          </select>
          <select aria-label="分類" value={category}
            onChange={(e) => { setCategory(e.target.value); setIndex(0); }}
            className="min-h-11 rounded-lg border border-gray-300 px-2 text-sm">
            <option value="">すべての分類</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="状態" value={status}
            onChange={(e) => { setStatus(e.target.value as ReviewStatus | ''); setIndex(0); }}
            className="min-h-11 rounded-lg border border-gray-300 px-2 text-sm">
            <option value="">すべての状態</option>
            {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <input aria-label="本文で検索" value={query} placeholder="本文で検索"
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            className="min-h-11 rounded-lg border border-gray-300 px-2 text-sm" />
        </div>
        <p className="mt-2 text-xs text-gray-500 tabular-nums">
          該当 {filtered.length}件 {filtered.length > 0 && <>／ {Math.min(index + 1, filtered.length)}件目</>}
        </p>
      </div>

      {/* 1件のレビュー */}
      {!current && <p className="text-sm text-gray-500">条件に合う教材がありません。</p>}
      {current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">
                {CONTENT_KIND_LABELS[current.kind]} / {current.category} / 元データ: {current.sourceState}
              </p>
              <h3 className="text-base font-bold text-gray-900 break-words">{current.title}</h3>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[curStatus]}`}>
              {STATUS_LABEL[curStatus]}
            </span>
          </div>

          {curState && (
            <p className="text-[11px] text-gray-500 mb-2 tabular-nums">
              最終判定 {jstDay(curState.reviewedAtISO)}
              {curState.reviewedBy && <> / {curState.reviewedBy}</>}
              {curState.revisions > 1 && <> / {curState.revisions}回目</>}
              <button type="button" onClick={showHistory}
                className="ml-2 underline underline-offset-2 inline-flex items-center gap-0.5">
                <History className="w-3 h-3" />履歴
              </button>
            </p>
          )}
          {history && (
            <ul className="mb-2 rounded-lg bg-gray-50 border border-gray-200 p-2 text-[11px] text-gray-700 space-y-1">
              {history.length === 0 && <li>履歴はありません</li>}
              {history.map((h, i) => (
                <li key={i} className="tabular-nums">
                  {jstDay(h.createdAtISO)} — {STATUS_LABEL[h.status]}
                  {h.note && <span className="text-gray-500"> 「{h.note.slice(0, 40)}」</span>}
                </li>
              ))}
            </ul>
          )}

          {current.audioPath && (
            <div className="mb-3">
              <p className="text-xs font-bold text-gray-600 mb-1">音声（再生して確認してください）</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- 原稿は下の「読み上げ原稿」に全文がある */}
              <audio controls preload="none" src={current.audioPath} className="w-full">
                お使いのブラウザは音声再生に対応していません。
              </audio>
            </div>
          )}
          {current.imagePath && (
            <img src={current.imagePath} alt={`${current.title} のイラスト`}
              className="mb-3 max-h-48 rounded-lg border border-gray-200" />
          )}

          <dl className="space-y-2">
            {current.fields.map((f) => (
              <div key={f.label} className="grid sm:grid-cols-[7rem_1fr] gap-x-3">
                <dt className="text-xs font-bold text-gray-500 pt-0.5">{f.label}</dt>
                <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">{f.value}</dd>
              </div>
            ))}
          </dl>

          <label className="block mt-4">
            <span className="text-xs font-bold text-gray-600">修正メモ（この教材について気づいたこと）</span>
            <textarea value={note} rows={3}
              onChange={(e) => { setNote(e.target.value); setDirty(true); }}
              placeholder="例: 例文の「〜てしまう」が不自然。「〜ちゃう」のほうが会話的。"
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" />
          </label>
          {dirty && <p className="text-[11px] text-amber-700">未保存の変更があります</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => save('reviewed')}
              className="min-h-11 px-3.5 rounded-lg bg-green-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
              <CircleCheck className="w-4 h-4" />確認済みにする
            </button>
            <button type="button" disabled={busy} onClick={() => save('needs_fix')}
              className="min-h-11 px-3.5 rounded-lg bg-amber-500 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
              <CircleAlert className="w-4 h-4" />修正が必要
            </button>
            {curStatus !== 'unreviewed' && (
              <button type="button" disabled={busy} onClick={() => save('unreviewed')}
                className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 disabled:opacity-50">
                未確認に戻す
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={() => move(index - 1)} disabled={index <= 0}
              className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 disabled:opacity-40 inline-flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" />前
            </button>
            <button type="button" onClick={goNextUnreviewed}
              className="min-h-11 px-3.5 rounded-lg bg-blue-600 text-white text-sm font-bold inline-flex items-center gap-1.5">
              <SkipForward className="w-4 h-4" />次の未確認へ
            </button>
            <button type="button" onClick={() => move(index + 1)} disabled={index >= filtered.length - 1}
              className="min-h-11 px-3 rounded-lg border border-gray-300 text-sm font-bold text-gray-700 disabled:opacity-40 inline-flex items-center gap-1">
              次<ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            本文の修正はここではできません（コード側で直します）。ここでは判定とメモだけ残してください。
          </p>
        </div>
      )}
    </div>
  );
};
