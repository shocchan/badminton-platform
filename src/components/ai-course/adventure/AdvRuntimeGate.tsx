// 学習ランタイムの入口（Phase 3・Phase 4）。
//
// AdvShell を包み、利用権の状態ごとに正しい画面へ振り分ける:
//   利用権なし     → 料金ページへの案内
//   未開始         → 24時間体験の開始確認（開始期限つき）
//   active         → セッション発行 + アクティブ時間計測 + 二重タブ制御 + 残り表示
//   使い切り/期限切れ → 進捗保持の明示 + 再購入 + 1か月アップセル（頻度制限つき）
//
// 教材の強制はサーバー側（Worker）が行う。この画面は「正しい案内」を出す係で、
// これを迂回しても教材は取れない。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Learner } from '../../../lib/aiLesson/course/types';
import { readAdvProfile } from '../../../lib/aiLesson/course/adventure/advProfile';
import { currentStageOf } from '../../../lib/aiLesson/course/adventure/advRoute';
import { masteredTargetIds } from '../../../lib/aiLesson/course/adventure/advMastery';
import {
  currentEntitlement, issueRuntimeSession, startActiveTimeTracker, startTabGuard,
  recordActivation, readConsumedSeconds, type IssuedSession,
} from '../../../lib/aiLesson/course/adventure/runtimeSession';
import { activateTrial } from '../../../lib/aiLesson/course/sales/trialActivation';
import { salesPlanById } from '../../../lib/aiLesson/course/sales/planConfig';
import { decideUpsell, upsellCopy, recordImpression, type UpsellImpression, type UpsellContext } from '../../../lib/aiLesson/course/sales/upsell';
import { AdvRuntimeProvider, type AdvRuntime } from './AdvRuntimeContext';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);
const primaryBtn = 'w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white';
const card = 'rounded-2xl border border-gray-200 bg-white p-4';

const IMPRESSIONS_KEY = 'ai_course_upsell_impressions_v1';
const readImpressions = (): UpsellImpression[] => {
  try { return JSON.parse(localStorage.getItem(IMPRESSIONS_KEY) ?? '[]') as UpsellImpression[]; } catch { return []; }
};
const writeImpressions = (list: UpsellImpression[]): void => {
  try { localStorage.setItem(IMPRESSIONS_KEY, JSON.stringify(list.slice(-50))); } catch { /* noop */ }
};

const fmtRemaining = (sec: number, lang: L): string => {
  const m = Math.max(0, Math.floor(sec / 60));
  return lang === 'zh' ? `剩余${m}分钟` : `残り${m}分`;
};

const fmtDateTime = (ms: number, lang: L): string =>
  new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface AdvRuntimeGateProps {
  lang: L;
  learner: Learner;
  children: React.ReactNode;
}

type GateState =
  | { kind: 'loading' }
  | { kind: 'no_entitlement' }
  | { kind: 'unstarted'; grantId: string; startDeadlineMs: number }
  | { kind: 'start_lapsed' }
  | { kind: 'active'; session: IssuedSession }
  | { kind: 'consumed' }
  | { kind: 'expired' }
  | { kind: 'takeover' }
  | { kind: 'session_unavailable' };

export function AdvRuntimeGate({ lang, learner, children }: AdvRuntimeGateProps) {
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const trackerRef = useRef<ReturnType<typeof startActiveTimeTracker> | null>(null);
  const guardRef = useRef<ReturnType<typeof startTabGuard> | null>(null);
  const sessionRef = useRef<IssuedSession | null>(null);

  /** 開放済みターゲット: 現在stageまでのunit/文法ID（N2単元はサーバーが展開） */
  const allowed = useMemo(() => {
    const profile = readAdvProfile(learner.settings);
    if (!profile?.route) return { targetIds: [] as string[], n2Units: [] as number[], level: 'n3' as const };
    const mastered = masteredTargetIds(profile.mastery, new Date().toISOString());
    const current = currentStageOf(profile.route, mastered) ?? profile.route.stages[profile.route.stages.length - 1];
    const currentIdx = profile.route.stages.findIndex((s) => s.stageId === current.stageId);
    const unlocked = profile.route.stages.slice(0, currentIdx + 1);
    const targetIds = new Set<string>();
    const n2Units = new Set<number>();
    for (const s of unlocked) {
      for (const u of s.targets.n3UnitIds ?? []) targetIds.add(u);
      for (const g of s.targets.n3GrammarIds ?? []) targetIds.add(g);
      for (const n of s.targets.n2Units ?? []) n2Units.add(n);
    }
    return {
      targetIds: [...targetIds],
      n2Units: [...n2Units],
      level: (profile.targetJlpt === 'N3' ? 'n3' : 'n2') as 'n2' | 'n3',
    };
  }, [learner.settings]);

  const resolveAndIssue = useCallback(async () => {
    const ent = currentEntitlement();
    if (ent.kind === 'none' || !ent.trial) { setState({ kind: 'no_entitlement' }); return; }
    const { grant, resolution } = ent.trial;
    switch (resolution.state) {
      case 'unstarted':
        setState({ kind: 'unstarted', grantId: grant.id, startDeadlineMs: grant.startDeadlineMs });
        return;
      case 'start_lapsed': setState({ kind: 'start_lapsed' }); return;
      case 'consumed': setState({ kind: 'consumed' }); return;
      case 'expired': setState({ kind: 'expired' }); return;
      case 'active': break;
    }
    // 診断前（route未生成）は診断・オンボーディングだけ許可されればよい
    const session = await issueRuntimeSession({
      level: allowed.level,
      allowedTargetIds: allowed.targetIds,
      allowedN2Units: allowed.n2Units,
    });
    if (!session) { setState({ kind: 'session_unavailable' }); return; }
    sessionRef.current = session;
    setRemainingSec(resolution.remainingActiveSeconds);
    setExpiresAtMs(grant.activation ? grant.activation.expiresAtMs : null);
    setState({ kind: 'active', session });
  }, [allowed]);

  useEffect(() => {
    // 判定→setState はこの effect の同期パスで行わない（cascading render 防止）
    const t = window.setTimeout(() => { void resolveAndIssue(); }, 0);
    return () => window.clearTimeout(t);
  }, [resolveAndIssue]);

  // active 中: 計測・二重タブ・残り時間の更新
  useEffect(() => {
    if (state.kind !== 'active') return;
    const guard = startTabGuard();
    guardRef.current = guard;
    guard.onTakeover(() => setState({ kind: 'takeover' }));

    const ent = currentEntitlement();
    const granted = ent.trial?.grant.includedActiveSeconds ?? 3600;
    const tracker = startActiveTimeTracker((consumed) => {
      const left = Math.max(0, granted - consumed);
      setRemainingSec(left);
      if (left <= 0) {
        // 使い切り。**新しい教材はサーバーが拒否する**。画面も締めに行く
        setState({ kind: 'consumed' });
      }
    });
    tracker.setLearning(true);
    trackerRef.current = tracker;

    // 24時間の絶対期限もclient側で監視（サーバーは毎リクエスト拒否する。これは表示用）
    const expiryTimer = window.setInterval(() => {
      const now = Date.now();
      const exp = sessionRef.current && expiresAtMs;
      if (exp && now > exp) setState({ kind: 'expired' });
    }, 30_000);

    return () => {
      tracker.stop();
      guard.stop();
      window.clearInterval(expiryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  const refreshSession = useCallback(async () => {
    const s = await issueRuntimeSession({
      level: allowed.level, allowedTargetIds: allowed.targetIds, allowedN2Units: allowed.n2Units,
    });
    if (s) {
      sessionRef.current = s;
      setState({ kind: 'active', session: s });
    }
  }, [allowed]);

  const runtime: AdvRuntime | null = useMemo(() => {
    if (state.kind !== 'active') return null;
    return {
      auth: state.session.auth,
      refreshSession,
      consumedSeconds: () => trackerRef.current?.consumedSeconds() ?? readConsumedSeconds(),
      tabActive: () => guardRef.current?.isActive() ?? true,
    };
  }, [state, refreshSession]);

  // ── 状態別画面 ──

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <p className="text-sm text-gray-500">{tx(lang, '利用状況を確認しています…', '正在确认使用状态…')}</p>
      </div>
    );
  }

  if (state.kind === 'no_entitlement') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, '利用権がありません', '当前没有可用的使用权')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {tx(lang, '60分パス（600円）から気軽に始められます。学習の進捗はアカウントに残ります。',
            '可以从60分钟通行证（600日元）轻松开始。学习进度会保存在账号里。')}
        </p>
        <Link to={`/${lang}/ai-course/plans`} className={`${primaryBtn} mt-6 block`}>
          {tx(lang, '料金プランを見る', '查看价格方案')}
        </Link>
      </div>
    );
  }

  if (state.kind === 'unstarted') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, '60分パスを開始しますか？', '要开始60分钟通行证吗？')}</h2>
        <div className={`${card} mt-4`}>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>⏱ {tx(lang, '開始すると24時間、合計60分まで学習できます。', '开始后24小时内，最多可学习60分钟。')}</li>
            <li>📅 {tx(lang, `開始の期限：${fmtDateTime(state.startDeadlineMs, lang)}`, `开始期限：${fmtDateTime(state.startDeadlineMs, lang)}`)}</li>
            <li>💾 {tx(lang, '学習の進捗は時間が終わっても残ります。', '学习进度在时间结束后也会保留。')}</li>
            <li>😴 {tx(lang, '画面を閉じている間・操作していない間は減りません。', '关闭页面或没有操作的时间不会被扣。')}</li>
          </ul>
          <PreviewExpiryLine lang={lang} />
        </div>
        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => {
            const ent = currentEntitlement();
            if (!ent.trial) return;
            const plan = salesPlanById(ent.trial.grant.planId);
            if (!plan) return;
            const r = activateTrial(ent.trial.grant, plan, Date.now());
            if (r.ok && r.grant?.activation) {
              recordActivation(state.grantId, r.grant.activation.activatedAtMs, r.grant.activation.expiresAtMs);
              void resolveAndIssue();
            }
          }}>
          {tx(lang, '体験を始める（ここから24時間）', '开始体验(从现在起24小时)')}
        </button>
        <p className="mt-2 text-center text-xs text-gray-400">
          {tx(lang, '押すまで時間は始まりません。', '在按下之前，时间不会开始计算。')}
        </p>
      </div>
    );
  }

  if (state.kind === 'start_lapsed') {
    return (
      <EndedScreen lang={lang}
        title={tx(lang, '開始期限が過ぎました', '开始期限已过')}
        body={tx(lang, '購入から7日以内に開始する必要がありました。お問い合わせいただければ対応します。',
          '需要在购买后7天内开始。如有疑问请联系我们，我们会处理。')} />
    );
  }

  if (state.kind === 'consumed' || state.kind === 'expired') {
    return (
      <EndedScreen lang={lang}
        title={state.kind === 'consumed'
          ? tx(lang, '60分を使い切りました', '60分钟已用完')
          : tx(lang, '24時間の利用期限が終わりました', '24小时的使用期限已结束')}
        body={tx(lang, '学習の進捗・冒険マップ・復習の予定はすべて残っています。もう一度購入すると続きから再開できます。',
          '学习进度、冒险地图和复习计划都完整保留。再次购买即可从上次的进度继续。')}
        upsell />
    );
  }

  if (state.kind === 'takeover') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, '別のタブで学習中です', '正在其他标签页学习')}</h2>
        <p className="mt-2 text-sm text-gray-600">
          {tx(lang, '時間を二重に使わないため、学習は1つのタブだけで行えます。', '为了不重复扣时间，学习只能在一个标签页进行。')}
        </p>
        <button type="button" className={`${primaryBtn} mt-6`} onClick={() => window.location.reload()}>
          {tx(lang, 'このタブで続きをやる', '在这个标签页继续')}
        </button>
      </div>
    );
  }

  if (state.kind === 'session_unavailable') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10 text-center">
        <h2 className="text-lg font-bold text-gray-900">{tx(lang, '学習セッションを開始できません', '无法开始学习会话')}</h2>
        <p className="mt-2 text-sm text-gray-600">
          {tx(lang, 'ログイン状態と通信を確認して、もう一度開いてください。', '请确认登录状态和网络后重新打开。')}
        </p>
        <button type="button" className={`${primaryBtn} mt-6`} onClick={() => window.location.reload()}>
          {tx(lang, 'もう一度試す', '重试')}
        </button>
      </div>
    );
  }

  // ── active ──
  return (
    <AdvRuntimeProvider value={runtime}>
      {remainingSec !== null && (
        <div className={`mx-auto w-full max-w-xl px-4 pt-2 ${remainingSec <= 300 ? 'text-red-700' : 'text-gray-500'}`}
          role="status" aria-live="polite">
          <p className="text-right text-xs font-semibold">
            ⏱ {fmtRemaining(remainingSec, lang)}
            {expiresAtMs !== null && (
              <span className="ml-2 font-normal text-gray-400">
                {tx(lang, `〜${fmtDateTime(expiresAtMs, lang)}`, `〜${fmtDateTime(expiresAtMs, lang)}`)}
              </span>
            )}
          </p>
        </div>
      )}
      {remainingSec !== null && remainingSec <= 600 && (
        <ActiveUpsellBanner lang={lang} learner={learner}
          sessionId={state.session.auth.sessionToken?.slice(0, 16) ?? 'active'}
          remainingSec={remainingSec} />
      )}
      {children}
    </AdvRuntimeProvider>
  );
}

/**
 * active中のアップセル（§12: 残り10分以下）。
 * 条件は decideUpsell が持つ既存の頻度制限に委ねる:
 *   - 購入直後には出ない（activeMinutesUsed > 0 が trigger 側の条件）
 *   - 同一セッション1回まで（maxPerSession）
 *   - 「今はしない」後は cooldownDays 再表示しない
 *   - 生涯上限 maxLifetime
 * 1か月プランは価格未確定（priceStatus: 'draft'）のため、購入CTAではなく
 * 「準備状況を見る」への導線にする。確定後は自動で通常CTAに変わる。
 */
function ActiveUpsellBanner({ lang, learner, sessionId, remainingSec }: {
  lang: L; learner: Learner; sessionId: string; remainingSec: number;
}) {
  const [impressions, setImpressions] = useState<UpsellImpression[]>(readImpressions);
  const [dismissed, setDismissed] = useState(false);

  // 判断材料は表示された時点で確定（remainingSecの毎秒更新で再判定しない）
  const [ctx] = useState<UpsellContext>(() => {
    const profile = readAdvProfile(learner.settings);
    const consumed = readConsumedSeconds();
    return {
      sessionId, nowMs: Date.now(), currentPlanId: 'ai-hour-pass',
      firstAdventureCompleted: (profile?.questLog?.length ?? 0) > 0 || profile?.lastQuest != null,
      activeMinutesUsed: Math.round(consumed / 60),
      remainingMinutes: Math.floor(remainingSec / 60),
      entitlementExhausted: false,
      activeDays: 1, repeatedWeaknessCount: 0, examGoalDeclared: false,
      weakSkillCount: 0, humanHelpRequested: false,
    };
  });

  const decision = useMemo(() => decideUpsell(ctx, impressions), [ctx, impressions]);

  const shownRef = useRef(false);
  useEffect(() => {
    if (!decision.show || !decision.rule || shownRef.current) return;
    shownRef.current = true;
    const next = [...impressions, recordImpression(decision.rule, ctx, 'shown')];
    setImpressions(next);
    writeImpressions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.show]);

  if (!decision.show || !decision.rule || !decision.targetPlanId || dismissed) return null;
  const copy = upsellCopy(decision.targetPlanId, lang);
  const monthPlan = salesPlanById('ai-month');
  const priceConfirmed = monthPlan?.priceStatus === 'confirmed';

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-2">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4" role="status">
        <p className="text-sm font-bold text-gray-900">
          {tx(lang, '残り時間が少なくなりました', '剩余时间不多了')}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          {tx(lang,
            'ここまでの診断結果・冒険マップ・復習の予定・学習履歴は、1か月プランへそのまま引き継げます。',
            '到目前为止的诊断结果、冒险地图、复习计划和学习记录，都可以直接延续到1个月方案。')}
        </p>
        <div className="mt-3 space-y-2">
          <Link to={`/${lang}/ai-course/plans`}
            className="block w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-bold text-white">
            {priceConfirmed
              ? copy.acceptLabel
              : tx(lang, '1か月プランの準備状況を見る', '查看1个月方案的准备情况')}
          </Link>
          <Link to={`/${lang}/ai-course/plans`}
            className="block w-full min-h-[44px] rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-blue-700">
            {tx(lang, '60分を追加する', '再加60分钟')}
          </Link>
          <button type="button" className="w-full min-h-[40px] text-sm text-gray-500 underline"
            onClick={() => {
              const next = [...readImpressions(), recordImpression(decision.rule!, ctx, 'dismissed')];
              writeImpressions(next);
              setImpressions(next);
              setDismissed(true);
            }}>
            {copy.dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 使い切り・期限切れの共通画面。進捗保持を明示し、§12のアップセルを頻度制限つきで出す */
function EndedScreen({ lang, title, body, upsell }: { lang: L; title: string; body: string; upsell?: boolean }) {
  const [impressions, setImpressions] = useState<UpsellImpression[]>(readImpressions);

  // 判断材料は初回renderで確定させる（lazy initializer は impure でよい規約）
  const [upsellCtx] = useState<UpsellContext | null>(() => (upsell ? {
    sessionId: 'ended-screen', nowMs: Date.now(), currentPlanId: 'ai-hour-pass',
    firstAdventureCompleted: true, activeMinutesUsed: Math.round(readConsumedSeconds() / 60),
    remainingMinutes: 0, entitlementExhausted: true,
    activeDays: 1, repeatedWeaknessCount: 0, examGoalDeclared: false,
    weakSkillCount: 0, humanHelpRequested: false,
  } : null));

  const decision = useMemo(
    () => (upsellCtx ? decideUpsell(upsellCtx, impressions) : null),
    [upsellCtx, impressions],
  );

  const shownRef = useRef(false);
  useEffect(() => {
    if (!decision?.show || !decision.rule || !upsellCtx || shownRef.current) return;
    shownRef.current = true;
    // 出したら必ず記録する（頻度制限の根拠）
    const next = [...impressions, recordImpression(decision.rule, upsellCtx, 'shown')];
    setImpressions(next);
    writeImpressions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.show, upsellCtx]);

  const copy = decision?.show && decision.targetPlanId ? upsellCopy(decision.targetPlanId, lang) : null;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <h2 className="text-center text-lg font-bold text-gray-900">{title}</h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-gray-600">{body}</p>

      {copy && decision?.rule && (
        <div className={`${card} mt-6 border-blue-200 bg-blue-50`}>
          <p className="text-sm font-bold text-gray-900">{copy.heading}</p>
          <ul className="mt-1 space-y-0.5">
            {copy.points.map((p) => (
              <li key={p} className="text-sm leading-relaxed text-gray-700">・{p}</li>
            ))}
          </ul>
          <Link to={`/${lang}/ai-course/plans`} className={`${primaryBtn} mt-3 block text-center`}>
            {copy.acceptLabel}
          </Link>
          <button type="button" className="mt-2 w-full min-h-[44px] text-sm text-gray-500 underline"
            onClick={() => {
              if (!upsellCtx) return;
              const next = [...readImpressions(), recordImpression(decision.rule!, upsellCtx, 'dismissed')];
              writeImpressions(next);
              setImpressions(next);
            }}>
            {copy.dismissLabel}
          </button>
        </div>
      )}

      <div className="mt-6 space-y-2">
        <Link to={`/${lang}/ai-course/plans`}
          className="block w-full min-h-[48px] rounded-xl border border-blue-200 bg-white px-4 py-3 text-center text-base font-semibold text-blue-700">
          {tx(lang, 'もう一度購入する（進捗はそのまま）', '再次购买（进度保留）')}
        </Link>
      </div>
    </div>
  );
}

/** 「今始めると◯◯まで」の行。Date.now を render 中に呼ばないため effect で確定させる */
function PreviewExpiryLine({ lang }: { lang: L }) {
  const [expiresAt] = useState(() => Date.now() + 24 * 3600_000);
  return (
    <p className="mt-3 text-xs text-gray-500">
      {tx(lang, `今始めると ${fmtDateTime(expiresAt, lang)} まで使えます。`,
        `现在开始的话，可用到 ${fmtDateTime(expiresAt, lang)}。`)}
    </p>
  );
}

export default AdvRuntimeGate;
