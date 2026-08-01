// 問題バンク監査コンソール（CEO・管理者向け・**読み取り専用**）。
//
// 目的: 1問ずつ学習画面で見るのではなく、一覧・検索・抽出でまとめて確認する。
//
// 安全のために守っていること:
// - **production ビルドにはこの画面を含めない**（App.tsx 側で import.meta.env.MODE で除外）。
//   一般learnerのバンドルにはコードごと入らない
// - staging/local でも **ai_admins に載っている人だけ**が中身を見られる
// - この画面から教材データを**変更しない**。保存・編集の導線を一切持たない
// - 人間レビューの記録欄は列だけ用意し、値は空のまま（勝手に humanReviewed へ昇格しない）
import { Fragment, useEffect, useMemo, useState } from 'react';
import { isCourseAdmin } from '../../lib/aiLesson/course/courseAuth';

type Row = {
  questionId: string;
  bank: string;
  inN3: boolean; inN2: boolean;
  targetLevel: string; prerequisiteLevel: string;
  routeRole: string; readinessContribution: string;
  skill: string; questionType: string;
  sourceSenseId: string; targetWord: string; reading: string;
  questionJa: string; questionZh: string;
  choices: { id: string; text: string; correct: boolean }[];
  correctChoiceId: string; correctChoicePosition: number;
  explanationJa: string; explanationZh: string;
  difficulty: number; reviewState: string; sourceFile: string;
  warnings: { kind: string; severity: string; detailJa: string }[];
};

const PAGE_SIZES = [50, 100, 200] as const;

/** enabled が false の間は教材を読み込まない（管理者でない人に1万問を配らない） */
const useQuestionRows = (enabled: boolean) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        // 教材データは重いので、この画面を開いたときだけ読み込む
        const [{ vocabPool }, { loadGrammarPools }, bank, content, audit] = await Promise.all([
          import('../../lib/aiLesson/course/adventure/vocab/vocabQuestions'),
          import('../../lib/aiLesson/course/adventure/advContent'),
          import('../../lib/aiLesson/course/adventure/vocab/content/vocabContentBank'),
          import('../../lib/aiLesson/course/adventure/vocab/vocabContent'),
          import('../../lib/aiLesson/course/adventure/questionAudit'),
        ]);
        const flat = (m: Map<string, unknown[]>) => [...m.values()].flat() as never[];
        const n3 = flat(vocabPool('N3') as never);
        const n2 = flat(vocabPool('N2') as never);
        const unit = flat((await loadGrammarPools()).byItem as never);
        const n3Ids = new Set(n3.map((q: never) => (q as { key: string }).key));
        const n2Ids = new Set(n2.map((q: never) => (q as { key: string }).key));

        const all = content.activeContent(bank.ALL_VOCAB_CONTENT);
        const byWordId = new Map(bank.ALL_VOCAB_CONTENT.map((c) => [c.wordId, c]));
        const activeSurfaces = new Set(all.map((c) => `${c.surface}|${c.reading}`));
        const realReadings = new Set(all.map((c) => c.reading));
        const seenQuestionText = new Map<string, string>();
        const seenChoiceSet = new Map<string, string>();

        const universe = new Map<string, { q: never; bank: string }>();
        for (const q of n2) universe.set((q as { key: string }).key, { q, bank: 'core-vocabulary' });
        for (const q of n3) if (!universe.has((q as { key: string }).key)) universe.set((q as { key: string }).key, { q, bank: 'core-vocabulary' });
        for (const q of unit) {
          const k = (q as { key: string }).key;
          if (universe.has(k)) continue;
          universe.set(k, { q, bank: (q as { skill: string }).skill === 'charactersVocabulary' ? 'unit-vocabulary' : 'unit-grammar' });
        }

        const out: Row[] = [];
        for (const [id, { q, bank: bk }] of universe) {
          const qq = q as never as {
            key: string; type: string; level: string; skill: string; questionJa: string; questionZh?: string;
            choices: { choiceId: string; textJa: string; isCorrect: boolean }[];
            explanation?: { whyCorrectJa?: string; whyCorrectZh?: string };
            sourceItemId?: string; difficulty: number; reviewState?: string; targetJapanese?: string | null;
          };
          const c = byWordId.get(qq.sourceItemId ?? '');
          const ws = audit.analyzeQuestion(q as never, {
            wordLevel: c?.level ?? null, inN2: n2Ids.has(id),
            activeSurfaces, realReadings, seenQuestionText, seenChoiceSet,
          });
          const wordLevel = c?.level ?? '';
          const role = bk === 'core-vocabulary'
            ? (!n2Ids.has(id) ? { r: 'n3-core', rc: 'n3' }
              : (wordLevel === 'N2' || wordLevel === 'N1') ? { r: 'n2-core', rc: 'n2' }
                : { r: 'n2-foundation-support', rc: 'n3-or-below' })
            : { r: 'unit', rc: qq.level === 'n2' ? 'n2' : 'n3' };
          out.push({
            questionId: qq.key, bank: bk, inN3: n3Ids.has(id), inN2: n2Ids.has(id),
            targetLevel: wordLevel || qq.level, prerequisiteLevel: wordLevel || qq.level,
            routeRole: role.r, readinessContribution: role.rc,
            skill: qq.skill ?? '', questionType: qq.type,
            sourceSenseId: qq.sourceItemId ?? '', targetWord: c?.surface ?? qq.targetJapanese ?? '',
            reading: c?.reading ?? '',
            // 聴解など設問文が無い形式もあるので、表示側で落ちないよう空文字に寄せる
            questionJa: qq.questionJa ?? '', questionZh: qq.questionZh ?? '',
            choices: (qq.choices ?? []).map((x) => ({ id: x.choiceId, text: x.textJa ?? '', correct: x.isCorrect })),
            correctChoiceId: qq.choices.find((x) => x.isCorrect)?.choiceId ?? '',
            correctChoicePosition: qq.choices.findIndex((x) => x.isCorrect) + 1,
            explanationJa: qq.explanation?.whyCorrectJa ?? '', explanationZh: qq.explanation?.whyCorrectZh ?? '',
            difficulty: qq.difficulty, reviewState: qq.reviewState ?? '',
            sourceFile: bk === 'core-vocabulary'
              ? `vocab/content/coreBatch${String(c?.batchNo ?? 0).padStart(2, '0')}.ts`
              : 'adventure/advContent.ts（単元・文法）',
            warnings: ws,
          });
        }
        if (alive) setRows(out);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'load failed');
      }
    })();
    return () => { alive = false; };
  }, [enabled]);
  return { rows, error };
};

const chip = 'rounded-full border px-2 py-0.5 text-[11px]';

/** ai_admins に載っている人だけ。staging でもURLを知っているだけでは見られない */
const useAdminGate = () => {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void isCourseAdmin().then((v) => { if (alive) setOk(v); }).catch(() => { if (alive) setOk(false); });
    return () => { alive = false; };
  }, []);
  return ok;
};

export default function QuestionBankConsole() {
  const admin = useAdminGate();
  const { rows, error } = useQuestionRows(admin === true);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<'all' | 'n3' | 'n2' | 'n2only'>('all');
  const [bank, setBank] = useState<'all' | 'core-vocabulary' | 'unit-vocabulary' | 'unit-grammar'>('all');
  const [type, setType] = useState('all');
  const [state, setState] = useState<'all' | 'active' | 'hold'>('all');
  const [diff, setDiff] = useState<'all' | '1' | '2' | '3'>('all');
  const [pos, setPos] = useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [warnOnly, setWarnOnly] = useState(false);
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [sample, setSample] = useState<string[] | null>(null);
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const types = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.questionType))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (sample && !sample.includes(r.questionId)) return false;
      if (level === 'n3' && !r.inN3) return false;
      if (level === 'n2' && !r.inN2) return false;
      if (level === 'n2only' && !(r.inN2 && !r.inN3)) return false;
      if (bank !== 'all' && r.bank !== bank) return false;
      if (type !== 'all' && r.questionType !== type) return false;
      if (state === 'active' && !['validated_beta', 'authored'].includes(r.reviewState)) return false;
      if (state === 'hold' && ['validated_beta', 'authored'].includes(r.reviewState)) return false;
      if (diff !== 'all' && String(r.difficulty) !== diff) return false;
      if (pos !== 'all' && String(r.correctChoicePosition) !== pos) return false;
      if (warnOnly && !r.warnings.some((w) => w.severity === 'defect')) return false;
      if (unreviewedOnly === false) { /* 全件 */ }
      if (!kw) return true;
      return [r.questionId, r.targetWord, r.reading, r.questionJa, r.questionZh,
        ...r.choices.map((c) => c.text), r.explanationJa, r.explanationZh]
        .some((v) => (v ?? '').toLowerCase().includes(kw));
    });
  }, [rows, q, level, bank, type, state, diff, pos, warnOnly, unreviewedOnly, sample]);

  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const drawSample = () => {
    if (!rows) return;
    const pool = [...rows];
    const picked: string[] = [];
    for (let i = 0; i < 100 && pool.length > 0; i += 1) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].questionId);
    }
    setSample(picked); setPage(0);
  };

  if (admin === null) return <div className="p-6 text-sm text-gray-600">権限を確認しています…</div>;
  if (!admin) {
    return (
      <div className="p-6 text-sm text-gray-700">
        この画面は管理者専用です。管理者アカウントでログインしてください。
      </div>
    );
  }
  if (error) return <div className="p-6 text-sm text-red-700">読み込みに失敗しました: {error}</div>;
  if (!rows) return <div className="p-6 text-sm text-gray-600">問題バンクを読み込んでいます…（1万問以上あるため数秒かかります）</div>;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">問題バンク監査コンソール</h1>
      <p className="mt-1 text-sm text-gray-600">
        読み取り専用です。この画面から教材は変更できません。
        全 {rows.length.toLocaleString()} 問（questionId基準の一意件数）。
      </p>

      {/* ── 絞り込み ── */}
      <div className="mt-4 grid gap-2 rounded-xl border border-gray-200 bg-white p-3 lg:grid-cols-4">
        <label className="lg:col-span-2 text-sm">
          <span className="block text-xs text-gray-500">キーワード（設問・選択肢・解説・語）</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2" placeholder="例: 勉強 / 温泉 / べんきょう" />
        </label>
        <label className="text-sm"><span className="block text-xs text-gray-500">レベル</span>
          <select value={level} onChange={(e) => { setLevel(e.target.value as never); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option><option value="n3">N3に出る</option>
            <option value="n2">N2に出る</option><option value="n2only">N2のみ</option>
          </select></label>
        <label className="text-sm"><span className="block text-xs text-gray-500">バンク</span>
          <select value={bank} onChange={(e) => { setBank(e.target.value as never); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option><option value="core-vocabulary">CORE（層C）</option>
            <option value="unit-vocabulary">単元（文字・語彙）</option><option value="unit-grammar">単元（文法）</option>
          </select></label>
        <label className="text-sm"><span className="block text-xs text-gray-500">問題形式</span>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        <label className="text-sm"><span className="block text-xs text-gray-500">状態</span>
          <select value={state} onChange={(e) => { setState(e.target.value as never); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option><option value="active">active</option><option value="hold">hold</option>
          </select></label>
        <label className="text-sm"><span className="block text-xs text-gray-500">難易度</span>
          <select value={diff} onChange={(e) => { setDiff(e.target.value as never); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
          </select></label>
        <label className="text-sm"><span className="block text-xs text-gray-500">正解位置（データ上）</span>
          <select value={pos} onChange={(e) => { setPos(e.target.value as never); setPage(0); }}
            className="mt-1 w-full min-h-[40px] rounded-lg border border-gray-300 px-2">
            <option value="all">すべて</option><option value="1">1</option><option value="2">2</option>
            <option value="3">3</option><option value="4">4</option>
          </select></label>
        <div className="flex flex-wrap items-end gap-3 lg:col-span-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={warnOnly} onChange={(e) => { setWarnOnly(e.target.checked); setPage(0); }} />
            警告ありのみ
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={unreviewedOnly} onChange={(e) => { setUnreviewedOnly(e.target.checked); setPage(0); }} />
            人間未確認のみ（現在は全件が未確認）
          </label>
          <button type="button" onClick={drawSample}
            className="min-h-[40px] rounded-lg border border-blue-300 bg-blue-50 px-3 text-sm font-semibold text-blue-800">
            ランダム100問を抽出
          </button>
          {sample && (
            <button type="button" onClick={() => { setSample(null); setPage(0); }}
              className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm">抽出を解除</button>
          )}
          <label className="ml-auto text-sm">1ページ
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="ml-1 min-h-[40px] rounded-lg border border-gray-300 px-2">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>問
          </label>
        </div>
      </div>

      {/* ── ページ送り ── */}
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-gray-600">{filtered.length.toLocaleString()} 件 / {page + 1} ページ目（全 {pages}）</span>
        <span className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
            className="min-h-[40px] rounded-lg border border-gray-300 px-3 disabled:opacity-40">前へ</button>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}
            className="min-h-[40px] rounded-lg border border-gray-300 px-3 disabled:opacity-40">次へ</button>
        </span>
      </div>

      {/* ── 一覧 ── */}
      <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="p-2">questionId</th><th className="p-2">語</th><th className="p-2">形式</th>
              <th className="p-2">レベル</th><th className="p-2">routeRole</th><th className="p-2">難</th>
              <th className="p-2">正解位置</th><th className="p-2">警告</th><th className="p-2">設問</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const defects = r.warnings.filter((w) => w.severity === 'defect');
              return (
                <Fragment key={r.questionId}>
                  <tr className="border-t border-gray-100 align-top hover:bg-blue-50/40">
                    <td className="p-2">
                      <button type="button" onClick={() => setOpen(open === r.questionId ? null : r.questionId)}
                        className="text-left font-mono text-[11px] text-blue-700 underline">
                        {r.questionId}
                      </button>
                      <button type="button" title="questionIdをコピー"
                        onClick={() => { void navigator.clipboard?.writeText(r.questionId); }}
                        className="ml-1 text-[11px] text-gray-400">⧉</button>
                    </td>
                    <td className="p-2">{r.targetWord}<span className="ml-1 text-xs text-gray-500">{r.reading}</span></td>
                    <td className="p-2 text-xs">{r.questionType}</td>
                    <td className="p-2 text-xs">
                      {r.targetLevel}
                      <span className="ml-1 text-gray-400">{r.inN3 ? 'N3' : ''}{r.inN2 ? '/N2' : ''}</span>
                    </td>
                    <td className="p-2 text-xs">{r.routeRole}</td>
                    <td className="p-2 text-xs">{r.difficulty}</td>
                    <td className="p-2 text-xs">{r.correctChoicePosition}</td>
                    <td className="p-2">
                      {defects.length === 0
                        ? <span className="text-xs text-gray-300">—</span>
                        : <span className={`${chip} border-amber-300 bg-amber-50 text-amber-900`}>{defects.length}</span>}
                    </td>
                    <td className="p-2 text-xs text-gray-700">{r.questionJa.slice(0, 40)}</td>
                  </tr>
                  {open === r.questionId && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={9} className="p-3 text-xs">
                        <dl className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
                          <div><dt className="inline text-gray-500">設問(ja): </dt><dd className="inline">{r.questionJa}</dd></div>
                          <div><dt className="inline text-gray-500">設問(zh): </dt><dd className="inline">{r.questionZh || '—'}</dd></div>
                          <div className="lg:col-span-2">
                            <dt className="text-gray-500">選択肢</dt>
                            <dd><ol className="list-decimal pl-5">
                              {r.choices.map((c) => (
                                <li key={c.id} className={c.correct ? 'font-bold text-emerald-800' : ''}>
                                  {c.text}{c.correct ? '（正解）' : ''}<span className="ml-1 text-gray-400">{c.id}</span>
                                </li>
                              ))}
                            </ol></dd>
                          </div>
                          <div><dt className="inline text-gray-500">解説(ja): </dt><dd className="inline">{r.explanationJa || '—'}</dd></div>
                          <div><dt className="inline text-gray-500">解説(zh): </dt><dd className="inline">{r.explanationZh || '—'}</dd></div>
                          <div><dt className="inline text-gray-500">sourceSenseId: </dt><dd className="inline font-mono">{r.sourceSenseId || '—'}</dd></div>
                          <div><dt className="inline text-gray-500">source file: </dt><dd className="inline font-mono">{r.sourceFile}</dd></div>
                          <div><dt className="inline text-gray-500">prerequisiteLevel: </dt><dd className="inline">{r.prerequisiteLevel}</dd></div>
                          <div><dt className="inline text-gray-500">readinessContribution: </dt><dd className="inline">{r.readinessContribution}</dd></div>
                          <div><dt className="inline text-gray-500">reviewState: </dt><dd className="inline">{r.reviewState}</dd></div>
                          <div><dt className="inline text-gray-500">人間レビュー: </dt><dd className="inline text-gray-400">未記録（この画面からは変更しません）</dd></div>
                        </dl>
                        {r.warnings.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {r.warnings.map((w) => (
                              <li key={w.kind} className={w.severity === 'defect' ? 'text-amber-900' : 'text-gray-500'}>
                                [{w.severity}] {w.kind} — {w.detailJa}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
