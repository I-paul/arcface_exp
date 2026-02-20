CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY,
  emp_id VARCHAR UNIQUE,     -- company-provided ID
  name VARCHAR,
  milvus_id BIGINT UNIQUE,   -- link to vector DB identity
  enrolled_at TIMESTAMP DEFAULT now()
);
