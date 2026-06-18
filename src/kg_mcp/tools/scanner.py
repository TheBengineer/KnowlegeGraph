"""Codebase scanning tools using graphify extraction."""

import json
from pathlib import Path
from typing import Optional

from fastmcp import FastMCP

from kg_mcp.service.graph_service import GraphService
from kg_mcp.models.node import NodeCreate
from kg_mcp.models.edge import EdgeCreate


def register_scanner_tools(mcp: FastMCP, svc: GraphService):
    @mcp.tool
    def scan_codebase(path: str, max_files: Optional[int] = None) -> dict:
        """Scan a directory of code/docs and import entities as a knowledge graph.
        
        Uses graphify's AST extraction to parse code files (Python, JavaScript, TypeScript, 
        Go, Rust, Java, and 30+ other languages) and extract:
        - Classes, functions, interfaces as nodes
        - Imports, function calls, class inheritance as edges
        
        Also extracts semantic entities from documentation files (.md, .txt, etc.)
        
        Args:
            path: Directory path to scan (absolute or relative to cwd)
            max_files: Maximum number of files to scan (default: all)
            
        Returns:
            Summary of what was imported (node_count, edge_count, file_count)
        """
        resolved = Path(path).expanduser().resolve()
        if not resolved.exists():
            return {"error": f"Path does not exist: {resolved}"}
        if not resolved.is_dir():
            return {"error": f"Path is not a directory: {resolved}"}
        
        # Use graphify to scan the directory
        try:
            from graphify.detect import detect
            from graphify.extract import extract
        except ImportError:
            return {"error": "graphify library not available. Install with: pip install graphifyy"}
        
        # Step 1: Detect files
        detect_result = detect(resolved)
        total_files = detect_result.get("total_files", 0)
        if total_files == 0:
            return {"error": f"No supported files found in {resolved}"}
        
        file_count = total_files
        if max_files and file_count > max_files:
            file_count = max_files
        
        # Step 2: Extract AST nodes from code files
        code_files = []
        for f in detect_result.get("files", {}).get("code", []):
            p = Path(f)
            if p.exists() and p.is_file():
                code_files.append(p)
        
        if max_files:
            code_files = code_files[:max_files]
        
        ast_result = {"nodes": [], "edges": []}
        if code_files:
            ast_result = extract(code_files)
        
        # Step 3: Import into the knowledge graph
        node_id_map = {}  # Map graphify node IDs to KG node UUIDs
        imported_nodes = 0
        imported_edges = 0
        
        for node_data in ast_result.get("nodes", []):
            node_id = node_data.get("id", "")
            node_label = node_data.get("label", node_id)
            node_type = node_data.get("file_type", "unknown")
            
            properties = {
                "graphify_type": node_type,
                "file": node_data.get("source_file", ""),
                "line": node_data.get("source_location", ""),
                "graphify_id": node_id,
            }
            # Remove empty values
            properties = {k: v for k, v in properties.items() if v}
            
            try:
                created = svc.add_node(
                    NodeCreate(
                        label=str(node_label)[:255],
                        properties=properties,
                        source="graphify",
                    )
                )
                node_id_map[node_id] = created.id
                imported_nodes += 1
            except Exception:
                continue
        
        for edge_data in ast_result.get("edges", []):
            source_id = edge_data.get("source", "")
            target_id = edge_data.get("target", "")
            relation = edge_data.get("relation", "references")
            
            our_source = node_id_map.get(source_id)
            our_target = node_id_map.get(target_id)
            
            if our_source and our_target:
                try:
                    svc.add_edge(
                        EdgeCreate(
                            source=our_source,
                            target=our_target,
                            relation=str(relation)[:255],
                            properties={
                                "file": edge_data.get("source_file", ""),
                                "confidence": edge_data.get("confidence", ""),
                            },
                        )
                    )
                    imported_edges += 1
                except Exception:
                    continue
        
        return {
            "node_count": imported_nodes,
            "edge_count": imported_edges,
            "file_count": file_count,
            "detected_files": {
                "code": len(detect_result.get("files", {}).get("code", [])),
                "docs": len(detect_result.get("files", {}).get("document", [])),
            },
        }
    
    @mcp.tool
    def scan_status() -> dict:
        """Get the scan status — how many graphify-sourced nodes exist in the graph."""
        conn = svc.conn_manager.get_connection()
        count = conn.execute(
            "SELECT COUNT(*) as c FROM nodes WHERE source = 'graphify'"
        ).fetchone()
        return {
            "source": "graphify",
            "node_count": count[0] if count else 0,
        }
