import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/** 프로젝트 읽기 권한 검사에 필요한 최소 컨텍스트. 각 서비스의 ActorContext 와 구조적으로 호환된다. */
export interface ReadAccessContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
}

/**
 * 프로젝트 읽기 권한: ADMIN+adminMode 는 무조건 허용, 그 외에는 프로젝트 멤버여야 한다.
 * 멤버가 아니면 403 NOT_A_MEMBER. (여러 서비스가 각자 두던 동일 검사를 한곳으로 모음)
 */
export async function assertProjectReadAccess(
  prisma: PrismaService,
  projectId: string,
  ctx: ReadAccessContext,
): Promise<void> {
  if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: ctx.actorId } },
    select: { role: true },
  });
  if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
}
