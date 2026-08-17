// 復習予報＋渋滞レスキュー（2026-08-17）。
//
// なぜ作るか（競合調査 WaniKani / Anki の失敗パターン）:
// - 仕事を持つ学習者は「今日どれくらいかかるか」が読めないと後回しにする。
//   → ①予報: 今日・明日・今週に確認バトルが何件解禁されるかを先に見せる
// - SRS離脱の最大要因は「数日空けたあとの復習の壁」。溜まってから慌てるのが最悪。
//   → ②渋滞の検知と救済: 期限超過が「その人の今日の復習予算」を超えたら、
//      今日ぶんだけに絞って残りを数日へ分散する（各日は自然解禁ぶんを引いた残り容量にだけ詰める）
// - 復習が1日を丸ごと食うと新規学習が止まり、学習者は「進んでいない」と感じて離脱する。
//   → ③新規学習の負荷ガバナー: 復習の重さから今日の新規量（normal / reduce / reviewOnly）を決める
//
// 設計の鉄則（PRODUCT_CANON 原則13「数字を作らない」・原則21「正直さ」）:
// - **件数はすべて実測**。mastery台帳（AdvMasteryLedger）の delayCheckOpensAt からしか作らない。
//   存在しないデータを推定で埋めない。期限ベースの復習件数（dueCount）は外部の実測値を引数で受ける
// - **所要時間は推定**。件数×定数でしか出せないので、フィールド名を estimatedMinutes に統一し、
//   文言にも「約」「推定 / 估算」を必ず入れる。実測の解答時間ではないと分かる形にする
// - **煽らない・責めない**。「溜まっています」「遅れています」の系統は使わない。
//   渋滞時の文言は「今日のぶんに振り分けました。今日は確認バトル◯件、約◯分です」の系統に固定する
//   （喪失恐怖でやらせない。ストリークを失う脅しもしない）
// - **画面に出す数字は1か所から**。要約・新規負荷・出題はすべて todayConfirmCount /
//   todayTotalEstimatedMinutes を見る。件数には必ず名詞を付ける（「今日は2件」では何の2件か読めない）
// - **純関数のみ**。Date.now() は使わず、すべて引数の nowISO / dateKey から導く
import type { AdvMasteryLedger } from './advTypes';
import { computeMastery } from './advMastery';

// ────────────────────────────── 定数（すべて名前付きで公開） ──────────────────────────────

/** 予報の対象日数（今日を含む7日＝「今週」） */
export const FORECAST_DAYS = 7;

/** 日付キーの基準タイムゾーン。AdvMasteryAttempt.dateKey（JST日付キー）と同じ基準に合わせる */
export const FORECAST_TIME_ZONE = 'Asia/Tokyo';

/**
 * 確認バトル1件あたりの目安分（**推定**）。
 *
 * 根拠: 確認バトルは normal tier で出る（advQuest.ts の confirmTarget 分岐）。
 * normal tier は advBattle.ts の TIER_SIZE で 7問・制限時間なし。
 * 1問あたりの時間予算はアプリ内に既にあり（TIER_SIZE.midboss.secPerQ = 35秒）、
 * 7問 × 35秒 ≒ 4分。よって 4分を採用する。
 *
 * なぜ advQuest.ts の est('battle') = 6分 を使わないか:
 * あちらは「解説を読む時間まで含んだ1ステップの見積り」で、予報が知りたい
 * 「あと何件こなせるか」の刻みとしては粗い。予報側は上の時間予算を根拠にする。
 * どちらも実測の平均解答時間ではないので、表示では必ず「推定」と明示すること。
 */
export const MINUTES_PER_CONFIRM_BATTLE = 4;

/**
 * 期限ベース復習（語彙など）1件あたりの目安分（**推定**）。
 *
 * 根拠: 既存UI（CourseHome.tsx / VocabularyHub.tsx）が 1語 = 0.5分 で所要を表示している。
 * 予報だけ別の係数を使うと画面間で数字が食い違い「どっちが本当か」問題になるため合わせる。
 */
export const MINUTES_PER_DUE_REVIEW_ITEM = 0.5;

/**
 * 渋滞（congestion）の判定閾値。**件数と推定分の両方**で判定する。
 *
 * 分の閾値は固定値にしない。「今日の時間予算を超える」ことが渋滞の本質なので、
 * 学習者の1日の学習時間（dailyMinutes）から reviewBudgetMinutes() で毎回導く。
 * 固定20分だったときは、5分コースの人（復習予算3分）が期限超過5件＝推定20分を抱えても
 * 渋滞と判定されず救済が出ない一方、30分コースの人（同18分）は予算内でも分散される、
 * という逆転が起きていた（＝閾値が自分の根拠と噛み合っていなかった）。
 * - overdueCount: 分の見積り定数を将来下げても効き続ける安全弁（件数そのものが多すぎる状態）
 */
export const CONGESTION_RULES = {
  /** 期限超過の確認バトルが「この件数を超えたら」渋滞（予算に関係なく効く安全弁） */
  overdueCount: 10,
} as const;

/**
 * レスキュー（分散）計画の規則。
 * - reviewShare: 1日の学習時間のうち復習へ割り当てる上限比率。
 *   1.0 にしない理由 = 復習で1日を丸ごと埋めると新規学習が止まり、
 *   「毎日やっているのに前に進んでいない」というSRS特有の離脱を自分で作ってしまうため
 * - maxSpreadDays: これ以上は先送りしない上限。無限に薄めると確認が永久に終わらない
 */
export const RESCUE_RULES = {
  reviewShare: 0.6,
  maxSpreadDays: 7,
  /** dailyMinutes 未設定の学習者に使う既定予算（分）。UIの中間コースに合わせる */
  defaultDailyMinutes: 15,
} as const;

/**
 * その学習者が「今日、復習に充てられる推定分」。
 * 渋滞の判定閾値もレスキューの1日の容量も、必ずこの1つの式から導く
 * （判定と計画で別の基準を使うと、渋滞と言いながら予算内の量を分散する等の逆転が起きる）。
 */
export const reviewBudgetMinutes = (dailyMinutes?: 5 | 15 | 30 | null): number =>
  (dailyMinutes ?? RESCUE_RULES.defaultDailyMinutes) * RESCUE_RULES.reviewShare;

/**
 * 新規学習の負荷ガバナーの規則。
 *
 * 設計の意図:
 * - 渋滞レスキューが効いている間（＝確認を数日に分けている間）は必ず 'reduce' 以上にする。
 *   新規を通常量のまま入れると、分散で減る速度より増える速度が勝って背景の残件が減らない
 * - ただし **'normal' へ戻す道は常に残す**。復習で1日を丸ごと埋め続けると
 *   「毎日やっているのに前に進んでいない」というSRS特有の離脱を自分で作ってしまう
 * - 'reviewOnly' は正直さの結果として出す。7日に分散してもなお1日の予算を超える量
 *   （＝分散しきれない量）や、こちらで分散できない期限ベース復習（dueCount）が
 *   予算を埋めるときは、できるふりをせず「今日は復習だけ」と言う
 */
export const NEW_LOAD_RULES = {
  /** dailyMinutes 未設定時に使う既定予算（分） */
  defaultDailyMinutes: 15,
  /** 今日の復習推定が予算のこの割合以上なら新規を減らす */
  reduceRatio: 0.6,
  /** 今日の復習推定が予算のこの割合以上なら今日は復習だけ */
  reviewOnlyRatio: 1.0,
  /** 今後 upcomingDays 日の解禁予定がこの件数以上なら、先回りして新規を減らす */
  reduceUpcomingCount: 6,
  /** 先読み日数（今日は含まない） */
  upcomingDays: 3,
} as const;

// ────────────────────────────── 日付キーのユーティリティ ──────────────────────────────

/**
 * ISO日時 → 日付キー（YYYY-MM-DD）。
 * 実行環境のTZに依存させないため Intl で明示的に変換する
 * （courseUsage.ts / courseAdminApi.ts と同じ en-CA + timeZone の作法）。
 */
export const dateKeyOf = (iso: string, timeZone: string = FORECAST_TIME_ZONE): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));

/** 日付キーの加算。カレンダー日どうしの計算なのでUTC上で行う（DSTの影響を受けない） */
export const addDayKey = (dateKey: string, days: number): string =>
  new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/**
 * 件数 → 推定分。
 * 0件のときだけ0分。1件以上は最低1分に丸める（「0分で終わります」と言わない）。
 */
export const estimateMinutes = (count: number, minutesPerItem: number): number =>
  count <= 0 ? 0 : Math.max(1, Math.round(count * minutesPerItem));

// ────────────────────────────── 型 ──────────────────────────────

/** 遅延確認（7日後の確認バトル）待ちの1件。すべて mastery台帳 由来の実測 */
export interface PendingConfirm {
  targetId: string;
  /** 確認バトルが解禁される日時（computeMastery の delayCheckOpensAt） */
  opensAt: string;
  /** opensAt を日付キーへ丸めたもの */
  opensDateKey: string;
  /** すでに解禁済みか（nowISO >= opensAt。classifyPendingDelay の confirmReady と同じ判定） */
  ready: boolean;
}

export interface ForecastBucket {
  /** 件数（実測） */
  count: number;
  /** 推定所要（分）。件数×定数の**推定値** */
  estimatedMinutes: number;
}

export interface ForecastDay extends ForecastBucket {
  dateKey: string;
  /** その日に解禁される targetId（解禁が古い順）。今日の欄は期限超過ぶんを含む */
  targetIds: string[];
}

export interface CongestionStatus {
  congested: boolean;
  /** 判定に使った期限超過の件数（実測） */
  overdueCount: number;
  /** 期限超過の推定所要（分） */
  estimatedMinutes: number;
  /** 判定に使った今日の復習予算（分）＝ reviewBudgetMinutes(dailyMinutes) */
  budgetMinutes: number;
  /** どの条件で渋滞と判定したか。空配列＝渋滞なし */
  reasons: ('count' | 'minutes')[];
}

export interface RescueDay extends ForecastBucket {
  dateKey: string;
  /** その日へ振り分けた「期限超過ぶん」の targetId */
  targetIds: string[];
  /**
   * count / estimatedMinutes は **振り分けたぶんだけ**（その日に自然解禁される確認バトルは含まない）。
   * 予定表に「その日の負担」として出すなら totalCount / totalEstimatedMinutes を使うこと。
   */
  /** その日に自然解禁される確認バトルの件数（実測・振り分けの対象外） */
  naturalCount: number;
  /** その日に実際に出る確認バトルの合計（振り分け＋自然解禁） */
  totalCount: number;
  /** totalCount の推定所要（分） */
  totalEstimatedMinutes: number;
}

export interface RescuePlan {
  /** 振り分けた総件数（＝期限超過の実測件数） */
  totalCount: number;
  /** 何日に分けたか（0＝振り分けるものが無かった） */
  spreadDays: number;
  /** 今日から spreadDays 日ぶんの計画（今日が先頭） */
  days: RescueDay[];
  /** 今日の推奨件数（期限超過ぶんのみ。今日じゅうに自然解禁されるぶんは含まない） */
  todayCount: number;
  /** todayCount の推定所要（分） */
  todayEstimatedMinutes: number;
  /**
   * 責めない知らせ（ja/zh）。**確認バトルのぶんだけ**を述べた文言。
   * 1日の要約としては使わないこと（期限ベース復習 dueCount が抜けて画面内で数字が食い違う）。
   * 画面の要約は ReviewForecast.summaryJa / summaryZh を使う。
   *
   * **この文言は「今日出すのは days[0].targetIds だけ」を呼び出し側が実際に守って初めて本当になる。**
   * 出題側を絞らないまま「振り分けました」と表示すると、実装していない挙動を約束することになる。
   */
  noticeJa: string;
  noticeZh: string;
}

export type NewLoadMode = 'normal' | 'reduce' | 'reviewOnly';

export interface NewLoadDecision {
  mode: NewLoadMode;
  /** 判定に使った今日の復習推定（分） */
  todayReviewMinutes: number;
  /** 判定に使った1日の時間予算（分） */
  dailyBudgetMinutes: number;
  /** 判定に使った「今後3日の解禁予定」件数（今日は含まない・実測） */
  upcomingCount: number;
  /** 渋滞レスキュー中だったか（この間は最低でも reduce） */
  congested: boolean;
  reasonJa: string;
  reasonZh: string;
}

export interface ReviewForecast {
  todayKey: string;
  /** 今日から FORECAST_DAYS 日ぶんの内訳（必ず FORECAST_DAYS 要素・今日が先頭） */
  byDay: ForecastDay[];
  /**
   * 今日ぶんの確認バトル（期限超過ぶん＋今日解禁ぶん）。**レスキュー前の生の件数**。
   * 画面に「今日やる件数」として出すのは todayConfirmCount のほう
   * （today.count をそのまま出すと、分散したのに全件を突きつける画面になる）。
   */
  today: ForecastBucket;
  /** 明日解禁される確認バトル */
  tomorrow: ForecastBucket;
  /** 今日を含む7日の合計 */
  week: ForecastBucket;
  /** そのうち期限超過ぶん（今日の内数） */
  overdue: ForecastBucket;
  /** 8日目以降に解禁される件数（まだ7日待ちの残り） */
  laterCount: number;
  /** 引数で受けた期限ベース復習の件数（外部の実測） */
  dueCount: number;
  /**
   * 今日じっさいに出す確認バトルの件数（レスキュー適用後の期限超過ぶん＋今日じゅうに解禁されるぶん）。
   * **画面・要約・出題はこの数字で揃える**。todayTotalEstimatedMinutes もこれと dueCount から出している。
   */
  todayConfirmCount: number;
  /**
   * 今日じっさいに出す確認バトルのtarget集合。**件数(todayConfirmCount)と必ず一致する**。
   * 出題側（AdvShellのconfirmTargetIds）はこれをそのまま使う。
   * rescue.days[0] だけを見ると今日解禁ぶんが漏れて画面と食い違う（2026-08-17 再レビュー）
   */
  todayConfirmTargetIds: string[];
  /** 今日やる想定の合計推定分（todayConfirmCount ＋ 期限ベース復習 dueCount） */
  todayTotalEstimatedMinutes: number;
  congestion: CongestionStatus;
  /** 渋滞しているときだけ非null。していなければ分散する必要が無い */
  rescue: RescuePlan | null;
  newLoad: NewLoadDecision;
  /** 予報の要約（責めない文言・ja/zh） */
  summaryJa: string;
  summaryZh: string;
}

// ────────────────────────────── ①予報 ──────────────────────────────

/**
 * mastery台帳から「遅延確認待ち」を全部拾う（解禁が古い順）。
 *
 * ready の判定は classifyPendingDelay（advMastery.ts）と同一のルール
 * （state === 'cleared_pending_delay' かつ nowISO >= delayCheckOpensAt）を意図的に再現している。
 * classifyPendingDelay は opensAt を返さないため予報に使えず、両方呼ぶと台帳を2周することになるので
 * ここで1周にまとめた。**両者が同じ集合になることはテストで固定してある。**
 */
export const collectPendingConfirms = (
  ledger: AdvMasteryLedger,
  nowISO: string,
  timeZone: string = FORECAST_TIME_ZONE,
  includeTargetId?: (targetId: string) => boolean,
): PendingConfirm[] => {
  const out: PendingConfirm[] = [];
  for (const [targetId, attempts] of Object.entries(ledger ?? {})) {
    if (includeTargetId && !includeTargetId(targetId)) continue;
    // 1件でも壊れた記録（completedAt が日付として読めない等）があると computeMastery が投げ、
    // 予報まるごとが落ちる。1targetの破損で画面全体を落とさない（他のtargetの予報は正しく出す）
    let opensAt: string | null | undefined;
    try {
      const st = computeMastery(Array.isArray(attempts) ? attempts : [], nowISO);
      if (st.state !== 'cleared_pending_delay') continue;
      opensAt = st.delayCheckOpensAt;
    } catch {
      continue;
    }
    // 日付として読めない delayCheckOpensAt は dateKeyOf（Intl）が投げるので、数える前に弾く
    if (!opensAt || Number.isNaN(Date.parse(opensAt))) continue;
    out.push({
      targetId,
      opensAt,
      opensDateKey: dateKeyOf(opensAt, timeZone),
      ready: nowISO >= opensAt,
    });
  }
  // 解禁が古い順＝いちばん忘れかけている順。同時刻は targetId で安定化
  out.sort((a, b) => (a.opensAt === b.opensAt ? (a.targetId < b.targetId ? -1 : 1) : a.opensAt < b.opensAt ? -1 : 1));
  return out;
};

/**
 * 日別の予報を組む（今日から FORECAST_DAYS 日）。
 * 期限超過（ready）は「今日やるもの」なので今日の欄へ畳み込む。
 */
export const buildForecastDays = (
  pending: PendingConfirm[],
  todayKey: string,
  days: number = FORECAST_DAYS,
): ForecastDay[] => {
  const keys = Array.from({ length: days }, (_, i) => addDayKey(todayKey, i));
  const buckets = new Map<string, string[]>(keys.map((k) => [k, []]));
  for (const p of pending) {
    // 期限超過 or 今日より前の日付キー → 今日の欄。それ以外は解禁日の欄（範囲外は捨てる）
    const key = p.ready || p.opensDateKey <= todayKey ? todayKey : p.opensDateKey;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p.targetId);
  }
  return keys.map((dateKey) => {
    const targetIds = buckets.get(dateKey) ?? [];
    return {
      dateKey,
      targetIds,
      count: targetIds.length,
      estimatedMinutes: estimateMinutes(targetIds.length, MINUTES_PER_CONFIRM_BATTLE),
    };
  });
};

// ────────────────────────────── ③渋滞の検知 ──────────────────────────────

/**
 * 期限超過の件数から渋滞かどうかを判定する（件数と推定分の両方で見る）。
 *
 * 分のほうは **その学習者の今日の復習予算**（reviewBudgetMinutes）と比べる。
 * 全員一律の固定分にすると、5分コースの人が予算の4倍を抱えていても救済されず、
 * 30分コースの人が予算の範囲内で分散されるという逆転が起きる。
 */
export const detectCongestion = (
  overdueCount: number,
  dailyMinutes?: 5 | 15 | 30 | null,
): CongestionStatus => {
  const estimatedMinutes = estimateMinutes(overdueCount, MINUTES_PER_CONFIRM_BATTLE);
  const budgetMinutes = reviewBudgetMinutes(dailyMinutes);
  const reasons: ('count' | 'minutes')[] = [];
  if (overdueCount > CONGESTION_RULES.overdueCount) reasons.push('count');
  if (estimatedMinutes > budgetMinutes) reasons.push('minutes');
  return { congested: reasons.length > 0, overdueCount, estimatedMinutes, budgetMinutes, reasons };
};

// ────────────────────────────── ④レスキュー計画 ──────────────────────────────

/**
 * 溜まった確認バトルを今日から数日へ振り分ける計画を返す（純関数）。
 * **実際の再配分（どのtargetを今日出すか）は呼び出し側が行う。** ここは計画だけ。
 *
 * spreadDays を省略したときは「1日の復習予算（reviewBudgetMinutes）」から自動算出し、
 * **その日に自然解禁されるぶん（naturalCountsByDay）を差し引いた残り容量にだけ詰める**。
 * 差し引かないと、明日4件が自然解禁される日に2件を上乗せしておきながら
 * 予定表には「明日は2件」と出る＝実負担と見込みがズレた予定表になる。
 * 7日ぶんの容量に収まらない量は、7日目より先へは薄めず超過ぶんを各日へ均等に上乗せする
 * （無限に薄めると確認が永久に終わらない）。
 *
 * spreadDays を明示した場合は呼び出し側の意思として尊重し、その日数へ均等配分する
 * （容量による調整はしない。実負担は各日の totalCount に出る）。
 */
export const planRescue = (input: {
  /** 期限超過している targetId。**渡された順序をそのまま尊重する**（buildReviewForecast は解禁が古い順で渡す） */
  overdueTargetIds: string[];
  todayKey: string;
  /** 学習者の1日あたり学習時間。null なら RESCUE_RULES.defaultDailyMinutes */
  dailyMinutes?: 5 | 15 | 30 | null;
  /** 明示すればその日数へ均等配分 */
  spreadDays?: number;
  /**
   * 今日から順に「その日に自然解禁される確認バトルの件数」（期限超過ぶんは含まない・実測）。
   * 省略時は0扱い（＝将来の解禁を見ない従来の均等配分と同じ計画になる）。
   */
  naturalCountsByDay?: number[];
}): RescuePlan => {
  const ids = input.overdueTargetIds;
  const total = ids.length;
  const naturalAt = (i: number): number => Math.max(0, Math.floor(input.naturalCountsByDay?.[i] ?? 0));

  // 振り分けるものが無いとき。「今日は0件・約0分」と言わない（0分と書かない原則）
  if (total === 0) {
    return {
      totalCount: 0,
      spreadDays: 0,
      days: [],
      todayCount: 0,
      todayEstimatedMinutes: 0,
      noticeJa: '今日に振り分ける確認バトルはありません',
      noticeZh: '今天没有需要分配的复查战',
    };
  }

  const perDayMinutes = reviewBudgetMinutes(input.dailyMinutes);
  // 1日に入れる件数。予算が1件ぶんに満たなくても、必ず1件は進める（永久に終わらない計画を作らない）
  const perDayCount = Math.max(1, Math.floor(perDayMinutes / MINUTES_PER_CONFIRM_BATTLE));
  // その日の残り容量。今日だけは自然解禁で埋まっていても1件は進める
  const capacityAt = (i: number): number =>
    i === 0 ? Math.max(1, perDayCount - naturalAt(0)) : Math.max(0, perDayCount - naturalAt(i));

  let counts: number[];
  if (input.spreadDays !== undefined) {
    const fixedDays = Math.max(1, Math.floor(input.spreadDays));
    const base = Math.floor(total / fixedDays);
    const rem = total % fixedDays;
    counts = Array.from({ length: fixedDays }, (_, i) => base + (i < rem ? 1 : 0));
  } else {
    const maxDays = RESCUE_RULES.maxSpreadDays;
    const caps = Array.from({ length: maxDays }, (_, i) => capacityAt(i));
    const totalCapacity = caps.reduce((a, b) => a + b, 0);
    if (total <= totalCapacity) {
      // 前の日から容量ぶんだけ詰める（古い確認から先に片づける）。
      // 容量0の日（自然解禁だけで埋まっている日）は0件のまま残し、日付は飛ばさない
      counts = [];
      let left = total;
      for (let i = 0; i < maxDays && left > 0; i += 1) {
        const n = Math.min(caps[i], left);
        counts.push(n);
        left -= n;
      }
    } else {
      // 7日ぶんの容量にも収まらない量。先へは薄めず、超過ぶんを均等に上乗せする
      const over = total - totalCapacity;
      const add = Math.floor(over / maxDays);
      const rem = over % maxDays;
      counts = caps.map((c, i) => c + add + (i < rem ? 1 : 0));
    }
  }

  const days: RescueDay[] = [];
  let cursor = 0;
  counts.forEach((n, i) => {
    const targetIds = ids.slice(cursor, cursor + n);
    cursor += n;
    const naturalCount = naturalAt(i);
    const totalCount = targetIds.length + naturalCount;
    days.push({
      dateKey: addDayKey(input.todayKey, i),
      targetIds,
      count: targetIds.length,
      estimatedMinutes: estimateMinutes(targetIds.length, MINUTES_PER_CONFIRM_BATTLE),
      naturalCount,
      totalCount,
      totalEstimatedMinutes: estimateMinutes(totalCount, MINUTES_PER_CONFIRM_BATTLE),
    });
  });

  const todayCount = days[0]?.count ?? 0;
  const todayEstimatedMinutes = days[0]?.estimatedMinutes ?? 0;
  // 「のこりは◯日」は実際に振り分けた日だけ数える（0件の日を数えると予定表と食い違う）
  const restDays = days.slice(1).filter((d) => d.count > 0).length;
  const restJa = restDays > 0 ? `。のこりの確認バトルは${restDays}日に分けています` : '';
  const restZh = restDays > 0 ? `。剩下的复查战已分到之后的${restDays}天` : '';

  return {
    totalCount: total,
    spreadDays: days.length,
    days,
    todayCount,
    todayEstimatedMinutes,
    // notice は**振り分けたという事実だけ**を述べる（2026-08-17 再レビュー）。
    // 今日の件数・分数は同日解禁ぶんを含む要約（summary / todayConfirmCount）が唯一の正準。
    // ここで独自に「今日は◯件」と書くと、同じ画面で数字が食い違う
    noticeJa: `期限をすぎたぶんは、今日から${days.length}日に振り分けました${restJa}`,
    noticeZh: `已过期的部分，已经分配到从今天起的${days.length}天里${restZh}`,
  };
};

// ────────────────────────────── ⑤新規学習の負荷ガバナー ──────────────────────────────

/**
 * 今日あたらしいことを入れてよいかを決める。
 * todayReviewMinutes には「レスキュー適用後」の今日の復習推定を渡すこと
 * （分散したのに分散前の重さで新規を止めるのは筋が通らない）。
 */
export const decideNewLoad = (input: {
  /** 今日の復習推定（分・レスキュー適用後の確認バトル＋期限ベース復習） */
  todayReviewMinutes: number;
  /** 今後 NEW_LOAD_RULES.upcomingDays 日に解禁される件数（今日は含まない） */
  upcomingCount: number;
  dailyMinutes?: 5 | 15 | 30 | null;
  /** 渋滞レスキュー中か（確認を数日に分けている最中） */
  congested?: boolean;
}): NewLoadDecision => {
  const dailyBudgetMinutes = input.dailyMinutes ?? NEW_LOAD_RULES.defaultDailyMinutes;
  const m = input.todayReviewMinutes;
  const congested = input.congested ?? false;
  const base = { todayReviewMinutes: m, dailyBudgetMinutes, upcomingCount: input.upcomingCount, congested };

  if (m >= dailyBudgetMinutes * NEW_LOAD_RULES.reviewOnlyRatio) {
    return {
      ...base,
      mode: 'reviewOnly',
      reasonJa: `今日は復習だけにします（約${m}分・推定）。新しいことは明日からで大丈夫です`,
      reasonZh: `今天只做复习（约${m}分钟·估算）。新内容明天再开始也没问题`,
    };
  }
  if (m >= dailyBudgetMinutes * NEW_LOAD_RULES.reduceRatio) {
    return {
      ...base,
      mode: 'reduce',
      reasonJa: `今日は復習が約${m}分あるので、新しいことは少なめにします`,
      reasonZh: `今天复习约${m}分钟，所以新内容少放一些`,
    };
  }
  // 分散中は今日の1回ぶんが軽く見えるが、背景に確認が残っている。
  // 通常量の新規を入れると増える速度が勝つので、この間は必ず reduce に落とす
  if (congested) {
    return {
      ...base,
      mode: 'reduce',
      reasonJa: '確認バトルを数日に分けている間は、新しいことを少なめにします',
      reasonZh: '复查战会分成几天来做，这几天新内容少放一些',
    };
  }
  if (input.upcomingCount >= NEW_LOAD_RULES.reduceUpcomingCount) {
    return {
      ...base,
      mode: 'reduce',
      reasonJa: `これから${NEW_LOAD_RULES.upcomingDays}日で確認バトルが${input.upcomingCount}件あるので、今日の新しいことは少なめにします`,
      reasonZh: `接下来${NEW_LOAD_RULES.upcomingDays}天有${input.upcomingCount}场复查战，所以今天的新内容少放一些`,
    };
  }
  return {
    ...base,
    mode: 'normal',
    reasonJa: '今日は新しいことを進められます',
    reasonZh: '今天可以继续学新内容',
  };
};

// ────────────────────────────── まとめ（入口） ──────────────────────────────

export interface ReviewForecastInput {
  ledger: AdvMasteryLedger;
  nowISO: string;
  /**
   * 期限ベースの復習件数（旧コースの progress 由来の実測値）。
   * こちらは遅延確認と違いアプリ側で分散できないため、レスキューの対象外・ガバナーの入力にのみ使う。
   */
  dueCount?: number;
  dailyMinutes?: 5 | 15 | 30 | null;
  /** 日付キーの基準TZ。既定は AdvMasteryAttempt.dateKey と同じ Asia/Tokyo */
  timeZone?: string;
  /** レスキューの分散日数を明示したいとき（省略時は予算から自動算出） */
  spreadDays?: number;
  /**
   * 確認バトルとして実際に出せる target だけに絞るフィルタ。
   *
   * **呼び出し側で確認バトルの対象を絞っているなら必ず渡すこと。**
   * 例: AdvShell は confirmTargetIds から reading- / listening- / mock 系を除外している。
   * 除外分を予報に数えると「12件と言われたのに8件しか出てこない」という
   * 数字の嘘になる（原則13）。予報と実際に出る件数は必ず一致させる。
   */
  includeTargetId?: (targetId: string) => boolean;
}

/** 予報・渋滞・レスキュー・ガバナーを一度に返す（この層はすべて純関数） */
export const buildReviewForecast = (input: ReviewForecastInput): ReviewForecast => {
  const timeZone = input.timeZone ?? FORECAST_TIME_ZONE;
  const dueCount = Math.max(0, Math.floor(input.dueCount ?? 0));
  const todayKey = dateKeyOf(input.nowISO, timeZone);

  const pending = collectPendingConfirms(input.ledger, input.nowISO, timeZone, input.includeTargetId);
  const byDay = buildForecastDays(pending, todayKey, FORECAST_DAYS);

  const overdueIds = pending.filter((p) => p.ready).map((p) => p.targetId);
  const overdue: ForecastBucket = {
    count: overdueIds.length,
    estimatedMinutes: estimateMinutes(overdueIds.length, MINUTES_PER_CONFIRM_BATTLE),
  };
  const today: ForecastBucket = { count: byDay[0].count, estimatedMinutes: byDay[0].estimatedMinutes };
  const tomorrow: ForecastBucket = { count: byDay[1].count, estimatedMinutes: byDay[1].estimatedMinutes };
  const weekCount = byDay.reduce((n, d) => n + d.count, 0);
  const week: ForecastBucket = {
    count: weekCount,
    estimatedMinutes: estimateMinutes(weekCount, MINUTES_PER_CONFIRM_BATTLE),
  };
  const lastKey = byDay[byDay.length - 1].dateKey;
  const laterCount = pending.filter((p) => !p.ready && p.opensDateKey > lastKey).length;

  const congestion = detectCongestion(overdue.count, input.dailyMinutes ?? null);
  // 各日に自然解禁されるぶん（期限超過は今日の欄へ畳み込まれているので今日だけ内数を引く）。
  // これを渡さないと、明日4件が解禁される日にも「明日は2件」という予定表を出してしまう
  const naturalCountsByDay = byDay.map((d, i) => (i === 0 ? d.count - overdue.count : d.count));
  // 今日じゅうに自然解禁されるぶん（期限超過を除く）。出題集合の組み立てに使う
  const overdueIdSet = new Set(overdueIds);
  const todayNaturalIds = (byDay[0]?.targetIds ?? []).filter((id) => !overdueIdSet.has(id));
  const rescue = congestion.congested
    ? planRescue({
      overdueTargetIds: overdueIds,
      todayKey,
      dailyMinutes: input.dailyMinutes ?? null,
      spreadDays: input.spreadDays,
      naturalCountsByDay,
    })
    : null;

  // 今日じっさいに出す確認バトル: 渋滞していれば「分散後の期限超過ぶん＋今日じゅうに解禁されるぶん」、
  // していなければ今日の全件。**要約も出題もこの1つの数字を使う**（画面間で件数を食い違わせない）
  const todayConfirmCount = rescue ? rescue.todayCount + naturalCountsByDay[0] : today.count;
  // 出題側が使う唯一の集合（件数と必ず一致する）。渋滞時は「分散後の期限超過ぶん＋今日解禁ぶん」
  const todayConfirmTargetIds = rescue
    ? [...new Set([...(rescue.days[0]?.targetIds ?? []), ...todayNaturalIds])]
    : (byDay[0]?.targetIds ?? []);
  const todayConfirmMinutes = estimateMinutes(todayConfirmCount, MINUTES_PER_CONFIRM_BATTLE);
  const todayTotalEstimatedMinutes = todayConfirmMinutes + estimateMinutes(dueCount, MINUTES_PER_DUE_REVIEW_ITEM);

  // 「今後3日」は今日を含まない（今日ぶんは todayReviewMinutes 側で数えているため二重に数えない）
  const upcomingCount = byDay
    .slice(1, 1 + NEW_LOAD_RULES.upcomingDays)
    .reduce((n, d) => n + d.count, 0);

  const newLoad = decideNewLoad({
    todayReviewMinutes: todayTotalEstimatedMinutes,
    upcomingCount,
    dailyMinutes: input.dailyMinutes ?? null,
    congested: congestion.congested,
  });

  const { summaryJa, summaryZh } = buildSummary({
    rescue, todayConfirmCount, tomorrow, dueCount, todayTotalEstimatedMinutes,
  });

  return {
    todayKey, byDay, today, tomorrow, week, overdue, laterCount, dueCount,
    todayConfirmCount, todayConfirmTargetIds,
    todayTotalEstimatedMinutes, congestion, rescue, newLoad, summaryJa, summaryZh,
  };
};

/**
 * 予報の要約文。**責めない**こと（「溜まっています」「遅れています」は使わない）。
 *
 * 不変条件（渋滞していてもいなくても同じ）:
 * - 要約に出す分数は **必ず todayTotalEstimatedMinutes**。同じ画面の newLoad.reasonJa も
 *   この数字から作られるので、片方だけ別の分数を語ると「どっちが本当か」問題になる
 * - 要約に出す確認バトルの件数は **必ず todayConfirmCount**（＝今日じっさいに出す件数）
 * - 期限ベース復習（dueCount）を落とさない。渋滞時は分散できるのが確認バトルだけなので、
 *   rescue の文言をそのまま要約にすると語彙復習まるごとが要約から消える
 * - 件数には必ず名詞を付ける（「今日は2件」では何の2件か読めない）
 */
const buildSummary = (input: {
  rescue: RescuePlan | null;
  /** 今日じっさいに出す確認バトルの件数（レスキュー適用後） */
  todayConfirmCount: number;
  tomorrow: ForecastBucket;
  dueCount: number;
  todayTotalEstimatedMinutes: number;
}): { summaryJa: string; summaryZh: string } => {
  const { rescue, todayConfirmCount, tomorrow, dueCount, todayTotalEstimatedMinutes } = input;

  if (todayConfirmCount === 0 && dueCount === 0) {
    const nextJa = tomorrow.count > 0 ? `明日は確認バトルが${tomorrow.count}件あります` : '';
    const nextZh = tomorrow.count > 0 ? `明天有${tomorrow.count}场复查战` : '';
    return {
      summaryJa: nextJa ? `今日の復習はありません。${nextJa}` : '今日の復習はありません',
      summaryZh: nextZh ? `今天没有要复习的。${nextZh}` : '今天没有要复习的',
    };
  }
  // 確認バトルと期限ベース復習は中身が違うので合算した1つの件数にしない
  // （「8件」と出したときに、確認バトル8回なのか単語8語なのかが読めなくなる）
  const ja: string[] = [];
  const zh: string[] = [];
  if (todayConfirmCount > 0) { ja.push(`確認バトル${todayConfirmCount}件`); zh.push(`${todayConfirmCount}场复查战`); }
  if (dueCount > 0) { ja.push(`復習${dueCount}件`); zh.push(`${dueCount}项复习`); }
  const headJa = `今日は${ja.join('と')}、約${todayTotalEstimatedMinutes}分の見込みです（推定）`;
  const headZh = `今天有${zh.join('和')}，大约${todayTotalEstimatedMinutes}分钟（估算）`;

  if (rescue) {
    // 渋滞時: 「振り分けた結果、今日はこれだけ」。明日の件数は言わない
    // （明日は分散ぶん＋自然解禁ぶんで変わるため、ここで数字を出すと予定表と食い違う）
    const restDays = rescue.days.slice(1).filter((d) => d.count > 0).length;
    const restJa = restDays > 0 ? `。のこりの確認バトルは${restDays}日に分けています` : '';
    const restZh = restDays > 0 ? `。剩下的复查战已分到之后的${restDays}天` : '';
    return {
      summaryJa: `今日のぶんに振り分けました。${headJa}${restJa}`,
      summaryZh: `今天的份量已经分好了。${headZh}${restZh}`,
    };
  }
  const tailJa = tomorrow.count > 0 ? `。明日は確認バトルが${tomorrow.count}件です` : '';
  const tailZh = tomorrow.count > 0 ? `。明天有${tomorrow.count}场复查战` : '';
  return { summaryJa: headJa + tailJa, summaryZh: headZh + tailZh };
};
