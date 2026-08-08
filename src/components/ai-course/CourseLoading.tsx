// Phase B-3: 学習者に見える待ち時間の共通表示。
//
// これまで各画面が `{t.common.loading}` の素のテキストを置いていたため、
// ①一瞬で終わる処理でも文字がちらつく ②スクリーンリーダーが処理中だと分からない
// ③いつまでも終わらないときに学習者が打つ手がない ④中国語表示でも日本語のaria-labelが読まれる
// という問題があった。ここに集約して、その4つを閉じる。
//
// 方針:
// - 200ms未満で終わる処理では何も出さない（ちらつき防止）。ただし場所は先に確保して
//   レイアウトが飛び跳ねないようにする。
// - 出すときだけ role="status" aria-live="polite"。終わったら親がunmountするので
//   同じ文言を読み続けない。
// - アニメーションは motion-safe: のみ。prefers-reduced-motion では静止する。
// - オフライン中は「読み込み中」ではなく、正直にオフラインだと言う。
// - 一定時間を超えたら「時間がかかっています」と、やり直す手段を出す。
import { useEffect, useState } from 'react';
import type { AiCourseDict } from '../../locales/aiCourse';

/** 世界観の軽い演出。重いassetは使わず、CSSだけで表現する。 */
export type CourseLoadingScene = 'mist' | 'grains' | 'map' | 'step' | 'plain';

interface Props {
  t: AiCourseDict;
  /** 待っている対象に合わせた一言。省略時は汎用の「読み込み中…」 */
  scene?: CourseLoadingScene;
  /** これより早く終わるなら何も出さない（ちらつき防止） */
  delayMs?: number;
  /** これを超えたら「時間がかかっています」＋やり直し導線 */
  timeoutMs?: number;
  /** やり直せる処理なら渡す。渡さない場合は再読み込みを案内する */
  onRetry?: () => void;
  /** 縦に確保する高さ。周囲のレイアウトが動かないようにする */
  minHeightClass?: string;
  /** 濃い背景の上に置く場合に文字色を上書きする */
  textClass?: string;
  className?: string;
}

const sceneText = (t: AiCourseDict, scene: CourseLoadingScene): string => {
  const c = t.common;
  switch (scene) {
    case 'mist': return c.loadingMist;
    case 'grains': return c.loadingGrains;
    case 'map': return c.loadingMap;
    case 'step': return c.loadingStep;
    default: return c.loading;
  }
};

const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
};

/** 経過時間に応じた段階。visible前は何も描かない（が、場所は確保する） */
const usePhase = (delayMs: number, timeoutMs: number): 'hidden' | 'visible' | 'slow' => {
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'slow'>(delayMs <= 0 ? 'visible' : 'hidden');
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (delayMs > 0) timers.push(setTimeout(() => setPhase('visible'), delayMs));
    if (timeoutMs > 0) timers.push(setTimeout(() => setPhase('slow'), timeoutMs));
    return () => { for (const id of timers) clearTimeout(id); };
  }, [delayMs, timeoutMs]);
  return phase;
};

export const CourseLoading = ({
  t, scene = 'plain', delayMs = 200, timeoutMs = 10000,
  onRetry, minHeightClass = 'min-h-[96px]', textClass = 'text-gray-500', className = '',
}: Props) => {
  const online = useOnline();
  const phase = usePhase(delayMs, timeoutMs);
  const c = t.common;

  // 200ms未満で終わるケース: 高さだけ確保して無音。読み上げも発火させない。
  if (phase === 'hidden' && online) {
    return <div className={`${minHeightClass} ${className}`} aria-hidden="true" />;
  }

  const offline = !online;
  const slow = phase === 'slow';
  const message = offline ? c.loadingOffline : slow ? c.loadingSlow : sceneText(t, scene);
  const showAction = offline || slow;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${minHeightClass} flex flex-col items-center justify-center gap-2 py-6 text-center ${className}`}
    >
      {!showAction && <SceneMark scene={scene} />}
      <p className={`text-sm ${textClass}`}>{message}</p>
      {showAction && (
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="min-h-9 px-3 py-1.5 text-xs rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50/60 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {onRetry ? c.retry : c.loadingReload}
        </button>
      )}
    </div>
  );
};

/** 世界観の演出。装飾なので支援技術からは隠す（文言側で状態は伝わる）。 */
const SceneMark = ({ scene }: { scene: CourseLoadingScene }) => {
  const base = 'rounded-full bg-indigo-300/70';
  if (scene === 'grains') {
    return (
      <div aria-hidden="true" className="flex items-end gap-1 h-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${base} w-1.5 h-1.5 motion-safe:animate-bounce`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    );
  }
  if (scene === 'map') {
    return (
      <div aria-hidden="true" className="h-1.5 w-24 rounded-full bg-indigo-100 overflow-hidden">
        <span className="block h-full w-1/3 rounded-full bg-indigo-400 motion-safe:animate-[courseLoadingSweep_1.2s_ease-in-out_infinite]" />
      </div>
    );
  }
  if (scene === 'step') {
    return (
      <div aria-hidden="true" className="flex items-center gap-1.5 h-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${base} w-1.5 h-1.5 motion-safe:animate-pulse`} style={{ animationDelay: `${i * 180}ms` }} />
        ))}
      </div>
    );
  }
  // mist / plain: 霧が晴れる＝やわらかい円がゆっくり明滅
  return (
    <span
      aria-hidden="true"
      className="w-5 h-5 rounded-full border-2 border-indigo-100 border-t-indigo-400 motion-safe:animate-spin"
    />
  );
};

/** Suspense fallback用。lazy chunkが落ちたときは境界側のError Boundaryが受ける。 */
export const CourseChunkLoading = ({ t, scene = 'mist', minHeightClass }: { t: AiCourseDict; scene?: CourseLoadingScene; minHeightClass?: string }) => (
  <CourseLoading t={t} scene={scene} minHeightClass={minHeightClass ?? 'min-h-[160px]'} />
);

const CourseLoadingDefault = CourseLoading;
export default CourseLoadingDefault;
