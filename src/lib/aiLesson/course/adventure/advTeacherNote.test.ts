// 先生コメントループの受入テスト。
//
// ここでいちばん守りたいのは4つ:
// ① **週の境界が実行環境のTZに左右されないこと（JST固定）。**
//    生徒は「今週のまとめ」と「先生の一言」を並べて読む。指している週が違うと話が噛み合わない。
//    週キーは親が noteId にも使うので、ずれると同じ論理週のnoteが2件並び、置換も効かなくなる。
// ② **既読が勝手に巻き戻らないこと。** 保存が二重に走っただけで未読バッジが復活すると、
//    生徒には通知の誤爆に見え、「先生からの一言」という体験そのものの信頼が落ちる。
//    逆に、壊れた保存データのせいで**一言が永久に出ない**のも同じくらい悪い。
// ③ **下書きが盛らないこと。** 実測していない褒め・合格予測・喪失の脅しを混ぜない。
//    有料コースで一度でも「必ず受かります」と書けば、それは約束になってしまう。
// ④ **下書きが、実装していない未来の挙動を先生名義で約束しないこと。**
//    「来週は◯◯を多めに出します」は、出題側にその値を読むコードが無い以上ただの嘘になる。
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  weekStartKeyOf, jstDateKeyOf, noteIdFor, MAX_TEACHER_NOTES,
  latestUnreadNote, markNoteRead, appendNote, restoreTeacherNotes,
  collectNoteFacts, buildNoteDraft, noteBodyWarnings,
  type AdvTeacherNote,
} from './advTeacherNote';
import { weekStartOf } from './advWeekly';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvMasteryAttempt, AdvMockLogEntry } from './advTypes';

const NOW = '2026-08-05T09:00:00.000Z'; // 水曜（JST 18:00）
const THIS_WEEK = '2026-08-03'; // 月曜
/** JST 2026-08-17（月）00:30 ＝ 中国時間では日曜23:30。ローカルTZ基準だと前の週に落ちる時刻 */
const BOUNDARY_NOW = '2026-08-16T15:30:00.000Z';

const note = (over: Partial<AdvTeacherNote> = {}): AdvTeacherNote => ({
  id: noteIdFor(THIS_WEEK),
  weekStartKey: THIS_WEEK,
  bodyJa: '今週は3日、学習の記録がありました。',
  bodyZh: '本周有3天的学习记录。',
  authorLabel: '安田コーチ',
  createdAtISO: '2026-08-05T00:00:00.000Z',
  readAtISO: null,
  ...over,
});

const weekNote = (weekStartKey: string, over: Partial<AdvTeacherNote> = {}): AdvTeacherNote =>
  note({ id: noteIdFor(weekStartKey), weekStartKey, createdAtISO: `${weekStartKey}T00:00:00.000Z`, ...over });

const att = (
  dateKey: string, scorePct: number,
  over: Partial<AdvMasteryAttempt> = {},
): AdvMasteryAttempt => ({
  dateKey,
  scorePct,
  unseenRatio: 1,
  // 5問未満にしておく＝「複数問題タイプ」条件を持ち込まず、定着判定だけを見る
  questionKeys: [`k-${dateKey}-1`, `k-${dateKey}-2`, `k-${dateKey}-3`],
  tier: 'normal',
  timed: false,
  completedAt: `${dateKey}T10:00:00.000Z`,
  ...over,
});

/** 試験科目別の実測つき attempt（母数10問以上でないと「いちばん低い技能」の候補にならない） */
const skillAtt = (
  dateKey: string, scorePct: number,
  skill: string, correct: number, total: number,
): AdvMasteryAttempt =>
  att(dateKey, scorePct, { bySkill: { [skill]: { correct, total, unseen: 0 } } });

const mock = (dateKey: string, over: Partial<AdvMockLogEntry> = {}): AdvMockLogEntry => ({
  mockId: `m-${dateKey}`,
  dateKey,
  level: 'N2',
  mode: 'short',
  totalCorrect: 12,
  totalQuestions: 20,
  totalUnanswered: 1,
  sectionsFinishedInTime: 1,
  sectionCount: 2,
  skills: ['reading'],
  completedAt: `${dateKey}T12:00:00.000Z`,
  ...over,
});

const profileWith = (over: Partial<AdventureV2Profile> = {}): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  targetJlpt: 'N2',
  dailyMinutes: 15,
  ...over,
});

/** つまずき5件（＝上位3件に丸めた配列の length を件数として出していないかを見るため） */
const fiveStruggling = (): AdventureV2Profile['mastery'] =>
  Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((t) => [
    `n3-${t}`, [att('2026-08-03', 60), att('2026-08-04', 55)],
  ]));

afterEach(() => { vi.unstubAllEnvs(); });

describe('週の境界 — JST固定で、実行環境のTZに左右されない', () => {
  it('月曜はじまりで切る', () => {
    expect(weekStartKeyOf('2026-08-05')).toBe('2026-08-03'); // 水 → 月
    expect(weekStartKeyOf('2026-08-03')).toBe('2026-08-03'); // 月 → 同日
    expect(weekStartKeyOf('2026-08-09')).toBe('2026-08-03'); // 日 → 同じ週
    expect(weekStartKeyOf('2026-08-10')).toBe('2026-08-10'); // 翌月曜 → 次の週
  });

  it('切り方の規則（月曜はじまり）が advWeekly.weekStartOf と同じ（28日総当たり・月またぎ年またぎ）', () => {
    // 注意: この総当たりが固定するのは「月曜はじまり」という規則だけ。
    // weekStartOf にローカル深夜0時を渡しているので、TZ差はここには現れない（下の TZ テストが担当）。
    const starts = ['2026-08-01', '2026-12-24', '2027-02-25'];
    for (const start of starts) {
      const base = Date.UTC(
        Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)),
      );
      for (let i = 0; i < 28; i += 1) {
        const key = new Date(base + i * 86400000).toISOString().slice(0, 10);
        expect(weekStartKeyOf(key)).toBe(weekStartOf(`${key}T00:00:00`));
      }
    }
  });

  it('日付として読めない値は、勝手に別の週へ寄せずそのまま返す', () => {
    expect(weekStartKeyOf('')).toBe('');
    expect(weekStartKeyOf('2026-08')).toBe('2026-08');
  });

  it('**週境界の時刻でも、どのTZで実行しても同じJSTの週を指す**（中国時間の日曜深夜で1週ずれない）', () => {
    // BOUNDARY_NOW は JST 月曜00:30。ローカルTZ基準で切ると UTC/CST/PST では前の週になる。
    const prof = profileWith({
      mastery: { 'n3-x': [att('2026-08-17', 60), att('2026-08-17', 55)] },
      questLog: [{ dateKey: '2026-08-17', completedSteps: 1, totalSteps: 3 }],
    });
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', 'Asia/Tokyo']) {
      vi.stubEnv('TZ', tz);
      const facts = collectNoteFacts(prof, BOUNDARY_NOW);
      expect(facts.weekStartKey).toBe('2026-08-17');
      // 週がずれていれば、月曜の記録が今週から消える（＝1日が0日になる）
      expect(facts.studyDays).toBe(1);
      expect(facts.strugglingCount).toBe(1);
    }
  });

  it('下書き本文もTZで変わらない（同じ週・同じ数字になる）', () => {
    const prof = profileWith({ mastery: { 'n3-x': [att('2026-08-17', 60), att('2026-08-17', 55)] } });
    const drafts = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((tz) => {
      vi.stubEnv('TZ', tz);
      return buildNoteDraft(prof, BOUNDARY_NOW);
    });
    expect(new Set(drafts.map((d) => d.ja)).size).toBe(1);
    expect(new Set(drafts.map((d) => d.zh)).size).toBe(1);
  });

  it('親が noteId に使う週キーと、実測を集めた週キーが必ず一致する', () => {
    for (const now of [NOW, BOUNDARY_NOW, '2026-08-16T14:59:00.000Z', '2026-12-31T23:00:00.000Z']) {
      const facts = collectNoteFacts(profileWith(), now);
      expect(facts.weekStartKey).toBe(weekStartKeyOf(jstDateKeyOf(now)));
      expect(noteIdFor(facts.weekStartKey)).toBe(noteIdFor(weekStartKeyOf(jstDateKeyOf(now))));
    }
  });

  it('JSTの日付キーに直す（読めない時刻でも投げない＝ホームを落とさない）', () => {
    expect(jstDateKeyOf('2026-08-16T14:59:00.000Z')).toBe('2026-08-16'); // JST 23:59 日曜
    expect(jstDateKeyOf('2026-08-16T15:00:00.000Z')).toBe('2026-08-17'); // JST 00:00 月曜
    expect(jstDateKeyOf('')).toBe('');
    expect(jstDateKeyOf('x')).toBe('');
  });

  it('壊れた nowISO では、週を捏造せず事実ゼロで返す（例外を投げない）', () => {
    const prof = profileWith({ mastery: { 'n3-x': [att('2026-08-03', 60), att('2026-08-04', 55)] } });
    const facts = collectNoteFacts(prof, 'こわれた時刻');
    expect(facts.weekStartKey).toBe('');
    expect(facts.studyDays).toBe(0);
    expect(facts.strugglingCount).toBe(0);
    expect(facts.sparse).toBe(true);
    expect(() => buildNoteDraft(prof, 'こわれた時刻')).not.toThrow();
  });
});

describe('未読の1件を出す', () => {
  it('未読が無ければ null', () => {
    expect(latestUnreadNote([], NOW)).toBeNull();
    expect(latestUnreadNote(undefined, NOW)).toBeNull();
    expect(latestUnreadNote([note({ readAtISO: '2026-08-05T01:00:00.000Z' })], NOW)).toBeNull();
  });

  it('未読が複数あればいちばん新しい1件だけ出す（古い未読で埋めない）', () => {
    const list = [weekNote('2026-07-20'), weekNote('2026-07-27'), weekNote(THIS_WEEK)];
    expect(latestUnreadNote(list, NOW)?.weekStartKey).toBe(THIS_WEEK);
  });

  it('**書いた時刻が未来の一言は出さない**（コーチ側の時計ずれ・先行入力で先出しさせない）', () => {
    const future = note({ createdAtISO: '2026-08-09T00:00:00.000Z' });
    expect(latestUnreadNote([future], NOW)).toBeNull();
    expect(latestUnreadNote([future, weekNote('2026-07-27')], NOW)?.weekStartKey).toBe('2026-07-27');
  });

  it('**オフセット表記の時刻を「未来」と誤判定しない**（文字列比較で永久に出ないのを防ぐ）', () => {
    const offset = note({ createdAtISO: '2026-08-05T09:00:00+09:00' }); // ＝ 2026-08-05T00:00Z（過去）
    expect(latestUnreadNote([offset], NOW)?.id).toBe(offset.id);
    // 同じ時刻を指す2表記が、並べたときにも同じ扱いになる
    const zulu = weekNote('2026-07-27', { createdAtISO: '2026-08-05T00:00:00.000Z' });
    expect(latestUnreadNote([offset, zulu], NOW)?.weekStartKey).toBe(THIS_WEEK); // 同時刻→週キーで決まる
  });

  it('時刻として読めない一言は出さない（いつ書かれたか分からないものを今週の一言にしない）', () => {
    expect(latestUnreadNote([note({ createdAtISO: 'unknown' })], NOW)).toBeNull();
    expect(latestUnreadNote([note()], 'こわれた時刻')).toBeNull();
  });
});

describe('既読化 — 巻き戻さない・壊さない', () => {
  it('既読時刻を入れた新しい配列を返し、入力は変えない', () => {
    const list = [note()];
    const next = markNoteRead(list, list[0].id, NOW);
    expect(next[0].readAtISO).toBe(NOW);
    expect(list[0].readAtISO).toBeNull(); // 入力は破壊しない
    expect(next).not.toBe(list);
  });

  it('すでに既読なら時刻を上書きせず、配列参照も変えない（無駄な保存を起こさない）', () => {
    const list = [note({ readAtISO: '2026-08-04T00:00:00.000Z' })];
    const next = markNoteRead(list, list[0].id, NOW);
    expect(next).toBe(list);
    expect(next[0].readAtISO).toBe('2026-08-04T00:00:00.000Z');
  });

  it('存在しないidは何も変えない', () => {
    const list = [note()];
    expect(markNoteRead(list, 'tn-9999-01-01', NOW)).toBe(list);
  });

  it('**未保存（undefined）のときは undefined を返す**（毎回新しい空配列を作って保存を誘発しない）', () => {
    const before = undefined;
    const next = markNoteRead(before, 'tn-2026-08-03', NOW);
    expect(next).toBeUndefined();
    expect(next).toBe(before); // 呼び出し側の `next !== notes` が「変化なし」と判定できる
  });
});

describe('追加 — 同一週は置換・12件だけ残す', () => {
  it('13週ぶん入れても最新12件だけ残る（jsonbを太らせない）', () => {
    let list: AdvTeacherNote[] = [];
    const keys: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      const key = new Date(Date.UTC(2026, 4, 4) + i * 7 * 86400000).toISOString().slice(0, 10);
      keys.push(key);
      list = appendNote(list, weekNote(key));
    }
    expect(list).toHaveLength(MAX_TEACHER_NOTES);
    expect(list.map((n) => n.weekStartKey)).not.toContain(keys[0]); // いちばん古い週が落ちる
    expect(list[list.length - 1].weekStartKey).toBe(keys[12]);
  });

  it('同じ週に2回書いたら置換する（同じ週の一言が2つ並ばない）', () => {
    const list = appendNote(appendNote([], note()), note({ bodyJa: '書き直した本文' }));
    expect(list).toHaveLength(1);
    expect(list[0].bodyJa).toBe('書き直した本文');
  });

  it('**本文が同じなら既読状態を温存する**（保存が二重に走っても未読へ戻らない）', () => {
    const read = note({ readAtISO: '2026-08-05T02:00:00.000Z' });
    const again = appendNote([read], note()); // 同じ本文の再保存
    expect(again[0].readAtISO).toBe('2026-08-05T02:00:00.000Z');
  });

  it('本文を書き直したら未読に戻す（読み直してほしいため）', () => {
    const read = note({ readAtISO: '2026-08-05T02:00:00.000Z' });
    const edited = appendNote([read], note({ bodyJa: '直した本文', bodyZh: '改过的正文' }));
    expect(edited[0].readAtISO).toBeNull();
  });

  it('入力配列を破壊しない', () => {
    const list = [weekNote('2026-07-27')];
    const next = appendNote(list, note());
    expect(list).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe('復元 — 壊れたデータでホームを落とさない・埋もれさせない', () => {
  it('配列でない・必須が欠けた要素は落とす', () => {
    expect(restoreTeacherNotes(null)).toEqual([]);
    expect(restoreTeacherNotes({ a: 1 })).toEqual([]);
    const restored = restoreTeacherNotes([
      note(),
      { ...note(), id: '' },
      { ...note(), weekStartKey: '2026/08/03' },
      { ...note(), bodyJa: '   ' },
      { ...note(), createdAtISO: 123 },
      'ゴミ',
    ]);
    expect(restored).toHaveLength(1);
    expect(restored[0].authorLabel).toBe('安田コーチ');
  });

  it('**時刻として読めない createdAtISO は落とす**（未来判定で永久に出ない一言を作らない）', () => {
    const broken = ['unknown', '2026-8-5T00:00:00Z', '2026-08-05', '2026-08-05T00:00:00', ''];
    for (const createdAtISO of broken) {
      expect(restoreTeacherNotes([note({ createdAtISO })])).toEqual([]);
    }
  });

  it('**オフセット表記はUTCへ正規化して残す**（復元した一言がそのままホームに出る）', () => {
    const restored = restoreTeacherNotes([
      note({ createdAtISO: '2026-08-05T09:00:00+09:00' }), // ＝ 2026-08-05T00:00Z
    ]);
    expect(restored).toHaveLength(1);
    expect(restored[0].createdAtISO).toBe('2026-08-05T00:00:00.000Z');
    expect(latestUnreadNote(restored, NOW)?.id).toBe(noteIdFor(THIS_WEEK));
  });

  it('読めない readAtISO は未読に倒す（既読を捏造して一言を隠さない）', () => {
    const restored = restoreTeacherNotes([note({ readAtISO: 'よんだ' })]);
    expect(restored[0].readAtISO).toBeNull();
    expect(latestUnreadNote(restored, NOW)?.id).toBe(noteIdFor(THIS_WEEK));
  });

  it('差出人が欠けていても捏造せず空にする（画面側で先生名へ落とす）', () => {
    const restored = restoreTeacherNotes([{ ...note(), authorLabel: undefined }]);
    expect(restored[0].authorLabel).toBe('');
  });

  it('同じ週が重複していたら新しい方だけ残し、12件へ間引く', () => {
    const dup = restoreTeacherNotes([
      note({ bodyJa: '古い', createdAtISO: '2026-08-03T00:00:00.000Z' }),
      note({ bodyJa: '新しい', createdAtISO: '2026-08-05T00:00:00.000Z' }),
    ]);
    expect(dup).toHaveLength(1);
    expect(dup[0].bodyJa).toBe('新しい');

    // 表記が混ざっていても「新しい方」を時刻で決める（文字列比較だと +09:00 側が勝ってしまう）
    const mixed = restoreTeacherNotes([
      note({ bodyJa: '新しい', createdAtISO: '2026-08-05T06:00:00.000Z' }),
      note({ bodyJa: '古い', createdAtISO: '2026-08-05T09:00:00+09:00' }), // ＝ 00:00Z
    ]);
    expect(mixed[0].bodyJa).toBe('新しい');

    const many = Array.from({ length: 20 }, (_, i) =>
      weekNote(new Date(Date.UTC(2026, 0, 5) + i * 7 * 86400000).toISOString().slice(0, 10)));
    expect(restoreTeacherNotes(many)).toHaveLength(MAX_TEACHER_NOTES);
  });
});

describe('下書き — 実測だけを書く', () => {
  it('記録が無い週は「データが少ないので事実だけ」にする（物語を作らない）', () => {
    const d = buildNoteDraft(profileWith(), NOW);
    expect(collectNoteFacts(profileWith(), NOW).sparse).toBe(true);
    expect(d.ja).toContain('データが少ない');
    expect(d.ja).toContain('記録がありませんでした');
    expect(d.zh).toContain('数据较少');
    expect(d.zh).toContain('本周'); // 中国語からも「今週」を落とさない
  });

  it('実測がある週は、学習日数・新しく定着した数・つまずきを事実として書く', () => {
    // 定着: 別日3回（先々週）＋7日後の遅延確認が今週 → 「今週あらたに定着」
    const mastered = [
      att('2026-07-20', 90), att('2026-07-21', 90), att('2026-07-22', 90),
      att('2026-08-04', 85),
    ];
    // つまずき: 今週2回やって、どちらも80%未満
    const stuck = [att('2026-08-03', 60), att('2026-08-04', 55)];
    const prof = profileWith({ mastery: { 'n3-unit-01': mastered, 'n3-grammar-07': stuck } });

    const facts = collectNoteFacts(prof, NOW);
    expect(facts.newlyMasteredCount).toBe(1);
    expect(facts.strugglingCount).toBe(1);
    expect(facts.strugglingTargetIds).toEqual(['n3-grammar-07']);
    expect(facts.studyDays).toBe(2); // 08-03 と 08-04
    expect(facts.sparse).toBe(false);

    const d = buildNoteDraft(prof, NOW);
    expect(d.ja).toContain('2日');
    expect(d.ja).toContain('新しく1項目');
    expect(d.ja).toContain('1項目は80%に届かない');
    expect(d.zh).toContain('2天');
    expect(d.zh).toContain('有1个项目连续几次都没到80%');
  });

  it('**つまずき件数は上位3件に丸めず、実測の総数を書く**', () => {
    const prof = profileWith({ mastery: fiveStruggling() });
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.strugglingCount).toBe(5);
    expect(facts.strugglingTargetIds).toHaveLength(3); // コーチ画面の根拠表示用は3件のまま
    expect(buildNoteDraft(prof, NOW).ja).toContain('5項目は80%に届かない');
    expect(buildNoteDraft(prof, NOW).zh).toContain('有5个项目');
  });

  it('1回落としただけの対象は「つまずき」にしない（コーチの手を無駄に増やさない）', () => {
    const prof = profileWith({ mastery: { x: [att('2026-08-03', 60)] } });
    expect(collectNoteFacts(prof, NOW).strugglingTargetIds).toEqual([]);
    expect(collectNoteFacts(prof, NOW).strugglingCount).toBe(0);
  });

  it('**1日に2回やって全部80%未満の週を「データが少ない」で流さない**（いちばん知りたい事実を消さない）', () => {
    // 同じ日に2回なので定着（別日3回）の証拠にはならないが、つまずきは今週の実測。
    const prof = profileWith({ mastery: { 'n3-grammar-07': [att('2026-08-03', 60), att('2026-08-03', 55)] } });
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.studyDays).toBe(1);
    expect(facts.newlyMasteredCount).toBe(0);
    expect(facts.sparse).toBe(false);
    expect(buildNoteDraft(prof, NOW).ja).toContain('1項目は80%に届かない');
  });

  it('技能別の実測（10問以上）とミニ模試の回数を、事実として書く', () => {
    const prof = profileWith({
      mastery: { 'n2-read-01': [skillAtt('2026-08-03', 60, 'reading', 6, 12), skillAtt('2026-08-04', 55, 'reading', 1, 2)] },
      mockLog: [mock('2026-08-05')],
    });
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.lowestSkillThisWeek).toEqual({ ja: '読解', zh: '阅读', pct: 50, questions: 14 });
    expect(facts.mockCount).toBe(1);

    const d = buildNoteDraft(prof, NOW);
    expect(d.ja).toContain('ミニ模試を1回');
    expect(d.ja).toContain('読解の正答率がいちばん低い結果でした（14問で50%）');
    expect(d.zh).toContain('有1次迷你模拟考的记录');
    expect(d.zh).toContain('「阅读」的正确率最低（14题，50%）');
  });

  it('母数10問未満の技能は名指ししない（3問の正答率で技能を語らない）', () => {
    const prof = profileWith({ mastery: { 'n2-read-01': [skillAtt('2026-08-03', 40, 'reading', 1, 4)] } });
    expect(collectNoteFacts(prof, NOW).lowestSkillThisWeek).toBeNull();
  });

  it('技能の実測がある週は、学習1日でも「データが少ない」にしない', () => {
    const prof = profileWith({ mastery: { 'n2-gram-01': [skillAtt('2026-08-03', 85, 'grammar', 5, 12)] } });
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.studyDays).toBe(1);
    expect(facts.sparse).toBe(false);
    expect(buildNoteDraft(prof, NOW).ja).toContain('文法の正答率がいちばん低い結果でした（12問で42%）');
  });

  it('ミニ模試は「つまずいている項目」に数えない（模試は項目ではない・回数は別に出す）', () => {
    const prof = profileWith({
      mastery: { 'mock-n2': [att('2026-08-03', 55), att('2026-08-05', 60)] },
      mockLog: [mock('2026-08-03'), mock('2026-08-05')],
    });
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.strugglingCount).toBe(0);
    expect(facts.mockCount).toBe(2);
    const d = buildNoteDraft(prof, NOW);
    expect(d.ja).toContain('ミニ模試を2回');
    expect(d.ja).not.toContain('項目は80%に届かない');
  });

  it('学習日が0日の週に「0日、学習の記録がありました」と書かない', () => {
    const prof = profileWith({ mockLog: [mock('2026-08-05')] }); // 台帳が無い復元データなど
    const facts = collectNoteFacts(prof, NOW);
    expect(facts.studyDays).toBe(0);
    expect(facts.sparse).toBe(false);
    const d = buildNoteDraft(prof, NOW);
    expect(d.ja).not.toContain('0日');
    expect(d.zh).not.toContain('0天');
    expect(d.ja).toContain('ミニ模試を1回');
  });

  it('先週の記録は今週の下書きに混ぜない', () => {
    const prof = profileWith({ mastery: { x: [att('2026-07-27', 60), att('2026-07-28', 55)] } });
    expect(collectNoteFacts(prof, NOW).sparse).toBe(true);
    expect(collectNoteFacts(prof, NOW).strugglingCount).toBe(0);
  });

  it('**どの週の下書きにも、断定的な褒め・合格予測・喪失の脅し・未実装の約束が入らない**', () => {
    const cases: AdventureV2Profile[] = [
      profileWith(),
      profileWith({ mastery: { x: [att('2026-08-03', 60), att('2026-08-04', 55)] } }),
      profileWith({ mastery: fiveStruggling() }),
      profileWith({
        mastery: {
          y: [att('2026-07-20', 90), att('2026-07-21', 90), att('2026-07-22', 90), att('2026-08-04', 90)],
        },
        questLog: [{ dateKey: THIS_WEEK, completedSteps: 3, totalSteps: 3 }],
      }),
      // 技能の実測（10問以上）と模試つき＝「来週は◯◯を多めに出します」を書いていた分岐
      profileWith({
        mastery: {
          'n2-read-01': [skillAtt('2026-08-03', 60, 'reading', 6, 12), skillAtt('2026-08-04', 70, 'grammar', 9, 12)],
        },
        mockLog: [mock('2026-08-04'), mock('2026-08-05')],
      }),
    ];
    const banned = [
      'よくできました', 'すごい', 'さすが', '天才', '完璧',
      '合格でき', '必ず', '絶対', 'きっと',
      '消えます', '失います', '途切れます', 'もったいない',
      // 出題ロジックにこの値のconsumerが無い＝先生名義で約束してはいけない未来の挙動
      '来週', '多めに出します', '出します',
    ];
    const bannedZh = ['下周', '会多出', '一定能', '肯定'];
    for (const prof of cases) {
      const d = buildNoteDraft(prof, NOW);
      for (const w of banned) expect(d.ja).not.toContain(w);
      for (const w of bannedZh) expect(d.zh).not.toContain(w);
      expect(d.ja.length).toBeGreaterThan(0);
      expect(d.zh.length).toBeGreaterThan(0);
      // 下書き自身が文面チェックに引っかからないこと（自分の規約を自分で破らない）
      expect(noteBodyWarnings(d.ja)).toEqual([]);
    }
  });

  it('**下書きは本文だけを返す**（AIが先生名義の一言を組み立てて自動送信する経路を作らない）', () => {
    const d = buildNoteDraft(profileWith(), NOW);
    expect(Object.keys(d).sort()).toEqual(['ja', 'zh']);
  });
});

describe('文面チェック — 送る前の注意喚起（ブロックはしない）', () => {
  it('合格を約束・断定する表現を拾う（前に付く形）', () => {
    expect(noteBodyWarnings('この調子なら合格できます。')).toHaveLength(1);
    expect(noteBodyWarnings('必ず受かりますよ。')).toHaveLength(1);
    expect(noteBodyWarnings('合格を保証します。')).toHaveLength(1);
    expect(noteBodyWarnings('絶対に合格します。')).toHaveLength(1);
  });

  it('**後ろに付く形も拾う**（「合格は確実です」「受かると思います」）', () => {
    expect(noteBodyWarnings('合格は確実です。')).toHaveLength(1);
    expect(noteBodyWarnings('合格は間違いないです。')).toHaveLength(1);
    expect(noteBodyWarnings('受かると思いますよ。')).toHaveLength(1);
    expect(noteBodyWarnings('受かるでしょう。')).toHaveLength(1);
  });

  it('喪失で動かす表現・不合格の予告を拾う', () => {
    expect(noteBodyWarnings('今日やらないと連続記録が消えます。')).toHaveLength(1);
    expect(noteBodyWarnings('このままだと間に合いません。')).toHaveLength(1);
    expect(noteBodyWarnings('やらないと落ちますよ。')).toHaveLength(1);
    expect(noteBodyWarnings('毎日やらなければ不合格になります。')).toHaveLength(1);
  });

  it('**正直な見通しと、起きた事実は警告しない**（警告が多すぎると読み飛ばされる）', () => {
    expect(noteBodyWarnings('今のままでは合格は難しいです。')).toEqual([]);
    expect(noteBodyWarnings('今週の記録が消えてしまいました。')).toEqual([]);
    expect(noteBodyWarnings('合格までにやることを一緒に整理しましょう。')).toEqual([]);
  });

  it('ふつうの一言は警告0件（コーチの手を止めない）', () => {
    expect(noteBodyWarnings('今週は3日、学習の記録がありました。次のレッスンで文法を一緒に見ましょう。')).toEqual([]);
    expect(noteBodyWarnings('今週の記録では、読解の正答率がいちばん低い結果でした（14問で50%）。')).toEqual([]);
  });
});

// ── 2026-08-17 再レビューで直した3点の再発防止 ──
describe('実装していない導線を先生名義で案内しない', () => {
  it('下書きに「返信で教えてください」が出ない（返信UIが存在しないため）', () => {
    const p = { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt' as const, targetJlpt: 'N3' as const };
    const d = buildNoteDraft(p, NOW);
    expect(d.ja).not.toMatch(/返信/);
    expect(d.zh).not.toMatch(/回复/);
  });

  it('データが少ない週の下書きが「5分」を決め打ちしない（15分/30分の生徒に嘘になる）', () => {
    const p = { ...defaultAdvProfile(NOW), enabled: true, dailyMinutes: 30 as const };
    const d = buildNoteDraft(p, NOW);
    expect(d.ja).not.toMatch(/5分/);
    expect(d.zh).not.toMatch(/5分钟/);
  });
});

describe('断定・脅しの検出（取りこぼしの再発防止）', () => {
  it('活用形の断定も拾う', () => {
    for (const body of [
      '合格できると思います。',
      '合格できるはずです。',
      'がんばれば合格は間違いありません。',
      'このままだと落ちてしまいます。',
    ]) {
      expect(noteBodyWarnings(body).length, body).toBeGreaterThan(0);
    }
  });

  it('正直な見通しは警告しない（誤検知の防止）', () => {
    expect(noteBodyWarnings('今のままでは合格は難しいです。').length).toBe(0);
  });
});
