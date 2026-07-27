// 保存済みJourney状態のversion判定（Phase 2E-1.15 §7・§9）。
//
// アプリを更新すると、端末に残っている保存データと今のコードが食い違うことがある。
// そのとき「壊れた状態を自動で完了扱いにする」「延々と再読込を促す」のが最悪の挙動なので、
// **判定を一箇所に集めて決定的にし**、それぞれ安全な出口へ接続する。
//
// 判定は保存データの形だけを見る。学習進捗・復習予定には一切触れない。

export type SchemaClassification =
  /** 今のコードがそのまま読める */
  | 'same_schema'
  /** 古いが、情報を失わない明確な変換規則がある */
  | 'safely_migratable'
  /** 古すぎる・構造が違う（自動で直せない） */
  | 'incompatible_schema'
  /** JSONとして壊れている・必須項目が無い */
  | 'corrupted_state'
  /** 保存データの方が新しい（古いコードで開いている） */
  | 'newer_than_client';

export interface SchemaCheckInput {
  /** 保存されていた生の文字列（無ければ null） */
  raw: string | null;
  /** 今のコードが期待するversion */
  currentVersion: number;
  /** 自動移行できる古いversion（明確な変換規則があるものだけ） */
  migratableVersions: number[];
  /** 必須項目（1つでも欠けていれば壊れているとみなす） */
  requiredFields: string[];
}

export interface SchemaCheckResult {
  classification: SchemaClassification;
  /** 読み取れたversion（読めなければ null） */
  foundVersion: number | null;
  /** 学習者に何かを見せる必要があるか */
  needsLearnerRecovery: boolean;
  /** 自動での再読込を促してよいか（newer_than_client のときだけ・回数制限は呼び出し側） */
  suggestsReload: boolean;
}

const NO_DATA: SchemaCheckResult = {
  classification: 'same_schema', foundVersion: null,
  needsLearnerRecovery: false, suggestsReload: false,
};

/**
 * 保存データを分類する（副作用なし・同じ入力なら必ず同じ結果）。
 * データが無い場合は「新規の学習者」であって異常ではないので same_schema を返す。
 */
export const classifySchema = (input: SchemaCheckInput): SchemaCheckResult => {
  const { raw, currentVersion, migratableVersions, requiredFields } = input;
  if (raw === null || raw === '') return NO_DATA;

  let parsed: Record<string, unknown>;
  try {
    const p: unknown = JSON.parse(raw);
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      return { classification: 'corrupted_state', foundVersion: null, needsLearnerRecovery: true, suggestsReload: false };
    }
    parsed = p as Record<string, unknown>;
  } catch {
    return { classification: 'corrupted_state', foundVersion: null, needsLearnerRecovery: true, suggestsReload: false };
  }

  const v = parsed.schemaVersion;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return { classification: 'corrupted_state', foundVersion: null, needsLearnerRecovery: true, suggestsReload: false };
  }

  if (v > currentVersion) {
    // 保存データの方が新しい。**絶対に上書きしない**（新しい版で書かれた内容を壊さないため）
    return { classification: 'newer_than_client', foundVersion: v, needsLearnerRecovery: true, suggestsReload: true };
  }

  const missing = requiredFields.filter((f) => !(f in parsed));
  if (missing.length > 0) {
    return { classification: 'corrupted_state', foundVersion: v, needsLearnerRecovery: true, suggestsReload: false };
  }

  if (v === currentVersion) {
    return { classification: 'same_schema', foundVersion: v, needsLearnerRecovery: false, suggestsReload: false };
  }
  if (migratableVersions.includes(v)) {
    return { classification: 'safely_migratable', foundVersion: v, needsLearnerRecovery: false, suggestsReload: false };
  }
  return { classification: 'incompatible_schema', foundVersion: v, needsLearnerRecovery: true, suggestsReload: false };
};

// ── 再読込ループの防止（§9） ──────────────────────────────

/** 自動で再読込を促してよい上限。これを超えたら明示的なCTAだけにする */
export const MAX_AUTO_RECOVERY_ATTEMPTS = 1;

export interface RecoveryAttemptState {
  recoveryAttemptCount: number;
  lastRecoveryReason: SchemaClassification | null;
  lastRecoveryAt: string | null;
  lastSeenSchemaVersion: number | null;
}

export const emptyRecoveryState = (): RecoveryAttemptState => ({
  recoveryAttemptCount: 0, lastRecoveryReason: null, lastRecoveryAt: null, lastSeenSchemaVersion: null,
});

/**
 * 自動での再読込を promptしてよいか。
 * 同じ理由・同じversionで繰り返している場合は、何度読み直しても直らないので止める。
 */
export const canAutoReload = (
  state: RecoveryAttemptState, result: SchemaCheckResult,
): boolean => {
  if (!result.suggestsReload) return false;
  if (state.recoveryAttemptCount >= MAX_AUTO_RECOVERY_ATTEMPTS) return false;
  const sameSituation = state.lastRecoveryReason === result.classification
    && state.lastSeenSchemaVersion === result.foundVersion;
  return !(sameSituation && state.recoveryAttemptCount > 0);
};

/** 試行を1回数える（記録するのは呼び出し側） */
export const noteRecoveryAttempt = (
  state: RecoveryAttemptState, result: SchemaCheckResult, nowIso: string,
): RecoveryAttemptState => ({
  recoveryAttemptCount: state.recoveryAttemptCount + 1,
  lastRecoveryReason: result.classification,
  lastRecoveryAt: nowIso,
  lastSeenSchemaVersion: result.foundVersion,
});
