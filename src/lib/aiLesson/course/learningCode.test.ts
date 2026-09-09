import { describe, it, expect } from 'vitest';
import {
  CODE_ALPHABET, CODE_LENGTH, normalizeLearningCode, isValidLearningCode,
  formatLearningCode, learningCodeUrl, learningCodeMessage,
} from './learningCode';

describe('コードの形', () => {
  it('紛らわしい文字（0 O 1 I L U）を含まない', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(CODE_ALPHABET.includes(ch), `${ch} が入っている`).toBe(false);
    }
    expect(CODE_ALPHABET.length).toBe(30);
  });

  it('総当たりが現実的でない大きさ（30^12 ≒ 5.3e17・約59bit）', () => {
    const space = Math.pow(CODE_ALPHABET.length, CODE_LENGTH);
    expect(space).toBeGreaterThan(1e17);
    expect(Math.log2(space)).toBeGreaterThan(55);
  });
});

describe('normalizeLearningCode', () => {
  it('小文字・ハイフン・空白を吸収する（配った形のまま貼っても通る）', () => {
    expect(normalizeLearningCode('k7px-29qm-4t6b')).toBe('K7PX29QM4T6B');
    expect(normalizeLearningCode(' K7PX 29QM 4T6B ')).toBe('K7PX29QM4T6B');
    expect(normalizeLearningCode('K7PX–29QM–4T6B')).toBe('K7PX29QM4T6B'); // 全角ダッシュ
  });

  it('空・null相当でも落ちない', () => {
    expect(normalizeLearningCode('')).toBe('');
    expect(normalizeLearningCode(undefined as unknown as string)).toBe('');
  });
});

describe('isValidLearningCode', () => {
  it('正しい形だけを通す', () => {
    expect(isValidLearningCode('K7PX-29QM-4T6B')).toBe(true);
    expect(isValidLearningCode('k7px29qm4t6b')).toBe(true);
  });

  it('推測できる文字列は形からして通らない', () => {
    // 監査で「絶対にやらない」と決めたもの
    for (const bad of ['andy', 'user001', '123456', 'tanaka', 'password']) {
      expect(isValidLearningCode(bad), `${bad} が通ってしまう`).toBe(false);
    }
  });

  it('長さ違い・使わない文字を弾く', () => {
    expect(isValidLearningCode('K7PX-29QM-4T6')).toBe(false);   // 11桁
    expect(isValidLearningCode('K7PX-29QM-4T6BB')).toBe(false); // 13桁
    expect(isValidLearningCode('K7PX-29QM-4T6O')).toBe(false);  // O は使わない
    expect(isValidLearningCode('K7PX-29QM-4T6L')).toBe(false);  // L は使わない
  });
});

describe('formatLearningCode', () => {
  it('4桁ずつ区切る', () => {
    expect(formatLearningCode('K7PX29QM4T6B')).toBe('K7PX-29QM-4T6B');
  });

  it('打っている途中でもそこまでを区切る（入力欄でそのまま使える）', () => {
    expect(formatLearningCode('K7P')).toBe('K7P');
    expect(formatLearningCode('K7PX2')).toBe('K7PX-2');
    expect(formatLearningCode('')).toBe('');
  });

  it('余分な文字は切り落とす', () => {
    expect(formatLearningCode('K7PX29QM4T6BZZZZ')).toBe('K7PX-29QM-4T6B');
  });
});

describe('learningCodeUrl', () => {
  it('生徒向けの正準ドメインを既定にする（WeChatが *.pages.dev を弾くため）', () => {
    expect(learningCodeUrl('K7PX29QM4T6B')).toBe('https://study.kawabado.com/zh/learn/K7PX-29QM-4T6B');
  });

  it('言語とオリジンを差し替えられる（stagingでの確認用）', () => {
    expect(learningCodeUrl('K7PX29QM4T6B', 'ja', 'https://staging.badminton-platform.pages.dev'))
      .toBe('https://staging.badminton-platform.pages.dev/ja/learn/K7PX-29QM-4T6B');
  });
});

describe('learningCodeMessage', () => {
  it('URLとコードの両方が入る（機種変更で開けない人の道を残す）', () => {
    const zh = learningCodeMessage('K7PX29QM4T6B', 'zh');
    expect(zh).toContain('https://study.kawabado.com/zh/learn/K7PX-29QM-4T6B');
    expect(zh).toContain('K7PX-29QM-4T6B');
    expect(zh).toContain('弄丢了');
  });

  it('日本語版もある', () => {
    const ja = learningCodeMessage('K7PX29QM4T6B', 'ja');
    expect(ja).toContain('/ja/learn/');
    expect(ja).toContain('パスワードは要りません');
  });

  it('「パスワード」を覚えさせる文言を含まない', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const m = learningCodeMessage('K7PX29QM4T6B', lang);
      expect(m.includes('パスワードを控え')).toBe(false);
      expect(m.includes('请记住密码')).toBe(false);
    }
  });
});
