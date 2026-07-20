import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NodeAction, NodeHistoryItem } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectReadAccess } from '../common/project-access';
import { parseDiff } from '../common/diff.util';

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
      await assertProjectReadAccess(this.prisma, node.projectId, ctx);
      return [];
    }
    await assertProjectReadAccess(this.prisma, sample.projectIdSnapshot, ctx);

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
}
