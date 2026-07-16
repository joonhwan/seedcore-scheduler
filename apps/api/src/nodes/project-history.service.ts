import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildProjectHistory,
  type HistoryTopicValue,
  type NodeMeta,
  type ProjectHistoryQuery,
  type ProjectHistoryResponse,
  type RawCommentRow,
  type RawHistoryRow,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
}

const RESULT_LIMIT = 500;

@Injectable()
export class ProjectHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 프로젝트 단위 이력 조회. 삭제된 노드의 이력도 projectIdSnapshot 으로 포함한다.
   * 권한: 그 프로젝트 멤버 OR ADMIN+adminMode.
   */
  async forProject(
    projectId: string,
    q: ProjectHistoryQuery,
    ctx: ActorContext,
  ): Promise<ProjectHistoryResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
    await this.assertReadAccess(projectId, ctx);

    const { from, to } = resolveWindow(q);

    // 이력: 삭제된 노드 포함(projectIdSnapshot 기준). COMMENTS 주제면 불필요.
    const historyRaw =
      q.topic === 'COMMENTS'
        ? []
        : await this.prisma.nodeHistory.findMany({
            where: { projectIdSnapshot: projectId, occurredAt: { gte: from, lte: to } },
            include: { actor: { select: { username: true, displayName: true } } },
            orderBy: { occurredAt: 'desc' },
          });

    // 댓글: 살아있는 노드 + 미삭제. ALL/COMMENTS 주제에서만 필요.
    const commentRaw =
      q.topic === 'ALL' || q.topic === 'COMMENTS'
        ? await this.prisma.nodeComment.findMany({
            where: { deletedAt: null, node: { projectId }, createdAt: { gte: from, lte: to } },
            include: { author: { select: { username: true, displayName: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    const history: RawHistoryRow[] = historyRaw.map((r) => ({
      id: r.id,
      nodeIdSnapshot: r.nodeIdSnapshot,
      projectIdSnapshot: r.projectIdSnapshot,
      actorId: r.actorId,
      actorUsername: r.actor.username,
      actorDisplayName: r.actor.displayName,
      action: r.action as RawHistoryRow['action'],
      diff: parseDiff(r.diffJson),
      occurredAt: r.occurredAt.toISOString(),
    }));

    const comments: RawCommentRow[] = commentRaw.map((c) => ({
      id: c.id,
      nodeId: c.nodeId,
      authorId: c.authorId,
      authorUsername: c.author.username,
      authorDisplayName: c.author.displayName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    const meta = await this.resolveNodeMeta(history, comments);

    return buildProjectHistory({
      history,
      comments,
      meta,
      topic: q.topic as HistoryTopicValue,
      limit: RESULT_LIMIT,
    });
  }

  /** 결과에 등장하는 노드들의 제목/삭제상태 map 을 만든다. */
  private async resolveNodeMeta(
    history: RawHistoryRow[],
    comments: RawCommentRow[],
  ): Promise<Map<string, NodeMeta>> {
    const ids = new Set<string>();
    history.forEach((h) => ids.add(h.nodeIdSnapshot));
    comments.forEach((c) => ids.add(c.nodeId));
    const idList = [...ids];
    const meta = new Map<string, NodeMeta>();
    if (idList.length === 0) return meta;

    const live = await this.prisma.scheduleNode.findMany({
      where: { id: { in: idList } },
      select: { id: true, title: true },
    });
    const liveIds = new Set<string>();
    for (const n of live) {
      meta.set(n.id, { title: n.title, deleted: false });
      liveIds.add(n.id);
    }

    const deadIds = idList.filter((id) => !liveIds.has(id));
    if (deadIds.length > 0) {
      // 삭제된 노드의 제목은 DELETE 이력의 diff.title.from 에서 복원.
      const delRows = await this.prisma.nodeHistory.findMany({
        where: { nodeIdSnapshot: { in: deadIds }, action: 'DELETE' },
        select: { nodeIdSnapshot: true, diffJson: true },
      });
      const titleByDead = new Map<string, string>();
      for (const d of delRows) {
        const t = titleFromDiff(parseDiff(d.diffJson));
        if (t && !titleByDead.has(d.nodeIdSnapshot)) titleByDead.set(d.nodeIdSnapshot, t);
      }
      for (const id of deadIds) {
        meta.set(id, { title: titleByDead.get(id) ?? '(삭제된 일정)', deleted: true });
      }
    }
    return meta;
  }

  private async assertReadAccess(projectId: string, ctx: ActorContext): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
  }
}

/** range 를 실제 [from, to] Date 창으로 바꾼다. */
function resolveWindow(q: ProjectHistoryQuery): { from: Date; to: Date } {
  const now = new Date();
  if (q.range === 'custom' && q.from && q.to) {
    return {
      from: new Date(`${q.from}T00:00:00.000`),
      to: new Date(`${q.to}T23:59:59.999`),
    };
  }
  const days = q.range === '1w' ? 7 : 30;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

function parseDiff(json: string): Record<string, unknown> {
  try {
    const p: unknown = JSON.parse(json);
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return p as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function titleFromDiff(diff: Record<string, unknown>): string | null {
  const t = diff.title;
  if (t && typeof t === 'object' && 'from' in t) {
    const from = (t as { from: unknown }).from;
    if (typeof from === 'string') return from;
  }
  return null;
}
