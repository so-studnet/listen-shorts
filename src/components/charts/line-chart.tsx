"use client";
/**
 * 1系列の折れ線（0〜100%）。指で触る・マウスを乗せると、その点の縦線と数値を出す。
 * 値のない点（解答がない週）は線を切る。最後の点の値だけ直接ラベルを付ける。
 */
import { useRef, useState } from "react";
import { useWidth } from "./use-width";

export type LinePoint = {
  /** 横軸の目盛り（例：11/23） */
  label: string;
  /** 0〜1。null は値なし */
  value: number | null;
  /** ツールチップの2行目（例：12問中 8問正解） */
  detail: string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function LineChart({
  points,
  height = 160,
  compact = false,
  label,
}: {
  points: LinePoint[];
  height?: number;
  /** 小さく並べる用（目盛りを減らす） */
  compact?: boolean;
  /** 読み上げ用の説明 */
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const pad = compact
    ? { top: 8, right: 36, bottom: 16, left: 4 }
    : { top: 12, right: 40, bottom: 22, left: 34 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const n = points.length;
  const x = (i: number) => pad.left + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => pad.top + h - v * h;

  // 値のある点が続く区間ごとに線を引く
  const segments: number[][] = [];
  let cur: number[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(i);
  });
  if (cur.length) segments.push(cur);

  const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true);
  const ticks = compact ? [0, 1] : [0, 0.5, 1];
  const xLabels = compact ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el || n === 0) return;
    const rx = clientX - el.getBoundingClientRect().left;
    const i = Math.round(((rx - pad.left) / Math.max(1, w)) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const a = active !== null ? points[active] : null;

  return (
    <div
      ref={ref}
      className="relative w-full touch-pan-y select-none"
      style={{ height }}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={pad.left + w}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"}
                strokeWidth={1}
              />
              {!compact && (
                <text
                  x={pad.left - 6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--viz-muted)"
                >
                  {pct(t)}
                </text>
              )}
            </g>
          ))}
          {xLabels
            .filter((i, k, all) => i >= 0 && all.indexOf(i) === k)
            .map((i) => (
              <text
                key={i}
                x={x(i)}
                y={height - 4}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                fontSize={compact ? 10 : 11}
                fill="var(--viz-muted)"
              >
                {points[i]?.label}
              </text>
            ))}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={pad.top}
              y2={pad.top + h}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          )}
          {segments.map((seg) => (
            <polyline
              key={seg[0]}
              points={seg.map((i) => `${x(i)},${y(points[i].value!)}`).join(" ")}
              fill="none"
              stroke="var(--viz-series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {points.map((p, i) =>
            p.value === null ? null : (
              <circle
                key={i}
                cx={x(i)}
                cy={y(p.value)}
                r={active === i ? 5 : 4}
                fill="var(--viz-series-1)"
                stroke="var(--background)"
                strokeWidth={2}
              />
            ),
          )}
          {lastIdx >= 0 && (
            <text
              x={x(lastIdx) + 7}
              y={y(points[lastIdx].value!)}
              dominantBaseline="middle"
              fontSize={compact ? 10 : 11}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {pct(points[lastIdx].value!)}
            </text>
          )}
        </svg>
      )}
      {a && active !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-zinc-200 bg-[var(--background)] px-2 py-1 text-xs shadow-sm dark:border-zinc-700"
          style={{
            left: Math.min(Math.max(0, x(active) - 60), Math.max(0, width - 120)),
            width: 120,
          }}
        >
          <div className="font-bold">
            {a.label}：{a.value === null ? "解答なし" : pct(a.value)}
          </div>
          <div className="text-zinc-600 dark:text-zinc-400">{a.detail}</div>
        </div>
      )}
    </div>
  );
}
