"""
Thread-safe SQLite connection manager for the Knowledge Graph MCP Server.

Manages connections with WAL mode, sqlite-vec extension loading,
and schema auto-initialization.
"""

import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Optional

from kg_mcp.config import settings
from kg_mcp.db.schema import ALL_DDL


class ConnectionManager:
    """Thread-safe SQLite connection manager with WAL mode and schema auto-initialization.

    Each thread gets its own connection via ``threading.local``. The schema is
    initialized exactly once across all threads.  The sqlite-vec extension is
    loaded on first connection with a graceful fallback if the shared library
    is not available.

    Usage::

        cm = ConnectionManager()
        cm.initialize_schema()
        conn = cm.get_connection()
        # use conn ...
        cm.close()
    """

    def __init__(self, db_path: Optional[str] = None, enable_fts: bool = False):
        """Create a connection manager for *db_path* (default: ``settings.db_path``).

        Parameters
        ----------
        db_path:
            Path to the SQLite database file.  ``:memory:`` is allowed for testing.
            Falls back to ``settings.db_path`` when *None*.
        enable_fts:
            If *True*, full-text search virtual tables will be created during schema
            initialisation (reserved for future use).
        """
        raw_path = db_path or settings.db_path
        if raw_path == ":memory:":
            # Use a unique URI per instance so tests don't share data
            self.db_path = f"file:memory-{uuid.uuid4()}?mode=memory&cache=private"
            self._is_memory = True
        else:
            self.db_path = str(Path(raw_path).resolve())
            self._is_memory = False
        self.enable_fts = enable_fts
        self._local = threading.local()
        self._lock = threading.Lock()
        self._init_lock = threading.Lock()
        self._initialized = False
        # Track whether sqlite-vec was loaded at the process level so we
        # don't spam warnings on every new thread.
        self._vec_loaded = False
        self._vec_available = True

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_connection(self) -> sqlite3.Connection:
        """Return a thread-local :class:`sqlite3.Connection`.

        Creates and configures a new connection when the calling thread does
        not already have one.  Configuration steps:

        * Set ``row_factory`` to :class:`sqlite3.Row`.
        * Enable `WAL journal mode`__.
        * Enable foreign key enforcement.
        * Set a 5-second busy timeout.
        * Attempt to load the ``sqlite-vec`` extension (best-effort).

        __ https://www.sqlite.org/wal.html
        """
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(self.db_path, uri=self._is_memory, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            conn.execute("PRAGMA busy_timeout=5000;")

            # ── Load sqlite-vec extension (best-effort) ──────────────
            self._try_load_vec(conn)

            self._local.conn = conn
        return self._local.conn

    def initialize_schema(self) -> None:
        """Create all tables, indexes, and views defined in ``ALL_DDL``.

        This method is idempotent — it runs the DDL exactly once (protected
        by a re-entrancy guard).  All statements use ``IF NOT EXISTS`` so
        they are safe to re-run, but the guard avoids unnecessary round-trips
        to the database.
        """
        if self._initialized:
            return
        with self._init_lock:
            if self._initialized:
                return
            conn = self.get_connection()
            conn.execute("BEGIN;")
            try:
                for ddl in ALL_DDL:
                    conn.execute(ddl)
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            self._initialized = True

    def close(self) -> None:
        """Close the connection for the **current** thread.

        Other threads are unaffected.  Safe to call multiple times.
        """
        if hasattr(self._local, "conn") and self._local.conn is not None:
            self._local.conn.close()
            self._local.conn = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _try_load_vec(self, conn: sqlite3.Connection) -> None:
        """Attempt to load the ``sqlite-vec`` extension.

        Gracefully degrades — if the shared library cannot be found the
        manager simply logs a warning (via ``print``) and continues without
        vector search support.
        """
        if self._vec_loaded or not self._vec_available:
            return
        try:
            conn.enable_load_extension(True)
            sqlite3.enable_callback_tracebacks(True)
            # Common install paths for sqlite-vec.
            candidates = [
                "vec0",
                "libvec0",
                "libvec0.dylib",
                "vec0.dll",
                "sqlite-vec",
                "libsqlite-vec",
            ]
            loaded = False
            for candidate in candidates:
                try:
                    conn.load_extension(candidate)
                    loaded = True
                    break
                except sqlite3.OperationalError:
                    continue
            if not loaded:
                # Final attempt — let sqlite search the default library path.
                conn.load_extension("vec0")
            self._vec_loaded = True
        except Exception:
            self._vec_available = False
            import sys

            print(
                "Warning: sqlite-vec extension not available. "
                "Vector search disabled. Install with: "
                "pip install sqlite-vec",
                file=sys.stderr,
            )
        finally:
            try:
                conn.enable_load_extension(False)
            except sqlite3.OperationalError:
                pass
