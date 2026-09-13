-- Extend the existing funnel; no duplicate analytics store or learner rewrites.
begin;
alter table public.ai_funnel_events add column if not exists invite_code text;
alter table public.ai_funnel_events add column if not exists landing_page text;
alter table public.ai_funnel_events add column if not exists session_id uuid;
alter table public.ai_funnel_events add column if not exists event_id uuid;
create unique index if not exists ai_funnel_invite_event_unique on public.ai_funnel_events(event_id) where event_id is not null;
create unique index if not exists ai_funnel_invite_completed_unique on public.ai_funnel_events(user_id,invite_code) where kind='invite_registration_completed';
create index if not exists ai_funnel_invite_lookup on public.ai_funnel_events(invite_code,occurred_at) where invite_code is not null;

create or replace function public.ai_record_invite_event(p_anon_id text,p_session_id uuid,p_event_id uuid,p_code text,p_kind text,p_landing_page text,p_is_test boolean default false,p_user_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_test boolean; v_uid uuid; begin
 if p_anon_id is null or p_anon_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_session_id is null or p_event_id is null then return; end if;
 if p_landing_page not in ('/zh/invite','/ja/invite') or p_landing_page is null then return; end if;
 select is_test into v_test from ai_course_invites where code=p_code;
 if not found then return; end if;
 if p_kind='invite_registration_completed' then
   if coalesce(auth.role(),'') <> 'service_role' then return; end if;
   if not exists(select 1 from ai_course_access a join ai_course_mail_log m on m.user_id=a.user_id and m.kind='invite_credentials' where a.user_id=p_user_id and a.invite_code=p_code) then return; end if;
   v_uid:=p_user_id;
 elsif p_kind not in ('invite_page_view','invite_registration_started') or p_kind is null then return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('invite:'||p_anon_id,0));
 if (select count(*) from ai_funnel_events where anon_id=p_anon_id and occurred_on=(now() at time zone 'Asia/Tokyo')::date)>=300 then return; end if;
 insert into ai_funnel_events(anon_id,user_id,kind,locale,is_test,invite_code,landing_page,session_id,event_id)
 values(p_anon_id,v_uid,p_kind,split_part(p_landing_page,'/',2),coalesce(v_test,false) or coalesce(p_is_test,false) or exists(select 1 from ai_funnel_events where session_id=p_session_id and invite_code=p_code and is_test),p_code,p_landing_page,p_session_id,p_event_id)
 on conflict do nothing;
end $$;
revoke all on function public.ai_record_invite_event(text,uuid,uuid,text,text,text,boolean,uuid) from public;
grant execute on function public.ai_record_invite_event(text,uuid,uuid,text,text,text,boolean,uuid) to anon,authenticated,service_role;

-- Report timestamps are event time; CVR uses the observed visitor cohort only.
create or replace function public.ai_admin_invite_analytics(p_since timestamptz default '2026-09-13T10:00:00Z')
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; begin
 if not public.ai_is_admin() and coalesce(auth.role(),'') <> 'service_role' then raise exception 'admin only' using errcode='42501'; end if;
 select jsonb_agg(to_jsonb(r)) into result from (
 select i.code,i.label,
 (select min(occurred_at) from ai_funnel_events where kind='invite_page_view' and not is_test) as measurement_started_at,
 (select count(*) from ai_funnel_events e where e.invite_code=i.code and not e.is_test and e.kind='invite_page_view' and e.occurred_at>=p_since) as page_views,
 (select count(distinct anon_id) from ai_funnel_events e where e.invite_code=i.code and not e.is_test and e.kind='invite_page_view' and e.occurred_at>=p_since) as unique_visitors,
 (select count(distinct anon_id) from ai_funnel_events e where e.invite_code=i.code and not e.is_test and e.kind='invite_registration_started' and e.occurred_at>=p_since) as registration_started,
 (select count(distinct a.user_id) from ai_course_access a join ai_course_mail_log m on m.user_id=a.user_id and m.kind='invite_credentials' left join ai_learners l on l.user_id=a.user_id where a.invite_code=i.code and not coalesce(l.is_test,false) and m.sent_at>=p_since) as registration_completed,
 (select count(distinct e.anon_id) from ai_funnel_events e where e.invite_code=i.code and not e.is_test and e.kind='invite_registration_completed' and exists(select 1 from ai_funnel_events v where v.invite_code=e.invite_code and v.anon_id=e.anon_id and not v.is_test and v.kind='invite_page_view' and v.occurred_at>=p_since and v.occurred_at<=e.occurred_at)) as tracked_converted_visitors,
 (select max(occurred_at) from ai_funnel_events e where e.invite_code=i.code and not e.is_test and e.kind='invite_page_view' and e.occurred_at>=p_since) as latest_access
 from ai_course_invites i where not i.is_test order by i.created_at desc
 ) r;
 return jsonb_build_object('rows',coalesce(result,'[]'::jsonb),'checked_at',now(),'since',p_since);
end $$;
revoke all on function public.ai_admin_invite_analytics(timestamptz) from public;
grant execute on function public.ai_admin_invite_analytics(timestamptz) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
