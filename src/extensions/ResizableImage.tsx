import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useRef } from 'react';

// ── リサイズハンドル付き画像ビュー ──────────────────────────
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const img = imgRef.current;
    if (!img) return;

    const startWidth = img.offsetWidth;
    const maxWidth = img.parentElement?.offsetWidth || 800;

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.round(
        Math.max(80, Math.min(startWidth + (ev.clientX - startX), maxWidth))
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

  const width = node.attrs.width ?? 400;

  return (
    <NodeViewWrapper
      style={{
        display: 'inline-block',
        position: 'relative',
        maxWidth: '100%',
        lineHeight: 0,
      }}
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        draggable={false}
        style={{
          width: `${width}px`,
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: '0.5rem',
          outline: selected ? '2px solid #3b82f6' : '2px solid transparent',
          outlineOffset: '2px',
          cursor: 'default',
          userSelect: 'none',
        }}
      />
      {/* リサイズハンドル（選択中のみ表示） */}
      {selected && (
        <div
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
      width: {
        default: 400,
        parseHTML: el => {
          const w = el.getAttribute('width') || el.style.width;
          return w ? parseInt(w) : 400;
        },
        renderHTML: attrs => ({
          width: attrs.width,
          style: `width: ${attrs.width}px; max-width: 100%; height: auto;`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { style: `width: ${HTMLAttributes.width ?? 400}px; max-width: 100%; height: auto; border-radius: 0.5rem;` })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
