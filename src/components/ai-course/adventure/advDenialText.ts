// 教材が取れない理由の学習者向け文言（§8: 「不正をしましたね」という言い方をしない）。
// 理由コードはサーバーが返し、文言は client が持つ（文言は教材ではない）。
import type { ActivityDenial } from '../../../lib/aiLesson/course/adventure/activityClient';

type L = 'ja' | 'zh';

export const denialText = (denial: ActivityDenial, lang: L): { title: string; body: string } => {
  const t = (ja: [string, string], zh: [string, string]) =>
    lang === 'zh' ? { title: zh[0], body: zh[1] } : { title: ja[0], body: ja[1] };
  switch (denial) {
    case 'unauthenticated':
      return t(['ログインが必要です', 'この教材を使うにはログインしてください。'],
        ['需要登录', '使用此教材请先登录。']);
    case 'no_entitlement':
      return t(['利用権がありません', '購入するとすぐ続きから始められます。'],
        ['当前没有可用的使用权', '购买后可以马上继续。']);
    case 'trial_not_started':
      return t(['体験がまだ始まっていません', '「体験を始める」を押すと24時間の利用が始まります。'],
        ['体验还没有开始', '按「开始体验」后，24小时的使用就会开始。']);
    case 'trial_expired':
      return t(['利用期限が終わりました', '開始から24時間が経ちました。進捗は残っています。もう一度購入すると続きから再開できます。'],
        ['使用期限已结束', '距开始已过24小时。学习进度会保留，再次购买即可从上次的进度继续。']);
    case 'trial_consumed':
      return t(['60分を使い切りました', '進捗は残っています。もう一度購入すると続きから再開できます。'],
        ['60分钟已用完', '学习进度会保留，再次购买即可从上次的进度继续。']);
    case 'stage_locked':
      return t(['このステージはまだ鍵がかかっています', '手前のステージを攻略すると開きます。'],
        ['这个关卡还未解锁', '攻克前面的关卡后就会开启。']);
    case 'rate_limited':
      return t(['少し立て込んでいます', '数十秒待ってから続けてください。'],
        ['请求有点密集', '请稍等几十秒后再继续。']);
    case 'session_stale':
    case 'invalid_session':
    case 'session_not_owned':
      return t(['学習セッションを更新します', 'もう一度開き直してください。進捗は消えません。'],
        ['需要刷新学习会话', '请重新打开一次。进度不会丢失。']);
    case 'network':
      return t(['通信が不安定です', '電波の良いところでもう一度試してください。'],
        ['网络不稳定', '请在信号好的地方重试。']);
    default:
      return t(['いま教材を用意できません', '少し待ってからもう一度試してください。'],
        ['暂时无法准备教材', '请稍后重试。']);
  }
};
