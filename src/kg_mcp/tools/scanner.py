"""Codebase scanner using stdlib AST and regex extraction."""

import ast
import fnmatch
import os
import re
from pathlib import Path
from typing import Optional

from fastmcp import FastMCP

from kg_mcp.service.graph_service import GraphService
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate


# Language definitions: extensions → regex patterns
# Each pattern is (pattern_string, node_type, is_edge, label_group)
# For edges, source is the file and target is the extracted name

PYTHON_PATTERNS = [
    (r'^class\s+(\w+)', 'class', False, 1),
    (r'^def\s+(\w+)', 'function', False, 1),
    (r'^async\s+def\s+(\w+)', 'function', False, 1),
]

JS_TS_PATTERNS = [
    (r'^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)', 'function', False, 1),
    (r'^(?:export\s+)?(?:default\s+)?class\s+(\w+)', 'class', False, 1),
    (r'^(?:export\s+)?interface\s+(\w+)', 'interface', False, 1),
    (r'^(?:export\s+)?type\s+(\w+)\s*=', 'type', False, 1),
    (r'^const\s+(\w+)\s*=\s*(?:async\s+)?\(', 'function', False, 1),
]

GO_PATTERNS = [
    (r'^func\s+(\w+)', 'function', False, 1),
    (r'^type\s+(\w+)\s+struct', 'struct', False, 1),
    (r'^type\s+(\w+)\s+interface', 'interface', False, 1),
]

RUST_PATTERNS = [
    (r'^fn\s+(\w+)', 'function', False, 1),
    (r'^struct\s+(\w+)', 'struct', False, 1),
    (r'^enum\s+(\w+)', 'enum', False, 1),
    (r'^trait\s+(\w+)', 'trait', False, 1),
]

RUBY_PATTERNS = [
    (r'^class\s+(\w+)', 'class', False, 1),
    (r'^def\s+(\w+)', 'function', False, 1),
    (r'^module\s+(\w+)', 'module', False, 1),
]

IMPORT_PATTERNS = {
    '.py': [r'^import\s+(\w+)', r'^from\s+(\w+)'],
    '.js': [r'^import\s+.*\s+from\s+[\'\"](.+?)[\'\"]'],
    '.ts': [r'^import\s+.*\s+from\s+[\'\"](.+?)[\'\"]'],
    '.jsx': [r'^import\s+.*\s+from\s+[\'\"](.+?)[\'\"]'],
    '.tsx': [r'^import\s+.*\s+from\s+[\'\"](.+?)[\'\"]'],
    '.go': [r'^import\s+[\'\"](.+?)[\'\"]'],
    '.rs': [r'^use\s+(\w+)'],
    '.rb': [r'^require\s+[\'\"](.+?)[\'\"]', r'^require_relative\s+[\'\"](.+?)[\'\"]'],
}

LANGUAGE_PATTERNS = {
    '.py': PYTHON_PATTERNS,
    '.js': JS_TS_PATTERNS,
    '.ts': JS_TS_PATTERNS,
    '.jsx': JS_TS_PATTERNS,
    '.tsx': JS_TS_PATTERNS,
    '.go': GO_PATTERNS,
    '.rs': RUST_PATTERNS,
    '.java': PYTHON_PATTERNS,  # Java uses similar patterns (class, function)
    '.rb': RUBY_PATTERNS,
}

# Files/dirs to skip
IGNORED_DIRS = {
    'node_modules', '.git', '__pycache__', 'venv', '.venv',
    'dist', 'build', '.next', '.nx', 'target', 'vendor',
}
IGNORED_EXTS = {
    '.pyc', '.pyo', '.so', '.dll', '.dylib', '.class', '.o',
    '.exe', '.bin',
}

CODE_EXTENSIONS = (
    set(LANGUAGE_PATTERNS.keys())
    | {
        '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift',
        '.kt', '.scala', '.sh', '.bash', '.sql', '.yaml',
        '.yml', '.toml', '.json', '.html', '.css',
    }
)
DOC_EXTENSIONS = {'.md', '.txt', '.rst'}


def _load_gitignore(root: Path) -> list[str]:
    """Load .gitignore patterns from root directory."""
    gitignore_path = root / '.gitignore'
    patterns = []
    if gitignore_path.exists():
        try:
            for line in gitignore_path.read_text(encoding='utf-8', errors='replace').splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    patterns.append(line)
        except Exception:
            pass
    return patterns


def _is_ignored(rel_path: str, gitignore_patterns: list[str]) -> bool:
    """Check if a relative path matches any .gitignore pattern."""
    for pat in gitignore_patterns:
        # Handle directory-only patterns (ending with /)
        stripped = pat.rstrip('/')
        if fnmatch.fnmatch(rel_path, stripped) or fnmatch.fnmatch(rel_path, f'**/{stripped}'):
            return True
        # Match against just the filename too
        if fnmatch.fnmatch(Path(rel_path).name, stripped):
            return True
    return False


def _detect_files(root: Path, max_files: Optional[int] = None) -> dict:
    """Walk directory and classify files."""
    code_files = []
    doc_files = []

    gitignore_patterns = _load_gitignore(root)

    for dirpath, dirnames, filenames in os.walk(root):
        # Skip ignored directories (by name)
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS and not d.startswith('.')]

        rel_dir = Path(dirpath).relative_to(root) if dirpath != str(root) else Path('')

        # Filter directories against gitignore
        dirnames[:] = [
            d for d in dirnames
            if not _is_ignored(str(rel_dir / d), gitignore_patterns)
        ]

        for fname in filenames:
            ext = Path(fname).suffix.lower()
            if ext in IGNORED_EXTS:
                continue

            rel_path = rel_dir / fname
            if _is_ignored(str(rel_path), gitignore_patterns):
                continue

            fpath = Path(dirpath) / fname

            if ext in CODE_EXTENSIONS:
                code_files.append(str(fpath))
            elif ext in DOC_EXTENSIONS:
                doc_files.append(str(fpath))

    # Sort for deterministic ordering, then limit
    code_files.sort()
    doc_files.sort()

    if max_files:
        code_files = code_files[:max_files]

    return {
        'code': code_files,
        'doc': doc_files,
        'total': len(code_files) + len(doc_files),
    }


def _extract_python_ast(filepath: str, content: str) -> tuple[list[dict], list[dict]]:
    """Extract nodes and edges from a Python file using the ast module."""
    nodes = []
    edges = []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return [], []

    # File node
    fname = Path(filepath).stem
    nodes.append({'id': f'file:{filepath}', 'label': fname, 'type': 'file', 'file': filepath})

    # Collect all class names to resolve inheritance targets later
    class_names = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef)
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            nid = f'{filepath}::{node.name}'
            nodes.append({
                'id': nid,
                'label': node.name,
                'type': 'class',
                'file': filepath,
                'line': str(node.lineno),
            })
            edges.append({
                'source': f'file:{filepath}',
                'target': nid,
                'relation': 'contains',
            })

            # Inheritance
            for base in node.bases:
                if isinstance(base, ast.Name) and base.id in class_names:
                    edges.append({
                        'source': nid,
                        'target': f'{filepath}::{base.id}',
                        'relation': 'extends',
                    })

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            nid = f'{filepath}::{node.name}'
            nodes.append({
                'id': nid,
                'label': node.name,
                'type': 'function',
                'file': filepath,
                'line': str(node.lineno),
            })
            edges.append({
                'source': f'file:{filepath}',
                'target': nid,
                'relation': 'contains',
            })

        elif isinstance(node, ast.Import):
            for alias in node.names:
                target = alias.name.split('.')[0]
                edges.append({
                    'source': f'file:{filepath}',
                    'target': f'import:{target}',
                    'relation': 'imports',
                })

        elif isinstance(node, ast.ImportFrom):
            if node.module:
                target = node.module.split('.')[0]
                edges.append({
                    'source': f'file:{filepath}',
                    'target': f'import:{target}',
                    'relation': 'imports',
                })

    # Build method membership: find which class each function belongs to
    for class_node in ast.walk(tree):
        if not isinstance(class_node, ast.ClassDef):
            continue
        for child in ast.iter_child_nodes(class_node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                edges.append({
                    'source': f'{filepath}::{class_node.name}',
                    'target': f'{filepath}::{child.name}',
                    'relation': 'has_method',
                })

    return nodes, edges


def _extract_regex(filepath: str, content: str, ext: str) -> tuple[list[dict], list[dict]]:
    """Extract nodes and edges using regex patterns."""
    nodes = []
    edges = []

    fname = Path(filepath).stem
    nodes.append({'id': f'file:{filepath}', 'label': fname, 'type': 'file', 'file': filepath})

    patterns = LANGUAGE_PATTERNS.get(ext, [])

    for line in content.split('\n'):
        line_stripped = line.strip()

        # Pattern matching for declarations
        for pat, node_type, is_edge, group in patterns:
            m = re.match(pat, line_stripped)
            if m:
                name = m.group(group)
                nid = f'{filepath}::{name}'
                nodes.append({
                    'id': nid,
                    'label': name,
                    'type': node_type,
                    'file': filepath,
                })
                edges.append({
                    'source': f'file:{filepath}',
                    'target': nid,
                    'relation': 'contains',
                })
                break

        # Import matching (run independently of declaration patterns)
        import_pats = IMPORT_PATTERNS.get(ext, [])
        for pat in import_pats:
            m = re.match(pat, line_stripped)
            if m:
                target = m.group(1).split('.')[0]
                edges.append({
                    'source': f'file:{filepath}',
                    'target': f'import:{target}',
                    'relation': 'imports',
                })
                break

    return nodes, edges


def _scan_file(
    filepath: str,
    max_line_count: int = 5000,
) -> tuple[list[dict], list[dict]]:
    """Scan a single file and return nodes and edges."""
    path = Path(filepath)
    ext = path.suffix.lower()

    try:
        content = path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return [], []

    # Skip huge files
    lines = content.count('\n')
    if lines > max_line_count:
        return [], []

    if ext == '.py':
        return _extract_python_ast(filepath, content)
    elif ext in LANGUAGE_PATTERNS:
        return _extract_regex(filepath, content, ext)
    elif ext in CODE_EXTENSIONS:
        # Simple file-only node for other code types
        fname = path.stem
        return (
            [{'id': f'file:{filepath}', 'label': fname, 'type': 'file', 'file': filepath}],
            [],
        )

    return [], []


def register_scanner_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def scan_codebase(
        path: str,
        max_files: Optional[int] = None,
    ) -> dict:
        """Scan a directory of code files and import entities as a knowledge graph.

        Extracts classes, functions, and imports from code files using:
        - Python ast module for .py files (stdlib, accurate)
        - Regex extraction for JavaScript, TypeScript, Go, Rust, Java, Ruby

        Args:
            path: Directory path to scan (absolute or relative)
            max_files: Maximum number of code files to scan (default: all)

        Returns:
            Summary of imported nodes and edges
        """
        resolved = Path(path).expanduser().resolve()
        if not resolved.exists():
            return {'error': f'Path does not exist: {resolved}'}
        if not resolved.is_dir():
            return {'error': f'Path is not a directory: {resolved}'}

        # Detect files
        files = _detect_files(resolved, max_files)
        code_files = files['code']

        if not code_files:
            return {'error': f'No supported code files found in {resolved}'}

        # Scan each file
        node_id_map = {}
        imported_nodes = 0
        imported_edges = 0
        scanned_count = 0

        for fpath in code_files:
            nodes, edges = _scan_file(fpath)
            if not nodes:
                continue

            scanned_count += 1

            for node_data in nodes:
                nid = node_data.get('id', '')
                label = node_data.get('label', nid)
                node_type = node_data.get('type', 'unknown')

                if nid in node_id_map:
                    continue

                try:
                    created = svc.add_node(
                        NodeCreate(
                            label=str(label)[:255],
                            properties={
                                'scan_type': node_type,
                                'file': str(node_data.get('file', '')),
                                'line': str(node_data.get('line', '')),
                            },
                            source='scanner',
                        )
                    )
                    node_id_map[nid] = created.id
                    imported_nodes += 1
                except Exception:
                    continue

            for edge_data in edges:
                source_id = edge_data.get('source', '')
                target_id = edge_data.get('target', '')
                relation = edge_data.get('relation', 'references')

                our_source = node_id_map.get(source_id)
                our_target = node_id_map.get(target_id)

                # For imports, the target may not exist as a scanned node
                if not our_target and relation == 'imports':
                    try:
                        imported = svc.add_node(
                            NodeCreate(
                                label=target_id.replace('import:', ''),
                                properties={'scan_type': 'import'},
                                source='scanner',
                            )
                        )
                        node_id_map[target_id] = imported.id
                        our_target = imported.id
                        imported_nodes += 1
                    except Exception:
                        continue

                if our_source and our_target:
                    try:
                        svc.add_edge(
                            EdgeCreate(
                                source=our_source,
                                target=our_target,
                                relation=str(relation)[:255],
                                properties={
                                    'file': str(edge_data.get('file', fpath)),
                                },
                            )
                        )
                        imported_edges += 1
                    except Exception:
                        continue

        return {
            'node_count': imported_nodes,
            'edge_count': imported_edges,
            'file_count': scanned_count,
            'total_files_found': len(code_files),
        }

    @mcp.tool
    def scan_status() -> dict:
        """Count of scanner-sourced nodes in the graph."""
        conn = svc.conn_manager.get_connection()
        count = conn.execute(
            "SELECT COUNT(*) as c FROM nodes WHERE source = 'scanner'"
        ).fetchone()
        return {
            'source': 'scanner',
            'node_count': count[0] if count else 0,
        }
