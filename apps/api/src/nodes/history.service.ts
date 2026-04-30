import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodeAction, NodeHistoryItem } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
}

const HISTORY_LIMIT = 200;

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 특정 노드의 history. 삭제된 노드는 nodeIdSnapshot 으로만 조회 가능 (UI 가
   * 노드 ID 를 알고 있을 때만 호출). 권한: 같은 프로젝트의 멤버 OR ADMIN+adminMode.
   */
  async forNode(nodeId: string, ctx: ActorContext): Promise<NodeHistoryItem[]> {
    // nodeIdSnapshot 으로 1건이라도 찾는다 → 그것의 projectIdSnapshot 으로 권한 검사.
    const sample = await this.prisma.nodeHistory.findFirst({
      where: { nodeIdSnapshot: nodeId },
      select: { projectIdSnapshot: true },
      orderBy: { occurredAt: 'asc' },
    });
    if (!sample) {
      // history 가 전혀 없는 nodeId — 노드 자체가 존재하는지 확인하여 권한/존재 분리.
      const node = await this.prisma.scheduleNode.findUnique({
        where: { id: nodeId },
        select: { projectId: true },
      });
      if (!node) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
      await this.assertReadAccess(node.projectId, ctx);
      return [];
    }
    await this.assertReadAccess(sample.projectIdSnapshot, ctx);

    const rows = await this.prisma.nodeHistory.findMany({
      where: { nodeIdSnapshot: nodeId },
      include: {
        actor: { select: { username: true, displayName: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: HISTORY_LIMIT,
    });

    return rows.map((r) => ({
      id: r.id,
      nodeIdSnapshot: r.nodeIdSnapshot,
      projectIdSnapshot: r.projectIdSnapshot,
      actorId: r.actorId,
      actorUsername: r.actor.username,
      actorDisplayName: r.actor.displayName,
      action: (r.action as NodeAction),
      diff: parseDiff(r.diffJson),
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  private async assertReadAccess(
    projectId: string,
    ctx: ActorContext,
  ): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
  }
}

function parseDiff(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
