// Learning Connectivity Inspector（Phase 2E-1.9・labPreview限定・lazy chunk・read-only）。
// 接続グラフの可視化のみ。教材・接続・判断への書き込みは一切ない。
// 状態は色だけに依存せずテキストで表示（§12）。graph可視化ライブラリは使わない（§13）。
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import {
  buildConnectivityGraph, connectivitySummary, auditDiagnosticCoverage, SURFACE_KEYS,
} from '../../../../lib/aiLesson/course/vocabConnectivity';
import type { ConnectivityStatus, SurfaceKey } from '../../../../lib/aiLesson/course/vocabConnectivity';
import { CONNECTIVITY_I18N } from './vocabReviewI18n';

interface Props {
  t: AiCourseDict;
  onBack: () => void;
  onOpenItem: (itemId: string) => void;
  onOpenDecisions: () => void;
}

const STATUS_BADGE: Record<ConnectivityStatus, string> = {
  connected: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  orphaned: 'bg-red-100 text-red-700',
  unverified: 'bg-gray-100 text-gray-500',
  intentionally_isolated: 'bg-indigo-50 text-indigo-700',
};

export default function VocabConnectivityInspector({ t, onBack, onOpenItem, onOpenDecisions }: Props) {
  const tc = t.locale === 'zh' ? CONNECTIVITY_I18N.zh : CONNECTIVITY_I18N.ja;
  const graph = useMemo(() => buildConnectivityGraph(), []);
  const summary = useMemo(() => connectivitySummary(graph), [graph]);
  const diag = useMemo(() => auditDiagnosticCoverage(), []);
  const [level, setLevel] = useState('all');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [surface, setSurface] = useState<'all' | SurfaceKey>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const roles = [...new Set(graph.words.map((w) => w.conversationRole))].sort();
  const filtered = graph.words.filter((w) =>
    (level === 'all' || w.levelGroup === level)
    && (role === 'all' || w.conversationRole === role)
    && (status === 'all' || (surface === 'all' ? w.overall === status : w.surfaces[surface].status === status))
    && (q === '' || w.wordJa.includes(q) || w.itemId.includes(q)));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={onBack} aria-label={t.locale === 'zh' ? '返回' : '戻る'}
          className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500">
          <ArrowLeft className="w-4 h-4" aria-hidden />
        </button>
        <h2 className="text-base font-bold text-gray-900">{tc.title}</h2>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-500 mb-2">{tc.intro}</p>
      <p className="text-xs text-gray-700 font-mono">{tc.summaryWords(summary.totalWords, summary.basics, summary.n3)}</p>
      <p className="text-[11px] text-gray-400 font-mono mb-1">{tc.edges(graph.edgeCount, graph.duplicateEdgeCount, graph.invalidReferences.length)}</p>
      {/* surface別サマリー（テキスト表示・色非依存） */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
        {SURFACE_KEYS.map((k) => {
          const c = summary.byStatusPerSurface[k];
          const parts = (Object.keys(c) as ConnectivityStatus[]).filter((st) => c[st] > 0).map((st) => `${tc.statuses[st]} ${c[st]}`);
          return (
            <div key={k} className="bg-white border border-gray-100 rounded-lg p-2">
              <p className="text-[11px] font-bold text-gray-700">{tc.surfaces[k]}</p>
              <p className="text-[10px] text-gray-500">{parts.join('・')}</p>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-600 mb-2"><span className="font-bold">{tc.diagHeading}: </span>
        {tc.diagLine(diag.poolQuestionTotal, diag.uniqueWordRefs, diag.ffProbeCount, diag.n3CoveragePct)}</p>

      <div className="flex flex-wrap gap-2 mb-2">
        <label className="text-[11px] text-gray-500">{tc.filterLevel}
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{tc.all}</option><option value="basics">{tc.basics}</option><option value="n3">{tc.n3}</option>
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{tc.filterRole}
          <select value={role} onChange={(e) => setRole(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{tc.all}</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{tc.filterSurface}
          <select value={surface} onChange={(e) => setSurface(e.target.value as 'all' | SurfaceKey)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{tc.all}</option>
            {SURFACE_KEYS.map((k) => <option key={k} value={k}>{tc.surfaces[k]}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{tc.filterStatus}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-1.5 bg-white">
            <option value="all">{tc.all}</option>
            {(Object.keys(tc.statuses)).map((s) => <option key={s} value={s}>{tc.statuses[s]}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-500">{tc.searchLabel}
          <input value={q} onChange={(e) => setQ(e.target.value)} className="block mt-0.5 min-h-9 text-xs border border-gray-200 rounded-lg px-2 bg-white w-24" />
        </label>
      </div>
      <p aria-live="polite" className="text-[11px] text-gray-400 mb-2">{tc.liveCount(filtered.length)}</p>

      {filtered.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{tc.empty}</p>}
      <ul className="space-y-1.5">
        {filtered.map((w) => {
          const open = openId === w.itemId;
          return (
            <li key={w.itemId} className="bg-white border border-gray-100 rounded-xl p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900">{w.wordJa}</span>
                <span className="text-[10px] text-gray-400">{w.levelGroup === 'n3' ? 'N3' : '基礎'}・{w.conversationRole}</span>
                {SURFACE_KEYS.map((k) => (
                  <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[w.surfaces[k].status]}`}>
                    {tc.surfaces[k]}:{tc.statuses[w.surfaces[k].status]}
                  </span>
                ))}
                <button type="button" onClick={() => setOpenId(open ? null : w.itemId)} aria-expanded={open}
                  className="ml-auto min-h-9 px-2.5 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{tc.detailOpen}</button>
              </div>
              {open && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-1.5 text-[11px] text-gray-700">
                  {SURFACE_KEYS.map((k) => {
                    const e = w.surfaces[k];
                    return (
                      <div key={k} className="bg-gray-50 rounded-lg p-2">
                        <p className="font-bold">{tc.surfaces[k]}: {tc.statuses[e.status]}（{tc.verification[e.verification]}）</p>
                        <p>{tc.reason}: {e.reasonJa}</p>
                        <p className="text-gray-500 break-all">{tc.evidence}: {e.evidence}</p>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => onOpenItem(w.itemId)}
                      className="min-h-9 px-2.5 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{tc.openWord}</button>
                    <button type="button" onClick={onOpenDecisions}
                      className="min-h-9 px-2.5 text-xs text-indigo-700 border border-indigo-100 rounded-lg">{tc.openDecisions}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
