// Local visual QA only. Synthetic profiles, no authentication or database writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AdvAdventureMap } from '../../src/components/ai-course/adventure/AdvAdventureMap';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import type { AdvAvatarStyle } from '../../src/lib/aiLesson/course/adventure/advAvatar';
const now = '2026-09-12T00:00:00.000Z';
const noop = () => {};
export const Preview = () => {
  const [lang, setLang] = useState<'ja' | 'zh'>('ja');
  const [goal, setGoal] = useState<'jlpt' | 'conversation'>('jlpt');
  const [avatarStyle, setAvatar] = useState<AdvAvatarStyle>('flag');
  const [complete, setComplete] = useState(false);
  const [action, setAction] = useState('');
  const route = generateRoute({ goalType: goal, targetJlpt: 'N5', knowledgeBand: 'n5', conversationBand: 'n5', diagnosis: null, nowISO: now });
  const profile = { ...defaultAdvProfile(now), enabled: true, goalType: goal, targetJlpt: 'N5' as const, dailyMinutes: 15 as const, route, avatarStyle };
  return <>
    <div className="mx-auto flex max-w-xl flex-wrap gap-2 bg-slate-100 p-3 text-sm">
      <span>Synthetic QA</span>
      <button onClick={() => setLang(lang === 'ja' ? 'zh' : 'ja')}>日本語 / 中文</button>
      <button onClick={() => setGoal(goal === 'jlpt' ? 'conversation' : 'jlpt')}>試験 / 会話</button>
      <button onClick={() => setComplete(!complete)}>全攻略切替</button>
      <span role="status">{action}</span>
    </div>
    <AdvAdventureMap lang={lang} profile={profile} route={route}
      mastered={new Set(complete ? route.stages.map(s => s.stageId) : [])} currentWeek={1} quest={null}
      onAvatarChange={setAvatar} onStartToday={() => setAction('today')} onBack={noop}
      onOpenReview={() => setAction('review')} reviewAvailable onStartConversation={() => setAction('conversation')}
      conversationAvailable onOpenMock={() => setAction('mock')} sheetsVisible={false} sheetCount={0}
      onOpenSheets={noop} interviewVisible={false} onOpenInterview={noop} />
  </>;
};
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
