// AI日本語学習デモ: /:lang/ai-lesson-demo（限定公開・ナビ/サイトマップ非掲載）
// フローが直線的で状態を共有するため、子ルート分割ではなく同一ページ内ステップ切替を採用
// （既存 RallyGamePage と同じ方式）。
// 現在はモックチューター。OpenAI API 接続時は LessonChat 内の createMockTutor を
// Edge Function 呼び出し版に差し替える（パスコードは Edge Function 側でも検証する）。

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../contexts/LanguageContext';
import { useLessonFocus } from '../../contexts/LessonFocusContext';
import { aiLessonI18n } from '../../locales/aiLesson';
import { generatePlan } from '../../lib/aiLesson/planGenerator';
import { aiLessonRepository, isGatePassed, todayISO } from '../../lib/aiLesson/repository';
import type { StudentProfile } from '../../lib/aiLesson/repository';
import { applySessionToProgress, calcGauges, calcSessionXp, nextStreak } from '../../lib/aiLesson/xp';
import type { Gauges } from '../../lib/aiLesson/xp';
import { PasscodeGate } from '../../components/ai-lesson/PasscodeGate';
import { HearingForm } from '../../components/ai-lesson/HearingForm';
import { PlanView } from '../../components/ai-lesson/PlanView';
import { MissionSelect } from '../../components/ai-lesson/MissionSelect';
import { LessonChat } from '../../components/ai-lesson/LessonChat';
import { ReportView } from '../../components/ai-lesson/ReportView';
import type { TutorOutcome } from '../../lib/aiLesson/mockTutor';
import type { HearingAnswers, ReviewScheduleItem, SessionRecord } from '../../lib/aiLesson/types';

type Step = 'gate' | 'hearing' | 'plan' | 'mission' | 'lesson' | 'report';

const addDaysISO = (baseISO: string, days: number): string => {
  const d = new Date(baseISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface ReportData {
  session: SessionRecord;
  totalXp: number;
  gauges: Gauges;
  streakDays: number;
  reviewSchedule: ReviewScheduleItem[];
}

export default function AiLessonDemoPage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const t = aiLessonI18n[locale];

  const [profile, setProfile] = useState<StudentProfile | null>(() => aiLessonRepository.loadProfile());
  const [step, setStep] = useState<Step>(() => {
    if (!isGatePassed()) return 'gate';
    return aiLessonRepository.loadProfile() ? 'plan' : 'hearing';
  });
  const [courseMinutes, setCourseMinutes] = useState(3);
  const [report, setReport] = useState<ReportData | null>(null);

  // レッスン中だけ共通ヘッダー・フッターを隠す集中モード（他ページには影響しない）
  const { setFocused } = useLessonFocus();
  useEffect(() => {
    setFocused(step === 'lesson');
    return () => setFocused(false);
  }, [step, setFocused]);

  const handleHearingComplete = (answers: HearingAnswers) => {
    const plan = generatePlan(answers);
    const newProfile: StudentProfile = { answers, plan, createdAtISO: new Date().toISOString() };
    aiLessonRepository.saveProfile(newProfile);
    setProfile(newProfile);
    setStep('plan');
  };

  const handleLessonFinish = (outcome: TutorOutcome, elapsedSeconds: number) => {
    if (!profile) return;
    const today = todayISO();
    const progress = aiLessonRepository.loadProgress();
    const streakDays = nextStreak(progress, today);
    const xp = calcSessionXp(outcome.expressions, true, streakDays);

    const themeLabel = t.plan.themes[profile.plan.themeKey as keyof typeof t.plan.themes] ?? profile.plan.themeKey;
    const session: SessionRecord = {
      id: `s-${Date.now()}`,
      dateISO: today,
      courseMinutes,
      elapsedSeconds,
      missionLabel: t.mission.missionLine(themeLabel, profile.plan.target.label),
      missionAchieved: outcome.missionAchieved,
      expressions: outcome.expressions,
      corrections: outcome.corrections,
      earnedXp: xp.earned,
      xpBreakdown: xp.breakdown,
    };

    const newProgress = applySessionToProgress(progress, session, today);
    aiLessonRepository.appendSession(session);
    aiLessonRepository.saveProgress(newProgress);

    // エビングハウス型: 翌日・3日後・7日後に今日の表現を復習
    const expressionLabels = outcome.expressions.map((e) => e.label);
    const reviewSchedule: ReviewScheduleItem[] = ([1, 3, 7] as const).map((offset) => ({
      dateISO: addDaysISO(today, offset),
      offsetDays: offset,
      expressions: expressionLabels,
    }));

    setReport({
      session,
      totalXp: newProgress.totalXp,
      gauges: calcGauges(newProgress),
      streakDays: newProgress.streakDays,
      reviewSchedule,
    });
    setStep('report');
  };

  return (
    <>
      <Helmet>
        <title>{t.meta.title} | kawabado</title>
        {/* 限定公開デモのため検索エンジンから除外 */}
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {step === 'gate' && (
        <PasscodeGate t={t.gate} onPassed={() => setStep(profile ? 'plan' : 'hearing')} />
      )}
      {step === 'hearing' && <HearingForm t={t.hearing} onComplete={handleHearingComplete} />}
      {step === 'plan' && profile && (
        <PlanView t={t} plan={profile.plan} onNext={() => setStep('mission')} />
      )}
      {step === 'mission' && profile && (
        <MissionSelect
          t={t}
          plan={profile.plan}
          onStart={(minutes) => {
            setCourseMinutes(minutes);
            setStep('lesson');
          }}
        />
      )}
      {step === 'lesson' && profile && (
        <LessonChat t={t} plan={profile.plan} courseMinutes={courseMinutes} onFinish={handleLessonFinish} />
      )}
      {step === 'report' && profile && report && (
        <ReportView
          t={t}
          plan={profile.plan}
          session={report.session}
          totalXp={report.totalXp}
          gauges={report.gauges}
          streakDays={report.streakDays}
          reviewSchedule={report.reviewSchedule}
          onAgain={() => setStep('mission')}
          onBackToPlan={() => setStep('plan')}
        />
      )}
    </>
  );
}
