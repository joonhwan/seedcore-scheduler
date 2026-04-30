/*
  Warnings:

  - Added the required column `node_id_snapshot` to the `node_history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id_snapshot` to the `node_history` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_node_history" (
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
);
INSERT INTO "new_node_history" ("action", "actor_id", "diff_json", "id", "node_id", "occurred_at") SELECT "action", "actor_id", "diff_json", "id", "node_id", "occurred_at" FROM "node_history";
DROP TABLE "node_history";
ALTER TABLE "new_node_history" RENAME TO "node_history";
CREATE INDEX "node_history_node_id_snapshot_occurred_at_idx" ON "node_history"("node_id_snapshot", "occurred_at");
CREATE INDEX "node_history_project_id_snapshot_occurred_at_idx" ON "node_history"("project_id_snapshot", "occurred_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
