CREATE TABLE IF NOT EXISTS risk_rules (
    rule_id TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
    weight INTEGER NOT NULL CHECK (weight >= 0),
    legal_basis TEXT,
    question_to_ask TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_regulations (
    regulation_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    issuing_body TEXT,
    issue_date TEXT,
    effective_date TEXT,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    full_text TEXT NOT NULL,
    keywords TEXT NOT NULL,
    source_url TEXT,
    applicable_scenarios TEXT
);

CREATE TABLE IF NOT EXISTS cases (
    case_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    scenario TEXT NOT NULL,
    risk_type TEXT NOT NULL,
    description TEXT NOT NULL,
    dispute_point TEXT NOT NULL,
    user_loss TEXT,
    handling_result TEXT,
    rights_path TEXT,
    source_url TEXT,
    embedding TEXT
);

CREATE TABLE IF NOT EXISTS contract_clause_templates (
    template_id TEXT PRIMARY KEY,
    contract_type TEXT NOT NULL,
    clause_category TEXT NOT NULL,
    common_patterns TEXT NOT NULL,
    field_mapping TEXT,
    risk_indicators TEXT
);

CREATE TABLE IF NOT EXISTS financial_products (
    product_id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    product_type TEXT NOT NULL,
    institution TEXT,
    typical_rate_range TEXT,
    common_fees TEXT,
    prepayment_policy TEXT,
    overdue_policy TEXT
);

CREATE TABLE IF NOT EXISTS market_rates (
    rate_id TEXT PRIMARY KEY,
    rate_type TEXT NOT NULL,
    rate_value REAL NOT NULL,
    effective_date TEXT NOT NULL,
    source TEXT
);

CREATE TABLE IF NOT EXISTS financial_glossary (
    term_id TEXT PRIMARY KEY,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    category TEXT NOT NULL,
    example TEXT
);

CREATE TABLE IF NOT EXISTS risk_case_outputs (
    run_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    input_run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    output_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_items (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    confidence REAL,
    clause_text TEXT NOT NULL,
    clause_location TEXT,
    related_clause_ids TEXT NOT NULL,
    reason TEXT NOT NULL,
    possible_consequence TEXT NOT NULL,
    question_to_ask TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES risk_case_outputs(run_id)
);

CREATE TABLE IF NOT EXISTS risk_evidence (
    evidence_id TEXT PRIMARY KEY,
    risk_item_id TEXT NOT NULL,
    clause_id TEXT NOT NULL,
    quote TEXT NOT NULL,
    location_json TEXT NOT NULL,
    FOREIGN KEY (risk_item_id) REFERENCES risk_items(id)
);

CREATE TABLE IF NOT EXISTS risk_matched_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    risk_item_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    title TEXT NOT NULL,
    similarity REAL,
    conclusion TEXT NOT NULL,
    source_url TEXT,
    FOREIGN KEY (risk_item_id) REFERENCES risk_items(id)
);
