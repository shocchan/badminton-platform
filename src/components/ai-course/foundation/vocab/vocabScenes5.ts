// Phase B-4 バッチ5: N3の抽象名詞と副詞・接続表現。
//
// 抽象語は「意味の分からない図形」になりやすいので、必ず場面に落として描く。
// 例: 理由＝結果を指しながら元をたどる／つまり＝広げた説明が一つにまとまる。
import type { VocabSceneSpec } from './VocabScene';

const s = (spec: VocabSceneSpec): VocabSceneSpec => spec;

export const SCENES_BATCH5: VocabSceneSpec[] = [
  // ── 気持ち / 気分（中国語ではどちらも「心情」になりやすい組）──
  s({ itemId: 'fi-kimochi', place: 'plain',
    figures: [{ x: 40, dir: 'right', pose: 'stand', mood: 'happy' }],
    props: [{ kind: 'heart', x: 40, y: 34, scale: 1.3 }],
    arrows: [{ x: 76, y: 46, dir: 'right', length: 20 }],
    altJa: '人の胸の中の思いが相手のほうへ向かっている図', altZh: '人心中的情意朝对方传去的图' }),
  s({ itemId: 'fi-kibun', place: 'room',
    figures: [{ x: 42, dir: 'right', pose: 'slump', mood: 'tired' }],
    props: [{ kind: 'chartDown', x: 86, y: 48, scale: 1.2 }],
    altJa: 'その日の調子が下がっていることを表す図', altZh: '表示当天状态在下降的图' }),

  // ── 理由 / 方法 / 問題 ──
  s({ itemId: 'fi-riyuu', place: 'office',
    figures: [{ x: 32, dir: 'right', pose: 'point' }],
    props: [{ kind: 'cross', x: 96, y: 44, scale: 1.1 }, { kind: 'question', x: 64, y: 44, scale: 1.2 }],
    arrows: [{ x: 80, y: 62, dir: 'left', length: 20 }],
    altJa: '起きた結果から、そのもとをさかのぼって指す図', altZh: '从已发生的结果往回追溯根源的图' }),
  s({ itemId: 'fi-houhou', place: 'plain',
    figures: [{ x: 24, dir: 'right', pose: 'point' }],
    props: [{ kind: 'freePath', x: 62, y: 40, scale: 1.5 }, { kind: 'freePath', x: 62, y: 64, scale: 1.5 }, { kind: 'tapeGoal', x: 106, y: 72, scale: 0.8 }],
    altJa: '同じ目的地へ行く道すじが何本かある図', altZh: '通往同一目的地有好几条路径的图' }),
  s({ itemId: 'fi-mondai', place: 'school',
    figures: [{ x: 36, dir: 'right', pose: 'think', mood: 'stern' }],
    props: [{ kind: 'note', x: 70, y: 58, scale: 1.4 }, { kind: 'question', x: 98, y: 34, scale: 1.1 }],
    altJa: '解かなければならない問いが紙に出ている場面', altZh: '纸上出现需要解答的问题的场景' }),

  // ── 意見 / 情報 / 関係 ──
  s({ itemId: 'fi-iken', place: 'office',
    figures: [{ x: 32, dir: 'right', pose: 'talk' }, { x: 92, dir: 'left', pose: 'talk', color: '#f2a08c' }],
    props: [{ kind: 'speechPair', x: 62, y: 36, scale: 1.3 }],
    altJa: '二人が別々の中身の吹き出しを出し合っている場面', altZh: '两个人各自提出内容不同的意见气泡的场景' }),
  s({ itemId: 'fi-jouhou', place: 'street',
    figures: [{ x: 30, dir: 'right', pose: 'hold' }],
    props: [{ kind: 'screen', x: 74, y: 50, scale: 1.3 }, { kind: 'note', x: 100, y: 62, scale: 0.9 }],
    arrows: [{ x: 52, y: 40, dir: 'right', length: 16 }],
    altJa: '画面や紙から中身が人のほうへ集まってくる図', altZh: '内容从屏幕和纸张汇集到人这边的图' }),
  s({ itemId: 'fi-kankei', place: 'plain',
    figures: [{ x: 36, dir: 'right', pose: 'stand' }, { x: 84, dir: 'left', pose: 'stand', color: '#f2a08c' }],
    props: [{ kind: 'handshake', x: 60, y: 44, scale: 1.3 }],
    altJa: '二人の間が線でつながっていることを表す図', altZh: '表示两个人之间由线连接着的图' }),

  // ── 経験 / 習慣 / 予定 / 都合 / 約束 ──
  s({ itemId: 'fi-keiken', place: 'park',
    figures: [{ x: 78, dir: 'right', pose: 'stand', mood: 'happy' }],
    props: [{ kind: 'stack', x: 78, y: 72, scale: 1.6 }, { kind: 'starMark', x: 40, y: 34, scale: 0.9 }],
    altJa: '積み重なったものの上に人が立っている図', altZh: '人站在层层累积起来的东西上面的图' }),
  s({ itemId: 'fi-shuukan', place: 'room',
    figures: [{ x: 34, dir: 'right', pose: 'read' }],
    props: [{ kind: 'calendar', x: 68, y: 52, scale: 1.2 }, { kind: 'check', x: 92, y: 60, scale: 0.7 }, { kind: 'check', x: 104, y: 60, scale: 0.7 }],
    altJa: '毎日同じことに印が付き続けている図', altZh: '每天同一件事持续被打上记号的图' }),
  s({ itemId: 'fi-yotei', place: 'office',
    props: [{ kind: 'calendar', x: 50, y: 54, scale: 1.7 }, { kind: 'clock', x: 92, y: 40, scale: 1.2 }],
    arrows: [{ x: 72, y: 68, dir: 'right', length: 18 }],
    altJa: 'これから先の日付と時間が押さえてある図', altZh: '把今后的日期和时间预先定下来的图' }),
  s({ itemId: 'fi-tsugou', place: 'plain',
    figures: [{ x: 32, dir: 'right', pose: 'shrug' }],
    props: [{ kind: 'clock', x: 68, y: 42, scale: 1.3 }, { kind: 'check', x: 96, y: 40, scale: 0.9 }, { kind: 'cross', x: 96, y: 64, scale: 0.9 }],
    altJa: '時間の候補に丸とばつが付いている図', altZh: '时间的候选上分别标着圈和叉的图' }),
  s({ itemId: 'fi-yakusoku', place: 'park',
    figures: [{ x: 38, dir: 'right', pose: 'raise' }, { x: 82, dir: 'left', pose: 'raise', color: '#f2a08c' }],
    props: [{ kind: 'handshake', x: 60, y: 46, scale: 1.1 }, { kind: 'calendar', x: 102, y: 34, scale: 0.8 }],
    altJa: '二人が手を交わし、先の日付が示されている場面', altZh: '两个人握手、并标出今后的日期的场景' }),

  // ── 状況 / 興味 ──
  // 人+空枠+!では手掛かりゼロだった（両評価者REPLACE）。
  // 周囲の複数の出来事（会話・時刻・天気）を見渡して把握する場面へ
  s({ itemId: 'fi-joukyou', place: 'street',
    figures: [
      { x: 58, dir: 'right', pose: 'think', mood: 'stern' },
      { x: 18, dir: 'right', pose: 'talk', scale: 0.65, color: '#f2a08c' },
      { x: 34, dir: 'left', pose: 'listen', scale: 0.65, color: '#9ed9a6' },
    ],
    props: [
      { kind: 'clock', x: 90, y: 30, scale: 1 }, { kind: 'cloudHot', x: 110, y: 24, scale: 0.7 },
      { kind: 'bus', x: 98, y: 66, scale: 0.9 },
    ],
    altJa: '人が、まわりの会話・時刻・乗り物などいま起きていることを見渡して把握している場面',
    altZh: '人环顾四周的对话、时间、车辆等，把握当下正在发生的事情的场景' }),
  s({ itemId: 'fi-kyoumi', place: 'shop',
    figures: [{ x: 36, dir: 'right', pose: 'point', mood: 'happy' }],
    props: [{ kind: 'book', x: 72, y: 56, scale: 1.3 }, { kind: 'heart', x: 96, y: 36, scale: 1 }],
    arrows: [{ x: 56, y: 44, dir: 'right', length: 14 }],
    altJa: '人の視線と心が特定の物へ向かっている場面', altZh: '人的视线和心思都朝向某一件东西的场景' }),

  // ── 副詞・接続表現（確からしさ・時間・つなぎを図で分ける）──
  s({ itemId: 'fi-tabun', place: 'plain',
    figures: [{ x: 36, dir: 'right', pose: 'think' }],
    props: [{ kind: 'check', x: 78, y: 42, scale: 1.1 }, { kind: 'question', x: 102, y: 42, scale: 1.1 }],
    altJa: '丸と疑問のしるしが半々に並び、はっきり決まらない図', altZh: '圈和问号各占一半、无法确定的图' }),
  s({ itemId: 'fi-kanarazu', place: 'plain',
    figures: [{ x: 36, dir: 'right', pose: 'point', mood: 'stern' }],
    props: [{ kind: 'check', x: 74, y: 42, scale: 1.2 }, { kind: 'check', x: 96, y: 42, scale: 1.2 }],
    altJa: '丸のしるしだけが並び、例外がない図', altZh: '只排列着圈的记号、没有例外的图' }),
  s({ itemId: 'fi-saikin', place: 'room',
    props: [{ kind: 'calendar', x: 40, y: 54, scale: 1.1 }, { kind: 'calendar', x: 76, y: 54, scale: 1.1 }, { kind: 'bang', x: 76, y: 28, scale: 0.9 }],
    arrows: [{ x: 58, y: 68, dir: 'right', length: 16 }],
    altJa: '日付の並びのうち、今に近いほうに印がある図', altZh: '在一排日期中靠近现在的那一侧被标记的图' }),
  s({ itemId: 'fi-zenzen', place: 'plain',
    figures: [{ x: 34, dir: 'right', pose: 'shrug' }],
    props: [{ kind: 'cross', x: 74, y: 44, scale: 1.3 }, { kind: 'cross', x: 100, y: 44, scale: 1.3 }],
    altJa: 'ばつのしるしだけが並び、当てはまるものがない図', altZh: '只排列着叉号、没有一个符合的图' }),
  s({ itemId: 'fi-nakanaka', place: 'street',
    figures: [{ x: 30, dir: 'right', pose: 'walk', mood: 'tired' }],
    props: [{ kind: 'tapeGoal', x: 106, y: 72, scale: 0.9 }, { kind: 'tangle', x: 66, y: 56, scale: 1.1 }],
    altJa: 'ゴールが遠く、途中で足止めされている図', altZh: '终点还很远、途中被拦住的图' }),
  s({ itemId: 'fi-yatto', place: 'park',
    figures: [{ x: 82, dir: 'right', pose: 'slump', mood: 'happy' }],
    props: [{ kind: 'tapeGoal', x: 98, y: 72 }, { kind: 'check', x: 40, y: 34, scale: 1.2 }],
    altJa: '長くかかったあとでゴールにたどり着いた場面', altZh: '经过很长时间之后终于到达终点的场景' }),
  s({ itemId: 'fi-tsumari', place: 'school',
    figures: [{ x: 26, dir: 'right', pose: 'talk' }],
    props: [{ kind: 'manyDots', x: 64, y: 44, scale: 1 }, { kind: 'smallBox', x: 102, y: 52, scale: 1.6 }],
    arrows: [{ x: 86, y: 60, dir: 'right', length: 16 }],
    altJa: '広がっていた複数の点が、一つにまとめ直される図', altZh: '原本分散的多个点被重新归结成一个的图' }),
  s({ itemId: 'fi-sorede', place: 'plain',
    props: [{ kind: 'smallBox', x: 30, y: 52, scale: 1.5 }, { kind: 'smallBox', x: 92, y: 52, scale: 1.5 }],
    arrows: [{ x: 61, y: 46, dir: 'right', length: 30 }],
    altJa: '前の出来事から次の出来事へ一方向につながる図', altZh: '从前一件事单向连到下一件事的图' }),
];
