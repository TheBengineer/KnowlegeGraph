"""Test SessionManager staged transactions."""

import pytest
from kg_mcp.service.session_manager import SessionManager


class TestSessionLifecycle:
    def test_create_session(self, session_manager):
        sid = session_manager.create_session()
        assert sid is not None
        assert len(sid) > 0

    def test_commit_session(self, conn_manager, session_manager):
        sid = session_manager.create_session()
        session_manager.stage_node(sid, "n1", "Python", "{}")
        session_manager.stage_node(sid, "n2", "TypeScript", "{}")
        session_manager.stage_edge(sid, "e1", "n1", "n2", "knows", "{}", 1.0)
        
        count = session_manager.commit(sid)
        assert count == 3

        conn = conn_manager.get_connection()
        nodes = conn.execute("SELECT COUNT(*) as c FROM nodes").fetchone()
        assert nodes[0] == 2

    def test_rollback_session(self, conn_manager, session_manager):
        sid = session_manager.create_session()
        session_manager.stage_node(sid, "n1", "Rollback", "{}")
        session_manager.rollback(sid)

        conn = conn_manager.get_connection()
        nodes = conn.execute("SELECT COUNT(*) as c FROM nodes").fetchone()
        assert nodes[0] == 0

    def test_empty_commit(self, session_manager):
        sid = session_manager.create_session()
        count = session_manager.commit(sid)
        assert count == 0
