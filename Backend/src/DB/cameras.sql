CREATE TABLE IF NOT EXISTS cameras (
  cam_id UUID PRIMARY KEY,
  site_id VARCHAR,
  site_name VARCHAR,
  camera_label VARCHAR,
  created_at TIMESTAMP
);
