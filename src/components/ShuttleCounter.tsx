// src/components/ShuttleCounter.tsx
//
// サイトに置く「シャトル供養カウンター」。
// shuttle_counter テーブルをリアルタイム購読して、本数をアニメーションで表示する。
// 進捗は数字だけでなく、20マスのシャトルアイコングリッドが塗りつぶされていく
// 形でも見せる(一目で「積み上がってる」感が伝わるように)。
//
// locale props で 'ja' | 'zh' を渡すと表示文言が切り替わる。
// 既存のページ側のロケール判定(URLパスなど)から渡してください。
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  SHUTTLE_MILESTONES,
  getNextMilestone,
  getCurrentMilestone,
} from '../lib/shuttleMilestones';
import { SHUTTLE_COUNTER_TEXT, type ShuttleLocale } from '../lib/shuttleCounterI18n';

interface CounterRow {
  total_count: number;
  last_milestone: number;
  updated_at: string;
}

const GRID_SIZE = 20;

/** シャトルの小アイコン。filled=trueで色付き、falseで輪郭だけ */
function ShuttleIcon({ filled, pop }: { filled: boolean; pop: boolean }) {
  return (
    <svg
      viewBox="0 0 24 26"
      width="100%"
      height="100%"
      className={`transition-all duration-300 ${pop ? 'animate-[pop_0.4s_ease-out]' : ''}`}
    >
      <path
        d="M12 1 L3 16 Q12 22 21 16 Z"
        fill={filled ? '#B98C5E' : 'none'}
        stroke="#8A6239"
        strokeWidth="1.3"
        opacity={filled ? 1 : 0.28}
      />
      <circle
        cx="12"
        cy="20.5"
        r="3.4"
        fill={filled ? '#8A6239' : 'none'}
        stroke="#8A6239"
        strokeWidth="1.3"
        opacity={filled ? 1 : 0.28}
      />
    </svg>
  );
}

export default function ShuttleCounter({ locale = 'ja' }: { locale?: ShuttleLocale }) {
  const t = SHUTTLE_COUNTER_TEXT[locale];

  const [data, setData] = useState<CounterRow | null>(null);
  const [displayCount, setDisplayCount] = useState(0);
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const [justFilled, setJustFilled] = useState<number | null>(null);
  const prevMilestoneRef = useRef<number | null>(null);
  const prevDisplayRef = useRef(0);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    const init = async () => {
      const { data: row, error } = await supabase
        .from('shuttle_counter')
        .select('total_count, last_milestone, updated_at')
        .eq('id', 1)
        .single();

      if (!error && row) {
        setData(row);
        prevMilestoneRef.current = row.last_milestone;
      }

      channel = supabase
        .channel('shuttle-counter-live')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shuttle_counter', filter: 'id=eq.1' },
          (payload) => {
            const next = payload.new as CounterRow;
            setData(next);

            if (
              prevMilestoneRef.current !== null &&
              next.last_milestone > prevMilestoneRef.current
            ) {
              setCelebrating(next.last_milestone);
              setTimeout(() => setCelebrating(null), 6000);
            }
            prevMilestoneRef.current = next.last_milestone;
          }
        )
        .subscribe();
    };

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // カウントアップ・アニメーション
  useEffect(() => {
    if (!data) return;
    const target = data.total_count;
    if (displayCount === target) return;

    const diff = target - displayCount;
    const step = Math.max(1, Math.round(Math.abs(diff) / 30));
    const id = setInterval(() => {
      setDisplayCount((cur) => {
        const next = cur + Math.sign(diff) * step;
        if ((diff > 0 && next >= target) || (diff < 0 && next <= target)) {
          clearInterval(id);
          return target;
        }
        return next;
      });
    }, 30);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total_count]);

  const next = data ? getNextMilestone(data.total_count) : null;
  const currentTier = data ? getCurrentMilestone(displayCount) : null;
  const tierStart = currentTier?.count ?? 0;
  const tierEnd = next?.count ?? tierStart + 1;
  const tierTotal = Math.max(1, tierEnd - tierStart);
  const tierProgress = Math.max(0, displayCount - tierStart);
  const filledSlots = Math.min(GRID_SIZE, Math.round((tierProgress / tierTotal) * GRID_SIZE));

  // グリッドが新しく埋まったマスに、ポップアニメーションを一瞬だけ付ける
  useEffect(() => {
    if (filledSlots > prevDisplayRef.current) {
      setJustFilled(filledSlots - 1);
      const timer = setTimeout(() => setJustFilled(null), 400);
      prevDisplayRef.current = filledSlots;
      return () => clearTimeout(timer);
    }
    prevDisplayRef.current = filledSlots;
  }, [filledSlots]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-900/10 bg-amber-50 px-6 py-8 text-center">
      {/* 舞い落ちる羽根の演出 (常時、控えめに) */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {[...Array(6)].map((_, i) => (
          <span
            key={i}
            className="absolute top-[-10%] h-2 w-2 rounded-full bg-amber-700/40 animate-[fall_8s_linear_infinite]"
            style={{ left: `${(i + 1) * 14}%`, animationDelay: `${i * 1.3}s` }}
          />
        ))}
      </div>

      <p className="font-handwritten text-sm text-amber-800/70">{t.title}</p>

      <p className="mt-2 text-5xl font-bold tabular-nums text-amber-900">
        {displayCount.toLocaleString()}
        <span className="ml-2 text-xl font-normal text-amber-700">{t.unit}</span>
      </p>

      {/* 積み上がっていくシャトルアイコングリッド */}
      <div className="mx-auto mt-5 grid max-w-xs grid-cols-10 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: GRID_SIZE }).map((_, i) => (
          <div key={i} className="aspect-[24/26]">
            <ShuttleIcon filled={i < filledSlots} pop={i === justFilled} />
          </div>
        ))}
      </div>

      {next && (
        <p className="mt-3 text-xs text-amber-700/80">
          {t.nextMilestone(t.milestoneLabel(next.count, next.count === 1000), next.count - displayCount)}
        </p>
      )}

      {/* 節目演出のオーバーレイ */}
      {celebrating !== null && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-amber-900/90 text-amber-50 animate-[fadeIn_0.4s_ease-out]">
          <p className="text-3xl font-bold">
            {t.milestoneLabel(celebrating, celebrating === 1000)}
          </p>
          <p className="text-sm opacity-90">
            {SHUTTLE_MILESTONES.find((m) => m.count === celebrating)?.tier === 'big'
              ? t.celebrateBig
              : t.celebrateSmall}
          </p>
        </div>
      )}

      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(420px) rotate(180deg); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
