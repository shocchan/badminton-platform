// Phase B-4 バッチ1: 移動・方向・出入り・対になる動作。
//
// 対になる語は「同じ場所・同じ画角・同じ小物」に固定し、動きの向きだけを変える。
// 自動詞／他動詞の対（変わる/変える・決まる/決める・続く/続ける）は、
// 中国語母語者がいちばん取り違えるところなので「人が手を出しているか」で描き分ける。
import type { VocabSceneSpec } from './VocabScene';

const s = (spec: VocabSceneSpec): VocabSceneSpec => spec;

export const SCENES_BATCH1: VocabSceneSpec[] = [
  // ── 行く / 来る: 同じ通り・同じ立ち位置。話し手（左の人）から見た向きだけが違う ──
  s({ itemId: 'fi-iku', place: 'street',
    figures: [{ x: 34, dir: 'right', pose: 'walk' }],
    props: [{ kind: 'sign', x: 100, y: 72 }],
    arrows: [{ x: 68, y: 46, dir: 'right', length: 26 }],
    altJa: '人が向こうの目的地へ歩いていく場面', altZh: '一个人朝远处的目的地走去的场景' }),
  s({ itemId: 'fi-kuru', place: 'street',
    figures: [{ x: 86, dir: 'left', pose: 'walk' }, { x: 22, dir: 'right', pose: 'stand', color: '#f2a08c' }],
    arrows: [{ x: 56, y: 46, dir: 'left', length: 26 }],
    altJa: '人がこちらに立っている人のほうへ歩いてくる場面', altZh: '一个人朝站在这边的人走过来的场景' }),

  // ── 入る / 出る: 同じ家・同じドア。人とドアの位置関係だけが違う ──
  s({ itemId: 'fi-hairu', place: 'home',
    figures: [{ x: 74, dir: 'left', pose: 'walk' }],
    props: [{ kind: 'doorOpen', x: 33, y: 72, scale: 1.1 }],
    arrows: [{ x: 56, y: 50, dir: 'left', length: 22 }],
    altJa: '外にいた人が開いた戸口を通って建物の中へ進む場面', altZh: '原本在外面的人穿过打开的门走进建筑里的场景' }),
  s({ itemId: 'fi-deru', place: 'home',
    figures: [{ x: 58, dir: 'right', pose: 'walk' }],
    props: [{ kind: 'doorOpen', x: 33, y: 72, scale: 1.1 }],
    arrows: [{ x: 82, y: 50, dir: 'right', length: 22 }],
    altJa: '建物の戸口から人が外へ出ていく場面', altZh: '人从建筑的门口走到外面的场景' }),

  // ── 乗る / 降りる: 同じ駅・同じ電車。人の向きだけが違う ──
  s({ itemId: 'fi-noru', place: 'station',
    figures: [{ x: 34, dir: 'right', pose: 'walk' }],
    props: [{ kind: 'train', x: 86, y: 68, scale: 1.15 }],
    arrows: [{ x: 58, y: 44, dir: 'right', length: 22 }],
    altJa: '駅のホームから人が電車に乗り込もうとする場面', altZh: '人从站台走进电车里的场景' }),
  s({ itemId: 'fi-oriru', place: 'station',
    figures: [{ x: 52, dir: 'left', pose: 'walk' }],
    props: [{ kind: 'train', x: 86, y: 68, scale: 1.15 }],
    arrows: [{ x: 30, y: 44, dir: 'left', length: 22 }],
    altJa: '電車から人がホームへ降りてくる場面', altZh: '人从电车下到站台上的场景' }),

  // ── 帰る: 同じ家の絵を使い、家のほうへ向かう ──
  s({ itemId: 'fi-kaeru', place: 'home',
    figures: [{ x: 88, dir: 'left', pose: 'walk', mood: 'happy' }],
    props: [{ kind: 'bag', x: 100, y: 60, scale: 0.9 }],
    arrows: [{ x: 66, y: 50, dir: 'left', length: 24 }],
    altJa: '荷物を持った人が自分の家のほうへ戻っていく場面', altZh: '带着包的人朝自己家的方向回去的场景' }),

  // ── 起きる / 寝る: 同じ部屋。体の向きと時間の合図だけが違う ──
  s({ itemId: 'fi-okiru', place: 'room',
    figures: [{ x: 46, dir: 'right', pose: 'stand', mood: 'tired' }],
    props: [{ kind: 'clock', x: 92, y: 26, scale: 1.1 }, { kind: 'cloudHot', x: 20, y: 20, scale: 0.8 }],
    arrows: [{ x: 66, y: 44, dir: 'up', length: 20 }],
    altJa: '朝、人がベッドから体を起こして立ち上がる場面', altZh: '早上一个人从床上起身站起来的场景' }),
  s({ itemId: 'fi-neru', place: 'night',
    figures: [{ x: 46, y: 66, dir: 'right', pose: 'sleep', mood: 'happy' }],
    props: [{ kind: 'clock', x: 92, y: 26, scale: 1.1 }],
    arrows: [{ x: 66, y: 44, dir: 'down', length: 20 }],
    altJa: '夜、人が横になって眠っている場面', altZh: '夜里一个人躺下睡觉的场景' }),

  // ── 始める / 終わる: 同じ道。旗の色と人の位置だけが違う ──
  s({ itemId: 'fi-hajimeru', place: 'park',
    figures: [{ x: 40, dir: 'right', pose: 'run' }],
    props: [{ kind: 'tapeStart', x: 26, y: 72 }],
    arrows: [{ x: 74, y: 48, dir: 'right', length: 24 }],
    altJa: '人がスタートの旗のところから走り出す場面', altZh: '人从起点的旗子处开始跑出去的场景' }),
  s({ itemId: 'fi-owaru', place: 'park',
    figures: [{ x: 78, dir: 'right', pose: 'cheer', mood: 'happy' }],
    props: [{ kind: 'tapeGoal', x: 94, y: 72 }],
    altJa: '人がゴールの旗にたどり着いて両手を上げている場面', altZh: '人到达终点旗子并举起双手的场景' }),

  // ── 増える / 減る: 同じグラフの向きだけが違う ──
  s({ itemId: 'fi-fueru', place: 'plain',
    props: [{ kind: 'chartUp', x: 62, y: 52, scale: 1.8 }],
    altJa: 'ものの量を表す棒が右へいくほど高くなっている図', altZh: '表示数量的柱状图越往右越高的图' }),
  s({ itemId: 'fi-heru', place: 'plain',
    props: [{ kind: 'chartDown', x: 62, y: 52, scale: 1.8 }],
    altJa: 'ものの量を表す棒が右へいくほど低くなっている図', altZh: '表示数量的柱状图越往右越低的图' }),

  // ── 変わる（自） / 変える（他）: 同じ2色の板。人が手を出しているかどうかが違い ──
  s({ itemId: 'fi-kawaru', place: 'plain',
    props: [{ kind: 'mirror', x: 60, y: 48, scale: 1.6 }],
    arrows: [{ x: 60, y: 66, dir: 'right', length: 22 }],
    altJa: '左右で色のちがう板が、ひとりでに右の状態へ移っていく図', altZh: '左右颜色不同的板子自己变成右边状态的图' }),
  s({ itemId: 'fi-kaeru-change', place: 'plain',
    figures: [{ x: 24, dir: 'right', pose: 'point' }],
    props: [{ kind: 'mirror', x: 74, y: 48, scale: 1.6 }],
    arrows: [{ x: 74, y: 66, dir: 'right', length: 22 }],
    altJa: '人が手を伸ばして、左右で色のちがう板を右の状態へ切り替えている場面',
    altZh: '人伸手把左右颜色不同的板子切换成右边状态的场景' }),

  // ── 決まる（自） / 決める（他）: 同じ予定表。人が指しているかどうかが違い ──
  s({ itemId: 'fi-kimaru', place: 'office',
    props: [{ kind: 'calendar', x: 60, y: 52, scale: 1.7 }, { kind: 'check', x: 60, y: 30, scale: 0.9 }],
    altJa: '予定表の日付にしるしが付いて、そう決まった状態を表す図', altZh: '日程表上的日期被打上记号、表示已经定下来的图' }),
  s({ itemId: 'fi-kimeru', place: 'office',
    figures: [{ x: 24, dir: 'right', pose: 'point', mood: 'stern' }],
    props: [{ kind: 'calendar', x: 76, y: 52, scale: 1.7 }, { kind: 'check', x: 76, y: 30, scale: 0.9 }],
    altJa: '人が予定表の日付を指さして、そこにしるしを付けている場面', altZh: '人指着日程表上的日期并在那里打记号的场景' }),

  // ── 続く（自） / 続ける（他）: 同じ道。人が歩いているかどうかが違い ──
  s({ itemId: 'fi-tsuzuku', place: 'park',
    props: [{ kind: 'freePath', x: 60, y: 50, scale: 2.4 }],
    arrows: [{ x: 96, y: 62, dir: 'right', length: 18 }],
    altJa: '道が途切れずに先へ延びている図', altZh: '道路没有中断、一直向前延伸的图' }),
  s({ itemId: 'fi-tsuzukeru', place: 'park',
    figures: [{ x: 36, dir: 'right', pose: 'walk' }],
    props: [{ kind: 'freePath', x: 72, y: 50, scale: 2.4 }],
    arrows: [{ x: 100, y: 62, dir: 'right', length: 16 }],
    altJa: '人が途切れない道を、そのまま先へ歩き続けている場面', altZh: '人沿着没有中断的路继续往前走的场景' }),

  // ── 覚える / 忘れる: 同じ部屋・同じメモ。頭へ入るか、頭から落ちるか ──
  s({ itemId: 'fi-oboeru', place: 'room',
    figures: [{ x: 40, dir: 'right', pose: 'think', mood: 'happy' }],
    props: [{ kind: 'note', x: 78, y: 34, scale: 1.2 }],
    arrows: [{ x: 60, y: 28, dir: 'left', length: 20 }],
    altJa: 'メモの内容が人の頭のほうへ入っていく図', altZh: '便条上的内容进入人的头脑里的图' }),
  s({ itemId: 'fi-wasureru', place: 'room',
    figures: [{ x: 40, dir: 'right', pose: 'shrug', mood: 'surprised' }],
    props: [{ kind: 'note', x: 78, y: 62, scale: 1.2 }],
    arrows: [{ x: 68, y: 44, dir: 'down', length: 20 }],
    altJa: 'メモの内容が人の頭から下へ落ちていく図', altZh: '便条上的内容从人的头脑里掉下去的图' }),

  // ── 会う ──
  s({ itemId: 'fi-au', place: 'street',
    figures: [{ x: 40, dir: 'right', pose: 'raise', mood: 'happy' }, { x: 80, dir: 'left', pose: 'raise', mood: 'happy', color: '#f2a08c' }],
    props: [{ kind: 'handshake', x: 60, y: 50, scale: 0.9 }],
    altJa: '二人が向かい合って手を上げ、出会っている場面', altZh: '两个人面对面举手相遇的场景' }),
];
