CREATE EXTENSION IF NOT EXISTS vector;

-- Main test scenarios table
CREATE TABLE IF NOT EXISTS test_scenarios (
    id BIGSERIAL PRIMARY KEY,
    feature_id TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    description TEXT,
    priority TEXT CHECK (priority IN ('high','medium','low')),
    type TEXT CHECK (type IN ('happy_path','edge_case','negative','regression')),
    steps JSONB NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    status TEXT DEFAULT 'active',
    last_run TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- World model table
CREATE TABLE IF NOT EXISTS world_model (
    id BIGSERIAL PRIMARY KEY,
    page_url TEXT UNIQUE,
    elements JSONB,
    flows JSONB,
    last_updated TIMESTAMPTZ
);

-- Execution logs table
CREATE TABLE IF NOT EXISTS execution_logs (
    id BIGSERIAL PRIMARY KEY,
    scenario_id BIGINT REFERENCES test_scenarios(id),
    run_at TIMESTAMPTZ,
    status TEXT,
    screenshot_url TEXT,
    error_details JSONB,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_test_scenarios_feature_id ON test_scenarios(feature_id);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_status ON test_scenarios(status);
CREATE INDEX IF NOT EXISTS idx_execution_logs_scenario_id ON execution_logs(scenario_id);

-- pgvector index for cosine distance search
CREATE INDEX IF NOT EXISTS idx_test_scenarios_embedding
ON test_scenarios
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
