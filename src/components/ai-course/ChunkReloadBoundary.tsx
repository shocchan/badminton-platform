// 本番を更新した瞬間に開いていたタブを、真っ白にしない（2026-08-22）。
//
// 何が起きるか:
//   画面は必要になったときに部品（chunk）を追加で読み込む。ファイル名にはビルドごとの
//   ハッシュが入るので、**開いたままのタブが古い名前を要求する**ことがある。
//   Cloudflare Pages は古いファイルをしばらく残すが、**古いものから消える**。
//   実測（2026-08-22 本番）: 直前のビルドの部品は残っていたが、
//   `AdminPage-CEnAJfy7.js` は 404 だった＝消えるものは実際に消える。
//   読み込みに失敗すると React は描画を投げ、受け止める人がいないと**画面ごと真っ白**になる。
//
// 方針:
//   - 部品の読み込み失敗だけは「新しい版が出た」ことが原因と分かるので、**1回だけ自動で読み込み直す**
//     （読み込み直せば新しい名前の部品を取りに行く＝それで直る）
//   - 同じセッションで何度も繰り返さない（無限リロードを作らない）。2回目からは本人に押してもらう
//   - それ以外のエラーは自動で何もしない。押せるボタンと「記録は消えない」ことだけ伝える
//   - 学習の記録は step ごとにサーバーへ保存済みなので、読み込み直しで失われるのは
//     「やりかけの1問」だけ（この画面はもう描画できないので、待っても取り戻せない）
import { Component, type ErrorInfo, type ReactNode } from 'react';

/** 部品の読み込み失敗か（ブラウザごとに文言が違うので広めに見る） */
export const isChunkLoadError = (err: unknown): boolean => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
  return /dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically/i
    .test(msg);
};

const RELOAD_KEY = 'aiCourse.chunkReloadedAt';
/** この時間内に自動リロード済みなら、もう自動ではやらない（ループ防止） */
const RELOAD_COOLDOWN_MS = 60_000;

/** 自動で読み込み直してよいか。sessionStorage が使えない環境では false（＝手動に倒す） */
export const shouldAutoReload = (now: number, storage: Pick<Storage, 'getItem' | 'setItem'> | null): boolean => {
  if (!storage) return false;
  try {
    const prev = Number(storage.getItem(RELOAD_KEY) ?? '0');
    if (Number.isFinite(prev) && now - prev < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
};

interface Props {
  children: ReactNode;
  lang: 'ja' | 'zh';
  /** テスト用。既定は本物の location.reload */
  onReload?: () => void;
  /** テスト用。既定は sessionStorage */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** テスト用。既定は Date.now */
  now?: () => number;
}
interface State { error: Error | null }

export class ChunkReloadBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 原因を残す（本文・個人情報は出さない）
    console.error('[ai-course] render error', error.name, error.message, info.componentStack?.slice(0, 300));
    if (!isChunkLoadError(error)) return;
    const storage = this.props.storage !== undefined
      ? this.props.storage
      : (typeof window === 'undefined' ? null : window.sessionStorage);
    const now = (this.props.now ?? Date.now)();
    if (!shouldAutoReload(now, storage)) return;
    const reload = this.props.onReload ?? (() => { window.location.reload(); });
    reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const zh = this.props.lang === 'zh';
    const chunk = isChunkLoadError(error);
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center" role="alert">
        <p className="text-lg font-bold text-gray-900">
          {chunk
            ? (zh ? '应用有新版本了' : 'アプリの新しい版が出ています')
            : (zh ? '这个画面无法显示' : 'この画面を表示できませんでした')}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {chunk
            ? (zh
              ? '你打开的还是旧版本，所以这个画面读取失败了。重新加载就会恢复。学习记录不会消失。'
              : '開いていたのが前の版だったため、この画面の読み込みに失敗しました。読み込み直すと直ります。学習の記録は消えません。')
            : (zh
              ? '请重新加载试试。如果还是不行，请联系老师。学习记录不会消失。'
              : '読み込み直すと直ることがあります。続くときは先生に連絡してください。学習の記録は消えません。')}
        </p>
        <button type="button"
          className="mt-8 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white hover:bg-blue-700 active:bg-blue-800"
          onClick={() => (this.props.onReload ?? (() => { window.location.reload(); }))()}>
          {zh ? '重新加载' : '読み込み直す'}
        </button>
      </div>
    );
  }
}
