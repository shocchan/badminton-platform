// 教材をサーバーから受け取る client 側の入口（P0）。
//
// client には教材が無い。必要になったらここで取りに行く。
// **画面から直接 fetch を書かない**。ここを唯一の入口にしておくと、
// 「どこかで生の fetch を書いて認証を忘れる」経路が生まれない。
//
// 返ってくるのは今のstepぶんだけ（最大5件）。バンク全体は決して来ない。

export interface DeliveredContentItem {
  /** 配信ごとに変わる一時ID。集めても元のバンクを再構成できない */
  deliveryId: string;
  prompt: string;
  /** 文字列。内部の choiceId は含まない */
  choices: string[];
  /** `c0`〜`c3` の位置ID */
  correctChoiceId: string;
  explanationJa: string;
  explanationZh: string;
  promptZh: string | null;
  /** 読解の本文。それ以外は null */
  passageJa: string | null;
}

export interface DeliveredStepResponse {
  stageId: string;
  stepIndex: number;
  items: DeliveredContentItem[];
  hasNextStep: boolean;
}

/** 断られた理由。画面はこれを見て文言を出す（salesHelp の文言と対応させる） */
export type ContentFetchDenial =
  | 'unauthenticated'
  | 'invalid_session'
  | 'session_not_owned'
  | 'no_entitlement'
  | 'trial_not_started'
  | 'trial_expired'
  | 'trial_consumed'
  | 'stage_locked'
  | 'step_out_of_range'
  | 'rate_limited'
  | 'unavailable'
  | 'network';

export type ContentFetchResult =
  | { ok: true; step: DeliveredStepResponse }
  | { ok: false; denial: ContentFetchDenial; retryAfterSeconds: number };

export interface ContentFetchInput {
  /** Supabase の access token */
  accessToken: string;
  /** サーバーが署名したセッショントークン。client では中身を作れない */
  sessionToken: string;
  stepIndex: number;
  count?: number;
}

export interface ContentClientDeps {
  fetchFn?: typeof fetch;
  /** テスト用。既定は同一オリジン */
  baseUrl?: string;
}

const CONTENT_PATH = '/api/ai-course/content';

/**
 * 今のstepの教材を取る。
 *
 * 失敗を例外にしない。教材が来ない理由は「期限切れ」「利用権なし」など
 * **学習者へそのまま見せる意味のある状態**なので、戻り値で返して画面に判断させる。
 */
export const fetchStepContent = async (
  input: ContentFetchInput,
  deps: ContentClientDeps = {},
): Promise<ContentFetchResult> => {
  const doFetch = deps.fetchFn ?? fetch;
  const url = `${deps.baseUrl ?? ''}${CONTENT_PATH}`;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        sessionToken: input.sessionToken,
        stepIndex: input.stepIndex,
        count: input.count,
      }),
    });
  } catch {
    // 通信断。学習中に一時的に起きるので、拒否ではなく再試行できる扱いにする
    return { ok: false, denial: 'network', retryAfterSeconds: 3 };
  }

  if (res.ok) {
    try {
      return { ok: true, step: await res.json() as DeliveredStepResponse };
    } catch {
      return { ok: false, denial: 'unavailable', retryAfterSeconds: 3 };
    }
  }

  const retryAfter = Number(res.headers.get('Retry-After') ?? 0) || 0;
  let denial: ContentFetchDenial = 'unavailable';
  try {
    const body = await res.json() as { error?: string };
    if (body?.error) denial = body.error as ContentFetchDenial;
  } catch { /* 本文が読めないときは status から決める */ }

  if (res.status === 401) denial = 'unauthenticated';
  if (res.status === 429) denial = 'rate_limited';

  return { ok: false, denial, retryAfterSeconds: retryAfter || (res.status === 429 ? 30 : 0) };
};

/**
 * 「もう一度やれば直る」種類の拒否か。
 * 再試行してよいのは通信と混雑だけ。利用権や期限は再試行しても直らないので、
 * ここで false にして無駄な再試行ループを作らない。
 */
export const isRetryable = (denial: ContentFetchDenial): boolean =>
  denial === 'network' || denial === 'rate_limited' || denial === 'unavailable';
