// 今日タブの KPI と要対応リスト（純関数・DB非依存）。
//
// 狙い:「全員クリックしないと異常が見えない」現状の廃止。一覧に出す前に
// ここで異常を機械的に拾い、管理者は要対応リストだけ見れば良い状態にする。
// 対象は type='student' のみ（テスト・管理者アカウントの停滞や期限は騒がない）。
// 値はすべて実在データ由来（原則13）。推定・仮置きの項目は作らない。
import type { AdminIssueReport } from '../courseAdminApi';
import { jstDateKeyOf, weekStartKeyOf } from '../adventure/advTeacherNote';
import { readAdvProfile } from '../adventure/advProfile';
import type { UsageLimits } from './adminAccountsApi';
import { monthlyCapOf, type AdminAccountView } from './adminAccountModel';

export interface AdminKpis {
  /** 生徒アカウント数（テスト・管理者・その他は含まない） */
  students: number;
  /** うちアカウント発行済み・未ログイン（learner行なし） */
  notLoggedIn: number;
  /** 今週（JST月曜始まり）に学習した生徒数 */
  activeThisWeek: number;
  /** 停滞中の生徒数（下の stalled ルールと同じ判定） */
  stalled: number;
  /** 期限まで30日以内の生徒数（利用中のみ） */
  expiring30: number;
  /** 今月のAIコスト（USD）: 生徒分 */
  monthCostStudents: number;
  /** 今月のAIコスト（USD）: 検証分（テスト・管理者・その他） */
  monthCostOthers: number;
}

export type AttentionKind =
  | 'not_logged_in' | 'contradiction' | 'expired' | 'stalled'
  | 'near_cap' | 'expiring30' | 'weekly_note_due' | 'open_issues';

export interface AttentionItem {
  kind: AttentionKind;
  severity: 'warn' | 'info';
  titleJa: string;
  detailJa: string;
  /** タップで生徒詳細へ飛ぶ対象。全体項目（open_issues）は null */
  userId: string | null;
}

const DAY_MS = 86400000;

/** 日付キー同士の日数差（toKey - fromKey）。UTC演算＝実行環境のTZに左右されない */
const daysBetweenKeys = (fromKey: string, toKey: string): number =>
  Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);

/** ISO時刻からの経過日数。読めない値は NaN（呼び出し側で Number.isFinite を確認） */
const daysSinceISO = (iso: string, nowISO: string): number =>
  (Date.parse(nowISO) - Date.parse(iso)) / DAY_MS;

const labelOf = (v: AdminAccountView): string =>
  v.learner?.displayName || v.account.loginId;

/**
 * 停滞判定。badge='active' かつ learner あり かつ
 * （最終学習が3日以上前、または 最終学習なしで learner 作成から7日以上）。
 * learner 作成から7日未満は停滞にしない（始めたばかりの生徒を騒がない。
 * 学習日は questLog / mastery / ai_usage_daily 由来なので、JLPT特化で
 * AI会話が0回の生徒も、バトルをやっていれば停滞にならない）。
 */
const isStalled = (v: AdminAccountView, nowISO: string): boolean => {
  if (v.type !== 'student' || v.badge !== 'active' || v.learner === null) return false;
  const ageDays = daysSinceISO(v.learner.createdAtISO, nowISO);
  if (!Number.isFinite(ageDays) || ageDays < 7) return false;
  if (v.lastStudyDateKey === null) return true;
  return daysBetweenKeys(v.lastStudyDateKey, jstDateKeyOf(nowISO)) >= 3;
};

const isExpiring30 = (v: AdminAccountView): boolean =>
  v.badge === 'active' && v.daysToExpiry !== null && v.daysToExpiry <= 30;

export const buildKpis = (views: AdminAccountView[], nowISO: string): AdminKpis => {
  const students = views.filter((v) => v.type === 'student');
  const weekStart = weekStartKeyOf(jstDateKeyOf(nowISO));
  const costOf = (vs: AdminAccountView[]): number =>
    vs.reduce((sum, v) => sum + (v.monthUsage?.costUsd ?? 0), 0);
  return {
    students: students.length,
    notLoggedIn: students.filter((v) => v.learner === null).length,
    activeThisWeek: students.filter((v) => v.lastStudyDateKey !== null && v.lastStudyDateKey >= weekStart).length,
    stalled: students.filter((v) => isStalled(v, nowISO)).length,
    expiring30: students.filter(isExpiring30).length,
    monthCostStudents: costOf(students),
    monthCostOthers: costOf(views.filter((v) => v.type !== 'student')),
  };
};

export const buildAttention = (
  views: AdminAccountView[],
  openIssues: AdminIssueReport[],
  limits: UsageLimits,
  nowISO: string,
): AttentionItem[] => {
  const warns: AttentionItem[] = [];
  const infos: AttentionItem[] = [];
  const todayKey = jstDateKeyOf(nowISO);
  const thisWeek = weekStartKeyOf(todayKey);

  for (const v of views) {
    if (v.type !== 'student') continue;
    const name = labelOf(v);

    // アカウント発行済み・未ログイン（発行から3日以上経過）
    if (v.access !== null && v.learner === null) {
      const age = daysSinceISO(v.account.userCreatedAtISO, nowISO);
      if (Number.isFinite(age) && age >= 3) {
        warns.push({
          kind: 'not_logged_in', severity: 'warn', userId: v.account.userId,
          titleJa: '未ログイン',
          detailJa: `${name}: アカウント発行から${Math.floor(age)}日、まだ一度もログインしていません`,
        });
      }
    }

    // 期間と実態の矛盾（開始前なのにログイン・学習記録あり。実例: kana）
    if (v.contradiction) {
      warns.push({
        kind: 'contradiction', severity: 'warn', userId: v.account.userId,
        titleJa: '期間の矛盾',
        detailJa: `${name}: 受講期間は「開始前」ですが、すでにログイン・学習の記録があります（現在この生徒は学習画面に入れません）`,
      });
    }

    if (v.badge === 'expired') {
      warns.push({
        kind: 'expired', severity: 'warn', userId: v.account.userId,
        titleJa: '期限切れ',
        detailJa: `${name}: 受講期間が終了しています（継続するなら期間を延長してください）`,
      });
    }

    if (isStalled(v, nowISO)) {
      const last = v.lastStudyDateKey;
      warns.push({
        kind: 'stalled', severity: 'warn', userId: v.account.userId,
        titleJa: '学習が停滞',
        detailJa: last
          ? `${name}: 最終学習から${daysBetweenKeys(last, todayKey)}日経っています（最終: ${last}）`
          : `${name}: 初回ログインから7日以上、学習記録がありません`,
      });
    }

    // 月次上限の85%到達
    const cap = monthlyCapOf(v, limits);
    if (v.monthUsage !== null && cap > 0 && v.monthUsage.sessions / cap >= 0.85) {
      warns.push({
        kind: 'near_cap', severity: 'warn', userId: v.account.userId,
        titleJa: '月次上限に接近',
        detailJa: `${name}: 今月のAI会話 ${v.monthUsage.sessions}/${cap}回（85%以上）`,
      });
    }

    if (isExpiring30(v)) {
      infos.push({
        kind: 'expiring30', severity: 'info', userId: v.account.userId,
        titleJa: '期限30日以内',
        detailJa: `${name}: 受講期限まで残り${v.daysToExpiry}日`,
      });
    }

    // 今週の先生コメント未送信（学習実績のある利用中の生徒のみ）
    if (v.adv?.onboarded && v.adv.totalStudyDays > 0 && v.badge === 'active') {
      const notes = readAdvProfile(v.learner?.settings)?.teacherNotes ?? [];
      const latestWeek = notes.reduce<string | null>(
        (acc, n) => (acc === null || n.weekStartKey > acc ? n.weekStartKey : acc), null,
      );
      if (latestWeek !== thisWeek) {
        infos.push({
          kind: 'weekly_note_due', severity: 'info', userId: v.account.userId,
          titleJa: '今週の先生コメント未送信',
          detailJa: `${name}: 今週（${thisWeek}〜）の一言をまだ送っていません`,
        });
      }
    }
  }

  if (openIssues.length > 0) {
    warns.push({
      kind: 'open_issues', severity: 'warn', userId: null,
      titleJa: '未解決の問題報告',
      detailJa: `未解決の問題報告が${openIssues.length}件あります（運用タブで確認）`,
    });
  }

  return [...warns, ...infos];
};
