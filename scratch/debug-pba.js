const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { calculateExpectedProgress, getItemNodeDelayInfo } = require('../packages/shared/dist/index.js');

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

const todayIso = new Date().toISOString().slice(0, 10);
console.log('Today ISO:', todayIso);

const pba = nodes.find(n => n.title.includes('PBA') && n.kind === 'GROUP');
console.log('PBA Group node:', pba);

function getDescendants(pid) {
  const children = nodes.filter(n => n.parentId === pid);
  let acc = [...children];
  for (const c of children) {
    acc = acc.concat(getDescendants(c.id));
  }
  return acc;
}

const desc = getDescendants(pba.id);
console.log(`\n=== All Descendants of PBA (${desc.length} nodes) ===`);

for (const d of desc) {
  const info = getItemNodeDelayInfo(d, todayIso);
  console.log(`[${d.kind}] id=${d.id} title="${d.title}" start=${d.startAt} end=${d.endAt} progress=${d.progress}% -> status=${info.status}, exp=${info.expectedProgress}%, act=${info.actualProgress}%, gap=${info.delayGap}%p`);
}
