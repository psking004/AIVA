"""Strategic Systems Engine (SSE) — Unified Command Line Interface.

Provides CLI access to all seven domain packs, exact and memory-bounded solvers,
streamed O(1) Monte Carlo simulation, and system self-diagnostics ("sse doctor").
"""

from __future__ import annotations

import json
import sys
import time
import tracemalloc
from pathlib import Path
from typing import Any

import numpy as np
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sse import __version__
from sse.agents.policies import (
    AdaptiveReciprocalDefender,
    AlwaysCooperatePolicy,
    AlwaysDefectPolicy,
    GenerousTitForTatPolicy,
    GreedyMyopicPolicy,
    RandomPolicy,
    StrategicPolicy,
    TitForTatPolicy,
    WinStayLoseShiftPolicy,
    ZeroDeterminantPolicy,
)
from sse.contracts.decision import DecisionRequest
from sse.domains import DomainRegistry
from sse.io import load_game
from sse.models import FiniteNormalFormGame
from sse.orchestrator.decision_engine import StrategicDecisionEngine
from sse.simulation.compact_simulator import StreamedTournamentSimulator
from sse.strategic.solvers.exact_solvers import (
    BilevelStackelbergSolver,
    ExactSupportEnumerationSolver,
    LemkeHowsonSolver,
    extract_bimatrix,
)
from sse.strategic.solvers.optimized_core import TieredDecisionCore
from sse.verification.benchmarks import CanonicalBenchmarkSuite

console = Console()
app = typer.Typer(
    name="sse",
    help="Strategic Systems Engine — formal game-theoretic reasoning & simulation platform.",
    no_args_is_help=True,
    add_completion=False,
)
domain_app = typer.Typer(
    name="domain",
    help="Explore, inspect, and execute domain application packs.",
    no_args_is_help=True,
)
app.add_typer(domain_app, name="domain")

# Domain Metadata Registry for Rich Inspection
DOMAIN_METADATA: dict[str, dict[str, Any]] = {
    "cybersecurity": {
        "name": "Cybersecurity",
        "description": "Attacker-defender resource allocation, APT mitigation, and investment games.",
        "models": [
            "StackelbergSecurityGame",
            "BayesianDynamicDeceptionModel",
            "DynamicPatchPrioritizationModel",
            "SecurityInvestmentGame",
            "AttackerDefenderGame",
        ],
        "assumptions": (
            "Bilevel Stackelberg leader-follower commitment; Bayesian incomplete information "
            "over attacker skill levels; CVSS composite risk optimization under budget constraints."
        ),
        "action_spaces": "Asset defense allocation probabilities [0, 1], Honeypot/Patch/Monitor, Infiltrate/Exploit.",
        "scenarios": [
            "simple_network_defense",
            "apt_defense_scenario",
            "security_investment_2firm",
        ],
    },
    "economics": {
        "name": "Economics",
        "description": "Cournot/Bertrand market competition, auction design, and public goods games.",
        "models": [
            "DynamicCournotOligopoly",
            "DifferentiatedBertrandCompetition",
            "MultiUnitAuction",
            "PublicGoodsGame",
        ],
        "assumptions": (
            "Linear/convex inverse demand; asymmetric marginal costs; Chebyshev grid discretization; "
            "weak dominance of truthful bidding in Second-Price Vickrey auctions."
        ),
        "action_spaces": "Continuous and discretized production quantities q_i, prices p_i, auction bids b_i.",
        "scenarios": [
            "cournot_duopoly",
            "bertrand_duopoly",
            "public_goods_3player",
        ],
    },
    "business": {
        "name": "Business Strategy",
        "description": "Competitive pricing, market entry deterrence, and R&D investment games.",
        "models": [
            "DixitEntryPreemption",
            "TwoSidedPlatformPricing",
            "MarketEntryGame",
            "PricingCompetitionGame",
            "StrategicInvestmentGame",
        ],
        "assumptions": (
            "Dixit capital capacity commitment deterrence threshold; cross-side platform network externalities; "
            "limit pricing credibility boundaries."
        ),
        "action_spaces": "Capital capacity levels k_1, Enter/Stay Out, User & Developer platform fee tiers.",
        "scenarios": [
            "price_war",
            "market_entry_deterrence",
            "rd_investment_race",
        ],
    },
    "logistics": {
        "name": "Logistics",
        "description": "Freight routing, warehouse space allocation, and dock scheduling games.",
        "models": [
            "MultiEchelonInventoryGame",
            "ClusterComputeRoutingGame",
            "CongestionRoutingGame",
            "SharedWarehouseAllocationGame",
            "MultiPartySchedulingGame",
        ],
        "assumptions": (
            "Lee-Padmanabhan Bullwhip Effect variance amplification Var(O)/Var(D) > 1; "
            "non-cooperative task routing balancing serialization latency against worker speed."
        ),
        "action_spaces": "Reorder levels, parallel freight corridors, worker compute node assignments.",
        "scenarios": [
            "simple_freight_routing",
            "shared_warehouse_allocation",
            "dock_scheduling",
        ],
    },
    "transportation": {
        "name": "Transportation",
        "description": "Traffic congestion, Braess's paradox, and commute departure time games.",
        "models": [
            "WardropUserEquilibrium",
            "BraessParadoxDetector",
            "PriceOfAnarchy",
            "BraessParadoxGame",
            "TrafficRouteChoiceGame",
            "CommuteCongestionGame",
        ],
        "assumptions": (
            "Wardrop's First Principle (used route travel times equalized); Bureau of Public Roads (BPR) link "
            "congestion curves; Beckmann transformation; Braess's paradox throughput degradation."
        ),
        "action_spaces": "Network route/corridor selection, peak vs off-peak departure intervals.",
        "scenarios": [
            "braess_paradox",
            "two_route_commute",
            "corridor_peak_spreading",
        ],
    },
    "social": {
        "name": "Social Systems",
        "description": "Voting power indices, legislative coalitions, Hawk-Dove, and commons governance games.",
        "models": [
            "WeightedVotingBody",
            "OstromCommonPoolGovernance",
            "HawkDoveConflictGame",
            "StrategicVotingGame",
            "StagHuntGame",
        ],
        "assumptions": (
            "Penrose-Banzhaf swing voter counts; Shapley-Shubik permutation index with sum phi_i = 1; "
            "Ostrom CPR renewable extraction under graduated sanction inspection probabilities."
        ),
        "action_spaces": "Vote Yes/No/Abstain, resource extraction quotas x_i, Hawk/Dove contest postures.",
        "scenarios": [
            "hawk_dove",
            "stag_hunt",
            "condorcet_voting",
        ],
    },
    "autonomous": {
        "name": "Autonomous Systems",
        "description": "Autonomous vehicle coordination, velocity-obstacles, and dynamic resource sharing.",
        "models": [
            "SpatialCorridorVelocityGame",
            "SharedPriorityArbitration",
            "IntersectionCoordinationGame",
            "SpectrumSharingGame",
            "MultiRobotPatrolGame",
        ],
        "assumptions": (
            "Discrete velocity-obstacle spatial footprint collision penalty (-100); "
            "deadline-urgency priority bidding arbitration; decentralized spectrum contention."
        ),
        "action_spaces": "Velocity vectors (FullSpeed, HalfSpeed, Stop), priority bids b_i, spectrum channels.",
        "scenarios": [
            "autonomous_intersection",
            "dynamic_spectrum_access",
            "cooperative_perimeter_patrol",
        ],
    },
}


def _resolve_game(game_path_or_name: str) -> FiniteNormalFormGame:
    """Loads a game from a file path or resolves a canonical benchmark game name."""
    p = Path(game_path_or_name)
    if p.is_file():
        return load_game(str(p))

    # Check canonical benchmark suite
    suite_map = {
        "prisoners_dilemma": CanonicalBenchmarkSuite.prisoners_dilemma,
        "matching_pennies": CanonicalBenchmarkSuite.matching_pennies,
        "rock_paper_scissors": CanonicalBenchmarkSuite.rock_paper_scissors,
        "rps": CanonicalBenchmarkSuite.rock_paper_scissors,
        "battle_of_the_sexes": CanonicalBenchmarkSuite.battle_of_the_sexes,
        "stag_hunt": CanonicalBenchmarkSuite.stag_hunt,
        "hawk_dove": CanonicalBenchmarkSuite.hawk_dove,
        "cournot_duopoly": CanonicalBenchmarkSuite.cournot_duopoly,
        "bertrand_competition": CanonicalBenchmarkSuite.bertrand_competition,
        "stackelberg_market": CanonicalBenchmarkSuite.stackelberg_market,
        "public_goods": CanonicalBenchmarkSuite.public_goods_dilemma,
    }
    key = game_path_or_name.lower().replace("-", "_").replace(" ", "_")
    if key in suite_map:
        return suite_map[key]()

    raise ValueError(f"Game file not found and unknown benchmark: '{game_path_or_name}'")


def _get_policy(name: str) -> StrategicPolicy:
    """Instantiates a strategic policy by short name."""
    n = name.lower()
    if n in ("tft", "tit_for_tat"):
        return TitForTatPolicy("TitForTat")
    if n in ("gtft", "generous_tit_for_tat"):
        return GenerousTitForTatPolicy("GenerousTitForTat")
    if n in ("greedy", "myopic"):
        return GreedyMyopicPolicy("GreedyMyopic")
    if n in ("zd", "zero_determinant"):
        return ZeroDeterminantPolicy("ZeroDeterminant")
    if n in ("defender", "adaptive"):
        return AdaptiveReciprocalDefender("AdaptiveDefender")
    if n in ("wsls", "pavlov"):
        return WinStayLoseShiftPolicy("WinStayLoseShift")
    if n in ("alld", "defect"):
        return AlwaysDefectPolicy("AlwaysDefect")
    if n in ("allc", "cooperate"):
        return AlwaysCooperatePolicy("AlwaysCooperate")
    if n in ("random", "uniform"):
        return RandomPolicy("Random")
    raise ValueError(f"Unknown policy name: '{name}'. Choose from: tft, gtft, greedy, zd, defender, wsls, alld, allc, random")


# ===========================================================================
# TOP-LEVEL COMMANDS
# ===========================================================================

@app.command("version")
def version_cmd() -> None:
    """Display the current SSE version."""
    console.print(f"[bold cyan]Strategic Systems Engine (SSE)[/bold cyan] version [green]{__version__}[/green]")


@app.command("doctor")
def doctor_cmd() -> None:
    """Perform comprehensive system sanity check and mathematical self-verification."""
    console.print(Panel.fit("[bold cyan]SSE System Diagnostic & Mathematical Self-Test[/bold cyan]", border_style="cyan"))

    results: list[tuple[str, str, str, bool]] = []
    all_passed = True

    # Check 1: Python Version >= 3.11
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    py_ok = sys.version_info >= (3, 11)
    results.append(("Python Environment", "Version >= 3.11", py_ver, py_ok))
    if not py_ok:
        all_passed = False

    # Check 2: Core Dependencies
    deps = ["numpy", "scipy", "pydantic", "typer", "rich"]
    missing = []
    for d in deps:
        try:
            __import__(d)
        except ImportError:
            missing.append(d)
    deps_ok = len(missing) == 0
    deps_val = "All installed" if deps_ok else f"Missing: {', '.join(missing)}"
    results.append(("Dependencies", "Core Packages", deps_val, deps_ok))
    if not deps_ok:
        all_passed = False

    # Check 3: Mathematical Invariant — Prisoner's Dilemma Pure Nash
    try:
        pd_game = CanonicalBenchmarkSuite.prisoners_dilemma()
        pd_res = ExactSupportEnumerationSolver().solve(pd_game)
        # Unique NE is pure (Defect, Defect) with payoffs (1.0, 1.0)
        pd_ok = (
            len(pd_res.equilibria) == 1
            and pd_res.equilibria[0].is_pure
            and pd_res.equilibria[0].support_1 == (1,)
            and pd_res.equilibria[0].support_2 == (1,)
            and abs(pd_res.equilibria[0].payoff_1 - 1.0) < 1e-6
        )
        pd_val = f"Unique NE (D, D), Payoffs: ({pd_res.equilibria[0].payoff_1:.1f}, {pd_res.equilibria[0].payoff_2:.1f})"
    except Exception as e:
        pd_ok = False
        pd_val = f"Error: {e}"
    results.append(("Game Theory Engine", "Prisoner's Dilemma Pure NE", pd_val, pd_ok))
    if not pd_ok:
        all_passed = False

    # Check 4: Mathematical Invariant — Matching Pennies Zero-Sum Minimax
    try:
        mp_game = CanonicalBenchmarkSuite.matching_pennies()
        mp_res = ExactSupportEnumerationSolver().solve(mp_game)
        eq = mp_res.equilibria[0]
        mp_ok = (
            len(mp_res.equilibria) == 1
            and not eq.is_pure
            and np.allclose(eq.strategy_1, [0.5, 0.5], atol=1e-5)
            and np.allclose(eq.strategy_2, [0.5, 0.5], atol=1e-5)
            and abs(eq.payoff_1) < 1e-6
        )
        mp_val = f"Zero-Sum Minimax Value: {eq.payoff_1:.4f}, Mixed: (0.5, 0.5)"
    except Exception as e:
        mp_ok = False
        mp_val = f"Error: {e}"
    results.append(("Game Theory Engine", "Matching Pennies Minimax", mp_val, mp_ok))
    if not mp_ok:
        all_passed = False

    # Check 5: Mathematical Invariant — Stackelberg Leadership Gain
    try:
        sm_game = CanonicalBenchmarkSuite.stackelberg_market()
        st_res = BilevelStackelbergSolver().solve_pure(sm_game, mode="SSE")
        sim_res = ExactSupportEnumerationSolver().solve(sm_game)
        sim_payoff_1 = max(eq.payoff_1 for eq in sim_res.equilibria)
        # Leader payoff in Stackelberg >= simultaneous Nash
        st_ok = st_res.leader_payoff >= sim_payoff_1 - 1e-6
        st_val = f"Leader SSE Payoff: {st_res.leader_payoff:.2f} >= Sim NE: {sim_payoff_1:.2f}"
    except Exception as e:
        st_ok = False
        st_val = f"Error: {e}"
    results.append(("Game Theory Engine", "Stackelberg Leadership Gain", st_val, st_ok))
    if not st_ok:
        all_passed = False

    # Check 6: Memory Allocator Bounds (< 80 MB)
    try:
        tracemalloc.start()
        tracemalloc.reset_peak()
        core = TieredDecisionCore()
        bench_game = CanonicalBenchmarkSuite.battle_of_the_sexes()
        for _ in range(500):
            _v = core.solve(bench_game)
        _cur, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peak_mb = peak / (1024 * 1024)
        mem_ok = peak_mb < 80.0
        mem_val = f"Peak: {peak_mb:.2f} MB (< 80.0 MB limit)"
    except Exception as e:
        mem_ok = False
        mem_val = f"Error: {e}"
    results.append(("Memory Allocator", "Peak Heap RAM Ceiling", mem_val, mem_ok))
    if not mem_ok:
        all_passed = False

    # Render Table
    table = Table(title="SSE Self-Diagnostic Diagnostic Results", border_style="blue")
    table.add_column("Category", style="cyan", no_wrap=True)
    table.add_column("Diagnostic Check", style="bold white")
    table.add_column("Observed Value", style="magenta")
    table.add_column("Status", justify="center")

    for cat, check, val, ok in results:
        status_str = "[bold green]PASS[/bold green]" if ok else "[bold red]FAIL[/bold red]"
        table.add_row(cat, check, val, status_str)

    console.print(table)

    if all_passed:
        console.print("[bold green]All system sanity checks and mathematical invariants PASSED successfully.[/bold green]")
        raise typer.Exit(code=0)
    else:
        console.print("[bold red]One or more system diagnostics FAILED. See report above.[/bold red]")
        raise typer.Exit(code=1)


@app.command("solve")
def solve_cmd(
    game: str = typer.Argument(..., help="Path to JSON game or canonical benchmark name."),
    method: str = typer.Option("optimized", "--method", "-m", help="Solver: optimized, exact, stackelberg, lemke."),
    tolerance: float = typer.Option(1e-6, "--tolerance", "-t", help="Numerical float tolerance."),
) -> None:
    """Solve a strategic game using exact, bilevel, or memory-optimized solver modes."""
    g = _resolve_game(game)
    m = method.lower()

    t0 = time.perf_counter()

    if m == "optimized":
        core = TieredDecisionCore(tolerance=tolerance)
        verdict = core.solve(g)
        elapsed = (time.perf_counter() - t0) * 1000.0

        console.print(Panel.fit(f"[bold cyan]Tiered Decision Core Verdict — {g.name}[/bold cyan]"))
        table = Table(show_header=False, border_style="cyan")
        table.add_row("Chosen Action Index", str(verdict.action_idx))
        table.add_row("Action Name", f"[bold green]{verdict.action_name}[/bold green]")
        table.add_row("Calibrated Confidence", f"{verdict.confidence:.2%}")
        table.add_row("Expected Utility", f"{verdict.expected_utility:.3f}")
        table.add_row("Downside Risk / Variance", f"{verdict.downside_risk:.3f}")
        table.add_row("Solver Tier Used", f"[bold yellow]{verdict.solver_tier}[/bold yellow]")
        table.add_row("Strategic Rationale", verdict.rationale)
        table.add_row("Execution Latency", f"{elapsed:.2f} ms")
        console.print(table)

        payload = verdict.to_compact_payload()
        console.print(f"[bold dim]Compact Payload ({len(payload)} chars):[/bold dim] {payload}")
        return

    if m == "exact":
        solver = ExactSupportEnumerationSolver(tolerance=tolerance)
        res = solver.solve(g)
        elapsed = (time.perf_counter() - t0) * 1000.0

        console.print(Panel.fit(f"[bold cyan]Exact Support Enumeration — {g.name}[/bold cyan]"))
        console.print(f"Evaluated supports: {res.supports_evaluated} | Found equilibria: {len(res.equilibria)} | Latency: {elapsed:.2f} ms")

        for idx, eq in enumerate(res.equilibria, 1):
            eq_type = "Pure Nash" if eq.is_pure else "Mixed Nash"
            console.print(f"\n[bold green]Equilibrium #{idx} ({eq_type}):[/bold green]")
            console.print(f"  P1 Strategy: {list(np.round(eq.strategy_1, 4))} | Payoff: {eq.payoff_1:.4f}")
            console.print(f"  P2 Strategy: {list(np.round(eq.strategy_2, 4))} | Payoff: {eq.payoff_2:.4f}")
        return

    if m == "stackelberg":
        solver = BilevelStackelbergSolver(tolerance=tolerance)
        sse_res = solver.solve_pure(g, mode="SSE")
        elapsed = (time.perf_counter() - t0) * 1000.0

        console.print(Panel.fit(f"[bold cyan]Strong Stackelberg Equilibrium (SSE) — {g.name}[/bold cyan]"))
        table = Table(show_header=False, border_style="cyan")
        table.add_row("Leader Chosen Action", f"[bold green]{g.actions[0][int(np.argmax(sse_res.leader_strategy))]}[/bold green]")
        table.add_row("Follower Best Response", f"[bold green]{g.actions[1][sse_res.follower_action_idx]}[/bold green]")
        table.add_row("Leader Expected Payoff", f"{sse_res.leader_payoff:.4f}")
        table.add_row("Follower Expected Payoff", f"{sse_res.follower_payoff:.4f}")
        table.add_row("Execution Latency", f"{elapsed:.2f} ms")
        console.print(table)
        return

    if m == "lemke":
        solver = LemkeHowsonSolver(tolerance=tolerance)
        lh_res = solver.solve(g)
        eq = lh_res.equilibrium
        elapsed = (time.perf_counter() - t0) * 1000.0

        console.print(Panel.fit(f"[bold cyan]Lemke-Howson LCP Pivot Solver — {g.name}[/bold cyan]"))
        console.print(f"Pivots executed: {lh_res.pivots_count} | Latency: {elapsed:.2f} ms")
        console.print(f"  P1 Strategy: {list(np.round(eq.strategy_1, 4))} | Payoff: {eq.payoff_1:.4f}")
        console.print(f"  P2 Strategy: {list(np.round(eq.strategy_2, 4))} | Payoff: {eq.payoff_2:.4f}")
        return

    raise ValueError(f"Unknown solver method '{method}'. Choose from: optimized, exact, stackelberg, lemke.")


@app.command("simulate")
def simulate_cmd(
    game: str = typer.Argument(..., help="Path to JSON game or canonical benchmark name."),
    rounds: int = typer.Option(1000, "--rounds", "-r", help="Number of repeated interaction rounds."),
    noise: float = typer.Option(0.05, "--noise", "-n", help="Trembling-hand perturbation probability."),
    policy: str = typer.Option("tft", "--policy", "-p", help="Player 1 policy (tft, gtft, greedy, zd, defender, wsls, alld, allc, random)."),
    adversary: str = typer.Option("greedy", "--adversary", "-a", help="Player 2 policy."),
    seed: int = typer.Option(42, "--seed", "-s", help="Random seed for reproducibility."),
) -> None:
    """Run repeated Monte Carlo simulations using the memory-bounded streamed O(1) runtime."""
    g = _resolve_game(game)
    u1, u2 = extract_bimatrix(g)
    payoff_tensor = np.stack([u1, u2], axis=-1)

    sim = StreamedTournamentSimulator(
        payoff_matrix=payoff_tensor,
        trembling_noise=noise,
    )
    p1 = _get_policy(policy)
    p2 = _get_policy(adversary)

    t0 = time.perf_counter()
    res = sim.run_streamed_evaluation(p1, p2, rounds=rounds, seed=seed)
    elapsed = (time.perf_counter() - t0) * 1000.0

    console.print(Panel.fit(f"[bold cyan]Streamed O(1) Repeated Simulation — {g.name}[/bold cyan]"))
    table = Table(title="Monte Carlo Interaction Summary", border_style="cyan")
    table.add_column("Metric", style="bold white")
    table.add_column(f"Player 1: {res.policy_name_p1}", style="green")
    table.add_column(f"Player 2: {res.policy_name_p2}", style="magenta")

    table.add_row("Mean Stage Payoff", f"{res.mean_payoff_p1:.4f}", f"{res.mean_payoff_p2:.4f}")
    table.add_row("Standard Deviation", f"{res.std_payoff_p1:.4f}", f"{res.std_payoff_p2:.4f}")
    table.add_row("Value-at-Risk (VaR-95)", f"{res.var_95_p1:.4f}", f"{res.var_95_p2:.4f}")
    table.add_row("Downside Semi-Variance", f"{res.downside_semi_variance_p1:.4f}", f"{res.downside_semi_variance_p2:.4f}")
    table.add_row("Cooperation Rate", f"{res.cooperation_rate_p1:.1%}", f"{res.cooperation_rate_p2:.1%}")
    table.add_row("Net Exploitability", f"{res.net_exploitability:.4f}", "—")
    table.add_row("Rounds / Latency", f"{res.rounds_count} rounds", f"{elapsed:.2f} ms ({res.rounds_count / max(1e-6, elapsed / 1000.0):.0f} rps)")

    console.print(table)


@app.command("validate")
def validate_cmd(
    game: str = typer.Argument(..., help="Path to JSON game definition file."),
) -> None:
    """Validate a JSON game definition against mathematical consistency contracts."""
    g = load_game(game)
    console.print(f"[bold green]Game '{g.name}' (ID: {g.id}) is valid.[/bold green]")
    console.print(f"  Players: {[p.name for p in g.players]}")
    console.print(f"  Profiles: {g.profile_count} | Actions: {[len(a) for a in g.actions]}")


@app.command("decide")
def decide_cmd(
    context: str = typer.Option(..., "--context", "-c", help="Contextual description of the strategic situation."),
    goal: str = typer.Option(..., "--goal", "-g", help="Target strategic objective."),
    confidence: float = typer.Option(0.60, "--confidence", help="Minimum required confidence score."),
) -> None:
    """Formulate an autonomous decision using AIVA Strategic Decision Engine."""
    engine = StrategicDecisionEngine()
    req = DecisionRequest(
        context_description=context,
        goal=goal,
        required_confidence=confidence,
    )
    resp = engine.formulate_decision(req)
    rec = resp.recommendation

    console.print(Panel.fit("[bold cyan]Strategic Decision Recommendation[/bold cyan]"))
    table = Table(show_header=False, border_style="cyan")
    table.add_row("Decision ID", resp.decision_id)
    table.add_row("Problem Type", resp.problem_type.value)
    table.add_row("Status", resp.state.value)
    table.add_row("Recommended Action", f"[bold green]{rec.action_name if rec else 'None'}[/bold green]")
    table.add_row("Action Justification", rec.justification if rec else "N/A")
    table.add_row("Calibrated Confidence", f"{resp.uncertainty.confidence_score:.2%}")
    table.add_row("Value-at-Risk (95%)", f"{resp.uncertainty.value_at_risk_95:.2f}")
    table.add_row("Executable", "[bold green]YES[/bold green]" if resp.is_executable else "[bold red]NO[/bold red]")
    console.print(table)


@app.command("benchmarks")
def benchmarks_cmd(
    verify: str | None = typer.Option(None, "--verify", "-v", help="Benchmark name to verify (e.g. prisoners_dilemma, all)."),
) -> None:
    """List or verify canonical game-theoretic benchmarks."""
    benchmarks_list = [
        "prisoners_dilemma", "matching_pennies", "battle_of_the_sexes",
        "hawk_dove", "stag_hunt", "rock_paper_scissors", "cournot_duopoly",
        "bertrand_competition", "stackelberg_market", "public_goods",
    ]

    if not verify:
        table = Table(title="Canonical Mathematical Benchmarks", border_style="cyan")
        table.add_column("Benchmark Name", style="bold white")
        table.add_column("Game Class", style="cyan")
        for b in benchmarks_list:
            table.add_row(b, "2-Player Normal Form")
        console.print(table)
        console.print("[dim]Use --verify <name> to run invariant verification.[/dim]")
        return

    to_verify = benchmarks_list if verify.lower() == "all" else [verify.lower()]
    for b_name in to_verify:
        g = _resolve_game(b_name)
        solver = ExactSupportEnumerationSolver()
        res = solver.solve(g)
        console.print(f"[bold green]Verified {b_name}:[/bold green] {len(res.equilibria)} equilibria found.")


# ===========================================================================
# DOMAIN COMMANDS: sse domain list, inspect, run
# ===========================================================================

@domain_app.command("list")
def domain_list_cmd() -> None:
    """List all seven application domain packs with their models and scenarios."""
    table = Table(title="SSE Application Domain Packs (Section 3)", border_style="cyan")
    table.add_column("Domain", style="bold cyan", no_wrap=True)
    table.add_column("Description", style="white")
    table.add_column("Core Mathematical Models", style="green")
    table.add_column("Canonical Scenarios", style="magenta")

    for meta in DOMAIN_METADATA.values():
        models_str = ", ".join(meta["models"][:3]) + ("..." if len(meta["models"]) > 3 else "")
        scenarios_str = ", ".join(meta["scenarios"])
        table.add_row(meta["name"], meta["description"], models_str, scenarios_str)

    console.print(table)


@domain_app.command("inspect")
def domain_inspect_cmd(
    domain_name: str = typer.Argument(..., help="Domain name to inspect (e.g. cybersecurity, economics)."),
    output_format: str = typer.Option("table", "--format", "-f", help="Output format: table or json."),
) -> None:
    """Inspect mathematical assumptions, models, and action spaces for a target domain."""
    key = domain_name.lower().strip()
    if key not in DOMAIN_METADATA:
        console.print(f"[bold red]Unknown domain '{domain_name}'. Available: {list(DOMAIN_METADATA.keys())}[/bold red]")
        raise typer.Exit(code=1)

    meta = DOMAIN_METADATA[key]

    if output_format.lower() == "json":
        print(json.dumps(meta, indent=2))
        return

    console.print(Panel.fit(f"[bold cyan]Domain Pack: {meta['name']}[/bold cyan]", border_style="cyan"))
    table = Table(show_header=False, border_style="blue")
    table.add_row("Description", meta["description"])
    table.add_row("Mathematical Assumptions", meta["assumptions"])
    table.add_row("Action Space Topology", meta["action_spaces"])
    table.add_row("Implemented Models", ", ".join(meta["models"]))
    table.add_row("Canonical Scenarios", ", ".join(meta["scenarios"]))
    console.print(table)


@domain_app.command("run")
def domain_run_cmd(
    domain_name: str = typer.Argument(..., help="Domain name (e.g. cybersecurity, transportation, economics)."),
    scenario: str = typer.Argument(..., help="Scenario name or alias (e.g. honeypot, braess, cournot)."),
) -> None:
    """Execute canonical domain scenarios directly from the CLI."""
    d_key = domain_name.lower().strip()
    s_key = scenario.lower().strip()

    try:
        domain = DomainRegistry.get(d_key)
    except KeyError:
        console.print(f"[bold red]Domain '{domain_name}' not found. Available: {DomainRegistry.list_domains()}[/bold red]")
        raise typer.Exit(code=1)

    # Fuzzy/alias matching for canonical scenarios
    scenarios = domain.list_scenarios()
    matched_scenario = None

    # Exact match first
    if s_key in scenarios:
        matched_scenario = s_key
    else:
        # Common alias mappings
        aliases: dict[str, str] = {
            "honeypot": "simple_network_defense",
            "apt": "apt_defense_scenario",
            "braess": "braess_paradox",
            "commute": "two_route_commute",
            "cournot": "cournot_duopoly",
            "bertrand": "bertrand_duopoly",
            "freight": "simple_freight_routing",
            "dock": "dock_scheduling",
            "voting": "condorcet_voting",
            "intersection": "autonomous_intersection",
            "spectrum": "dynamic_spectrum_access",
            "patrol": "cooperative_perimeter_patrol",
            "preemption": "market_entry_deterrence",
            "entry": "market_entry_deterrence",
            "price_war": "price_war",
        }
        if s_key in aliases and aliases[s_key] in scenarios:
            matched_scenario = aliases[s_key]
        else:
            # Substring match
            for candidate in scenarios:
                if s_key in candidate:
                    matched_scenario = candidate
                    break

    if not matched_scenario:
        console.print(f"[bold red]Scenario '{scenario}' not found in domain '{domain_name}'.[/bold red]")
        console.print(f"Available scenarios: {scenarios}")
        raise typer.Exit(code=1)

    console.print(f"[bold cyan]Running scenario:[/bold cyan] [green]{matched_scenario}[/green] in domain [cyan]{d_key}[/cyan]")
    game = domain.get_scenario(matched_scenario)

    # Solve with Tiered Decision Core
    core = TieredDecisionCore()
    t0 = time.perf_counter()
    verdict = core.solve(game)
    elapsed = (time.perf_counter() - t0) * 1000.0

    # Display game overview & verdict
    console.print(Panel.fit(f"[bold green]{game.name}[/bold green] (ID: {game.id})"))
    table = Table(show_header=False, border_style="cyan")
    table.add_row("Players", ", ".join(p.name for p in game.players))
    table.add_row("Player 1 Actions", ", ".join(game.actions[0][:4]) + ("..." if len(game.actions[0]) > 4 else ""))
    table.add_row("Player 2 Actions", ", ".join(game.actions[1][:4]) + ("..." if len(game.actions[1]) > 4 else ""))
    table.add_row("Recommended Action", f"[bold green]{verdict.action_name}[/bold green] (index {verdict.action_idx})")
    table.add_row("Calibrated Confidence", f"{verdict.confidence:.2%}")
    table.add_row("Expected Utility", f"{verdict.expected_utility:.3f}")
    table.add_row("Downside Variance", f"{verdict.downside_risk:.3f}")
    table.add_row("Solver Tier", f"[bold yellow]{verdict.solver_tier}[/bold yellow]")
    table.add_row("Strategic Rationale", verdict.rationale)
    table.add_row("Solving Latency", f"{elapsed:.2f} ms")
    console.print(table)

    payload = verdict.to_compact_payload()
    console.print(f"[bold dim]Compact Verdict Payload:[/bold dim] {payload}")


@app.command("telemetry")
def telemetry_cmd(
    format_type: str = typer.Option("table", "--format", "-f", help="Output format: table or json"),
) -> None:
    """Query and display live host and accelerator telemetry on PC-A."""
    from sse.ingestion.telemetry_bridge import TelemetryBridge

    bridge = TelemetryBridge(node_id="PC-A", device_idx=0)
    snap = bridge.get_local_telemetry()

    if format_type.lower() == "json":
        data = {
            "node_id": snap.node_id,
            "cpu_percent": snap.cpu_percent,
            "ram_used_gb": snap.ram_used_gb,
            "ram_total_gb": snap.ram_total_gb,
            "disk_free_gb": snap.disk_free_gb,
            "disk_total_gb": snap.disk_total_gb,
            "has_gpu": snap.has_gpu,
            "gpu_name": snap.gpu_name,
            "vram_used_gb": snap.vram_used_gb,
            "vram_total_gb": snap.vram_total_gb,
            "vram_available_gb": snap.vram_available_gb,
            "timestamp": snap.timestamp,
        }
        print(json.dumps(data, indent=2))
        return

    table = Table(title="[bold cyan]Live Node Telemetry (PC-A)[/bold cyan]", border_style="cyan")
    table.add_column("Metric", style="bold white")
    table.add_column("Value", style="green")

    table.add_row("Node ID", snap.node_id)
    table.add_row("CPU Utilization", f"{snap.cpu_percent:.1f}%")
    table.add_row("RAM Memory", f"{snap.ram_used_gb:.2f} GB / {snap.ram_total_gb:.2f} GB")
    table.add_row("Disk Space", f"{snap.disk_free_gb:.1f} GB free / {snap.disk_total_gb:.1f} GB total")
    table.add_row("GPU Present", "Yes" if snap.has_gpu else "No")
    table.add_row("GPU Model", snap.gpu_name)
    table.add_row(
        "VRAM Memory",
        f"{snap.vram_used_gb:.2f} GB / {snap.vram_total_gb:.2f} GB (Available: {snap.vram_available_gb:.2f} GB)",
    )
    table.add_row("Timestamp", f"{snap.timestamp:.3f}")

    console.print(table)


worker_app = typer.Typer(name="worker", help="Manage PC-B distributed execution worker.", no_args_is_help=True)
app.add_typer(worker_app, name="worker")


@worker_app.command("run")
def worker_run_cmd(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host address to bind to (loopback default)"),
    port: int = typer.Option(8220, "--port", "-p", help="Port to listen on"),
) -> None:
    """Launch the PC-B distributed execution worker service."""
    from sse.distributed.worker_service import run_worker

    console.print(f"[bold green]Starting PC-B Distributed Worker on {host}:{port}...[/bold green]")
    run_worker(host=host, port=port)


node_app = typer.Typer(
    name="node",
    help="Manage Sovereign Tri-Node Mesh execution, air-gapped solving, and ledger synchronization.",
    no_args_is_help=True,
)
app.add_typer(node_app, name="node")


@node_app.command("run")
def node_run_cmd(
    role: str = typer.Option("PC_A", "--role", "-r", help="Node identity: PC_A, PC_B, or MOBILE"),
    port: int | None = typer.Option(None, "--port", "-p", help="Port to listen on (defaults: 8201/8202/8203)"),
    solo: bool = typer.Option(False, "--solo", help="Operate in air-gapped solo mode without mesh routing"),
    host: str = typer.Option("127.0.0.1", "--host", help="Host address to bind to (loopback default)"),
    allow_external: bool = typer.Option(False, "--allow-external", help="Permit binding to non-loopback interfaces"),
) -> None:
    """Launch the sovereign node P2P router daemon."""
    from sse.tri_node.router import DEFAULT_NODE_PORTS, P2PRouter

    chosen_port = port or DEFAULT_NODE_PORTS.get(role.upper(), 8201)
    mode_str = "SOLO" if solo else "MESH"
    console.print(
        f"[bold cyan]Launching Sovereign Node [[bold green]{role.upper()}[/bold green]] "
        f"in [bold yellow]{mode_str}[/bold yellow] mode on {host}:{chosen_port}...[/bold cyan]"
    )
    router = P2PRouter(node_id=role.upper(), port=chosen_port, mode=mode_str)
    try:
        router.start_server(host=host, background=False, allow_external=allow_external)
    except KeyboardInterrupt:
        console.print("[dim]Stopping sovereign node server...[/dim]")
        router.stop_server()


@node_app.command("solve")
def node_solve_cmd(
    matrix: str = typer.Option(
        "",
        "--matrix",
        "-m",
        help="JSON string or path to game JSON containing 'u1' and 'u2' matrices",
    ),
    actions: str = typer.Option("", "--actions", "-a", help="Comma-separated action names for Player 1"),
    node_id: str = typer.Option("PC_A", "--node-id", "-n", help="Executing node identity (PC_A, PC_B, MOBILE)"),
    solo: bool = typer.Option(True, "--solo", help="Enforce air-gapped solo execution"),
) -> None:
    """Execute an instantaneous sovereign solve and seal the verdict into the local hash ledger."""
    from sse.tri_node.ledger import SovereignLedger
    from sse.tri_node.sovereign_core import SovereignDecisionCore

    # Default canonical game: Prisoner's Dilemma if no matrix provided
    u1 = [[3.0, 0.0], [5.0, 1.0]]
    u2 = [[3.0, 5.0], [0.0, 1.0]]
    act_p1 = ["Cooperate", "Defect"]
    act_p2 = ["Cooperate", "Defect"]

    if matrix:
        mat_path = Path(matrix)
        if mat_path.exists():
            with open(mat_path, "r", encoding="utf-8") as f:
                parsed = json.load(f)
        else:
            parsed = json.loads(matrix)

        if isinstance(parsed, dict) and "u1" in parsed and "u2" in parsed:
            u1 = parsed["u1"]
            u2 = parsed["u2"]
            if "actions_p1" in parsed:
                act_p1 = parsed["actions_p1"]
            if "actions_p2" in parsed:
                act_p2 = parsed["actions_p2"]

    if actions:
        act_p1 = [a.strip() for a in actions.split(",") if a.strip()]

    core = SovereignDecisionCore(node_id=node_id.upper(), mode="SOLO" if solo else "MESH")
    ledger = SovereignLedger(node_id=node_id.upper())
    prev_hash = ledger.get_latest_hash()

    verdict = core.solve_matrix(
        u1=u1,
        u2=u2,
        actions_p1=act_p1,
        actions_p2=act_p2,
        prev_hash=prev_hash,
        airgapped_solo=solo,
    )

    # Append sealed record to append-only ledger
    record = ledger.append_verdict(verdict)

    # Format output table
    table = Table(title=f"[bold cyan]Sovereign Solve ({node_id.upper()})[/bold cyan]", border_style="cyan")
    table.add_column("Field", style="bold white")
    table.add_column("Value", style="green")

    table.add_row("Decision ID", verdict.decision_id)
    table.add_row("Chosen Action", f"[bold green]{verdict.action_name}[/bold green] (index {verdict.action_idx})")
    table.add_row("Expected Utility", f"{verdict.expected_utility:.3f}")
    table.add_row("Worst-Case Regret", f"{verdict.worst_case_regret:.3f}")
    table.add_row("Solver Tier", f"[bold yellow]{verdict.solver_tier}[/bold yellow]")
    table.add_row("Grant Token", verdict.grant_token)
    table.add_row("Ledger Block Hash", record["record_hash"][:16] + "...")
    table.add_row("Execution Mode", verdict.mode)

    console.print(table)
    console.print(f"[bold dim]Compact Payload (< 350 chars):[/bold dim] {verdict.to_compact_payload()}")


@node_app.command("sync")
def node_sync_cmd(
    peer_url: str = typer.Option(..., "--peer-url", "-p", help="Peer endpoint URL (e.g. http://192.168.1.50:8201)"),
    node_id: str = typer.Option("PC_A", "--node-id", "-n", help="Local node identity (PC_A, PC_B, MOBILE)"),
) -> None:
    """Synchronize and verify hash ledgers with a remote sovereign peer."""
    from sse.tri_node.router import P2PRouter

    router = P2PRouter(node_id=node_id.upper())
    console.print(f"[bold cyan]Synchronizing ledger with peer [green]{peer_url}[/green]...[/bold cyan]")
    res = router.sync_with_peer(peer_url=peer_url)

    if res.get("status") == "SYNCED":
        console.print(
            f"[bold green]Ledger synchronized successfully![/bold green] "
            f"Merged {res.get('merged_count', 0)} foreign records. Latest hash: {res.get('latest_hash', '')[:16]}..."
        )
    else:
        console.print(f"[bold red]Sync warning:[/bold red] Peer status {res.get('status')} ({res.get('error', '')})")


swarm_app = typer.Typer(
    name="swarm",
    help="Autonomous Sub-Agent Swarm Orchestration Engine commands.",
    no_args_is_help=True,
)
app.add_typer(swarm_app, name="swarm")


@swarm_app.command("run")
def swarm_run_cmd(
    task: str = typer.Option(..., "--task", "-t", help="Functional specification or task description"),
    output_dir: str = typer.Option("./swarm_deliverable", "--output-dir", "-o", help="Target directory to export deliverables"),
    max_iter: int = typer.Option(5, "--max-iterations", "-m", help="Maximum convergence iterations"),
) -> None:
    """Execute autonomous multi-agent swarm pipeline to build, test, audit, and patch software."""
    from sse.swarm.contracts import TaskStatus
    from sse.swarm.orchestrator import SwarmOrchestrationEngine

    console.print(Panel.fit(f"[bold cyan]SSE Autonomous Sub-Agent Swarm Engine[/bold cyan]\n[white]Task: {task}[/white]"))

    def cli_phase_callback(phase: str, iter_count: int, msg: str) -> None:
        color_map = {
            "ARCHITECT": "cyan",
            "BUILDER": "blue",
            "RED_TEAM": "magenta",
            "RUNTIME": "yellow",
            "AUDITOR": "red",
            "HEALER": "green",
            "CONVERGED": "bold green",
            "FAILED": "bold red",
        }
        color = color_map.get(phase, "white")
        console.print(f"[{color}][{phase}][/] {msg}")

    engine = SwarmOrchestrationEngine(max_iterations=max_iter)
    state = engine.execute_lifecycle(task_specification=task, phase_callback=cli_phase_callback)

    if state.status == TaskStatus.COMPLETED:
        dest_path = engine.export_workspace(state, output_dir)
        console.print(f"[bold green]Swarm convergence achieved![/] Artifacts exported to: [cyan]{dest_path}[/]")
    else:
        console.print(f"[bold red]Swarm convergence failed[/] after {state.iteration_count} iterations.")
        raise typer.Exit(code=1)


@swarm_app.command("audit")
def swarm_audit_cmd(
    target_dir: str = typer.Option(".", "--target-dir", "-d", help="Directory path to audit for security vulnerabilities"),
) -> None:
    """Run standalone static security audit on target directory."""
    from sse.swarm.agents.auditor import SecurityAuditorAgent
    from sse.swarm.contracts import VulnerabilitySeverity

    auditor = SecurityAuditorAgent()
    target_path = Path(target_dir).resolve()
    console.print(f"[bold cyan]Scanning directory for security vulnerabilities:[/] [white]{target_path}[/]")

    findings = auditor.audit_directory(target_path)
    if not findings:
        console.print("[bold green]Zero vulnerabilities detected! All security invariants satisfied.[/]")
        return

    table = Table(title=f"Security Audit Report ({len(findings)} Findings)", border_style="red")
    table.add_column("Rule ID", style="bold yellow")
    table.add_column("Severity", style="bold red")
    table.add_column("File", style="cyan")
    table.add_column("Line", style="white")
    table.add_column("Description", style="white")

    for f in findings:
        sev_color = "bold red" if f.severity in (VulnerabilitySeverity.CRITICAL, VulnerabilitySeverity.HIGH) else "yellow"
        table.add_row(f.rule_id, f"[{sev_color}]{f.severity.value}[/]", f.file_path, str(f.line_number), f.description)

    console.print(table)


mesh_app = typer.Typer(
    name="mesh",
    help="Tri-Node Sovereign Mesh inspection, remote execution, and ledger synchronization.",
    no_args_is_help=True,
)
app.add_typer(mesh_app, name="mesh")

from aiva.cli_vault import oauth_cli_app, vault_cli_app

app.add_typer(vault_cli_app, name="vault")
app.add_typer(oauth_cli_app, name="oauth")


@mesh_app.command("inspect")
def mesh_inspect_cmd(
    target_url: str = typer.Option(..., "--target-url", "-t", help="Target node endpoint (e.g. http://192.168.1.50:8201)"),
    role: str = typer.Option("PC_A", "--role", "-r", help="Sender node role (PC_A, PC_B, MOBILE)"),
    timeout: float = typer.Option(2.0, "--timeout", help="Timeout in seconds"),
) -> None:
    """Inspect hardware telemetry, VRAM headroom, and ledger state of a peer node."""
    from sse.tri_node.client import TriNodeMeshClient

    client = TriNodeMeshClient(node_id=role)
    console.print(f"[bold cyan]Inspecting peer node at [green]{target_url}[/green]...[/bold cyan]")
    res = client.inspect_node(target_role=role, target_url=target_url, timeout=timeout)

    table = Table(title=f"[bold cyan]Peer Inspection ({res.get('node_id', 'UNKNOWN')})[/bold cyan]", border_style="cyan")
    table.add_column("Property", style="bold white")
    table.add_column("Value", style="green")

    table.add_row("Status", str(res.get("status", "UNKNOWN")))
    table.add_row("Node ID", str(res.get("node_id", "UNKNOWN")))
    table.add_row("Latest Hash", str(res.get("latest_hash", ""))[:16] + "...")
    table.add_row("Fallback Local", "[yellow]True[/yellow]" if res.get("fallback_local") else "[green]False[/green]")

    telem = res.get("telemetry", {})
    if telem:
        table.add_row("CPU Load", f"{telem.get('cpu_percent', telem.get('cpu_count', 'N/A'))}%")
        table.add_row("RAM Used/Total", f"{telem.get('ram_used_gb', 'N/A')} / {telem.get('ram_total_gb', 'N/A')} GB")
        table.add_row("GPU / VRAM Headroom", f"{telem.get('gpu_name', 'None')} ({telem.get('vram_available_gb', 'N/A')} GB avail)")

    console.print(table)


@mesh_app.command("exec")
def mesh_exec_cmd(
    target_url: str = typer.Option(..., "--target-url", "-t", help="Target node endpoint (e.g. http://192.168.1.50:8201)"),
    file: Path = typer.Option(..., "--file", "-f", help="Local file to deploy and execute on peer"),  # noqa: B008
    project_name: str = typer.Option("mesh_exec", "--project-name", "-p", help="Project name"),
    test_command: str = typer.Option(None, "--test-command", "-c", help="Test execution command (defaults to python <file>)"),
    role: str = typer.Option("PC_A", "--role", "-r", help="Sender node role"),
    timeout: float = typer.Option(30.0, "--timeout", help="Timeout in seconds"),
) -> None:
    """Deploy file and execute build/test in isolated guarded sandbox on peer node."""
    from sse.tri_node.client import TriNodeMeshClient

    if not file.exists():
        console.print(f"[bold red]File not found: {file}[/bold red]")
        raise typer.Exit(code=1)

    content = file.read_text(encoding="utf-8")
    rel_name = file.name
    client = TriNodeMeshClient(node_id=role)

    console.print(f"[bold cyan]Dispatching remote execution of [green]{rel_name}[/green] to [yellow]{target_url}[/yellow]...[/bold cyan]")
    cmd = [sys.executable, rel_name] if test_command is None else test_command.split()
    res = client.dispatch_remote_build(
        target_role=role,
        target_url=target_url,
        project_name=project_name,
        files={rel_name: content},
        test_command=cmd,
        timeout_sec=timeout,
    )

    status_color = "bold green" if res.get("status") == "COMPLETED" else "bold red"
    console.print(f"Status: [{status_color}]{res.get('status')}[/{status_color}] | Dispatched to: {res.get('dispatched_to')} (Local fallback: {res.get('fallback_local')})")
    console.print(f"Exit code: {res.get('exit_code')} | Duration: {res.get('duration_ms', 0):.2f} ms")
    if res.get("stdout"):
        console.print(Panel(res["stdout"], title="STDOUT", border_style="green"))
    if res.get("stderr"):
        console.print(Panel(res["stderr"], title="STDERR", border_style="red"))


@mesh_app.command("sync")
def mesh_sync_cmd(
    target_url: str = typer.Option(..., "--target-url", "-t", help="Target node endpoint (e.g. http://192.168.1.50:8201)"),
    role: str = typer.Option("PC_A", "--role", "-r", help="Local node role"),
    timeout: float = typer.Option(2.0, "--timeout", help="Timeout in seconds"),
) -> None:
    """Synchronize ledger records bidirectionally with peer node."""
    from sse.tri_node.client import TriNodeMeshClient

    client = TriNodeMeshClient(node_id=role)
    console.print(f"[bold cyan]Synchronizing ledger with peer at [green]{target_url}[/green]...[/bold cyan]")
    merged, latest_hash = client.sync_ledger_with_peer(target_url=target_url, timeout=timeout)
    console.print(f"[bold green]Sync completed.[/bold green] Merged {merged} records. Latest hash: {latest_hash[:16]}...")


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint function returning POSIX exit code."""
    try:
        if argv is not None:
            app(argv, standalone_mode=False)
        else:
            app()
        return 0
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
    except Exception as exc:
        console.print(f"[bold red]Execution error: {exc}[/bold red]")
        return 1


if __name__ == "__main__":
    sys.exit(main())
