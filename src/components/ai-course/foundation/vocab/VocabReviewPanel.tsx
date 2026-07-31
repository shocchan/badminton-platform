// 教材レビュー画面（Phase 2E-1 §14-§17・labPreview限定・lazy chunk）。
// 一般学習者には入口ごと存在しない（VocabularyHub自体がlabPreview限定＋ナビにも出さない）。
// 「問題なし」を押しても教材データのreviewStatusはapprovedにならない（§16・提案の記録のみ）。
// 自由メモはsessionStorageのみ。analyticsへ本文・訳文・出典セルを送らない（§30）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Upload } from 'lucide-react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import type { FoundationItem } from '../../../../lib/aiLesson/course/foundationTypes';
import { buildVocabularyReviewRecords } from '../../../../lib/aiLesson/course/vocabularyReview';
import type { VocabularyReviewRecord } from '../../../../lib/aiLesson/course/vocabularyReview';
import { createVocabReviewRepository } from '../../../../lib/aiLesson/course/vocabReviewStore';
import type { ReviewDecision, ReviewIssueType } from '../../../../lib/aiLesson/course/vocabReviewStore';
import { N3_ITEMS } from '../../../../lib/aiLesson/course/foundationVocabN3';
import { trackCourse, trackCourseOnce } from '../../../../lib/aiLesson/course/courseAnalytics';
import { RubySegments } from './RubyText';
import { ActionButton } from '../ActionButton';
import { REVIEW_I18N } from './vocabReviewI18n';
import { buildReviewComparisons } from '../../../../lib/aiLesson/course/vocabDualReview';
import type { VocabularyReviewComparison } from '../../../../lib/aiLesson/course/vocabDualReview';
import { AUTO_FIXED_ITEM_IDS } from '../../../../lib/aiLesson/course/vocabChatgptReview';

type FilterKey = 'important' | 'all' | 'unreviewed' | 'p0' | 'p1' | 'p2' | 'p3'
  | 'ai_agree' | 'ai_disagree' | 'human_required' | 'autofixed'
  | 'cognate_unreviewed' | 'false_friend' | 'partial_overlap' | 'zh' | 'furigana' | 'image' | 'source' | 'n3' | 'basics';

const ISSUE_KEYS: ReviewIssueType[] = ['zh_meaning', 'example_ja', 'example_zh', 'reading', 'furigana', 'cognate', 'level', 'role', 'image', 'source', 'other'];

const VocabReviewPanel = ({ t, initialItemId, onOpenItem, onBack }: {
  t: AiCourseDict;
  items: FoundationItem[];
  initialItemId?: string | null;
  onOpenItem: (itemId: string) => void;
  onBack: () => void;
}) => {
  const tr = REVIEW_I18N[t.locale === 'zh' ? 'zh' : 'ja'];
  const records = useMemo(() => buildVocabularyReviewRecords(), []);
  // 2E-1.5 §11: localStorageで永続化（タブを閉じても保持）。旧sessionStorage v1から自動移行
  const repo = useMemo(() => createVocabReviewRepository(window.localStorage, window.sessionStorage), []);
  const n3Ids = useMemo(() => new Set(N3_ITEMS.map((i) => i.id)), []);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((v) => v + 1), []);
  // 初期表示は「重要項目レビュー」モード（P0/P1のみ・§10）。保存済みフィルターがあれば復元
  const [filter, setFilter] = useState<FilterKey>(() => (repo.getUiState().filter as FilterKey) ?? 'important');
  const comparisons = useMemo(() => {
    const map = new Map<string, VocabularyReviewComparison>();
    for (const c of buildReviewComparisons()) map.set(c.itemId, c);
    return map;
  }, []);
  const [showRuby, setShowRuby] = useState(true);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<'ok' | 'fail' | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => { trackCourseOnce('view_ai_course_vocabulary_review'); }, []);

  const filtered = useMemo(() => {
    const byFilter = (r: VocabularyReviewRecord): boolean => {
      const cmp = comparisons.get(r.itemId);
      switch (filter) {
        case 'important': return cmp?.humanReviewPriority === 'P0' || cmp?.humanReviewPriority === 'P1';
        case 'p0': return cmp?.humanReviewPriority === 'P0';
        case 'p1': return cmp?.humanReviewPriority === 'P1';
        case 'p2': return cmp?.humanReviewPriority === 'P2';
        case 'p3': return cmp?.humanReviewPriority === 'P3';
        case 'ai_agree': return cmp?.aiReviewState === 'ai_consensus';
        case 'ai_disagree': return cmp?.aiReviewState === 'ai_disagreement';
        case 'human_required': return cmp?.aiReviewState === 'human_review_required';
        case 'autofixed': return AUTO_FIXED_ITEM_IDS.includes(r.itemId);
        case 'unreviewed': return !repo.getEntry(r.itemId);
        case 'cognate_unreviewed': return r.cognateDefault === 'unreviewed';
        case 'false_friend': return r.cognateDefault === 'false_friend' || r.cognateSenseOverrides.some((o) => o.cognateType === 'false_friend');
        case 'partial_overlap': return r.cognateDefault === 'partial_overlap';
        case 'zh': return r.outstandingIssues.includes('zh_unreviewed');
        case 'furigana': return r.outstandingIssues.includes('furigana_missing');
        case 'image': return r.outstandingIssues.includes('no_image');
        case 'source': return r.outstandingIssues.includes('source_external');
        case 'n3': return n3Ids.has(r.itemId);
        case 'basics': return !n3Ids.has(r.itemId);
        default: return true;
      }
    };
    const out = records.filter(byFilter);
    // 重要項目モードが空なら全件へフォールバック（初回・未収集時に空画面を出さない）
    if (filter === 'important' && out.length === 0) return records;
    // P0/P1を常に先頭へ（§7）
    const rank = (r: VocabularyReviewRecord) => ({ P0: 0, P1: 1, P2: 2, P3: 3 } as const)[comparisons.get(r.itemId)?.humanReviewPriority ?? 'P3'];
    return [...out].sort((a, b) => rank(a) - rank(b));
    // repo entries change on decision → bump()で再評価される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, filter, n3Ids, repo, comparisons, setTick]);

  const idx = Math.max(0, initialItemId ? filtered.findIndex((r) => r.itemId === initialItemId) : 0);
  const rec: VocabularyReviewRecord | undefined = filtered[idx] ?? filtered[0];
  const progress = repo.getProgress(records.map((r) => r.itemId));

  const go = useCallback((next: number) => {
    if (filtered.length === 0) return;
    const clamped = Math.min(filtered.length - 1, Math.max(0, next));
    repo.setUiState({ currentItemId: filtered[clamped].itemId, filter });
    setNote('');
    onOpenItem(filtered[clamped].itemId);
  }, [filtered, repo, filter, onOpenItem]);

  const decide = useCallback((decision: ReviewDecision, issueTypes: ReviewIssueType[] = []) => {
    if (!rec) return;
    repo.setDecision(rec.itemId, decision, issueTypes, note.trim() || undefined);
    trackCourse('set_ai_course_vocabulary_review_decision', { decision });  // 本文・メモは送らない
    bump();
  }, [rec, repo, note, bump]);

  const [pendingIssues, setPendingIssues] = useState<ReviewIssueType[]>([]);
  const cur = rec ? repo.getEntry(rec.itemId) : undefined;

  // キーボードショートカット（§17・入力欄フォーカス中は無効）
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)) return;
      if (e.key === 'a' || e.key === 'A') { decide('ok'); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') { decide('fix', pendingIssues.length ? pendingIssues : ['other']); e.preventDefault(); }
      else if (e.key === 'h' || e.key === 'H') { decide('hold', pendingIssues); e.preventDefault(); }
      else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, go, idx, pendingIssues]);

  const doExport = () => {
    trackCourse('export_ai_course_vocabulary_review');
    const blob = new Blob([repo.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab-review-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!rec) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm text-gray-500">{tr.empty}</p>
        <ActionButton variant="secondary" className="mt-3" onClick={() => setFilter('all')}>{tr.filters.all}</ActionButton>
      </div>
    );
  }
  const item = rec.item;
  const zhLoc = t.locale === 'zh';

  return (
    <div ref={rootRef} className="space-y-3 pb-10">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onBack} aria-label={t.lab.back} className="min-h-9 min-w-9 flex items-center justify-center text-gray-500"><ArrowLeft className="w-4 h-4" /></button>
          <p className="text-sm font-bold text-gray-900 flex-1">{tr.title}</p>
          <span className="text-xs font-mono text-gray-400">{idx + 1} / {filtered.length}</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">{tr.intro}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <label className="text-[11px] text-gray-500" htmlFor="review-filter">{tr.filterLabel}</label>
          <select id="review-filter" value={filter}
            onChange={(e) => { setFilter(e.target.value as FilterKey); repo.setUiState({ filter: e.target.value }); }}
            className="min-h-9 text-xs border border-gray-200 rounded-lg px-2 text-gray-600">
            {Object.entries(tr.filters).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <label className="text-[11px] text-gray-500 flex items-center gap-1 min-h-9">
            <input type="checkbox" checked={showRuby} onChange={(e) => setShowRuby(e.target.checked)} />{tr.rubyToggle}
          </label>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{tr.progress(progress.reviewed, progress.total)}・{tr.counts(progress.ok, progress.fix, progress.hold)}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{tr.shortcuts}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{tr.persistNote}</p>
        {repo.lastSaveFailed() && <p className="text-[11px] text-red-600 mt-1" role="alert">{tr.saveFailed}</p>}
        {repo.importedVersionMismatch() && <p className="text-[11px] text-amber-700 mt-1">{tr.versionMismatch}</p>}
      </div>

      {/* 対象語カード（日本語と中国語を並べて比較・§17） */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl font-bold text-gray-900">{item.displayForm}</span>
          <span className="text-sm text-gray-500">{item.readingKana}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{t.lab.pos[item.partOfSpeech]}</span>
          {cur && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex items-center gap-0.5"><Check className="w-3 h-3" aria-hidden />{cur.decision === 'ok' ? tr.decisionOk : cur.decision === 'fix' ? tr.decisionFix : tr.decisionHold}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs text-gray-700">
          <p><span className="text-gray-400">{tr.fields.zhCore}: </span>{rec.meaningZhShort}</p>
          <p><span className="text-gray-400">{tr.fields.cognate}: </span>{rec.cognateDefault}</p>
          {rec.learningFocusZh && <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.zhFocus}: </span>{rec.learningFocusZh}</p>}
          {item.usageNoteZh && <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.usageNote}: </span>{item.usageNoteZh}</p>}
          <p className="sm:col-span-2">
            <span className="text-gray-400">{tr.fields.exampleJa}: </span>
            {rec.furiganaSegments && showRuby
              ? <RubySegments segments={rec.furiganaSegments} mode="all" />
              : item.exampleJa}
          </p>
          <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.exampleZh}: </span>{item.exampleZh}</p>
          {rec.senseIds.length > 0 && (
            <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.senses}: </span>
              {(item.senses ?? []).map((sn) => sn.meaningZh).join('／')}</p>
          )}
          {rec.cognateSenseOverrides.length > 0 && (
            <p className="sm:col-span-2"><span className="text-gray-400">Sense cognate: </span>
              {rec.cognateSenseOverrides.map((o) => `${o.senseId}=${o.cognateType}${o.reviewStatus === 'unreviewed' ? '(未)' : ''}`).join('・')}</p>
          )}
          <p><span className="text-gray-400">{tr.fields.level}: </span>{rec.levelMeta.levelTags.join(',')}（{rec.levelMeta.levelConfidence}）</p>
          <p><span className="text-gray-400">{tr.fields.furigana}: </span>{rec.furiganaStatus}</p>
          <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.roles}: </span>
            {Object.entries(rec.rolesByTrack).map(([tk, role]) => `${tk}:${role}`).join('・')}</p>
          {rec.roleRationaleJa && <p className="sm:col-span-2"><span className="text-gray-400">{tr.fields.rationale}: </span>{rec.roleRationaleJa}</p>}
          <details className="sm:col-span-2">
            <summary className="text-gray-400 cursor-pointer min-h-6">{tr.fields.sources}（{item.sources.length}）</summary>
            {item.sources.map((sref, i) => (
              <p key={i} className="ml-2 text-[11px] text-gray-600">{sref.sourceMatchType}: {sref.sourceLabel}{sref.sourceSheet ? `（${sref.sourceSheet} ${sref.cellRange ?? ''}）` : ''}</p>
            ))}
          </details>
          {rec.imageAsset?.filePath && (
            <details className="sm:col-span-2">
              <summary className="text-gray-400 cursor-pointer min-h-6">{tr.fields.image}</summary>
              <img src={rec.imageAsset.filePath} alt={zhLoc ? rec.imageAsset.altZh : rec.imageAsset.altJa} loading="lazy"
                width={rec.imageAsset.width ?? 800} height={rec.imageAsset.height ?? 600} className="rounded-lg mt-1 max-w-full" />
            </details>
          )}
          {rec.outstandingIssues.length > 0 && (
            <p className="sm:col-span-2 text-amber-700"><span className="text-gray-400">{tr.fields.issues}: </span>{rec.outstandingIssues.join(', ')}</p>
          )}
        </div>
      </div>

      {/* AIレビュー比較（§10: 現在値/Claude/ChatGPT/推奨draft/差分。折りたたみで密度を抑える） */}
      {(() => {
        const cmp = comparisons.get(rec.itemId);
        if (!cmp) return null;
        const badge = (s: string) => s === 'ok' ? 'bg-emerald-50 text-emerald-700' : s === 'uncertain' ? 'bg-gray-100 text-gray-500' : s === 'minor_issue' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700';
        const row = (label: string, r2: NonNullable<typeof cmp.claude> | null) => (
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-gray-400 w-20 shrink-0">{label}</span>
            {r2 ? (['japaneseStatus', 'chineseStatus', 'furiganaStatus', 'cognateStatus', 'curriculumStatus'] as const).map((f) => (
              <span key={f} className={`px-1.5 py-0.5 rounded ${badge(r2[f])} ${cmp.disagreementFields.includes(f) ? 'ring-1 ring-amber-400' : ''}`}>{tr.fieldNames[f]}:{r2[f] === 'ok' ? 'OK' : r2[f]}</span>
            )) : <span className="text-gray-400">{tr.notYetChatgpt}</span>}
          </div>
        );
        return (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold text-gray-500">{tr.aiHeading}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${cmp.humanReviewPriority === 'P0' ? 'bg-red-100 text-red-700' : cmp.humanReviewPriority === 'P1' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                {tr.priorityLabel}: {cmp.humanReviewPriority}・{tr.aiStates[cmp.aiReviewState]}
              </span>
            </div>
            <div className="space-y-1">
              {row(tr.claudeLabel, cmp.claude)}
              {row(tr.chatgptLabel, cmp.chatgpt)}
            </div>
            {cmp.claude.rationaleJa && <p className="text-[11px] text-gray-500 mt-1.5">Claude: {cmp.claude.rationaleJa}</p>}
            {cmp.chatgpt?.rationaleJa && <p className="text-[11px] text-gray-500 mt-0.5">ChatGPT: {cmp.chatgpt.rationaleJa}</p>}
            {cmp.chatgpt && (cmp.chatgpt.suggestedMeaningZh || cmp.chatgpt.suggestedLearningFocusZh || cmp.chatgpt.suggestedExampleJa || cmp.chatgpt.suggestedExampleZh || cmp.chatgpt.suggestedCognate) && (
              <details className="mt-1.5">
                <summary className="text-[11px] font-bold text-indigo-600 cursor-pointer min-h-6">{tr.suggestedHeading}</summary>
                <div className="text-[11px] text-gray-700 space-y-0.5 mt-1">
                  {cmp.chatgpt.suggestedMeaningZh && <p>zh: {cmp.chatgpt.suggestedMeaningZh}</p>}
                  {cmp.chatgpt.suggestedLearningFocusZh && <p>focus: {cmp.chatgpt.suggestedLearningFocusZh}</p>}
                  {cmp.chatgpt.suggestedExampleJa && <p>例文: {cmp.chatgpt.suggestedExampleJa}</p>}
                  {cmp.chatgpt.suggestedExampleZh && <p>例文zh: {cmp.chatgpt.suggestedExampleZh}</p>}
                  {cmp.chatgpt.suggestedCognate && <p>cognate: {cmp.chatgpt.suggestedCognate}</p>}
                </div>
              </details>
            )}
          </div>
        );
      })()}

      {/* 判定エリア */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-bold text-gray-500 mb-1.5">{tr.issueHeading}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ISSUE_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={pendingIssues.includes(k)}
              onClick={() => setPendingIssues((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])}
              className={`min-h-9 px-2.5 py-1 text-xs rounded-lg border ${pendingIssues.includes(k) ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'}`}>
              {tr.issues[k]}
            </button>
          ))}
        </div>
        <label className="text-[11px] text-gray-500 block mb-2">
          {tr.noteLabel}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
        </label>
        <div className="flex gap-2">
          <ActionButton variant="choice" className="flex-1 justify-center border-emerald-300" onClick={() => { decide('ok'); setPendingIssues([]); }}>{tr.decisionOk} (A)</ActionButton>
          <ActionButton variant="choice" className="flex-1 justify-center border-amber-300" onClick={() => { decide('fix', pendingIssues.length ? pendingIssues : ['other']); setPendingIssues([]); }}>{tr.decisionFix} (R)</ActionButton>
          <ActionButton variant="choice" className="flex-1 justify-center" onClick={() => { decide('hold', pendingIssues); setPendingIssues([]); }}>{tr.decisionHold} (H)</ActionButton>
        </div>
        <div className="flex gap-2 mt-2">
          <ActionButton variant="secondary" className="flex-1 justify-center" onClick={() => go(idx - 1)}><ArrowLeft className="w-3.5 h-3.5" aria-hidden />{tr.prev}</ActionButton>
          <ActionButton variant="secondary" className="flex-1 justify-center" onClick={() => go(idx + 1)}>{tr.next}<ArrowRight className="w-3.5 h-3.5" aria-hidden /></ActionButton>
          <ActionButton variant="secondary" className="flex-1 justify-center" onClick={() => {
            const nextUn = filtered.findIndex((r, i2) => i2 > idx && !repo.getEntry(r.itemId));
            go(nextUn >= 0 ? nextUn : idx + 1);
          }}>{tr.nextUnreviewed}</ActionButton>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">{tr.notApproved}</p>
      </div>

      {/* エクスポート／インポート（§16） */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex gap-2 mb-2">
          <ActionButton variant="secondary" className="flex-1 justify-center" onClick={doExport}><Download className="w-3.5 h-3.5" aria-hidden />{tr.exportBtn}</ActionButton>
          <ActionButton variant="secondary" className="flex-1 justify-center" onClick={() => {
            const ok = repo.importJson(importText);
            setImportMsg(ok ? 'ok' : 'fail');
            if (ok) { setImportText(''); bump(); }
          }}><Upload className="w-3.5 h-3.5" aria-hidden />{tr.importBtn}</ActionButton>
        </div>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={2}
          placeholder={tr.importPlaceholder} aria-label={tr.importBtn}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
        {importMsg && <p className={`text-xs mt-1 ${importMsg === 'ok' ? 'text-emerald-700' : 'text-red-600'}`} aria-live="polite">{importMsg === 'ok' ? tr.importOk : tr.importFail}</p>}
        {/* 全削除（確認つき・§12） */}
        <button type="button" className="min-h-10 mt-2 text-[11px] text-red-500 underline"
          onClick={() => { if (window.confirm(tr.clearConfirm)) { repo.reset(); bump(); } }}>{tr.clearAll}</button>
      </div>
    </div>
  );
};

export default VocabReviewPanel;
