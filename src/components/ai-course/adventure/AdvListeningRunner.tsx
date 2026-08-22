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
import { AdvRuby } from './AdvRuby';
import { annotateRuby } from '../../../lib/aiLesson/course/adventure/advRubyAuto';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AdvListeningRunnerProps {
  lang: L;
  sets: ListeningSet[];
  /**
   * 記録だけを行う（画面は閉じない）。結果画面はこのrunnerが出し、
   * 画面を閉じるのは onClose（2026-08-18 監査P1: 「結果を見る」を押すと
   * 結果を見せずにホームへ飛ばされていた）。
   * partial=true は途中でやめた回＝**解いたぶんだけ**の記録。
   */
  onFinish: (result: {
    correct: number; total: number; keys: string[]; wrongKeys: string[]; elapsedSec: number; partial: boolean;
  }) => void;
  /**
   * reason='no-questions' は出題が1問も無かった合図。
   * reason='audio-unavailable' は端末で音声が再生できず1問も解けなかった合図
   * （呼び出し側はこのstepを飛ばす出口を出すこと。出さないと完全な行き止まりになる）
   */
  onClose: (reason?: 'no-questions' | 'audio-unavailable') => void;
  /**
   * ふりがなを出すか（N5/N4目標のときだけ true。2026-08-22）。
   * 読解runnerと同じで、目標レベルで決める。N3/N2は本物の試験と同じく素の字。
   */
  showRuby?: boolean;
}

/** 問題ごとの状態は key で作り直す（effect内のsetStateによるcascading renderを避ける） */
export function AdvListeningRunner(props: AdvListeningRunnerProps) {
  const [idx, setIdx] = useState(0);
  const [carry, setCarry] = useState(() => ({
    correct: 0, doneKeys: [] as string[], wrongKeys: [] as string[], startedAt: Date.now(),
  }));
  /** 音声が再生できずに飛ばした問題があるか（1問も解けずに終わったときの案内に使う） */
  const [audioSkipped, setAudioSkipped] = useState(false);
  const [result, setResult] = useState<
    { correct: number; total: number; partial: boolean; audioBroken: boolean } | null>(null);

  const finish = (
    correct: number, keys: string[], wrongs: string[], partial: boolean,
    /** 音声が鳴らなくて終えた（本人がやめたのではない）。文言と出口の出し分けに使う */
    audioBroken = false,
  ) => {
    setResult({ correct, total: keys.length, partial, audioBroken });
    // 中断した回を「聴解を終えた」として計上しない（指標を実態より良く見せない）
    if (!partial) trackAdv('listening_completed', { locale: props.lang, skillType: 'listening' });
    props.onFinish({
      correct, total: keys.length, keys, wrongKeys: wrongs,
      elapsedSec: Math.round((Date.now() - carry.startedAt) / 1000), partial,
    });
  };

  // 結果画面（記録後も画面はここに留まる。押した瞬間に消えた＝バグに見える、を作らない）
  if (result) {
    const pct = result.total === 0 ? 0 : Math.round((result.correct / result.total) * 100);
    // 「途中でやめた」と書かない。音が鳴らなかっただけで、本人はやめていない（2026-08-18 検証）
    return (
      <div className={`mx-auto w-full max-w-xl px-4 py-8 text-center ${riseIn}`} aria-label={tx(props.lang, '聴解の結果', '听力结果')}>
        <p className="text-4xl" aria-hidden>{pct >= 80 ? '🎉' : '🎧'}</p>
        <h2 className="mt-2 text-xl font-bold text-gray-900">{tx(props.lang, '聴解の結果', '听力结果')}</h2>
        <p className={`mt-1 text-3xl font-bold ${pct >= 80 ? 'text-emerald-600' : 'text-blue-700'}`}>{pct}%</p>
        <p className="mt-1 text-sm text-gray-700">
          {tx(props.lang, `正解 ${result.correct}/${result.total}問`, `答对 ${result.correct}/${result.total} 题`)}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {result.audioBroken
            ? tx(props.lang,
              `音声が再生できなかったので、解けた${result.total}問だけを記録しました。この端末の音が出るようになったら、また出します。`,
              `因为音频无法播放，只记录了能做的${result.total}题。等这台设备能出声了会再出。`)
            : result.partial
              ? tx(props.lang, `途中でやめたので、解いた${result.total}問だけを記録しました。`,
                `因为中途结束了，只记录了已做的${result.total}题。`)
              : tx(props.lang, 'この結果は学習の記録に残ります。', '这次结果会留在学习记录里。')}
        </p>
        <button type="button"
          className={`${pressFx} action-primary-blue mt-6 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white`}
          onClick={() => props.onClose(result.audioBroken ? 'audio-unavailable' : undefined)}>
          {tx(props.lang, '冒険にもどる', '回到冒险')}
        </button>
      </div>
    );
  }

  const set = props.sets[idx];
  if (!set) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 text-center">
        <p className="mb-4 text-sm text-gray-700">
          {tx(props.lang, '再生できる聴解問題がありません。', '暂时没有可播放的听力题。')}
        </p>
        <button type="button" className={`${pressFx} action-secondary min-h-[44px] rounded-xl border border-gray-300 bg-white px-6 py-2`} onClick={() => props.onClose('no-questions')}>
          {tx(props.lang, 'もどる', '返回')}
        </button>
      </div>
    );
  }

  /** 1問終えた（解答した） */
  const handleNext = (ok: boolean, key: string) => {
    const nextCorrect = carry.correct + (ok ? 1 : 0);
    const nextWrong = ok ? carry.wrongKeys : [...carry.wrongKeys, key];
    const nextDone = [...carry.doneKeys, key];
    if (idx + 1 < props.sets.length) {
      setCarry({ ...carry, correct: nextCorrect, doneKeys: nextDone, wrongKeys: nextWrong });
      setIdx(idx + 1);
      return;
    }
    finish(nextCorrect, nextDone, nextWrong, false);
  };

  /**
   * 音声が再生できない問題を飛ばす（2026-08-18 監査P1）。
   * 端末側で m4a が鳴らないと選択肢は押せないままで、以前はここが完全な行き止まりだった。
   * 聞けなかった問題は**誤答にしない**（解いていないものを記録しない）ので、
   * 飛ばした問題はキーごと記録から外す。
   */
  const handleSkipAudio = () => {
    setAudioSkipped(true);
    if (idx + 1 < props.sets.length) { setIdx(idx + 1); return; }
    // 1問も解けずに全部飛ばした＝この端末では聴解ができない。呼び出し側へ理由を渡す
    if (carry.doneKeys.length === 0) { props.onClose('audio-unavailable'); return; }
    // 1問でも解けていれば記録は残す。ただし**音声が壊れた**ことは呼び出し側へ伝える
    // （伝えないと、ホームに「このstepを飛ばす」出口が出ず今日の冒険を締めくくれない・2026-08-18 検証）
    finish(carry.correct, carry.doneKeys, carry.wrongKeys, true, true);
  };

  /**
   * 実行中の離脱口。表示中の問題に答えていればそれも含めて締める。
   * 解いた問題が1問も無ければ記録するものが無いのでそのまま閉じる
   */
  const handleQuit = (current?: { ok: boolean; key: string }) => {
    const correct = carry.correct + (current && current.ok ? 1 : 0);
    const doneKeys = current ? [...carry.doneKeys, current.key] : carry.doneKeys;
    const wrongKeys = current && !current.ok ? [...carry.wrongKeys, current.key] : carry.wrongKeys;
    if (doneKeys.length === 0) { props.onClose(audioSkipped ? 'audio-unavailable' : undefined); return; }
    finish(correct, doneKeys, wrongKeys, true);
  };

  return (
    <ListeningItem
      key={set.setId}
      lang={props.lang} set={set} index={idx} total={props.sets.length}
      recordedCount={carry.doneKeys.length}
      showRuby={!!props.showRuby}
      onNext={handleNext}
      onSkipAudio={handleSkipAudio}
      onQuit={handleQuit}
    />
  );
}

interface ListeningItemProps {
  lang: L; set: ListeningSet; index: number; total: number;
  /** ここまでに解き終えた問題数（離脱ボタンの文言を実際の動きに合わせるため） */
  recordedCount: number;
  onNext: (ok: boolean, key: string) => void;
  onSkipAudio: () => void;
  showRuby: boolean;
  /** current を渡すと、表示中の問題の答えも記録に含めて締める */
  onQuit: (current?: { ok: boolean; key: string }) => void;
}

function ListeningItem({ lang, set, index, total, recordedCount, onNext, onSkipAudio, onQuit, showRuby }: ListeningItemProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing' | 'ended' | 'error'>('idle');
  const [attemptSeed] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* N5/N4目標にはふりがな。辞書に無い語があれば annotateRuby が null を返し、素の字が出る */
  const ja = (text: string) => (
    <AdvRuby text={text} ruby={showRuby ? annotateRuby(text) ?? undefined : undefined} show={showRuby} />
  );

  const presented = useMemo(
    () => presentQuestion(listeningToQuestion(set), attemptSeed),
    [set, attemptSeed],
  );

  /**
   * 再生回数は「実際に音が出た1回」だけ数える（2026-08-18 監査P1）。
   * 以前は play() が resolve した時点で加算し、あとからエラーになると
   * 「もう一度試す」が回数を1つ減らして**答えられる状態から答えられない状態へ後退**していた。
   * ここでは playing イベントか play() の resolve のどちらか早い方で1回だけ数え、
   * 失敗した再生は最初から数えない（減算しない）。
   */
  const countedRef = useRef(false);
  const countPlay = useCallback(() => {
    if (countedRef.current) return;
    countedRef.current = true;
    setPlaysUsed((n) => n + 1);
    trackAdv('audio_played', { locale: lang, skillType: 'listening' });
  }, [lang]);

  const play = useCallback(() => {
    const el = audioRef.current;
    if (!el || playsUsed >= set.playLimit) return;
    countedRef.current = false;
    setAudioState('loading');
    el.currentTime = 0;
    void el.play()
      .then(() => {
        setAudioState('playing');
        countPlay();
      })
      .catch(() => setAudioState('error'));
  }, [set, playsUsed, countPlay]);

  useEffect(() => { trackAdv('listening_started', { locale: lang, skillType: 'listening' }); }, [lang]);

  const advance = () => onNext(picked === presented.correctChoiceId, `listen:${set.setId}`);

  const canPlay = playsUsed < set.playLimit && audioState !== 'playing';
  /**
   * 音声を聞いてから答えてもらうが、**再生できなかったときは答えられるようにする**。
   * 以前は playsUsed===0 のままだと4つの選択肢が永久に押せず、戻る口も無い完全な行き止まりだった
   */
  const canAnswer = playsUsed > 0 || audioState === 'error';

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6" aria-label={tx(lang, '聴解', '听力')}>
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{tx(lang, LISTENING_TYPE_LABELS[set.listeningType].ja, LISTENING_TYPE_LABELS[set.listeningType].zh)}</span>
        <span>{index + 1}/{total}</span>
      </div>
      <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
        {tx(lang, '今鍛えている試験力', '正在锻炼的考试能力')}：{nowTrainingLabel('listening', lang)}
      </p>

      <p className="mb-3 text-sm text-gray-700" lang={lang === 'zh' ? 'zh' : 'ja'}>
        {lang === 'zh' ? set.situationZh : ja(set.situationJa)}
      </p>

      {/* 音声。transcriptは解答前に出さない */}
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 text-center">
        <audio ref={audioRef} src={set.audioAsset} preload="auto"
          onPlaying={() => { setAudioState('playing'); countPlay(); }}
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
              {tx(lang, '音声を再生できませんでした。この問題は飛ばせます（誤答にはなりません）。',
                '音频无法播放。这一题可以跳过（不会算作答错）。')}
            </p>
            {canPlay && (
              <button type="button" className={`${pressFx} action-secondary mt-1 min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs`}
                onClick={() => setAudioState('idle')}>
                {tx(lang, 'もう一度試す', '重试')}
              </button>
            )}
            {/* 行き止まりにしない出口（原則15）。聞けなかった問題は記録から外す＝誤答にしない。
                すでに答えたあとは出さない（せっかくの答えを捨てる口を作らない） */}
            {!answered && (
              <button type="button" className={`${pressFx} action-secondary mt-1 ml-2 min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs`}
                onClick={onSkipAudio}>
                {tx(lang, 'この問題を飛ばす', '跳过这一题')}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mb-1 text-base font-semibold text-gray-900" lang="ja">{ja(set.questionJa)}</p>
      {lang === 'zh' && <p className="mb-3 text-sm text-gray-600">{set.questionZh}</p>}

      <div className="space-y-2">
        {presented.choices.map((c) => {
          const isCorrect = answered && c.choiceId === presented.correctChoiceId;
          const isWrongPick = answered && picked === c.choiceId && !isCorrect;
          return (
            <button key={c.choiceId} type="button" disabled={answered || !canAnswer}
              aria-pressed={picked === c.choiceId}
              className={`${pressFx} action-choice w-full min-h-[44px] rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                isCorrect ? `border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 ${popIn}`
                : isWrongPick ? 'border-red-500 bg-red-50'
                : 'border-gray-200 bg-white hover:border-blue-400 disabled:opacity-60'}`}
              onClick={() => { if (!answered) { setPicked(c.choiceId); setAnswered(true); } }}>
              <span lang="ja">{ja(c.textJa)}</span>
            </button>
          );
        })}
      </div>
      {!canAnswer && (
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
              {ja(set.transcriptJa)}
            </p>
          )}
          <div className="mt-2">
            <p className="text-xs font-semibold text-gray-600">{tx(lang, 'ほかの選択肢が違う理由', '其他选项为什么不对')}</p>
            <ul className="mt-1 space-y-0.5">
              {presented.choices.filter((c) => c.choiceId !== presented.correctChoiceId).map((c) => (
                <li key={c.choiceId} className="text-xs leading-relaxed text-gray-600">
                  ✕ <span lang="ja">{ja(c.textJa)}</span> — {c.whyWrongJa}
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className={`${pressFx} action-primary-blue mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 font-bold text-white`} onClick={advance}>
            {index + 1 < total ? tx(lang, 'つぎの問題', '下一题') : tx(lang, '結果を見る', '看结果')}
          </button>
        </div>
      )}
      {/* 途中でやめる口（原則15）。この画面には戻る手段が1つも無かった（2026-08-18 監査P1）。
          表示中の問題に答えていれば、その1問も記録に含めて締める */}
      <button type="button" className={`${pressFx} mt-4 w-full min-h-[40px] rounded-xl text-xs text-gray-500 underline active:bg-gray-100`}
        onClick={() => onQuit(answered
          ? { ok: picked === presented.correctChoiceId, key: `listen:${set.setId}` }
          : undefined)}>
        {recordedCount === 0 && !answered
          ? tx(lang, 'やめて冒険にもどる', '退出，回到冒险')
          : tx(lang, 'ここでやめる（解いたぶんは記録されます）', '先做到这里（已做的部分会记录下来）')}
      </button>
    </div>
  );
}

export default AdvListeningRunner;
