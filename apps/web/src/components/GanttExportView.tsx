// 이미지 내보내기 전용 정적 간트. 스크롤/드래그/hover/오늘선 없음.
// Tailwind dark: 대신 theme prop 기반 인라인 색을 써서 전역 테마와 독립적으로 그린다.
import type { NodeTreeItem } from '@sam/shared';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeActiveRange,
  computeHeaderCells,
  flattenTree,
  barRect,
  type TimelineUnit,
} from '../lib/ganttLayout';
import type { Theme } from '../lib/theme';
import { FolderIcon, ItemIcon } from './Icons';

export const EXPORT_ROOT_ID = 'gantt-export-root';

interface Palette {
  pageBg: string;
  rowBorder: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  labelText: string;
  progressText: string;
  groupBarBorder: string;
  groupBarBg: string;
  groupFill: string;
  itemBarBorder: string;
  itemBarBg: string;
  itemFill: string;
}

// Tailwind 팔레트를 화면 Timeline 과 최대한 맞춘 고정 색.
const LIGHT: Palette = {
  pageBg: '#ffffff',
  rowBorder: '#f1f5f9', // slate-100
  headerBg: '#f8fafc', // slate-50
  headerBorder: '#e2e8f0', // slate-200
  headerText: '#475569', // slate-600
  labelText: '#0f172a', // slate-900
  progressText: '#64748b', // slate-500
  groupBarBorder: '#c4b5fd', // violet-300
  groupBarBg: '#ede9fe', // violet-100
  groupFill: '#a78bfa', // violet-400
  itemBarBorder: '#38bdf8', // sky-400
  itemBarBg: '#e0f2fe', // sky-100
  itemFill: '#0ea5e9', // sky-500
};

const DARK: Palette = {
  pageBg: '#0f172a', // slate-900
  rowBorder: '#1e293b', // slate-800
  headerBg: '#1e293b', // slate-800
  headerBorder: '#334155', // slate-700
  headerText: '#94a3b8', // slate-400
  labelText: '#e2e8f0', // slate-200
  progressText: '#94a3b8', // slate-400
  groupBarBorder: '#6d28d9', // violet-700
  groupBarBg: 'rgba(76,29,149,0.4)', // violet-900/40
  groupFill: 'rgba(167,139,250,0.7)', // violet-400/70
  itemBarBorder: '#0369a1', // sky-700
  itemBarBg: 'rgba(12,74,110,0.4)', // sky-900/40
  itemFill: 'rgba(14,165,233,0.8)', // sky-500/80
};

export interface GanttExportViewProps {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  collapsedIds: Set<string>;
  theme: Theme;
  labelWidth: number;
}

export default function GanttExportView({
  items,
  unit,
  collapsedIds,
  theme,
  labelWidth,
}: GanttExportViewProps) {
  const range = computeActiveRange(items);
  if (!range) return null;

  const p = theme === 'dark' ? DARK : LIGHT;
  const ppd = PPD[unit];
  const totalDays =
    Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;
  const chartWidth = totalDays * ppd;
  const totalWidth = labelWidth + chartWidth;
  const flat = flattenTree(items, collapsedIds);
  const headerCells = computeHeaderCells(range, unit, ppd);

  return (
    <div
      id={EXPORT_ROOT_ID}
      style={{
        width: totalWidth,
        background: p.pageBg,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Malgun Gothic", sans-serif',
      }}
    >
      {/* 헤더 (라벨 모서리 + 날짜 눈금) */}
      <div
        style={{
          display: 'flex',
          height: HEADER_HEIGHT,
          background: p.headerBg,
          borderBottom: `1px solid ${p.headerBorder}`,
        }}
      >
        <div
          style={{
            width: labelWidth,
            flexShrink: 0,
            borderRight: `1px solid ${p.headerBorder}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            fontSize: 12,
            fontWeight: 600,
            color: p.headerText,
          }}
        >
          일정 ({items.length}개)
        </div>
        <div style={{ position: 'relative', width: chartWidth }}>
          {headerCells.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: c.offsetPx,
                width: c.widthPx,
                height: '100%',
                borderLeft: `1px solid ${p.headerBorder}`,
                display: 'flex',
                flexDirection: c.subLabel ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 500,
                color: p.headerText,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{c.label}</span>
              {c.subLabel && (
                <span style={{ fontSize: 9, opacity: 0.75 }}>{c.subLabel}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 행 */}
      <div style={{ position: 'relative' }}>
        {flat.map((n) => {
          const isGroup = n.kind === 'GROUP';
          const start = isGroup ? n.startAtEffective : n.startAt;
          const end = isGroup ? n.endAtEffective : n.endAt;
          const progress = isGroup ? n.progressEffective : n.progress;
          const rect = start && end ? barRect(start, end, range.start, ppd) : null;

          return (
            <div
              key={n.id}
              style={{
                display: 'flex',
                height: ROW_HEIGHT,
                borderBottom: `1px solid ${p.rowBorder}`,
              }}
            >
              {/* 라벨 */}
              <div
                style={{
                  width: labelWidth,
                  flexShrink: 0,
                  borderRight: `1px solid ${p.headerBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8 + n.depth * 16,
                  paddingRight: 8,
                  fontSize: 12,
                  color: p.labelText,
                  background: p.pageBg,
                }}
              >
                {isGroup ? (
                  <FolderIcon className="w-4 h-4" />
                ) : (
                  <ItemIcon className="w-4 h-4" />
                )}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.title}
                </span>
                {progress !== null && progress !== undefined && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      color: p.progressText,
                    }}
                  >
                    {progress}%
                  </span>
                )}
              </div>

              {/* 막대 영역 */}
              <div style={{ position: 'relative', width: chartWidth }}>
                {rect && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      bottom: 4,
                      left: rect.leftPx,
                      width: rect.widthPx,
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: `1px solid ${isGroup ? p.groupBarBorder : p.itemBarBorder}`,
                      background: isGroup ? p.groupBarBg : p.itemBarBg,
                    }}
                  >
                    {progress !== null && progress !== undefined && progress > 0 && (
                      <div
                        style={{
                          height: '100%',
                          width: `${progress}%`,
                          background: isGroup ? p.groupFill : p.itemFill,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
