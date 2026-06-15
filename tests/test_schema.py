"""Test SQL DDL schema creation and idempotency."""

from kg_mcp.db.connection import ConnectionManager
from kg_mcp.db.schema import ALL_DDL


def test_ddl_constants_exist():
    assert len(ALL_DDL) > 10  # 6 tables + 7 indexes


def test_schema_creates_tables():
    cm = ConnectionManager(':memory:')
    cm.initialize_schema()
    conn = cm.get_connection()
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    table_names = {t[0] for t in tables}
    expected = {"nodes", "edges", "graph_events", "sessions", "session_staging_nodes", "session_staging_edges"}
    assert expected.issubset(table_names), f"Missing tables: {expected - table_names}"


def test_schema_idempotent():
    cm = ConnectionManager(':memory:')
    cm.initialize_schema()
    cm.initialize_schema()  # second call should not fail
    conn = cm.get_connection()
    count = conn.execute("SELECT COUNT(*) as c FROM nodes").fetchone()
    assert count[0] == 0
