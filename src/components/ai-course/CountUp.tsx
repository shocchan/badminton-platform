// 数字がすっと増える控えめな演出。reduced-motion では即座に最終値を表示。
// requestAnimationFrame で毎フレーム値を更新する正当なアニメーション用途のため、
// set-state-in-effect ルールはこのファイルでは無効化する。
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** 小数桁 */
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
}

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const CountUp = ({ value, decimals = 0, durationMs = 700, prefix = '', suffix = '' }: Props) => {
  const [display, setDisplay] = useState(reduced() ? value : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduced()) { setDisplay(value); return; }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / durationMs, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, durationMs]);

  return <span className="tabular-nums">{prefix}{display.toFixed(decimals)}{suffix}</span>;
};
