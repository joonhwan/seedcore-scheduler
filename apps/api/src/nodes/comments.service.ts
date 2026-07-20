import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateCommentDto, NodeCommentItem } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectReadAccess } from '../common/project-access';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(nodeId: string, ctx: ActorContext): Promise<NodeCommentItem[]> {
    const node = await this.prisma.scheduleNode.findUnique({
      where: { id: nodeId },
      select: { id: true, projectId: true },
    });
    if (!node) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
    await assertProjectReadAccess(this.prisma, node.projectId, ctx);

    const comments = await this.prisma.nodeComment.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((c) => ({
      id: c.id,
      nodeId: c.nodeId,
      authorId: c.authorId,
      authorUsername: c.author.username,
      authorDisplayName: c.author.displayName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async add(
    nodeId: string,
    body: CreateCommentDto,
    ctx: ActorContext,
  ): Promise<NodeCommentItem> {
    const node = await this.prisma.scheduleNode.findUnique({
      where: { id: nodeId },
      select: { id: true, projectId: true },
    });
    if (!node) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
    await this.assertWriteAccess(node.projectId, ctx);

    const created = await this.prisma.nodeComment.create({
      data: {
        id: randomUUID(),
        nodeId,
        authorId: ctx.actorId,
        body: body.body,
      },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
      },
    });
    return {
      id: created.id,
      nodeId: created.nodeId,
      authorId: created.authorId,
      authorUsername: created.author.username,
      authorDisplayName: created.author.displayName,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /** 작성자 본인 OR MANAGER+ OR ADMIN+adminMode */
  async remove(commentId: string, ctx: ActorContext): Promise<void> {
    const comment = await this.prisma.nodeComment.findUnique({
      where: { id: commentId },
      include: { node: { select: { projectId: true } } },
    });
    if (!comment || comment.deletedAt !== null) {
      throw new NotFoundException({ error: 'COMMENT_NOT_FOUND' });
    }
    if (!comment.node) {
      // 노드가 cascade 로 사라진 케이스 — 댓글도 이미 정리됐어야 함.
      throw new NotFoundException({ error: 'COMMENT_NOT_FOUND' });
    }

    const projectId = comment.node.projectId;
    const isAuthor = comment.authorId === ctx.actorId;
    const isAdminOverride = ctx.globalRole === 'ADMIN' && ctx.adminMode;

    if (!isAuthor && !isAdminOverride) {
      const m = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: ctx.actorId } },
        select: { role: true },
      });
      if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
      if (m.role !== 'MANAGER') {
        throw new ForbiddenException({ error: 'MANAGER_OR_AUTHOR_REQUIRED' });
      }
    }

    // soft delete (deleted_at).
    await this.prisma.nodeComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }

  private async assertWriteAccess(
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
