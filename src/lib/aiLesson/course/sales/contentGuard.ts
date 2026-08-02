// 教材の大量取得・使い逃げの防止（§8）。
//
// 前提の整理:
//   このサービスが売っているのは「教材へのアクセス権」ではなく
//   「今の自分に必要な学習を、決まった時間だけ進める権利」（§7）。
//   だから配信の単位は **今のステップに必要な問題だけ** であって、
//   バンク全体でも、ページ送りで最後まで辿れる一覧でもない。
//
// もう一つの前提:
//   **通常の学習者がエラーや制限表示を頻繁に見る設計にはしない**（§8末尾）。
//   なので上限は「普通に勉強していたら絶対に当たらない値」に置き、
//   `contentGuard.test.ts` が実際の学習ペースで当たらないことを検査する。
//
// この層は純関数。時刻とリクエスト履歴は呼び出し側が渡す。

import type { EntitlementSnapshot } from './entitlement';

// ─────────────────────────────────────────────────────────
// 権限（learner と 管理者QA を完全に分ける）
// ─────────────────────────────────────────────────────────

export type ContentRole = 'learner' | 'admin_qa';

/**
 * 教材に対してできること。
 * learner の欄に true が増えることがそのまま「持ち出せる」を意味するので、
 * 追加するときは §8 を読み直すこと。
 */
export interface ContentCapabilities {
  /** 今のステップに必要な問題を受け取る */
  receiveStepItems: boolean;
  /** 一覧・検索で問題を横断的に見る */
  browseBank: boolean;
  /** CSV等で書き出す */
  exportBank: boolean;
  /** 内部ID・出典ファイル名を見る */
  seeInternalIds: boolean;
}

export const capabilitiesFor = (role: ContentRole): ContentCapabilities =>
  role === 'admin_qa'
    ? { receiveStepItems: true, browseBank: true, exportBank: true, seeInternalIds: true }
    : { receiveStepItems: true, browseBank: false, exportBank: false, seeInternalIds: false };

// ─────────────────────────────────────────────────────────
// 配信できる形へ削る
// ─────────────────────────────────────────────────────────

/** 内部で持っている問題の形（出典・内部IDを含む） */
export interface InternalItem {
  id: string;
  /** 内部の通し番号。連番なので、出すと総数と網羅の手がかりになる */
  bankIndex: number;
  /** 出典ファイル。教材の作り方が透ける */
  sourceFile: string;
  prompt: string;
  choices: string[];
  correctChoiceId: string;
  explanationJa: string;
  explanationZh: string;
  /** 内部の難易度メモなど */
  internalNotes?: string;
}

/** 学習者へ渡してよい形。**内部IDと出典を含まない** */
export interface DeliverableItem {
  /** 配信ごとに変わる一時ID。これを集めても元のバンクを再構成できない */
  deliveryId: string;
  prompt: string;
  choices: string[];
  correctChoiceId: string;
  explanationJa: string;
  explanationZh: string;
}

/**
 * 学習者へ渡す形へ削る。
 * `deliveryId` は「配信セッション + 出題順」から作る。
 * 元の id をそのまま渡すと、集めるだけでバンクの目録ができてしまう。
 */
export const toDeliverable = (item: InternalItem, sessionId: string, indexInSession: number): DeliverableItem => ({
  deliveryId: `${sessionId}:${indexInSession}`,
  prompt: item.prompt,
  choices: item.choices,
  correctChoiceId: item.correctChoiceId,
  explanationJa: item.explanationJa,
  explanationZh: item.explanationZh,
});

/** 削り漏れの検査に使う、学習者へ出してはいけない項目名 */
export const FORBIDDEN_LEARNER_FIELDS = ['id', 'bankIndex', 'sourceFile', 'internalNotes'] as const;

// ─────────────────────────────────────────────────────────
// 配信の上限
// ─────────────────────────────────────────────────────────

export interface ContentGuardPolicy {
  /** 1回の配信で返す問題の最大数。バトル1回ぶんより少し多い程度に留める */
  maxItemsPerRelease: number;
  /** 1利用枠あたり、この本数までしか出さない（時間制の裏付け） */
  maxItemsPerWindow: number;
  /** 直近 windowSeconds 秒で許す配信リクエスト数 */
  burstLimit: number;
  burstWindowSeconds: number;
}

/**
 * 既定値。
 * 「普通に勉強していたら当たらない」ことが最優先。
 *   - 1回の配信 = 5問（バトル1回ぶん）
 *   - 60分で解ける現実的な上限を大きめに見て 400問
 *   - 60秒で30リクエスト（人が手で解く速度の10倍以上）
 */
export const DEFAULT_CONTENT_GUARD: ContentGuardPolicy = {
  maxItemsPerRelease: 5,
  maxItemsPerWindow: 400,
  burstLimit: 30,
  burstWindowSeconds: 60,
};

export type ContentDenial =
  | 'no_entitlement'
  | 'not_permitted'
  | 'window_item_limit'
  | 'rate_limited';

export interface ReleaseRequest {
  role: ContentRole;
  entitlement: EntitlementSnapshot;
  sessionId: string;
  /** これまでにこの利用枠で配信した本数 */
  itemsServedInWindow: number;
  /** 直近の配信リクエスト時刻（epoch ms・新しい順でなくてよい） */
  recentRequestTimesMs: number[];
  nowMs: number;
  /** 学習エンジンが「今のステップに必要」と選んだ問題 */
  requestedItems: InternalItem[];
}

export interface ReleaseResult {
  allowed: boolean;
  denial: ContentDenial | null;
  items: DeliverableItem[];
  /** 制限に当たったとき、いつなら再開できるか（秒）。学習者へ出す文言に使う */
  retryAfterSeconds: number;
}

const deny = (denial: ContentDenial, retryAfterSeconds = 0): ReleaseResult =>
  ({ allowed: false, denial, items: [], retryAfterSeconds });

/**
 * 配信してよいかを判断し、渡してよい形だけを返す。
 * **すべての教材配信はここを通す。** ここを通さない経路を作ると §8 が崩れる。
 */
export const releaseItems = (
  req: ReleaseRequest,
  policy: ContentGuardPolicy = DEFAULT_CONTENT_GUARD,
): ReleaseResult => {
  const caps = capabilitiesFor(req.role);
  if (!caps.receiveStepItems) return deny('not_permitted');

  // 利用権のない相手には1問も出さない
  if (!req.entitlement.hasAccess) return deny('no_entitlement');

  if (req.itemsServedInWindow >= policy.maxItemsPerWindow) return deny('window_item_limit');

  // 短時間の異常な連打だけを止める（人の学習ペースでは当たらない）
  const since = req.nowMs - policy.burstWindowSeconds * 1000;
  const recent = req.recentRequestTimesMs.filter((t) => t > since);
  if (recent.length >= policy.burstLimit) {
    const oldest = Math.min(...recent);
    const retry = Math.ceil((oldest + policy.burstWindowSeconds * 1000 - req.nowMs) / 1000);
    return deny('rate_limited', Math.max(retry, 1));
  }

  const room = policy.maxItemsPerWindow - req.itemsServedInWindow;
  const take = Math.min(req.requestedItems.length, policy.maxItemsPerRelease, room);
  const items = req.requestedItems.slice(0, take).map((it, i) => toDeliverable(it, req.sessionId, i));

  return { allowed: true, denial: null, items, retryAfterSeconds: 0 };
};

// ─────────────────────────────────────────────────────────
// 一覧・書き出しの遮断
// ─────────────────────────────────────────────────────────

/**
 * 「順番に叩けば全部取れる」経路を作らないための判定。
 * 学習者向けAPIには**オフセット指定の一覧を用意しない**。
 * 管理者QAだけが一覧を扱える。
 */
export const canBrowseBank = (role: ContentRole): boolean => capabilitiesFor(role).browseBank;
export const canExportBank = (role: ContentRole): boolean => capabilitiesFor(role).exportBank;

/**
 * 管理者向けの一覧でも、際限なく返さない。
 * ページサイズに上限を置いて、1回のリクエストでバンクが丸ごと出ないようにする。
 */
export const ADMIN_PAGE_SIZE_MAX = 100;

export interface PageRequest {
  role: ContentRole;
  offset: number;
  limit: number;
}

export interface PageResult<T> {
  allowed: boolean;
  denial: ContentDenial | null;
  rows: T[];
  total: number;
  nextOffset: number | null;
}

export const paginateForAdmin = <T>(all: T[], req: PageRequest): PageResult<T> => {
  if (!canBrowseBank(req.role)) {
    return { allowed: false, denial: 'not_permitted', rows: [], total: 0, nextOffset: null };
  }
  const limit = Math.min(Math.max(req.limit, 1), ADMIN_PAGE_SIZE_MAX);
  const offset = Math.max(req.offset, 0);
  const rows = all.slice(offset, offset + limit);
  const next = offset + limit < all.length ? offset + limit : null;
  return { allowed: true, denial: null, rows, total: all.length, nextOffset: next };
};

// ─────────────────────────────────────────────────────────
// 学習者へ出す文言
// ─────────────────────────────────────────────────────────

/**
 * 制限に当たったときの案内。
 * 「不正をしましたね」という言い方をしない。
 * 実際に当たるのはほとんどが通信の再試行なので、まず普通の案内をする。
 */
export const denialMessage = (denial: ContentDenial, lang: 'ja' | 'zh', retryAfterSeconds = 0): string => {
  if (denial === 'no_entitlement') {
    return lang === 'zh'
      ? '当前没有可用的使用权。购买后可以马上继续。'
      : '今使える利用権がありません。購入するとすぐ続きから始められます。';
  }
  if (denial === 'window_item_limit') {
    return lang === 'zh'
      ? '这次的使用权已经出了很多题目。想继续的话，可以再购买一次。'
      : 'この利用権では、たくさんの問題を出しました。続けたいときは、もう一度ご購入いただけます。';
  }
  if (denial === 'rate_limited') {
    const s = Math.max(retryAfterSeconds, 1);
    return lang === 'zh'
      ? `请求有点密集。请等待约${s}秒后再继续。`
      : `少し立て込んでいます。${s}秒ほど待ってから続けてください。`;
  }
  return lang === 'zh' ? '此操作无法进行。' : 'この操作はできません。';
};
