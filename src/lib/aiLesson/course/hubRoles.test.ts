// 「ことば」vs「日本語のしくみ」情報設計のテスト（2026-07-30 CEO UX指示 §15）。
// - 二つの説明が同一でない・役割キーワードが正しい側にある
// - canonical件数と表示関数の整合・過大表示（N3全語彙/N1網羅/読解聴解）なし
import { describe, it, expect } from 'vitest';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { vocabCanonicalStats } from './vocabCanonical';
import { FOUNDATION_UNIT_META, loadFoundationUnit } from './foundationRegistry';

const locales = [aiCourseI18n.ja, aiCourseI18n.zh] as const;

describe('役割の分離（材料 vs ルール）', () => {
  it('ことばとしくみの説明文は同一でない（ja/zh）', () => {
    for (const t of locales) {
      expect(t.hubRoles.vocabRole).not.toBe(t.hubRoles.labRole);
      expect(t.hubRoles.vocabCardRole).not.toBe(t.hubRoles.labCardRole);
      expect(t.hubRoles.vocabCardItems).not.toBe(t.hubRoles.labCardItems);
      expect(t.hubRoles.vocabNavSub).not.toBe(t.hubRoles.labNavSub);
    }
  });
  it('ことば＝語彙/表現/使い分け・しくみ＝文法要素（助詞/活用/語順/文型）のキーワード配置', () => {
    const ja = aiCourseI18n.ja.hubRoles;
    expect(ja.vocabRole).toContain('単語');
    expect(ja.vocabNavSub).toContain('使い分け');
    for (const kw of ['助詞', '活用', '語順', '文型']) expect(ja.labRole.includes(kw) || ja.labCardItems.includes(kw), kw).toBe(true);
    // しくみ側の説明に語彙側の役割語（単語を増やす）を主語にしない
    expect(ja.labCardRole).not.toContain('材料');
    expect(ja.vocabCardRole).toContain('材料');
    const zh = aiCourseI18n.zh.hubRoles;
    expect(zh.vocabRole).toContain('单词');
    for (const kw of ['助词', '活用', '语序', '句型']) expect(zh.labRole.includes(kw) || zh.labCardItems.includes(kw), kw).toBe(true);
  });
  it('aria-label: ことば/しくみが役割つきで読み上げられる（ja/zh）', () => {
    expect(aiCourseI18n.ja.hubRoles.vocabNavAria).toBe('ことば。単語、表現、使い分けを学びます。');
    expect(aiCourseI18n.ja.hubRoles.labNavAria).toBe('日本語のしくみ。文法、助詞、活用を学びます。');
    expect(aiCourseI18n.zh.hubRoles.vocabNavAria).toBe('词汇。学习单词、表达和用法区别。');
    expect(aiCourseI18n.zh.hubRoles.labNavAria).toBe('日语结构。学习语法、助词和活用。');
  });
});

describe('canonical件数との整合・過大表示なし', () => {
  it('比較カードの数値関数はcanonical値で成立する（ハードコードなし）', () => {
    const stats = vocabCanonicalStats();
    expect(stats.total).toBe(140);
    expect(FOUNDATION_UNIT_META.length).toBe(6);
    const ja = aiCourseI18n.ja.hubRoles;
    expect(ja.vocabProgressNone(stats.total)).toContain('140');
    expect(ja.labProgressNone(FOUNDATION_UNIT_META.length)).toContain('6');
    expect(ja.labScope(FOUNDATION_UNIT_META.length)).toContain('6');
  });
  it('しくみの説明が実装内容と一致（語順・誤用訂正の問題形式が実在する）', async () => {
    const kinds = new Set<string>();
    for (const m of FOUNDATION_UNIT_META) {
      const b = await loadFoundationUnit(m.id);
      for (const q of b.questions) kinds.add((q as { type?: string }).type ?? '');
    }
    // 説明に載せた4系統（助詞・活用・語順・誤用訂正）が実データに存在
    expect(kinds.has('particle_choice')).toBe(true);
    expect(kinds.has('conjugation_choice')).toBe(true);
    expect(kinds.has('sentence_order')).toBe(true);
    expect(kinds.has('error_correction_choice')).toBe(true);
  });
  it('過大表示なし: しくみ説明に読解/聴解/N1網羅/N2網羅を含まない・レベルはN5〜N4', () => {
    for (const t of locales) {
      const all = [t.hubRoles.labRole, t.hubRoles.labRoleSub, t.hubRoles.labScope(6), t.hubRoles.labDone, t.hubRoles.labAdvanced].join('');
      for (const banned of ['読解', '聴解', '阅读', '听力', 'N1']) expect(all.includes(banned), banned).toBe(false);
    }
    expect(aiCourseI18n.ja.hubRoles.labScope(6)).toContain('N5〜N4');
    for (const m of FOUNDATION_UNIT_META) expect(['N5', 'N5-N4']).toContain(m.level);
  });
  it('ことば側: N3全語彙網羅の誤表示なし（既存disclaimerと矛盾しない）', () => {
    for (const t of locales) {
      const all = [t.hubRoles.vocabRole, t.hubRoles.vocabCardRole, t.hubRoles.vocabCardItems].join('');
      expect(all).not.toMatch(/N3の?全語彙|N3全部|覆盖N3全部/);
    }
  });
});

describe('ソラノ塔との関係（実装どおり: 順序条件なし・別の場所）', () => {
  it('関係説明が存在し、「終えないとN2へ行けない」と読める表現がない', () => {
    for (const t of locales) {
      const s = t.hubRoles.labVsSorano;
      expect(s).toContain('ソラノ塔');
      expect(s).not.toMatch(/終えないと|完了しないと|必须先完成|才能进入/);
    }
    expect(aiCourseI18n.ja.hubRoles.labVsSorano).toContain('順序の条件はなく');
    expect(aiCourseI18n.zh.hubRoles.labVsSorano).toContain('没有先后要求');
  });
});
