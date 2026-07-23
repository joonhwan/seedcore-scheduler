import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode 는 결과 행을 반환하므로 $queryRawUnsafe 사용.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');

    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    try {
      const tables: any[] = await this.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users';",
      );
      if (tables.length === 0) {
        this.logger.log('Database tables not found. Initializing schema automatically...');
        const ddlStatements = [
          `CREATE TABLE IF NOT EXISTS "users" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "username" TEXT NOT NULL,
            "display_name" TEXT NOT NULL,
            "password_hash" TEXT NOT NULL,
            "password_must_change" BOOLEAN NOT NULL DEFAULT true,
            "global_role" TEXT NOT NULL DEFAULT 'USER',
            "is_active" BOOLEAN NOT NULL DEFAULT true,
            "preferences_json" TEXT,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            "last_login_at" DATETIME,
            "failed_login_count" INTEGER NOT NULL DEFAULT 0,
            "locked_until" DATETIME
          );`,
          `CREATE TABLE IF NOT EXISTS "projects" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "created_by" TEXT NOT NULL,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "project_members" (
            "project_id" TEXT NOT NULL,
            "user_id" TEXT NOT NULL,
            "role" TEXT NOT NULL,
            "added_by" TEXT NOT NULL,
            "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("project_id", "user_id"),
            CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "project_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "schedule_nodes" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "project_id" TEXT NOT NULL,
            "parent_id" TEXT,
            "kind" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "description" TEXT,
            "start_at" TEXT,
            "end_at" TEXT,
            "progress" INTEGER NOT NULL DEFAULT 0,
            "sort_order" INTEGER NOT NULL,
            "depth" INTEGER NOT NULL,
            "created_by" TEXT NOT NULL,
            "updated_by" TEXT NOT NULL,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            CONSTRAINT "schedule_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "schedule_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "schedule_nodes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "schedule_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "schedule_nodes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "node_comments" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "node_id" TEXT NOT NULL,
            "author_id" TEXT NOT NULL,
            "body" TEXT NOT NULL,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL,
            "deleted_at" DATETIME,
            CONSTRAINT "node_comments_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "schedule_nodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT "node_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "node_history" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "node_id" TEXT,
            "node_id_snapshot" TEXT NOT NULL,
            "project_id_snapshot" TEXT NOT NULL,
            "actor_id" TEXT NOT NULL,
            "action" TEXT NOT NULL,
            "diff_json" TEXT NOT NULL,
            "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "node_history_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "schedule_nodes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            CONSTRAINT "node_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "audit_logs" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "actor_id" TEXT,
            "action" TEXT NOT NULL,
            "target_type" TEXT,
            "target_id" TEXT,
            "ip" TEXT,
            "user_agent" TEXT,
            "occurred_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "payload_json" TEXT,
            CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "sessions" (
            "sid" TEXT NOT NULL PRIMARY KEY,
            "user_id" TEXT NOT NULL,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "expires_at" DATETIME NOT NULL,
            "ip" TEXT,
            "user_agent" TEXT,
            CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
          );`,
          `CREATE TABLE IF NOT EXISTS "autocomplete_terms" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "title" TEXT NOT NULL,
            "kind" TEXT NOT NULL,
            "is_system" BOOLEAN NOT NULL DEFAULT false,
            "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updated_at" DATETIME NOT NULL
          );`,
          `CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");`,
          `CREATE INDEX IF NOT EXISTS "project_members_user_id_idx" ON "project_members"("user_id");`,
          `CREATE INDEX IF NOT EXISTS "schedule_nodes_project_id_parent_id_sort_order_idx" ON "schedule_nodes"("project_id", "parent_id", "sort_order");`,
          `CREATE INDEX IF NOT EXISTS "node_comments_node_id_created_at_idx" ON "node_comments"("node_id", "created_at");`,
          `CREATE INDEX IF NOT EXISTS "node_history_node_id_snapshot_occurred_at_idx" ON "node_history"("node_id_snapshot", "occurred_at");`,
          `CREATE INDEX IF NOT EXISTS "node_history_project_id_snapshot_occurred_at_idx" ON "node_history"("project_id_snapshot", "occurred_at");`,
          `CREATE INDEX IF NOT EXISTS "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");`,
          `CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");`,
          `CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions"("expires_at");`,
          `CREATE UNIQUE INDEX IF NOT EXISTS "autocomplete_terms_title_kind_key" ON "autocomplete_terms"("title", "kind");`,
        ];

        for (const statement of ddlStatements) {
          await this.$executeRawUnsafe(statement);
        }
        this.logger.log('Database schema initialization completed successfully.');
      }
    } catch (err) {
      this.logger.error('Failed to initialize database schema:', err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

