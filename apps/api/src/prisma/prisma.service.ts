import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl, resolveDbFilePath } from '../common/db-path';
import { decideBoot } from './boot-decision';
import { createMigrationClient } from './migration-client';
import { formatInitFailureNotice, formatNoMigrationFilesNotice } from './migration-messages';
import { MigrationFailedError, applyMigrations, resolveMigrationsDir } from './migration-runner';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode 는 결과 행을 반환하므로 $queryRawUnsafe 사용.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    await this.$queryRawUnsafe('PRAGMA busy_timeout=10000;');

    // 마이그레이션은 foreign_keys=ON 앞에서 처리한다.
    // 마이그레이션 SQL 이 RedefineTables 패턴에서 FK 를 꺼야 동작하기 때문이다.
    await this.handleMigrations();

    await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
  }

  private async handleMigrations(): Promise<void> {
    let dir: string;
    try {
      dir = resolveMigrationsDir();
    } catch (err) {
      // 실행 파일에 내장되어야 할 migrations 디렉터리 자체가 없다 — 설치가 손상된 상태다.
      // (디렉터리는 있는데 비어 있는 경우는 decideBoot() 이 exit 6 으로 처리한다. 여기는
      //  후보 경로 어디에도 디렉터리 자체가 없는, 그보다 앞선 단계의 실패다.)
      //
      // 이 try/catch 가 없으면 예외가 onModuleInit 밖으로 새어나간다. onModuleInit 안에는
      // Nest 의 ExceptionsZone 이 없어서 app.listen() 의 rejected promise → main.ts 의
      // `void bootstrap()` 에서 unhandled rejection → Node 가 영문 스택 트레이스를 뿌리고
      // **exit 1** 로 죽는다. 그런데 README-exe.txt 는 sp-server.exe 의 exit 1 을 "신규 DB
      // 초기화 실패 = DB 파일과 -wal/-shm 을 지우고 다시 실행(잃을 데이터 없음)" 으로
      // 안내한다. 즉 설치가 깨진 것뿐인 관리자가 유일한 설명서를 따라 운영 DB 를 지우게 된다.
      // 같은 조건에서 sp-migrate.exe 가 이미 exit 6 을 쓰므로(migrate-main.ts:68-76) 여기서도
      // 같은 코드와 같은 안내를 쓴다.
      const notice = formatNoMigrationFilesNotice();
      console.error(notice);
      this.logger.error(notice);
      // err.message 에는 탐색한 후보 경로 목록이 들어 있다(migration-runner.ts:307-309).
      // 잘못된 설치/배치를 진단할 유일한 단서라 로그에 반드시 남긴다.
      this.logger.error(
        `migrations directory not found: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.$disconnect();
      process.exit(6);
    }

    const decision = await decideBoot(this, dir);

    if (decision.kind === 'boot') {
      return;
    }

    if (decision.kind === 'apply') {
      this.logger.log(`새 데이터베이스입니다. 마이그레이션 ${decision.names.length}건을 적용합니다.`);
      // 적용은 반드시 connection_limit=1 로 고정한 별도 client 로 한다 (createMigrationClient
      // 의 docstring 참고). `this` 는 Nest 가 관리하는 기본 풀 설정이라 마이그레이션 SQL 의
      // PRAGMA foreign_keys=OFF 가 뒤따르는 DROP TABLE 과 다른 커넥션에서 실행될 수 있다.
      // 적용이 끝나면 바로 정리해 커넥션을 오래 붙들지 않는다.
      const applyClient = createMigrationClient(resolveDatabaseUrl());
      try {
        await applyClient.$connect();
        await applyMigrations(applyClient, dir, decision.names);
      } catch (err) {
        // 새 DB 초기화가 중간에 깨진 상태다. 반쪽 스키마로 서버를 띄우면 안 된다.
        // 잃을 데이터가 없는 상태이므로 복구 방법은 DB 파일(및 WAL/SHM 사이드카) 삭제 후
        // 재시도가 가장 확실하다. 안내 문구는 migration-messages.ts 에서 관리한다.
        const detail = err instanceof MigrationFailedError ? err.message : String(err);
        const notice = formatInitFailureNotice(detail, resolveDbFilePath());
        console.error(notice);
        // 안내 전문을 로그 파일에도 남긴다. 관리자가 탐색기에서 더블클릭해 실행하면
        // (README-exe.txt 2절 1단계) 종료와 함께 콘솔 창이 사라져 화면 안내를 놓친다.
        // 그리고 다시 실행하면 formatInitFailureNotice() 자신이 경고하는 "다른 안내"가
        // 나오므로, 로그에 전문이 남아 있지 않으면 복구 방법을 되찾을 길이 없다.
        this.logger.error(notice);
        this.logger.error(`database initialization failed: ${detail}`);
        await applyClient.$disconnect();
        await this.$disconnect();
        process.exit(1);
      }
      await applyClient.$disconnect();
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
