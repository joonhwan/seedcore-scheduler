import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { decideBoot } from './boot-decision';
import { MigrationFailedError, applyMigrations, resolveMigrationsDir } from './migration-runner';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode 는 결과 행을 반환하므로 $queryRawUnsafe 사용.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');

    // 마이그레이션은 foreign_keys=ON 앞에서 처리한다.
    // 마이그레이션 SQL 이 RedefineTables 패턴에서 FK 를 꺼야 동작하기 때문이다.
    await this.handleMigrations();

    await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
  }

  private async handleMigrations(): Promise<void> {
    const dir = resolveMigrationsDir();
    const decision = await decideBoot(this, dir);

    if (decision.kind === 'boot') {
      return;
    }

    if (decision.kind === 'apply') {
      this.logger.log(`새 데이터베이스입니다. 마이그레이션 ${decision.names.length}건을 적용합니다.`);
      try {
        await applyMigrations(this, dir, decision.names);
      } catch (err) {
        // 새 DB 초기화가 중간에 깨진 상태다. 반쪽 스키마로 서버를 띄우면 안 된다.
        // 잃을 데이터가 없는 상태이므로 복구 방법은 DB 파일 삭제 후 재시도가 가장 확실하다.
        const detail = err instanceof MigrationFailedError ? err.message : String(err);
        console.error('');
        console.error('데이터베이스 초기화에 실패했습니다.');
        console.error(`  ${detail}`);
        console.error('  data/sam.db 파일을 삭제한 뒤 다시 실행하십시오.');
        console.error('  계속 실패하면 담당 개발자에게 이 메시지를 그대로 전달하십시오.');
        console.error('');
        this.logger.error(`database initialization failed: ${detail}`);
        await this.$disconnect();
        process.exit(1);
      }
      this.logger.log('데이터베이스 초기화를 완료했습니다.');
      return;
    }

    // 관리자가 탐색기에서 더블클릭해 실행하면 콘솔이 순간적으로 닫힌다.
    // 그래서 표준 출력과 로거 양쪽에 남긴다. "키를 누르면 종료" 같은 대기는 넣지 않는다 —
    // 서비스 래퍼나 스크립트로 자동 기동할 때 프로세스가 멈춰버린다.
    console.error(decision.notice);
    this.logger.error(decision.notice);
    await this.$disconnect();
    process.exit(decision.exitCode);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
