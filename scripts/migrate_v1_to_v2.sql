-- =============================================================================
-- DATA MIGRATION: Old Schema (employees/cameras/attendance_events) → New Schema
-- =============================================================================
--
-- Run this ONCE against the database that has old-schema tables with data.
-- After running, the new tables will contain migrated data, and old tables
-- will be renamed with _legacy suffix for verification.
--
-- Milvus vector data needs NO migration — emp_id in Milvus maps directly
-- to student_id in the new students table.
--
-- Usage:
--   psql -h <host> -U <user> -d <database> -f scripts/migrate_v1_to_v2.sql
-- =============================================================================

BEGIN;

-- ─── Step 0: Safety check ───────────────────────────────────────────────────
-- Abort if new tables already exist (migration already ran)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
        RAISE EXCEPTION 'Table "students" already exists. Migration may have already been run. Aborting.';
    END IF;
END $$;

-- ─── Step 1: Rename old tables to _legacy ───────────────────────────────────
ALTER TABLE IF EXISTS employees        RENAME TO employees_legacy;
ALTER TABLE IF EXISTS cameras          RENAME TO cameras_legacy;
ALTER TABLE IF EXISTS attendance_events RENAME TO attendance_events_legacy;

-- Rename old constraints/indexes to avoid conflicts
ALTER INDEX IF EXISTS employees_pkey      RENAME TO employees_legacy_pkey;
ALTER INDEX IF EXISTS employees_emp_id_key RENAME TO employees_legacy_emp_id_key;
ALTER INDEX IF EXISTS employees_milvus_id_key RENAME TO employees_legacy_milvus_id_key;
ALTER INDEX IF EXISTS cameras_pkey        RENAME TO cameras_legacy_pkey;
ALTER INDEX IF EXISTS attendance_events_pkey RENAME TO attendance_events_legacy_pkey;
ALTER INDEX IF EXISTS idx_events_emp_time RENAME TO idx_events_emp_time_legacy;

-- ─── Step 2: Create new schema tables ───────────────────────────────────────

-- Rooms
CREATE TABLE "rooms" (
    "room_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_name" VARCHAR(100) NOT NULL,
    "default_students" TEXT[] DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("room_id"),
    CONSTRAINT "rooms_room_name_key" UNIQUE ("room_name")
);

-- Cameras (new schema: one camera per room, with RTSP URL)
CREATE TABLE "cameras" (
    "cam_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "rtsp_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cameras_pkey" PRIMARY KEY ("cam_id"),
    CONSTRAINT "cameras_room_id_key" UNIQUE ("room_id"),
    CONSTRAINT "cameras_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("room_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Students
CREATE TABLE "students" (
    "student_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "milvus_id" BIGINT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id"),
    CONSTRAINT "students_milvus_id_key" UNIQUE ("milvus_id")
);

-- Periods
CREATE TABLE "periods" (
    "period_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_name" VARCHAR(50) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    CONSTRAINT "periods_pkey" PRIMARY KEY ("period_id"),
    CONSTRAINT "periods_start_time_end_time_key" UNIQUE ("start_time", "end_time")
);

-- Sessions
CREATE TABLE "sessions" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "session_date" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "booked_by" VARCHAR(100),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id"),
    CONSTRAINT "sessions_period_id_room_id_session_date_key" UNIQUE ("period_id", "room_id", "session_date"),
    CONSTRAINT "sessions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("period_id") ON UPDATE CASCADE,
    CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("room_id") ON UPDATE CASCADE
);
CREATE INDEX "idx_sessions_status_date" ON "sessions"("status", "session_date");

-- Attendance Records
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'ABSENT',
    "detected_at" TIMESTAMP(3),
    "similarity_score" DOUBLE PRECISION,
    "manually_marked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_records_session_id_student_id_key" UNIQUE ("session_id", "student_id"),
    CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("student_id") ON UPDATE CASCADE
);
CREATE INDEX "idx_records_session" ON "attendance_records"("session_id");
CREATE INDEX "idx_records_student_session" ON "attendance_records"("student_id", "session_id");

-- ─── Step 3: Migrate employee data → students ──────────────────────────────
-- emp_id becomes student_id, milvus_id preserved (links to Milvus vectors)
INSERT INTO students (student_id, name, milvus_id, enrolled_at)
SELECT
    emp_id,
    COALESCE(name, 'Unknown'),
    milvus_id,
    enrolled_at
FROM employees_legacy
ON CONFLICT (student_id) DO NOTHING;

-- ─── Step 4: Migrate camera data → rooms + cameras ─────────────────────────
-- Create rooms from old camera site data.
-- Each old camera becomes a room (using camera_label or site_name as room name).
-- RTSP URL is set to a placeholder — must be configured via the admin UI.
INSERT INTO rooms (room_id, room_name, created_at)
SELECT
    cl.cam_id,  -- reuse old cam_id as room_id for traceability
    COALESCE(
        cl.camera_label,
        cl.site_name,
        'Room-' || LEFT(cl.cam_id::text, 8)
    ),
    COALESCE(cl.created_at, NOW())
FROM cameras_legacy cl
ON CONFLICT (room_name) DO NOTHING;

-- Create new camera entries linked to the rooms we just created.
-- RTSP URL must be filled in manually through the admin UI.
INSERT INTO cameras (cam_id, room_id, rtsp_url, is_active, created_at)
SELECT
    gen_random_uuid(),
    r.room_id,
    'rtsp://CONFIGURE_ME',
    true,
    COALESCE(cl.created_at, NOW())
FROM cameras_legacy cl
JOIN rooms r ON r.room_id = cl.cam_id  -- room_id = old cam_id from step above
ON CONFLICT (room_id) DO NOTHING;

-- ─── Step 5: Mark Prisma migration as applied ───────────────────────────────
-- Create the _prisma_migrations table if it doesn't exist and mark the
-- initial migration as applied so `prisma migrate deploy` won't re-run it.
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMP WITH TIME ZONE,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMP WITH TIME ZONE,
    "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, applied_steps_count)
VALUES (
    gen_random_uuid()::text,
    'manual_migration_v1_to_v2',
    NOW(),
    '0_init',
    'Migrated from old schema (employees/cameras/attendance_events) to new schema (rooms/students/sessions). Legacy tables preserved with _legacy suffix.',
    1
)
ON CONFLICT DO NOTHING;

-- ─── Step 6: Summary ────────────────────────────────────────────────────────
DO $$
DECLARE
    student_count INT;
    room_count INT;
    camera_count INT;
    legacy_emp_count INT;
BEGIN
    SELECT COUNT(*) INTO student_count FROM students;
    SELECT COUNT(*) INTO room_count FROM rooms;
    SELECT COUNT(*) INTO camera_count FROM cameras;
    SELECT COUNT(*) INTO legacy_emp_count FROM employees_legacy;

    RAISE NOTICE '══════════════════════════════════════════════════════';
    RAISE NOTICE 'Migration Complete!';
    RAISE NOTICE '  Employees migrated → Students: % / %', student_count, legacy_emp_count;
    RAISE NOTICE '  Rooms created: %', room_count;
    RAISE NOTICE '  Cameras created: % (RTSP URLs need configuration)', camera_count;
    RAISE NOTICE '  Legacy tables preserved: employees_legacy, cameras_legacy, attendance_events_legacy';
    RAISE NOTICE '  Milvus data: NO MIGRATION NEEDED (emp_id = student_id)';
    RAISE NOTICE '══════════════════════════════════════════════════════';
END $$;

COMMIT;
