// objectPath → 短時間signed URL のReact hook。path変更時のみ再取得・アンマウント後set防止。
import { useEffect, useState } from 'react';
import { getAvatarSignedUrl } from './avatarStorage';

export const usePrivateAvatarUrl = (path: string | null | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // effect内で同期setStateしない（microtask経由）。古いeffectは alive=false で無効化される
    void Promise.resolve()
      .then(() => (path ? getAvatarSignedUrl(path) : null))
      .then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  return url;
};
