import { useState, useRef, useCallback, useEffect } from "react";

// ============================================================
// Types
// ============================================================
type PlayerType = "male" | "female";
type Team = "us" | "them";
type ArrowType = "serve" | "receive";

interface Player {
  id: string;
  type: PlayerType;
  team: Team;
  x: number;
  y: number;
  label: string;
}

interface Arrow {
  id: string;
  type: ArrowType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  curveX: number;
  curveY: number;
  color?: string;
}

type Tool = "select" | "serve-arrow" | "receive-arrow";

// ============================================================
// Constants
// ============================================================
const COURT_ASPECT = 13.4 / 6.1;
const PLAYER_R_DESKTOP = 22;
const PLAYER_R_MOBILE = 16;
const MALE_COLOR = "#2563EB";
const FEMALE_COLOR = "#EC4899";
const THEM_MALE_COLOR = "#EA580C";
const THEM_FEMALE_COLOR = "#7C3AED";

const LS_KEY = "tacticsBoard_slots";
const MAX_SLOTS = 5;

// ============================================================
// Utility
// ============================================================
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function pct(val: number, total: number) {
  return (val / total) * 100;
}

function px(pctVal: number, total: number) {
  return (pctVal / 100) * total;
}

function isCurved(arrow: Arrow) {
  const midX = (arrow.fromX + arrow.toX) / 2;
  const midY = (arrow.fromY + arrow.toY) / 2;
  return Math.abs(arrow.curveX - midX) > 0.5 || Math.abs(arrow.curveY - midY) > 0.5;
}

interface Snapshot {
  players: Player[];
  arrows: Arrow[];
}

interface SaveSlot {
  name: string;
  data: Snapshot | null;
}

function loadSlots(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return Array.from({ length: MAX_SLOTS }, (_, i) => ({ name: `スロット${i + 1}`, data: null }));
}

function saveSlots(slots: SaveSlot[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(slots));
}

// ============================================================
// SVG Arrow
// ============================================================
function ArrowShape({
  arrow,
  courtW,
  courtH,
  selected,
  onClick,
  onCurveHandleDown,
}: {
  arrow: Arrow;
  courtW: number;
  courtH: number;
  selected: boolean;
  onClick: () => void;
  onCurveHandleDown: (e: React.PointerEvent) => void;
}) {
  const x1 = px(arrow.fromX, courtW);
  const y1 = px(arrow.fromY, courtH);
  const x2 = px(arrow.toX, courtW);
  const y2 = px(arrow.toY, courtH);
  const cpx = px(arrow.curveX, courtW);
  const cpy = px(arrow.curveY, courtH);
  const isServe = arrow.type === "serve";
  const curved = isCurved(arrow);

  const tangentX = curved ? (x2 - cpx) : (x2 - x1);
  const tangentY = curved ? (y2 - cpy) : (y2 - y1);
  const angle = Math.atan2(tangentY, tangentX);
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const arrowLen = Math.min(14, len * 0.25);

  const b1x = x2 - arrowLen * Math.cos(angle - 0.4);
  const b1y = y2 - arrowLen * Math.sin(angle - 0.4);
  const b2x = x2 - arrowLen * Math.cos(angle + 0.4);
  const b2y = y2 - arrowLen * Math.sin(angle + 0.4);

  const defaultColor = isServe ? "#F59E0B" : "#10B981";
  const color = arrow.color || defaultColor;
  const strokeW = selected ? 3 : 2;

  const pathD = curved
    ? `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`
    : `M${x1},${y1} L${x2},${y2}`;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <path d={pathD} stroke="transparent" strokeWidth={16} fill="none" />
      <path
        d={pathD}
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={isServe ? "none" : "8,5"}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <polygon
        points={`${x2},${y2} ${b1x},${b1y} ${b2x},${b2y}`}
        fill={color}
        opacity={0.9}
      />
      {selected && (
        <circle
          cx={curved ? cpx : midX}
          cy={curved ? cpy : midY}
          r={8}
          fill="white" stroke={color} strokeWidth={2}
          style={{ cursor: "grab" }}
          onPointerDown={(e) => { e.stopPropagation(); onCurveHandleDown(e); }}
        />
      )}
    </g>
  );
}

// ============================================================
// Player Token
// ============================================================
function PlayerToken({
  player,
  courtW,
  courtH,
  selected,
  onPointerDown,
  radius,
}: {
  player: Player;
  courtW: number;
  courtH: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  radius: number;
}) {
  const cx = px(player.x, courtW);
  const cy = px(player.y, courtH);
  const r = radius;

  const fill = player.type === "male"
    ? (player.team === "us" ? MALE_COLOR : THEM_MALE_COLOR)
    : (player.team === "us" ? FEMALE_COLOR : THEM_FEMALE_COLOR);

  const fontSize = r >= 20 ? 14 : 11;

  return (
    <g
      onPointerDown={onPointerDown}
      style={{ cursor: "grab", userSelect: "none" }}
    >
      {selected && (
        <circle
          cx={cx} cy={cy} r={r + 4}
          fill="none" stroke="white" strokeWidth={2.5} strokeDasharray="4,3"
        />
      )}
      <circle cx={cx + 1.5} cy={cy + 1.5} r={r} fill="black" opacity={0.2} />
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeWidth={2} />
      <text
        x={cx} y={cy + 1}
        textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize={fontSize} fontWeight="bold"
        style={{ pointerEvents: "none" }}
      >
        {player.type === "male" ? "M" : "F"}
      </text>
      <text
        x={cx} y={cy + r + 11}
        textAnchor="middle"
        fill="white" fontSize={10} fontWeight="600"
        stroke="black" strokeWidth={3} paintOrder="stroke"
        style={{ pointerEvents: "none" }}
      >
        {player.label}
      </text>
    </g>
  );
}

// ============================================================
// Court SVG
// ============================================================
function CourtLines({ width, height, flipped }: { width: number; height: number; flipped: boolean }) {
  const w = width;
  const h = height;
  const lc = "#ffffff";
  const lw = 1.5;

  const TOTAL_H = 13.4;
  const TOTAL_W = 6.1;

  const net        = 6.70 / TOTAL_H;
  const ssl_top    = (6.70 - 1.98) / TOTAL_H;
  const ssl_bot    = (6.70 + 1.98) / TOTAL_H;
  const lsl_top    = 0.76 / TOTAL_H;
  const lsl_bot    = (13.4 - 0.76) / TOTAL_H;

  const singles_L  = 0.46 / TOTAL_W;
  const singles_R  = 5.64 / TOTAL_W;
  const center_x   = 3.05 / TOTAL_W;

  const topLabel = flipped ? "自分たちコート" : "相手コート";
  const botLabel = flipped ? "相手コート" : "自分たちコート";

  return (
    <>
      <defs>
        <linearGradient id="courtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a5c2a" />
          <stop offset="50%" stopColor="#1e6b30" />
          <stop offset="100%" stopColor="#1a5c2a" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#courtGrad)" rx={4} />
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={lc} strokeWidth={lw * 1.5} />
      <line x1={w * singles_L} y1={0} x2={w * singles_L} y2={h} stroke={lc} strokeWidth={lw} opacity={0.45} />
      <line x1={w * singles_R} y1={0} x2={w * singles_R} y2={h} stroke={lc} strokeWidth={lw} opacity={0.45} />
      <line x1={w * center_x} y1={h * lsl_top} x2={w * center_x} y2={h * ssl_top} stroke={lc} strokeWidth={lw} />
      <line x1={w * center_x} y1={h * ssl_bot} x2={w * center_x} y2={h * lsl_bot} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * lsl_top} x2={w} y2={h * lsl_top} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * lsl_bot} x2={w} y2={h * lsl_bot} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * ssl_top} x2={w} y2={h * ssl_top} stroke={lc} strokeWidth={lw * 1.2} />
      <line x1={0} y1={h * ssl_bot} x2={w} y2={h * ssl_bot} stroke={lc} strokeWidth={lw * 1.2} />
      <line x1={0} y1={h * net} x2={w} y2={h * net} stroke={lc} strokeWidth={3} />
      <circle cx={3} cy={h * net} r={4} fill="#ccc" />
      <circle cx={w - 3} cy={h * net} r={4} fill="#ccc" />
      <text x={w / 2} y={h * net - 5} textAnchor="middle" fill="white" fontSize={9} opacity={0.55}>NET</text>
      <text x={6} y={h * 0.22} textAnchor="start" fill="white" fontSize={10} opacity={0.45} fontWeight="bold">{topLabel}</text>
      <text x={6} y={h * 0.78} textAnchor="start" fill="white" fontSize={10} opacity={0.45} fontWeight="bold">{botLabel}</text>
    </>
  );
}

// ============================================================
// Main Component
// ============================================================
const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", type: "male", team: "us", x: 35, y: 75, label: "M1" },
  { id: "p2", type: "female", team: "us", x: 65, y: 80, label: "F1" },
  { id: "p3", type: "male", team: "them", x: 35, y: 25, label: "M2" },
  { id: "p4", type: "female", team: "them", x: 65, y: 20, label: "F2" },
];

const MAX_HISTORY = 50;

export default function TacticsBoard() {
  const [players, setPlayers] = useState<Player[]>(DEFAULT_PLAYERS);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [flipped, setFlipped] = useState(false);

  const history = useRef<Snapshot[]>([{ players: DEFAULT_PLAYERS, arrows: [] }]);
  const historyIndex = useRef(0);
  const dragStartSnapshot = useRef<Snapshot | null>(null);

  const pushHistory = useCallback((snap: Snapshot) => {
    const newHistory = history.current.slice(0, historyIndex.current + 1);
    newHistory.push(snap);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    history.current = newHistory;
    historyIndex.current = newHistory.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const snap = history.current[historyIndex.current];
    setPlayers(snap.players);
    setArrows(snap.arrows);
    setSelected(null);
  }, []);

  const redo = useCallback(() => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    const snap = history.current[historyIndex.current];
    setPlayers(snap.players);
    setArrows(snap.arrows);
    setSelected(null);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === "z" && e.shiftKey)  { e.preventDefault(); redo(); }
      if (e.key === "y")                { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo]);

  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [showLabelEdit, setShowLabelEdit] = useState(false);

  // Reset confirm state
  const [resetPending, setResetPending] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save slots
  const [slots, setSlots] = useState<SaveSlot[]>(loadSlots);
  const [showSlots, setShowSlots] = useState(false);

  const courtRef = useRef<HTMLDivElement>(null);
  const [courtSize, setCourtSize] = useState({ w: 400, h: 600 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const drawing = useRef(false);
  const drawFrom = useRef<{ x: number; y: number } | null>(null);
  const [previewArrow, setPreviewArrow] = useState<{ x: number; y: number } | null>(null);

  const dragging = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const curveDragging = useRef<string | null>(null);

  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const mobile = vw < 768;
      setIsMobile(mobile);

      if (mobile) {
        const maxH = vh * 0.62;
        const byW = vw - 16;
        const byH = maxH / COURT_ASPECT;
        const w = Math.min(byW, byH);
        setCourtSize({ w, h: w * COURT_ASPECT });
      } else {
        const panelW = 250;
        const padding = 48;
        const headerH = 100;
        const maxW = vw - panelW - padding;
        const maxH = vh - headerH;
        const wByH = maxH / COURT_ASPECT;
        const w = Math.min(maxW, wByH);
        setCourtSize({ w, h: w * COURT_ASPECT });
      }
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const getCourtPos = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = courtRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = pct(e.clientX - rect.left, rect.width);
    const y = pct(e.clientY - rect.top, rect.height);
    return { x, y };
  }, []);

  const onCourtPointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === "select") {
      setSelected(null);
      return;
    }
    const pos = getCourtPos(e);
    if (!pos) return;
    drawing.current = true;
    drawFrom.current = pos;
  }, [tool, getCourtPos]);

  const onCourtPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !drawFrom.current) return;
    const pos = getCourtPos(e);
    if (!pos) return;
    setPreviewArrow(pos);
  }, [getCourtPos]);

  const onCourtPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drawing.current || !drawFrom.current) return;
    const pos = getCourtPos(e);
    if (pos) {
      const dx = pos.x - drawFrom.current.x;
      const dy = pos.y - drawFrom.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 2) {
        const midX = (drawFrom.current.x + pos.x) / 2;
        const midY = (drawFrom.current.y + pos.y) / 2;
        const newArrow: Arrow = {
          id: uid(),
          type: tool === "serve-arrow" ? "serve" : "receive",
          fromX: drawFrom.current.x,
          fromY: drawFrom.current.y,
          toX: pos.x,
          toY: pos.y,
          curveX: midX,
          curveY: midY,
        };
        setArrows((prev) => {
          const next = [...prev, newArrow];
          pushHistory({ players, arrows: next });
          return next;
        });
        setSelected(newArrow.id);
      }
    }
    drawing.current = false;
    drawFrom.current = null;
    setPreviewArrow(null);
  }, [tool, getCourtPos, players, pushHistory]);

  const onCurveHandleDown = useCallback((e: React.PointerEvent, arrowId: string) => {
    curveDragging.current = arrowId;
    dragStartSnapshot.current = { players, arrows };
  }, [players, arrows]);

  const onPlayerPointerDown = useCallback((e: React.PointerEvent, playerId: string) => {
    e.stopPropagation();
    if (tool !== "select") return;
    setSelected(playerId);
    dragging.current = playerId;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const pos = getCourtPos(e);
    if (!pos) return;
    dragOffset.current = { x: pos.x - player.x, y: pos.y - player.y };
    dragStartSnapshot.current = { players, arrows };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [tool, players, arrows, getCourtPos]);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (curveDragging.current) {
        const pos = getCourtPos(e);
        if (!pos) return;
        setArrows((prev) =>
          prev.map((a) => a.id === curveDragging.current ? { ...a, curveX: pos.x, curveY: pos.y } : a)
        );
        return;
      }
      if (!dragging.current) return;
      const pos = getCourtPos(e);
      if (!pos) return;
      const x = Math.max(0, Math.min(100, pos.x - dragOffset.current.x));
      const y = Math.max(0, Math.min(100, pos.y - dragOffset.current.y));
      setPlayers((prev) =>
        prev.map((p) => p.id === dragging.current ? { ...p, x, y } : p)
      );
    };
    const handleUp = () => {
      if (curveDragging.current) {
        setArrows((currentArrows) => {
          setPlayers((currentPlayers) => {
            pushHistory({ players: currentPlayers, arrows: currentArrows });
            return currentPlayers;
          });
          return currentArrows;
        });
        curveDragging.current = null;
        dragStartSnapshot.current = null;
        return;
      }
      if (dragging.current && dragStartSnapshot.current) {
        setPlayers((currentPlayers) => {
          setArrows((currentArrows) => {
            pushHistory({ players: currentPlayers, arrows: currentArrows });
            return currentArrows;
          });
          return currentPlayers;
        });
        dragStartSnapshot.current = null;
      }
      dragging.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [getCourtPos, pushHistory]);

  const addPlayer = (type: PlayerType, team: Team) => {
    const count = players.filter((p) => p.type === type && p.team === team).length + 1;
    const lbl = `${type === "male" ? "M" : "F"}${count}`;
    const newP: Player = {
      id: uid(), type, team,
      x: 50,
      y: team === "us" ? 85 : 15,
      label: lbl,
    };
    const nextPlayers = [...players, newP];
    setPlayers(nextPlayers);
    setSelected(newP.id);
    pushHistory({ players: nextPlayers, arrows });
  };

  const deleteSelected = () => {
    if (!selected) return;
    const nextPlayers = players.filter((p) => p.id !== selected);
    const nextArrows = arrows.filter((a) => a.id !== selected);
    setPlayers(nextPlayers);
    setArrows(nextArrows);
    setSelected(null);
    pushHistory({ players: nextPlayers, arrows: nextArrows });
  };

  const toggleArrowRed = (arrowId: string) => {
    const arrow = arrows.find((a) => a.id === arrowId);
    if (!arrow) return;
    const newColor = arrow.color === "#EF4444" ? undefined : "#EF4444";
    const nextArrows = arrows.map((a) => a.id === arrowId ? { ...a, color: newColor } : a);
    setArrows(nextArrows);
    pushHistory({ players, arrows: nextArrows });
  };

  const resetCurve = (arrowId: string) => {
    const arrow = arrows.find((a) => a.id === arrowId);
    if (!arrow) return;
    const midX = (arrow.fromX + arrow.toX) / 2;
    const midY = (arrow.fromY + arrow.toY) / 2;
    const nextArrows = arrows.map((a) => a.id === arrowId ? { ...a, curveX: midX, curveY: midY } : a);
    setArrows(nextArrows);
    pushHistory({ players, arrows: nextArrows });
  };

  // Flip court
  const flipCourt = () => {
    const nextPlayers = players.map((p) => ({ ...p, y: 100 - p.y }));
    const nextArrows = arrows.map((a) => ({
      ...a,
      fromY: 100 - a.fromY,
      toY: 100 - a.toY,
      curveY: 100 - a.curveY,
    }));
    setPlayers(nextPlayers);
    setArrows(nextArrows);
    setFlipped((f) => !f);
    pushHistory({ players: nextPlayers, arrows: nextArrows });
  };

  // Reset with confirm
  const handleReset = () => {
    if (!resetPending) {
      setResetPending(true);
      resetTimer.current = setTimeout(() => setResetPending(false), 3000);
      return;
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetPending(false);
    setPlayers(DEFAULT_PLAYERS);
    setArrows([]);
    setSelected(null);
    setFlipped(false);
    history.current = [{ players: DEFAULT_PLAYERS, arrows: [] }];
    historyIndex.current = 0;
  };

  // Save/Load slots
  const saveToSlot = (index: number) => {
    const next = [...slots];
    next[index] = { ...next[index], data: { players, arrows } };
    setSlots(next);
    saveSlots(next);
  };

  const loadFromSlot = (index: number) => {
    const slot = slots[index];
    if (!slot.data) return;
    setPlayers(slot.data.players);
    setArrows(slot.data.arrows);
    setSelected(null);
    pushHistory(slot.data);
  };

  const saveImage = useCallback(async () => {
    const svgEl = courtRef.current?.querySelector("svg.composite") as SVGSVGElement | null;
    if (!svgEl) return;

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const scale = 2;
    const cw = courtSize.w * scale;
    const ch = courtSize.h * scale;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, courtSize.w, courtSize.h);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `tactics-${Date.now()}.png`;
      a.click();
    };
    img.src = url;
  }, [courtSize]);

  const canUndo = historyIndex.current > 0;
  const canRedo = historyIndex.current < history.current.length - 1;
  const selectedPlayer = players.find((p) => p.id === selected);
  const selectedArrow = arrows.find((a) => a.id === selected);

  const TOOLS: { key: Tool; label: string; color: string }[] = [
    { key: "select", label: "✋ 選択・移動", color: "#6B7280" },
    { key: "serve-arrow", label: "⚡ サーブ矢印", color: "#D97706" },
    { key: "receive-arrow", label: "↩ レシーブ矢印", color: "#059669" },
  ];

  return (
    <div style={{
      height: "calc(100vh - 64px)",
      background: "#111827",
      color: "white",
      fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* ===== ヘッダー ===== */}
      <div style={{
        padding: "6px 12px",
        borderBottom: "1px solid #1F2937",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#60A5FA" }}>
          🏸 戦術ボード
        </h2>
        <span style={{ fontSize: 10, color: "#4B5563" }}>kawabado.com</span>
      </div>

      {/* ===== メインエリア ===== */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: isMobile ? undefined : "center",
        alignItems: isMobile ? undefined : "flex-start",
        overflow: "hidden",
        gap: isMobile ? 0 : 16,
        padding: isMobile ? 0 : "0 24px",
      }}>
        {/* ---- コートエリア ---- */}
        <div style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px",
          background: "#0F172A",
          borderRadius: isMobile ? 0 : 8,
          marginTop: isMobile ? 0 : 8,
        }}>
          <div
            ref={courtRef}
            onPointerDown={onCourtPointerDown}
            onPointerMove={onCourtPointerMove}
            onPointerUp={onCourtPointerUp}
            style={{
              width: courtSize.w,
              height: courtSize.h,
              position: "relative",
              borderRadius: 6,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
              cursor: tool !== "select" ? "crosshair" : "default",
              touchAction: "none",
              flexShrink: 0,
            }}
          >
            <svg
              className="composite"
              viewBox={`0 0 ${courtSize.w} ${courtSize.h}`}
              width={courtSize.w}
              height={courtSize.h}
              style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
            >
              <CourtLines width={courtSize.w} height={courtSize.h} flipped={flipped} />
              {arrows.map((arrow) => (
                <ArrowShape
                  key={arrow.id}
                  arrow={arrow}
                  courtW={courtSize.w}
                  courtH={courtSize.h}
                  selected={selected === arrow.id}
                  onClick={() => { if (tool === "select") setSelected(arrow.id); }}
                  onCurveHandleDown={(e) => onCurveHandleDown(e, arrow.id)}
                />
              ))}
              {drawing.current && drawFrom.current && previewArrow && (
                <line
                  x1={px(drawFrom.current.x, courtSize.w)}
                  y1={px(drawFrom.current.y, courtSize.h)}
                  x2={px(previewArrow.x, courtSize.w)}
                  y2={px(previewArrow.y, courtSize.h)}
                  stroke={tool === "serve-arrow" ? "#F59E0B" : "#10B981"}
                  strokeWidth={2}
                  strokeDasharray={tool === "receive-arrow" ? "8,5" : "none"}
                  opacity={0.6}
                />
              )}
              {players.map((player) => (
                <PlayerToken
                  key={player.id}
                  player={player}
                  courtW={courtSize.w}
                  courtH={courtSize.h}
                  selected={selected === player.id}
                  onPointerDown={(e) => onPlayerPointerDown(e, player.id)}
                  radius={isMobile ? PLAYER_R_MOBILE : PLAYER_R_DESKTOP}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* ---- コントロールパネル ---- */}
        <div style={{
          flex: isMobile ? 1 : "0 0 240px",
          overflowY: "auto",
          padding: isMobile ? "10px 10px" : "10px 0",
          display: "flex",
          flexDirection: isMobile ? "row" : "column",
          flexWrap: isMobile ? "wrap" : undefined,
          gap: isMobile ? 10 : 8,
          minWidth: 0,
          marginTop: isMobile ? 0 : 8,
        }}>
          {/* ツール選択 */}
          <div>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>モード</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TOOLS.map(({ key, label: btnLabel, color }) => {
                const active = tool === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTool(key)}
                    style={{
                      padding: "7px 10px", borderRadius: 7,
                      border: active ? "none" : "2px solid transparent",
                      background: active ? color : "#1F2937",
                      color: active ? "white" : "#9CA3AF",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {btnLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 凡例 */}
          <div style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 18, height: 2.5, background: "#F59E0B", borderRadius: 2, flexShrink: 0 }} />
              サーブ（実線）
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 18, height: 2.5, flexShrink: 0,
                backgroundImage: "repeating-linear-gradient(90deg,#10B981 0,#10B981 5px,transparent 5px,transparent 9px)" }} />
              レシーブ（点線）
            </div>
          </div>

          {/* 選択中アイテム */}
          {selected && (
            <div style={{
              background: "#1F2937", borderRadius: 8, padding: "8px 10px",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              {selectedPlayer && (
                <>
                  <div style={{ fontSize: 11, color: "#D1D5DB" }}>
                    <b>{selectedPlayer.label}</b>（{selectedPlayer.type === "male" ? "男性" : "女性"} / {selectedPlayer.team === "us" ? "自分側" : "相手側"}）
                  </div>
                  {showLabelEdit ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setPlayers((prev) => prev.map((p) => p.id === selected ? { ...p, label } : p));
                            setShowLabelEdit(false);
                          }
                        }}
                        style={{
                          flex: 1, padding: "4px 6px", borderRadius: 4,
                          border: "1px solid #4B5563", background: "#111827",
                          color: "white", fontSize: 12,
                        }}
                        autoFocus
                      />
                      <button onClick={() => {
                        setPlayers((prev) => prev.map((p) => p.id === selected ? { ...p, label } : p));
                        setShowLabelEdit(false);
                      }} style={smallBtn("#2563EB")}>保存</button>
                    </div>
                  ) : (
                    <button onClick={() => { setLabel(selectedPlayer.label); setShowLabelEdit(true); }} style={smallBtn("#374151")}>名前変更</button>
                  )}
                </>
              )}
              {selectedArrow && (
                <>
                  <div style={{ fontSize: 11, color: "#D1D5DB" }}>
                    {selectedArrow.type === "serve" ? "⚡ サーブ矢印" : "↩ レシーブ矢印"}
                    {selectedArrow.color === "#EF4444" && <span style={{ color: "#EF4444", marginLeft: 6 }}>（赤）</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: -2 }}>
                    ○ハンドルをドラッグで湾曲
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => toggleArrowRed(selectedArrow.id)}
                      style={{
                        ...smallBtn(selectedArrow.color === "#EF4444" ? "#EF4444" : "#374151"),
                        flex: 1,
                      }}
                    >
                      {selectedArrow.color === "#EF4444" ? "🔴 赤を解除" : "🔴 赤に変更"}
                    </button>
                    {isCurved(selectedArrow) && (
                      <button
                        onClick={() => resetCurve(selectedArrow.id)}
                        style={{ ...smallBtn("#374151"), flex: 1 }}
                      >
                        直線に戻す
                      </button>
                    )}
                  </div>
                </>
              )}
              <button onClick={deleteSelected} style={smallBtn("#DC2626")}>🗑 削除</button>
            </div>
          )}

          {/* プレイヤー追加 */}
          <div>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>プレイヤー追加</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[
                { type: "male" as PlayerType, team: "us" as Team, label: "＋男性（自）", color: MALE_COLOR },
                { type: "female" as PlayerType, team: "us" as Team, label: "＋女性（自）", color: FEMALE_COLOR },
                { type: "male" as PlayerType, team: "them" as Team, label: "＋男性（相）", color: THEM_MALE_COLOR },
                { type: "female" as PlayerType, team: "them" as Team, label: "＋女性（相）", color: THEM_FEMALE_COLOR },
              ].map(({ type, team, label: btnLabel, color }) => (
                <button
                  key={`${type}-${team}`}
                  onClick={() => addPlayer(type, team)}
                  style={{
                    padding: "6px 4px", borderRadius: 6, border: `1.5px solid ${color}55`,
                    background: color + "22", color: color,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {btnLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Undo/Redo */}
          <div>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>履歴</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={undo} disabled={!canUndo} title="⌘Z"
                style={{ ...smallBtn("#374151"), flex: 1, opacity: canUndo ? 1 : 0.35 }}>↩ 戻す</button>
              <button onClick={redo} disabled={!canRedo} title="⌘⇧Z"
                style={{ ...smallBtn("#374151"), flex: 1, opacity: canRedo ? 1 : 0.35 }}>↪ 進む</button>
            </div>
          </div>

          {/* 操作 */}
          <div>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>操作</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={flipCourt} style={smallBtn("#374151")}>↕ 反転</button>
              <button onClick={() => { setArrows([]); pushHistory({ players, arrows: [] }); }}
                style={smallBtn("#374151")}>矢印クリア</button>
              <button
                onClick={handleReset}
                style={smallBtn(resetPending ? "#DC2626" : "#374151")}
              >
                {resetPending ? "本当にリセット？" : "リセット"}
              </button>
              <button onClick={saveImage} style={{
                padding: "8px", borderRadius: 7,
                background: "#2563EB", color: "white",
                border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>📷 画像保存</button>
            </div>
          </div>

          {/* フォーメーション保存・読み込み */}
          <div>
            <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>保存スロット</span>
              <button
                onClick={() => setShowSlots(!showSlots)}
                style={{ background: "none", border: "none", color: "#6B7280", fontSize: 10, cursor: "pointer", padding: 0 }}
              >
                {showSlots ? "▲ 閉じる" : "▼ 開く"}
              </button>
            </div>
            {showSlots && (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {slots.map((slot, i) => (
                  <div key={i} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#9CA3AF", width: 58, flexShrink: 0 }}>
                      {slot.name}
                    </span>
                    <button
                      onClick={() => saveToSlot(i)}
                      style={{ ...smallBtn("#374151"), flex: 1, fontSize: 10, padding: "4px 6px" }}
                    >保存</button>
                    <button
                      onClick={() => loadFromSlot(i)}
                      disabled={!slot.data}
                      style={{ ...smallBtn("#374151"), flex: 1, fontSize: 10, padding: "4px 6px", opacity: slot.data ? 1 : 0.35 }}
                    >読込</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ショートカットヒント */}
          <div style={{ fontSize: 9, color: "#4B5563", lineHeight: 1.7, marginTop: "auto", paddingTop: 8 }}>
            ⌘Z / Ctrl+Z → 元に戻す<br />
            ⌘⇧Z / Ctrl+Y → やり直す
          </div>
        </div>
      </div>
    </div>
  );
}

function smallBtn(bg: string): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 6, border: "none",
    background: bg, color: "white",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}
