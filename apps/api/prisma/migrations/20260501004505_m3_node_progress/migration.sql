-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_schedule_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TEXT,
    "end_at" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0 CHECK ("progress" >= 0 AND "progress" <= 100),
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
);
INSERT INTO "new_schedule_nodes" ("created_at", "created_by", "depth", "description", "end_at", "id", "kind", "parent_id", "project_id", "sort_order", "start_at", "title", "updated_at", "updated_by") SELECT "created_at", "created_by", "depth", "description", "end_at", "id", "kind", "parent_id", "project_id", "sort_order", "start_at", "title", "updated_at", "updated_by" FROM "schedule_nodes";
DROP TABLE "schedule_nodes";
ALTER TABLE "new_schedule_nodes" RENAME TO "schedule_nodes";
CREATE INDEX "schedule_nodes_project_id_parent_id_sort_order_idx" ON "schedule_nodes"("project_id", "parent_id", "sort_order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
