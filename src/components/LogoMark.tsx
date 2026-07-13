// かわバドのロゴマーク（CEO支給のブランド画像版）。
// 元画像1024pxを192px/WebP(約5KB)に軽量化して配信し、表示は32〜40px。
// Header / Footer で共通使用。faviconも同画像から生成（public/favicon.png）。

export const LogoMark = ({ className = 'h-9 w-9' }: { className?: string }) => (
  <img
    src="/logo-192.webp"
    alt=""
    aria-hidden="true"
    width={192}
    height={192}
    decoding="async"
    className={`${className} rounded-lg object-cover select-none`}
    draggable={false}
  />
);
