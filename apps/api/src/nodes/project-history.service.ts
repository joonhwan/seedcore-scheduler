import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildParentPaths,
  buildProjectHistory,
  type HistoryTopicValue,
  type NodeMeta,
  type ProjectHistoryQuery,
  type ProjectHistoryResponse,
  type RawCommentRow,
  type RawHistoryRow,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectReadAccess } from '../common/project-access';
import { parseDiff } from '../common/diff.util';

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
    await assertProjectReadAccess(this.prisma, projectId, ctx);

    const { from, to } = resolveWindow(q);

    // 이력: 삭제된 노드 포함(projectIdSnapshot 기준). COMMENTS 주제면 불필요.
    const historyRaw =
      q.topic === 'COMMENTS'
        ? []
        : await this.prisma.nodeHistory.findMany({
            where: { projectIdSnapshot: projectId, occurredAt: { gte: from, lte: to } },
            include: { actor: { select: { username: true, displayName: true } } },
            orderBy: { occurredAt: 'desc' },
            // 기간 창으로 이미 좁히지만, 매우 활발한 프로젝트에서 창 안 행이 폭증해도
            // 메모리를 방어하기 위한 상한(최신순). 최종 표시 상한(RESULT_LIMIT)의 여유 배수.
            take: RESULT_LIMIT * 4,
          });

    // 댓글: 살아있는 노드 + 미삭제. ALL/COMMENTS 주제에서만 필요.
    const commentRaw =
      q.topic === 'ALL' || q.topic === 'COMMENTS'
        ? await this.prisma.nodeComment.findMany({
            where: { deletedAt: null, node: { projectId }, createdAt: { gte: from, lte: to } },
            include: { author: { select: { username: true, displayName: true } } },
            orderBy: { createdAt: 'desc' },
            take: RESULT_LIMIT * 4, // 이력과 동일한 방어용 상한(최신순).
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

    const meta = await this.resolveNodeMeta(projectId, history, comments);

    return buildProjectHistory({
      history,
      comments,
      meta,
      topic: q.topic as HistoryTopicValue,
      limit: RESULT_LIMIT,
    });
  }

  /** 결과에 등장하는 노드들의 제목/삭제상태/부모 경로 map 을 만든다. */
  private async resolveNodeMeta(
    projectId: string,
    history: RawHistoryRow[],
    comments: RawCommentRow[],
  ): Promise<Map<string, NodeMeta>> {
    const ids = new Set<string>();
    history.forEach((h) => ids.add(h.nodeIdSnapshot));
    comments.forEach((c) => ids.add(c.nodeId));
    const idList = [...ids];
    const meta = new Map<string, NodeMeta>();
    if (idList.length === 0) return meta;

    // 등장한 노드만 읽지 않고 프로젝트 전체를 읽는다. 부모 경로를 만들려면 화면에 뜨지 않는
    // 조상들의 제목까지 필요하기 때문이다. 노드 상한이 프로젝트당 5,000 개이고 세 컬럼만
    // 읽으므로, 조상마다 따로 질의하는 것보다 이 편이 싸다(질의 횟수는 예전과 같은 1 회).
    const projectNodes = await this.prisma.scheduleNode.findMany({
      where: { projectId },
      select: { id: true, title: true, parentId: true },
    });
    const parentPaths = buildParentPaths(projectNodes);

    const liveIds = new Set<string>();
    for (const n of projectNodes) {
      liveIds.add(n.id);
      if (!ids.has(n.id)) continue; // 조상이지만 이력에는 없는 노드는 meta 에 넣지 않는다.
      meta.set(n.id, {
        title: n.title,
        deleted: false,
        parentPath: parentPaths.get(n.id) ?? [],
      });
    }

    const deadIds = idList.filter((id) => !liveIds.has(id));
    if (deadIds.length > 0) {
      // 삭제된 노드의 제목은 DELETE 이력의 diff.title.from 에서 복원.
      // 부모 경로는 복원하지 않는다 — 조상까지 함께 지워졌을 수 있어 신뢰할 수 없다.
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
        meta.set(id, {
          title: titleByDead.get(id) ?? '(삭제된 일정)',
          deleted: true,
          parentPath: [],
        });
      }
    }
    return meta;
  }
}

/** 상대 범위 프리셋을 일수로 환산한다. 한 달은 30일로 근사한다. */
const RANGE_DAYS: Partial<Record<ProjectHistoryQuery['range'], number>> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
};

/** range 를 실제 [from, to] Date 창으로 바꾼다. */
function resolveWindow(q: ProjectHistoryQuery): { from: Date; to: Date } {
  const now = new Date();
  if (q.range === 'custom' && q.from && q.to) {
    return {
      from: new Date(`${q.from}T00:00:00.000`),
      to: new Date(`${q.to}T23:59:59.999`),
    };
  }
  const days = RANGE_DAYS[q.range] ?? 30;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

function titleFromDiff(diff: Record<string, unknown>): string | null {
  const t = diff.title;
  if (t && typeof t === 'object' && 'from' in t) {
    const from = (t as { from: unknown }).from;
    if (typeof from === 'string') return from;
  }
  return null;
}
