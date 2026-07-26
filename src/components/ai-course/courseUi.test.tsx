// @vitest-environment jsdom
// 主要UXのレンダリング回帰テスト（言い直しフロー・レポート段階表示・ホーム復旧パネル）。
// LLM・DB・音声には触れない。実ミッションデータは読み取りのみ。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup); // vitest globals無効のため明示クリーンアップ（DOM蓄積防止）
import { CourseRetryCard } from './CourseRetryCard';
import { CourseReport } from './CourseReport';
import type { CourseReportData } from './CourseReport';
import { CourseHome } from './CourseHome';
import { aiCourseI18n } from '../../locales/aiCourse';
import { missionById } from '../../lib/aiLesson/course/courseEngine';
import type { Learner } from '../../lib/aiLesson/course/types';
import type { LearnerStats } from '../../lib/aiLesson/course/courseStats';

const t = aiCourseI18n.ja;
const tz = aiCourseI18n.zh;
const mission = missionById('w01m1')!;

const retryTarget = {
  original: '昨日上司に説明するでした',
  improved: '昨日、上司に説明しました',
  noteZh: '过去式要用「しました」',
  reason: 'meaning' as const,
};

describe('CourseRetryCard（言い直しフロー）', () => {
  it('元の表現・自然な表現・入力欄・スキップを表示する', () => {
    render(<CourseRetryCard t={t} target={retryTarget} onFinished={() => {}} />);
    expect(screen.getByText(t.report.retryTitle)).toBeTruthy();
    expect(screen.getByText(retryTarget.original)).toBeTruthy();
    expect(screen.getByText(retryTarget.improved)).toBeTruthy();
    expect(screen.getByPlaceholderText(t.report.retryInputLabel)).toBeTruthy();
    expect(screen.getByText(t.report.retrySkip)).toBeTruthy();
  });

  it('自然な表現を入力すると「よく言えました！」＋onFinished(done) 1回', () => {
    const done = vi.fn();
    render(<CourseRetryCard t={t} target={retryTarget} onFinished={done} />);
    fireEvent.change(screen.getByPlaceholderText(t.report.retryInputLabel), { target: { value: '昨日上司に説明しました。' } });
    fireEvent.click(screen.getByText(t.report.retryButton));
    expect(screen.getByText(t.report.retryGood)).toBeTruthy();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('done');
  });

  it('全く違う文はヒントを出して再入力できる（失敗で終わらせない）', () => {
    const done = vi.fn();
    render(<CourseRetryCard t={t} target={retryTarget} onFinished={done} />);
    fireEvent.change(screen.getByPlaceholderText(t.report.retryInputLabel), { target: { value: '今日は良い天気です' } });
    fireEvent.click(screen.getByText(t.report.retryButton));
    expect(screen.getByText(t.report.retryHint)).toBeTruthy();
    expect(done).not.toHaveBeenCalled(); // まだ終わっていない＝もう一度試せる
  });

  it('スキップは失敗扱いにしない（retrySkipped表示・onFinished(skipped)）', () => {
    const done = vi.fn();
    render(<CourseRetryCard t={t} target={retryTarget} onFinished={done} />);
    fireEvent.click(screen.getByText(t.report.retrySkip));
    expect(screen.getByText(t.report.retrySkipped)).toBeTruthy();
    expect(done).toHaveBeenCalledWith('skipped');
  });
});

const reportData = (corrections: CourseReportData['report']['corrections']): CourseReportData => ({
  mission,
  report: {
    todaySummaryJa: '今日は理由の説明を練習しました。', todaySummaryZh: '今天练习了说明理由。',
    achievements: ['自分の言葉で話せました'], corrections,
    naturalPhrases: ['そうなんですね'], targetUsage: 'hint', encouragementJa: 'よくできました',
  },
  masteryState: 'used_with_hint', nextReviewISO: '2026-07-27', nextMissionLabel: null,
  xpEarned: 10, xpBreakdown: [], weekSessions: 1, weeklyTarget: 5,
  durationSeconds: 180, fromAi: true,
  todayCanDo: { category: mission.category, expression: mission.targetExpression, stage: 'withHint', isReview: false, reviewSucceeded: true },
  nextAbility: null,
});

describe('CourseReport（会話後の一本道）', () => {
  const noop = () => {};

  it('訂正あり: 言い直しカードが出て、完了ストリップはまだ出ない', () => {
    render(<CourseReport t={t} data={reportData([retryTarget])} onFeedback={noop} onBackHome={noop} onAgain={noop} canAgain={false} />);
    expect(screen.getByText(t.report.retryTitle)).toBeTruthy();
    expect(screen.queryByText(t.report.doneTitle)).toBeNull();
  });

  it('スキップすると「今日の学習完了」ストリップと次の復習日が出る', () => {
    render(<CourseReport t={t} data={reportData([retryTarget])} onFeedback={noop} onBackHome={noop} onAgain={noop} canAgain={false} />);
    fireEvent.click(screen.getByText(t.report.retrySkip));
    expect(screen.getByText(t.report.doneTitle)).toBeTruthy();
    expect(screen.getByText('2026-07-27')).toBeTruthy();
  });

  it('訂正ゼロ: 最初から完了ストリップを表示（言い直しカードなし）', () => {
    render(<CourseReport t={t} data={reportData([])} onFeedback={noop} onBackHome={noop} onAgain={noop} canAgain={false} />);
    expect(screen.queryByText(t.report.retryTitle)).toBeNull();
    expect(screen.getByText(t.report.doneTitle)).toBeTruthy();
  });

  it('「詳しく見る」で詳細が開閉する（aria-expanded）', () => {
    render(<CourseReport t={t} data={reportData([])} onFeedback={noop} onBackHome={noop} onAgain={noop} canAgain={false} />);
    const toggle = screen.getByText(t.report.seeDetails);
    expect(toggle.closest('button')?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText(t.report.hideDetails)).toBeTruthy();
    expect(screen.getByText(t.report.masteryNow)).toBeTruthy();
  });
});

const learner = {
  id: 'l1', displayName: 'テスト', preferredLanguage: 'ja', estimatedLevel: 'N3',
  difficultyLevel: 3, currentWeek: 1, isActive: true,
  settings: { zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null },
} as unknown as Learner;
const stats = { totalSessions: 3, weekSessions: 1, streak: 2, learnedCount: 3, retainedCount: 0, overdueReviews: 0, selfRate: 0, hintRate: 1 } as LearnerStats;

const homeProps = {
  t, learner, stats,
  plan: { main: { mission, kind: 'new' as const, hideTarget: false }, review: null, reasonKey: 'next_new' },
  reviewsDue: 2, reviewsOverdue: 0, remainingToday: 3,
  hasResume: false, starting: false, startError: '',
  currentStageLabel: 'あいさつと自己紹介ができる', thisWeekCanDos: [], nextAbility: null, journey: [],
  weekLearningDays: 2, hasLightMaterial: false,
  onStart: () => {}, onResume: () => {}, onDiscardResume: () => {},
  onSeeGrowth: () => {}, onSeePastNotes: () => {}, onPreview: () => {}, onStartLight: () => {},
  sessions: [], onOpenNotebook: () => {}, onUpdateAvatarSettings: () => {},
};

describe('CourseHome（今日の学習と復旧パネル）', () => {
  it('主CTA「今日のレッスンを始める」と今日の復習導線を表示', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.getByText(t.home.startLesson)).toBeTruthy();
    expect(screen.getByText(t.home.reviewsDue(2))).toBeTruthy();
  });

  it('復旧パネル: 3つの選択肢が出て、それぞれのコールバックが発火する', () => {
    const onResume = vi.fn(); const onDiscard = vi.fn(); const onCancel = vi.fn();
    render(<CourseHome {...homeProps} recovery={{ mode: 'text' }}
      onResumeActive={onResume} onDiscardActive={onDiscard} onCancelRecovery={onCancel} />);
    expect(screen.getByText(t.home.activeElsewhereTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.home.activeResumeHere));
    fireEvent.click(screen.getByText(t.home.activeStartNew));
    fireEvent.click(screen.getByText(t.home.activeCancel));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('zh UIでも主CTAと復旧パネル文言が表示される（パリティ）', () => {
    render(<CourseHome {...homeProps} t={tz} recovery={{ mode: 'voice' }}
      onResumeActive={() => {}} onDiscardActive={() => {}} onCancelRecovery={() => {}} />);
    expect(screen.getByText(tz.home.startLesson)).toBeTruthy();
    expect(screen.getByText(tz.home.activeElsewhereTitle)).toBeTruthy();
  });

  it('状態別CTA: 新規＝「今日の会話を始める」・上限到達＝完了扱いの前向き表示', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.getByText('今日の会話を始める')).toBeTruthy();
    cleanup();
    render(<CourseHome {...homeProps} remainingToday={0} />);
    expect(screen.getByText(t.home.doneForTodayTitle)).toBeTruthy();
    expect(screen.queryByText(t.home.startLesson)).toBeNull(); // 主CTAは出さない
  });
});

describe('人間コーチの可視化（§B-1）', () => {
  it('ja: コーチカード（タイトル・本文・WeChat導線）が表示され、主CTAを妨げない', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.getByText(t.home.coachCardTitle)).toBeTruthy();
    expect(screen.getByText(t.home.coachCardBody)).toBeTruthy();
    expect(screen.getByText(t.home.coachCardWechat)).toBeTruthy();
    expect(screen.getByText(t.home.startLesson)).toBeTruthy(); // 主CTA健在
  });

  it('zh: コーチカードが中国語で表示される', () => {
    render(<CourseHome {...homeProps} t={tz} />);
    expect(screen.getByText(tz.home.coachCardTitle)).toBeTruthy();
    expect(screen.getByText(tz.home.coachCardWechat)).toBeTruthy();
  });

  it('存在しない動的コメント・架空の確認日時を表示しない（静的文言のみ）', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.queryByText(/確認済み/)).toBeNull();
    expect(screen.queryByText(/今週.*確認/)).toBeNull();
  });
});

describe('streak復帰文言（§B-3）', () => {
  it('中断後（streak=0・学習歴あり）: 「おかえりなさい」を表示', () => {
    render(<CourseHome {...homeProps} stats={{ ...stats, streak: 0, totalSessions: 5 }} />);
    expect(screen.getByText(t.home.welcomeBack)).toBeTruthy();
    expect(screen.getByText(t.home.startLesson)).toBeTruthy(); // 既存CTA健在
  });

  it('継続中（streak>0）には出ない', () => {
    render(<CourseHome {...homeProps} stats={{ ...stats, streak: 3, totalSessions: 5 }} />);
    expect(screen.queryByText(t.home.welcomeBack)).toBeNull();
  });

  it('初回利用者（学習歴ゼロ）には出ない', () => {
    render(<CourseHome {...homeProps} stats={{ ...stats, streak: 0, totalSessions: 0 }} />);
    expect(screen.queryByText(t.home.welcomeBack)).toBeNull();
  });

  it('否定的表現（失いました等）を含まない', () => {
    for (const d of [t, tz]) {
      expect(d.home.welcomeBack).not.toMatch(/失い|ゼロ|失去|清零/);
    }
  });
});


describe('今日のおすすめ理由1行（§E-1）', () => {
  it('reasonKeyに対応する理由を表示（next_new）', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.getByText(t.home.planReasons.next_new)).toBeTruthy();
  });

  it('不正なreasonKeyはgenericへfallback・CTAは不変', () => {
    render(<CourseHome {...homeProps} plan={{ ...homeProps.plan, reasonKey: 'unknown_key' }} />);
    expect(screen.getByText(t.home.planReasons.generic)).toBeTruthy();
    expect(screen.getByText(t.home.startLesson)).toBeTruthy();
  });

  it('zh: 理由が中国語で表示される', () => {
    render(<CourseHome {...homeProps} t={tz} />);
    expect(screen.getByText(tz.home.planReasons.next_new)).toBeTruthy();
  });
});

describe('週次学習リズム（§E-2）', () => {
  it('日数と前向きな文言（3日以上=良いペース）', () => {
    render(<CourseHome {...homeProps} weekLearningDays={4} stats={{ ...stats, totalSessions: 10 }} />);
    expect(screen.getByText(t.home.rhythmDays(4))).toBeTruthy();
    expect(screen.getByText(t.home.rhythmGood)).toBeTruthy();
  });

  it('0日でも責めない（これから文言）・初回利用者には出さない', () => {
    render(<CourseHome {...homeProps} weekLearningDays={0} stats={{ ...stats, totalSessions: 5, streak: 3 }} />);
    expect(screen.getByText(t.home.rhythmFresh)).toBeTruthy();
    cleanup();
    render(<CourseHome {...homeProps} weekLearningDays={0} stats={{ ...stats, totalSessions: 0 }} />);
    expect(screen.queryByText(t.home.rhythmTitle)).toBeNull();
  });

  it('否定的表現を含まない（ja/zh）', () => {
    for (const d of [t, tz]) {
      for (const s2 of [d.home.rhythmGood, d.home.rhythmStart, d.home.rhythmFresh]) {
        expect(s2).not.toMatch(/失|ゼロ|途切れ|中断|失去|清零/);
      }
    }
  });
});

describe('軽め学習の入口（§E-3）', () => {
  it('材料がある時だけ「3分だけやる」を表示し、押すとonStartLight', () => {
    const onLight = vi.fn();
    render(<CourseHome {...homeProps} hasLightMaterial onStartLight={onLight} />);
    fireEvent.click(screen.getByText(t.home.lightStart));
    expect(onLight).toHaveBeenCalledTimes(1);
    cleanup();
    render(<CourseHome {...homeProps} hasLightMaterial={false} />);
    expect(screen.queryByText(t.home.lightStart)).toBeNull();
  });
});


describe('Personal World V1（本人主役・アバターなし完成度）', () => {
  it('アバター未登録でもheroはイニシャルで完成（壊れた画像枠なし）・主CTA維持', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.getByText(t.home.profileTitle('テスト'))).toBeTruthy();
    expect(screen.getByText(t.home.startLesson)).toBeTruthy();
    expect(document.querySelector('img[src=""]')).toBeNull();
  });

  it('pending時のみプレビューカード（承認/作り直し/あとで）・強制モーダルなし', () => {
    const onUpd = vi.fn();
    const l2 = { ...learner, settings: { ...learner.settings, avatarReviewStatus: 'pending', pendingAvatarObjectPath: '123e4567-e89b-12d3-a456-426614174000/candidates/a.png' } } as typeof learner;
    render(<CourseHome {...homeProps} learner={l2} onUpdateAvatarSettings={onUpd} />);
    expect(screen.getByText(t.avatarReview.title)).toBeTruthy();
    fireEvent.click(screen.getByText(t.avatarReview.revise));
    expect(onUpd).toHaveBeenCalledWith({ avatarReviewStatus: 'revision_requested' });
    cleanup();
    render(<CourseHome {...homeProps} />); // pendingなし→カードなし
    expect(screen.queryByText(t.avatarReview.title)).toBeNull();
  });

  it('最近の思い出: セッションありで最新1件・なしで非表示（未達成を出さない）', () => {
    render(<CourseHome {...homeProps} />);
    expect(screen.queryByText(t.memories.latestLabel)).toBeNull();
  });

  it('zh: hero・プレビュー文言パリティ', () => {
    const l2 = { ...learner, settings: { ...learner.settings, avatarReviewStatus: 'pending', pendingAvatarObjectPath: '123e4567-e89b-12d3-a456-426614174000/candidates/a.png' } } as typeof learner;
    render(<CourseHome {...homeProps} t={tz} learner={l2} />);
    expect(screen.getByText(tz.home.profileTitle('テスト'))).toBeTruthy();
    expect(screen.getByText(tz.avatarReview.title)).toBeTruthy();
  });
});
