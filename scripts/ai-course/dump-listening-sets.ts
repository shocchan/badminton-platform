// 聴解セットをJSONへ落とす（音声生成scriptが素のnodeで読むため）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/dump-listening-sets.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { ALL_LISTENING_SETS } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';

mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
writeFileSync(
  'docs/ai-course/adventure-v2/generated/listening-sets.json',
  JSON.stringify(ALL_LISTENING_SETS.map((s) => ({
    setId: s.setId, sourceLevel: s.sourceLevel, listeningType: s.listeningType,
    transcriptJa: s.transcriptJa,
  })), null, 1),
);
console.log(`dumped ${ALL_LISTENING_SETS.length} listening sets`);
