const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

const categories = [
  { name: '공통', items: [
    { title: '발주', desc: 'PCB / 기구 / 케이블 / COTS 동시 발주', gate: '발주 완료' }
  ]},
  { name: 'PCB', items: [
    { title: 'PCB 제작', desc: 'PCB 제조 업체 제작', gate: '제작 완료' },
    { title: 'PCB 입고', desc: 'PCB 입고 확인', gate: '입고 완료' },
    { title: 'PCB 검사', desc: '전원 쇼트 검사', gate: 'PCB 사용 승인' }
  ]},
  { name: 'PBA', items: [
    { title: 'PBA 제작', desc: '부품 실장 / SMT', gate: 'PBA 제작 완료' },
    { title: 'PBA 납땜검사', desc: '외관 / 납땜 상태 확인', gate: '검사 완료' },
    { title: '프로그램 장입', desc: 'FPGA / Firmware / SW 장입', gate: '장입 완료' },
    { title: 'PBA 기능검사', desc: '자체 기능 시험', gate: 'PBA 기능 승인' },
    { title: 'PBA 몰딩/코팅', desc: '방습 / 보호 코팅', gate: '코팅 완료' },
    { title: '코팅 육안검사', desc: '코팅 상태 확인', gate: '외관 승인' },
    { title: '코팅 후 기능검사', desc: '코팅 영향 확인', gate: 'PBA 완료품 승인' }
  ]},
  { name: '기구', items: [
    { title: '기구 제작', desc: '가공 / 표면처리', gate: '기구 입고 승인' }
  ]},
  { name: '케이블', items: [
    { title: '케이블 제작', desc: '케이블 조립', gate: '제작 완료' },
    { title: '케이블 검사', desc: '도통 / 절연 검사', gate: '케이블 승인' }
  ]},
  { name: 'COTS', items: [
    { title: 'COTS 입고', desc: '상용 보드 입고', gate: '입고 완료' },
    { title: 'COTS 검사', desc: '기능 / 외관 확인', gate: '사용 승인' }
  ]},
  { name: '조립', items: [
    { title: '기구 조립', desc: 'PBA + 케이블 + COTS + 기구 통합', gate: '완조립체 완성' }
  ]},
  { name: '시험', items: [
    { title: '완조립 기능검사', desc: '장비 Level 기능 시험', gate: 'ESS 투입 승인' },
    { title: 'ESS', desc: '온도 Cycle / Stress Screening', gate: 'ESS 완료' }
  ]},
  { name: '최종', items: [
    { title: '체계 수락검사', desc: '고객 검사', gate: '고객 승인' },
    { title: '정부 수락검사', desc: '정부 품질 검사', gate: '최종 승인' }
  ]},
  { name: '출하', items: [
    { title: '포장 및 납품', desc: '제품 포장 / 출하 / 고객 납품', gate: '납품 완료' }
  ]}
];

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  console.log(`Searching for admin user '${username}'...`);
  
  const adminUser = await prisma.user.findUnique({
    where: { username }
  });

  if (!adminUser) {
    console.error(`Error: User '${username}' does not exist.`);
    process.exit(1);
  }

  const adminId = adminUser.id;
  const projectId = randomUUID();
  console.log(`Creating project 'SEEDCORE Proj v2' with ID: ${projectId}...`);

  await prisma.$transaction(async (tx) => {
    // 1. 프로젝트 생성
    await tx.project.create({
      data: {
        id: projectId,
        name: 'SEEDCORE Proj v2',
        description: 'SEEDCORE 표준 생산 공정표에 따른 프로젝트 일정',
        status: 'ACTIVE',
        createdById: adminId
      }
    });

    // 2. 프로젝트 멤버(MANAGER) 등록
    await tx.projectMember.create({
      data: {
        projectId: projectId,
        userId: adminId,
        role: 'MANAGER',
        addedById: adminId
      }
    });

    // 3. 노드 생성
    let categoryOrder = 1;
    for (const cat of categories) {
      const categoryId = randomUUID();
      console.log(`  Adding Group: ${cat.name} (sortOrder: ${categoryOrder})...`);
      
      // 대분류 (GROUP)
      await tx.scheduleNode.create({
        data: {
          id: categoryId,
          projectId: projectId,
          parentId: null,
          kind: 'GROUP',
          title: cat.name,
          description: null,
          startAt: null,
          endAt: null,
          progress: 0,
          sortOrder: categoryOrder++,
          depth: 0,
          createdById: adminId,
          updatedById: adminId
        }
      });

      // 소분류 (ITEM)
      let itemOrder = 1;
      for (const item of cat.items) {
        console.log(`    Adding Item: ${item.title} (sortOrder: ${itemOrder})...`);
        await tx.scheduleNode.create({
          data: {
            id: randomUUID(),
            projectId: projectId,
            parentId: categoryId,
            kind: 'ITEM',
            title: item.title,
            description: `상세 내용: ${item.desc} | 완료 기준(Gate): ${item.gate}`,
            startAt: null,
            endAt: null,
            progress: 0,
            sortOrder: itemOrder++,
            depth: 1,
            createdById: adminId,
            updatedById: adminId
          }
        });
      }
    }
  });

  console.log(`Successfully created 'SEEDCORE Proj v2' and initialized its schedule tree!`);
}

main()
  .catch((err) => {
    console.error('Failed to create SEEDCORE Proj v2 schedule:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
