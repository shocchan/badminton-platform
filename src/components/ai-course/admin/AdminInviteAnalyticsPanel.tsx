import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../services/supabaseClient';
interface Row { code: string; label: string; measurement_started_at: string | null; page_views: number; unique_visitors: number; registration_started: number; registration_completed: number; tracked_converted_visitors: number; latest_access: string | null }
export function AdminInviteAnalyticsPanel() {
 const [since,setSince]=useState('2026-09-13T19:00');
 const [rows,setRows]=useState<Row[]>([]);
 const [error,setError]=useState('');
 const [checked,setChecked]=useState('');
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try {
   const at=new Date(`${since}:00+09:00`);
   if(!Number.isFinite(at.getTime())) throw new Error('開始日時を入力してください。');
   const {data,error:e}=await supabase.rpc('ai_admin_invite_analytics',{p_since:at.toISOString()});
   if(e || !data?.rows) throw new Error('集計を取得できませんでした。再読み込みしてください。');
   setRows(data.rows as Row[]);setChecked(data.checked_at);
  } catch(e) {setError(e instanceof Error?e.message:'取得に失敗しました。');}
  finally {setBusy(false);}
 },[since]);
 useEffect(()=>{void load();},[load]);
 const date=(v:string|null)=>v?new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未計測';
 return <section className="bg-white border border-gray-200 rounded-xl p-4" data-testid="admin-invite-analytics">
  <h2 className="font-bold">招待リンク別の閲覧・登録</h2>
  <div className="flex flex-wrap gap-3 my-3 items-center"><label>集計開始（日本時間） <input className="border rounded p-1" type="datetime-local" value={since} onChange={e=>setSince(e.target.value)} /></label><button className="border rounded px-3 py-2" disabled={busy} onClick={()=>void load()}>{busy?'取得中…':'更新'}</button></div>
  <p className="text-xs text-gray-600">テスト除外。登録完了は受講権発行＋案内メール送信の記録。閲覧・登録開始は計測開始以降のみ。CVRは観測できた訪問者のうち登録完了した割合です。異なる端末は別訪問者として数えます。</p>
  {error?<p role="alert" className="text-red-700">{error}</p>:<div className="overflow-x-auto"><table className="w-full text-sm my-3"><thead><tr>{['招待リンク','閲覧数','ユニーク','登録開始','登録完了','CVR','最終アクセス'].map(x=><th key={x} className="text-left p-2 whitespace-nowrap">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.code}><td className="p-2"><b>{r.label}</b><br/><code>{r.code}</code></td><td className="p-2">{r.measurement_started_at?r.page_views:'未計測'}</td><td className="p-2">{r.measurement_started_at?r.unique_visitors:'未計測'}</td><td className="p-2">{r.measurement_started_at?r.registration_started:'未計測'}</td><td className="p-2">{r.registration_completed}</td><td className="p-2">{r.unique_visitors?`${(100*r.tracked_converted_visitors/r.unique_visitors).toFixed(1)}%`:'—'}</td><td className="p-2 whitespace-nowrap">{date(r.latest_access)}</td></tr>)}</tbody></table></div>}
  <p className="text-xs text-gray-500">閲覧計測の初回記録: {date(rows[0]?.measurement_started_at??null)} ／ 更新: {date(checked||null)}。開始前の閲覧数は復元していません。</p>
 </section>;
}
