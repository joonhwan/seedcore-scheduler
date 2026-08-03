const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { calculateExpectedProgress } = require('../packages/shared/dist/index.js');

const dbPath = path.resolve(__dirname, '../apps/api/prisma/data/app.db');
const db = new DatabaseSync(dbPath);

const targetProjectId = '4af8ab33-98f2-45d3-8ddb-a7bd116f8d40';
const nodes = db.prepare('SELECT id, parent_id as parentId, kind, title, start_at as startAt, end_at as endAt, progress FROM schedule_nodes WHERE project_id = ?').all(targetProjectId);

const pba = nodes.find(n => n.title === 'PBA' && n.kind === 'GROUP');
const children = nodes.filter(n => n.parentId === pba.id);

console.log('--- Children ITEMs ---');
let sumProgress = 0;
children.forEach(c => {
  console.log(`- ${c.title}: start=${c.startAt}, end=${c.endAt}, actual=${c.progress}%`);
  sumProgress += c.progress;
});

const avgActualProgress = Math.round(sumProgress / children.length);

const minStart = '2026-07-12';
const maxEnd = '2026-08-17';
const today = '2026-08-03';

const expectedProgress = calculateExpectedProgress(minStart, maxEnd, today);
const delayGap = expectedProgress - avgActualProgress;

console.log('\n--- PBA Group Aggregate Calculations ---');
console.log('Effective StartAt:', minStart);
console.log('Effective EndAt:', maxEnd);
console.log('Today:', today);
console.log('Expected Progress:', expectedProgress + '%');
console.log('Actual Progress (Average):', avgActualProgress + '%');
console.log('Delay Gap:', delayGap + '%p');
console.log('Delay Status:', delayGap >= 20 ? 'CRITICAL (🚨 심각 지연)' : delayGap >= 10 ? 'WARNING (⚠️ 주의 지연)' : 'ON_TRACK');
