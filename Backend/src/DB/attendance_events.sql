CREATE TABLE IF NOT EXISTS attendance_events (
  id UUID PRIMARY KEY,

  emp_id VARCHAR,            -- references employees.emp_id
  cam_id UUID,               -- references cameras.cam_id
  site_id VARCHAR,

  event_time TIMESTAMP,
  action ENUM('IN','OUT'),

  similarity_score FLOAT,
  liveness_passed BOOLEAN,

  created_at TIMESTAMP DEFAULT now(),

  CONSTRAINT attendance_emp
    FOREIGN KEY (emp_id)
    REFERENCES employees (emp_id),
  CONSTRAINT attendance_cam
    FOREIGN KEY (cam_id)
    REFERENCES cameras (cam_id)
);
