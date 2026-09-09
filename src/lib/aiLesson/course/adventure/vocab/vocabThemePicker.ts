/**
 * 学習テーマを自分で選ぶ（2026-09-09 CEO要望）。
 *
 *   「学習テーマ一覧を出して、選択して学べるようにする仕組みはどうかな？
 *     N1の人はN1からN5のテーマ全部が選択できて、その中から選べる。
 *     N3ならN3〜N5までのテーマの中から選べるとかさ」
 *
 * 【毎日の出題との役割分担】
 *   毎日の「新しいことば」は**その人の級だけ**を出す（strictDeclaredLevelOnly）。
 *   こちらは**自分で取りに行く棚**なので、自分の級から下は全部開ける。
 *   N1を持っている人が「病院で使う言葉（N4）」をやりたい日があるのは自然で、
 *   その寄り道を塞がない。自動は級に忠実、手動は自由、という分け方。
 *
 * 【なぜ「級」で並べるか（分野で並べていない理由）】
 *   語彙データが確実に持っているのは**級**だけで、分野（買い物・仕事…）のタグは無い。
 *   分野で並べると、N3にだけ12個の単元があってN1とN2には無い、という
 *   歪んだ一覧になる。**無いものを在るように見せない**ので、まず級で出す。
 *   分野のタグは教材側の作業として別に積む。
 */

import type { VocabScopeLevel } from './vocabQuestions';

/**
 * テーマの級。`vocabQuestions` の型をそのまま再輸出する。
 * AdvShell は**出題プールの入った重いモジュールを静的importできない**
 * （初回転送に載せない・vocabSubset.test.ts のガード）ので、型はここ経由で渡す。
 */
export type { VocabScopeLevel };

const LOW_TO_HIGH: VocabScopeLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export interface VocabTheme {
  level: VocabScopeLevel;
  labelJa: string;
  labelZh: string;
  /** 何のことばか（級の説明。売り文句にしない） */
  descJa: string;
  descZh: string;
}

const THEME_TEXT: Record<VocabScopeLevel, Omit<VocabTheme, 'level'>> = {
  N5: {
    labelJa: 'N5のことば', labelZh: 'N5的词汇',
    descJa: 'あいさつ・数・毎日のもの。いちばん基礎のことば',
    descZh: '问候・数字・日常事物。最基础的词汇',
  },
  N4: {
    labelJa: 'N4のことば', labelZh: 'N4的词汇',
    descJa: '暮らしの手続き・移動・買い物で使うことば',
    descZh: '生活手续・出行・购物时用的词汇',
  },
  N3: {
    labelJa: 'N3のことば', labelZh: 'N3的词汇',
    descJa: '気持ち・人間関係・仕事の場面で使うことば',
    descZh: '情绪・人际关系・工作场景中用的词汇',
  },
  N2: {
    labelJa: 'N2のことば', labelZh: 'N2的词汇',
    descJa: '新聞・説明・意見を述べるときのことば',
    descZh: '报纸・说明・表达意见时用的词汇',
  },
  N1: {
    labelJa: 'N1のことば', labelZh: 'N1的词汇',
    descJa: '報道・論説・かたい文章で出会うことば',
    descZh: '报道・论述・正式文章中会遇到的词汇',
  },
};

/**
 * その人が選べるテーマ（**自分の級から下すべて**）。上から順に自分の級 → 基礎へ。
 * 級が決まらない人には何も出さない（当てずっぽうの棚を作らない）。
 */
export const themesAtOrBelow = (level: VocabScopeLevel | null | undefined): VocabTheme[] => {
  if (!level) return [];
  const top = LOW_TO_HIGH.indexOf(level);
  if (top < 0) return [];
  return LOW_TO_HIGH.slice(0, top + 1)
    .reverse()
    .map((lv) => ({ level: lv, ...THEME_TEXT[lv] }));
};

/** 表示用（言語ぶんを1か所で解決する） */
export const themeView = (t: VocabTheme, lang: 'ja' | 'zh') => ({
  level: t.level,
  label: lang === 'zh' ? t.labelZh : t.labelJa,
  desc: lang === 'zh' ? t.descZh : t.descJa,
});
