import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateAutocompleteTermDto,
  UpdateAutocompleteTermDto,
  AutocompleteTermDto,
} from '@sam/shared';

interface ActorContext {
  actorId: string;
  ip: string | null | undefined;
  userAgent: string | null | undefined;
  adminMode: boolean;
}

const SYNC_CRON_JOB_NAME = 'autocomplete-sync';
const TIMEZONE = 'Asia/Seoul';

@Injectable()
export class AutocompleteService implements OnModuleInit {
  private readonly logger = new Logger(AutocompleteService.name);
  private isSyncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    try {
      // 주기적 동기화: 매시 정각 (0 * * * *) 실행
      const syncCronExpr = process.env.AUTOCOMPLETE_SYNC_CRON ?? '0 * * * *';
      const job = new CronJob(
        syncCronExpr,
        () => {
          this.syncDynamicTerms().catch((err: unknown) =>
            this.logger.error(`scheduled autocomplete sync failed: ${this.stringifyError(err)}`),
          );
        },
        null,
        false,
        TIMEZONE,
      );
      this.scheduler.addCronJob(SYNC_CRON_JOB_NAME, job);
      job.start();
      this.logger.log(
        `autocomplete sync cron registered: "${syncCronExpr}" (${TIMEZONE})`,
      );
    } catch (err) {
      this.logger.error(
        `invalid AUTOCOMPLETE_SYNC_CRON: ${this.stringifyError(err)}. sync cron disabled.`,
      );
    }
  }

  async list(query: { kind?: 'GROUP' | 'ITEM' | undefined; query?: string | undefined }): Promise<AutocompleteTermDto[]> {
    const where: any = {};
    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.query) {
      where.title = {
        contains: query.query,
      };
    }

    const rows = await this.prisma.autocompleteTerm.findMany({
      where,
      orderBy: { title: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind as 'GROUP' | 'ITEM',
      isSystem: r.isSystem,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async adminList(query: {
    kind?: 'GROUP' | 'ITEM' | undefined;
    query?: string | undefined;
    isSystem?: boolean | undefined;
  }): Promise<AutocompleteTermDto[]> {
    const where: any = {};
    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.query) {
      where.title = {
        contains: query.query,
      };
    }
    if (query.isSystem !== undefined) {
      where.isSystem = query.isSystem;
    }

    const rows = await this.prisma.autocompleteTerm.findMany({
      where,
      orderBy: [
        { isSystem: 'desc' },
        { title: 'asc' },
      ],
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind as 'GROUP' | 'ITEM',
      isSystem: r.isSystem,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async collect(title: string, kind: 'GROUP' | 'ITEM'): Promise<void> {
    if (!title || !title.trim()) return;
    const cleanTitle = title.trim();

    try {
      await this.prisma.autocompleteTerm.upsert({
        where: { title_kind: { title: cleanTitle, kind } },
        update: {},
        create: {
          id: randomUUID(),
          title: cleanTitle,
          kind,
          isSystem: false,
        },
      });
    } catch (err) {
      this.logger.debug(`collect ignored for duplicate/race: ${cleanTitle} (${kind})`);
    }
  }

  async createAdminTerm(
    body: CreateAutocompleteTermDto,
    ctx: ActorContext,
  ): Promise<AutocompleteTermDto> {
    const cleanTitle = body.title.trim();
    
    // 중복 체크
    const exists = await this.prisma.autocompleteTerm.findUnique({
      where: { title_kind: { title: cleanTitle, kind: body.kind } },
    });
    if (exists) {
      throw new BadRequestException({ error: 'DUPLICATE_TERM', message: '이미 존재하는 자동완성 항목입니다.' });
    }

    const id = randomUUID();
    const created = await this.prisma.autocompleteTerm.create({
      data: {
        id,
        title: cleanTitle,
        kind: body.kind,
        isSystem: true,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'AUTOCOMPLETE_CREATE',
      targetType: 'autocomplete_term',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { title: cleanTitle, kind: body.kind, isSystem: true },
    });

    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'autocomplete_term',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'AUTOCOMPLETE_CREATE' },
      });
    }

    return {
      id: created.id,
      title: created.title,
      kind: created.kind as 'GROUP' | 'ITEM',
      isSystem: created.isSystem,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateAdminTerm(
    id: string,
    body: UpdateAutocompleteTermDto,
    ctx: ActorContext,
  ): Promise<AutocompleteTermDto> {
    const target = await this.prisma.autocompleteTerm.findUnique({
      where: { id },
    });
    if (!target) {
      throw new NotFoundException({ error: 'TERM_NOT_FOUND', message: '항목을 찾을 수 없습니다.' });
    }

    const cleanTitle = body.title.trim();
    if (cleanTitle !== target.title) {
      const exists = await this.prisma.autocompleteTerm.findUnique({
        where: { title_kind: { title: cleanTitle, kind: target.kind } },
      });
      if (exists) {
        throw new BadRequestException({ error: 'DUPLICATE_TERM', message: '이미 동일한 종류의 항목이 존재합니다.' });
      }
    }

    const updated = await this.prisma.autocompleteTerm.update({
      where: { id },
      data: {
        title: cleanTitle,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'AUTOCOMPLETE_UPDATE',
      targetType: 'autocomplete_term',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { from: target.title, to: cleanTitle, kind: target.kind },
    });

    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'autocomplete_term',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'AUTOCOMPLETE_UPDATE' },
      });
    }

    return {
      id: updated.id,
      title: updated.title,
      kind: updated.kind as 'GROUP' | 'ITEM',
      isSystem: updated.isSystem,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteAdminTerm(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.autocompleteTerm.findUnique({
      where: { id },
    });
    if (!target) {
      throw new NotFoundException({ error: 'TERM_NOT_FOUND', message: '항목을 찾을 수 없습니다.' });
    }

    await this.prisma.autocompleteTerm.delete({
      where: { id },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'AUTOCOMPLETE_DELETE',
      targetType: 'autocomplete_term',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { title: target.title, kind: target.kind, isSystem: target.isSystem },
    });

    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'autocomplete_term',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'AUTOCOMPLETE_DELETE' },
      });
    }
  }

  async syncDynamicTerms(): Promise<void> {
    if (this.isSyncing) {
      this.logger.warn('autocomplete sync already in progress');
      return;
    }
    this.isSyncing = true;
    this.logger.log('starting autocomplete dynamic terms sync...');
    const started = Date.now();

    try {
      // 양쪽을 한 번씩만 읽고 차집합은 메모리에서 구한다.
      //
      // 예전에는 dynamic term 마다 scheduleNode.count 를, distinct 조합마다 findUnique 를
      // 날려서 쿼리가 (term 수 + 조합 수) 만큼 나갔다. 매시 정각에 도는 작업인데 SQLite 는
      // 단일 writer 라, 그 시간대의 사용자 쓰기가 이 수천 건 뒤에 줄을 섰다.
      const [allTerms, activeNodes] = await Promise.all([
        // 추가 여부는 isSystem 과 무관하게 (title, kind) 유일 제약으로 판단해야 하므로
        // 시스템 항목까지 다 읽는다. 삭제 대상만 isSystem=false 로 거른다.
        this.prisma.autocompleteTerm.findMany({
          select: { id: true, title: true, kind: true, isSystem: true },
        }),
        this.prisma.scheduleNode.findMany({
          select: { title: true, kind: true },
          distinct: ['title', 'kind'],
        }),
      ]);

      // (title, kind) 를 한 문자열로 합쳐 Set 으로 비교한다. 제목에 나올 수 없는 NUL 로 잇는다 —
      // 눈에 보이는 구분자를 쓰면 제목이 그 문자를 품을 때 서로 다른 조합이 같은 키가 된다.
      const keyOf = (title: string, kind: string): string => `${title.trim()}\u0000${kind}`;

      const nodeKeys = new Set<string>();
      for (const n of activeNodes) {
        if (!n.title || !n.title.trim()) continue;
        nodeKeys.add(keyOf(n.title, n.kind));
      }
      const termKeys = new Set(allTerms.map((t) => keyOf(t.title, t.kind)));

      // 1. 노드에서 더 이상 쓰이지 않는 동적 항목 삭제.
      //    양쪽 다 trim 한 값으로 비교하는 것이 중요하다. 저장은 collect() 가 trim 해서 하는데
      //    예전 코드는 그 trim 된 제목을 노드의 **원본** 제목과 대조해서, 제목 앞뒤에 공백이
      //    있는 노드의 항목이 매 사이클 지워졌다 다시 생기기를 반복했다.
      const staleIds = allTerms
        .filter((t) => !t.isSystem && !nodeKeys.has(keyOf(t.title, t.kind)))
        .map((t) => t.id);
      let deletedCount = 0;
      if (staleIds.length > 0) {
        const r = await this.prisma.autocompleteTerm.deleteMany({
          where: { id: { in: staleIds } },
        });
        deletedCount = r.count;
      }

      // 2. 노드에는 있는데 항목에 없는 조합 추가.
      const toAdd = activeNodes
        .filter((n) => n.title && n.title.trim() && !termKeys.has(keyOf(n.title, n.kind)))
        .map((n) => ({
          id: randomUUID(),
          title: n.title.trim(),
          kind: n.kind,
          isSystem: false,
        }));

      let addedCount = 0;
      if (toAdd.length > 0) {
        try {
          const r = await this.prisma.autocompleteTerm.createMany({ data: toAdd });
          addedCount = r.count;
        } catch (err) {
          // 사이 동안 collect() 가 같은 조합을 먼저 넣으면 유일 제약에 걸려 createMany 가
          // 통째로 실패한다(SQLite 는 skipDuplicates 미지원). 그 한 건 때문에 나머지를
          // 버리지 않도록 개별 삽입으로 물러난다. 다음 사이클에 다시 맞춰지므로 치명적이진 않다.
          this.logger.warn(
            `autocomplete bulk insert failed, falling back to per-row: ${this.stringifyError(err)}`,
          );
          for (const row of toAdd) {
            const ok = await this.prisma.autocompleteTerm
              .create({ data: row })
              .then(() => true)
              .catch(() => false);
            if (ok) addedCount += 1;
          }
        }
      }

      this.logger.log(
        `autocomplete sync completed in ${Date.now() - started}ms. (added: ${addedCount}, deleted: ${deletedCount})`,
      );
    } catch (err) {
      this.logger.error(`autocomplete sync process failed: ${this.stringifyError(err)}`);
    } finally {
      this.isSyncing = false;
    }
  }

  private stringifyError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
