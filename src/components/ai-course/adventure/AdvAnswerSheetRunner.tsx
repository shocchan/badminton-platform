// 過去問の試験場（マークシート画面）。**問題文はこの画面に無い。**
//
// 学習者は先生からWeChatで届いた問題（紙・画像）を手元に置き、
// この画面で時間を測りながら**答案だけ**を記入する（advAnswerSheet.ts 冒頭参照）。
//
// 流れ: 一覧 → 説明 → 科目（タイマー＋マークシート）→ 未回答の確認 → 提出 → 結果
// - 中断しても同じ問題・同じ残り時間から再開できる（残り時間は壁時計基準＝閉じても進む）
// - 正解が登録されていない科目は採点しない。「先生が確認します」と出す（0点に見せない・原則13）
import { pressFx, primaryBtn, subtleBtn, riseIn } from './advUi';
import { useEffect, useRef, useState } from 'react';
import { Clock, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AdventureV2Profile } from '../../../lib/aiLesson/course/adventure/advTypes';
import {
  availablePapers, paperById, startSession, setAnswer, remainingSeconds, isTimeUp,
  unansweredNumbers, advanceSection, grade, formatClock,
  type AnswerSheetPaper, type AnswerSheetSession, type AnswerSheetResult,
} from '../../../lib/aiLesson/course/adventure/advAnswerSheet';
import { TeacherAvatar } from '../TeacherAvatar';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  profile: AdventureV2Profile;
  /** プロファイルの保存（AdvShellのsaveをそのまま渡す） */
  onSave: (next: AdventureV2Profile) => void;
  onBack: () => void;
}

const card = 'rounded-2xl border border-gray-200 bg-white p-4';


/** 1秒ごとに現在時刻を進める（残り時間は壁時計から計算するので、stateは表示更新のためだけ） */
const useNowISO = (active: boolean): string => {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
};

export const AdvAnswerSheetRunner = ({ lang, profile, onSave, onBack }: Props) => {
  const papers = availablePapers(profile);
  const session = profile.answerSheetSession;
  const activePaper = session ? paperById(profile, session.paperId) : null;
  // 一覧 ↔ 説明の切り替え（進行中の答案があれば常にrun）
  const [openPaperId, setOpenPaperId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // 「記入へ戻る」で最初の未回答問題まで運ぶ（75問を手でスクロールして探させない）。
  // scrollはDOMへの一方向の作用なのでrefで持つ（stateにするとeffect内のリセットが再レンダーを起こす）
  const jumpToRef = useRef<number | null>(null);
  useEffect(() => {
    if (confirming || jumpToRef.current == null) return;
    const el = document.getElementById(`sheet-q-${jumpToRef.current}`);
    // block:'center' でsticky headerの下に隠れない位置に出す（jsdomは未実装なのでtypeof確認）
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    jumpToRef.current = null;
  }, [confirming]);
  const [lastResult, setLastResult] = useState<AnswerSheetResult | null>(null);
  // 過去の提出の見返し（answerSheetLogから）。提出直後と同じ画面で答案を再表示する
  const [reviewResult, setReviewResult] = useState<AnswerSheetResult | null>(null);

  const section = activePaper && session ? activePaper.sections[session.sectionIndex] ?? null : null;
  const nowISO = useNowISO(!!section && !lastResult);

  const saveSession = (next: AnswerSheetSession | null) =>
    onSave({ ...profile, answerSheetSession: next });

  const submit = (paper: AnswerSheetPaper, s: AnswerSheetSession) => {
    const result = grade(paper, s, new Date().toISOString());
    onSave({
      ...profile,
      answerSheetSession: null,
      answerSheetLog: [...profile.answerSheetLog, result].slice(-50),
    });
    setLastResult(result);
    setConfirming(false);
  };

  /* ── 結果（提出直後 or 「これまでの提出」からの見返し） ── */
  const shownResult = lastResult ?? reviewResult;
  if (shownResult) {
    return (
      <div className={`mx-auto w-full max-w-xl px-4 py-6 ${riseIn}`}>
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {lastResult
            ? tx(lang, '答案を提出しました', '答案已提交')
            : tx(lang, '提出した答案', '已提交的答案')}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {tx(lang, shownResult.titleJa, shownResult.titleZh)}・{shownResult.submittedAtISO.slice(0, 10)}
        </p>

        <div className={`${card} mt-4`}>
          {shownResult.scorePct !== null ? (
            <p className="text-4xl font-bold text-blue-800">{shownResult.scorePct}%</p>
          ) : (
            // 正解が未登録＝採点していない。0点に見せない
            <div className="flex items-start gap-2">
              <TeacherAvatar size={36} lang={lang} labeled={false} className="shrink-0" />
              <p className="text-sm leading-relaxed text-gray-700">
                {tx(lang,
                  '答案を記録しました。採点は先生が確認してお返しします。',
                  '答案已记录。老师会核对后向你反馈评分。')}
              </p>
            </div>
          )}
          <dl className="mt-3 space-y-1.5 text-sm">
            {shownResult.sections.map((s) => (
              <div key={s.id} className="flex justify-between gap-2">
                <dt className="text-gray-500">{tx(lang, s.labelJa, s.labelZh)}</dt>
                <dd className="text-gray-800">
                  {s.correct !== null
                    ? tx(lang, `${s.correct} / ${s.total} 問正解`, `答对 ${s.correct} / ${s.total} 题`)
                    : tx(lang, `${s.answered} / ${s.total} 問に記入`, `已作答 ${s.answered} / ${s.total} 题`)}
                  ・{formatClock(s.elapsedSeconds)}
                </dd>
              </div>
            ))}
          </dl>

          {/*
            自分の答えの一覧。**正解未登録の運用では、これが先生に渡る唯一の答案**
            （以前は提出と同時に破棄していて「先生が確認します」が守れなかった・監査P0）
          */}
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="text-xs font-bold text-gray-700">{tx(lang, '自分の答え', '我的答案')}</p>
            {shownResult.sections.map((s) => (
              <div key={`c-${s.id}`} className="mt-1.5">
                <p className="text-[11px] text-gray-500">{tx(lang, s.labelJa, s.labelZh)}</p>
                {s.choices.length > 0 ? (
                  <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[13px] leading-relaxed text-gray-800">
                    {s.choices.map((c, qi) => (
                      <span key={qi} className={c == null ? 'text-gray-400' : ''}>{qi + 1}:{c ?? '−'}</span>
                    ))}
                  </p>
                ) : (
                  // choicesを保存していなかった旧形式の記録（restoreSheetLogが空配列で埋める）
                  <p className="mt-0.5 text-xs text-gray-400">
                    {tx(lang, 'この提出は古い記録のため、答えの中身は残っていません。',
                      '这次提交是旧记录，答案内容没有保留。')}
                  </p>
                )}
              </div>
            ))}
            {shownResult.scorePct === null && (
              <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                {tx(lang,
                  'この画面をスクリーンショットして、WeChatで先生に送ってください。先生が採点してお返しします。送り忘れても大丈夫：この答案は「これまでの提出」からいつでも見返せます。',
                  '请把此页面截图，通过微信发给老师。老师批改后会反馈给你。就算忘了发也没关系：这份答案随时可以在「过往提交」中再次查看。')}
              </p>
            )}
          </div>
        </div>

        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => { setLastResult(null); setReviewResult(null); setOpenPaperId(null); }}>
          {tx(lang, '試験場へ戻る', '回到考场')}
        </button>
        <button type="button" className={`${subtleBtn} mt-2`} onClick={onBack}>
          {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
        </button>
      </div>
    );
  }

  /* ── 進行中の科目 ── */
  if (activePaper && session && section) {
    const remaining = remainingSeconds(section, session, nowISO);
    const timeUp = isTimeUp(section, session, nowISO);
    const answers = session.answers[section.id] ?? [];
    const unanswered = unansweredNumbers(session, section);
    const isLast = session.sectionIndex === activePaper.sections.length - 1;

    /* 時間切れ */
    if (timeUp && !confirming) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-6">
          <div className={`${card} border-amber-300 bg-amber-50`} role="status">
            <p className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Clock className="h-5 w-5 text-amber-600" aria-hidden />
              {tx(lang, `「${section.labelJa}」の時間が終わりました`, `「${section.labelZh}」的时间到了`)}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {tx(lang,
                '本番と同じく、時間が来たらその科目はそこまでです。記入済みの答案はそのまま残ります。',
                '和正式考试一样，时间到了该科目就到此为止。已填写的答案会保留。')}
            </p>
          </div>
          <button type="button" className={`${primaryBtn} mt-4`}
            onClick={() => {
              const next = advanceSection(activePaper, session, new Date().toISOString());
              if (next) saveSession(next);
              else submit(activePaper, session);
            }}>
            {isLast ? tx(lang, '答案を提出する', '提交答案') : tx(lang, '次の科目へ進む', '进入下一科目')}
          </button>
        </div>
      );
    }

    /* 提出前の未回答確認 */
    if (confirming) {
      return (
        <div className="mx-auto w-full max-w-xl px-4 py-6">
          <div className={card}>
            {unanswered.length > 0 ? (
              <>
                <p className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
                  {tx(lang, `未回答が ${unanswered.length} 問あります`, `还有 ${unanswered.length} 题未作答`)}
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {tx(lang, `問題番号：${unanswered.slice(0, 20).join('、')}${unanswered.length > 20 ? '…' : ''}`,
                    `题号：${unanswered.slice(0, 20).join('、')}${unanswered.length > 20 ? '…' : ''}`)}
                </p>
              </>
            ) : (
              <p className="text-base font-bold text-gray-900">
                {tx(lang, 'すべて記入済みです', '已全部作答')}
              </p>
            )}
          </div>
          <button type="button" className={`${primaryBtn} mt-4`}
            onClick={() => {
              const next = advanceSection(activePaper, session, new Date().toISOString());
              if (next) { saveSession(next); setConfirming(false); }
              else submit(activePaper, session);
            }}>
            {isLast ? tx(lang, 'これで提出する', '就这样提交') : tx(lang, '次の科目へ進む', '进入下一科目')}
          </button>
          <button type="button" className={`${subtleBtn} mt-2`}
            onClick={() => { jumpToRef.current = unanswered[0] ?? null; setConfirming(false); }}>
            {tx(lang, '記入へ戻る', '回到作答')}
          </button>
        </div>
      );
    }

    /* マークシート本体 */
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6 pb-28">
        {/* タイマーは常に見える（105分の科目で75問スクロールしても残り時間を見失わない） */}
        <div className="sticky top-0 z-10 -mx-4 flex items-start justify-between gap-3 bg-white/95 px-4 py-2 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500">
              {tx(lang, activePaper.titleJa, activePaper.titleZh)}・
              {tx(lang, `科目 ${session.sectionIndex + 1}/${activePaper.sections.length}`,
                `科目 ${session.sectionIndex + 1}/${activePaper.sections.length}`)}
            </p>
            <h1 className="text-lg font-bold text-gray-900">{tx(lang, section.labelJa, section.labelZh)}</h1>
          </div>
          {/* 残り時間。1分を切ったら赤 */}
          <p className={`shrink-0 flex items-center gap-1 rounded-xl px-3 py-2 text-lg font-bold tabular-nums transition-colors ${
            remaining <= 60 ? 'animate-pulse bg-red-50 text-red-700'
            : remaining <= 300 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-800'}`}
            role="timer" aria-label={tx(lang, '残り時間', '剩余时间')}>
            <Clock className="h-4 w-4" aria-hidden />
            {formatClock(remaining)}
          </p>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          {tx(lang,
            '問題は先生から届いた紙・画像を見て解き、ここには答えだけを記入します。同じ番号をもう一度押すと消せます。',
            '题目请看老师发来的纸张或图片，这里只填写答案。再点一次相同数字即可取消。')}
        </p>

        <ol className="mt-4 space-y-1.5">
          {answers.map((a, qi) => (
            <li key={qi} id={`sheet-q-${qi + 1}`}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
                a == null ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50/50'}`}>
              <span className="w-8 shrink-0 text-center text-sm font-bold text-gray-700">{qi + 1}</span>
              <div className="flex flex-1 gap-1.5" role="radiogroup"
                aria-label={tx(lang, `問${qi + 1}`, `第${qi + 1}题`)}>
                {Array.from({ length: section.choiceCount }, (_, ci) => ci + 1).map((choice) => (
                  <button key={choice} type="button" role="radio" aria-checked={a === choice}
                    onClick={() => saveSession(setAnswer(session, section, qi, choice))}
                    className={`min-h-[44px] flex-1 rounded-lg border text-sm font-bold transition-all duration-100 active:scale-90 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                      a === choice
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 active:border-blue-400 active:bg-blue-50'}`}>
                    {choice}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>

        {/* 提出バー（下固定。iOSのホームバーと重ならないようセーフエリアを足す） */}
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-600">
                {tx(lang, `記入 ${section.questionCount - unanswered.length} / ${section.questionCount}`,
                  `已填 ${section.questionCount - unanswered.length} / ${section.questionCount}`)}
              </p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                <div className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.round(((section.questionCount - unanswered.length) / section.questionCount) * 100)}%` }} />
              </div>
            </div>
            <button type="button"
              className={`${pressFx} action-primary-blue min-h-[44px] shrink-0 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white`}
              onClick={() => setConfirming(true)}>
              {isLast
                ? tx(lang, '提出へ進む', '去提交')
                : tx(lang, 'この科目を終える', '结束该科目')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── 用紙の説明（開始前） ── */
  const opened = openPaperId ? paperById(profile, openPaperId) : null;
  if (opened) {
    const totalQ = opened.sections.reduce((n, s) => n + s.questionCount, 0);
    const totalMin = opened.sections.reduce((n, s) => n + s.minutes, 0);
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <button type="button" onClick={() => setOpenPaperId(null)}
          className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
          ← {tx(lang, '試験場へ戻る', '回到考场')}
        </button>
        <h1 className="text-xl font-bold text-gray-900">{tx(lang, opened.titleJa, opened.titleZh)}</h1>
        <p className="mt-0.5 text-sm text-gray-600">
          {tx(lang, `${opened.level}・全${totalQ}問・${totalMin}分`, `${opened.level}・共${totalQ}题・${totalMin}分钟`)}
        </p>

        {(opened.noteJa || opened.noteZh) && (
          <div className={`${card} mt-3 flex items-start gap-2 bg-blue-50/50`}>
            <TeacherAvatar size={32} lang={lang} labeled={false} className="shrink-0" />
            <p className="text-sm leading-relaxed text-gray-700">
              {tx(lang, opened.noteJa ?? '', opened.noteZh ?? '')}
            </p>
          </div>
        )}

        <div className={`${card} mt-3`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, '科目と時間', '科目与时间')}</p>
          <ul className="mt-1 space-y-0.5">
            {opened.sections.map((s) => (
              <li key={s.id} className="text-sm text-gray-700">
                ・{tx(lang, s.labelJa, s.labelZh)}（{s.questionCount}{tx(lang, '問', '题')}・{s.minutes}{tx(lang, '分', '分钟')}）
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {tx(lang,
              '始めると時間が動きます。途中で閉じても時間は本番と同じように進み、戻ると同じところから再開できます。',
              '一旦开始，计时就不会停。中途关闭页面，时间也会像正式考试一样继续；回来后可从原处继续作答。')}
          </p>
        </div>

        <button type="button" className={`${primaryBtn} mt-4`}
          onClick={() => {
            saveSession(startSession(opened, new Date().toISOString()));
            setOpenPaperId(null);
          }}>
          {tx(lang, '手元に問題を用意して、始める', '备好手边的题目，开始')}
        </button>
      </div>
    );
  }

  /* ── 一覧 ── */
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <button type="button" onClick={onBack} className={`${pressFx} mb-1 min-h-[44px] rounded-lg px-1 text-sm text-gray-500 active:bg-gray-100`}>
        ← {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
      </button>
      <h1 className="text-xl font-bold text-gray-900">{tx(lang, '過去問の試験場', '真题考场')}</h1>
      <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
        {tx(lang,
          '先生からWeChatで届いた問題を手元に置いて、ここで時間を測りながら答案を記入します。',
          '把老师通过微信发来的题目放在手边，在这里边计时边填写答案。')}
      </p>

      {papers.length === 0 ? (
        <div className={`${card} mt-4 flex items-start gap-2`}>
          <TeacherAvatar size={36} lang={lang} labeled={false} className="shrink-0" />
          <p className="text-sm leading-relaxed text-gray-700">
            {tx(lang,
              'まだ答案用紙が届いていません。先生が用意したらここに並びます。WeChatで相談してみましょう。',
              '还没有收到答题卡。老师准备好后会显示在这里。可以在微信上和老师聊聊。')}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {papers.map((p) => {
            const totalQ = p.sections.reduce((n, s) => n + s.questionCount, 0);
            const done = profile.answerSheetLog.filter((r) => r.paperId === p.paperId).length;
            return (
              <li key={p.paperId}>
                <button type="button" onClick={() => setOpenPaperId(p.paperId)}
                  className={`${pressFx} action-secondary flex w-full min-h-[56px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{tx(lang, p.titleJa, p.titleZh)}</span>
                    <span className="block text-xs text-gray-600">
                      {tx(lang, `${p.level}・全${totalQ}問`, `${p.level}・共${totalQ}题`)}
                      {done > 0 && tx(lang, `・提出${done}回`, `・已提交${done}次`)}
                    </span>
                  </span>
                  {done > 0 && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />}
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {profile.answerSheetLog.length > 0 && (
        <div className={`${card} mt-4`}>
          <p className="text-sm font-bold text-gray-900">{tx(lang, 'これまでの提出', '过往提交')}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {tx(lang, 'タップすると、そのときの答案を見返せます。', '点按可查看当时填写的答案。')}
          </p>
          <ul className="mt-1 space-y-1.5">
            {[...profile.answerSheetLog].reverse().slice(0, 5).map((r, i) => (
              <li key={`${r.paperId}-${r.submittedAtISO}-${i}`}>
                <button type="button" onClick={() => setReviewResult(r)}
                  className={`${pressFx} action-secondary flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm`}>
                  <span className="min-w-0 truncate text-gray-700">{tx(lang, r.titleJa, r.titleZh)}</span>
                  <span className="flex shrink-0 items-center gap-1 text-gray-500">
                    {r.submittedAtISO.slice(0, 10)}・
                    {r.scorePct !== null ? `${r.scorePct}%` : tx(lang, '採点は先生からWeChatで届きます', '评分由老师通过微信发给你')}
                    <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
