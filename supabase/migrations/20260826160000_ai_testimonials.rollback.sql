-- 20260826160000_ai_testimonials.sql の取り消し。
--
-- ⚠️ drop table すると、本人が書いた感想と**掲載の許諾記録**が消える。
-- 許諾は「本人がいつ何に同意したか」の証跡なので、消すのは最後の手段。
-- 「集めるのをやめたい」だけなら、関数の revoke だけにして表は残すこと。

revoke all on function public.ai_approve_testimonial(uuid, boolean) from authenticated;
drop function if exists public.ai_approve_testimonial(uuid, boolean);

revoke all on function public.ai_submit_testimonial(text, boolean, text, text, text) from authenticated;
drop function if exists public.ai_submit_testimonial(text, boolean, text, text, text);

drop policy if exists ai_testimonials_admin_write on public.ai_testimonials;
drop policy if exists ai_testimonials_admin_read on public.ai_testimonials;
drop policy if exists ai_testimonials_own_read on public.ai_testimonials;

-- 証跡ごと消してよいと判断したときだけ、次の行のコメントを外す:
-- drop table if exists public.ai_testimonials;
