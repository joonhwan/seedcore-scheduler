const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { calculateTreeNodesDelayInfo, getNodeDelayInfo } = require('../packages/shared/dist/index.js');

const dbPath = path.resolve(__dirname, '../apps/api/prisma/data/app.db');
const db = new DatabaseSync(dbPath);

const targetProjectId = '4af8ab33-98f2-45d3-8ddb-a7bd116f8d40';
const nodes = db.prepare(`
  SELECT 
    id, 
    parent_id as parentId, 
    kind, 
    title, 
    start_at as startAt, 
    end_at as endAt, 
    progress, 
    depth, 
    sort_order as sortOrder 
  FROM schedule_nodes 
  WHERE project_id = ? 
  ORDER BY depth ASC, sort_order ASC
`).all(targetProjectId);

console.log('Total nodes:', nodes.length);

// Also need effective dates and effective progress computed for GROUP nodes!
// Let's check buildTreeItems equivalent from backend:
function computeEffective(nodesList) {
  // Simple tree aggregation
  const map = new Map(nodesList.map(n => [n.id, { ...n, children: [] }]));
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId).children.push(n);
    }
  }

  function aggregate(n) {
    if (n.kind === 'ITEM') {
      n.startAtEffective = n.startAt;
      n.endAtEffective = n.endAt;
      n.progressEffective = n.progress;
      return;
    }
    // GROUP
    let minStart = null;
    let maxEnd = null;
    let sumProg = 0;
    let countProg = 0;

    for (const c of n.children) {
      aggregate(c);
      const s = c.startAtEffective ?? c.startAt;
      const e = c.endAtEffective ?? c.endAt;
      const p = c.progressEffective ?? c.progress;

      if (s) {
        if (!minStart || s < minStart) minStart = s;
      }
      if (e) {
        if (!maxEnd || e > maxEnd) maxEnd = e;
      }
      if (p !== null && p !== undefined) {
        sumProg += p;
        countProg++;
      }
    }

    n.startAtEffective = minStart;
    n.endAtEffective = maxEnd;
    n.progressEffective = countProg > 0 ? Math.round(sumProg / countProg) : null;
  }

  const roots = Array.from(map.values()).filter(n => !n.parentId);
  roots.forEach(aggregate);
  return Array.from(map.values());
}

const aggregatedNodes = computeEffective(nodes);
const delayMap = calculateTreeNodesDelayInfo(aggregatedNodes);

console.log('\n=== Tree Delay Map Results ===');
for (const n of aggregatedNodes) {
  const info = delayMap.get(n.id);
  console.log(`[${n.kind}] id=${n.id} parentId=${n.parentId} depth=${n.depth} title="${n.title}" -> status=${info?.status}, exp=${info?.expectedProgress}%, act=${info?.actualProgress}%, gap=${info?.delayGap}%p`);
}
