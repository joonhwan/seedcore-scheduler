-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
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
);
INSERT INTO "new_users" ("created_at", "display_name", "global_role", "id", "is_active", "last_login_at", "password_hash", "password_must_change", "preferences_json", "updated_at", "username") SELECT "created_at", "display_name", "global_role", "id", "is_active", "last_login_at", "password_hash", "password_must_change", "preferences_json", "updated_at", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
