-- increment_activity_view と同じバグ（20260712_fix_increment_activity_view_security_definer.sql 参照）。
-- SECURITY INVOKERのままだとanon訪問者のUPDATEがblog_postsのRLS（UPDATEはis_admin()のみ）に阻まれ、
-- エラーも出ず0件更新で閲覧数が増えなかった。
CREATE OR REPLACE FUNCTION public.increment_blog_view(blog_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE blog_posts SET view_count = view_count + 1 WHERE id = blog_id;
END;
$function$;
