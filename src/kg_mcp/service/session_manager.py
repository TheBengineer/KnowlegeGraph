"""
Session-scoped transaction manager for the Knowledge Graph MCP Server.

Allows LLMs to stage multiple graph mutations in a session, then commit
or rollback atomically. Sessions auto-expire after a configurable timeout.
"""

import uuid
from typing import Optional

from kg_mcp.config import settings
from kg_mcp.db.connection import ConnectionManager
from kg_mcp.db import queries as q


class SessionManager:
    """Manages session-scoped staging of graph operations.

    Each session holds a set of staged node/edge operations that can be
    committed atomically into the main graph tables or discarded via
    rollback. Stale sessions (no activity within the configured timeout)
    are cleaned up by :meth:`expire_stale_sessions`.
    """

    def __init__(self, conn_manager: ConnectionManager):
        """Initialise the manager and ensure the schema is created.

        Parameters
        ----------
        conn_manager:
            A :class:`~kg_mcp.db.connection.ConnectionManager` instance whose
            connections will be used for all database operations.
        """
        self.conn_manager = conn_manager
        self.conn_manager.initialize_schema()

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def create_session(self) -> str:
        """Create a new staging session.

        Returns
        -------
        str
            A UUID4 session identifier that can be passed to subsequent
            ``stage_*``, ``commit``, or ``rollback`` calls.
        """
        session_id = str(uuid.uuid4())
        conn = self.conn_manager.get_connection()
        conn.execute(q.INSERT_SESSION, {"session_id": session_id})
        conn.commit()
        return session_id

    # ------------------------------------------------------------------
    # Staging operations
    # ------------------------------------------------------------------

    def stage_node(
        self,
        session_id: str,
        node_id: str,
        label: str,
        properties: Optional[str] = None,
        source: str = "manual",
        op_type: str = "create",
    ) -> None:
        """Stage a node operation within *session_id*.

        Parameters
        ----------
        session_id:
            Active session identifier.
        node_id:
            Unique node identifier.
        label:
            Node label (name).
        properties:
            JSON-encoded properties string (defaults to ``"{}"``).
        source:
            Origin of the node (``"manual"``, ``"ai"``, ``"import"``, …).
        op_type:
            Operation type (``"create"``, ``"update"``, ``"delete"``).
        """
        conn = self.conn_manager.get_connection()
        conn.execute(
            q.STAGE_NODE,
            {
                "session_id": session_id,
                "id": node_id,
                "label": label,
                "properties": properties or "{}",
                "source": source,
                "op_type": op_type,
            },
        )
        conn.execute(q.UPDATE_SESSION_ACTIVITY, {"session_id": session_id})
        conn.commit()

    def stage_edge(
        self,
        session_id: str,
        edge_id: str,
        source: str,
        target: str,
        relation: str,
        properties: Optional[str] = None,
        weight: float = 1.0,
        op_type: str = "create",
    ) -> None:
        """Stage an edge operation within *session_id*.

        Parameters
        ----------
        session_id:
            Active session identifier.
        edge_id:
            Unique edge identifier.
        source:
            Source node ID.
        target:
            Target node ID.
        relation:
            Relationship type label.
        properties:
            JSON-encoded properties string (defaults to ``"{}"``).
        weight:
            Edge weight in ``[0, 10]`` (default ``1.0``).
        op_type:
            Operation type (``"create"``, ``"update"``, ``"delete"``).
        """
        conn = self.conn_manager.get_connection()
        conn.execute(
            q.STAGE_EDGE,
            {
                "session_id": session_id,
                "id": edge_id,
                "source": source,
                "target": target,
                "relation": relation,
                "properties": properties or "{}",
                "weight": weight,
                "op_type": op_type,
            },
        )
        conn.execute(q.UPDATE_SESSION_ACTIVITY, {"session_id": session_id})
        conn.commit()

    # ------------------------------------------------------------------
    # Transaction semantics
    # ------------------------------------------------------------------

    def commit(self, session_id: str) -> int:
        """Commit all staged operations atomically.

        Reads every staged node and edge for *session_id*, inserts them
        into the main ``nodes`` / ``edges`` tables, clears the staging
        area, and marks the session as ``"committed"``.  If any step
        fails the entire operation is rolled back.

        Parameters
        ----------
        session_id:
            The session to commit.

        Returns
        -------
        int
            Number of operations (nodes + edges) that were committed.
        """
        conn = self.conn_manager.get_connection()

        # Read staged operations while still outside the commit transaction
        # so that a long-running read does not hold a write lock.
        staged_nodes = conn.execute(
            q.GET_STAGED_NODES, {"session_id": session_id}
        ).fetchall()
        staged_edges = conn.execute(
            q.GET_STAGED_EDGES, {"session_id": session_id}
        ).fetchall()

        total_staged = len(staged_nodes) + len(staged_edges)
        if total_staged == 0:
            # Nothing to commit — still mark the session so callers can
            # distinguish "committed (empty)" from "still active".
            conn.execute(
                q.UPDATE_SESSION_STATUS,
                {"session_id": session_id, "status": "committed"},
            )
            conn.commit()
            return 0

        try:
            # All writes below participate in a single implicit transaction.
            for node in staged_nodes:
                conn.execute(
                    q.INSERT_NODE,
                    {
                        "id": node["id"],
                        "label": node["label"],
                        "properties": node["properties"],
                        "source": node["source"],
                    },
                )

            for edge in staged_edges:
                conn.execute(
                    q.INSERT_EDGE,
                    {
                        "id": edge["id"],
                        "source": edge["source"],
                        "target": edge["target"],
                        "relation": edge["relation"],
                        "properties": edge["properties"],
                        "weight": edge["weight"],
                    },
                )

            # Clear staging and finalise session status.
            conn.execute(q.DELETE_STAGED_NODES, {"session_id": session_id})
            conn.execute(q.DELETE_STAGED_EDGES, {"session_id": session_id})
            conn.execute(
                q.UPDATE_SESSION_STATUS,
                {"session_id": session_id, "status": "committed"},
            )
            conn.commit()
            return total_staged

        except Exception as exc:
            conn.rollback()
            raise RuntimeError(
                f"Session commit failed for {session_id}: {exc}"
            ) from exc

    def rollback(self, session_id: str) -> bool:
        """Discard all staged operations for *session_id*.

        The session is marked as ``"rolled_back"``.  Stale staging rows
        are also cleaned up by the cascade-delete foreign key when
        :meth:`expire_stale_sessions` removes the session record.

        Parameters
        ----------
        session_id:
            The session to roll back.

        Returns
        -------
        bool
            Always ``True`` (the operation is inherently idempotent).
        """
        conn = self.conn_manager.get_connection()
        conn.execute(q.DELETE_STAGED_NODES, {"session_id": session_id})
        conn.execute(q.DELETE_STAGED_EDGES, {"session_id": session_id})
        conn.execute(
            q.UPDATE_SESSION_STATUS,
            {"session_id": session_id, "status": "rolled_back"},
        )
        conn.commit()
        return True

    def expire_stale_sessions(self) -> None:
        """Remove sessions (and their staged data) that have exceeded the
        configured inactivity timeout.

        The timeout is read from ``settings.session_timeout_seconds``.
        Staging rows are automatically removed via the ``ON DELETE CASCADE``
        foreign key defined on the staging tables.
        """
        conn = self.conn_manager.get_connection()
        conn.execute(
            q.CLEANUP_STALE_SESSIONS,
            {"timeout_seconds": settings.session_timeout_seconds},
        )
        conn.commit()
