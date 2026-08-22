// V2 onboarding（§4〜§7・§10）: 目的 → 目標 → 受験日 → 学習スケジュール → 先生 → 相棒 → 診断 → ルート提示。
// 原則: 最初に選ぶのはレベルではなく目的。目標は本人から奪わない。診断は5〜8分で終える。
import { choiceIdle, choiceOn, primaryBtn, pressFx, riseIn } from './advUi';
import { useMemo, useState } from 'react';
import type {
  AdvCompanionId, AdvDiagnosisResult, AdvGoalType, AdvRoute, AdvSkillProfile, JlptLevel,
} from '../../../lib/aiLesson/course/adventure/advTypes';
import { ACTIVE_TARGET_LEVELS, GOAL_LABELS, aiConversationAvailable } from '../../../lib/aiLesson/course/adventure/advTypes';
import { COMPANIONS } from '../../../lib/aiLesson/course/adventure/advCompanion';
import { CompanionAvatar } from './CompanionAvatar';
import { ALL_TEACHERS, DEFAULT_TEACHER_ID, type AdvTeacherId } from '../../../lib/aiLesson/course/adventure/advTeacher';
import { TeacherAvatar } from '../TeacherAvatar';
import {
  selectDiagnosisQuestions, scoreDiagnosis, skipsDiagnosis, unmeasuredDiagnosis,
  type DiagQuestion, type DiagnosisPools, type ConvSample,
} from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import { BAND_LABELS } from '../../../lib/aiLesson/course/adventure/advTypes';
import { knowledgeBandOf } from '../../../lib/aiLesson/course/adventure/advSkillProfile';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';
import { logCourseEvent } from '../../../lib/aiLesson/course/courseEvents';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface OnboardingOutcome {
  goalType: AdvGoalType;
  targetJlpt: JlptLevel | null;
  examDateISO: string | null;
  weeklyDays: number;
  dailyMinutes: 5 | 15 | 30;
  companionId: AdvCompanionId;
  /** 案内の先生（teacherIdで管理。性別は条件にしない） */
  teacherId: AdvTeacherId;
  diagnosis: AdvDiagnosisResult;
  skills: AdvSkillProfile;
  route: AdvRoute;
}

interface Props {
  lang: L;
  pools: DiagnosisPools;
  nowISO: string;
  onComplete: (o: OnboardingOutcome) => void;
  onCancel: () => void;
  /**
   * 診断完了（outcome確定）の瞬間に呼ばれる（2026-08-15）。
   * ルート披露画面でアプリを閉じても診断・設定が消えないよう、親はここでDBへ下書き保存する
   * （UI遷移は onComplete のまま。披露画面は表示専用になる）
   */
  onOutcomeReady?: (o: OnboardingOutcome) => void;
  /** 設定済みlearnerの「やり直し」。キャンセル文言が変わり、記録が残ることを明示する */
  redo?: boolean;
  /**
   * 設定の調整モード（2026-08-20 CEO指示「弱点を全部直す」）。
   *
   * 「1日15分を30分にしたい」だけで12問の診断をやり直させない。
   * **既存の診断結果をそのまま使って**ルートだけ作り直す（診断は学力の測定結果なので、
   * 目的・目標・時間の変更では測り直す必要がない）。診断からやり直したい人は
   * 調整画面の中の「診断からやり直す」で従来のフルフローへ入れる。
   */
  adjust?: {
    goalType: AdvGoalType;
    targetJlpt: JlptLevel | null;
    examDateISO: string | null;
    weeklyDays: number;
    dailyMinutes: 5 | 15 | 30;
    companionId: AdvCompanionId;
    teacherId: AdvTeacherId;
    /** 既存の診断結果（測り直さずに再利用する） */
    diagnosis: AdvDiagnosisResult;
    skills: OnboardingOutcome['skills'];
  } | null;
  /** 調整モードから「診断からやり直す」を選んだとき（親がフルフローへ切り替える） */
  onRequestFullRedo?: () => void;
  /**
   * 目標レベルの事前選択（2026-08-19 次の道カード）。
   * 「N4への道をひらく」から来たとき、目標画面でもう一度N4を探させない。
   * フローは goal から従来どおり（目的の再確認は残す）で、選び直しも自由
   */
  presetTarget?: JlptLevel | null;
  /*
   * canCancelToLegacy は撤去（2026-08-18 監査P1）。
   * 判定に使っていた progress.length>0 は「旧コース歴」を表さない（V2のAI会話を1回終えるだけで
   * 増える）ため、旧コースを一度も見ていない生徒にも「いまはやめておく（従来ホームへ）」が出て、
   * 押すと旧コースのホーム（ミナモ列島・12週ロードマップ）へ落ちていた。
   * ホーム側の同じボタンは監査P1で撤去済みで、ここだけ残っていた。
   * キャンセルは「やり直し（redo）」のときだけ＝元の設定に戻すだけの安全な操作に限る。
   */
}

type Phase = 'goal' | 'target' | 'exam' | 'schedule' | 'teacher' | 'companion' | 'diagIntro' | 'diag' | 'route';

const btnIdle = choiceIdle;
const btnOn = choiceOn;
const primary = primaryBtn;

export function AdvOnboarding({
  lang, pools, nowISO, onComplete, onCancel, onOutcomeReady,
  redo = false, presetTarget = null, adjust = null, onRequestFullRedo,
}: Props) {
  // 調整モードは既存の設定を初期値にして、診断（12問）を通らずに終われる
  const [phase, setPhase] = useState<Phase>('goal');
  const [goal, setGoal] = useState<AdvGoalType | null>(adjust?.goalType ?? null);
  const [target, setTarget] = useState<JlptLevel | null>(adjust?.targetJlpt ?? presetTarget ?? null);
  const [examDate, setExamDate] = useState(adjust?.examDateISO ?? '');
  const [weeklyDays, setWeeklyDays] = useState(adjust?.weeklyDays ?? 5);
  const [minutes, setMinutes] = useState<5 | 15 | 30>(adjust?.dailyMinutes ?? 15);
  const [companion, setCompanion] = useState<AdvCompanionId>(adjust?.companionId ?? 'natsu');
  const [teacher, setTeacher] = useState<AdvTeacherId>(adjust?.teacherId ?? DEFAULT_TEACHER_ID);
  const [answers, setAnswers] = useState<Map<string, number>>(new Map());
  const [qIndex, setQIndex] = useState(0);
  const [convSkipped, setConvSkipped] = useState(false);
  const [outcome, setOutcome] = useState<OnboardingOutcome | null>(null);

  /** N5/N4目標は現在地診断（12問）を出さない。理由は skipsDiagnosis のコメント */
  const skipDiag = goal ? skipsDiagnosis(goal, target) : false;

  const questions = useMemo(
    () => (goal && !skipDiag ? selectDiagnosisQuestions(pools, target, goal, 20260731) : []),
    [pools, goal, target, skipDiag],
  );

  /**
   * 調整モードの完了（2026-08-20）。**診断は測り直さず**、既存の結果から
   * ルートだけ作り直す。目的・目標・時間を変えてもルートは正しく組み替わる
   */
  const finishAdjust = () => {
    if (!adjust || !goal) return;
    const route = generateRoute({
      goalType: goal, targetJlpt: target,
      knowledgeBand: adjust.diagnosis.knowledgeBand,
      conversationBand: adjust.diagnosis.conversationBand,
      diagnosis: adjust.diagnosis, nowISO,
    });
    const diagnosis: AdvDiagnosisResult = {
      ...adjust.diagnosis,
      routeExplanationJa: route.explanationJa,
      routeExplanationZh: route.explanationZh,
    };
    trackAdv('route_generated', { goalType: goal, targetLevel: target ?? undefined, locale: lang });
    logCourseEvent('onboarding_completed', { goal });
    const o: OnboardingOutcome = {
      goalType: goal, targetJlpt: target, examDateISO: examDate || null,
      weeklyDays, dailyMinutes: minutes, companionId: companion, teacherId: teacher,
      diagnosis, skills: adjust.skills, route,
    };
    setOutcome(o);
    onOutcomeReady?.(o);
    setPhase('route');
  };

  /**
   * 診断を出さずにルートを作る（N5/N4目標。CEO決定 2026-08-22）。
   * 現在地は「未判定」のまま。測っていないので測ったことにしない（原則13）。
   * diagnosis_completed は送らない——送ると「12問を解いた人」と混ざって
   * 診断の通過率が実態より良く見える。
   */
  const finishWithoutDiagnosis = () => {
    if (!goal) return;
    const { result, skills } = unmeasuredDiagnosis({ targetJlpt: target, goalType: goal, nowISO });
    const route = generateRoute({
      goalType: goal, targetJlpt: target,
      knowledgeBand: result.knowledgeBand, conversationBand: result.conversationBand,
      diagnosis: result, nowISO,
    });
    const diagnosis: AdvDiagnosisResult = {
      ...result, routeExplanationJa: route.explanationJa, routeExplanationZh: route.explanationZh,
    };
    trackAdv('route_generated', { goalType: goal, targetLevel: target ?? undefined, locale: lang });
    logCourseEvent('onboarding_completed', { goal });
    const o: OnboardingOutcome = {
      goalType: goal, targetJlpt: target, examDateISO: examDate || null,
      weeklyDays, dailyMinutes: minutes, companionId: companion, teacherId: teacher,
      diagnosis, skills, route,
    };
    setConvSkipped(true);
    setOutcome(o);
    onOutcomeReady?.(o);
    setPhase('route');
  };

  const finishDiagnosis = (skipConv: boolean, texts: string[]) => {
    if (!goal) return;
    const convSamples: ConvSample[] = skipConv ? [] : texts.filter((t2) => t2.trim().length > 0).map((t2) => ({ studentText: t2 }));
    const sampled = !skipConv && convSamples.length > 0;
    const { result, skills } = scoreDiagnosis({
      questions,
      answers: [...answers.entries()].map(([key, choiceIndex]) => ({ key, choiceIndex })),
      convSamples, conversationSampled: sampled,
      targetJlpt: target, goalType: goal, nowISO,
    });
    const route = generateRoute({
      goalType: goal, targetJlpt: target,
      knowledgeBand: result.knowledgeBand, conversationBand: result.conversationBand,
      diagnosis: result, nowISO,
    });
    const diagnosis: AdvDiagnosisResult = { ...result, routeExplanationJa: route.explanationJa, routeExplanationZh: route.explanationZh };
    trackAdv('diagnosis_completed', { goalType: goal, targetLevel: target ?? undefined, locale: lang });
    trackAdv('route_generated', { goalType: goal, targetLevel: target ?? undefined, locale: lang });
    logCourseEvent('onboarding_completed', { goal });
    const o: OnboardingOutcome = {
      goalType: goal, targetJlpt: target, examDateISO: examDate || null,
      weeklyDays, dailyMinutes: minutes, companionId: companion, teacherId: teacher, diagnosis, skills, route,
    };
    setOutcome(o);
    // 診断が終わった時点で確定保存の機会を親へ渡す（披露画面で離脱してもやり直しにならない）
    onOutcomeReady?.(o);
    setPhase('route');
  };

  /** ひとつ前のステップへ戻る（押し間違いのやり直し。選択済みの値は保持される） */
  const backBtn = (to: Phase) => (
    <button type="button"
      className={`${pressFx} mt-2 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`}
      onClick={() => setPhase(to)}>
      {tx(lang, '← ひとつ前にもどる', '← 返回上一步')}
    </button>
  );

  const header = (titleJa: string, titleZh: string, subJa?: string, subZh?: string) => (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-gray-900">{tx(lang, titleJa, titleZh)}</h2>
      {subJa && <p className="mt-1 text-sm text-gray-600">{tx(lang, subJa, subZh ?? subJa)}</p>}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      {phase === 'goal' && (
        <section aria-label={tx(lang, '冒険の目的', '冒险目的')}>
          {header('冒険の目的を選んでください', '请选择冒险的目的',
            redo ? 'これまでの学習記録・攻略の実績は消えません。目的に合わせてルートを作り直します。'
              : '目的地はあなたが選びます。あとで変えられます。',
            redo ? '之前的学习记录・攻略成果不会消失。会按新目的重新生成路线。'
              : '目的地由你选择，之后也可以更改。')}
          <div className="space-y-3">
            {(['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]).map((g) => (
              <button key={g} type="button" className={goal === g ? btnOn : btnIdle}
                onClick={() => { setGoal(g); trackAdv('goal_selected', { goalType: g, locale: lang }); }}>
                <span className="font-semibold">{GOAL_LABELS[g][lang]}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            <button type="button" className={primary} disabled={!goal}
              onClick={() => setPhase(goal === 'conversation' ? 'schedule' : 'target')}>
              {tx(lang, 'つぎへ', '下一步')}
            </button>
            {/* キャンセルはやり直しのときだけ（初回に旧コースのホームへ落とす出口は撤去・監査P1） */}
            {redo && (
              <button type="button" className={`${pressFx} w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`} onClick={onCancel}>
                {tx(lang, 'やめて元の設定のまま戻る', '取消，保持原来的设置')}
              </button>
            )}
          </div>
        </section>
      )}

      {phase === 'target' && (
        <section aria-label={tx(lang, '目標レベル', '目标级别')}>
          {header('目標のJLPTレベルは？', '目标JLPT级别是？', '現在の実力がまだでも大丈夫。目的地は変えません。', '现在实力还不够也没关系。目的地不会被改变。')}
          <div className="space-y-3">
            {ACTIVE_TARGET_LEVELS.map((lv) => (
              <button key={lv} type="button" className={target === lv ? btnOn : btnIdle}
                onClick={() => { setTarget(lv); trackAdv('target_level_selected', { targetLevel: lv, locale: lang }); }}>
                <span className="font-semibold">{lv}</span>
                <span className="ml-2 text-sm text-gray-600">
                  {lv === 'N2' ? tx(lang, 'ソラノ塔を目指す', '目标：天空塔')
                    : lv === 'N3' ? tx(lang, 'カタチの遺跡を目指す', '目标：形之遗迹')
                      : lv === 'N4' ? tx(lang, 'トオリミチを目指す（暮らしの日本語）', '目标：通行之路（生活日语）')
                        : tx(lang, 'ミナトを目指す（はじめの一歩）', '目标：雾之港城（第一步）')}
                </span>
              </button>
            ))}
          </div>
          {/* 2026-08-18: N5/N4 を解禁。当初は聴解の音源が N3/N2 にしか無かったが、
              2026-08-22 に N5/N4 も各60セット（音声つき）を用意したので注記を更新した。
              在庫が無いものを「ある」と書かない／揃ったものを「無い」と書かない（原則13） */}
          <p className="mt-3 text-xs text-gray-500">
            {tx(lang,
              'N5・N4はことば・文法・読解・聴解すべて学べます。N1は今後追加予定です。',
              'N5・N4的词汇、语法、阅读、听力均可学习。N1将于今后追加。')}
          </p>
          {/* 2026-08-22: N5・N4ではAI会話を出さない（会話は先生の授業）。
              「両方」を選んだ人には、選んだその場で伝える。あとで気づかせない（原則13） */}
          {goal && !aiConversationAvailable(goal, target) && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {tx(lang,
                `${target}のあいだ、アプリのAI会話は出ません。この時期の会話は先生の授業で練習します（ことば・文法・読解・聴解はアプリで進めます）。`,
                `${target}期间，应用内不会出现AI会话。这个阶段的会话在老师的课上练习（词汇・语法・阅读・听力在应用里进行）。`)}
            </div>
          )}
          <button type="button" className={`${primary} mt-6`} disabled={!target} onClick={() => setPhase('exam')}>
            {tx(lang, 'つぎへ', '下一步')}
          </button>
          {backBtn('goal')}
        </section>
      )}

      {phase === 'exam' && (
        <section aria-label={tx(lang, '受験予定日', '考试日期')}>
          {header('受験予定日はいつですか？', '打算什么时候考试？', '未定でも進めます。あとで設定できます。', '还没定也可以继续，之后可设置。')}
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
            min={new Date(nowISO).toLocaleDateString('sv-SE')}
            className="w-full min-h-[44px] rounded-xl border border-gray-300 px-4 py-3"
            aria-label={tx(lang, '受験予定日', '考试日期')} />
          <button type="button" className={`${primary} mt-6`} onClick={() => setPhase('schedule')}>
            {tx(lang, examDate ? 'つぎへ' : '未定のまま進む', examDate ? '下一步' : '先不定・继续')}
          </button>
          {backBtn('target')}
        </section>
      )}

      {phase === 'schedule' && (
        <section aria-label={tx(lang, '学習スケジュール', '学习安排')}>
          {header('週に何日、1日何分やりますか？', '每周学几天・每天学几分钟？')}
          <p className="mb-2 text-sm font-semibold text-gray-700">{tx(lang, '週の学習日数', '每周学习天数')}</p>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {[2, 3, 5, 7].map((d) => (
              <button key={d} type="button" className={`${weeklyDays === d ? btnOn : btnIdle} text-center`} onClick={() => setWeeklyDays(d)}>
                {d}{tx(lang, '日', '天')}
              </button>
            ))}
          </div>
          <p className="mb-2 text-sm font-semibold text-gray-700">{tx(lang, '1日の学習時間', '每天的学习时间')}</p>
          <div className="grid grid-cols-3 gap-2">
            {([5, 15, 30] as const).map((m) => (
              <button key={m} type="button" className={`${minutes === m ? btnOn : btnIdle} text-center`} onClick={() => setMinutes(m)}>
                {m}{tx(lang, '分', '分钟')}
              </button>
            ))}
          </div>
          <button type="button" className={`${primary} mt-6`} onClick={() => setPhase('teacher')}>
            {tx(lang, 'つぎへ', '下一步')}
          </button>
          {backBtn(goal === 'conversation' ? 'goal' : 'exam')}
        </section>
      )}

      {phase === 'teacher' && (
        <section aria-label={tx(lang, '案内の先生', '引导你的老师')}>
          {header('案内してくれる先生を選んでください', '请选择引导你的老师',
            '学習内容・出題・レベル判定は変わりません。話し方と見た目が変わります。あとで設定から変えられます。',
            '学习内容、出题和级别判定都不会改变，改变的是说话方式和外观。之后可以在设置里更改。')}
          <div className="space-y-3" role="radiogroup" aria-label={tx(lang, '先生', '老师')}>
            {ALL_TEACHERS.map((tc) => (
              <button key={tc.id} type="button" role="radio" aria-checked={teacher === tc.id}
                className={`${teacher === tc.id ? btnOn : btnIdle} flex items-center gap-3`}
                onClick={() => { setTeacher(tc.id); trackAdv('teacher_selected', { teacherId: tc.id, locale: lang }); }}>
                <TeacherAvatar teacher={tc} size={56} lang={lang} labeled={false} className={`ring-2 ${tc.ringClass}`} />
                <span className="min-w-0">
                  <span className="block font-semibold">{tx(lang, tc.nameJa, tc.nameZh)}</span>
                  <span className="block text-sm text-gray-600">{tx(lang, tc.roleJa, tc.roleZh)}</span>
                  {/* 音声の印象。公式に性別分類されていないため「女性声／男性声」とは書かない */}
                  <span className="block text-xs text-gray-500">
                    {tx(lang, `AI会話の声：${tc.voiceToneJa}`, `AI会话的声音：${tc.voiceToneZh}`)}
                  </span>
                  {!tc.voiceSwitchAvailable && (tc.voiceNoteJa || tc.voiceNoteZh) && (
                    <span className="mt-1 block text-xs text-amber-800">
                      {tx(lang, tc.voiceNoteJa ?? '', tc.voiceNoteZh ?? tc.voiceNoteJa ?? '')}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className={`${primary} mt-6`} onClick={() => setPhase('companion')}>
            {tx(lang, 'つぎへ', '下一步')}
          </button>
          {backBtn('schedule')}
        </section>
      )}

      {phase === 'companion' && (
        <section aria-label={tx(lang, '旅の相棒', '旅行伙伴')}>
          {header('旅の相棒を選んでください', '请选择旅行伙伴', '学習内容は変わりません。応援のしかたが少し変わります。', '学习内容不变，只是陪伴方式略有不同。')}
          <div className="space-y-3">
            {COMPANIONS.map((c) => (
              <button key={c.id} type="button" className={`${companion === c.id ? btnOn : btnIdle} flex items-center gap-3`} onClick={() => setCompanion(c.id)}>
                <CompanionAvatar id={c.id} size={48} />
                <span>
                  <span className="block font-semibold">{tx(lang, c.nameJa, c.nameZh)}</span>
                  <span className="block text-sm text-gray-600">{tx(lang, c.roleJa, c.roleZh)}</span>
                </span>
              </button>
            ))}
          </div>
          {adjust ? (
            <>
              {/* 調整モード: 診断（12問）は通らず、既存の診断結果でルートを組み直す */}
              <button type="button" className={`${primary} mt-6`} onClick={finishAdjust}>
                {tx(lang, 'この内容で更新する', '用这些内容更新')}
              </button>
              <p className="mt-2 text-center text-xs text-gray-500">
                {tx(lang,
                  '前回の診断結果をそのまま使います（12問をやり直す必要はありません）',
                  '将沿用上次的诊断结果（无需重做12道题）')}
              </p>
              {onRequestFullRedo && (
                <button type="button"
                  className={`${pressFx} mt-3 w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`}
                  onClick={onRequestFullRedo}>
                  {tx(lang, '学力から測り直す（診断12問をやり直す）', '重新测量水平（重做12道诊断题）')}
                </button>
              )}
            </>
          ) : (
            skipDiag ? (
              <>
                {/* N5/N4は診断を出さず、そのまま冒険へ（理由は skipsDiagnosis のコメント） */}
                <button type="button" className={`${primary} mt-6`} onClick={finishWithoutDiagnosis}>
                  {tx(lang, 'この内容で冒険を始める', '用这些内容开始冒险')}
                </button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  {tx(lang,
                    'N5・N4はかな・ことば・文法を順に積むので、現在地診断（12問）はありません',
                    'N5・N4会按假名→词汇→语法的顺序循序渐进，因此不做当前位置诊断（12题）')}
                </p>
              </>
            ) : (
              <button type="button" className={`${primary} mt-6`} onClick={() => { trackAdv('diagnosis_started', { goalType: goal ?? undefined, locale: lang }); setPhase('diagIntro'); }}>
                {tx(lang, 'つぎへ（現在地診断）', '下一步（当前位置诊断）')}
              </button>
            )
          )}
          {backBtn('teacher')}
        </section>
      )}

      {phase === 'diagIntro' && (
        <section>
          {header('現在地を測ります（約3分）', '测一下当前位置（约3分钟）',
            '正確なルートを作るための診断です。わからない問題は「わからない」でOK。', '这是为了生成准确路线的诊断。不会的题选"不知道"就好。')}
          <ul className="mb-6 space-y-1 text-sm text-gray-700">
            <li>{tx(lang, 'ことば・文法の問題 12問（すべて選択式。書く問題はありません）', '词汇・语法题共12题（全部选择题，不需要打字）')}</li>
          </ul>
          <button type="button" className={primary} onClick={() => setPhase('diag')}>
            {tx(lang, '診断を始める', '开始诊断')}
          </button>
          {backBtn('companion')}
        </section>
      )}

      {phase === 'diag' && questions.length > 0 && (
        <DiagQuestionView
          lang={lang}
          q={questions[qIndex]}
          index={qIndex}
          total={questions.length}
          selected={answers.get(questions[qIndex].key) ?? null}
          onBack={qIndex > 0 ? () => setQIndex(qIndex - 1) : () => setPhase('diagIntro')}
          onAnswer={(choiceIndex) => {
            const next = new Map(answers);
            if (choiceIndex !== null) next.set(questions[qIndex].key, choiceIndex);
            // 戻って「わからない」へ変えたときは前の答えを消す（残すと診断が水増しされる）
            else next.delete(questions[qIndex].key);
            setAnswers(next);
            if (qIndex + 1 < questions.length) setQIndex(qIndex + 1);
            else {
              // 作文（タイプ入力）は出さない: 日本語入力ができない学習者が多い（CEO決定 2026-08-14）。
              // 会話力は未判定のままAI会話の中で見ていく（RouteRevealで明示）
              setConvSkipped(true);
              finishDiagnosis(true, []);
            }
          }}
        />
      )}

      {phase === 'route' && outcome && (
        <RouteReveal lang={lang} o={outcome} convSkipped={convSkipped} diagSkipped={skipDiag} onStart={() => onComplete(outcome)} />
      )}
    </div>
  );
}

function DiagQuestionView({ lang, q, index, total, selected, onBack, onAnswer }: {
  lang: L; q: DiagQuestion; index: number; total: number;
  /** 戻ってきたときに自分の答えが見えるように（押し間違いに気づける） */
  selected: number | null;
  onBack: (() => void) | null;
  onAnswer: (i: number | null) => void;
}) {
  return (
    <section aria-label={tx(lang, `診断 ${index + 1}/${total}`, `诊断 ${index + 1}/${total}`)}>
      <p className="mb-1 text-xs text-gray-500">{index + 1} / {total}</p>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-gray-200">
        <div className="h-full bg-blue-500 transition-[width] duration-300" style={{ width: `${Math.round((index / total) * 100)}%` }} />
      </div>
      {q.promptJa && <p className="mb-1 text-base font-semibold text-gray-900">{q.promptJa}</p>}
      <p className="mb-4 text-sm text-gray-700">{q.promptZh}</p>
      <div className="space-y-2">
        {q.choices.map((c, i) => (
          <button key={c} type="button" className={selected === i ? btnOn : btnIdle} onClick={() => onAnswer(i)}>{c}</button>
        ))}
        <button type="button" className={`${pressFx} w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`} onClick={() => onAnswer(null)}>
          {tx(lang, 'わからない', '不知道')}
        </button>
        {onBack && (
          <button type="button" className={`${pressFx} w-full min-h-[44px] rounded-xl text-sm text-gray-500 underline active:bg-gray-100`} onClick={onBack}>
            {tx(lang, 'ひとつ前の問題にもどる', '回到上一题')}
          </button>
        )}
      </div>
    </section>
  );
}

function RouteReveal({ lang, o, convSkipped, diagSkipped, onStart }: {
  lang: L; o: OnboardingOutcome; convSkipped: boolean; diagSkipped: boolean; onStart: () => void;
}) {
  const kb = knowledgeBandOf(o.skills);
  const conv = o.skills.conversation.band;
  return (
    <section aria-label={tx(lang, '攻略ルート', '攻略路线')} className={riseIn}>
      <h2 className="mb-1 text-lg font-bold text-gray-900">{tx(lang, 'あなたの攻略ルート', '你的攻略路线')}</h2>
      <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-gray-600">{tx(lang, '最終目的地', '最终目的地')}</p>
        <p className="text-lg font-bold text-blue-900">{tx(lang, o.route.destinationLabelJa, o.route.destinationLabelZh)}</p>
        <p className="mt-2 text-sm text-gray-600">{tx(lang, '現在地', '当前位置')}</p>
        <p className="font-semibold text-gray-900">
          {o.goalType === 'conversation'
            ? tx(lang, `会話の開始地点：${BAND_LABELS[conv].ja}`, `会话出发点：${BAND_LABELS[conv].zh}`)
            : tx(lang, BAND_LABELS[kb].ja, BAND_LABELS[kb].zh)}
        </p>
        {diagSkipped ? (
          /* 診断を出していない人に「未判定」だけ見せると不安になる。測っていない理由と、
             これから何が起きるかを書く（測ったふりはしない・原則13） */
          <p className="mt-1 text-xs text-gray-500">
            {tx(lang,
              '現在地は測っていません。かな・ことばの確認から始めて、進みながら実力を見ていきます。',
              '当前位置尚未测定。先从假名和词汇的确认开始，边前进边观察你的实力。')}
          </p>
        ) : convSkipped && (
          <p className="mt-1 text-xs text-gray-500">{tx(lang, '会話力：未判定（あとでAI会話で測れます）', '会话能力：未判定（之后可通过AI会话测定）')}</p>
        )}
      </div>
      <p className="mb-3 text-sm leading-relaxed text-gray-800">{tx(lang, o.route.explanationJa, o.route.explanationZh)}</p>
      <ol className="mb-6 space-y-2">
        {o.route.stages.map((s, i) => (
          <li key={s.stageId} className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">{tx(lang, s.titleJa, s.titleZh)}</span>
              <span className="block text-xs text-gray-600">{tx(lang, s.purposeJa, s.purposeZh)}</span>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className={primary} onClick={onStart}>
        {tx(lang, '今日の冒険を始める', '开始今天的冒险')}
      </button>
    </section>
  );
}

export default AdvOnboarding;
