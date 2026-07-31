// 文法SVG図解（Phase 2C+ §17・original_svg・外部画像不要）。
// 翻訳テキストはSVG内へ固定せずReactテキストで描画。装飾より意味の分かりやすさを優先。
import type { AiCourseDict } from '../../../../locales/aiCourse';

const C = { main: '#4f46e5', sub: '#94a3b8', accent: '#0d9488', soft: '#e0e7ff', warn: '#d97706' };

/** に/へ: 現在地→目的地の移動 */
export const NiEDirectionDiagram = ({ t }: { t: AiCourseDict }) => (
  <figure className="my-2">
    <svg viewBox="0 0 320 90" className="w-full max-w-xs" role="img" aria-label={t.vocab.diagrams.niE}>
      <rect x="10" y="30" width="70" height="40" rx="8" fill={C.soft} />
      <rect x="240" y="30" width="70" height="40" rx="8" fill={C.main} opacity="0.85" />
      <path d="M92 50 H 225" stroke={C.main} strokeWidth="3" strokeDasharray="6 4" />
      <path d="M225 50 l -10 -6 v 12 z" fill={C.main} />
      <circle cx="45" cy="50" r="8" fill={C.sub} />
    </svg>
    <figcaption className="text-[11px] text-gray-600">{t.vocab.diagrams.niECaption}</figcaption>
  </figure>
);

/** で: 場所の枠の中で動作 */
export const DePlaceDiagram = ({ t }: { t: AiCourseDict }) => (
  <figure className="my-2">
    <svg viewBox="0 0 320 100" className="w-full max-w-xs" role="img" aria-label={t.vocab.diagrams.de}>
      <rect x="60" y="10" width="200" height="80" rx="10" fill="none" stroke={C.main} strokeWidth="3" />
      <circle cx="140" cy="55" r="10" fill={C.accent} />
      <path d="M155 55 a 18 18 0 0 1 24 0" stroke={C.accent} strokeWidth="3" fill="none" />
      <circle cx="196" cy="48" r="5" fill={C.accent} />
    </svg>
    <figcaption className="text-[11px] text-gray-600">{t.vocab.diagrams.deCaption}</figcaption>
  </figure>
);

/** を: 動作→対象 */
export const WoObjectDiagram = ({ t }: { t: AiCourseDict }) => (
  <figure className="my-2">
    <svg viewBox="0 0 320 80" className="w-full max-w-xs" role="img" aria-label={t.vocab.diagrams.wo}>
      <circle cx="40" cy="40" r="14" fill={C.main} />
      <path d="M62 40 H 210" stroke={C.accent} strokeWidth="3" />
      <path d="M210 40 l -10 -6 v 12 z" fill={C.accent} />
      <rect x="225" y="20" width="60" height="40" rx="8" fill={C.soft} stroke={C.accent} strokeWidth="2" />
    </svg>
    <figcaption className="text-[11px] text-gray-600">{t.vocab.diagrams.woCaption}</figcaption>
  </figure>
);

/** ています: 過去から現在まで続く時間軸 */
export const TeimasuTimelineDiagram = ({ t }: { t: AiCourseDict }) => (
  <figure className="my-2">
    <svg viewBox="0 0 320 80" className="w-full max-w-xs" role="img" aria-label={t.vocab.diagrams.teimasu}>
      <line x1="20" y1="55" x2="300" y2="55" stroke={C.sub} strokeWidth="2" />
      <circle cx="70" cy="55" r="6" fill={C.main} />
      <rect x="70" y="30" width="170" height="14" rx="7" fill={C.main} opacity="0.7" />
      <line x1="240" y1="20" x2="240" y2="70" stroke={C.warn} strokeWidth="2" strokeDasharray="4 3" />
      <path d="M240 37 l 30 0" stroke={C.main} strokeWidth="3" strokeDasharray="2 4" />
    </svg>
    <figcaption className="text-[11px] text-gray-600">{t.vocab.diagrams.teimasuCaption}</figcaption>
  </figure>
);

/** ない形: 語尾ブロックの変化 */
export const NaiFormDiagram = ({ t }: { t: AiCourseDict }) => (
  <figure className="my-2">
    <svg viewBox="0 0 320 90" className="w-full max-w-xs" role="img" aria-label={t.vocab.diagrams.nai}>
      <rect x="20" y="15" width="90" height="26" rx="6" fill={C.soft} />
      <rect x="114" y="15" width="40" height="26" rx="6" fill={C.main} />
      <path d="M90 52 l 0 14 l 8 -7 z" transform="rotate(90 94 59)" fill={C.sub} />
      <rect x="20" y="60" width="90" height="26" rx="6" fill={C.soft} />
      <rect x="114" y="60" width="40" height="26" rx="6" fill={C.warn} />
      <rect x="158" y="60" width="52" height="26" rx="6" fill={C.accent} />
    </svg>
    <figcaption className="text-[11px] text-gray-600">{t.vocab.diagrams.naiCaption}</figcaption>
  </figure>
);

/** 頻度メーター（副詞用・§11） */
export const FrequencyScale = ({ t, level }: { t: AiCourseDict; level: 0 | 1 | 2 | 3 | 4 }) => (
  <div className="flex items-center gap-1" role="img" aria-label={`${t.vocab.diagrams.frequency}: ${level}/4`}>
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className={`inline-block w-6 h-2 rounded-full ${i <= level ? 'bg-indigo-500' : 'bg-gray-200'}`} />
    ))}
  </div>
);
