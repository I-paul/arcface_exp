-- CreateTable: rooms
CREATE TABLE IF NOT EXISTS "rooms" (
    "room_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_name" VARCHAR(100) NOT NULL,
    "default_students" TEXT[] DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("room_id"),
    CONSTRAINT "rooms_room_name_key" UNIQUE ("room_name")
);

-- CreateTable: cameras
CREATE TABLE IF NOT EXISTS "cameras" (
    "cam_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "rtsp_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cameras_pkey" PRIMARY KEY ("cam_id"),
    CONSTRAINT "cameras_room_id_key" UNIQUE ("room_id"),
    CONSTRAINT "cameras_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("room_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: students
CREATE TABLE IF NOT EXISTS "students" (
    "student_id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "milvus_id" BIGINT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "students_pkey" PRIMARY KEY ("student_id"),
    CONSTRAINT "students_milvus_id_key" UNIQUE ("milvus_id")
);

-- CreateTable: periods
CREATE TABLE IF NOT EXISTS "periods" (
    "period_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period_name" VARCHAR(50) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    CONSTRAINT "periods_pkey" PRIMARY KEY ("period_id"),
    CONSTRAINT "periods_start_time_end_time_key" UNIQUE ("start_time", "end_time")
);

-- CreateTable: sessions
CREATE TABLE IF NOT EXISTS "sessions" (
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

-- CreateIndex: sessions
CREATE INDEX IF NOT EXISTS "idx_sessions_status_date" ON "sessions"("status", "session_date");

-- CreateTable: attendance_records
CREATE TABLE IF NOT EXISTS "attendance_records" (
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

-- CreateIndex: attendance_records
CREATE INDEX IF NOT EXISTS "idx_records_session" ON "attendance_records"("session_id");
CREATE INDEX IF NOT EXISTS "idx_records_student_session" ON "attendance_records"("student_id", "session_id");
