// AIコースUI文言（ja / 簡体字zh）の品質ガード（§7 文言品質 / §D 有料サービス品質）。
//
// 純データ検証のみ（DOM不要）。狙いは「渡す前に文言が壊れていたら困る」不変条件の固定化：
//  - ja と zh の構造が一致している（片方だけキーが欠ける＝表示崩れ・空白を防ぐ）
//  - 人間の連絡先が AI 講師（翔子）と混同されない（中国人学習者が別人と誤解しない）
//  - 内部用語・エラーコードを利用者向け文言に露出しない

import { describe, it, expect } from 'vitest';
import { aiCourseI18n } from './aiCourse';

const { ja, zh } = { ja: aiCourseI18n.ja, zh: aiCourseI18n.zh };

/** ネスト構造のキー集合を "a.b.c" 形式で集める（関数・配列は葉として扱う） */
const keyPaths = (obj: unknown, prefix = ''): string[] => {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? keyPaths(v, path) : [path];
  });
};

describe('AIコース文言: ja / zh 構造一致', () => {
  it('ja と zh のキー集合が完全に一致する（片側欠落なし）', () => {
    const jaKeys = keyPaths(ja).sort();
    const zhKeys = keyPaths(zh).sort();
    expect(zhKeys).toEqual(jaKeys);
  });

  it('locale フィールドが自身の言語を指す', () => {
    expect(ja.locale).toBe('ja');
    expect(zh.locale).toBe('zh');
  });
});

describe('AIコース文言: 呼称仕様（§7 正式仕様）', () => {
  // AI講師: ja「翔子先生」/ zh「翔子老师」。 人間の運営・連絡先: ja「コース運営者」/ zh「课程负责人」
  const humanContactJa = [ja.onboarding.contact, ja.issue.description, ja.limits.learner_suspended];
  const humanContactZh = [zh.onboarding.contact, zh.issue.description, zh.limits.learner_suspended];

  it('人間の連絡先（zh）は「课程负责人」で、AI講師と紛らわしい語を使わない', () => {
    for (const line of humanContactZh) {
      expect(line, line).toContain('课程负责人');
      expect(line, line).not.toContain('翔一'); // 旧・別人名（1文字違いの混同）
      expect(line, line).not.toContain('翔子'); // AI講師名と同名にしない
    }
  });

  it('人間の連絡先（ja）は「コース運営者」で、AI講師名や個人ニックネームを使わない', () => {
    for (const line of humanContactJa) {
      expect(line, line).toContain('コース運営者');
      expect(line, line).not.toContain('翔子');
      expect(line, line).not.toContain('しょっちゃん');
    }
  });

  it('AI講師名はブランド・音声UIで「翔子先生 / 翔子老师」を使う（呼称の一貫性）', () => {
    expect(ja.brand).toContain('翔子先生');
    expect(zh.brand).toContain('翔子老师');
    expect(ja.voice.statusConnecting).toContain('翔子先生');
    expect(zh.voice.statusConnecting).toContain('翔子老师');
  });
});

describe('AIコース文言: 内部用語・エラーコードを露出しない（§7）', () => {
  const flatten = (dict: typeof ja): string[] =>
    keyPaths(dict).map((path) => {
      const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
      return typeof v === 'string' ? v : '';
    });

  it('利用者向け文言に生の識別子（daily_session_limit 等）が出ない', () => {
    for (const dict of [ja, zh]) {
      for (const line of flatten(dict)) {
        // アンダースコア区切りの英小文字トークン＝内部キーの露出
        expect(/[a-z]{3,}_[a-z]{3,}/.test(line), line).toBe(false);
      }
    }
  });
});
