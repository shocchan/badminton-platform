// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
const opted=vi.hoisted(()=>vi.fn(()=>false));
vi.mock('../../../services/supabaseClient',()=>({supabase:{rpc}}));
vi.mock('./attribution',()=>({anonId:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',captureTouch:vi.fn()}));
vi.mock('../../analytics',()=>({isProdHost:()=>false,isTrackingOptedOut:opted}));
import {inviteVisit,trackInvite} from './inviteAnalytics';
beforeEach(()=>{rpc.mockReset();rpc.mockResolvedValue({error:null});opted.mockReturnValue(false);window.history.replaceState({},'', '/zh/invite?invite=C9FDDVXP');});
describe('invite telemetry',()=>{
 it('counts reload/navigation as a new view but reuses the existing visitor',()=>{
  const a=inviteVisit('C9FDDVXP')!,b=inviteVisit('C9FDDVXP')!;
  expect(a.anonId).toBe(b.anonId);expect(a.sessionId).not.toBe(b.sessionId);
 });
 it('deduplicates StrictMode and duplicate submit within a visit',()=>{
  const a=inviteVisit('C9FDDVXP');trackInvite('C9FDDVXP','invite_page_view',a);trackInvite('C9FDDVXP','invite_page_view',a);
  trackInvite('C9FDDVXP','invite_registration_started',a);trackInvite('C9FDDVXP','invite_registration_started',a);
  expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[0][1].p_is_test).toBe(true);
 });
 it('respects opt-out and never includes the full URL',()=>{
  opted.mockReturnValue(true);expect(inviteVisit('C9FDDVXP')).toBeNull();
  opted.mockReturnValue(false);const a=inviteVisit('C9FDDVXP');trackInvite('C9FDDVXP','invite_page_view',a);
  expect(rpc.mock.calls[0][1].p_landing_page).toBe('/zh/invite');
 });
 it('analytics failures do not throw',async()=>{
  rpc.mockRejectedValue(new Error('offline'));trackInvite('C9FDDVXP','invite_page_view',inviteVisit('C9FDDVXP'));
  await Promise.resolve();
 });
});
