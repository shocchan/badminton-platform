// src/lib/shuttleCounterI18n.ts
//
// シャトル供養カウンターの表示文言。日本語・中国語の両方を定義。
// 既存のサイトのロケール判定(URLの /ja/ 또는 /zh/ など)から
// 'ja' | 'zh' を渡してもらう想定。

export type ShuttleLocale = 'ja' | 'zh';

interface ShuttleCounterStrings {
  title: string;
  unit: string;
  nextMilestone: (label: string, remain: number) => string;
  milestoneLabel: (count: number, isMax: boolean) => string;
  celebrateBig: string;
  celebrateSmall: string;
}

export const SHUTTLE_COUNTER_TEXT: Record<ShuttleLocale, ShuttleCounterStrings> = {
  ja: {
    title: 'シャトル供養カウンター',
    unit: '個',
    nextMilestone: (label, remain) => `次の節目「${label}」まであと${remain}個`,
    milestoneLabel: (count, isMax) => (isMax ? `${count}個突破` : `${count}個達成`),
    celebrateBig: '会員プレゼント抽選の対象になりました🎁',
    celebrateSmall: 'みんなで積み重ねてきた証',
  },
  zh: {
    title: '羽毛球供养计数器',
    unit: '个',
    nextMilestone: (label, remain) => `距离下一个里程碑「${label}」还有${remain}个`,
    milestoneLabel: (count, isMax) => (isMax ? `突破${count}个` : `达成${count}个`),
    celebrateBig: '已获得会员抽奖资格🎁',
    celebrateSmall: '大家一起累积的见证',
  },
};
