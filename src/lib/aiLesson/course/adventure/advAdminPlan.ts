// 管理者による学習設計の調整（2026-08-17 新設）。
//
// 経緯: 生徒の現在地は初回診断で決まるが、**診断は本人の自己申告に引きずられる**。
// 実測（李さん 2026-08-17）では「実際はほぼ初級」の学習者が n4_late と測られ、
// 基礎を飛ばしてN3帯の教材が配信され、初日から一度も学習できないまま止まっていた。
// 本人に診断をやり直させるのも12問の負担で、また背伸びして答える可能性が高い。
//
// そこで、先生（管理者）が面談で見た実力に合わせて
// **現在地・目標・1日の量を直接調整し、ルートを引き直せる**ようにする。
//
// 鉄則:
// - **学習の記録（mastery台帳・questLog・XP・答案用紙）は絶対に消さない**。
//   引き直すのは「これから進む道（route）」と設定だけ
// - 診断の生データ（diagnosis）は残し、上書きした事実を adjustedByTeacherAt に刻む
//   （「AIが測った値」と「先生が直した値」を混同させない・原則13）
// - 変更後に何が起きるかを、呼び出し側が生徒へ説明できる形で返す
import { generateRoute } from './advRoute';
import type {
  AdventureV2Profile, AdvBand, AdvGoalType, JlptLevel,
} from './advTypes';

/** 先生が選べる現在地の帯（診断の knowledgeBand と同じ語彙） */
export const TEACHER_BAND_OPTIONS: { band: AdvBand; ja: string; zh: string; note: { ja: string; zh: string } }[] = [
  {
    band: 'pre_n5', ja: 'ほぼゼロ（かなから）', zh: '几乎零基础（从假名开始）',
    note: { ja: 'かな道場から始めます', zh: '从假名道场开始' },
  },
  {
    band: 'n5', ja: 'N5（基本の文が作れる）', zh: 'N5（能造基本句子）',
    note: { ja: '基礎キャンプ（N5文法・基礎語彙）から', zh: '从基础营地（N5语法・基础词汇）开始' },
  },
  {
    band: 'n4', ja: 'N4前半', zh: 'N4前半',
    note: { ja: '基礎キャンプの後半から', zh: '从基础营地后半开始' },
  },
  {
    band: 'n4_late', ja: 'N4後半', zh: 'N4后半',
    note: { ja: 'N3語彙・文法の橋から', zh: '从N3词汇语法之桥开始' },
  },
  {
    band: 'n3_early', ja: 'N3前半', zh: 'N3前半',
    note: { ja: 'N3実践ミッションから', zh: '从N3实战任务开始' },
  },
  {
    band: 'n3_late', ja: 'N3後半', zh: 'N3后半',
    note: { ja: 'N3文法攻略から', zh: '从N3语法攻略开始' },
  },
];

export interface TeacherPlanPatch {
  /** 現在地の帯。未指定なら現状維持 */
  knowledgeBand?: AdvBand;
  goalType?: AdvGoalType;
  targetJlpt?: JlptLevel | null;
  /** 1日の学習時間（分）。5 は「まず続ける」ための最小構成 */
  dailyMinutes?: 5 | 15 | 30;
  weeklyDays?: number;
}

export interface TeacherPlanResult {
  profile: AdventureV2Profile;
  /** 生徒へ説明するための差分サマリー（ja/zh） */
  changes: { ja: string; zh: string }[];
  /** ルートを引き直したか */
  routeRebuilt: boolean;
}

const bandLabel = (b: AdvBand): { ja: string; zh: string } =>
  TEACHER_BAND_OPTIONS.find((o) => o.band === b) ?? { ja: b, zh: b } as never;

/**
 * 先生の調整をプロファイルへ適用する（純関数）。
 * 記録は保持したまま、設定とルートだけを更新する。
 */
export const applyTeacherPlan = (
  profile: AdventureV2Profile, patch: TeacherPlanPatch, nowISO: string,
): TeacherPlanResult => {
  const changes: { ja: string; zh: string }[] = [];
  const diag = profile.diagnosis;

  const nextGoal = patch.goalType ?? profile.goalType;
  const nextTarget = patch.targetJlpt !== undefined ? patch.targetJlpt : profile.targetJlpt;
  const nextBand = patch.knowledgeBand ?? diag?.knowledgeBand ?? null;

  if (patch.knowledgeBand && patch.knowledgeBand !== diag?.knowledgeBand) {
    const from = diag ? bandLabel(diag.knowledgeBand) : { ja: '未判定', zh: '尚未判定' };
    const to = bandLabel(patch.knowledgeBand);
    changes.push({
      ja: `現在地：${from.ja} → ${to.ja}`,
      zh: `当前位置：${from.zh} → ${to.zh}`,
    });
  }
  if (patch.goalType && patch.goalType !== profile.goalType) {
    changes.push({ ja: `目的：${profile.goalType ?? '未設定'} → ${patch.goalType}`, zh: `目标类型：${profile.goalType ?? '未设置'} → ${patch.goalType}` });
  }
  if (patch.targetJlpt !== undefined && patch.targetJlpt !== profile.targetJlpt) {
    changes.push({ ja: `目標レベル：${profile.targetJlpt ?? '未設定'} → ${patch.targetJlpt ?? '未設定'}`, zh: `目标级别：${profile.targetJlpt ?? '未设置'} → ${patch.targetJlpt ?? '未设置'}` });
  }
  if (patch.dailyMinutes && patch.dailyMinutes !== profile.dailyMinutes) {
    changes.push({ ja: `1日の量：${profile.dailyMinutes ?? '?'}分 → ${patch.dailyMinutes}分`, zh: `每天的量：${profile.dailyMinutes ?? '?'}分钟 → ${patch.dailyMinutes}分钟` });
  }
  if (patch.weeklyDays && patch.weeklyDays !== profile.weeklyDays) {
    changes.push({ ja: `週の日数：${profile.weeklyDays ?? '?'}日 → ${patch.weeklyDays}日`, zh: `每周天数：${profile.weeklyDays ?? '?'}天 → ${patch.weeklyDays}天` });
  }

  // ルートの引き直しが必要なのは「現在地・目的・目標レベル」が変わったときだけ。
  // 量（分・日数）の変更はルートに影響しない（毎日の構成だけが変わる）
  const needRebuild = Boolean(
    (patch.knowledgeBand && patch.knowledgeBand !== diag?.knowledgeBand)
    || (patch.goalType && patch.goalType !== profile.goalType)
    || (patch.targetJlpt !== undefined && patch.targetJlpt !== profile.targetJlpt),
  );

  let route = profile.route;
  let diagnosis = diag;
  if (needRebuild && nextBand && nextGoal) {
    route = generateRoute({
      goalType: nextGoal,
      targetJlpt: nextTarget,
      knowledgeBand: nextBand,
      conversationBand: diag?.conversationBand ?? nextBand,
      diagnosis: diag ?? null,
      nowISO,
    });
    if (diag) {
      // 診断の生値は上書きするが、**先生が直した事実を残す**（AIの実測と混同させない）
      diagnosis = {
        ...diag,
        knowledgeBand: nextBand,
        routeExplanationJa: route.explanationJa,
        routeExplanationZh: route.explanationZh,
        adjustedByTeacherAt: nowISO,
        bandBeforeTeacherAdjust: diag.bandBeforeTeacherAdjust ?? diag.knowledgeBand,
      };
    }
  }

  return {
    profile: {
      ...profile,
      goalType: nextGoal,
      targetJlpt: nextTarget,
      dailyMinutes: patch.dailyMinutes ?? profile.dailyMinutes,
      weeklyDays: patch.weeklyDays ?? profile.weeklyDays,
      diagnosis: diagnosis ?? null,
      route,
      // ルートが変わったら今日のクエストは組み直す（古い道の続きを出さない）
      ...(needRebuild ? { lastQuest: null, todaySteps: null } : {}),
    },
    changes,
    routeRebuilt: needRebuild,
  };
};
