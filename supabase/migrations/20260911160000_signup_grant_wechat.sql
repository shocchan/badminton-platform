-- 招待からの登録で WeChat ID を預かる（2026-09-11 CEO決定）。
--
-- なぜ: 相手の多くは qq.com / 163.com で、メールが届かない・迷惑メールに入ることが普通に起きる。
-- WeChat ID があれば「届いていない？リンクを送るね」で救える。プレゼント企画・急ぎの連絡にも使う。
-- 名前は聞かない（学習画面の初回の質問で表示名を聞くため）。
--
-- 追加だけ。既存の行は書き換えない。
alter table public.ai_course_signup_grants
  add column if not exists wechat_id text;

comment on column public.ai_course_signup_grants.wechat_id is
  '登録時に本人が入れた WeChat ID（連絡・案内用。招待からの登録だけ入る）2026-09-11';

-- 管理者が見る: 招待からの登録の連絡先（メール・WeChat ID・経路）。非管理者には 0 行
create or replace function public.ai_admin_signup_contacts()
returns table(
  email text,
  wechat_id text,
  channel text,
  plan_id text,
  granted_at timestamptz,
  consumed_at timestamptz,
  is_test boolean
)
language sql
security definer
set search_path = public
as $$
  select g.email, g.wechat_id, g.channel, g.plan_id, g.granted_at, g.consumed_at, g.is_test
    from public.ai_course_signup_grants g
   where public.ai_is_admin()
   order by g.granted_at desc
$$;

revoke all on function public.ai_admin_signup_contacts() from public, anon;
grant execute on function public.ai_admin_signup_contacts() to authenticated;
