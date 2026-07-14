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
      // 1. isSystem = false 인 AutocompleteTerm 중 실제 DB 노드에 쓰이지 않는 것들 삭제
      const dynamicTerms = await this.prisma.autocompleteTerm.findMany({
        where: { isSystem: false },
      });

      let deletedCount = 0;
      for (const term of dynamicTerms) {
        const count = await this.prisma.scheduleNode.count({
          where: { title: term.title, kind: term.kind },
        });
        if (count === 0) {
          await this.prisma.autocompleteTerm.delete({
            where: { id: term.id },
          }).catch(() => {});
          deletedCount++;
        }
      }

      // 2. 실제 DB 노드에 있는 title & kind 쌍 중 AutocompleteTerm에 없는 것 추가
      const activeNodes = await this.prisma.scheduleNode.findMany({
        select: { title: true, kind: true },
        distinct: ['title', 'kind'],
      });

      let addedCount = 0;
      for (const node of activeNodes) {
        if (!node.title || !node.title.trim()) continue;
        const cleanTitle = node.title.trim();

        const exists = await this.prisma.autocompleteTerm.findUnique({
          where: { title_kind: { title: cleanTitle, kind: node.kind } },
        });

        if (!exists) {
          await this.prisma.autocompleteTerm.create({
            data: {
              id: randomUUID(),
              title: cleanTitle,
              kind: node.kind,
              isSystem: false,
            },
          }).catch(() => {});
          addedCount++;
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
