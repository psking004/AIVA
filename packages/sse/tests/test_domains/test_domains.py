from sse.domains import DomainRegistry
from sse.solvers.pure_nash import PureNashSolver


def test_all_domains_registered():
    domains = DomainRegistry.list_domains()
    expected = [
        "autonomous",
        "business",
        "cybersecurity",
        "economics",
        "logistics",
        "social",
        "transportation",
    ]
    for exp in expected:
        assert exp in domains


def test_every_domain_scenario_instantiates_and_validates():
    solver = PureNashSolver()
    for domain_name in DomainRegistry.list_domains():
        domain = DomainRegistry.get(domain_name)
        scenarios = domain.list_scenarios()
        assert len(scenarios) >= 3, f"Domain {domain_name} should have at least 3 scenarios"

        for scenario_name in scenarios:
            game = domain.get_scenario(scenario_name)
            assert game.id.strip()
            assert len(game.players) >= 2
            assert game.profile_count > 0

            # Solve with pure Nash to ensure payoffs and indexing are consistent
            result = solver.solve(game)
            assert result.status == "solved"
