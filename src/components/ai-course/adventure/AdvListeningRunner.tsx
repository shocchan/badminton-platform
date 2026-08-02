// 聴解runner（COMPLETION §7・§16）。
// - 実音声を再生する（audio要素・permission不要）
// - attempt中はtranscriptを表示しない。**transcriptは採点後にサーバーから返る**
// - 音声は短命トークンつきURL（公開URLは存在しない）
// - 再生回数は playLimit に従う
// - loading / error / retry を持ち、音声が読めない場合は誤答扱いにせず安全に次へ
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startListening, gradeAttempt, isRetryable, audioUrl,
  type ServerSetQuestion, type GradeResult, type ActivityDenial,
} from '../../../lib/aiLesson/course/adventure/activityClient';
import { useAdvRuntime } from './AdvRuntimeContext';
import { DeniedView } from './AdvBattleRunner';
import { nowTrainingLabel } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { JaTermText } from './JaTermText';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvListeningRunnerProps {
  lang: L;
  seenKeys: Set<string>;
  onFinish: (result: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number }) => void;
  onClose: () => void;
}

/** 問題ごとの状態は key で作り直す（effect内のsetStateによるcascading renderを避ける） */
export function AdvListeningRunner(props: AdvListeningRunnerProps) {
  const runtime = useAdvRuntime();
  const [sets, setSets] = useState<ServerSetQuestion[] | null>(null);
  const [denied, setDenied] = useState<ActivityDenial | null>(null);
  const [idx, setIdx] = useState(0);
  const [carry, setCarry] = useState(() => ({ correct: 0, wrongKeys: [] as string[], startedAt: Date.now() }));

  useEffect(() => {
    let alive = true;
    void startListening(runtime.auth, { seenKeys: [...props.seenKeys].slice(0, 800), count: 3 }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setDenied(r.denial); return; }
      setSets(r.data.questions);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (denied) {
    return <DeniedView lang={props.lang} denial={denied} onClose={props.onClose}
      onRetry={isRetryable(denied) ? () => window.location.reload() : undefined} />;
  }
  if (!sets) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <p className="text-sm text-gray-500">{tx(props.lang, '聴解問題を用意しています…', '正在准备听力题…')}</p>
      </div>
    );
  }

  const set = sets[idx];
  if (!set) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(props.lang, '再生できる聴解問題がありません。', '暂时没有可播放的听力题。')}
        </p>
        <button type="button" className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-2" onClick={props.onClose}>
          {tx(props.lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }
  return (
    <ListeningItem
      key={set.key}
      lang={props.lang} set={set} index={idx} total={sets.length}
      onDenied={setDenied}
      onNext={(ok, key) => {
        const nextCorrect = carry.correct + (ok ? 1 : 0);
        const nextWrong = ok ? carry.wrongKeys : [...carry.wrongKeys, key];
        if (idx + 1 < sets.length) {
          setCarry({ ...carry, correct: nextCorrect, wrongKeys: nextWrong });
          setIdx(idx + 1);
          return;
        }
        trackAdv('listening_completed', { locale: props.lang, skillType: 'listening' });
        props.onFinish({
          correct: nextCorrect, total: sets.length,
          keys: sets.map((s) => s.key), wrongKeys: nextWrong,
          elapsedSec: Math.round((Date.now() - carry.startedAt) / 1000),
        });
      }}
    />
  );
}

interface ListeningItemProps {
  lang: L; set: ServerSetQuestion; index: number; total: number;
  onNext: (ok: boolean, key: string) => void;
  onDenied: (d: ActivityDenial) => void;
}

function ListeningItem({ lang, set, index, total, onNext, onDenied }: ListeningItemProps) {
  const runtime = useAdvRuntime();
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<GradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing' | 'ended' | 'error'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playLimit = set.playLimit ?? 2;
  const answered = reveal !== null;

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el || playsUsed >= playLimit) return;
    setAudioState('loading');
    el.currentTime = 0;
    void el.play()
      .then(() => {
        setPlaysUsed((n) => n + 1);
        setAudioState('playing');
        trackAdv('audio_played', { locale: lang, skillType: 'listening' });
      })
      .catch(() => setAudioState('error'));
  }, [playsUsed, playLimit, lang]);

  useEffect(() => { trackAdv('listening_started', { locale: lang, skillType: 'listening' }); }, [lang]);

  const submit = async (choiceKey: string | null) => {
    if (grading || answered) return;
    setGrading(true);
    setPicked(choiceKey);
    const r = await gradeAttempt(runtime.auth, { attemptToken: set.attemptToken, choiceKey });
    setGrading(false);
    if (!r.ok) { onDenied(r.denial); return; }
    setReveal(r.data);
  };

  const advance = () => onNext(reveal?.correct === true, set.key);

  const canPlay = playsUsed < playLimit && audioState !== 'playing';

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '聴解', '听力')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, '聴解', '听力')}</span>
        <span>{index + 1}/{total}</span>
      </div>
      <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel('listening', lang)}
      </p>

      {(set.situationJa || set.situationZh) && (
        <p className="mb-3 text-sm text-gray-700">{tx(lang, set.situationJa ?? '', set.situationZh ?? set.situationJa ?? '')}</p>
      )}

      {/* 音声。transcriptは解答前に出さない（サーバーも返さない） */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 text-center">
        <audio ref={audioRef} src={set.audioToken ? audioUrl(set.audioToken) : undefined} preload="auto"
          onPlaying={() => setAudioState('playing')}
          onEnded={() => setAudioState('ended')}
          onError={() => setAudioState('error')}
          onWaiting={() => setAudioState('loading')} />
        <button type="button" disabled={!canPlay}
          className={`w-full min-h-[48px] rounded-xl px-4 py-3 font-bold text-white ${canPlay ? 'bg-blue-600' : 'bg-gray-300'}`}
          onClick={play}>
          {audioState === 'playing' ? tx(lang, '再生中…', '播放中…')
            : audioState === 'loading' ? tx(lang, '読み込み中…', '加载中…')
            : playsUsed === 0 ? tx(lang, '▶ 音声を再生する', '▶ 播放音频')
            : tx(lang, '▶ もう一度聞く', '▶ 再听一次')}
        </button>
        <p className="mt-2 text-xs text-gray-500" aria-live="polite">
          {tx(lang, `再生できる回数：あと${Math.max(0, playLimit - playsUsed)}回（全${playLimit}回）`,
            `可播放次数：还剩${Math.max(0, playLimit - playsUsed)}次（共${playLimit}次）`)}
          {set.durationSeconds !== undefined && <>・{Math.round(set.durationSeconds)}{tx(lang, '秒', '秒')}</>}
        </p>
        {audioState === 'error' && (
          <div className="mt-2">
            <p className="text-xs text-red-600">
              {tx(lang, '音声を再生できませんでした。', '音频无法播放。')}
            </p>
            <button type="button" className="mt-1 min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-xs"
              onClick={() => { setAudioState('idle'); setPlaysUsed((n) => Math.max(0, n - 1)); }}>
              {tx(lang, 'もう一度試す', '重试')}
            </button>
          </div>
        )}
      </div>

      <p className="mb-1 text-base font-semibold text-gray-900">{set.questionJa}</p>
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{set.questionZh}</p>}

      <div className="space-y-2">
        {set.choices.map((c) => {
          const isCorrect = answered && c.key === reveal?.correctKey;
          const isWrongPick = answered && picked === c.key && !isCorrect;
          return (
            <button key={c.key} type="button" disabled={answered || grading || playsUsed === 0}
              aria-pressed={picked === c.key}
              className={`w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                isCorrect ? 'border-emerald-600 bg-emerald-50'
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:opacity-60'}`}
              onClick={() => void submit(c.key)}>
              {c.textJa}
            </button>
          );
        })}
      </div>
      {playsUsed === 0 && (
        <p className="mt-2 text-xs text-gray-500">{tx(lang, '先に音声を聞いてください。', '请先听音频。')}</p>
      )}
      {grading && (
        <p className="mt-3 text-center text-xs text-gray-400" role="status">{tx(lang, '採点中…', '判分中…')}</p>
      )}

      {answered && reveal && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-bold text-gray-900">
            {reveal.correct ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {lang === 'zh' ? <JaTermText text={reveal.explanationZh ?? ''} lang="zh" /> : reveal.explanationJa}
          </p>
          {reveal.transcriptJa && (
            <>
              <button type="button" className="mt-2 min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold"
                onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
                {showTranscript ? tx(lang, '原稿を隠す', '隐藏原文') : tx(lang, '原稿を見る', '查看原文')}
              </button>
              {showTranscript && (
                <p lang="ja" className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-sm leading-7 text-gray-900">
                  {reveal.transcriptJa}
                </p>
              )}
            </>
          )}
          {(reveal.whyWrong ?? []).length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
              <ul className="mt-1 space-y-0.5">
                {(reveal.whyWrong ?? []).filter((w) => w.whyWrongJa).map((w) => (
                  <li key={w.key} className="text-xs leading-relaxed text-gray-600">✕ {w.textJa} — {w.whyWrongJa}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white" onClick={advance}>
            {index + 1 < total ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdvListeningRunner;
