CREATE TABLE IF NOT EXISTS tool_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id varchar(255) NOT NULL,
  package_name varchar(255) NOT NULL,
  category varchar(100),
  tags text[] DEFAULT '{}',
  tool_name varchar(255) NOT NULL,
  full_name varchar(255) NOT NULL UNIQUE,
  description text,
  input_schema jsonb,
  schema_version varchar(10) NOT NULL DEFAULT 'legacy',
  source varchar(20) NOT NULL DEFAULT 'manifest',
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_tool_catalog_package_id ON tool_catalog(package_id);
CREATE INDEX IF NOT EXISTS idx_tool_catalog_category ON tool_catalog(category);
CREATE INDEX IF NOT EXISTS idx_tool_catalog_tags ON tool_catalog USING GIN(tags);
