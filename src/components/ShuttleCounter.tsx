import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { SHUTTLE_MILESTONES, getNextMilestone } from '../lib/shuttleMilestones';

interface CounterRow {
  total_count: number;
  last_milestone: number;
  updated_at: string;
}

export default function ShuttleCounter() {
  const [data, setData] = useState<CounterRow | null>(null);
  const [displayCount, setDisplayCount] = useState(0);
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const prevMilestoneRef = useRef<number | null>(null);

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

            if (prevMilestoneRef.current !== null && next.last_milestone > prevMilestoneRef.current) {
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
  const progressPct = next
    ? Math.min(100, Math.round((displayCount / next.count) * 100))
    : 100;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-900/10 bg-amber-50 px-6 py-8 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        {[...Array(6)].map((_, i) => (
          <span
            key={i}
            className="absolute top-[-10%] h-2 w-2 rounded-full bg-amber-700/40 animate-[fall_8s_linear_infinite]"
            style={{
              left: `${(i + 1) * 14}%`,
              animationDelay: `${i * 1.3}s`,
            }}
          />
        ))}
      </div>

      <p className="font-handwritten text-sm text-amber-800/70">シャトル供養カウンター</p>

      <p className="mt-2 text-5xl font-bold tabular-nums text-amber-900">
        {displayCount.toLocaleString()}
        <span className="ml-2 text-xl font-normal text-amber-700">本</span>
      </p>

      {next && (
        <div className="mx-auto mt-4 max-w-xs">
          <div className="h-2 w-full rounded-full bg-amber-900/10">
            <div
              className="h-2 rounded-full bg-amber-600 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-amber-700/80">
            次の節目「{next.label}」まであと {Math.max(0, next.count - displayCount)} 本
          </p>
        </div>
      )}

      {celebrating !== null && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-amber-900/90 text-amber-50 animate-[fadeIn_0.4s_ease-out]">
          <p className="text-3xl font-bold">
            {SHUTTLE_MILESTONES.find((m) => m.count === celebrating)?.label ?? `${celebrating}本達成`}
          </p>
          <p className="text-sm opacity-90">
            {SHUTTLE_MILESTONES.find((m) => m.count === celebrating)?.tier === 'big'
              ? '会員プレゼント抽選の対象になりました🎁'
              : 'みんなで積み重ねてきた証'}
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
      `}</style>
    </div>
  );
}
