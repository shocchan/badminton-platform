import { Helmet } from 'react-helmet-async';

/**
 * 検索結果に出さないページ用の共通メタ。
 *
 * 【なぜ要るか】
 * ログイン・登録・パスワード再設定・申込キャンセルなどは、検索から来ても
 * 意味がない（どころか「ログイン」で自サイトのログイン画面が上位に出ると
 * 本来出したいページの枠を食う）。これらのページには robots メタが無く、
 * index.html のフォールバックtitle「川口・蕨バドミントン交流会」のまま
 * インデックス候補になっていた（2026-08-23）。
 *
 * 注意: これはJS実行後に入るタグなので、確実に効かせたいものは
 * Worker側（scripts/generate-worker.mjs）の X-Robots-Tag も併用している。
 */
export const NoIndex = ({ title }: { title: string }) => (
  <Helmet>
    <title>{`${title} | 川口・蕨バドミントン交流会`}</title>
    <meta name="robots" content="noindex,nofollow" />
  </Helmet>
);
