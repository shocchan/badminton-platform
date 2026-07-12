-- increment_activity_view はSECURITY INVOKERのままだと、匿名(anon)訪問者がactivities.view_countを
-- UPDATEしようとしてもRLS（UPDATEはauthenticated+is_admin()のみ許可）に阻まれて0件更新のまま
-- エラーも出ず黙って失敗していた。SECURITY DEFINERにしてRLSをバイパスし、誰でもカウントできるようにする。
CREATE OR REPLACE FUNCTION public.increment_activity_view(activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE activities SET view_count = view_count + 1 WHERE id = activity_id;
END;
$function$;
