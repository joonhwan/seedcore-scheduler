// 화면 밖에 정적 간트를 렌더해 PNG 로 캡처하고 내려받는다(부수효과).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import type { NodeTreeItem } from '@sam/shared';
import GanttExportView, { EXPORT_ROOT_ID } from '../components/GanttExportView';
import { buildExportFilename } from './ganttExport';
import type { TimelineUnit } from './ganttLayout';
import type { Theme } from './theme';

export interface ExportGanttImageOptions {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  collapsedIds: Set<string>;
  theme: Theme;
  projectName: string;
  dateYmd: string;
  labelWidth: number;
  pixelRatio: number;
}

// 두 번의 애니메이션 프레임을 기다려 React 렌더/레이아웃이 끝나게 한다.
function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function exportGanttImage(opts: ExportGanttImageOptions): Promise<void> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(
      createElement(GanttExportView, {
        items: opts.items,
        unit: opts.unit,
        collapsedIds: opts.collapsedIds,
        theme: opts.theme,
        labelWidth: opts.labelWidth,
      }),
    );

    await nextFrames();

    const target = host.querySelector<HTMLElement>(`#${EXPORT_ROOT_ID}`);
    if (!target) {
      throw new Error('내보낼 간트 내용이 없습니다.');
    }

    const dataUrl = await toPng(target, {
      pixelRatio: opts.pixelRatio,
      backgroundColor: opts.theme === 'dark' ? '#0f172a' : '#ffffff',
      cacheBust: true,
    });

    const link = document.createElement('a');
    link.download = buildExportFilename(opts.projectName, opts.dateYmd);
    link.href = dataUrl;
    link.click();
  } finally {
    root.unmount();
    host.remove();
  }
}
