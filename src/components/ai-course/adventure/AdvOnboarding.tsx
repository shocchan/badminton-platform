// V2 onboarding（§4〜§7・§10）: 目的 → 目標 → 受験日 → 学習スケジュール → 先生 → 相棒 → 診断 → ルート提示。
// 原則: 最初に選ぶのはレベルではなく目的。目標は本人から奪わない。診断は5〜8分で終える。
import { useMemo, useState } from 'react';
import type {
  AdvCompanionId, AdvDiagnosisResult, AdvGoalType, AdvRoute, AdvSkillProfile, JlptLevel,
} from '../../../lib/aiLesson/course/adventure/advTypes';
import { ACTIVE_TARGET_LEVELS, GOAL_LABELS } from '../../../lib/aiLesson/course/adventure/advTypes';
import { COMPANIONS, companionSvg } from '../../../lib/aiLesson/course/adventure/advCompanion';
import { ALL_TEACHERS, DEFAULT_TEACHER_ID, type AdvTeacherId } from '../../../lib/aiLesson/course/adventure/advTeacher';
import { TeacherAvatar } from '../TeacherAvatar';
import {
  selectDiagnosisQuestions, scoreDiagnosis, type DiagQuestion, type DiagnosisPools, type ConvSample,
} from '../../../lib/aiLesson/course/adventure/advDiagnosis';
import { generateRoute } from '../../../lib/aiLesson/course/adventure/advRoute';
import { BAND_LABELS } from '../../../lib/aiLesson/course/adventure/advTypes';
import { knowledgeBandOf } from '../../../lib/aiLesson/course/adventure/advSkillProfile';
import { trackAdv } from '../../../lib/aiLesson/course/adventure/advAnalytics';

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
}

type Phase = 'goal' | 'target' | 'exam' | 'schedule' | 'teacher' | 'companion' | 'diagIntro' | 'diag' | 'conv' | 'route';

const CONV_PROMPTS: { ja: string; zh: string }[] = [
  { ja: '週末は何をしましたか。日本語で書いてみてください。', zh: '周末做了什么？请试着用日语写一句。' },
  { ja: 'どうして日本語を勉強していますか。理由を日本語で書いてください。', zh: '你为什么学日语？请用日语写理由。' },
];

const btn = 'w-full min-h-[44px] rounded-xl border px-4 py-3 text-left transition-colors';
const btnIdle = `${btn} border-gray-200 bg-white hover:border-blue-400`;
const btnOn = `${btn} border-blue-600 bg-blue-50`;
const primary = 'w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-40';

export function AdvOnboarding({ lang, pools, nowISO, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('goal');
  const [goal, setGoal] = useState<AdvGoalType | null>(null);
  const [target, setTarget] = useState<JlptLevel | null>(null);
  const [examDate, setExamDate] = useState('');
  const [weeklyDays, setWeeklyDays] = useState(5);
  const [minutes, setMinutes] = useState<5 | 15 | 30>(15);
  const [companion, setCompanion] = useState<AdvCompanionId>('fukuro');
  const [teacher, setTeacher] = useState<AdvTeacherId>(DEFAULT_TEACHER_ID);
  const [answers, setAnswers] = useState<Map<string, number>>(new Map());
  const [qIndex, setQIndex] = useState(0);
  const [convTexts, setConvTexts] = useState<string[]>(['', '']);
  const [convSkipped, setConvSkipped] = useState(false);
  const [outcome, setOutcome] = useState<OnboardingOutcome | null>(null);

  const questions = useMemo(
    () => (goal ? selectDiagnosisQuestions(pools, target, goal, 20260731) : []),
    [pools, goal, target],
  );

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
    setOutcome({
      goalType: goal, targetJlpt: target, examDateISO: examDate || null,
      weeklyDays, dailyMinutes: minutes, companionId: companion, teacherId: teacher, diagnosis, skills, route,
    });
    setPhase('route');
  };

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
          {header('冒険の目的を選んでください', '请选择冒险的目的', '目的地はあなたが選びます。あとで変えられます。', '目的地由你选择，之后也可以更改。')}
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
            <button type="button" className="w-full min-h-[44px] text-sm text-gray-500 underline" onClick={onCancel}>
              {tx(lang, 'いまはやめておく（従来ホームへ）', '暂时不用（回到原来的主页）')}
            </button>
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
                  {lv === 'N2' ? tx(lang, 'ソラノ塔を目指す', '目标：天空塔') : tx(lang, 'カタチの遺跡を目指す', '目标：形之遗迹')}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{tx(lang, 'N5・N4・N1は今後追加予定です。', 'N5・N4・N1将于今后追加。')}</p>
          <button type="button" className={`${primary} mt-6`} disabled={!target} onClick={() => setPhase('exam')}>
            {tx(lang, 'つぎへ', '下一步')}
          </button>
        </section>
      )}

      {phase === 'exam' && (
        <section aria-label={tx(lang, '受験予定日', '考试日期')}>
          {header('受験予定日はいつですか？', '打算什么时候考试？', '未定でも進めます。あとで設定できます。', '还没定也可以继续，之后可设置。')}
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
            min={nowISO.slice(0, 10)}
            className="w-full min-h-[44px] rounded-xl border border-gray-300 px-4 py-3"
            aria-label={tx(lang, '受験予定日', '考试日期')} />
          <button type="button" className={`${primary} mt-6`} onClick={() => setPhase('schedule')}>
            {tx(lang, examDate ? 'つぎへ' : '未定のまま進む', examDate ? '下一步' : '先不定・继续')}
          </button>
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
        </section>
      )}

      {phase === 'companion' && (
        <section aria-label={tx(lang, '旅の相棒', '旅行伙伴')}>
          {header('旅の相棒を選んでください', '请选择旅行伙伴', '学習内容は変わりません。応援のしかたが少し変わります。', '学习内容不变，只是陪伴方式略有不同。')}
          <div className="space-y-3">
            {COMPANIONS.map((c) => (
              <button key={c.id} type="button" className={`${companion === c.id ? btnOn : btnIdle} flex items-center gap-3`} onClick={() => setCompanion(c.id)}>
                <span className="h-12 w-12 shrink-0" dangerouslySetInnerHTML={{ __html: companionSvg(c.id) }} />
                <span>
                  <span className="block font-semibold">{tx(lang, c.nameJa, c.nameZh)}</span>
                  <span className="block text-sm text-gray-600">{tx(lang, c.roleJa, c.roleZh)}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" className={`${primary} mt-6`} onClick={() => { trackAdv('diagnosis_started', { goalType: goal ?? undefined, locale: lang }); setPhase('diagIntro'); }}>
            {tx(lang, 'つぎへ（現在地診断）', '下一步（当前位置诊断）')}
          </button>
        </section>
      )}

      {phase === 'diagIntro' && (
        <section>
          {header('現在地を測ります（約5分）', '测一下当前位置（约5分钟）',
            '正確なルートを作るための診断です。わからない問題は「わからない」でOK。', '这是为了生成准确路线的诊断。不会的题选"不知道"就好。')}
          <ul className="mb-6 space-y-1 text-sm text-gray-700">
            <li>{tx(lang, '第1戦：ことば・文法の問題（12問）', '第1战：词汇・语法题（12题）')}</li>
            <li>{tx(lang, '第2戦：日本語で2文だけ書く（スキップ可）', '第2战：用日语写2句（可跳过）')}</li>
          </ul>
          <button type="button" className={primary} onClick={() => setPhase('diag')}>
            {tx(lang, '診断を始める', '开始诊断')}
          </button>
        </section>
      )}

      {phase === 'diag' && questions.length > 0 && (
        <DiagQuestionView
          lang={lang}
          q={questions[qIndex]}
          index={qIndex}
          total={questions.length}
          selected={answers.get(questions[qIndex].key) ?? null}
          onBack={qIndex > 0 ? () => setQIndex(qIndex - 1) : null}
          onAnswer={(choiceIndex) => {
            const next = new Map(answers);
            if (choiceIndex !== null) next.set(questions[qIndex].key, choiceIndex);
            // 戻って「わからない」へ変えたときは前の答えを消す（残すと診断が水増しされる）
            else next.delete(questions[qIndex].key);
            setAnswers(next);
            if (qIndex + 1 < questions.length) setQIndex(qIndex + 1);
            else setPhase('conv');
          }}
        />
      )}

      {phase === 'conv' && (
        <section aria-label={tx(lang, '会話診断', '会话诊断')}>
          {header('日本語で書いてみましょう', '试着用日语写一写', '会話の開始地点を決めるためのものです。短くてOK。', '用于确定会话出发点。写短一点也行。')}
          {CONV_PROMPTS.map((p, i) => (
            <div key={p.ja} className="mb-4">
              <p className="mb-1 text-sm font-semibold text-gray-800">{tx(lang, p.ja, p.zh)}</p>
              <textarea value={convTexts[i]} rows={2}
                onChange={(e) => setConvTexts(convTexts.map((v, j) => (j === i ? e.target.value : v)))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2"
                aria-label={tx(lang, `回答${i + 1}`, `回答${i + 1}`)} />
            </div>
          ))}
          <div className="space-y-2">
            <button type="button" className={primary} onClick={() => finishDiagnosis(false, convTexts)}>
              {tx(lang, '診断を完了する', '完成诊断')}
            </button>
            <button type="button" className="w-full min-h-[44px] text-sm text-gray-500 underline"
              onClick={() => { setConvSkipped(true); finishDiagnosis(true, []); }}>
              {tx(lang, '書くのはスキップ（会話力は未判定になります）', '跳过书写（会话能力将标记为未判定）')}
            </button>
          </div>
        </section>
      )}

      {phase === 'route' && outcome && (
        <RouteReveal lang={lang} o={outcome} convSkipped={convSkipped} onStart={() => onComplete(outcome)} />
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
        <div className="h-full bg-blue-500" style={{ width: `${Math.round((index / total) * 100)}%` }} />
      </div>
      {q.promptJa && <p className="mb-1 text-base font-semibold text-gray-900">{q.promptJa}</p>}
      <p className="mb-4 text-sm text-gray-700">{q.promptZh}</p>
      <div className="space-y-2">
        {q.choices.map((c, i) => (
          <button key={c} type="button" className={selected === i ? btnOn : btnIdle} onClick={() => onAnswer(i)}>{c}</button>
        ))}
        <button type="button" className="w-full min-h-[44px] text-sm text-gray-500 underline" onClick={() => onAnswer(null)}>
          {tx(lang, 'わからない', '不知道')}
        </button>
        {onBack && (
          <button type="button" className="w-full min-h-[44px] text-sm text-gray-500 underline" onClick={onBack}>
            {tx(lang, 'ひとつ前の問題にもどる', '回到上一题')}
          </button>
        )}
      </div>
    </section>
  );
}

function RouteReveal({ lang, o, convSkipped, onStart }: { lang: L; o: OnboardingOutcome; convSkipped: boolean; onStart: () => void }) {
  const kb = knowledgeBandOf(o.skills);
  const conv = o.skills.conversation.band;
  return (
    <section aria-label={tx(lang, '攻略ルート', '攻略路线')}>
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
        {convSkipped && (
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
