// 「開いたままのタブが古いJSで動き続ける」ことの検知。2026-08-17。
//
// なぜ要るか（実際に起きた事故）:
// 「開いた瞬間に完了になる」不具合を直して本番へ出したあと、CEOの画面では直っていなかった。
// 本番の配信物は新しかったが、**開いたままだったタブが古いchunkを保持していた**ため。
// 直したはずの修正が生徒に届いていない状態を、こちらから知る術がなかった。
// 生徒はWeChat内蔵ブラウザで何日もタブを開いたままにするので、放置すると必ず再発する。
//
// 方針:
// - 自分が今どのビルドで動いているかは、読み込んだ index chunk のファイル名から取る
//   （ビルド時の埋め込みが要らない＝ビルド設定を触らずに済む）
// - 配信中のビルドは /version.json（ビルド後に generate-worker.mjs が出力）から取る
// - 違ったら**知らせるだけ**。勝手に再読み込みしない（バトルや模試の最中に飛ばさない）

/** 実行中のビルドID（index chunk のハッシュ）。分からなければ null */
export const runningBuildId = (doc: Document = document): string | null => {
  for (const el of Array.from(doc.querySelectorAll('script[src]'))) {
    const src = el.getAttribute('src') ?? '';
    const m = /assets\/index-([A-Za-z0-9_-]+)\.js/.exec(src);
    if (m) return m[1];
  }
  return null;
};

export interface VersionCheck {
  /** 実行中のビルド */
  running: string | null;
  /** 配信中のビルド */
  latest: string | null;
  /** 新しい版が出ている（どちらかが不明なら false＝**分からないときは知らせない**） */
  stale: boolean;
}

/** 配信中のビルドと比べる。取得に失敗しても投げない（知らせないだけ） */
export const checkBuildVersion = async (
  fetchFn: typeof fetch = fetch, doc: Document = document,
): Promise<VersionCheck> => {
  const running = runningBuildId(doc);
  let latest: string | null = null;
  try {
    // no-store: 判定そのものがキャッシュされたら意味がない
    const res = await fetchFn('/version.json', { cache: 'no-store' });
    if (res.ok) {
      const j: unknown = await res.json();
      const b = (j as { build?: unknown } | null)?.build;
      if (typeof b === 'string' && b.length > 0) latest = b;
    }
  } catch {
    latest = null;
  }
  return { running, latest, stale: !!running && !!latest && running !== latest };
};
