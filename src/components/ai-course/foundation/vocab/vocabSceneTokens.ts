// Phase B-4: 語彙イラストの寸法と配色。
// componentと同じファイルから定数を出すと Fast Refresh が効かなくなるため分離している。

export const SCENE_W = 120;
export const SCENE_H = 90;
export const GROUND = 72;

/** やわらかい配色。彩度を抑え、線は使わず面で描く。 */
export const C = {
  ink: '#3f3d56',
  skin: '#f2d3bd',
  hair: '#4a4453',
  body: '#6c63ff',
  body2: '#f2a08c',
  wall: '#eef0fb',
  wall2: '#e2e6f7',
  floor: '#dfe3f3',
  wood: '#d8b08c',
  green: '#9ed9a6',
  sky: '#dbeaf8',
  sun: '#ffd98e',
  metal: '#c3cbe0',
  accent: '#ff8a7a',
  cool: '#7fc7e8',
  warn: '#ffc46b',
  paper: '#ffffff',
  shadow: '#00000010',
} as const;

export type Dir = 'left' | 'right';
export type PlaceKey =
  | 'home' | 'room' | 'street' | 'station' | 'shop' | 'school' | 'office'
  | 'restaurant' | 'hospital' | 'park' | 'plain' | 'night' | 'counter';
export type Pose =
  | 'stand' | 'walk' | 'sit' | 'raise' | 'point' | 'hold' | 'sleep'
  | 'think' | 'talk' | 'listen' | 'write' | 'read' | 'eat' | 'drink'
  | 'run' | 'bow' | 'shrug' | 'cheer' | 'slump' | 'crouch';
export type Mood = 'neutral' | 'happy' | 'sad' | 'tired' | 'surprised' | 'shy' | 'stern';
export type PropKey =
  | 'door' | 'doorOpen' | 'train' | 'bus' | 'car' | 'book' | 'phone' | 'cup'
  | 'plate' | 'bag' | 'coin' | 'clock' | 'pill' | 'waterGlass' | 'cat'
  | 'chair' | 'desk' | 'sign' | 'calendar' | 'chartUp' | 'chartDown' | 'heart'
  | 'cloudHot' | 'snow' | 'box' | 'key' | 'ticket' | 'letter' | 'screen'
  | 'question' | 'bang' | 'check' | 'cross' | 'note' | 'bulb' | 'lock'
  | 'handshake' | 'bigBox' | 'smallBox' | 'newTag' | 'oldTag' | 'priceHigh'
  | 'priceLow' | 'manyDots' | 'fewDots' | 'speechPair' | 'mirror' | 'stack'
  | 'tapeStart' | 'tapeGoal' | 'freePath' | 'tangle' | 'quietMark' | 'starMark'
  | 'landMass' | 'islandChain';
