import ExcelJS from 'exceljs';
import type { NodeTreeItem } from '@sam/shared';
import { parseYmd, dayDiff, formatYmd } from './ganttMath';
import { computeActiveRange, flattenTree, type TimelineUnit } from './ganttLayout';
import type { Theme } from './theme';

export async function exportGanttExcel(params: {
  projectName: string;
  items: NodeTreeItem[];
  unit: TimelineUnit;
  theme: Theme;
  includeOutline?: boolean;
}): Promise<void> {
  const { projectName, items, unit, theme, includeOutline = false } = params;
  const isDark = theme === 'dark';

  const range = computeActiveRange(items);
  const flatItems = flattenTree(items, new Set());

  // 데이터의 최소 시작일과 최대 종료일 (기본값: 오늘)
  let minDate: Date;
  let maxDate: Date;
  if (range) {
    minDate = range.start;
    maxDate = range.end;
  } else {
    const today = new Date();
    minDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    maxDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 30));
  }

  // 1 단위(unit) 앞뒤 여유 추가
  let startDate: Date;
  let endDate: Date;

  if (unit === 'day') {
    startDate = new Date(minDate.getTime() - 1 * 86400000);
    endDate = new Date(maxDate.getTime() + 1 * 86400000);
  } else if (unit === 'week') {
    startDate = new Date(minDate.getTime() - 7 * 86400000);
    endDate = new Date(maxDate.getTime() + 7 * 86400000);
  } else if (unit === 'month') {
    startDate = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth() - 1, 1));
    const nextM = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth() + 2, 0));
    endDate = nextM;
  } else {
    // quarter
    const qStartMonth = Math.floor(minDate.getUTCMonth() / 3) * 3 - 3;
    startDate = new Date(Date.UTC(minDate.getUTCFullYear(), qStartMonth, 1));
    const qEndMonth = Math.floor(maxDate.getUTCMonth() / 3) * 3 + 6;
    endDate = new Date(Date.UTC(maxDate.getUTCFullYear(), qEndMonth, 0));
  }

  const totalDays = Math.max(1, dayDiff(endDate, startDate) + 1);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAM Scheduler';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('일정표', {
    views: [{ showGridLines: true }],
  });

  if (includeOutline) {
    worksheet.properties.outlineProperties = {
      summaryBelow: false,
      summaryRight: false,
    };
  }

  // A~I 좌측 정보 컬럼 너비 설정
  worksheet.getColumn(1).width = 16; // 일정 1 (Depth 0)
  worksheet.getColumn(2).width = 16; // 일정 2 (Depth 1)
  worksheet.getColumn(3).width = 16; // 일정 3 (Depth 2)
  worksheet.getColumn(4).width = 16; // 일정 4 (Depth 3)
  worksheet.getColumn(5).width = 16; // 일정 5 (Depth 4)
  worksheet.getColumn(6).width = 8;  // 구분
  worksheet.getColumn(7).width = 12; // 시작일
  worksheet.getColumn(8).width = 12; // 종료일
  worksheet.getColumn(9).width = 10; // 진행률

  // 1행, 2행 헤더 생성
  const row1 = worksheet.getRow(1);
  const row2 = worksheet.getRow(2);

  row1.height = 24;
  row2.height = 22;

  // 색상 팰럿 정의 (Light vs Dark)
  const colors = isDark
    ? {
        mainHeaderBg: 'FF0F172A',
        mainHeaderFg: 'FFFFFFFF',
        subHeaderBg: 'FF1E293B',
        subHeaderFg: 'FF94A3B8',
        border: 'FF334155',
        rowBgEven: 'FF0F172A',
        rowBgOdd: 'FF1E293B',
        groupBar: 'FF38BDF8',   // sky-400
        itemBar: 'FF0EA5E9',    // sky-500
        weekendBg: 'FF334155',
        satFg: 'FF60A5FA',
        sunFg: 'FFF43F5E',
        textMain: 'FFF8FAFC',
        textSub: 'FFCBD5E1',
      }
    : {
        mainHeaderBg: 'FF0F172A', // slate-900
        mainHeaderFg: 'FFFFFFFF',
        subHeaderBg: 'FFE2E8F0',  // slate-200
        subHeaderFg: 'FF1E293B',  // slate-800
        border: 'FFCBD5E1',
        rowBgEven: 'FFFFFFFF',
        rowBgOdd: 'FFF8FAFC',     // slate-50
        groupBar: 'FF334155',     // slate-700
        itemBar: 'FF0284C7',      // sky-600
        weekendBg: 'FFF1F5F9',
        satFg: 'FF2563EB',
        sunFg: 'FFE11D48',
        textMain: 'FF0F172A',
        textSub: 'FF475569',
      };

  // 좌측 메인 타이틀 헤더 (A1:I1 병합)
  worksheet.mergeCells(1, 1, 1, 9);
  const mainHeaderCell = row1.getCell(1);
  mainHeaderCell.value = `${projectName} - 일정 및 간트 타임라인 (${unit.toUpperCase()})`;
  mainHeaderCell.font = { name: '맑은 고딕', size: 12, bold: true, color: { argb: colors.mainHeaderFg } };
  mainHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.mainHeaderBg } };
  mainHeaderCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // 2행 컬럼 제목 (A2:I2)
  const headers = ['일정 1단계', '일정 2단계', '일정 3단계', '일정 4단계', '일정 5단계', '구분', '시작일', '종료일', '진행률'];
  headers.forEach((h, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = h;
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: colors.subHeaderFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'medium', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };
  });

  const dateColumnsStartCol = 10;
  const dowNames = ['일', '월', '화', '수', '목', '금', '토'];

  // 단위별 타임라인 셀/컬럼 세팅
  if (unit === 'day') {
    let currentMonthStr = '';
    let monthStartCol = dateColumnsStartCol;

    for (let dIdx = 0; dIdx < totalDays; dIdx++) {
      const colNum = dateColumnsStartCol + dIdx;
      const curDate = new Date(startDate.getTime() + dIdx * 86400000);
      const monthStr = `${curDate.getUTCFullYear()}년 ${(curDate.getUTCMonth() + 1).toString().padStart(2, '0')}월`;
      const dayNum = curDate.getUTCDate();
      const dow = curDate.getUTCDay();
      const isSat = dow === 6;
      const isSun = dow === 0;

      worksheet.getColumn(colNum).width = 4.5;

      const cell2 = row2.getCell(colNum);
      cell2.value = `${dayNum}\n(${dowNames[dow]})`;
      cell2.font = {
        name: '맑은 고딕',
        size: 8,
        bold: isSat || isSun,
        color: { argb: isSun ? colors.sunFg : isSat ? colors.satFg : colors.textSub },
      };
      cell2.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isSun ? (isDark ? 'FF450A0A' : 'FFFEE2E2') : isSat ? (isDark ? 'FF1E3A8A' : 'FFDBEAFE') : colors.weekendBg },
      };
      cell2.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'medium', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };

      if (monthStr !== currentMonthStr) {
        if (currentMonthStr !== '' && colNum - 1 >= monthStartCol) {
          worksheet.mergeCells(1, monthStartCol, 1, colNum - 1);
          const mCell = row1.getCell(monthStartCol);
          mCell.value = currentMonthStr;
          mCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: colors.subHeaderFg } };
          mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
          mCell.alignment = { vertical: 'middle', horizontal: 'center' };
          mCell.border = {
            top: { style: 'thin', color: { argb: colors.border } },
            bottom: { style: 'thin', color: { argb: colors.border } },
            left: { style: 'thin', color: { argb: colors.border } },
            right: { style: 'thin', color: { argb: colors.border } },
          };
        }
        currentMonthStr = monthStr;
        monthStartCol = colNum;
      }

      if (dIdx === totalDays - 1) {
        worksheet.mergeCells(1, monthStartCol, 1, colNum);
        const mCell = row1.getCell(monthStartCol);
        mCell.value = currentMonthStr;
        mCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: colors.subHeaderFg } };
        mCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
        mCell.alignment = { vertical: 'middle', horizontal: 'center' };
        mCell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };
      }
    }
  } else if (unit === 'week') {
    // 주 단위: 월요일 시작 7일 묶음
    let cursor = new Date(startDate);
    const dow = cursor.getUTCDay();
    const back = (dow + 6) % 7;
    cursor = new Date(cursor.getTime() - back * 86400000);

    let colIdx = dateColumnsStartCol;
    while (cursor <= endDate) {
      const weekEnd = new Date(cursor.getTime() + 6 * 86400000);
      worksheet.getColumn(colIdx).width = 12;

      worksheet.mergeCells(1, colIdx, 1, colIdx);
      const cell1 = row1.getCell(colIdx);
      cell1.value = `${cursor.getUTCFullYear()}년 ${(cursor.getUTCMonth() + 1)}월`;
      cell1.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: colors.subHeaderFg } };
      cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
      cell1.alignment = { vertical: 'middle', horizontal: 'center' };

      const cell2 = row2.getCell(colIdx);
      cell2.value = `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()} ~ ${weekEnd.getUTCMonth() + 1}/${weekEnd.getUTCDate()}`;
      cell2.font = { name: '맑은 고딕', size: 8.5, color: { argb: colors.textSub } };
      cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.weekendBg } };
      cell2.alignment = { vertical: 'middle', horizontal: 'center' };
      cell2.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'medium', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };

      cursor = new Date(cursor.getTime() + 7 * 86400000);
      colIdx++;
    }
  } else if (unit === 'month') {
    // 월 단위
    let curY = startDate.getUTCFullYear();
    let curM = startDate.getUTCMonth();
    const endY = endDate.getUTCFullYear();
    const endM = endDate.getUTCMonth();

    let colIdx = dateColumnsStartCol;
    while (curY < endY || (curY === endY && curM <= endM)) {
      worksheet.getColumn(colIdx).width = 11;

      worksheet.mergeCells(1, colIdx, 1, colIdx);
      const cell1 = row1.getCell(colIdx);
      cell1.value = `${curY}년`;
      cell1.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: colors.subHeaderFg } };
      cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
      cell1.alignment = { vertical: 'middle', horizontal: 'center' };

      const cell2 = row2.getCell(colIdx);
      cell2.value = `${curM + 1}월`;
      cell2.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: colors.textSub } };
      cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.weekendBg } };
      cell2.alignment = { vertical: 'middle', horizontal: 'center' };
      cell2.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'medium', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };

      curM++;
      if (curM > 11) {
        curM = 0;
        curY++;
      }
      colIdx++;
    }
  } else {
    // quarter (분기 단위)
    let curY = startDate.getUTCFullYear();
    let curQ = Math.floor(startDate.getUTCMonth() / 3);
    const endY = endDate.getUTCFullYear();
    const endQ = Math.floor(endDate.getUTCMonth() / 3);

    let colIdx = dateColumnsStartCol;
    while (curY < endY || (curY === endY && curQ <= endQ)) {
      worksheet.getColumn(colIdx).width = 14;

      worksheet.mergeCells(1, colIdx, 1, colIdx);
      const cell1 = row1.getCell(colIdx);
      cell1.value = `${curY}년`;
      cell1.font = { name: '맑은 고딕', size: 9, bold: true, color: { argb: colors.subHeaderFg } };
      cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subHeaderBg } };
      cell1.alignment = { vertical: 'middle', horizontal: 'center' };

      const cell2 = row2.getCell(colIdx);
      cell2.value = `${curQ + 1}분기 (${curQ * 3 + 1}~${curQ * 3 + 3}월)`;
      cell2.font = { name: '맑은 고딕', size: 8.5, bold: true, color: { argb: colors.textSub } };
      cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.weekendBg } };
      cell2.alignment = { vertical: 'middle', horizontal: 'center' };
      cell2.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'medium', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };

      curQ++;
      if (curQ > 3) {
        curQ = 0;
        curY++;
      }
      colIdx++;
    }
  }

  // 데이터 행 출력
  flatItems.forEach((node, idx) => {
    const rowIdx = 3 + idx;
    const row = worksheet.getRow(rowIdx);
    row.height = 22;

    if (includeOutline && node.depth > 0) {
      row.outlineLevel = node.depth;
    }

    const isGroup = node.kind === 'GROUP';
    const startAt = isGroup ? node.startAtEffective : node.startAt;
    const endAt = isGroup ? node.endAtEffective : node.endAt;
    const progress = isGroup ? node.progressEffective : node.progress;
    const rowBg = idx % 2 === 0 ? colors.rowBgEven : colors.rowBgOdd;

    // A~E 컬럼 (일정 1~5단계)
    for (let d = 0; d <= 4; d++) {
      const cell = row.getCell(d + 1);
      if (node.depth === d) {
        cell.value = node.title;
        cell.font = {
          name: '맑은 고딕',
          size: 9.5,
          bold: isGroup,
          color: { argb: isGroup ? colors.textMain : colors.textSub },
        };
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: colors.border } },
        bottom: { style: 'thin', color: { argb: colors.border } },
        left: { style: 'thin', color: { argb: colors.border } },
        right: { style: 'thin', color: { argb: colors.border } },
      };
    }

    // F: 구분
    const cellKind = row.getCell(6);
    cellKind.value = isGroup ? '그룹' : '작업';
    cellKind.font = { name: '맑은 고딕', size: 9, color: { argb: isGroup ? 'FF0284C7' : colors.textSub }, bold: isGroup };
    cellKind.alignment = { vertical: 'middle', horizontal: 'center' };
    cellKind.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cellKind.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'thin', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };

    // G: 시작일
    const cellStart = row.getCell(7);
    cellStart.value = startAt ?? '-';
    cellStart.font = { name: '맑은 고딕', size: 9, color: { argb: colors.textSub } };
    cellStart.alignment = { vertical: 'middle', horizontal: 'center' };
    cellStart.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cellStart.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'thin', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };

    // H: 종료일
    const cellEnd = row.getCell(8);
    cellEnd.value = endAt ?? '-';
    cellEnd.font = { name: '맑은 고딕', size: 9, color: { argb: colors.textSub } };
    cellEnd.alignment = { vertical: 'middle', horizontal: 'center' };
    cellEnd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cellEnd.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'thin', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };

    // I: 진행률
    const cellProg = row.getCell(9);
    cellProg.value = progress !== null && progress !== undefined ? `${progress}%` : '-';
    cellProg.font = { name: '맑은 고딕', size: 9, bold: isGroup, color: { argb: colors.textMain } };
    cellProg.alignment = { vertical: 'middle', horizontal: 'right' };
    cellProg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
    cellProg.border = {
      top: { style: 'thin', color: { argb: colors.border } },
      bottom: { style: 'thin', color: { argb: colors.border } },
      left: { style: 'thin', color: { argb: colors.border } },
      right: { style: 'thin', color: { argb: colors.border } },
    };

    // 간트 차트 타임라인 셀 채우기 (단위별 렌더링)
    if (unit === 'day') {
      for (let dIdx = 0; dIdx < totalDays; dIdx++) {
        const colNum = dateColumnsStartCol + dIdx;
        const curDate = new Date(startDate.getTime() + dIdx * 86400000);
        const curYmd = formatYmd(curDate);
        const cell = row.getCell(colNum);

        const isWeekend = curDate.getUTCDay() === 0 || curDate.getUTCDay() === 6;
        const inRange = Boolean(startAt && endAt && curYmd >= startAt && curYmd <= endAt);

        if (inRange) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isGroup ? colors.groupBar : colors.itemBar } };
        } else if (isWeekend) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.weekendBg } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: inRange ? colors.itemBar : colors.border } },
          right: { style: 'thin', color: { argb: inRange ? colors.itemBar : colors.border } },
        };
      }
    } else if (unit === 'week') {
      let cursor = new Date(startDate);
      const dow = cursor.getUTCDay();
      const back = (dow + 6) % 7;
      cursor = new Date(cursor.getTime() - back * 86400000);

      let colIdx = dateColumnsStartCol;
      while (cursor <= endDate) {
        const weekEnd = new Date(cursor.getTime() + 6 * 86400000);
        const curStartYmd = formatYmd(cursor);
        const curEndYmd = formatYmd(weekEnd);
        const cell = row.getCell(colIdx);

        // 일정 기간과 주차 교집합 확인
        const inRange = Boolean(startAt && endAt && !(endAt < curStartYmd || startAt > curEndYmd));

        if (inRange) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isGroup ? colors.groupBar : colors.itemBar } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };

        cursor = new Date(cursor.getTime() + 7 * 86400000);
        colIdx++;
      }
    } else if (unit === 'month') {
      let curY = startDate.getUTCFullYear();
      let curM = startDate.getUTCMonth();
      const endY = endDate.getUTCFullYear();
      const endM = endDate.getUTCMonth();

      let colIdx = dateColumnsStartCol;
      while (curY < endY || (curY === endY && curM <= endM)) {
        const mStartYmd = formatYmd(new Date(Date.UTC(curY, curM, 1)));
        const mEndYmd = formatYmd(new Date(Date.UTC(curY, curM + 1, 0)));
        const cell = row.getCell(colIdx);

        const inRange = Boolean(startAt && endAt && !(endAt < mStartYmd || startAt > mEndYmd));

        if (inRange) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isGroup ? colors.groupBar : colors.itemBar } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };

        curM++;
        if (curM > 11) {
          curM = 0;
          curY++;
        }
        colIdx++;
      }
    } else {
      // quarter (분기)
      let curY = startDate.getUTCFullYear();
      let curQ = Math.floor(startDate.getUTCMonth() / 3);
      const endY = endDate.getUTCFullYear();
      const endQ = Math.floor(endDate.getUTCMonth() / 3);

      let colIdx = dateColumnsStartCol;
      while (curY < endY || (curY === endY && curQ <= endQ)) {
        const qStartYmd = formatYmd(new Date(Date.UTC(curY, curQ * 3, 1)));
        const qEndYmd = formatYmd(new Date(Date.UTC(curY, curQ * 3 + 3, 0)));
        const cell = row.getCell(colIdx);

        const inRange = Boolean(startAt && endAt && !(endAt < qStartYmd || startAt > qEndYmd));

        if (inRange) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isGroup ? colors.groupBar : colors.itemBar } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: colors.border } },
          bottom: { style: 'thin', color: { argb: colors.border } },
          left: { style: 'thin', color: { argb: colors.border } },
          right: { style: 'thin', color: { argb: colors.border } },
        };

        curQ++;
        if (curQ > 3) {
          curQ = 0;
          curY++;
        }
        colIdx++;
      }
    }
  });

  // 브라우저에서 파일 다운로드 생성
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const sanitizedTitle = projectName.trim().replace(/[/\\:*?"<>|]/g, '_');
  const todayYmd = formatYmd(new Date());
  link.href = url;
  link.setAttribute('download', `${sanitizedTitle || '일정'}_간트_${unit}_${todayYmd}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
