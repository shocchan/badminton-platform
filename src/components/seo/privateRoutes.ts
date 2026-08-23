// 検索結果に出してはいけないURLの一覧（1か所にまとめる）。
//
// 【なぜ1か所か】
// これまで robots.txt は `Disallow: /admin` だけで、実URLが `/ja/admin` に
// 変わってからは何も守っていなかった。管理画面・ログイン・マイページ・
// サブグループの管理画面がどれも「インデックスしてよい」状態のまま置かれていた。
// 判定を3か所（robots.txt・Worker の X-Robots-Tag・画面の robots メタ）で
// 別々に書くとまた必ずズレるので、パターンをここに集めてテストで突き合わせる。
//
// 対象:
//   /:lang/admin, /:lang/mypage, /:lang/ai-course/admin
//   /:lang/login, /:lang/signup, /:lang/auth-landing, /:lang/password-reset*
//   /cancel（申込キャンセル）, /internal/*（社内コンソール）
//   /chaoxianzu/**, /assistant/**（限定公開のサブグループ）
export const PRIVATE_PATH_PATTERNS: RegExp[] = [
  /^\/(ja|zh)\/admin(\/|$)/,
  /^\/(ja|zh)\/mypage(\/|$)/,
  /^\/(ja|zh)\/ai-course\/admin(\/|$)/,
  /^\/(ja|zh)\/ai-course\/login(\/|$)/,
  /^\/(ja|zh)\/ai-course\/purchase(\/|$)/,
  /^\/(ja|zh)\/login(\/|$)/,
  /^\/(ja|zh)\/signup(\/|$)/,
  /^\/(ja|zh)\/auth-landing(\/|$)/,
  /^\/(ja|zh)\/password-reset/,
  /^\/(ja|zh)\/ai-lesson-demo(\/|$)/,
  /^\/(ja|zh)\/tactics-board(\/|$)/,
  /^\/cancel(\/|$)/,
  /^\/internal(\/|$)/,
  /^\/chaoxianzu(\/|$)/,
  /^\/assistant(\/|$)/,
  /^\/admin(\/|$)/,
];

export const isPrivatePath = (pathname: string) =>
  PRIVATE_PATH_PATTERNS.some((re) => re.test(pathname));
