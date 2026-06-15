"""Smoke test: end-to-end add → read → edit → verify flow."""

from kg_mcp.models.node import NodeCreate


class TestNodeSmoke:
    """Full round-trip: create a node, read it back, update it, verify."""

    def test_add_read_edit_node(self, svc):
        # 1. ADD a node with label and properties
        created = svc.add_node(
            NodeCreate(label="SmokeTest", properties={"env": "test", "version": 1})
        )
        assert created.id is not None, "Node should have an ID"
        assert created.label == "SmokeTest"
        assert created.properties == {"env": "test", "version": 1}

        node_id = created.id

        # 2. READ the node back
        fetched = svc.get_node(node_id)
        assert fetched is not None, "Node should exist after create"
        assert fetched.label == "SmokeTest"
        assert fetched.properties == {"env": "test", "version": 1}

        # 3. EDIT the node — change label and properties
        updated = svc.update_node(
            node_id,
            NodeCreate(label="SmokeTestV2", properties={"env": "test", "version": 2, "status": "updated"}),
        )
        assert updated is not None, "Node should exist after update"
        assert updated.label == "SmokeTestV2", f"Expected 'SmokeTestV2', got '{updated.label}'"
        assert updated.properties["version"] == 2
        assert updated.properties["status"] == "updated"

        # 4. VERIFY — read again to confirm persistence
        confirmed = svc.get_node(node_id)
        assert confirmed is not None
        assert confirmed.label == "SmokeTestV2"
        assert confirmed.properties["version"] == 2
        assert confirmed.properties["status"] == "updated"

        # 5. CLEANUP
        svc.delete_node(node_id, cascade=True)
        assert svc.get_node(node_id) is None, "Node should be deleted"
