/**
 * 学習コード（2026-09-09 P0-2）。
 *
 * 学習者に渡すのは「コード1つ」だけ。IDもパスワードも覚えさせない。
 * ここは**形と表示のきまり**だけを持つ純関数。照合はサーバー（ai-course-code-login）が行う。
 *
 * 【形】
 *   30文字集合（0/O/1/I/L/U を使わない）× 12桁 ＝ 約59bit。
 *   表示は 4桁ずつ区切って `K7PX-29QM-4T6B`。入力は区切り無し・小文字でも通す。
 *
 * 【やらないこと】
 * - 平文をブラウザに保存しない（URLで来たコードもセッション成立後は捨てる）
 * - コードを計測・ログへ送らない（`trackCourse` に渡さない）
 */

/** 紛らわしい文字を除いた30文字。サーバー側 ai_generate_learning_code と同じ並び */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 12;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** 入力の正規化。大文字化して英数字以外を落とす（ハイフン・空白・小文字を許す） */
export const normalizeLearningCode = (raw: string): string =>
  (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 発行済みのコードとして成立する形か */
export const isValidLearningCode = (raw: string): boolean =>
  CODE_RE.test(normalizeLearningCode(raw));

/**
 * 表示用に4桁ずつ区切る。
 * 12桁に満たない入力（打っている途中）でも、そこまでを区切って返す
 * ＝入力欄でそのまま使える。
 */
export const formatLearningCode = (raw: string): string => {
  const n = normalizeLearningCode(raw).slice(0, CODE_LENGTH);
  return (n.match(/.{1,4}/g) ?? []).join('-');
};

/**
 * 個人専用URL。WeChatで送るのはこれ1本。
 * 生徒向けの正準ドメインは study.kawabado.com（WeChatが *.pages.dev を弾くため）。
 */
export const learningCodeUrl = (
  code: string,
  lang: 'ja' | 'zh' = 'zh',
  origin = 'https://study.kawabado.com',
): string => `${origin}/${lang}/learn/${formatLearningCode(code)}`;

/**
 * WeChatにそのまま貼れる案内文。
 * 「押すだけ」と「なくしたら言って」の2つだけを書く。手順を増やさない。
 */
export const learningCodeMessage = (code: string, lang: 'ja' | 'zh' = 'zh'): string => {
  const url = learningCodeUrl(code, lang);
  return lang === 'zh'
    ? `你的学习入口（点一下就能开始，不需要密码）：\n${url}\n\n换手机或打不开的时候，也可以在登录页面输入这个学习码：\n${formatLearningCode(code)}\n\n弄丢了就告诉我，我马上给你发新的。`
    : `学習の入口です（押すだけで始められます。パスワードは要りません）：\n${url}\n\n機種変更などで開けないときは、ログイン画面でこの学習コードを入れてください：\n${formatLearningCode(code)}\n\nなくしたら言ってください。すぐに新しいものをお渡しします。`;
};
