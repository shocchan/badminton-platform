// staging検証用: fixture learner に Adventure V2 プロファイルを投入する。
// onboarding を毎回手で通さずに Home 以降を実画面検証するため。
//
// **fixture（.invalidドメインの合成learner）専用**。実learnerには使わない。
// 実行: node scripts/ai-course/seed-adventure-profile.mjs <userId> [N2|N3]
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REF = 'jdkwijdphlkrcoiggfqw';
const ROOT = join(import.meta.dirname, '../..');
const userId = process.argv[2];
const level = (process.argv[3] ?? 'N2') === 'N3' ? 'N3' : 'N2';
if (!userId) { console.error('usage: node seed-adventure-profile.mjs <userId> [N2|N3]'); process.exit(2); }

// 資格情報は stage-verify-session.mjs と同じ経路で取得する（秘密値はログへ出さない）
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!API || !token) { console.error('refuse: missing env/token'); process.exit(2); }
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!keysRes.ok) { console.error(`api-keys ${keysRes.status}`); process.exit(1); }
const SERVICE = (await keysRes.json()).find((k) => k.name === 'service_role')?.api_key;
if (!SERVICE) { console.error('service_role key not found'); process.exit(1); }

const now = new Date().toISOString();
const stage = (stageId, kind, areaId, titleJa, titleZh, purposeJa, purposeZh, targets) => ({
  stageId, kind, areaId, titleJa, titleZh, purposeJa, purposeZh, targets,
  clearConditionJa: 'ランダム問題で80%以上を別の日に3回＋7日後の確認',
  clearConditionZh: '随机题80%以上×3天（不同日）＋7天后的复查',
});

const route = level === 'N2' ? {
  generatedAt: now,
  destinationJlpt: 'N2',
  destinationAreaId: 'area08-sorano',
  destinationLabelJa: 'N2・ソラノ塔', destinationLabelZh: 'N2・ソラノ塔｜天空塔',
  stages: [
    stage('stg-n3grammar', 'n3_grammar', 'area07-katachi', 'N3文法攻略', 'N3语法攻略',
      'N3文法76項目を体系的に攻略する', '系统攻克76项N3语法', { n3UnitIds: ['n3u-08-change'] }),
    stage('stg-n2gate', 'n2_gate', 'area07-katachi', 'N2の門', 'N2之门',
      'N3の総仕上げ（中ボス）を越えてN2圏へ', '通过N3中Boss・进入N2圈', { n3UnitIds: ['n3u-08-change'] }),
    stage('stg-n2grammar', 'n2_grammar', 'area08-sorano', 'N2語彙・文法', 'N2词汇语法',
      'ソラノ塔でN2文法178項目を攻略する', '在天空塔攻克178项N2语法', { n2Units: [1, 2, 3] }),
    stage('stg-n2reading', 'reading_listening', 'area08-sorano', '読解・会話理解', '阅读・会话理解',
      '長めの文と会話の流れを時間内に読み取る', '限时读懂长句与会话', { n2Units: [1] }),
    stage('stg-n2boss', 'mock_boss', 'area08-sorano', 'N2模擬ボス', 'N2模拟Boss',
      '本番形式・時間配分つきの総合演習', '完整模拟考・练习时间分配', { n2Units: [1] }),
  ],
  explanationJa: 'N2を攻略するために、まず不足しているN3基礎を短期間で補強します。目的地はN2のまま変わりません。',
  explanationZh: '为了攻略N2，先集中补足目前缺少的N3基础。目的地仍然是N2，不会改变。',
} : {
  generatedAt: now,
  destinationJlpt: 'N3',
  destinationAreaId: 'area07-katachi',
  destinationLabelJa: 'N3・カタチの遺跡', destinationLabelZh: 'N3・カタチの遺跡｜形之遗迹',
  stages: [
    stage('stg-foundation', 'foundation_camp', 'area01-minato', '基礎キャンプ', '基础营地',
      '土台のことばと文を短期間で固める', '短期夯实基础词汇和句型', { n3UnitIds: ['n3u-01-self'] }),
    stage('stg-n3grammar', 'n3_grammar', 'area07-katachi', 'N3文法攻略', 'N3语法攻略',
      'N3文法76項目を体系的に攻略する', '系统攻克76项N3语法', { n3UnitIds: ['n3u-08-change'] }),
    stage('stg-n3boss', 'mock_boss', 'area07-katachi', 'N3模擬ボス', 'N3模拟Boss',
      '本番形式・時間配分つきの総合演習', '完整模拟考・练习时间分配', { n3UnitIds: ['n3u-01-self'] }),
  ],
  explanationJa: 'N3を攻略するために、まず土台のことばを短期間で固めます。目的地はN3のまま変わりません。',
  explanationZh: '为了攻略N3，先短期夯实基础。目的地仍然是N3，不会改变。',
};

const skill = (score, conf, band, n) => ({
  currentScore: score, confidence: conf, evidenceCount: n, lastAssessedAt: now, band,
});

const adventureV2 = {
  schemaVersion: 1,
  enabled: true,
  goalType: 'jlpt',
  targetJlpt: level,
  examDateISO: '2026-12-06',
  weeklyDays: 5,
  dailyMinutes: 30,
  companionId: 'fukuro',
  diagnosis: {
    completedAt: now,
    knowledgeBand: level === 'N2' ? 'n3' : 'n4',
    conversationBand: 'needs_assessment',
    vocabularyGapIds: [], grammarGapIds: [],
    listeningConfidence: 'none', supportNeed: 'grammar',
    recommendedStartAreaId: 'area05-yukari',
    routeExplanationJa: route.explanationJa, routeExplanationZh: route.explanationZh,
    askedQuestionKeys: [], conversationSampled: false,
  },
  skills: {
    vocabulary: skill(60, 'medium', level === 'N2' ? 'n3' : 'n4', 12),
    grammar: skill(55, 'medium', level === 'N2' ? 'n3' : 'n4', 12),
    reading: skill(0, 'none', 'needs_assessment', 0),
    listening: skill(0, 'none', 'needs_assessment', 0),
    conversation: skill(0, 'none', 'needs_assessment', 0),
    practical: skill(0, 'none', 'needs_assessment', 0),
    consistency: skill(0, 'none', 'needs_assessment', 0),
  },
  route,
  mastery: {},
  lastQuest: null,
  todaySteps: null,
  questLog: [],
  humanLesson: { learnerTopics: ['長文読解の時間配分を相談したい'] },
  createdAt: now,
  updatedAt: now,
};

const res = await fetch(`${API}/rest/v1/ai_learners?user_id=eq.${userId}`, {
  method: 'PATCH',
  headers: {
    apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
  },
  body: JSON.stringify({
    settings: {
      zhSupport: 'grammar', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3,
      examDateISO: '2026-12-06', adventureV2,
    },
  }),
});
const body = await res.json();
if (!res.ok) { console.error(`patch failed ${res.status}`, JSON.stringify(body).slice(0, 200)); process.exit(1); }
if (!Array.isArray(body) || body.length === 0) { console.error('no learner row matched (is_test fixture?)'); process.exit(1); }
console.log(`seeded ${level} adventure profile for learner ${String(body[0].id).slice(0, 8)}***`);
