const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { calculateTreeNodesDelayInfo, getNodeDelayInfo, calculateProjectDelaySummary } = require('../packages/shared/dist/index.js');

const dbPath = path.resolve(__dirname, '../apps/api/prisma/data/app.db');
const db = new DatabaseSync(dbPath);

const targetProjectId = '4af8ab33-98f2-45d3-8ddb-a7bd116f8d40';
const rawNodes = db.prepare(`
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

console.log('--- Testing calculateTreeNodesDelayInfo with raw DB nodes (like useNodes in frontend) ---');
const delayMap = calculateTreeNodesDelayInfo(rawNodes);

for (const n of rawNodes) {
  const info = delayMap.get(n.id);
  console.log(`[${n.kind}] title="${n.title}" (id=${n.id}) -> status=${info?.status}, exp=${info?.expectedProgress}%, act=${info?.actualProgress}%, gap=${info?.delayGap}%p`);
}

console.log('\n--- Testing calculateProjectDelaySummary with raw DB nodes ---');
const summary = calculateProjectDelaySummary(rawNodes);
console.log('Project Delay Summary:', summary);
