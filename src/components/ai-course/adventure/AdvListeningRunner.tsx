// 聴解runner（COMPLETION §7・§16）。
// - 実音声を再生する（audio要素・permission不要）
// - attempt中はtranscriptを表示しない。回答後に表示できる
// - 再生回数は playLimit に従う
// - loading / error / retry を持ち、音声が読めない場合は誤答扱いにせず安全に次へ
import { pressFx, riseIn, popIn } from './advUi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListeningSet } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';
import { LISTENING_TYPE_LABELS, listeningToQuestion } from '../../../lib/aiLesson/course/adventure/listening/listeningBank';
import { presentQuestion } from '../../../lib/aiLesson/course/adventure/advChoiceOrder';
import { nowTrainingLabel } from '../../../lib/aiLesson/course/adventure/advExamSkills';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { JaTermText } from './JaTermText';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvListeningRunnerProps {
  lang: L;
  sets: ListeningSet[];
  onFinish: (result: { correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number }) => void;
  onClose: () => void;
}

/** 問題ごとの状態は key で作り直す（effect内のsetStateによるcascading renderを避ける） */
export function AdvListeningRunner(props: AdvListeningRunnerProps) {
  const [idx, setIdx] = useState(0);
  const [carry, setCarry] = useState(() => ({ correct: 0, wrongKeys: [] as string[], startedAt: Date.now() }));
  const set = props.sets[idx];
  if (!set) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(props.lang, '再生できる聴解問題がありません。', '暂时没有可播放的听力题。')}
        </p>
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`} onClick={props.onClose}>
          {tx(props.lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }
  return (
    <ListeningItem
      key={set.setId}
      lang={props.lang} set={set} index={idx} total={props.sets.length}
      onNext={(ok, key) => {
        const nextCorrect = carry.correct + (ok ? 1 : 0);
        const nextWrong = ok ? carry.wrongKeys : [...carry.wrongKeys, key];
        if (idx + 1 < props.sets.length) {
          setCarry({ ...carry, correct: nextCorrect, wrongKeys: nextWrong });
          setIdx(idx + 1);
          return;
        }
        trackAdv('listening_completed', { locale: props.lang, skillType: 'listening' });
        props.onFinish({
          correct: nextCorrect, total: props.sets.length,
          keys: props.sets.map((s) => `listen:${s.setId}`), wrongKeys: nextWrong,
          elapsedSec: Math.round((Date.now() - carry.startedAt) / 1000),
        });
      }}
    />
  );
}

interface ListeningItemProps {
  lang: L; set: ListeningSet; index: number; total: number;
  onNext: (ok: boolean, key: string) => void;
}

function ListeningItem({ lang, set, index, total, onNext }: ListeningItemProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing' | 'ended' | 'error'>('idle');
  const [attemptSeed] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const presented = useMemo(
    () => presentQuestion(listeningToQuestion(set), attemptSeed),
    [set, attemptSeed],
  );

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el || playsUsed >= set.playLimit) return;
    setAudioState('loading');
    el.currentTime = 0;
    void el.play()
      .then(() => {
        setPlaysUsed((n) => n + 1);
        setAudioState('playing');
        trackAdv('audio_played', { locale: lang, skillType: 'listening' });
      })
      .catch(() => setAudioState('error'));
  }, [set, playsUsed, lang]);

  useEffect(() => { trackAdv('listening_started', { locale: lang, skillType: 'listening' }); }, [lang]);

  const advance = () => onNext(picked === presented.correctChoiceId, `listen:${set.setId}`);

  const canPlay = playsUsed < set.playLimit && audioState !== 'playing';

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '聴解', '听力')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, LISTENING_TYPE_LABELS[set.listeningType].ja, LISTENING_TYPE_LABELS[set.listeningType].zh)}</span>
        <span>{index + 1}/{total}</span>
      </div>
      <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel('listening', lang)}
      </p>

      <p className="mb-3 text-sm text-gray-700">{tx(lang, set.situationJa, set.situationZh)}</p>

      {/* 音声。transcriptは解答前に出さない */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 text-center">
        <audio ref={audioRef} src={set.audioAsset} preload="auto"
          onPlaying={() => setAudioState('playing')}
          onEnded={() => setAudioState('ended')}
          onError={() => setAudioState('error')}
          onWaiting={() => setAudioState('loading')} />
        <button type="button" disabled={!canPlay}
          className={`${pressFx} w-full min-h-[48px] rounded-xl px-4 py-3 font-bold text-white transition-colors duration-200 ${canPlay ? 'action-primary-blue bg-blue-600' : 'bg-gray-300'}`}
          onClick={play}>
          {audioState === 'playing' && (
            <span className="mr-2 inline-flex items-end gap-0.5" aria-hidden>
              <span className="inline-block h-2 w-1 rounded-full bg-white/90 motion-safe:animate-pulse" />
              <span className="inline-block h-3 w-1 rounded-full bg-white/90 motion-safe:animate-pulse [animation-delay:150ms]" />
              <span className="inline-block h-2.5 w-1 rounded-full bg-white/90 motion-safe:animate-pulse [animation-delay:300ms]" />
            </span>
          )}
          {audioState === 'playing' ? tx(lang, '再生中…', '播放中…')
            : audioState === 'loading' ? tx(lang, '読み込み中…', '加载中…')
            : playsUsed === 0 ? tx(lang, '▶ 音声を再生する', '▶ 播放音频')
            : tx(lang, '▶ もう一度聞く', '▶ 再听一次')}
        </button>
        <p className="mt-2 text-xs text-gray-500" aria-live="polite">
          {tx(lang, `再生できる回数：あと${Math.max(0, set.playLimit - playsUsed)}回（全${set.playLimit}回）`,
            `可播放次数：还剩${Math.max(0, set.playLimit - playsUsed)}次（共${set.playLimit}次）`)}
          ・{Math.round(set.durationSeconds)}{tx(lang, '秒', '秒')}
        </p>
        {audioState === 'error' && (
          <div className="mt-2">
            <p className="text-xs text-red-600">
              {tx(lang, '音声を再生できませんでした。', '音频无法播放。')}
            </p>
            <button type="button" className={`${pressFx} action-secondary mt-1 min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs`}
              onClick={() => { setAudioState('idle'); setPlaysUsed((n) => Math.max(0, n - 1)); }}>
              {tx(lang, 'もう一度試す', '重试')}
            </button>
          </div>
        )}
      </div>

      <p className="mb-1 text-base font-semibold text-gray-900">{set.questionJa}</p>
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{set.questionZh}</p>}

      <div className="space-y-2">
        {presented.choices.map((c) => {
          const isCorrect = answered && c.choiceId === presented.correctChoiceId;
          const isWrongPick = answered && picked === c.choiceId && !isCorrect;
          return (
            <button key={c.choiceId} type="button" disabled={answered || playsUsed === 0}
              aria-pressed={picked === c.choiceId}
              className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                isCorrect ? `border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 ${popIn}`
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:opacity-60'}`}
              onClick={() => { if (!answered) { setPicked(c.choiceId); setAnswered(true); } }}>
              {c.textJa}
            </button>
          );
        })}
      </div>
      {playsUsed === 0 && (
        <p className="mt-2 text-xs text-gray-500">{tx(lang, '先に音声を聞いてください。', '请先听音频。')}</p>
      )}

      {answered && (
        <div className={`mt-4 rounded-xl border p-3 ${riseIn} ${
          picked === presented.correctChoiceId ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${
              picked === presented.correctChoiceId ? 'bg-emerald-600' : 'bg-amber-500'}`}>
              {picked === presented.correctChoiceId ? '✓' : '!'}
            </span>
            {picked === presented.correctChoiceId ? tx(lang, '正解！', '答对了！') : tx(lang, 'ざんねん…', '差一点…')}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-800">
            {lang === 'zh' ? <JaTermText text={set.explanationZh} lang="zh" /> : set.explanationJa}
          </p>
          <button type="button"
            className={`${pressFx} action-secondary mt-2 min-h-[44px] w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              showTranscript ? 'border-gray-400 bg-gray-100' : 'border-gray-300 bg-white'}`}
            onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}>
            {showTranscript ? tx(lang, '原稿を隠す', '隐藏原文') : tx(lang, '原稿を見る', '查看原文')}
          </button>
          {showTranscript && (
            <p lang="ja" className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-sm leading-7 text-gray-900">
              {set.transcriptJa}
            </p>
          )}
          <div className="mt-2">
            <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
            <ul className="mt-1 space-y-0.5">
              {presented.choices.filter((c) => c.choiceId !== presented.correctChoiceId).map((c) => (
                <li key={c.choiceId} className="text-xs leading-relaxed text-gray-600">✕ {c.textJa} — {c.whyWrongJa}</li>
              ))}
            </ul>
          </div>
          <button type="button" className={`${pressFx} action-primary-blue mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white`} onClick={advance}>
            {index + 1 < total ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdvListeningRunner;
