// 「今日」タブ: 学習ファネル・再訪カード（Phase 1 計測基盤 2026-08-21）。
// 割合は必ず「n / 分母」の実数と併記する（人数が少ない段階で%だけが独り歩きしないため）。
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { fetchCourseFunnel } from '../../../lib/aiLesson/course/admin/adminFunnelApi';
import type { CourseFunnel } from '../../../lib/aiLesson/course/admin/adminFunnel';

const Row = ({ label, n, denom, warnWhenZero = false }: {
  label: string; n: number; denom: number | null; warnWhenZero?: boolean;
}) => (
  <li className="flex items-baseline justify-between gap-2 text-sm">
    <span className="text-gray-700">{label}</span>
    <span className={`tabular-nums font-bold ${warnWhenZero && n > 0 ? 'text-red-700' : 'text-gray-900'}`}>
      {n}
      {denom !== null && denom > 0 && (
        <span className="font-normal text-gray-500"> / {denom}（{Math.round((n / denom) * 100)}%）</span>
      )}
      {denom !== null && denom === 0 && <span className="font-normal text-gray-400"> / 0</span>}
    </span>
  </li>
);

/** error_occurred の where を日本語にする。知らない値はそのまま出す（隠さない） */
const ERROR_WHERE_JA: Record<string, string> = {
  checkout: '決済ページを開けなかった',
  trial_start: '体験を始められなかった',
  realtime: 'AI会話の接続',
  claim: '購入直後の自動ログイン',
  report: 'レポート生成',
};

export const AdminFunnelCard = () => {
  const [funnel, setFunnel] = useState<CourseFunnel | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCourseFunnel(30)
      .then((r) => { if (alive) { setFunnel(r.funnel); setFailed(r.failed); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500">
      ファネルを取得できませんでした（通信エラー）
    </div>
  );
  if (!funnel) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-400">ファネルを集計中…</div>
  );

  const p = funnel.purchase;
  const a = funnel.activity;
  const r = funnel.retention;
  const t = funnel.ttfv;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-blue-600" />学習ファネル
        </p>
        <p className="text-xs text-gray-500">直近{funnel.windowDays}日・本番決済のみ</p>
      </div>

      <p className="mt-2 text-xs font-bold text-gray-500">購入 → 学習開始</p>
      <ul className="mt-1 space-y-1">
        <Row label="決済完了" n={p.paid} denom={null} />
        <Row label="アカウント発行" n={p.provisioned} denom={p.paid} />
        <Row label="初回設定完了（名前入力）" n={p.setupDone} denom={p.provisioned} />
        <Row label="AI会話を開始" n={p.convStarted} denom={p.setupDone} />
      </ul>

      {/* Time to First Value（2026-08-26）。
          「買ってから、実際に日本語を話し始めるまで何分か」。
          n が小さいうちは平均を出さず中央値と実数だけ見る（外れ値1件で像が歪むため） */}
      <p className="mt-3 text-xs font-bold text-gray-500">買ってから話し始めるまで（TTFV）</p>
      <ul className="mt-1 space-y-1">
        <li className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-gray-700">中央値</span>
          <span className="tabular-nums font-bold text-gray-900">
            {t.medianMinutes === null
              ? <span className="font-normal text-gray-400">まだ測れません（0人）</span>
              : <>{t.medianMinutes}分<span className="font-normal text-gray-500">（{t.n}人）</span></>}
          </span>
        </li>
        <Row label="3分以内に開始" n={t.within3min} denom={t.n} />
        <Row label="買ったのに未開始" n={t.notStarted} denom={p.provisioned} warnWhenZero />
      </ul>

      {/* 学習者の前で起きた失敗（2026-08-26）。
          0件だと確認できて初めて「動いています」と言える。0件のときもそう出す */}
      <p className="mt-3 text-xs font-bold text-gray-500">学習者の前で起きた失敗</p>
      {funnel.errors.total === 0 ? (
        <p className="mt-1 text-sm text-emerald-700">0件</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {funnel.errors.byWhere.map((e) => (
            <li key={e.where} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-gray-700">{ERROR_WHERE_JA[e.where] ?? e.where}</span>
              <span className="tabular-nums font-bold text-red-700">{e.n}件</span>
            </li>
          ))}
        </ul>
      )}

      {/* 決済手段（2026-08-26）。中国語話者が支付宝/微信を使うかは集客判断に直結する */}
      <p className="mt-3 text-xs font-bold text-gray-500">決済手段</p>
      {funnel.paymentMethods.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400">本番決済はまだありません</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {funnel.paymentMethods.map((m) => (
            <Row key={m.method}
              label={m.method === 'card' ? 'カード'
                : m.method === 'alipay' ? 'Alipay（支付宝）'
                  : m.method === 'wechat_pay' ? 'WeChat Pay（微信支付）'
                    : `その他（${m.method}）`}
              n={m.paid} denom={m.started} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs font-bold text-gray-500">学習の質（全学習者）</p>
      <ul className="mt-1 space-y-1">
        <Row label="活動した人数" n={a.activeLearners} denom={null} />
        <Row label="会話 完了 / 開始" n={a.convCompleted} denom={a.convSessions} />
        <Row label="エラーで終わった会話" n={a.convErrors} denom={a.convSessions} warnWhenZero />
        <Row label="復習した人数" n={a.reviewLearners} denom={a.activeLearners} />
      </ul>

      <p className="mt-3 text-xs font-bold text-gray-500">再訪（この{funnel.windowDays}日で初活動した人）</p>
      <ul className="mt-1 space-y-1">
        <Row label="翌日も学習（D1）" n={r.d1} denom={r.base} />
        <Row label="7日以内に再学習（D7）" n={r.d7} denom={r.base} />
      </ul>

      {failed.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">⚠️ 一部の系列を取得できず0扱い: {failed.join(', ')}</p>
      )}
      <p className="mt-2 text-[11px] text-gray-400">
        活動日 = 会話・音声利用・アプリ利用イベントのいずれかがあった日（JST）。人数が少ない間は%より実数を見る。
      </p>
    </div>
  );
};
