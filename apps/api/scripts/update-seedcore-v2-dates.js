const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 각 공정명(title)에 매핑되는 대략적인 일정 (YYYY-MM-DD)
const scheduleData = {
  '발주': { startAt: '2026-07-13', endAt: '2026-07-13' },
  
  'PCB 제작': { startAt: '2026-07-14', endAt: '2026-07-22' },
  'PCB 입고': { startAt: '2026-07-23', endAt: '2026-07-23' },
  'PCB 검사': { startAt: '2026-07-24', endAt: '2026-07-24' },
  
  'PBA 제작': { startAt: '2026-07-27', endAt: '2026-07-31' },
  'PBA 납땜검사': { startAt: '2026-08-03', endAt: '2026-08-03' },
  '프로그램 장입': { startAt: '2026-08-04', endAt: '2026-08-05' },
  'PBA 기능검사': { startAt: '2026-08-06', endAt: '2026-08-10' },
  'PBA 몰딩/코팅': { startAt: '2026-08-11', endAt: '2026-08-12' },
  '코팅 육안검사': { startAt: '2026-08-13', endAt: '2026-08-13' },
  '코팅 후 기능검사': { startAt: '2026-08-14', endAt: '2026-08-17' },
  
  '기구 제작': { startAt: '2026-07-14', endAt: '2026-08-03' },
  
  '케이블 제작': { startAt: '2026-07-14', endAt: '2026-07-20' },
  '케이블 검사': { startAt: '2026-07-21', endAt: '2026-07-22' },
  
  'COTS 입고': { startAt: '2026-07-14', endAt: '2026-07-27' },
  'COTS 검사': { startAt: '2026-07-28', endAt: '2026-07-29' },
  
  '기구 조립': { startAt: '2026-08-18', endAt: '2026-08-20' },
  
  '완조립 기능검사': { startAt: '2026-08-21', endAt: '2026-08-26' },
  'ESS': { startAt: '2026-08-27', endAt: '2026-09-02' },
  
  '체계 수락검사': { startAt: '2026-09-03', endAt: '2026-09-07' },
  '정부 수락검사': { startAt: '2026-09-08', endAt: '2026-09-11' },
  
  '포장 및 납품': { startAt: '2026-09-14', endAt: '2026-09-15' }
};

async function main() {
  console.log(`Searching for project 'SEEDCORE Proj v2'...`);
  
  const project = await prisma.project.findFirst({
    where: { name: 'SEEDCORE Proj v2' }
  });

  if (!project) {
    console.error(`Error: Project 'SEEDCORE Proj v2' not found.`);
    process.exit(1);
  }

  console.log(`Found project ID: ${project.id}. Updating node schedules...`);

  const nodes = await prisma.scheduleNode.findMany({
    where: {
      projectId: project.id,
      kind: 'ITEM'
    }
  });

  console.log(`Found ${nodes.length} ITEM nodes. Updating dates...`);

  await prisma.$transaction(
    nodes.map((node) => {
      const dates = scheduleData[node.title];
      if (!dates) {
        console.warn(`Warning: No schedule mapping found for node '${node.title}'`);
        return prisma.scheduleNode.update({
          where: { id: node.id },
          data: {}
        });
      }
      
      console.log(`  Updating '${node.title}': ${dates.startAt} ~ ${dates.endAt}`);
      return prisma.scheduleNode.update({
        where: { id: node.id },
        data: {
          startAt: dates.startAt,
          endAt: dates.endAt
        }
      });
    })
  );

  console.log(`Successfully updated all schedule nodes for 'SEEDCORE Proj v2'!`);
}

main()
  .catch((err) => {
    console.error('Failed to update node schedules:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
