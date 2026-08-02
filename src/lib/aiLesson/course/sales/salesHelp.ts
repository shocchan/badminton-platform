// 自己解決のヘルプ（§15）。
//
// 低単価商品では、1件の問い合わせ対応が粗利益を上回る（§16）。
// だから「困ったら問い合わせ」ではなく「困ったらこの画面で直る」を先に置く。
//
// ただし **問い合わせ手段を隠さない**（§15末尾）。
// 各項目は「自分で試すこと」を先に出し、そのうえで問い合わせへの導線を必ず残す。

export type HelpTopicId =
  | 'purchased_but_unusable'
  | 'otp_not_received'
  | 'remaining_time_wrong'
  | 'closed_browser'
  | 'no_audio'
  | 'mic_not_working'
  | 'switch_to_chinese'
  | 'progress_seems_lost'
  | 'want_repurchase'
  | 'want_month_plan'
  | 'receipt_info';

/** その場で押せる復旧操作。`none` は手順を読むだけで直るもの */
export type HelpActionId =
  | 'resync_entitlement'   // 利用権を取り直す
  | 'resend_otp'           // ログイン用コードを送り直す
  | 'go_plans'             // 料金ページへ
  | 'none';

export interface HelpTopic {
  id: HelpTopicId;
  questionJa: string;
  questionZh: string;
  /** 自分で試す手順。**必ず1つ以上ある**（いきなり問い合わせにしない） */
  stepsJa: string[];
  stepsZh: string[];
  action: HelpActionId;
  actionLabelJa?: string;
  actionLabelZh?: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'purchased_but_unusable',
    questionJa: '購入したのに使えません',
    questionZh: '已经购买了，但用不了',
    stepsJa: [
      'ページを一度読み込み直してください。支払いの確認が反映されていないことがあります。',
      '購入のときに入力したメールアドレスでログインしているか、ご確認ください。別のアドレスだと、別のアカウントになります。',
      'それでも使えないときは、下の「利用権を取り直す」を押してください。',
    ],
    stepsZh: [
      '请先重新加载页面。有时是付款确认还没有反映出来。',
      '请确认你登录时使用的邮箱，和购买时填写的是同一个。不同的邮箱会成为不同的账号。',
      '如果还是用不了，请点击下方的「重新获取使用权」。',
    ],
    action: 'resync_entitlement',
    actionLabelJa: '利用権を取り直す',
    actionLabelZh: '重新获取使用权',
  },
  {
    id: 'otp_not_received',
    questionJa: 'ログイン用のコードが届きません',
    questionZh: '收不到登录用的验证码',
    stepsJa: [
      '迷惑メールフォルダをご確認ください。初回はそちらに入ることがあります。',
      'メールアドレスの綴りをご確認ください。',
      '数分待っても届かないときは、下の「コードを送り直す」を押してください。',
    ],
    stepsZh: [
      '请查看垃圾邮件文件夹。第一次收信时经常会进到那里。',
      '请确认邮箱地址的拼写。',
      '等几分钟仍未收到的话，请点击下方的「重新发送验证码」。',
    ],
    action: 'resend_otp',
    actionLabelJa: 'コードを送り直す',
    actionLabelZh: '重新发送验证码',
  },
  {
    id: 'remaining_time_wrong',
    questionJa: '残り時間が思っていたのと違います',
    questionZh: '剩余时间和我想的不一样',
    stepsJa: [
      '時間はサーバーで数えています。学習していない間や、席を外していた間は進みません。',
      '複数のタブで開いていても、時間は二重には減りません。',
      '通信が途切れていた間の時間は差し引かれています。表示が古いときは、読み込み直すと最新になります。',
      'それでも合わないときは、下の「利用権を取り直す」を押してから、もう一度ご確認ください。',
    ],
    stepsZh: [
      '时间由服务器计算。没有在学习的时候，以及离开座位的时候都不会走。',
      '即使开了多个标签页，时间也不会重复扣减。',
      '通信中断期间的时间已经扣除。显示比较旧时，重新加载即可更新。',
      '如果还是对不上，请点击下方的「重新获取使用权」后再确认一次。',
    ],
    action: 'resync_entitlement',
    actionLabelJa: '利用権を取り直す',
    actionLabelZh: '重新获取使用权',
  },
  {
    id: 'closed_browser',
    questionJa: 'ブラウザを閉じてしまいました',
    questionZh: '不小心关掉了浏览器',
    stepsJa: [
      '同じメールアドレスでログインし直せば、前回の続きから始められます。',
      '閉じている間の時間は減りません。',
    ],
    stepsZh: [
      '用同一个邮箱重新登录，就能从上次的地方继续。',
      '关闭期间的时间不会减少。',
    ],
    action: 'none',
  },
  {
    id: 'no_audio',
    questionJa: '音声が出ません',
    questionZh: '没有声音',
    stepsJa: [
      '端末の音量と、消音になっていないかをご確認ください。',
      'iPhone / iPad では、画面のどこかを一度タップしてから音声が出ます。',
      'ほかのアプリで音を再生していると、音声が止まることがあります。閉じてからお試しください。',
    ],
    stepsZh: [
      '请确认设备音量，以及是否处于静音状态。',
      'iPhone / iPad 上需要先点一下画面，声音才会出来。',
      '如果其他应用正在播放声音，可能会中断。请关闭后再试。',
    ],
    action: 'none',
  },
  {
    id: 'mic_not_working',
    questionJa: 'マイクが使えません',
    questionZh: '麦克风用不了',
    stepsJa: [
      'ブラウザからマイクの使用を許可してください。アドレスバーの左側に許可の設定があります。',
      '一度「拒否」を選んでいると、設定から変える必要があります。',
      'マイクが使えなくても、文字で答える練習は続けられます。',
    ],
    stepsZh: [
      '请在浏览器中允许使用麦克风。地址栏左侧有权限设置。',
      '如果之前选过「拒绝」，需要到设置里修改。',
      '即使麦克风用不了，也可以继续用文字作答来练习。',
    ],
    action: 'none',
  },
  {
    id: 'switch_to_chinese',
    questionJa: '中国語で表示したい',
    questionZh: '想用日语显示',
    stepsJa: [
      '画面の右上にある言語ボタンで切り替えられます。',
      '学習の途中でも切り替えられます。切り替えても進捗は消えません。',
    ],
    stepsZh: [
      '用页面右上角的语言按钮切换。',
      '学习途中也可以切换，切换后进度不会消失。',
    ],
    action: 'none',
  },
  {
    id: 'progress_seems_lost',
    questionJa: '進捗が消えたように見えます',
    questionZh: '感觉学习进度不见了',
    stepsJa: [
      '購入のときと同じメールアドレスでログインしているか、ご確認ください。別のアドレスは別のアカウントになります。',
      '再購入しても、診断・復習の予定・冒険マップは消えません。',
      '「利用権を取り直す」を押すと、最新の状態を読み直します。',
    ],
    stepsZh: [
      '请确认登录用的邮箱，和购买时是同一个。不同的邮箱会成为不同的账号。',
      '即使再次购买，测评、复习安排、冒险地图都不会消失。',
      '点击「重新获取使用权」可以重新读取最新状态。',
    ],
    action: 'resync_entitlement',
    actionLabelJa: '利用権を取り直す',
    actionLabelZh: '重新获取使用权',
  },
  {
    id: 'want_repurchase',
    questionJa: 'もう一度購入したい',
    questionZh: '想再购买一次',
    stepsJa: [
      '料金ページから、同じプランをもう一度お選びいただけます。',
      '新しいアカウントは作られません。残り時間が足され、続きから始められます。',
    ],
    stepsZh: [
      '可以在价格页面再次选择同一个方案。',
      '不会创建新账号。剩余时间会累加，可以接着上次继续。',
    ],
    action: 'go_plans',
    actionLabelJa: '料金プランを見る',
    actionLabelZh: '查看价格方案',
  },
  {
    id: 'want_month_plan',
    questionJa: '1か月プランに変えたい',
    questionZh: '想换成1个月计划',
    stepsJa: [
      '料金ページから1か月プランをお選びください。',
      'それまでの学習はそのまま引き継がれます。診断をやり直す必要はありません。',
      '60分パスの残り時間も、期限内であればそのまま残ります。',
    ],
    stepsZh: [
      '请在价格页面选择1个月计划。',
      '之前的学习会直接继承，不需要重新测评。',
      '60分钟通行证的剩余时间，在有效期内也会保留。',
    ],
    action: 'go_plans',
    actionLabelJa: '料金プランを見る',
    actionLabelZh: '查看价格方案',
  },
  {
    id: 'receipt_info',
    questionJa: '支払いの控えを確認したい',
    questionZh: '想确认付款凭证',
    stepsJa: [
      'お申し込みの完了時に、控えをメールでお送りしています。',
      '見当たらないときは、迷惑メールフォルダをご確認ください。',
      '宛名や但し書きの変更が必要な場合は、お問い合わせください。',
    ],
    stepsZh: [
      '申请完成时，我们会通过邮件发送凭证。',
      '找不到时请查看垃圾邮件文件夹。',
      '需要修改抬头或用途说明时，请联系我们。',
    ],
    action: 'none',
  },
] as const;

export const helpTopicById = (id: string): HelpTopic | null =>
  HELP_TOPICS.find((t) => t.id === id) ?? null;

export const helpPathFor = (lang: 'ja' | 'zh'): string => `/${lang}/ai-course/help`;

/** ヘルプの表示用ビュー（component の lang 分岐を無くす） */
export interface HelpTopicView {
  id: HelpTopicId;
  question: string;
  steps: string[];
  action: HelpActionId;
  actionLabel: string | null;
}

export const helpTopicView = (t: HelpTopic, lang: 'ja' | 'zh'): HelpTopicView => ({
  id: t.id,
  question: lang === 'zh' ? t.questionZh : t.questionJa,
  steps: lang === 'zh' ? t.stepsZh : t.stepsJa,
  action: t.action,
  actionLabel: (lang === 'zh' ? t.actionLabelZh : t.actionLabelJa) ?? null,
});

// ─────────────────────────────────────────────────────────
// 復旧操作の結果
// ─────────────────────────────────────────────────────────

export type RecoveryOutcome =
  | 'recovered'        // 直った
  | 'nothing_to_fix'   // もともと正常だった
  | 'still_failing';   // 直らなかった → ここで初めて問い合わせを案内する

export interface RecoveryResult {
  outcome: RecoveryOutcome;
  messageJa: string;
  messageZh: string;
}

/**
 * 利用権の再同期の結果を、利用者向けの言葉にする。
 *
 * 大事なのは `nothing_to_fix` を「直りました」と言わないこと。
 * 実際には何も変わっていないのに直ったと伝えると、
 * 同じ症状でもう一度来たときに信用を失う。
 */
export const describeResync = (
  before: { hasAccess: boolean; remainingActiveSeconds: number },
  after: { hasAccess: boolean; remainingActiveSeconds: number },
): RecoveryResult => {
  const changed =
    before.hasAccess !== after.hasAccess ||
    before.remainingActiveSeconds !== after.remainingActiveSeconds;

  if (changed) {
    return {
      outcome: 'recovered',
      messageJa: '最新の状態に更新しました。もう一度お試しください。',
      messageZh: '已更新为最新状态。请再试一次。',
    };
  }
  if (after.hasAccess) {
    return {
      outcome: 'nothing_to_fix',
      messageJa: '利用権は正常でした。表示が変わらないときは、ページを読み込み直してください。',
      messageZh: '使用权本来就是正常的。如果显示没有变化，请重新加载页面。',
    };
  }
  return {
    outcome: 'still_failing',
    messageJa: '使える利用権が見つかりませんでした。購入のときと同じメールアドレスでログインしているかご確認のうえ、それでも解決しないときはお問い合わせください。',
    messageZh: '没有找到可用的使用权。请确认登录邮箱与购买时是否一致；如果仍未解决，请联系我们。',
  };
};
