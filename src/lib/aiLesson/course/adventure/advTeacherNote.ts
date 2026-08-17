// 先生コメントループのデータ層（週1回・担当コーチの一言）。
//
// なぜ作るか:
// 人間レッスンは隔週なので、その谷間で「先生が自分を見てくれている」感が切れる。
// 高価格帯のサービスでは、この“見られている感”の断絶がそのまま解約理由になる。
// そこで**週1回・コーチが30秒で書ける一言**を生徒のホームへ届けるループを作る。
// コーチの実働は週数分に収める。だからこの層の仕事は「下書きを作る」「既読を管理する」の2つだけ。
//
// 設計の理由:
// - **AIは下書きまで。送信は必ず人間が押す。**
//   ここで作る buildNoteDraft() は { ja, zh } の**文字列しか返さない**。
//   AdvTeacherNote オブジェクトを組み立てないのは意図的で、
//   「AIが書いた文章が先生名義でそのまま生徒に届く」経路を型のレベルで塞ぐため。
//   note を作れるのは、コーチが画面で下書きを確認し保存操作をしたときだけ（統合は親が行う）。
// - **実測しか書かない。** 下書きに入れてよいのは questLog / mastery台帳 / mockLog の実測だけ。
//   断定的な褒め（「よくできました」）と合格予測（「この調子なら受かります」）は入れない。
//   データが少ない週は、盛らずに「データが少ないので事実だけ」と書く。
// - **実装していない未来の挙動を、先生名義で約束しない。**
//   下書きは「今週こうだった」という過去形の実測だけを書き、
//   「来週は◯◯を多めに出します」のような**出題側の約束はしない**。
//   出題を決めているのは advQuest（全期間の weakestSkill）で、週まとめの focusSkillNextWeek を
//   読む consumer は存在しない。無い挙動を先生の署名つきで約束すると、それは嘘になる。
//   何を重点にするかは、コーチが人間レッスンで決める。
// - **煽らない。** 「連続記録が消えます」のような喪失をあおる文面は作らない・警告する。
// - 純関数のみ。現在時刻は必ず引数の nowISO から導く（Date.now() を呼ばない）。
//   週の切り方も**JST固定**で、実行環境のTZに結果が左右されないようにしている（下記 weekStartKeyOf 参照）。
import type { AdventureV2Profile } from './advTypes';
import { MASTERY_RULES, masteredTargetIds, masteredTargetIdsAsOf } from './advMastery';
import { EXAM_SKILL_LABELS, type ExamSkill } from './advExamSkills';

/** 生徒のホームに出す「先生からの一言」1件 */
export interface AdvTeacherNote {
  /** 週ごとに安定するID（noteIdFor で生成）。既読管理・置換のキー */
  id: string;
  /** この一言が対象にしている週の月曜（YYYY-MM-DD・JST） */
  weekStartKey: string;
  bodyJa: string;
  /** 中国語版。コーチが日本語だけで送ることもあるので任意 */
  bodyZh?: string;
  /** 差出人の表示名（例: 「安田コーチ」）。空なら画面側で担当先生名へフォールバックする */
  authorLabel: string;
  createdAtISO: string;
  /** 生徒が読んだ時刻。null＝未読 */
  readAtISO: string | null;
}

/**
 * 保持件数。12週＝約3ヶ月ぶんで、コース期間（3〜6ヶ月）の直近半分をカバーする。
 * jsonb（ai_learners.settings.adventureV2）に入るので、無制限には持たない。
 */
export const MAX_TEACHER_NOTES = 12;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * 「時点」として読める ISO だけを通す。日付だけ（2026-08-05）や
 * オフセットの無い 2026-08-05T00:00:00 は**実行環境のTZ次第で意味が変わる**ので受け取らない。
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 86400000;
const pad2 = (n: number): string => String(n).padStart(2, '0');

const keyOfUTC = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/**
 * その日を含む週の月曜（YYYY-MM-DD）。
 *
 * 切り方（月曜はじまり）は既存の advWeekly.weekStartOf と同じ規則にしてある。
 * 週まとめと先生の一言が違う週を指していたら、生徒から見て話が噛み合わなくなるため。
 *
 * ただし**基準TZは違う**。ここは JST 固定（引数がJSTの日付キー・UTC演算）で、
 * advWeekly.weekStartOf は `new Date(iso).getDay()` ＝**実行環境のローカルTZ**基準。
 * 生徒の端末は中国時間（UTC+8）なので、毎週日曜23:00〜24:00（中国時間）＝JSTでは月曜の1時間だけ、
 * 両者が1週ずれる。collectNoteFacts が advWeekly の weekStartKey を採らずに
 * 自前でJSTの週を切り直しているのはこのため（advWeekly側の是正は別タスク）。
 *
 * 引数はJSTの日付キー。ISO文字列をそのまま渡さないこと（UTCのまま切ると日付がずれる）。
 * nowISO しか持っていない場合は jstDateKeyOf() を通してから渡す。
 * 日付として読めない文字列は、勝手に別の週へ寄せず**そのまま返す**（破壊しないための安全側）。
 */
export const weekStartKeyOf = (dateKey: string): string => {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return dateKey;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // 月曜=0
  return keyOfUTC(ms - dow * DAY_MS);
};

/** 日付キーの加算（UTC演算＝実行環境のTZに左右されない） */
const addDaysKey = (dateKey: string, days: number): string => {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return dateKey;
  return keyOfUTC(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS);
};

const JST_KEY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });

/**
 * ISO時刻 → JSTの日付キー。
 * 学習の「1日」は Asia/Tokyo 基準（courseUsage.jstTodayISO と同じ約束）。
 *
 * 読めない値では**投げない**。ホーム描画パスから呼ばれるので、
 * 壊れた nowISO で画面ごと落とさないほうが大事。空文字を返し、
 * 呼び出し側は「どの週にも一致しないキー」として扱う（collectNoteFacts は sparse へ落ちる）。
 */
export const jstDateKeyOf = (iso: string): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return JST_KEY_FMT.format(new Date(t));
};

/** 週ごとに安定するID。同じ週の書き直しは同じIDになる（＝置換できる） */
export const noteIdFor = (weekStartKey: string): string => `tn-${weekStartKey}`;

/** ISO時刻の比較用。読めない値は NaN（比較すると必ず false になる＝勝手に採用しない） */
const msOf = (iso: string): number => Date.parse(iso);

/** 並べ替え用。読めない値は最古扱いにして、順序が実行ごとにぶれないようにする */
const sortMsOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

// ── 読む・既読にする ──

/**
 * 生徒のホームに出す1件＝**未読のうちいちばん新しいもの**。無ければ null。
 *
 * createdAtISO が未来の note は返さない。コーチ側の時計ずれや、先に書いておいた下書きが
 * 「今週の一言」として先に出てしまうのを防ぐ。
 *
 * 比較は**時刻として解釈してから**行う（文字列比較にしない）。
 * '2026-08-05T18:00:00+09:00' のようなオフセット表記が「未来の note」と誤判定され、
 * 生徒のホームに永久に出ないことがあるため。読めない createdAtISO は出さない
 * （いつ書かれたか分からないものを「今週の一言」として出せない）。
 */
export const latestUnreadNote = (
  notes: AdvTeacherNote[] | undefined, nowISO: string,
): AdvTeacherNote | null => {
  const nowMs = msOf(nowISO);
  if (Number.isNaN(nowMs)) return null;
  const candidates = (notes ?? []).filter((n) => {
    if (n.readAtISO !== null) return false;
    const t = msOf(n.createdAtISO);
    return !Number.isNaN(t) && t <= nowMs;
  });
  if (candidates.length === 0) return null;
  // 同時刻が並んだときも結果がぶれないよう、週キーまで見て決める
  return candidates.reduce((a, b) => {
    const ta = msOf(a.createdAtISO);
    const tb = msOf(b.createdAtISO);
    if (tb !== ta) return tb > ta ? b : a;
    return b.weekStartKey > a.weekStartKey ? b : a;
  });
};

/**
 * 既読にした新しい配列を返す（入力は破壊しない）。
 *
 * - すでに既読の note の時刻は**上書きしない**（初回に読んだ時刻を残す）
 * - 変化が無いときは**入力そのもの**を返す。呼び出し側が `next !== notes` で
 *   「保存が必要か」を判定できるようにするため（無駄なjsonb書き込みを起こさない）。
 *   undefined を渡したときも undefined が返る（毎回新しい `[]` を作って
 *   「変わった」と誤認させない）。描画側は `next ?? []` で受ける。
 */
export function markNoteRead(notes: AdvTeacherNote[], id: string, nowISO: string): AdvTeacherNote[];
export function markNoteRead(notes: undefined, id: string, nowISO: string): undefined;
export function markNoteRead(
  notes: AdvTeacherNote[] | undefined, id: string, nowISO: string,
): AdvTeacherNote[] | undefined;
export function markNoteRead(
  notes: AdvTeacherNote[] | undefined, id: string, nowISO: string,
): AdvTeacherNote[] | undefined {
  if (!notes) return notes;
  const idx = notes.findIndex((n) => n.id === id && n.readAtISO === null);
  if (idx < 0) return notes;
  const next = notes.slice();
  next[idx] = { ...notes[idx], readAtISO: nowISO };
  return next;
}

// ── 追加する ──

const sameBody = (a: AdvTeacherNote, b: AdvTeacherNote): boolean =>
  a.bodyJa === b.bodyJa && (a.bodyZh ?? '') === (b.bodyZh ?? '');

const byWeekThenCreated = (a: AdvTeacherNote, b: AdvTeacherNote): number =>
  (a.weekStartKey === b.weekStartKey
    ? sortMsOf(a.createdAtISO) - sortMsOf(b.createdAtISO)
    : a.weekStartKey.localeCompare(b.weekStartKey));

/**
 * 一言を追加する（同一週は置換・最新12件だけ残す）。入力は破壊しない。
 *
 * 同一週の置換ルール:
 * - 本文が変わっていれば、既読状態は新しい note の値に従う（＝通常は未読に戻る）。
 *   コーチが書き直したなら、生徒にはもう一度読んでほしいため。
 * - 本文が同じなら、既存の既読時刻を温存する。保存処理が二重に走っただけで
 *   「読んだはずの一言」が未読に戻ると、生徒には通知の誤爆に見えるため。
 */
export const appendNote = (
  notes: AdvTeacherNote[] | undefined, note: AdvTeacherNote,
): AdvTeacherNote[] => {
  const list = notes ?? [];
  const prev = list.find((n) => n.weekStartKey === note.weekStartKey);
  const merged: AdvTeacherNote = prev && sameBody(prev, note)
    ? { ...note, readAtISO: note.readAtISO ?? prev.readAtISO }
    : note;
  const rest = list.filter((n) => n.weekStartKey !== note.weekStartKey);
  const sorted = [...rest, merged].sort(byWeekThenCreated);
  return sorted.length > MAX_TEACHER_NOTES ? sorted.slice(sorted.length - MAX_TEACHER_NOTES) : sorted;
};

/**
 * 保存済みjsonbからの復元（advProfile.readAdvProfile から呼ぶ想定）。
 * 壊れた1件のせいでホームが落ちないよう、読めない要素は落として先へ進む。
 * authorLabel が無いものは空文字で残す（差出人を捏造しない。画面側で先生名へ落とす）。
 *
 * 時刻は**形まで検証して UTC の正規形へ揃える**。
 * createdAtISO は「未来の note を出さない」判定と並び順の両方を握っているので、
 * 'unknown' や '2026-8-5T00:00:00Z' のような値が素通りすると、その一言は
 * 生徒のホームに永久に出ない。読めない createdAtISO の要素は落とす。
 * readAtISO が読めない場合は null（未読）にする。既読の記録を捏造するより、
 * もう一度読んでもらうほうが害が小さい。
 */
const normalizeInstant = (v: unknown): string | null => {
  if (typeof v !== 'string' || !ISO_INSTANT_RE.test(v)) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
};

export const restoreTeacherNotes = (raw: unknown): AdvTeacherNote[] => {
  if (!Array.isArray(raw)) return [];
  const out: AdvTeacherNote[] = [];
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) continue;
    if (typeof r.weekStartKey !== 'string' || !DATE_KEY_RE.test(r.weekStartKey)) continue;
    if (typeof r.bodyJa !== 'string' || r.bodyJa.trim().length === 0) continue;
    const createdAtISO = normalizeInstant(r.createdAtISO);
    if (createdAtISO === null) continue;
    out.push({
      id: r.id,
      weekStartKey: r.weekStartKey,
      bodyJa: r.bodyJa,
      bodyZh: typeof r.bodyZh === 'string' && r.bodyZh.length > 0 ? r.bodyZh : undefined,
      authorLabel: typeof r.authorLabel === 'string' ? r.authorLabel : '',
      createdAtISO,
      readAtISO: normalizeInstant(r.readAtISO),
    });
  }
  // 同一週が複数入っていた場合は新しい方を残す（appendNote と同じ約束に揃える）
  return out
    .sort(byWeekThenCreated)
    .filter((n, i, arr) => i === arr.length - 1 || arr[i + 1].weekStartKey !== n.weekStartKey)
    .slice(-MAX_TEACHER_NOTES);
};

// ── 下書きの材料（実測のみ） ──

export interface TeacherNoteFacts {
  /** 対象週の月曜（JST）。読めない nowISO のときは空文字＝週を特定できなかった印 */
  weekStartKey: string;
  /** 今週、学習の記録があった日数 */
  studyDays: number;
  /** 今週あらたに「別日3回＋遅延確認」まで届いた項目数 */
  newlyMasteredCount: number;
  /** 今週つまずいている対象の**総数**（丸めない。本文に出す数字はこちら） */
  strugglingCount: number;
  /**
   * 今週つまずいている対象ID（最大3・件数表示には使わない）。
   * 生徒に見せる本文にはIDを書かない（意味が伝わらない）。コーチ画面の根拠表示用。
   */
  strugglingTargetIds: string[];
  /**
   * 今週いちばん正答率が低かった技能の実測（母数が十分な技能の中から）。
   * **来週の出題予定ではない**。出題は advQuest が全期間の実測から決めており、
   * この値を読む出題ロジックは存在しない（ファイル冒頭の原則）。
   */
  lowestSkillThisWeek: { ja: string; zh: string; pct: number; questions: number } | null;
  /** 今週のミニ模試回数 */
  mockCount: number;
  /** 変化を語れるだけの実測が無い週か（＝事実だけの下書きにする） */
  sparse: boolean;
}

/**
 * 技能の話を「言ってよい」最低母数。3問で50%→100%になっても実力の話はできない。
 * advWeekly.MIN_QUESTIONS_FOR_CHANGE と同じ10問。週まとめと先生の一言で
 * 「いちばん低い技能」の判定基準が食い違わないように揃えている。
 */
const MIN_QUESTIONS_FOR_SKILL = 10;

/** 本試験の科目のうち、note で名指しする4つ（時間配分は正答率で語れないので外す） */
const NOTE_SKILLS: ExamSkill[] = ['charactersVocabulary', 'grammar', 'reading', 'listening'];

/**
 * ミニ模試は台帳では `mock-n2` のような疑似targetとして記録される（AdvShell の完了処理）。
 * これを「つまずいている項目」に数えると「3項目は80%に届かない」の中身に模試1回分が混ざり、
 * 生徒にもコーチにも別の意味に読まれる。模試は項目ではないので件数から外し、
 * 回数は mockCount として別に出す（技能別の実測は模試のぶんも使う＝正当な証拠なので残す）。
 */
const isMockTarget = (targetId: string): boolean => targetId.startsWith('mock-');

const emptyFacts = (weekStartKey: string): TeacherNoteFacts => ({
  weekStartKey,
  studyDays: 0,
  newlyMasteredCount: 0,
  strugglingCount: 0,
  strugglingTargetIds: [],
  lowestSkillThisWeek: null,
  mockCount: 0,
  sparse: true,
});

/**
 * 下書きの根拠になる実測を集める。
 *
 * 週は **JST の月曜〜日曜**で切る（weekStartKeyOf(jstDateKeyOf(nowISO))）。
 * advWeekly.buildWeeklySummary の weekStartKey をそのまま採らないのは、あちらが
 * 実行環境のローカルTZ基準で、中国時間の日曜深夜に1週ずれるため（weekStartKeyOf のコメント参照）。
 * 親が noteId を作るときも同じ `weekStartKeyOf(jstDateKeyOf(nowISO))` を使うこと。
 */
export const collectNoteFacts = (
  profile: AdventureV2Profile, nowISO: string,
): TeacherNoteFacts => {
  const weekStartKey = weekStartKeyOf(jstDateKeyOf(nowISO));
  // nowISO が読めない場合。捏造せず「週を特定できなかった」として事実ゼロで返す
  if (!DATE_KEY_RE.test(weekStartKey)) return emptyFacts(weekStartKey);
  const weekEnd = addDaysKey(weekStartKey, 7);
  const inWeek = (dateKey: string): boolean => dateKey >= weekStartKey && dateKey < weekEnd;

  const mastery = profile.mastery ?? {};

  // 学習日は「締めくくりを押した日（questLog）」だけでなく、途中でやめた日（attemptだけある日）も数える
  const studyDayKeys = new Set<string>();
  for (const q of profile.questLog ?? []) if (inWeek(q.dateKey)) studyDayKeys.add(q.dateKey);

  // つまずき＝今週2回以上やって、直近3回がどれも合格ラインに届いていない対象。
  // 1回落としただけを「つまずき」と書くとコーチの手が増えるだけなので、回数条件を置く。
  const struggling: { targetId: string; tries: number }[] = [];
  const skillAcc: Partial<Record<ExamSkill, { correct: number; total: number }>> = {};
  for (const [targetId, attempts] of Object.entries(mastery)) {
    const inWeekAttempts = (attempts ?? []).filter((a) => inWeek(a.dateKey));
    for (const a of inWeekAttempts) {
      studyDayKeys.add(a.dateKey);
      for (const [skill, v] of Object.entries(a.bySkill ?? {})) {
        if (!NOTE_SKILLS.includes(skill as ExamSkill)) continue;
        const k = skill as ExamSkill;
        const cur = skillAcc[k] ?? { correct: 0, total: 0 };
        skillAcc[k] = { correct: cur.correct + (v?.correct ?? 0), total: cur.total + (v?.total ?? 0) };
      }
    }
    if (inWeekAttempts.length < 2 || isMockTarget(targetId)) continue;
    const recent = inWeekAttempts.slice(-3);
    if (recent.every((a) => a.scorePct < MASTERY_RULES.passPct)) {
      struggling.push({ targetId, tries: inWeekAttempts.length });
    }
  }
  struggling.sort((a, b) => (b.tries - a.tries) || a.targetId.localeCompare(b.targetId));

  // 今週あらたに定着した項目。週初め時点との差で見る（時点評価。masteredTargetIds だけでは
  // 遅延確認が今週だった項目も「先週から定着済み」に見えてしまう）。
  // ここは mock 疑似target を除外しない。週まとめ（advWeekly.newlyMastered）が含める数え方なので、
  // 除外すると生徒が並べて読んだときに「まとめは2項目、先生は1項目」と食い違う。
  // つまずき側は週まとめに対応する数字が無いため、模試を外す判断ができる。
  const weekStartInstant = new Date(`${weekStartKey}T00:00:00.000+09:00`).toISOString();
  const masteredNow = masteredTargetIds(mastery, nowISO);
  const beforeSet = masteredTargetIdsAsOf(mastery, weekStartInstant);
  const newlyMasteredCount = [...masteredNow].filter((t) => !beforeSet.has(t)).length;

  // 「今週いちばん低かった技能」。母数10問未満は候補にしない（同点は NOTE_SKILLS の順で安定させる）
  let lowest: { skill: ExamSkill; pct: number; questions: number } | null = null;
  for (const skill of NOTE_SKILLS) {
    const v = skillAcc[skill];
    if (!v || v.total < MIN_QUESTIONS_FOR_SKILL) continue;
    const pct = Math.round((v.correct / v.total) * 100);
    if (lowest === null || pct < lowest.pct) lowest = { skill, pct, questions: v.total };
  }

  const mockCount = (profile.mockLog ?? []).filter((m) => inWeek(m.dateKey)).length;
  const strugglingCount = struggling.length;

  return {
    weekStartKey,
    studyDays: studyDayKeys.size,
    newlyMasteredCount,
    strugglingCount,
    strugglingTargetIds: struggling.slice(0, 3).map((s) => s.targetId),
    lowestSkillThisWeek: lowest
      ? {
        ja: EXAM_SKILL_LABELS[lowest.skill].ja,
        zh: EXAM_SKILL_LABELS[lowest.skill].zh,
        pct: lowest.pct,
        questions: lowest.questions,
      }
      : null,
    mockCount,
    // 書けることが実質ない週。ここで無理に物語を作ると、実測していない褒めが混ざる。
    // つまずき・技能の実測がある週は sparse にしない。コーチがいちばん知りたい事実が
    // 「データが少ないので事実だけ」の定型文に呑まれてしまうため（同じ日に2回やって全部80%未満、など）。
    sparse: studyDayKeys.size <= 1
      && newlyMasteredCount === 0
      && mockCount === 0
      && strugglingCount === 0
      && lowest === null,
  };
};

// ── 下書き本文 ──

/**
 * コーチ向けの下書きを作る（**送信はしない**）。
 *
 * 返すのは文字列だけ。AdvTeacherNote を組み立てないのは、
 * 「AIの文章が先生名義で自動送信される」経路を作らないため（このファイル冒頭の原則）。
 * コーチはこの下書きを画面で読み、直してから送る。30秒で直せる長さに抑える。
 *
 * 書かないもの: 断定的な褒め・合格予測・連続記録を失う脅し・実測していない推測・
 * システムが実装していない未来の挙動（「来週は◯◯を多めに出します」）。
 */
export const buildNoteDraft = (
  profile: AdventureV2Profile, nowISO: string,
): { ja: string; zh: string } => {
  const f = collectNoteFacts(profile, nowISO);

  if (f.sparse) {
    // 「5分」を決め打ちにしない（2026-08-17 再レビュー: 15分/30分の生徒に事実と違う）。
    // 復帰の一歩は「1つだけ」と量に依存しない言い方にする
    const ja = f.studyDays === 0
      ? '今週は学習の記録がありませんでした。データが少ないので、今週は事実だけお伝えします。次は最初の1つだけで大丈夫です。'
      : `今週の学習は${f.studyDays}日でした。データが少ないので、今週は事実だけお伝えします。次に開いたときは、最初の1つからで大丈夫です。`;
    const zh = f.studyDays === 0
      ? '本周没有学习记录。数据较少，所以本周只说事实。下次只做第一项就可以。'
      : `本周学习了${f.studyDays}天。数据较少，所以本周只说事实。下次打开时，从第一项开始就好。`;
    return { ja, zh };
  }

  const ja: string[] = [];
  const zh: string[] = [];
  // 0日を「0日、学習の記録がありました」と書かない（記録が模試だけの週など）
  if (f.studyDays > 0) {
    ja.push(`今週は${f.studyDays}日、学習の記録がありました。`);
    zh.push(`本周有${f.studyDays}天的学习记录。`);
  }

  if (f.newlyMasteredCount > 0) {
    ja.push(`新しく${f.newlyMasteredCount}項目が「別の日に3回＋あとから確認」まで届いています。`);
    zh.push(`新增${f.newlyMasteredCount}个项目达到了「隔天做对3次＋之后再确认」。`);
  }
  if (f.strugglingCount > 0) {
    ja.push(`${f.strugglingCount}項目は${MASTERY_RULES.passPct}%に届かない回が続いています。`);
    zh.push(`有${f.strugglingCount}个项目连续几次都没到${MASTERY_RULES.passPct}%。`);
  }
  if (f.mockCount > 0) {
    ja.push(`ミニ模試を${f.mockCount}回やった記録があります。`);
    zh.push(`有${f.mockCount}次迷你模拟考的记录。`);
  }
  if (f.lowestSkillThisWeek) {
    const s = f.lowestSkillThisWeek;
    // 「来週は◯◯を多めに出します」とは書かない（出題側にこの値のconsumerが無い＝約束できない）
    ja.push(`今週の記録では、${s.ja}の正答率がいちばん低い結果でした（${s.questions}問で${s.pct}%）。`);
    zh.push(`本周的记录里，「${s.zh}」的正确率最低（${s.questions}题，${s.pct}%）。`);
  }
  if (f.strugglingCount > 0 || f.lowestSkillThisWeek) {
    ja.push('次のレッスンで、どこから見るか一緒に決めましょう。');
    zh.push('下次上课时我们一起决定先从哪里看。');
  }
  // 「返信で教えてください」は書かない（2026-08-17 再レビュー）。
  // このコメントに返信するUIは存在しない。実装していない導線を先生名義で案内しない。
  // 生徒からの相談は「先生レッスンの準備」画面の相談メモ（humanLesson.learnerTopics）で受ける
  ja.push('聞きたいことがあれば、「先生レッスンの準備」に書いておいてください。');
  zh.push('有想问的，可以写在「老师课程准备」里。');

  return { ja: ja.join(''), zh: zh.join('') };
};

// ── コーチが書いた文面のチェック ──

interface BodyWarningRule {
  /** 検出パターン */
  test: RegExp;
  ja: string;
  zh: string;
}

/**
 * 送る前の注意喚起。**ブロックはしない**（最終判断は人間のコーチ）。
 * 有料コースで一度でも「必ず合格します」と書くと、それは約束になってしまう。
 * ストリークを失う脅しも使わない（本来やる気は恐怖から作らない）。
 *
 * 拾うのは**約束・断定・脅し**だけ。正直な見通し（「今のままでは合格は難しいです」）や
 * 起きた事実の報告（「今週の記録が消えてしまいました」）は警告しない。
 * 警告が多すぎるとコーチが読み飛ばすようになり、砦として機能しなくなる。
 */
const BODY_WARNING_RULES: BodyWarningRule[] = [
  {
    // 「合格」の話題そのものは禁じない。**約束・断定・予測**の形だけを拾う。
    // 前置（必ず合格）だけでなく後置（合格は確実・受かると思います）も拾う。
    test: new RegExp([
      '(必ず|絶対|きっと|確実に|間違いなく)[^。]{0,12}(合格|受か)',
      // 「間違いありません」「保証します」など活用形も拾う（2026-08-17 再レビュー: 取りこぼし）
      '(合格|受か[るり])[^。]{0,6}(確実|間違いあり?ませ?ん|間違いない|保証|約束)',
      '(合格|受か)(でき|り)ます',
      // 断定の助動詞は語尾が離れることがある（「合格できると思います」「合格できるはずです」）
      '(合格|受か[るり]|合格でき[るます]*)[^。]{0,6}(と思います|でしょう|はずです|に決まっ)',
      // 「この調子なら合格」系。ただし「今のままでは合格は難しい」は正直な見通しなので除く
      '(この調子|このペース|今のペース|今のまま)(なら|だと|でいけば|で[はも]?)[^。]{0,12}(合格|受か)(?![^。]{0,8}(難し|厳し|届か|ません|ない))',
    ].join('|')),
    ja: '合格を約束・断定する表現が含まれています。合否は保証できません。',
    zh: '包含承诺或断定考试合格的表达。合格与否无法保证。',
  },
  {
    // 「これから失う」形だけを拾う。「記録が消えてしまいました」（起きた事実）は拾わない
    test: /(連続|ストリーク|記録)[^。]{0,6}(消えます|消えるよ|消えちゃいます|失われます|途切れます|途切れるよ|リセットされます)|(消えて|失って)しまいます/,
    ja: '「失う」ことで動かす表現が含まれています。恐怖で続けさせない方針です。',
    zh: '包含用「失去」来施压的表达。本课程不用恐惧驱动学习。',
  },
  {
    // 「〜しないと落ちます」は語尾が離れることがあるので、条件節と結論の間に余白を許す
    // 「このままだと落ちてしまいます」等、語尾の活用も拾う（2026-08-17 再レビュー）
    test: /(このままだと|でないと|しないと|ないと|なければ|なきゃ)[^。]{0,10}(間に合いません|落ちます|落ちて?しまいます|落ちるよ|無理です|不合格)/,
    ja: '断定的に不合格を予告する表現が含まれています。事実と見通しを分けて書いてください。',
    zh: '包含断定会不合格的表达。请把事实和预测分开写。',
  },
];

/** 文面の注意点（0件＝そのまま送ってよい） */
export const noteBodyWarnings = (body: string): { ja: string; zh: string }[] =>
  BODY_WARNING_RULES.filter((r) => r.test.test(body)).map((r) => ({ ja: r.ja, zh: r.zh }));
