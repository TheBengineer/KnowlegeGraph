"""
SQL DDL constants for the Knowledge Graph MCP Server.

All tables, indexes, and schema initialization logic.
"""

# ── Core Data Tables ──────────────────────────────────────────────

DDL_NODES = """
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    properties TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT DEFAULT 'manual',
    version INTEGER DEFAULT 1,
    embedding BLOB
);
"""

DDL_EDGES = """
CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    properties TEXT DEFAULT '{}',
    weight REAL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# ── Audit Log ─────────────────────────────────────────────────────

DDL_EVENTS = """
CREATE TABLE IF NOT EXISTS graph_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    snapshot TEXT DEFAULT '{}',
    performed_by TEXT,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# ── Session Staging ───────────────────────────────────────────────

DDL_SESSIONS = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
);
"""

DDL_STAGING_NODES = """
CREATE TABLE IF NOT EXISTS session_staging_nodes (
    session_id TEXT NOT NULL,
    id TEXT NOT NULL,
    label TEXT NOT NULL,
    properties TEXT DEFAULT '{}',
    source TEXT DEFAULT 'manual',
    version INTEGER DEFAULT 1,
    op_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
"""

DDL_STAGING_EDGES = """
CREATE TABLE IF NOT EXISTS session_staging_edges (
    session_id TEXT NOT NULL,
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    relation TEXT NOT NULL,
    properties TEXT DEFAULT '{}',
    weight REAL DEFAULT 1.0,
    op_type TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
"""

# ── Indexes ───────────────────────────────────────────────────────

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);",
    "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);",
    "CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);",
    "CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);",
    "CREATE INDEX IF NOT EXISTS idx_events_entity ON graph_events(entity_type, entity_id);",
    "CREATE INDEX IF NOT EXISTS idx_staging_nodes_session ON session_staging_nodes(session_id);",
    "CREATE INDEX IF NOT EXISTS idx_staging_edges_session ON session_staging_edges(session_id);",
]

# ── Combined ──────────────────────────────────────────────────────

ALL_DDL = [
    DDL_NODES,
    DDL_EDGES,
    DDL_EVENTS,
    DDL_SESSIONS,
    DDL_STAGING_NODES,
    DDL_STAGING_EDGES,
] + INDEXES
