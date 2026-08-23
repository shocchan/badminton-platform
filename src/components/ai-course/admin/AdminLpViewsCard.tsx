// 「今日」タブ: 販売LPが何人に見られたか（CEO依頼 2026-08-23
// 「このLPがどれだけの人に見られているかも管理ページから確認できるようにしたい」）。
//
// 見せかたの方針:
//   - **0のときは0と言い切る。** いま実際にまだ誰にも見つかっていない段階なので、
//     空欄やダッシュでごまかすと「取れていないのか、来ていないのか」が分からなくなる
//   - 数の性格を1行そえる（自前カウンタ・bot除外なし・目安）。数字を信じすぎさせない
//   - 「どこから来たか」を必ず出す。総数より、最初の1人がどこから来たかのほうが効く
import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { fetchLpViewSummary } from '../../../lib/aiLesson/course/admin/adminLpViewsApi';
import type { LpViewSummary } from '../../../lib/aiLesson/course/admin/adminLpViews';

const PATH_LABEL: Record<string, string> = {
  '/ja/ai-course': '日本語のLP',
  '/zh/ai-course': '中国語のLP',
  '/ja/ai-course/shoko': '翔子先生（広告用・日本語）',
  '/zh/ai-course/shoko': '翔子先生（広告用・中国語）',
  '/ja/ai-course/yuto': '悠斗先生（広告用・日本語）',
  '/zh/ai-course/yuto': '悠斗先生（広告用・中国語）',
};

/** 直近14日の棒。数が小さいので高さではなく「あった日／なかった日」が読めればよい */
const Spark = ({ daily }: { daily: LpViewSummary['daily'] }) => {
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px] h-10" aria-hidden>
      {daily.map((d) => (
        <div key={d.date} className="flex-1 rounded-sm bg-gray-100" style={{ height: '100%' }}>
          <div className={`w-full rounded-sm ${d.count > 0 ? 'bg-emerald-500' : 'bg-gray-200'}`}
            style={{ height: `${d.count > 0 ? Math.max(18, (d.count / max) * 100) : 6}%`, marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  );
};

export const AdminLpViewsCard = () => {
  const [s, setS] = useState<LpViewSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLpViewSummary()
      .then((r) => { if (alive) setS(r); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-500">
      LPの閲覧数を取得できませんでした（通信エラー）
    </div>
  );
  if (!s) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-400">LPの閲覧数を集計中…</div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800">
        <Eye className="w-4 h-4 text-gray-400" aria-hidden /> 販売ページを見た人
      </h3>

      <div className="mt-3 flex gap-6">
        <div>
          <p className="text-[11px] text-gray-500">直近7日</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900">{s.last7}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500">直近30日</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900">{s.last30}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">最後に見られた日</p>
          <p className="text-sm font-semibold tabular-nums text-gray-800 mt-1.5">
            {s.lastViewedOn ?? 'まだありません'}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] text-gray-500 mb-1">直近14日（緑＝見られた日）</p>
        <Spark daily={s.daily} />
      </div>

      {s.last30 === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
          この30日、まだ誰も見ていません。ページは本番に出ていますが、
          <b>そこへ来る道がまだありません</b>。どこか1か所に置いて、ここに数が出るか見るのが次の一手です。
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold text-gray-600 mb-1">どのページ</p>
            <ul className="space-y-0.5">
              {s.byPath.slice(0, 5).map((p) => (
                <li key={p.path} className="flex justify-between gap-2 text-xs text-gray-700">
                  <span className="truncate">{PATH_LABEL[p.path] ?? p.path}</span>
                  <span className="tabular-nums font-semibold">{p.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-600 mb-1">どこから来たか</p>
            <ul className="space-y-0.5">
              {s.byReferrer.slice(0, 5).map((r) => (
                <li key={r.host} className="flex justify-between gap-2 text-xs text-gray-700">
                  <span className="truncate">{r.host}</span>
                  <span className="tabular-nums font-semibold">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
        1つのブラウザにつき1日1回だけ数えています。自分のブラウザ（<code>?notrack=1</code> で開いたもの）と、
        stagingでの確認は数に入りません。ロボットの除外はしていないので、<b>目安の数字</b>として見てください。
      </p>
    </div>
  );
};
