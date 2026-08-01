// 先生選択（Teacher Selection）の受入テスト。
//
// FAIL条件:
// - teacherId 以外（性別など）で分岐している
// - 未選択learnerの保存値が勝手に書き換わる
// - reload（settings往復）で選択が失われる
// - assetが無い表情で undefined を返す
// - 商品名（brand）が学習者の選択で変わる
import { describe, it, expect } from 'vitest';
import {
  ALL_TEACHERS, ADV_TEACHER_IDS, DEFAULT_TEACHER_ID,
  resolveTeacher, teacherAsset, teacherName, isTeacherId,
} from './advTeacher';
import { applyTeacherName, replaceTeacherName } from './advTeacherText';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile } from './advProfile';
import type { LearnerSettings } from '../types';
import { existsSync } from 'node:fs';

const NOW = '2026-08-01T00:00:00.000Z';
const emptySettings = (): LearnerSettings => ({} as LearnerSettings);

describe('先生の定義', () => {
  it('翔子先生と悠斗先生の2名が登録されている', () => {
    expect(ADV_TEACHER_IDS).toEqual(['shoko', 'yuto']);
    expect(ALL_TEACHERS.map((t) => t.nameJa)).toEqual(['翔子先生', '悠斗先生']);
    expect(ALL_TEACHERS.map((t) => t.nameZh)).toEqual(['翔子老师', '悠斗老师']);
  });

  it('**性別のフィールドを持たない**（性別を固定条件にしない）', () => {
    for (const t of ALL_TEACHERS) {
      const keys = Object.keys(t);
      for (const banned of ['gender', 'sex', 'isFemale', 'isMale']) {
        expect(keys, `${t.id} に ${banned}`).not.toContain(banned);
      }
    }
  });

  it('ja/zh の名前・役割・挨拶がどちらも埋まっている', () => {
    for (const t of ALL_TEACHERS) {
      for (const v of [t.nameJa, t.nameZh, t.roleJa, t.roleZh, t.greetJa, t.greetZh]) {
        expect(v.trim(), t.id).not.toBe('');
      }
      expect(teacherName(t, 'ja')).toBe(t.nameJa);
      expect(teacherName(t, 'zh')).toBe(t.nameZh);
    }
  });

  it('**どの表情でも必ずassetが返る**（無い表情は neutral へ落ちる）', () => {
    for (const t of ALL_TEACHERS) {
      for (const e of ['neutral', 'speaking', 'smile', 'teaching'] as const) {
        const src = teacherAsset(t, e);
        expect(typeof src, `${t.id}/${e}`).toBe('string');
        expect(src.length, `${t.id}/${e}`).toBeGreaterThan(0);
      }
      // fallback用のモノグラムも必ずある（画像が壊れても空表示にしない）
      expect(t.monogram.trim(), t.id).not.toBe('');
    }
  });

  it('**宣言したassetが実在する**（欠けたままリリースしない）', () => {
    const missing: string[] = [];
    for (const t of ALL_TEACHERS) {
      for (const src of new Set(Object.values(t.assets))) {
        if (!existsSync(`public${src}`)) missing.push(`${t.id}: ${src}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('未選択・不正値は既定の先生へ落ちる', () => {
    expect(resolveTeacher(null).id).toBe(DEFAULT_TEACHER_ID);
    expect(resolveTeacher(undefined).id).toBe(DEFAULT_TEACHER_ID);
    expect(resolveTeacher('nobody' as never).id).toBe(DEFAULT_TEACHER_ID);
    expect(isTeacherId('shoko')).toBe(true);
    expect(isTeacherId('yuto')).toBe(true);
    expect(isTeacherId('taro')).toBe(false);
  });

  it('声が切り替わらない先生は、その旨の注意書きを持つ（誤解させない）', () => {
    for (const t of ALL_TEACHERS) {
      if (!t.voiceSwitchAvailable) {
        expect(t.voiceNoteJa, t.id).toBeTruthy();
        expect(t.voiceNoteZh, t.id).toBeTruthy();
      }
    }
  });
});

describe('保存と復元', () => {
  it('**既存learnerのデフォルトを勝手に変更しない**（未設定は null のまま）', () => {
    const legacy = { adventureV2: { schemaVersion: 1, enabled: true, createdAt: NOW } } as unknown as LearnerSettings;
    const prof = readAdvProfile(legacy)!;
    expect(prof.teacherId).toBeNull();
    // 表示上は既定の先生（従来と同じ見え方）
    expect(resolveTeacher(prof.teacherId).id).toBe('shoko');
    // 書き戻しても teacherId は null のまま（勝手に埋めない）
    const back = writeAdvProfile(legacy, prof, NOW);
    expect((back.adventureV2 as { teacherId: unknown }).teacherId).toBeNull();
  });

  it('**reload後も選択が維持される**（settings往復で失われない）', () => {
    const base = defaultAdvProfile(NOW);
    const saved = writeAdvProfile(emptySettings(), { ...base, enabled: true, teacherId: 'yuto' }, NOW);
    const restored = readAdvProfile(saved)!;
    expect(restored.teacherId).toBe('yuto');
    // もう一往復しても変わらない
    const again = readAdvProfile(writeAdvProfile(emptySettings(), restored, NOW))!;
    expect(again.teacherId).toBe('yuto');
  });

  it('壊れた値は null に落ち、既定の先生で表示される（画面が空にならない）', () => {
    const broken = { adventureV2: { schemaVersion: 1, enabled: true, teacherId: 42, createdAt: NOW } } as unknown as LearnerSettings;
    const prof = readAdvProfile(broken)!;
    expect(prof.teacherId).toBeNull();
    expect(resolveTeacher(prof.teacherId).nameJa).toBe('翔子先生');
  });

  it('teacherId を変えても他のフィールドを壊さない', () => {
    const base = { ...defaultAdvProfile(NOW), enabled: true, targetJlpt: 'N2' as const, mockLog: [] };
    const s1 = writeAdvProfile(emptySettings(), base, NOW);
    const p1 = readAdvProfile(s1)!;
    const s2 = writeAdvProfile(s1, { ...p1, teacherId: 'yuto' }, NOW);
    const p2 = readAdvProfile(s2)!;
    expect(p2.targetJlpt).toBe('N2');
    expect(p2.enabled).toBe(true);
    expect(p2.teacherId).toBe('yuto');
  });
});

describe('文言の先生名', () => {
  it('選択した先生の名前へ差し替わる（ja / zh）', () => {
    expect(replaceTeacherName('翔子先生が話しています', 'yuto', 'ja')).toBe('悠斗先生が話しています');
    expect(replaceTeacherName('翔子老师正在说话', 'yuto', 'zh')).toBe('悠斗老师正在说话');
  });

  it('既定の先生なら文言はそのまま（余計な再生成をしない）', () => {
    const dict = { a: '翔子先生から', nested: { b: '翔子老师' } };
    expect(applyTeacherName(dict, null, 'ja')).toBe(dict);
    expect(applyTeacherName(dict, 'shoko', 'ja')).toBe(dict);
  });

  it('**商品名（brand）は学習者の選択で変えない**', () => {
    const dict = { brand: '翔子先生とAI日本語会話コース', statusTutorSpeaking: '翔子先生が話しています' };
    const out = applyTeacherName(dict, 'yuto', 'ja');
    expect(out.brand).toBe('翔子先生とAI日本語会話コース');
    expect(out.statusTutorSpeaking).toBe('悠斗先生が話しています');
  });

  it('入れ子・配列も走査する（画面の深い場所も揃う）', () => {
    const dict = { a: { b: ['翔子先生から一言', 'ほかの文'] } };
    const out = applyTeacherName(dict, 'yuto', 'ja');
    expect(out.a.b[0]).toBe('悠斗先生から一言');
    expect(out.a.b[1]).toBe('ほかの文');
  });
});
