// 点検ボードの「判定」だけを集めた場所。**I/Oを一切しない純関数**（2026-08-24 WAVE7）。
//
// なぜ切り出すか:
//   render-ops-board.mjs は SQL実行とHTML生成が一体で、テストが1本も書けなかった。
//   ボードは毎朝自動で貼り直される＝**壊れても誰も気づかない**種類のコードなので、
//   「どう数えるか」「異常かどうか」の判断だけをここへ移してテストで固定する。
//
// 置くもの / 置かないもの:
//   置く   … 名寄せ・リピート率・生存確認の判定・原価の内訳・受講権の異常・売上の足し方
//   置かない … SQL文字列・fetch・ファイル読み・HTML（すべて render-ops-board.mjs 側）
//
// 数字の性質を混ぜないという約束（このファイルの最重要ルール）:
//   実入金（Stripeで着金した） / DB上の理論値（確定申込×単価） / 推定（トークン数からの見積り）
//   の3つは**別のもの**として持ち回り、画面に出すときも別のものとして出す。
//   通常活動の料金回収は意図的にアナログ運用のままなので、DBから出るのは常に理論値。

// ───────────────────────────────────────────────────────────
// 名寄せとリピート率
// ───────────────────────────────────────────────────────────

/**
 * 通常活動の申込を「誰か」にまとめる鍵。
 *
 * 優先順は supabase/migrations/20260824110000_activity_entries_contact.sql のコメントに
 * 明記されている `coalesce(user_id::text, lower(trim(email)), 'name:' || name)` と同じ。
 * ここでは email / name を**SQL側でハッシュ済み**の値として受ける
 * （lower+trim したあとの md5 なので、同値判定はハッシュ前と完全に一致する。
 *  スクリプトのメモリにも生の氏名・メールを載せないための措置）。
 *
 * @param {{user_id?: string|null, email_key?: string|null, name_key?: string|null}} row
 * @returns {string} 同じ人なら同じ文字列
 */
export const personKey = (row) => {
  const uid = String(row?.user_id ?? '').trim();
  if (uid) return `user:${uid}`;
  const mail = String(row?.email_key ?? '').trim();
  if (mail) return `mail:${mail}`;
  return `name:${String(row?.name_key ?? '').trim()}`;
};

/** personKey がどの手がかりで作られたか（誤差の説明に使う） */
export const personKeyKind = (key) =>
  key.startsWith('user:') ? 'user' : key.startsWith('mail:') ? 'mail' : 'name';

/**
 * リピート率。「2回以上参加した人 ÷ 参加した人」。
 *
 * ⚠️ 既存166行は user_id も email も持たないので、全員が name フォールバックになる。
 *    同姓同名は1人に潰れ、表記ゆれは別人に割れる。**必ず approximate を画面に出す**。
 *
 * @param {Array<{user_id?:string|null,email_key?:string|null,name_key?:string|null,day?:string}>} rows
 */
export const repeatStats = (rows) => {
  const days = new Map();   // personKey -> Set<開催日>
  const kinds = new Map();  // personKey -> 'user' | 'mail' | 'name'
  for (const r of rows ?? []) {
    const k = personKey(r);
    const set = days.get(k) ?? new Set();
    set.add(String(r?.day ?? ''));
    days.set(k, set);
    kinds.set(k, personKeyKind(k));
  }
  const people = days.size;
  let repeaters = 0;
  for (const set of days.values()) if (set.size >= 2) repeaters += 1;
  const nameFallbackPeople = [...kinds.values()].filter((k) => k === 'name').length;
  return {
    people,
    repeaters,
    /** 0〜1。参加者0人のときは null（0%と言い切らない） */
    rate: people === 0 ? null : repeaters / people,
    nameFallbackPeople,
    /** 名前しか手がかりが無い人が1人でも混ざっていれば誤差あり */
    approximate: nameFallbackPeople > 0,
  };
};

// ───────────────────────────────────────────────────────────
// 機械の生存確認
// ───────────────────────────────────────────────────────────

/**
 * 生存確認ファイルの判定。分岐は docs/ai-course/ops/ADMIN_JOBS.md「生存確認ファイル」と同じ順。
 *   ファイル無し → lastRunAt が staleAfterHours より古い → ERROR → ALERT → OK
 *
 * 36時間なのは、ボードが07:32・点検が10:05に動くため（ボードは常に約21時間前の点検を読む）。
 * 24時間にすると毎朝誤警報になる。
 *
 * @param {string|null|undefined} raw ファイルの中身。読めなければ null
 * @param {number} nowMs
 * @returns {{level:'missing'|'broken'|'stale'|'error'|'alert'|'ok', lines:string[], ageHours?:number}}
 */
export const heartbeatVerdict = (raw, nowMs, opts = {}) => {
  const path = opts.path ?? '';
  const where = path ? `（${path}）` : '';
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { level: 'missing', lines: [`点検が一度も完走していません${where}`] };
  }
  let hb;
  try { hb = JSON.parse(raw); } catch { return { level: 'broken', lines: [`生存確認ファイルが壊れています${where}`] }; }

  const limit = Number(hb?.staleAfterHours) > 0 ? Number(hb.staleAfterHours) : 36;
  const ageHours = (nowMs - Date.parse(hb?.lastRunAt)) / 3_600_000;
  if (!Number.isFinite(ageHours)) {
    return { level: 'broken', lines: [`生存確認の lastRunAt が読めません（${hb?.lastRunAt}）`] };
  }
  if (ageHours > limit) {
    const lines = [`点検が ${ageHours.toFixed(1)}時間 動いていません（上限${limit}h・最終 ${hb.lastRunAt}）`];
    // 古いうえに前回が失敗なら両方言う（「止まった理由」がここにしか残っていない）
    if (hb.status === 'ERROR') lines.push(`前回の点検は失敗で終わっています: ${hb.error ?? '(理由不明)'}`);
    return { level: 'stale', ageHours, lines };
  }
  if (hb.status === 'ERROR') {
    return { level: 'error', ageHours, lines: [`点検が失敗しています: ${hb.error ?? '(理由不明)'}`] };
  }
  if (hb.status === 'ALERT') {
    const alerts = (Array.isArray(hb.alerts) ? hb.alerts : []).map(String).filter(Boolean);
    return { level: 'alert', ageHours, lines: alerts.length ? alerts : ['点検が異常を報告しています（内容不明）'] };
  }
  return { level: 'ok', ageHours, lines: [] };
};

/**
 * バックアップの鮮度。日次バックアップが止まっても誰も気づけなかった事故（2026-08-15）の再発検知。
 * @param {string|null} latestDay 'YYYY-MM-DD' か null
 */
export const backupFreshness = (latestDay, nowMs, hasLearnersJson = true) => {
  if (!latestDay) return { ok: false, text: 'DBバックアップが1件もありません（bash scripts/backup-supabase.sh）' };
  const ageHours = (nowMs - Date.parse(`${latestDay}T10:00:00+09:00`)) / 3_600_000;
  if (!Number.isFinite(ageHours)) return { ok: false, text: `バックアップの日付が読めません（${latestDay}）` };
  if (ageHours > 36) {
    return { ok: false, ageHours, text: `DBバックアップが止まっています（最終 ${latestDay}・${Math.floor(ageHours)}時間前）` };
  }
  if (!hasLearnersJson) {
    return { ok: false, ageHours, text: `最新バックアップ(${latestDay})に ai_learners.json がありません（途中終了の疑い）` };
  }
  return { ok: true, ageHours, text: `バックアップ 最終 ${latestDay}` };
};

/**
 * 「機械が生きているか」をひとまとめにする。
 * mailLogCount === 0 は、ai_course_mail_log が0行だった＝フォローメールが一度も
 * 送られていなかった事故（2026-08-24 発覚）の再発検知。
 */
export const machineChecks = (input) => {
  const {
    heartbeatRaw, heartbeatPath, nowMs,
    backupLatestDay = null, backupHasLearners = true,
    mailLogCount = null,
  } = input ?? {};
  const heartbeat = heartbeatVerdict(heartbeatRaw, nowMs, { path: heartbeatPath });
  const backup = backupFreshness(backupLatestDay, nowMs, backupHasLearners);
  const problems = [];
  for (const line of heartbeat.lines) problems.push({ kind: '日次点検', text: line });
  if (!backup.ok) problems.push({ kind: 'バックアップ', text: backup.text });
  if (mailLogCount !== null && Number(mailLogCount) === 0) {
    problems.push({ kind: 'メール', text: '配信ログが0件です（案内メールが一度も送られていない疑い）' });
  }
  return { heartbeat, backup, problems };
};

// ───────────────────────────────────────────────────────────
// AI原価（推定と実測を分ける）
// ───────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ai_cost_summary() の結果を画面用にたたむ。
 *
 * ボードは長らく ai_usage_daily を直読みしていて、**レポート生成などの原価が載っていなかった**。
 * 明細（ai_usage_events）合計と日次合計を並べ、差（gap）を出すのがこの関数の役目。
 *
 * source の意味を混ぜない:
 *   estimated … 分数からの推定（トークン実測ではない）
 *   reported  … APIが返したトークン数から計算
 *   billed    … 実請求と突き合わせ済み
 *
 * @param {object|null} summary ai_cost_summary() の jsonb。未適用なら null
 * @param {number|string} dailyUsd ai_usage_daily の当月合計（フォールバック用）
 */
export const costView = (summary, dailyUsd) => {
  const daily = round2(dailyUsd);
  if (!summary || summary.ok !== true) {
    return {
      available: false,
      dailyUsd: daily,
      note: 'ai_cost_summary() が未適用のため、日次集計（ai_usage_daily）だけを出しています。会話以外の原価は含みません',
    };
  }
  const rows = Array.isArray(summary.byKind) ? summary.byKind : [];
  const bySource = { estimated: 0, reported: 0, billed: 0 };
  const byKind = new Map();
  for (const r of rows) {
    const src = String(r?.source ?? 'estimated');
    const usd = Number(r?.costUsd ?? 0);
    if (src in bySource) bySource[src] += usd; else bySource.estimated += usd;
    const kind = String(r?.kind ?? '不明');
    byKind.set(kind, (byKind.get(kind) ?? 0) + usd);
  }
  return {
    available: true,
    from: summary.from ?? null,
    to: summary.to ?? null,
    eventsUsd: round2(summary.eventsTotalUsd),
    dailyUsd: round2(summary.dailyTotalUsd ?? daily),
    gapUsd: round2(summary.gapUsd),
    estimatedUsd: round2(bySource.estimated),
    reportedUsd: round2(bySource.reported),
    billedUsd: round2(bySource.billed),
    byKind: [...byKind.entries()]
      .map(([kind, usd]) => ({ kind, usd: round2(usd) }))
      .sort((a, b) => b.usd - a.usd),
  };
};

// ───────────────────────────────────────────────────────────
// メール配信の生存（cronに登録されているか）
// ───────────────────────────────────────────────────────────

/**
 * ai_mail_health() の結果を判定する。
 * 「テーブルに0行」だけでなく「そもそもジョブが cron に居ない」を見るのが要点。
 * @param {Array|null} rows 未適用なら null
 */
export const mailHealthView = (rows, mailLogCount = null) => {
  if (rows === null || rows === undefined) {
    return {
      available: false,
      problems: [],
      note: 'ai_mail_health() が未適用（migration 20260824130000 の適用待ち）',
    };
  }
  const jobs = rows.map((r) => ({
    job: String(r?.job ?? '(名前なし)'),
    scheduled: r?.is_scheduled === true,
    lastStatus: r?.cron_last_status ?? null,
    lastStart: r?.cron_last_start ?? null,
    lastFinish: r?.last_run_finished_at ?? null,
  }));
  const problems = [];
  for (const j of jobs) {
    if (!j.scheduled) problems.push(`メール配信ジョブ ${j.job} が cron に登録されていません（送られないまま気づけない）`);
    else if (j.lastStart === null) problems.push(`${j.job} は登録済みですが、一度も実行されていません`);
    else if (j.lastStatus && j.lastStatus !== 'succeeded') problems.push(`${j.job} の前回実行が ${j.lastStatus}`);
  }
  if (mailLogCount !== null && Number(mailLogCount) === 0) {
    problems.push('配信ログ（ai_course_mail_log）が0件です');
  }
  return { available: true, jobs, problems, note: null };
};

// ───────────────────────────────────────────────────────────
// 受講権（ai_course_access）の異常
// ───────────────────────────────────────────────────────────

/**
 * 「1人1行（PK=user_id）なのに複数プランを持ちうる」構造から出る異常を拾う。
 * @param {Array<{login_id?:string, plan_id?:string|null, source?:string|null,
 *                valid_from?:string, valid_until?:string, has_purchase?:boolean}>} rows
 */
export const entitlementIssues = (rows, nowMs) => {
  const issues = [];
  const seen = new Map();
  for (const r of rows ?? []) {
    const who = String(r?.login_id ?? '').trim() || '(IDなし)';
    seen.set(who, (seen.get(who) ?? 0) + 1);
    const vf = Date.parse(r?.valid_from);
    const vu = Date.parse(r?.valid_until);
    if (Number.isFinite(vf) && Number.isFinite(vu) && vu < vf) {
      issues.push({ who, text: '受講権の期間が逆転しています（開始 > 終了）' });
    }
    const expired = Number.isFinite(vu) && vu < nowMs;
    if (expired && r?.plan_id) {
      issues.push({ who, text: `期限切れ（${String(r.valid_until).slice(0, 10)}）なのに ${r.plan_id} が残っています` });
    }
    if (!expired && !r?.plan_id && r?.source === 'purchase') {
      issues.push({ who, text: '購入由来なのにプランが空です（格下げの疑い）' });
    }
    if (r?.source === 'purchase' && r?.has_purchase === false) {
      issues.push({ who, text: '購入由来なのに purchase_id がありません（台帳と突き合わせられない）' });
    }
  }
  for (const [who, n] of seen) {
    if (n > 1) issues.push({ who, text: `受講権が${n}行あります（1人1行の前提が壊れている）` });
  }
  return issues;
};

// ───────────────────────────────────────────────────────────
// 本人稼働時間と「1時間あたり売上」
// ───────────────────────────────────────────────────────────

/**
 * 本人稼働時間はDBに無い＝CEOの手入力。入っていなければ**推測しない**。
 *
 * ファイル形式（~/ai-company/logs/owner-hours.json）:
 *   { "months": { "2026-08": { "hours": 42.5, "activityCashJpy": 61000,
 *                              "updatedAt": "2026-08-24", "note": "..." } } }
 *   activityCashJpy は通常活動の**実入金**（現金・PayPay・回数券消化の実額）。
 *   入れれば理論値の代わりに使う。入れなければ理論値のまま出す。
 */
export const ownerHoursView = (raw, monthKey) => {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { entered: false, reason: 'ファイルがありません' };
  }
  let json;
  try { json = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {
    return { entered: false, reason: 'JSONが壊れています' };
  }
  const m = json?.months?.[monthKey];
  const hours = Number(m?.hours);
  const cash = Number(m?.activityCashJpy);
  const activityCashJpy = Number.isFinite(cash) && cash >= 0 ? cash : null;
  if (!Number.isFinite(hours) || hours <= 0) {
    return { entered: false, reason: `${monthKey} の入力がありません`, activityCashJpy };
  }
  return {
    entered: true,
    hours,
    updatedAt: m?.updatedAt ?? null,
    note: m?.note ?? null,
    activityCashJpy,
  };
};

/** 本人が手を動かした1時間あたり売上。時間が未入力なら null（0にしない） */
export const revenuePerHour = (jpy, hours) =>
  (Number.isFinite(Number(hours)) && Number(hours) > 0 ? Math.round(Number(jpy) / Number(hours)) : null);

/**
 * 3事業の当月売上を1つにする。**性質の違う数字を黙って混ぜない**ための関数。
 *
 * - aiPaidJpy      … Stripeで着金（実入金）
 * - tourPaidJpy    … 大会の入金確認済み（実入金）
 * - tourUnpaidJpy  … 大会の確定済みだが未入金（まだお金ではない）
 * - activity       … 通常活動。手入力の実入金があればそれ、無ければDB上の理論値
 * - axis2Jpy       … note/ココナラ。DBが無いので基本 null（＝計測なし）
 */
export const monthMoney = (input) => {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const {
    aiPaidJpy = 0, tourPaidJpy = 0, tourUnpaidJpy = 0,
    activityTheoryJpy = 0, activityCashJpy = null, axis2Jpy = null,
  } = input ?? {};
  const activity = activityCashJpy !== null && activityCashJpy !== undefined
    ? { jpy: n(activityCashJpy), basis: 'cash' }
    : { jpy: n(activityTheoryJpy), basis: 'theory' };
  const total = n(aiPaidJpy) + n(tourPaidJpy) + activity.jpy + n(axis2Jpy);
  return {
    aiPaidJpy: n(aiPaidJpy),
    tourPaidJpy: n(tourPaidJpy),
    tourUnpaidJpy: n(tourUnpaidJpy),
    activity,
    axis2Jpy: axis2Jpy === null || axis2Jpy === undefined ? null : n(axis2Jpy),
    total,
    /** true なら合計に理論値が混ざっている＝画面に必ず書く */
    includesTheory: activity.basis === 'theory' && activity.jpy > 0,
  };
};

// ───────────────────────────────────────────────────────────
// 逆算（1件売れるために足りないもの）
// ───────────────────────────────────────────────────────────

/**
 * 逆算ダッシュボード（~/ai-company/departments/marketing/reverse-calc-dashboard.md）は
 * 手入力なので**必ず最終更新日を併記する**。2026-04-27で止まっているため、
 * そのまま「4か月前の数字」と出るのが正しい振る舞い。
 */
export const reverseCalcView = (md, nowMs) => {
  if (!md) return { available: false, reason: 'ファイルがありません' };
  const updatedOn = /最終更新:\s*(\d{4}-\d{2}-\d{2})/.exec(md)?.[1] ?? null;
  const ageDays = updatedOn
    ? Math.floor((nowMs - Date.parse(`${updatedOn}T00:00:00+09:00`)) / 86_400_000)
    : null;
  const raw = /最大ボトルネック[:：]\s*(.+)/.exec(md)?.[1] ?? null;
  return {
    available: true,
    updatedOn,
    ageDays,
    /** 14日を超えたら「古い数字」として扱う（週次更新の想定に対する2倍） */
    stale: ageDays !== null && ageDays > 14,
    bottleneck: raw ? raw.replace(/\*+/g, '').trim() : null,
  };
};

/**
 * AIコースの「あと何人LPに来れば1件売れる計算になるか」。
 * 想定CVRは仮定でしかないので、必ず仮定値を一緒に返して画面に出す。
 */
export const nextSaleGap = (input) => {
  const { lpViews30d = 0, paidCountMonth = 0, pendingCount = 0, assumedCvrPct = 1 } = input ?? {};
  const views = Math.max(0, Number(lpViews30d) || 0);
  const cvr = Number(assumedCvrPct) > 0 ? Number(assumedCvrPct) : 1;
  const neededViews = Math.ceil(100 / cvr);
  return {
    assumedCvrPct: cvr,
    lpViews30d: views,
    neededViews,
    shortfallViews: Math.max(0, neededViews - views),
    /** 見込みは十分あるのに売れていない＝LPではなく中身か価格の問題 */
    enoughTraffic: views >= neededViews,
    paidCountMonth: Number(paidCountMonth) || 0,
    pendingCount: Number(pendingCount) || 0,
  };
};

// ───────────────────────────────────────────────────────────
// wild-flow（別プロジェクト）
// ───────────────────────────────────────────────────────────

/**
 * wild-flow は別 Supabase プロジェクト（sfpgajxqmcymzetjwypz）で、
 * 手元にあるのは anon キーだけ。RLSで読めないテーブルは「読めない」と出す。
 * **落ちないこと**が仕様。ボード全体を止めてはいけない。
 *
 * @param {{connected:boolean, reason?:string, ga4?:{configured:boolean},
 *          counts?:Record<string,{ok:boolean,count?:number,reason?:string}>}} raw
 */
export const wildflowView = (raw) => {
  if (!raw || raw.connected !== true) {
    return {
      connected: false,
      reason: raw?.reason ?? '接続情報が見つかりません',
      lines: [`wild-flow: 未接続（${raw?.reason ?? '接続情報が見つかりません'}）`],
      ga4Configured: raw?.ga4?.configured === true,
    };
  }
  const counts = raw.counts ?? {};
  const lines = [];
  const label = { quiz_leads: '診断リード', lessons: 'レッスン在庫', lesson_entries: 'レッスン申込' };
  for (const [table, res] of Object.entries(counts)) {
    const name = label[table] ?? table;
    if (res?.ok) lines.push(`${name}: ${res.count}件`);
    else lines.push(`${name}: 読めません（${res?.reason ?? '理由不明'}）`);
  }
  return {
    connected: true,
    ga4Configured: raw?.ga4?.configured === true,
    counts,
    lines,
  };
};
