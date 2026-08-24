-- 大会申込に流入元を残す（2026-08-24）
--
-- 無かったもの: **大会申込がどこから来たのか**。
-- 通常活動は activity_entries.source に、特典登録は subscribers.source に既に入っているのに、
-- いちばん売上に近い entries だけ持っていなかった。
-- そのため「LINEでシェアした回と、しなかった回で申込が変わったのか」を後から確認できない。
--
-- 値は 'line' | 'wechat' | 'web' の3値。既存2テーブルと**同じ粒度・同じ値**に揃える
-- （細かい campaign 単位は GA4 の UTM 側で見る。DBはチャネルだけ持つ）。
--
-- 設計上の約束:
-- - nullable・デフォルト無し。既存行は NULL のまま触らない。
--   NULL は「計測を入れる前の申込」であって「web直アクセス」ではない。この2つを混ぜない。
-- - CHECK 制約は**付けない**。想定外の値が来たときに INSERT ごと落ちると、
--   計測のために申し込みそのものを失う。値の正規化はクライアント側
--   （src/lib/analytics.ts の normalizeTrafficSource）で行い、DBは受け皿に徹する。

alter table public.entries
  add column if not exists source text;

comment on column public.entries.source is
  '申込時の流入元: line | wechat | web。NULL は計測導入（2026-08-24）より前の申込。'
  ' 値は src/lib/analytics.ts の normalizeTrafficSource が正規化する。';

-- 「LINE経由の申込は何件か」を数えるための索引。NULL（導入前の行）は入れない
create index if not exists idx_entries_source
  on public.entries (source)
  where source is not null;
