"""Unit tests for the World Model Engine."""

from sse.contracts import (
    ActionDefinition,
    ConstraintDefinition,
    ConstraintType,
    EntityState,
    EntityType,
    RelationshipState,
    ResourceState,
    Reversibility,
)
from sse.world_model import (
    ConstraintManager,
    EntityRegistry,
    RelationshipGraph,
    ResourceManager,
    StrategicAgentModel,
    StrategicAgentRegistry,
    WorldStateManager,
)


def test_entity_registry():
    registry = EntityRegistry()
    e = EntityState(
        entity_id="agent_alpha",
        name="Agent Alpha",
        entity_type=EntityType.SELF,
        attributes={"balance": 1000},
    )
    registry.register_entity(e)
    assert registry.get_entity("agent_alpha").name == "Agent Alpha"

    registry.update_attributes("agent_alpha", {"balance": 1200})
    updated = registry.get_entity("agent_alpha")
    assert updated.attributes["balance"] == 1200

    assert len(registry.list_entities()) == 1
    registry.remove_entity("agent_alpha")
    assert registry.get_entity("agent_alpha") is None


def test_strategic_agent_profile():
    profile = StrategicAgentModel(
        agent_id="comp_1",
        name="Competitor 1",
        risk_tolerance=0.8,
        rationality_bound=0.9,
    )
    profile.record_action("price_cut")
    profile.record_action("price_cut")
    profile.record_action("maintain_price")

    probs = profile.predict_action_distribution(["price_cut", "maintain_price"])
    assert probs["price_cut"] > probs["maintain_price"]
    assert abs(sum(probs.values()) - 1.0) < 1e-4

    reg = StrategicAgentRegistry()
    reg.register_profile(profile)
    assert reg.get_profile("comp_1") is not None


def test_resource_manager_allocations():
    mgr = ResourceManager()
    res = ResourceState(
        resource_id="budget",
        name="Operating Budget",
        total_capacity=10000.0,
        allocated_capacity=2000.0,
        min_reserve=1000.0,
    )
    mgr.register_resource(res)

    # Allocate 5000 -> OK (available 8000 -> 3000 left > min_reserve 1000)
    assert mgr.allocate("budget", 5000.0)
    current = mgr.get_resource("budget")
    assert current.allocated_capacity == 7000.0
    assert current.available_capacity == 3000.0

    # Allocate 2500 -> Fails because 3000 - 2500 = 500 < 1000 min reserve
    assert not mgr.allocate("budget", 2500.0)

    # Release 2000
    assert mgr.release("budget", 2000.0)
    current = mgr.get_resource("budget")
    assert current.allocated_capacity == 5000.0


def test_relationship_graph():
    graph = RelationshipGraph()
    rel1 = RelationshipState(
        source_id="self",
        target_id="rival_co",
        relation_type="competes_with",
        strength=-1.0,
        is_symmetric=True,
    )
    rel2 = RelationshipState(
        source_id="self",
        target_id="supplier_a",
        relation_type="allied_with",
        strength=0.9,
        is_symmetric=False,
    )
    graph.add_relationship(rel1)
    graph.add_relationship(rel2)

    assert "rival_co" in graph.get_competitors("self")
    assert "self" in graph.get_competitors("rival_co")  # Symmetric
    assert "supplier_a" in graph.get_allies("self")

    path = graph.find_path("self", "supplier_a")
    assert path == ["self", "supplier_a"]


def test_constraint_manager_evaluation():
    c_mgr = ConstraintManager()
    c_mgr.register_constraint(
        ConstraintDefinition(
            constraint_id="c_rev",
            name="No irreversible moves",
            constraint_type=ConstraintType.HARD,
            description="All moves must be reversible",
            expression="require_reversible",
        )
    )

    state_mgr = WorldStateManager(constraint_manager=c_mgr)
    snapshot = state_mgr.capture_snapshot()

    safe_action = ActionDefinition(
        action_id="act_safe",
        name="Safe Action",
        description="Reversible test",
        target_entity="market",
        reversibility=Reversibility.REVERSIBLE,
    )
    res_safe = c_mgr.evaluate_action(safe_action, snapshot)
    assert res_safe["valid"]

    risky_action = ActionDefinition(
        action_id="act_burn_bridges",
        name="Burn Bridges",
        description="Irreversible test",
        target_entity="market",
        reversibility=Reversibility.IRREVERSIBLE,
    )
    res_risky = c_mgr.evaluate_action(risky_action, snapshot)
    assert not res_risky["valid"]
    assert len(res_risky["hard_violations"]) > 0


def test_world_state_manager_drift_detection():
    state_mgr = WorldStateManager()
    res = ResourceState(
        resource_id="capital",
        name="Capital",
        total_capacity=100.0,
        allocated_capacity=10.0,
    )
    state_mgr.resources.register_resource(res)
    snap1 = state_mgr.capture_snapshot()

    # Small change within 10% tolerance (allocate 5 -> 5% change)
    state_mgr.resources.allocate("capital", 5.0)
    snap2 = state_mgr.capture_snapshot()
    drift_check = state_mgr.detect_drift(snap1, snap2, tolerance_ratio=0.10)
    assert not drift_check["drift_detected"]

    # Large change (allocate 30 -> 30% change > 10% tolerance)
    state_mgr.resources.allocate("capital", 30.0)
    snap3 = state_mgr.capture_snapshot()
    drift_check2 = state_mgr.detect_drift(snap1, snap3, tolerance_ratio=0.10)
    assert drift_check2["drift_detected"]
    assert len(drift_check2["drift_items"]) > 0

