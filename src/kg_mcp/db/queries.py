"""
Named, parameterized SQL statements for the Knowledge Graph MCP Server.

All queries use named parameters (`:param`) for safe parameterization.
"""

# ── Node Queries ──────────────────────────────────────────────────

INSERT_NODE = """
INSERT INTO nodes (id, label, properties, source, version, created_at, updated_at)
VALUES (:id, :label, :properties, :source, 1, datetime('now'), datetime('now'))
RETURNING id, label, properties, source, version, created_at, updated_at;
"""

GET_NODE = """
SELECT id, label, properties, source, version, created_at, updated_at
FROM nodes
WHERE id = :id;
"""

UPDATE_NODE = """
UPDATE nodes
SET label = COALESCE(:label, label),
    properties = COALESCE(:properties, properties),
    source = COALESCE(:source, source),
    version = version + 1,
    updated_at = datetime('now')
WHERE id = :id
RETURNING id, label, properties, source, version, created_at, updated_at;
"""

DELETE_NODE = """
DELETE FROM nodes WHERE id = :id;
"""

SEARCH_NODES_LABEL = """
SELECT id, label, properties, source, version, created_at, updated_at
FROM nodes
WHERE label LIKE '%' || :query || '%'
ORDER BY label
LIMIT :limit;
"""

SEARCH_NODES_PAGED = """
SELECT id, label, properties, source, version, created_at, updated_at
FROM nodes
WHERE (:cursor IS NULL OR id > :cursor)
ORDER BY id
LIMIT :limit;
"""

COUNT_NODES = """
SELECT COUNT(*) as count FROM nodes;
"""

# ── Edge Queries ──────────────────────────────────────────────────

INSERT_EDGE = """
INSERT INTO edges (id, source, target, relation, properties, weight, created_at, updated_at)
VALUES (:id, :source, :target, :relation, :properties, :weight, datetime('now'), datetime('now'))
RETURNING id, source, target, relation, properties, weight, created_at, updated_at;
"""

GET_EDGE = """
SELECT id, source, target, relation, properties, weight, created_at, updated_at
FROM edges
WHERE id = :id;
"""

GET_NEIGHBORS = """
SELECT e.id as edge_id, e.relation, e.weight, e.properties as edge_properties,
       CASE WHEN e.source = :node_id THEN e.target ELSE e.source END as neighbor_id,
       n.label as neighbor_label, n.properties as neighbor_properties
FROM edges e
JOIN nodes n ON n.id = CASE WHEN e.source = :node_id THEN e.target ELSE e.source END
WHERE (:direction = 'both' AND (e.source = :node_id OR e.target = :node_id))
   OR (:direction = 'outgoing' AND e.source = :node_id)
   OR (:direction = 'incoming' AND e.target = :node_id)
  AND (:relation IS NULL OR e.relation = :relation)
ORDER BY e.id
LIMIT :limit;
"""

GET_EDGES_BY_SOURCE = """
SELECT id, source, target, relation, properties, weight, created_at, updated_at
FROM edges
WHERE source = :source_id;
"""

GET_EDGES_BY_TARGET = """
SELECT id, source, target, relation, properties, weight, created_at, updated_at
FROM edges
WHERE target = :target_id;
"""

DELETE_EDGE = """
DELETE FROM edges WHERE id = :id;
"""

DELETE_EDGES_BY_NODE = """
DELETE FROM edges WHERE source = :node_id OR target = :node_id;
"""

COUNT_EDGES = """
SELECT COUNT(*) as count FROM edges;
"""

# ── Path / Subgraph Queries ───────────────────────────────────────

GET_SUBGRAPH_NODES = """
WITH RECURSIVE subgraph AS (
    SELECT id, label, properties, source, version, created_at, updated_at, 0 as depth
    FROM nodes WHERE id = :root_id
    UNION
    SELECT n.id, n.label, n.properties, n.source, n.version, n.created_at, n.updated_at, sg.depth + 1
    FROM subgraph sg
    JOIN edges e ON e.source = sg.id OR e.target = sg.id
    JOIN nodes n ON n.id = CASE WHEN e.source = sg.id THEN e.target ELSE e.source END
    WHERE sg.depth < :max_depth
)
SELECT DISTINCT id, label, properties, source, version, created_at, updated_at
FROM subgraph;
"""

GET_SUBGRAPH_EDGES = """
WITH RECURSIVE subgraph AS (
    SELECT id, 0 as depth FROM nodes WHERE id = :root_id
    UNION
    SELECT n.id, sg.depth + 1
    FROM subgraph sg
    JOIN edges e ON e.source = sg.id OR e.target = sg.id
    JOIN nodes n ON n.id = CASE WHEN e.source = sg.id THEN e.target ELSE e.source END
    WHERE sg.depth < :max_depth
)
SELECT DISTINCT e.id, e.source, e.target, e.relation, e.properties, e.weight,
       e.created_at, e.updated_at
FROM edges e
JOIN subgraph sg1 ON e.source = sg1.id
JOIN subgraph sg2 ON e.target = sg2.id;
"""

FIND_PATH = """
WITH RECURSIVE path_finding AS (
    SELECT e.source as current, e.id as edge_id, e.source || ',' || e.target as path_nodes,
           1 as depth
    FROM edges e WHERE e.source = :source_id
    UNION
    SELECT CASE WHEN e.source = pf.current THEN e.target ELSE e.source END,
           e.id,
           pf.path_nodes || ',' || CASE WHEN e.source = pf.current THEN e.target ELSE e.source END,
           pf.depth + 1
    FROM path_finding pf
    JOIN edges e ON (e.source = pf.current OR e.target = pf.current)
    WHERE pf.depth < :max_depth
      AND instr(',' || pf.path_nodes || ',', ',' || CASE WHEN e.source = pf.current THEN e.target ELSE e.source END || ',') = 0
)
SELECT path_nodes, depth
FROM path_finding
WHERE current = :target_id
ORDER BY depth
LIMIT 1;
"""

# ── Session Queries ───────────────────────────────────────────────

INSERT_SESSION = """
INSERT INTO sessions (session_id, status) VALUES (:session_id, 'active');
"""

GET_SESSION = """
SELECT session_id, created_at, last_active_at, status
FROM sessions
WHERE session_id = :session_id;
"""

UPDATE_SESSION_ACTIVITY = """
UPDATE sessions SET last_active_at = datetime('now') WHERE session_id = :session_id;
"""

UPDATE_SESSION_STATUS = """
UPDATE sessions SET status = :status WHERE session_id = :session_id;
"""

DELETE_SESSION = """
DELETE FROM sessions WHERE session_id = :session_id;
"""

STAGE_NODE = """
INSERT INTO session_staging_nodes (session_id, id, label, properties, source, version, op_type)
VALUES (:session_id, :id, :label, :properties, :source, 1, :op_type);
"""

STAGE_EDGE = """
INSERT INTO session_staging_edges (session_id, id, source, target, relation, properties, weight, op_type)
VALUES (:session_id, :id, :source, :target, :relation, :properties, :weight, :op_type);
"""

GET_STAGED_NODES = """
SELECT id, label, properties, source, version, op_type
FROM session_staging_nodes
WHERE session_id = :session_id;
"""

GET_STAGED_EDGES = """
SELECT id, source, target, relation, properties, weight, op_type
FROM session_staging_edges
WHERE session_id = :session_id;
"""

DELETE_STAGED_NODES = """
DELETE FROM session_staging_nodes WHERE session_id = :session_id;
"""

DELETE_STAGED_EDGES = """
DELETE FROM session_staging_edges WHERE session_id = :session_id;
"""

CLEANUP_STALE_SESSIONS = """
DELETE FROM sessions WHERE last_active_at < datetime('now', '-' || :timeout_seconds || ' seconds');
"""

# ── Analysis Queries ──────────────────────────────────────────────

GRAPH_DENSITY = """
SELECT 
    (SELECT COUNT(*) FROM nodes) as node_count,
    (SELECT COUNT(*) FROM edges) as edge_count,
    CASE WHEN (SELECT COUNT(*) FROM nodes) > 0
         THEN ROUND(CAST((SELECT COUNT(*) FROM edges) AS FLOAT) / 
              (CAST((SELECT COUNT(*) FROM nodes) AS FLOAT) * 
               (CAST((SELECT COUNT(*) FROM nodes) AS FLOAT) - 1)) * 2, 6)
         ELSE 0 END as density;
"""

MOST_CONNECTED_NODES = """
SELECT n.id, n.label, COUNT(*) as connection_count
FROM nodes n
JOIN edges e ON e.source = n.id OR e.target = n.id
GROUP BY n.id
ORDER BY connection_count DESC
LIMIT :limit;
"""

RELATION_STATS = """
SELECT relation, COUNT(*) as count
FROM edges
GROUP BY relation
ORDER BY count DESC;
"""
