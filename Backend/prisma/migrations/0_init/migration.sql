-- CreateTable: employees
CREATE TABLE IF NOT EXISTS "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "emp_id" VARCHAR NOT NULL,
    "name" VARCHAR,
    "milvus_id" BIGINT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employees_emp_id_key" UNIQUE ("emp_id"),
    CONSTRAINT "employees_milvus_id_key" UNIQUE ("milvus_id")
);

-- CreateTable: cameras
CREATE TABLE IF NOT EXISTS "cameras" (
    "cam_id" UUID NOT NULL,
    "site_id" VARCHAR,
    "site_name" VARCHAR,
    "camera_label" VARCHAR,
    "created_at" TIMESTAMP(3),

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("cam_id")
);

-- CreateTable: attendance_events
CREATE TABLE IF NOT EXISTS "attendance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "emp_id" VARCHAR,
    "cam_id" UUID,
    "site_id" VARCHAR,
    "event_time" TIMESTAMP(3),
    "action" VARCHAR(10),
    "similarity_score" DOUBLE PRECISION,
    "liveness_passed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_emp" FOREIGN KEY ("emp_id") REFERENCES "employees" ("emp_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_cam" FOREIGN KEY ("cam_id") REFERENCES "cameras" ("cam_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_events_emp_time" ON "attendance_events" ("emp_id" DESC, "created_at" DESC);
