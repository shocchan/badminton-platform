-- Personal World V1: 承認済みアニメ風アバター専用の private Storage（§Avatar2）
-- 保存するのは完成PNGのみ（元写真は絶対に保存しない・運用手順書参照）。
-- 冪等: bucket は on conflict do nothing / policy は drop してから作成。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-course-avatars', 'ai-course-avatars', false, 2097152, array['image/png','image/webp'])
on conflict (id) do nothing;

-- 読み取り: 認証済みかつ自分のフォルダ（{auth.uid()}/...）のみ。
-- INSERT/UPDATE/DELETE のポリシーは作らない＝学習者は登録・削除不可（service roleのみが登録）。
drop policy if exists ai_course_avatars_select_own on storage.objects;
create policy ai_course_avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'ai-course-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
