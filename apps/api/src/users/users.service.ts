import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  MAX_GROUP_DEPTH,
  groupPathKey,
  parseUserImport,
  validatePassword,
  type BulkImportResult,
  type BulkImportUserPlan,
  type BulkImportUsersDto,
  type ParsedImport,
  type UserActivitySummary,
  type UserListItem,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';

interface ActorContext {
  actorId: string;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async list(args: {
    query?: string | undefined;
    status?: 'active' | 'inactive' | 'all' | undefined;
    includeRetired?: boolean | undefined;
  }): Promise<UserListItem[]> {
    const where: Record<string, unknown> = {};
    if (args.status === 'active') where.isActive = true;
    else if (args.status === 'inactive') where.isActive = false;
    // 재직 여부와 활성 여부는 독립한 축이다. 기본 화면에서는 퇴사자를 감춘다(확정명세 §6-나).
    if (!args.includeRetired) where.retiredAt = null;
    if (args.query && args.query.length > 0) {
      const q = args.query;
      where.OR = [
        { username: { contains: q } },
        { displayName: { contains: q } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return users.map(toUserListItem);
  }

  async create(
    input: { username: string; displayName: string; initialPassword: string },
    ctx: ActorContext,
  ): Promise<UserListItem> {
    const policyError = validatePassword(input.initialPassword, input.username);
    if (policyError) {
      throw new BadRequestException({
        error: 'PASSWORD_POLICY_VIOLATION',
        reason: policyError,
      });
    }

    const exists = await this.prisma.user.findUnique({
      where: { username: input.username },
    });
    if (exists) throw new ConflictException({ error: 'USERNAME_TAKEN' });

    const hash = await this.auth.hashPassword(input.initialPassword);
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        username: input.username,
        displayName: input.displayName,
        passwordHash: hash,
        passwordMustChange: true,
        globalRole: 'USER', // DESIGN §12-⑥: UI 는 USER 만 생성
        isActive: true,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_CREATE',
      targetType: 'user',
      targetId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { username: user.username, displayName: user.displayName },
    });

    return toUserListItem(user);
  }

  async update(
    id: string,
    patch: { displayName?: string | undefined; isActive?: boolean | undefined },
    ctx: ActorContext,
  ): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    // 퇴사자를 이 API 로 활성화하는 것을 막는다. `retired_at` 이 채워졌으면 `is_active` 는
    // 반드시 false 라는 불변식(설계 문서 §3)이 있는데, 이 경로는 target.retiredAt 을 보지
    // 않고 isActive 를 그대로 써서 그 불변식을 깰 수 있었다. 화면이 퇴사자 행에서 토글을
    // 감추는 것은 서버 쪽 보증이 아니다 — 예전에 읽어 둔 화면(그 사이 다른 관리자가 퇴사시킨
    // 경우)이나 직접 API 호출로 그대로 도달한다. 그 결과가 나쁜 쪽으로 비대칭이다: 계정은
    // 로그인과 후보 목록에 되돌아오는데, 목록 기본 화면은 여전히 퇴사자를 감춰 존재조차
    // 드러나지 않고, 퇴사 배지가 붙은 행은 토글이 감춰져 되돌릴 수도 없다. 상태를 되돌리는
    // 길은 복직(unretire) 하나로 모으고, 여기서는 거부한다.
    if (target.retiredAt !== null && patch.isActive === true) {
      throw new BadRequestException({ error: 'ALREADY_RETIRED' });
    }

    // 단일 ADMIN 비활성화 방지 — 활성 ADMIN 이 자기 자신밖에 없으면 거부.
    if (
      patch.isActive === false &&
      target.globalRole === 'ADMIN' &&
      target.isActive
    ) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          globalRole: 'ADMIN',
          isActive: true,
          id: { not: id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException({ error: 'LAST_ACTIVE_ADMIN' });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });

    if (patch.isActive === false && target.isActive) {
      const killed = await this.sessions.destroyAllForUser(id);
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_DEACTIVATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sessionsKilled: killed },
      });
    } else if (patch.isActive === true && !target.isActive) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_ACTIVATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } else if (patch.displayName !== undefined) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_UPDATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { displayName: patch.displayName },
      });
    }

    return toUserListItem(updated);
  }

  async resetPassword(id: string, ctx: ActorContext): Promise<string> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    const temporary = generateTemporaryPassword();
    const hash = await this.auth.hashPassword(temporary);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: hash,
        passwordMustChange: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.sessions.destroyAllForUser(id);

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_PASSWORD_RESET',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return temporary;
  }

  async unlock(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_UNLOCK',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        previousLockedUntil: target.lockedUntil
          ? target.lockedUntil.toISOString()
          : null,
        previousFailedCount: target.failedLoginCount,
      },
    });
  }

  /**
   * 계정 하나가 남긴 활동을 센다.
   *
   * `client` 를 받는 이유는 삭제가 트랜잭션 안에서 이 함수를 다시 부르기 때문이다. 조회
   * 시점과 삭제 시점 사이에 그 사람이 프로젝트에 추가될 수 있으므로, 지우기 직전에 같은
   * 기준으로 한 번 더 센다(설계 문서 §5.3).
   *
   * 세는 것은 열 갈래다. `sessions` 는 계정을 지우면 Cascade 로 함께 사라지고,
   * `audit_logs` 는 행을 남긴 채 행위자만 비우므로 둘 다 세지 않는다(설계 문서 §5.1).
   */
  private async countActivity(
    id: string,
    client: Prisma.TransactionClient,
  ): Promise<{ summary: UserActivitySummary; total: number }> {
    const [
      projectMemberships,
      groupMemberships,
      createdProjects,
      nodesCreated,
      nodesUpdated,
      comments,
      history,
      membershipsAdded,
      groupMembersAdded,
      serverNoticesCreated,
    ] = await Promise.all([
      client.projectMember.count({ where: { userId: id } }),
      client.userGroupMember.count({ where: { userId: id } }),
      client.project.count({ where: { createdById: id } }),
      client.scheduleNode.count({ where: { createdById: id } }),
      client.scheduleNode.count({ where: { updatedById: id } }),
      client.nodeComment.count({ where: { authorId: id } }),
      client.nodeHistory.count({ where: { actorId: id } }),
      client.projectMember.count({ where: { addedById: id } }),
      client.userGroupMember.count({ where: { addedById: id } }),
      client.serverNotice.count({ where: { createdBy: id } }),
    ]);

    const clearable = { projectMemberships, groupMemberships };
    const permanent = {
      createdProjects,
      nodesCreated,
      nodesUpdated,
      comments,
      history,
      membershipsAdded,
      groupMembersAdded,
      serverNoticesCreated,
    };
    const total =
      Object.values(clearable).reduce((a, b) => a + b, 0) +
      Object.values(permanent).reduce((a, b) => a + b, 0);

    return { summary: { canDelete: total === 0, clearable, permanent }, total };
  }

  async activity(id: string): Promise<UserActivitySummary> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    const { summary } = await this.countActivity(id, this.prisma);
    return summary;
  }

  /**
   * 퇴사 처리. **`retired_at` 과 `is_active` 를 반드시 함께 바꾼다.**
   *
   * `is_active` 를 보고 사람을 걸러내는 자리가 서버에 열다섯 군데 있다(로그인, 세션 검증,
   * 참여자 후보, 그룹 인원 추가 등). 함께 내리면 그 코드가 그대로 퇴사자를 막으므로 한 군데를
   * 빠뜨려 퇴사자가 참여자 후보에 뜨는 사고가 구조적으로 불가능해진다(설계 문서 §3).
   *
   * 그래서 `retired_at` 이 채워졌는데 `is_active = true` 인 조합은 만들지 않는다. 화면도
   * 퇴사자 행에서는 활성 토글을 감춘다.
   */
  async retire(id: string, ctx: ActorContext): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (id === ctx.actorId) {
      throw new BadRequestException({ error: 'SELF_ACTION_FORBIDDEN' });
    }
    if (target.retiredAt !== null) {
      throw new BadRequestException({ error: 'ALREADY_RETIRED' });
    }

    // 단일 ADMIN 보호 — update() 의 비활성화 금지와 같은 규칙이다.
    // 실제로는 열리지 않는 이중 안전장치다: 행위자는 항상 활성 ADMIN 이고(@AdminOnly + 세션
    // 검증), id === ctx.actorId 는 바로 위에서 이미 막으므로 otherActiveAdmins 는 행위자
    // 자신 때문에 최소 1이다. update() 에는 자기 자신 검사가 없어 그쪽 분기는 실제로
    // 필요하므로, 같은 규칙을 여기서도 지우지 않고 방어적으로 남겨 둔다.
    if (target.globalRole === 'ADMIN' && target.isActive) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { globalRole: 'ADMIN', isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException({ error: 'LAST_ACTIVE_ADMIN' });
      }
    }

    // 감사로그에 남길 값이므로 바뀌기 전에 잡아 둔다.
    const wasActive = target.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { retiredAt: new Date(), isActive: false },
    });
    const sessionsKilled = await this.sessions.destroyAllForUser(id);

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_RETIRE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { wasActive, sessionsKilled },
    });

    return toUserListItem(updated);
  }

  /**
   * 복직. **항상 활성으로 되돌린다.**
   *
   * 퇴사 전에 비활성이던 사람이라면 관리자가 복직 후 다시 내리면 된다. 드문 경우를 위해
   * 전이를 복잡하게 만들지 않는다. 퇴사 직전의 상태는 USER_RETIRE 감사로그의 wasActive 에
   * 남아 있다.
   */
  async unretire(id: string, ctx: ActorContext): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (target.retiredAt === null) {
      throw new BadRequestException({ error: 'NOT_RETIRED' });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { retiredAt: null, isActive: true },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_UNRETIRE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return toUserListItem(updated);
  }

  /**
   * 완전 삭제. 활동이 한 건도 없는 계정만 지운다.
   *
   * 감사로그는 **행을 남긴 채 행위자만 비운다.** 계정을 만들어 한 번 로그인하기만 해도
   * LOGIN_SUCCESS 가 남으므로, 그것을 활동으로 세면 지울 수 있는 계정이 사실상 없어져
   * "잘못 만든 계정을 정리한다"는 요청 취지를 절반만 채우게 된다(설계 문서 §3).
   * 세션은 users 행을 지우면 Cascade 로 함께 사라진다.
   *
   * 감사로그를 트랜잭션 밖에서 남기는 이유는, 삭제가 실패했는데 기록만 남는 일을 막기
   * 위함이다. 트랜잭션이 커밋된 뒤에만 기록된다.
   */
  async remove(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (id === ctx.actorId) {
      throw new BadRequestException({ error: 'SELF_ACTION_FORBIDDEN' });
    }

    await this.prisma.$transaction(async (tx) => {
      // 화면이 집계를 읽은 뒤 삭제를 누르기까지 사이에 그 사람이 프로젝트에 추가될 수 있다.
      // 그래서 지우기 직전에 같은 기준으로 한 번 더 센다.
      const { total } = await this.countActivity(id, tx);
      if (total > 0) {
        throw new BadRequestException({ error: 'USER_HAS_ACTIVITY' });
      }

      await tx.auditLog.updateMany({
        where: { actorId: id },
        data: { actorId: null },
      });
      await tx.user.delete({ where: { id } });
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_DELETE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { username: target.username, displayName: target.displayName },
    });
  }

  /**
   * 조직도 텍스트 한 장으로 그룹과 계정을 한 번에 만든다.
   *
   * `dryRun` 이 참이면 아무것도 쓰지 않고 무엇이 만들어질지만 세어 준다. 미리보기와 적용이
   * 같은 계산(`resolveImport`)을 지나므로 "미리보기에서는 31명이라 했는데 등록하니 30명"이
   * 생길 수 없다.
   */
  async bulkImport(input: BulkImportUsersDto, ctx: ActorContext): Promise<BulkImportResult> {
    const parsed = parseUserImport(input.text);

    if (parsed.issues.length > 0 && !input.dryRun) {
      throw new BadRequestException({ error: 'BULK_IMPORT_INVALID', issues: parsed.issues });
    }

    if (input.dryRun) {
      const r = await this.resolveImport(this.prisma, parsed);
      return {
        applied: false,
        previewToken: bulkImportTokenOf(r.groupsToCreate, r.usersToCreate),
        groupsToCreate: r.groupsToCreate,
        groupsExisting: r.groupsExisting,
        usersToCreate: r.usersToCreate,
        usersExisting: r.usersExisting,
        issues: parsed.issues,
        createdUserCount: 0,
        createdGroupCount: 0,
        skippedUserCount: 0,
      };
    }

    // ── 적용 ────────────────────────────────────────────────────────────
    // 정책 판단의 단일 지점은 validatePassword 하나다(AGENTS.md §4.4). 그 함수는 username 을
    // 반드시 받고 "아이디를 비밀번호에 넣지 말 것"까지 보므로, 공통 비밀번호라도 파일에 적힌
    // 아이디 전부에 대해 확인한다. 한 사람이라도 걸리면 그 값은 공통으로 쓸 수 없다.
    for (const u of parsed.users) {
      const policyError = validatePassword(input.initialPassword, u.username);
      if (policyError) {
        throw new BadRequestException({
          error: 'PASSWORD_POLICY_VIOLATION',
          reason: policyError,
          username: u.username,
        });
      }
    }

    // 해싱을 트랜잭션 밖에서 먼저 끝낸다. bcrypt 는 한 번에 40밀리초 남짓이라 34명이면
    // 1.5초가량인데, 트랜잭션 안에 두면 SQLite 의 단일 Writer 를 그만큼 붙들어 다른 사람의
    // 저장이 모두 밀린다. 실제로 쓸 사람은 트랜잭션 안에서 정해지므로 파일에 적힌 사람
    // 전부를 미리 해싱한다 — 건너뛸 두어 명 몫이 남는 대신 락 시간이 짧아진다.
    const hashByUsername = new Map<string, string>();
    for (const u of parsed.users) {
      hashByUsername.set(u.username, await this.auth.hashPassword(input.initialPassword));
    }

    const pending: AuditEntry[] = [];
    let outcome: { created: BulkImportUserPlan[]; groups: string[][]; skipped: number };

    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        // 대조를 여기서 다시 한다. 위에서 한 번 했더라도 그 사이 해싱에 1초 넘게 흘렀다.
        const r = await this.resolveImport(tx as unknown as PrismaService, parsed);

        if (r.usersExisting.length > 0 && !input.skipExisting) {
          throw new BadRequestException({
            error: 'BULK_IMPORT_DUPLICATE',
            usernames: r.usersExisting.map((x) => x.username),
          });
        }
        if (bulkImportTokenOf(r.groupsToCreate, r.usersToCreate) !== input.previewToken) {
          throw new ConflictException({ error: 'BULK_IMPORT_STALE' });
        }

        // 상위 그룹이 먼저 있어야 하위 그룹의 parentId 를 채울 수 있다. 경로 길이 순으로
        // 만들면 부모가 반드시 앞선다.
        const idByPathKey = new Map(r.idByPathKey);
        const orderedGroups = [...r.groupsToCreate].sort((a, b) => a.length - b.length);
        for (const path of orderedGroups) {
          const parentId =
            path.length === 1 ? null : (idByPathKey.get(groupPathKey(path.slice(0, -1))) ?? null);
          if (path.length > 1 && parentId === null) {
            // 여기에 닿으면 파서나 정렬이 깨진 것이다. 조용히 최상위로 만들면 조직도가
            // 어긋난 채 남으므로 통째로 되돌린다.
            throw new ConflictException({ error: 'BULK_IMPORT_STALE' });
          }
          const created = await tx.userGroup.create({
            data: { id: randomUUID(), name: path[path.length - 1]!, parentId, description: null },
          });
          idByPathKey.set(groupPathKey(path), created.id);
          pending.push({
            actorId: ctx.actorId,
            action: 'GROUP_CREATE',
            targetType: 'user_group',
            targetId: created.id,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            payload: { name: created.name, parentId: created.parentId, bulkImport: true },
          });
        }

        for (const u of r.usersToCreate) {
          const created = await tx.user.create({
            data: {
              id: randomUUID(),
              username: u.username,
              displayName: u.displayName,
              passwordHash: hashByUsername.get(u.username)!,
              passwordMustChange: true,
              globalRole: 'USER',
              isActive: true,
            },
          });
          pending.push({
            actorId: ctx.actorId,
            action: 'USER_CREATE',
            targetType: 'user',
            targetId: created.id,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            payload: {
              username: created.username,
              displayName: created.displayName,
              bulkImport: true,
            },
          });

          if (u.groupPath.length > 0) {
            const groupId = idByPathKey.get(groupPathKey(u.groupPath));
            if (groupId === undefined) throw new ConflictException({ error: 'BULK_IMPORT_STALE' });
            await tx.userGroupMember.create({
              data: { groupId, userId: created.id, addedById: ctx.actorId },
            });
            pending.push({
              actorId: ctx.actorId,
              action: 'GROUP_MEMBER_ADD',
              targetType: 'user_group_member',
              targetId: `${groupId}:${created.id}`,
              ip: ctx.ip,
              userAgent: ctx.userAgent,
              payload: { bulkImport: true },
            });
          }
        }

        return {
          created: r.usersToCreate,
          groups: r.groupsToCreate,
          skipped: r.usersExisting.length,
        };
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // 위 검사를 모두 지나고도 남는 경합은 유일 제약이 잡는다. 날것의 Prisma 오류를 그대로
      // 올리면 화면이 무슨 일인지 알 수 없으므로 같은 409 로 바꾼다.
      if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
        throw new ConflictException({ error: 'BULK_IMPORT_STALE' });
      }
      throw err;
    }

    // 감사로그는 커밋한 뒤에 남긴다. AuditService 는 자기 PrismaService 로 쓰기 때문에
    // 트랜잭션 안에서 부르면 같은 SQLite 파일에 두 번째 Writer 로 붙어 잠금 경합을 만든다.
    // 되돌아간 작업의 기록이 남지 않는다는 이점도 함께 얻는다.
    for (const entry of pending) await this.audit.log(entry);
    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_BULK_IMPORT',
      targetType: 'user',
      targetId: null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        createdUserCount: outcome.created.length,
        createdGroupCount: outcome.groups.length,
        skippedUserCount: outcome.skipped,
      },
    });

    return {
      applied: true,
      previewToken: input.previewToken!,
      groupsToCreate: outcome.groups,
      groupsExisting: [],
      usersToCreate: outcome.created,
      usersExisting: [],
      issues: [],
      createdUserCount: outcome.created.length,
      createdGroupCount: outcome.groups.length,
      skippedUserCount: outcome.skipped,
    };
  }

  /**
   * 파싱 결과를 데이터베이스와 대조해 "만들 것"과 "이미 있는 것"으로 가른다.
   *
   * 첫 인자로 클라이언트를 받는 이유는 **적용할 때 이 대조를 트랜잭션 안에서 다시 해야 하기
   * 때문**이다. 미리보기는 `this.prisma`, 적용은 트랜잭션 클라이언트를 넘긴다 (설계 문서 §4.4).
   */
  private async resolveImport(
    db: Pick<PrismaService, 'user' | 'userGroup'>,
    parsed: ParsedImport,
  ): Promise<{
    idByPathKey: Map<string, string>;
    groupsToCreate: string[][];
    groupsExisting: string[][];
    usersToCreate: BulkImportUserPlan[];
    usersExisting: { line: number; username: string }[];
  }> {
    // 그룹은 조직 규모상 많아야 수십 개라 통째로 읽어 경로를 만든다.
    const rows = await db.userGroup.findMany();
    const byId = new Map(rows.map((g) => [g.id, g]));
    const idByPathKey = new Map<string, string>();
    for (const g of rows) {
      const names: string[] = [];
      let cur: { id: string; name: string; parentId: string | null } | undefined = g;
      // 부모가 사라진 고아나 순환을 만나도 멈추도록 횟수를 제한한다.
      for (let hop = 0; cur !== undefined && hop <= MAX_GROUP_DEPTH; hop++) {
        names.unshift(cur.name);
        cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
      }
      idByPathKey.set(groupPathKey(names), g.id);
    }

    const groupsToCreate: string[][] = [];
    const groupsExisting: string[][] = [];
    for (const path of parsed.groups) {
      if (idByPathKey.has(groupPathKey(path))) groupsExisting.push(path);
      else groupsToCreate.push(path);
    }

    // 퇴사자도 아이디를 점유한다. retiredAt 으로 거르면 안 된다 — 거르면 만들려다 username
    // 유일 제약에 걸려 통째로 되돌아간다.
    const found = await db.user.findMany({
      where: { username: { in: parsed.users.map((u) => u.username) } },
    });
    const taken = new Set(found.map((f) => f.username));

    const usersToCreate: BulkImportUserPlan[] = [];
    const usersExisting: { line: number; username: string }[] = [];
    for (const u of parsed.users) {
      if (taken.has(u.username)) usersExisting.push({ line: u.line, username: u.username });
      else usersToCreate.push(u);
    }

    return { idByPathKey, groupsToCreate, groupsExisting, usersToCreate, usersExisting };
  }
}

/**
 * 미리보기가 약속한 결과를 한 문자열로 요약한다.
 *
 * 적용할 때 트랜잭션 안에서 다시 계산해 대조하며, 다르면 그 사이에 다른 관리자가 무언가를
 * 만든 것이므로 거부한다. AGENTS.md §4.5 의 expectedUpdatedAt 을 시각 하나가 아니라 집합에
 * 적용한 것이다.
 */
function bulkImportTokenOf(
  groupsToCreate: string[][],
  usersToCreate: { username: string }[],
): string {
  const g = groupsToCreate.map((p) => groupPathKey(p)).sort();
  const u = usersToCreate.map((x) => x.username).sort();
  return createHash('sha256').update(JSON.stringify({ g, u })).digest('hex');
}

/**
 * Prisma 의 사용자 행을 API 응답으로 바꾼다.
 *
 * list·create·update·retire·unretire 다섯 곳이 같은 매핑을 하므로 한 곳에 모은다.
 * 필드가 하나 늘 때마다 다섯 곳을 고치다 한 곳을 빠뜨리는 일을 막기 위함이다.
 */
function toUserListItem(u: {
  id: string;
  username: string;
  displayName: string;
  globalRole: string;
  isActive: boolean;
  passwordMustChange: boolean;
  lockedUntil: Date | null;
  failedLoginCount: number;
  lastLoginAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
}): UserListItem {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    globalRole: u.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
    isActive: u.isActive,
    passwordMustChange: u.passwordMustChange,
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    failedLoginCount: u.failedLoginCount,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    retiredAt: u.retiredAt ? u.retiredAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * 임시 비밀번호 — 영문 대/소, 숫자, 특수 모두 1자 이상 포함, 12자.
 * 정책(10자 + 3종) 자동 충족.
 */
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const special = '!@#$%^&*-_=+';
  const all = upper + lower + digit + special;

  const pick = (set: string): string => {
    const buf = randomBytes(1);
    return set[buf[0]! % set.length]!;
  };

  const required = [pick(upper), pick(lower), pick(digit), pick(special)];
  const remaining: string[] = [];
  while (required.length + remaining.length < 12) {
    remaining.push(pick(all));
  }
  const chars = [...required, ...remaining];

  // Fisher-Yates 셔플 (crypto.randomBytes).
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const r = randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[r]] = [chars[r]!, chars[i]!];
  }
  return chars.join('');
}
