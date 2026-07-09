/* eslint-disable react-refresh/only-export-components */
// TipTapノード定義ファイル（Reactコンポーネント専用ではないため fast-refresh ルールを除外）
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

type Align = 'left' | 'center' | 'right' | 'full';

// 配置 → ラッパーのスタイル（本文表示側 dangerouslySetInnerHTML でもそのまま効くよう
// renderHTML と揃える）
function wrapperStyleFor(align: Align): string {
  if (align === 'center') return 'display:block; text-align:center;';
  if (align === 'right') return 'display:block; text-align:right;';
  if (align === 'full') return 'display:block;';
  return 'display:block; text-align:left;';
}

// ── リサイズ＆配置ハンドル付き画像ビュー ──────────────────────
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const align: Align = node.attrs.align ?? 'left';
  const isFull = align === 'full';
  const width = node.attrs.width ?? 400;

  const startResize = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const img = imgRef.current;
    if (!img) return;
    const startWidth = img.offsetWidth;
    const maxWidth = img.parentElement?.parentElement?.offsetWidth || 800;
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.round(
        Math.max(80, Math.min(startWidth + (ev.clientX - startX), maxWidth)),
      );
      updateAttributes({ width: newWidth });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const alignBtns: { key: Align; label: string; title: string }[] = [
    { key: 'left', label: '⬅', title: '左寄せ' },
    { key: 'center', label: '⬛', title: '中央' },
    { key: 'right', label: '➡', title: '右寄せ' },
    { key: 'full', label: '↔', title: '全幅' },
  ];

  return (
    <NodeViewWrapper
      style={{ display: 'block', textAlign: align === 'full' ? 'left' : align }}
    >
      <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
        {/* 配置ツールバー（選択中のみ） */}
        {selected && (
          <span
            contentEditable={false}
            style={{
              position: 'absolute',
              top: -34,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 2,
              padding: 3,
              background: '#1e293b',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              zIndex: 20,
              whiteSpace: 'nowrap',
            }}
          >
            {alignBtns.map((b) => (
              <button
                key={b.key}
                type="button"
                title={b.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ align: b.key });
                }}
                style={{
                  width: 26,
                  height: 24,
                  border: 'none',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: '24px',
                  background: align === b.key ? '#3b82f6' : 'transparent',
                  color: '#fff',
                }}
              >
                {b.label}
              </button>
            ))}
          </span>
        )}
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          draggable={false}
          style={{
            width: isFull ? '100%' : `${width}px`,
            maxWidth: '100%',
            height: 'auto',
            display: 'inline-block',
            borderRadius: '0.5rem',
            outline: selected ? '2px solid #3b82f6' : '2px solid transparent',
            outlineOffset: '2px',
            userSelect: 'none',
          }}
        />
        {/* リサイズハンドル（全幅時は不要） */}
        {selected && !isFull && (
          <span
            contentEditable={false}
            onMouseDown={startResize}
            title="ドラッグしてリサイズ"
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              width: 14,
              height: 14,
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              borderRadius: 3,
              cursor: 'se-resize',
              zIndex: 10,
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        )}
      </span>
    </NodeViewWrapper>
  );
}

// ── ResizableImage Tiptap ノード ────────────────────────────
export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      align: {
        default: 'left',
        parseHTML: (el) => (el.getAttribute('data-align') as Align) || 'left',
        renderHTML: (attrs) => ({ 'data-align': attrs.align }),
      },
      width: {
        default: 400,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || el.style.width;
          return w ? parseInt(w) : 400;
        },
        renderHTML: (attrs) => ({ width: attrs.width }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const align: Align = HTMLAttributes.align ?? 'left';
    const width = HTMLAttributes.width ?? 400;
    const imgStyle =
      align === 'full'
        ? 'width:100%; max-width:100%; height:auto; border-radius:0.5rem; display:inline-block;'
        : `width:${width}px; max-width:100%; height:auto; border-radius:0.5rem; display:inline-block;`;
    // ブロック要素でラップして配置を表現（本文表示側でもそのまま効く）
    return [
      'span',
      { style: `${wrapperStyleFor(align)} margin: 0.75rem 0;` },
      ['img', mergeAttributes(HTMLAttributes, { style: imgStyle })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
