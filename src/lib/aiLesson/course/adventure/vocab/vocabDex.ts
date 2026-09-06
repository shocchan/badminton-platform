// 単語図鑑（2026-09-06 CEO要望「ポケモン図鑑のように、出会った単語が図鑑に載る」）。
//
// 設計の要点:
// - **新しく保存するものを増やさない。** 出会いの記録は既存の攻略台帳（mastery）に
//   すでに全部ある（questionKeys＝その回に出た問題／wrongKeys＝間違えた問題）。
//   図鑑はそこから導く純関数にする。保存を増やすと、消えたときに復元できないものが増える。
// - **数えたものだけを表示する。** 「出会った」は出題された事実、「正解した」は
//   wrongKeys に無かった事実。推測で段階を上げない（原則13）。
// - 旧データ（wrongKeys が undefined の試行）は**正誤不明**として扱い、
//   正解にも不正解にも数えない。出会いだけを数える。
import type { AdvMasteryLedger } from '../advTypes';

/** 語彙問題のキー `vocab:<表記>:<よみ>:<観点>` を分解する。語彙以外は null */
export const parseVocabKey = (key: string): { surface: string; reading: string; aspect: string } | null => {
  if (!key.startsWith('vocab:')) return null;
  const parts = key.split(':');
  // 表記や読みに「:」は入らない（バンクの機械検査で担保）。想定外は捨てる
  if (parts.length !== 4) return null;
  const [, surface, reading, aspect] = parts;
  if (!surface || !reading || !aspect) return null;
  return { surface, reading, aspect };
};

/** 図鑑の1語がいまどの段階か。**上げるには根拠が要る** */
export type DexState = 'unseen' | 'met' | 'familiar' | 'mastered';

export const DEX_STATE_LABELS: Record<DexState, { ja: string; zh: string }> = {
  unseen: { ja: '未発見', zh: '未发现' },
  met: { ja: '出会った', zh: '已遇见' },
  familiar: { ja: '手ごたえあり', zh: '有把握' },
  mastered: { ja: '習得', zh: '已掌握' },
};

export interface DexEntry {
  /** `<表記>|<よみ>`。バンクと突き合わせるキー */
  id: string;
  surface: string;
  reading: string;
  state: DexState;
  /** 出会った回数（同じ問題でも出るたびに1） */
  metCount: number;
  /** 正解した回数（正誤を記録した試行のみ） */
  correctCount: number;
  /** 間違えた回数（同上） */
  wrongCount: number;
  /** 正解した日（重複なし・昇順） */
  correctDays: string[];
  /** 出会った観点（reading / orthography / meaning …） */
  aspects: string[];
  /** 最後に出会った日 */
  lastMetDateKey: string | null;
  /** 最後に間違えた日。直近で間違えていれば「習得」には上げない */
  lastWrongDateKey: string | null;
}

/**
 * 段階の決め方（根拠のある順に上げる）:
 *   met      … 1回でも出題された
 *   familiar … 別の日に2回以上正解した
 *   mastered … 別の日に3回以上正解し、**最後の間違いより後に**正解の日がある
 *
 * 攻略台帳（advMastery）の「別日3回＋7日後確認」と考え方をそろえてある。
 * ただし図鑑は語単位・台帳は束単位なので、数字は別々に数える。
 */
const stateOf = (e: Omit<DexEntry, 'state'>): DexState => {
  if (e.metCount === 0) return 'unseen';
  const days = e.correctDays.length;
  if (days >= 3) {
    // 最後の間違いのあとに正解した日があるか（間違えっぱなしを習得にしない）
    const lastCorrect = e.correctDays[e.correctDays.length - 1];
    if (!e.lastWrongDateKey || lastCorrect > e.lastWrongDateKey) return 'mastered';
    return 'familiar';
  }
  if (days >= 2) return 'familiar';
  return 'met';
};

export interface DexProgress {
  /** 図鑑に載りうる語の総数（学習者のスコープ内） */
  total: number;
  met: number;
  familiar: number;
  mastered: number;
  /** 出会った語（met + familiar + mastered） */
  discovered: number;
}

/**
 * 攻略台帳から「出会った語」を集める。
 * @param scopeIds `<表記>|<よみ>` の集合。学習者のスコープ外の語は図鑑に入れない
 */
export const collectDexEntries = (
  ledger: AdvMasteryLedger, scopeIds?: ReadonlySet<string>,
): Map<string, DexEntry> => {
  const acc = new Map<string, Omit<DexEntry, 'state'>>();
  for (const attempts of Object.values(ledger)) {
    for (const a of attempts) {
      // wrongKeys が無い試行は正誤不明。出会いだけ数え、正解にも不正解にも入れない
      const graded = Array.isArray(a.wrongKeys);
      const wrong = new Set(a.wrongKeys ?? []);
      for (const key of a.questionKeys) {
        const p = parseVocabKey(key);
        if (!p) continue;
        const id = `${p.surface}|${p.reading}`;
        if (scopeIds && !scopeIds.has(id)) continue;
        const cur = acc.get(id) ?? {
          id, surface: p.surface, reading: p.reading,
          metCount: 0, correctCount: 0, wrongCount: 0,
          correctDays: [], aspects: [], lastMetDateKey: null, lastWrongDateKey: null,
        };
        cur.metCount += 1;
        if (!cur.aspects.includes(p.aspect)) cur.aspects.push(p.aspect);
        if (!cur.lastMetDateKey || a.dateKey > cur.lastMetDateKey) cur.lastMetDateKey = a.dateKey;
        if (graded) {
          if (wrong.has(key)) {
            cur.wrongCount += 1;
            if (!cur.lastWrongDateKey || a.dateKey > cur.lastWrongDateKey) cur.lastWrongDateKey = a.dateKey;
          } else {
            cur.correctCount += 1;
            if (!cur.correctDays.includes(a.dateKey)) cur.correctDays.push(a.dateKey);
          }
        }
        acc.set(id, cur);
      }
    }
  }
  const out = new Map<string, DexEntry>();
  for (const [id, e] of acc) {
    e.correctDays.sort();
    e.aspects.sort();
    out.set(id, { ...e, state: stateOf(e) });
  }
  return out;
};

/** 図鑑の進捗。total はスコープ内の語数（出会っていない語も分母に入れる） */
export const dexProgress = (entries: ReadonlyMap<string, DexEntry>, total: number): DexProgress => {
  let met = 0; let familiar = 0; let mastered = 0;
  for (const e of entries.values()) {
    if (e.state === 'mastered') mastered += 1;
    else if (e.state === 'familiar') familiar += 1;
    else if (e.state === 'met') met += 1;
  }
  return { total, met, familiar, mastered, discovered: met + familiar + mastered };
};

/** 図鑑IDを作る（バンク側と揃える） */
export const dexIdOf = (surface: string, reading: string): string => `${surface}|${reading}`;
