-- CreateTable
CREATE TABLE "server_notices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduled_at" DATETIME NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" DATETIME,
    CONSTRAINT "server_notices_kind_check" CHECK ("kind" IN ('RESTART')),
    CONSTRAINT "server_notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
