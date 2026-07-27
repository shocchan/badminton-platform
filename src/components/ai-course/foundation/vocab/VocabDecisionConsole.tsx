// Decision Console（Phase 2E-1.7/2E-1.8・labPreview限定・lazy chunk）。
// 人間判断待ちを判断事項単位で確認し「ローカル判断ドラフト」を保存する画面。
// ここでの選択は human_reviewed / approved / 教材反映ではない（§0・バナーで常時明示）。
// 2E-1.8: 監査情報（provenance・独立/継承priority）・stale/orphaned検出・語彙詳細への導線・
// フィルター文脈の復元・role定義説明・バナー情報階層を追加。教材への書き込みは一切ない。
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { buildDecisionQueue, decisionQueueSummary } from '../../../../lib/aiLesson/course/vocabDecisionQueue';
import type { HumanDecisionItem, DecisionType } from '../../../../lib/aiLesson/course/vocabDecisionQueue';
import {
  createVocabDecisionRepository, DECISION_STATUSES, classifyDraftEntry,
} from '../../../../lib/aiLesson/course/vocabDecisionStore';
import type { DecisionDraftStatus, ImportPreview, DraftFreshness } from '../../../../lib/aiLesson/course/vocabDecisionStore';
import { DECISION_I18N } from './vocabReviewI18n';

interface Props { t: AiCourseDict; onBack: () => void; onOpenItem?: (itemId: string) => void }

const PRIO_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700', P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-amber-50 text-amber-700', P3: 'bg-gray-100 text-gray-500',
};
// フィルター等のUI文脈（§6.3・端末内のみ・PIIなし）
const UI_STATE_KEY = 'ai_course_decision_console_ui_v1';

export default function VocabDecisionConsole({ t, onBack, onOpenItem }: Props) {
  const td = t.locale === 'zh' ? DECISION_I18N.zh : DECISION_I18N.ja;
  const repo = useMemo(() => createVocabDecisionRepository(window.localStorage), []);
  const queue = useMemo(() => buildDecisionQueue(), []);
  const queueById = useMemo(() => new Map(queue.map((d) => [d.decisionId, d])), [queue]);
  const summary = useMemo(() => decisionQueueSummary(queue), [queue]);
  const saved = (() => { try { return JSON.parse(window.sessionStorage.getItem(UI_STATE_KEY) ?? '{}'); } catch { return {}; } })();
  const [tick, setTick] = useState(0);
  const [prio, setPrio] = useState<string>(saved.prio ?? 'all');
  const [type, setType] = useState<string>(saved.type ?? 'all');
  const [status, setStatus] = useState<string>(saved.status ?? 'all');
  const [q, setQ] = useState<string>(saved.q ?? '');
  const [openId, setOpenId] = useState<string | null>(saved.openId ?? null);
  const [choice, setChoice] = useState<DecisionDraftStatus | null>(null);
  const [note, setNote] = useState('');
  const [live, setLive] = useState('');
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMsg, setImportMsg] = useState('');
  useEffect(() => {
    try { window.sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ prio, type, status, q, openId })); } catch { /* 保存失敗は無視（UI文脈のみ） */ }
  }, [prio, type, status, q, openId]);

  const drafts = repo.getAll();
  const statusOf = (id: string): DecisionDraftStatus => drafts[id]?.status ?? 'pending';
  const freshnessOf = (id: string): DraftFreshness => {
    const e = drafts[id];
    if (!e) return 'current';
    const item = queueById.get(id);
    return classifyDraftEntry(e, item ? { currentValueJa: item.currentValueJa, proposedValueJa: item.proposedValueJa } : undefined);
  };
  const orphanedIds = Object.keys(drafts).filter((id) => !queueById.has(id));
  const staleIds = Object.keys(drafts).filter((id) => queueById.has(id) && freshnessOf(id) !== 'current');
  const filtered = queue.filter((d) =>
    (prio === 'all' || d.priority === prio)
    && (type === 'all' || d.decisionType === type)
    && (status === 'all' || statusOf(d.decisionId) === status)
    && (q === '' || d.wordJa.includes(q) || d.itemId.includes(q)));

  const openDetail = (d: HumanDecisionItem) => {
    setOpenId(d.decisionId);
    setChoice(null);
    setNote(drafts[d.decisionId]?.reviewerNote ?? '');
  };
  const saveDraft = (d: HumanDecisionItem) => {
    if (!choice) return;
    repo.setStatus(d.decisionId, choice, note.trim() || undefined,
      { currentValueJa: d.currentValueJa, proposedValueJa: d.proposedValueJa });
    setLive(repo.lastSaveFailed() ? td.saveFailed : td.saved);
    setChoice(null);
    setTick(tick + 1);
  };
  const goNext = (d: HumanDecisionItem) => {
    const i = filtered.findIndex((x) => x.decisionId === d.decisionId);
    const next = filtered[i + 1] ?? filtered[0];
    if (next && next.decisionId !== d.decisionId) openDetail(next); else setOpenId(null);
  };
  const zhLang = (dt: DecisionType) => (dt === 'meaning_zh' ? 'zh-CN' : undefined);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={onBack} aria-label={td.backToList}
          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500">
          <ArrowLeft className="w-4 h-4" aria-hidden />
        </button>
        <h2 className="text-base font-bold text-gray-900">{td.title}</h2>
      </div>
      {/* 判断ドラフト＝教材未反映（主メッセージ常時＋補足は展開・§12。安全性の文言は削除しない） */}
      <div className="text-[11px] leading-relaxed bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5 mb-3">
        <p className="font-bold">{td.banner}</p>
        <details className="mt-1">
          <summary className="cursor-pointer underline">{td.bannerMore}</summary>
          <p className="mt-1">{td.banner2}</p>
        </details>
      </div>
      <p className="text-xs text-gray-600 font-mono mb-0.5">{td.summary(summary.wordCount, summary.itemCount)}</p>
      <p className="text-[11px] text-gray-400 mb-1">{td.prioLegend(summary.independentPriorityCount, summary.inheritedPriorityCount)}</p>
      {(staleIds.length > 0 || orphanedIds.length > 0) && (
        <p role="status" className="text-[11px] text-orange-700 mb-1">{td.importWarn(staleIds.length, orphanedIds.length, 0)}</p>
      )}
      <div aria-live="polite" className="text-[11px] text-emerald-700 min-h-4 mb-1">{live}</div>

      {/* フィルター（語数と判断事項数は上で分離表示・§7） */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="text-[11px] text-gray-500">{td.filterPriority}
          <select value={prio} onChange={(e) => setPrio(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{td.all}</option>
            {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => <option key={p} value={p}>{p}（{summary.byPriority[p]}）</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{td.filterType}
          <select value={type} onChange={(e) => setType(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{td.all}</option>
            {(Object.keys(summary.byType) as DecisionType[]).map((k) => <option key={k} value={k}>{td.types[k]}（{summary.byType[k]}）</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{td.filterStatus}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{td.all}</option>
            {DECISION_STATUSES.map((s) => <option key={s} value={s}>{td.statuses[s]}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{td.searchLabel}
          <input value={q} onChange={(e) => setQ(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-2 bg-white w-28" />
        </label>
      </div>

      {filtered.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{td.empty}</p>}
      <ul className="space-y-2">
        {filtered.map((d) => {
          const st = statusOf(d.decisionId);
          const fresh = freshnessOf(d.decisionId);
          const open = openId === d.decisionId;
          const pv = d.provenance;
          return (
            <li key={d.decisionId} className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIO_BADGE[d.priority]}`}
                  title={pv.priorityInheritedFromWord ? td.prioInherited : td.prioIndependent}>
                  {d.priority}{pv.priorityInheritedFromWord ? '†' : ''}
                </span>
                <span className="text-sm font-bold text-gray-900">{d.wordJa}</span>
                <span className="text-[11px] text-gray-500">{td.types[d.decisionType]}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${st === 'pending' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-700'}`}>
                  {td.statuses[st]}{st !== 'pending' ? `・${td.notReflected}` : ''}
                </span>
                {fresh !== 'current' && <span className="text-[10px] text-orange-700">{td.freshness[fresh]}</span>}
                <button type="button" onClick={() => (open ? setOpenId(null) : openDetail(d))} aria-expanded={open}
                  className="ml-auto min-h-9 px-3 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{td.detailOpen}</button>
              </div>
              {open && (
                <div className="mt-3 border-t border-gray-100 pt-3 space-y-2 text-xs text-gray-700">
                  <p><span className="font-bold text-gray-500">{td.current}: </span><span lang={zhLang(d.decisionType)}>{d.currentValueJa}</span></p>
                  <p><span className="font-bold text-gray-500">{td.proposed}: </span><span lang={zhLang(d.decisionType)}>{d.proposedValueJa}</span></p>
                  <p><span className="font-bold text-gray-500">{td.source}: </span>{d.proposalSource}</p>
                  <p><span className="font-bold text-gray-500">{td.reason}: </span>{d.reasonJa}</p>
                  <p><span className="font-bold text-gray-500">{td.impactCurrent}: </span>{d.impactAreas.join('・')}</p>
                  {d.impactFutureAreas.length > 0 && (
                    <p><span className="font-bold text-gray-500">{td.impactFuture}: </span>{d.impactFutureAreas.join('・')}</p>
                  )}
                  {d.decisionType === 'role' && (
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="font-bold text-gray-500 mb-0.5">{td.roleHelpHeading}</p>
                      <p>{td.roleHelp}</p>
                    </div>
                  )}
                  {/* 監査情報（§4・折りたたみ） */}
                  <details className="bg-gray-50 rounded-lg p-2">
                    <summary className="cursor-pointer text-[11px] text-gray-500">{td.provenanceHeading}</summary>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      <dt className="text-gray-400">{td.provenance.sourceReview}</dt><dd>{pv.sourceReview}</dd>
                      <dt className="text-gray-400">{td.provenance.sourceField}</dt><dd>{pv.sourceField}</dd>
                      <dt className="text-gray-400">{td.provenance.sourceConfidence}</dt><dd>{pv.sourceConfidence}</dd>
                      <dt className="text-gray-400">{td.provenance.sourcePriority}</dt><dd>{pv.sourcePriority}</dd>
                      <dt className="text-gray-400">{td.provenance.independentPriority}</dt>
                      <dd>{pv.independentPriority}（{pv.priorityInheritedFromWord ? td.prioInherited : td.prioIndependent}）</dd>
                      <dt className="text-gray-400">{td.provenance.derivationRule}</dt><dd>{pv.derivationRule}</dd>
                      <dt className="text-gray-400">{td.provenance.datasetVersion}</dt><dd>{pv.datasetVersion}</dd>
                    </dl>
                  </details>
                  {/* 状態の選択（radio）→保存の2段階。誤クリックで即確定しない（§8） */}
                  <fieldset className="border border-gray-100 rounded-lg p-2">
                    <legend className="text-[11px] text-gray-500 px-1">{td.filterStatus}</legend>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {DECISION_STATUSES.filter((s) => s !== 'superseded').map((s) => (
                        <label key={s} className="flex items-center gap-1 min-h-8">
                          <input type="radio" name={`st-${d.decisionId}`} value={s}
                            checked={(choice ?? statusOf(d.decisionId)) === s} onChange={() => setChoice(s)} />
                          <span>{td.statuses[s]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-[11px] text-gray-500">{td.noteLabel}
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      className="mt-1 w-full text-xs border border-gray-200 rounded-lg p-2" />
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => saveDraft(d)} disabled={!choice} aria-disabled={!choice}
                      className={`min-h-10 px-3 text-xs font-bold rounded-lg ${choice ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{td.save}</button>
                    <button type="button" onClick={() => { repo.reopen(d.decisionId); setChoice(null); setLive(td.saved); setTick(tick + 1); }}
                      className="min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-lg">{td.reopen}</button>
                    <button type="button" onClick={() => goNext(d)}
                      className="min-h-10 px-3 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{td.nextItem}</button>
                    {onOpenItem && (
                      <button type="button" onClick={() => onOpenItem(d.itemId)}
                        className="min-h-10 px-3 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{td.openWord}</button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* export / import（§6・§13・importはプレビュー→merge/replace選択。replaceは確認） */}
      <div className="mt-5 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setExportJson(repo.exportJson(queue.map((d) => d.decisionId)))}
            className="min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-lg">{td.exportBtn}</button>
          <button type="button"
            onClick={() => { if (window.confirm(td.clearConfirm)) { repo.reset(); setTick(tick + 1); } }}
            className="min-h-10 px-3 text-xs text-red-600 border border-red-100 rounded-lg">{td.clearAll}</button>
        </div>
        {exportJson !== null && (
          <textarea readOnly value={exportJson} rows={5} aria-label={td.exportBtn}
            className="w-full text-[10px] font-mono border border-gray-200 rounded-lg p-2" />
        )}
        <label className="block text-[11px] text-gray-500">{td.importPlaceholder}
          <textarea value={importText} onChange={(e) => { setImportText(e.target.value); setPreview(null); }} rows={3}
            className="mt-1 w-full text-[10px] font-mono border border-gray-200 rounded-lg p-2" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            onClick={() => {
              setPreview(repo.previewImport(importText, new Set(queue.map((d) => d.decisionId)),
                new Map(queue.map((d) => [d.decisionId, { currentValueJa: d.currentValueJa, proposedValueJa: d.proposedValueJa }]))));
              setImportMsg('');
            }}
            className="min-h-10 px-3 text-xs text-gray-600 border border-gray-200 rounded-lg">{td.importBtn}</button>
          {preview && !preview.ok && <span role="alert" className="text-[11px] text-red-600">{preview.errorJa}</span>}
          {preview?.ok && (
            <>
              <span className="text-[11px] text-gray-600">
                {td.importPreview(preview.addCount ?? 0, preview.overwriteCount ?? 0)}
                {preview.exportedAt ? `（${td.exportedAtLabel}: ${preview.exportedAt.slice(0, 16)}）` : ''}
              </span>
              {((preview.staleCount ?? 0) > 0 || (preview.orphanedCount ?? 0) > 0 || (preview.incompatibleCount ?? 0) > 0) && (
                <span role="status" className="text-[11px] text-orange-700 w-full">
                  {td.importWarn(preview.staleCount ?? 0, preview.orphanedCount ?? 0, preview.incompatibleCount ?? 0)}
                </span>
              )}
              <button type="button" onClick={() => { repo.applyImport(preview, 'merge'); setImportMsg(td.importDone); setPreview(null); setTick(tick + 1); }}
                className="min-h-9 px-2.5 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{td.importMerge}</button>
              <button type="button" onClick={() => { if (window.confirm(td.replaceConfirm)) { repo.applyImport(preview, 'replace'); setImportMsg(td.importDone); setPreview(null); setTick(tick + 1); } }}
                className="min-h-9 px-2.5 text-xs text-red-600 border border-red-100 rounded-lg">{td.importReplace}</button>
            </>
          )}
          <span aria-live="polite" className="text-[11px] text-emerald-700">{importMsg}</span>
        </div>
      </div>
    </div>
  );
}
