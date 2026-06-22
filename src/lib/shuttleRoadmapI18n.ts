// src/lib/shuttleRoadmapI18n.ts
//
// /shuttle-roadmap ページ用の文言(日本語・中国語)

import type { ShuttleLocale } from './shuttleCounterI18n';

export interface RoadmapItem {
  label: string;
  icon?: string; // public/icons/ 配下のファイル名
}

export interface RoadmapTier {
  count: number;
  items: RoadmapItem[];
  caption: string;
}

interface RoadmapStrings {
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  roadmapTitle: string;
  tiers: RoadmapTier[];
  prizeTitle: string;
  prizeBody: string;
  ctaButton: string;
  backLink: string;
}

export const SHUTTLE_ROADMAP_TEXT: Record<ShuttleLocale, RoadmapStrings> = {
  ja: {
    heroEyebrow: 'シャトル供養カウンター',
    heroTitle: 'シャトルは、ここで終わらない。',
    heroBody:
      'コートで全力を尽くしたシャトルたちは、役目を終えた後もコミュニティの中で生き続けます。引退した本数に応じて、こんな作品たちが生まれていく予定です。',
    roadmapTitle: '個数で広がる、シャトルたちの行き先',
    tiers: [
      {
        count: 50,
        items: [
          { label: 'しおり', icon: 'shiori.png' },
          { label: 'ストラップ', icon: 'strap.png' },
          { label: 'マグネット' },
          { label: 'ピンバッジ' },
        ],
        caption: 'ひとつの試合から生まれる、小さなお守り',
      },
      {
        count: 100,
        items: [
          { label: 'コースター', icon: 'coaster.png' },
          { label: 'レジンメダル', icon: 'resin_medal.png' },
        ],
        caption: '積み重ねた時間が、手に取れる形に',
      },
      {
        count: 300,
        items: [
          { label: 'フォトフレーム' },
          { label: 'ペン立て', icon: 'penholder.png' },
          { label: '風鈴' },
        ],
        caption: 'コミュニティの日常に、そっと寄り添う',
      },
      {
        count: 500,
        items: [{ label: '壁掛けモザイクアート' }, { label: 'シャトルロボット' }],
        caption: 'みんなで育てる、街の風景',
      },
      {
        count: 1000,
        items: [
          { label: 'アートラケット', icon: 'artracket.png' },
          { label: 'タペストリー' },
          { label: 'ランプシェード' },
        ],
        caption: '一年をかけて積み上げた、コミュニティの証',
      },
    ],
    prizeTitle: 'これらは、会員と大会入賞者への景品になります',
    prizeBody:
      '節目を迎えるたびに、その時点で作られた作品の一部を、会員プレゼント抽選や大会の景品としてお届けする予定です。会員登録をしておくと、抽選の対象になります。',
    ctaButton: '無料で会員登録する',
    backLink: '← トップページに戻る',
  },
  zh: {
    heroEyebrow: '羽毛球供养计数器',
    heroTitle: '羽毛球的故事，不止于此。',
    heroBody:
      '在球场上全力以赴的羽毛球，完成使命后依然在社群中延续生命。根据退役的数量，将会诞生这样的作品。',
    roadmapTitle: '随数量增加而展开的，羽毛球的归宿',
    tiers: [
      {
        count: 50,
        items: [
          { label: '书签', icon: 'shiori.png' },
          { label: '挂饰钥匙扣', icon: 'strap.png' },
          { label: '冰箱贴' },
          { label: '徽章' },
        ],
        caption: '一场比赛诞生的小小护身符',
      },
      {
        count: 100,
        items: [
          { label: '杯垫', icon: 'coaster.png' },
          { label: '树脂奖牌', icon: 'resin_medal.png' },
        ],
        caption: '积累的时光，化作触手可及的形状',
      },
      {
        count: 300,
        items: [{ label: '相框' }, { label: '笔筒', icon: 'penholder.png' }, { label: '风铃' }],
        caption: '悄悄融入社群的日常',
      },
      {
        count: 500,
        items: [{ label: '墙面马赛克艺术' }, { label: '羽毛球机器人' }],
        caption: '大家共同培育的城市风景',
      },
      {
        count: 1000,
        items: [
          { label: '艺术球拍', icon: 'artracket.png' },
          { label: '挂毯' },
          { label: '灯罩' },
        ],
        caption: '历时一年累积的社群见证',
      },
    ],
    prizeTitle: '这些将作为会员和比赛获奖者的奖品',
    prizeBody:
      '每达到一个里程碑，当时制作完成的部分作品，将作为会员抽奖或比赛奖品送出。完成会员注册后即可获得抽奖资格。',
    ctaButton: '免费注册会员',
    backLink: '← 返回首页',
  },
};
