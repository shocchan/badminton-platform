#!/usr/bin/env node
// 自律ループ: 次Phase依頼文のPolicy Validator（§52-§53）。
// 出力: {result: 'pass'|'warning'|'block', hits: [...]} をstdoutへJSONで出す。
// 注意: 文字列検出は一次スクリーニング。最終判断はClaude Codeの意味検証と併用する（デフォルト安全側）。
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: validate-autonomous-next-prompt.mjs <prompt.md>'); process.exit(2); }
const text = readFileSync(file, 'utf8');
const lines = text.split('\n');

// 禁止操作（block）。ペア: [検出regex, 説明]
const BLOCK = [
  [/main\s*(へ|に)?\s*(merge|マージ)|merge\s+(to|into)\s+main/i, 'mainへのmerge'],
  [/本番\s*(へ|に)?\s*(デプロイ|反映|公開)|production\s*deploy|deploy-production/i, '本番デプロイ'],
  [/(migration|マイグレーション).{0,24}(適用|apply|実行)/i, 'migration適用'],
  [/RLS.{0,20}(変更|適用|修正|update)|policy.{0,20}(変更|適用)/i, 'RLS/policy変更'],
  [/admin_overrides.{0,20}(変更|更新|修正)/i, 'admin_overrides変更'],
  [/(Secrets?|シークレット|API\s*キー|APIKEY|\.env).{0,20}(変更|作成|追加|更新|発行)/i, 'Secrets/APIキー/.env変更'],
  [/(認証|auth|OTP|ログインガード|login-?guard)\s*(を|の)?\s*(変更|修正|無効|更新)/i, '認証/OTP変更'],
  [/(Stripe|決済|料金|支払い|課金)\s*(を|の)?\s*(変更|導入|設定|有効)/i, 'Stripe/料金/決済変更'],
  [/learner\s*(を)?\s*(追加|作成)|受講生\s*(を)?\s*追加/i, 'learner追加'],
  [/(learner|受講生|学習者)\s*(データ|進捗).{0,20}(変更|更新|移行|削除)/i, 'learnerデータ変更'],
  [/Andy|アンディ/i, 'Andyさんへの接触'],
  [/current_week\s*(を)?\s*(更新|変更)/i, 'current_week更新'],
  [/masteryState\s*(を)?\s*(更新|変更)/i, 'masteryState更新'],
  [/XP\s*(を)?\s*(変更|付与|更新)/i, 'XP変更'],
  [/(会話履歴|conversation\s*history)\s*(を)?\s*(変更|削除|更新)/i, '会話履歴変更'],
  [/Realtime\s*prompt\s*(を)?\s*(全面)?\s*(変更|書き換え)/i, 'Realtime prompt変更'],
  [/Edge\s*Function\s*(を)?\s*(本番|production)?\s*(へ|に)?\s*(デプロイ|変更|適用)/i, 'Edge Function本番変更'],
  [/(有料|paid)\s*(サービス|API|プラン)\s*(を)?\s*(利用|導入|契約)/i, '外部有料サービス'],
  [/(approved|human_reviewed)\s*(へ|に)\s*(昇格|変更|確定)/i, 'レビュー状態の自動昇格'],
  [/(人間|CEO)\s*(判断|承認)\s*(を)?\s*(代行|自動|スキップ)/i, '人間判断の自動確定'],
  [/git\s+reset\s+--hard|force\s*push|push\s+--force/i, '不可逆Git操作'],
  [/(データ|テーブル|レコード)\s*(を)?\s*(全)?削除|DROP\s+TABLE|TRUNCATE/i, 'データ削除'],
  [/(共有|shared)\s*(Supabase|DB).{0,24}(変更|書き込み|適用)/i, '共有Supabase/DB変更'],
];
// 許可コンテキスト（同一行にあればblock→warningへ降格。§52「意味を読む」の一次近似）
const SOFTEN = /(draft|ドラフト|設計doc|設計ドキュメント|docs?のみ|docs?化|dry-?run|ドライラン|適用しない|適用禁止|提案しない|禁止|しないでください|stop_for_human|decision\s*packet|人間判断待ち|CEO(判断|承認)(待ち|が必要)|候補として|将来|レビュー用)/i;
// 注意語（warning）
const WARN = [
  [/migration|マイグレーション/i, 'migrationへの言及（draft/設計のみか確認）'],
  [/RLS/i, 'RLSへの言及（設計docsのみか確認）'],
  [/Supabase/i, 'Supabaseへの言及（読み取り/設計のみか確認）'],
  [/Edge\s*Function/i, 'Edge Functionへの言及（設計のみか確認）'],
  [/本番|production/i, '本番への言及（確認）'],
  [/公開/i, '公開への言及（範囲変更でないか確認）'],
];

const hits = [];
lines.forEach((line, i) => {
  for (const [re, label] of BLOCK) {
    if (re.test(line)) {
      const softened = SOFTEN.test(line);
      hits.push({ line: i + 1, label, level: softened ? 'warning' : 'block', text: line.trim().slice(0, 160), softened });
    }
  }
  for (const [re, label] of WARN) {
    if (re.test(line) && !BLOCK.some(([bre]) => bre.test(line))) {
      hits.push({ line: i + 1, label, level: 'warning', text: line.trim().slice(0, 160) });
    }
  }
});

const result = hits.some((h) => h.level === 'block') ? 'block' : hits.length > 0 ? 'warning' : 'pass';
console.log(JSON.stringify({ result, file, hits }, null, 1));
process.exit(result === 'block' ? 1 : 0);
