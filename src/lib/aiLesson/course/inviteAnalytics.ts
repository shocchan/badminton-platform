import { supabase } from '../../../services/supabaseClient';
import { anonId, captureTouch } from './attribution';
import { isProdHost, isTrackingOptedOut } from '../../analytics';

export interface InviteVisit { anonId: string; sessionId: string; landingPage: string; isTest: boolean }
export function inviteVisit(code: string): InviteVisit | null {
  try {
    if (isTrackingOptedOut() || !code) return null;
    const path = window.location.pathname;
    if (!/^\/(zh|ja)\/invite$/.test(path)) return null;
    const id = anonId();
    if (!id) return null;
    captureTouch(); // Reuse the existing first/last touch and UTM storage.
    const visit = { anonId: id, sessionId: crypto.randomUUID(), landingPage: path,
      isTest: !isProdHost() || new URLSearchParams(window.location.search).get('invite_test') === '1' };
    return visit;
  } catch { return null; }
}
const eventIds = new Map<string, string>();
export function trackInvite(code: string, kind: 'invite_page_view' | 'invite_registration_started', visit: InviteVisit | null): void {
  try {
    if (isTrackingOptedOut()) return;
    if (!visit) return;
    const key = `${visit.sessionId}:${kind}`;
    if (eventIds.has(key)) return;
    const eventId = crypto.randomUUID();
    eventIds.set(key,eventId);
    void supabase.rpc('ai_record_invite_event', {
      p_anon_id: visit.anonId, p_session_id: visit.sessionId, p_event_id: eventId,
      p_code: code, p_kind: kind, p_landing_page: visit.landingPage, p_is_test: visit.isTest,
    }).then(({ error }) => { if (error) eventIds.delete(key); }, () => { eventIds.delete(key); });
  } catch { /* Analytics must not interrupt registration. */ }
}
