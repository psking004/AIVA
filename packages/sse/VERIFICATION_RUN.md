# Verification Run — 2026-11-09

## Environment
- Python: 3.13.7 (AMD64)
- Pytest: 9.2.0
- Ruff: 0.17.4
- Operating System: Windows 11 / PowerShell

## Results Summary
- Python Compilation (`compileall`): **PASS (exit 0)**
- Ruff Linting: **PASS (0 errors)**
- Pytest Test Suite: **PASS (47 passed in 1.36s)**
- CLI Verification: **PASS (validate, solve, list-solvers, list-domains, simulate, scenario)**
- REST API Verification: **PASS (health, validate, list-solvers, solve, list-domains)**

## Pytest Output
```text
============================= test session starts =============================
platform win32 -- Python 3.13.7, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\PARTHASARATHI\GAME_THEORY\strategic-systems-engine
configfile: pyproject.toml
plugins: anyio-4.16.0, hypothesis-6.170.15
collected 47 items

tests/test_agents/test_agents.py::test_tit_for_tat_mutual_cooperation PASSED [  2%]
tests/test_agents/test_agents.py::test_q_learning_agent_learns_defect PASSED [  4%]
tests/test_api/test_api.py::test_api_health PASSED                       [  6%]
tests/test_api/test_api.py::test_api_validate_model PASSED               [  8%]
tests/test_api/test_api.py::test_api_solve_game PASSED                   [ 10%]
tests/test_api/test_api.py::test_api_list_domains_and_scenarios PASSED   [ 12%]
tests/test_core/test_actions.py::test_discrete_action_space PASSED       [ 14%]
tests/test_core/test_actions.py::test_discrete_action_space_validation PASSED [ 17%]
tests/test_core/test_actions.py::test_continuous_action_space PASSED     [ 19%]
tests/test_core/test_actions.py::test_product_action_space PASSED        [ 21%]
tests/test_core/test_games.py::test_cooperative_game PASSED              [ 23%]
tests/test_core/test_games.py::test_extensive_form_game PASSED           [ 25%]
tests/test_core/test_games.py::test_repeated_game PASSED                 [ 27%]
tests/test_core/test_strategies.py::test_mixed_strategy_support_and_expected_payoff PASSED [ 29%]
tests/test_core/test_strategies.py::test_mixed_strategy_validation PASSED [ 31%]
tests/test_core/test_strategies.py::test_strategy_profile PASSED         [ 34%]
tests/test_core/test_types.py::test_game_family_members PASSED           [ 36%]
tests/test_core/test_types.py::test_solver_status PASSED                 [ 38%]
tests/test_core/test_types.py::test_numeric_precision_invariants PASSED  [ 40%]
tests/test_domains/test_domains.py::test_all_domains_registered PASSED   [ 42%]
tests/test_domains/test_domains.py::test_every_domain_scenario_instantiates_and_validates PASSED [ 44%]
tests/test_integration/test_integration.py::test_sdk_client_end_to_end PASSED [ 46%]
tests/test_integration/test_integration.py::test_storage_and_repository PASSED [ 48%]
tests/test_integration/test_integration.py::test_plugin_registration PASSED [ 51%]
tests/test_models.py::test_profile_index_and_payoff PASSED               [ 53%]
tests/test_models.py::test_round_trip_dict PASSED                        [ 55%]
tests/test_models.py::test_rejects_wrong_payoff_count PASSED             [ 57%]
tests/test_models.py::test_rejects_non_finite_payoff PASSED              [ 59%]
tests/test_pure_nash.py::test_prisoners_dilemma_has_defect_defect_equilibrium PASSED [ 61%]
tests/test_pure_nash.py::test_matching_pennies_has_no_pure_equilibrium PASSED [ 63%]
tests/test_pure_nash.py::test_verify_accepts_and_rejects_profiles PASSED [ 65%]
tests/test_pure_nash.py::test_tolerance_changes_approximate_equilibrium_test PASSED [ 68%]
tests/test_simulation/test_simulation_engine.py::test_simulation_repeated_deterministic PASSED [ 70%]
tests/test_simulation/test_simulation_engine.py::test_monte_carlo_runs_multiple_seeds PASSED [ 72%]
tests/test_solvers/test_backward_induction.py::test_backward_induction_simple_tree PASSED [ 74%]
tests/test_solvers/test_cooperative.py::test_cooperative_shapley_and_core PASSED [ 76%]
tests/test_solvers/test_correlated.py::test_correlated_equilibrium_solves_traffic PASSED [ 78%]
tests/test_solvers/test_dominant.py::test_dominant_strategy_finds_defect_defect PASSED [ 80%]
tests/test_solvers/test_evolutionary.py::test_hawk_dove_replicator_dynamics PASSED [ 82%]
tests/test_solvers/test_evolutionary.py::test_pure_ess_prisoners_dilemma PASSED [ 85%]
tests/test_solvers/test_minimax.py::test_minimax_on_matching_pennies PASSED [ 87%]
tests/test_solvers/test_minimax.py::test_minimax_saddle_point PASSED     [ 89%]
tests/test_solvers/test_mixed_nash.py::test_matching_pennies_has_50_50_mixed_equilibrium PASSED [ 91%]
tests/test_solvers/test_mixed_nash.py::test_rock_paper_scissors_mixed_equilibrium PASSED [ 93%]
tests/test_solvers/test_mixed_nash.py::test_independent_verification_hook PASSED [ 95%]
tests/test_solvers/test_regret.py::test_regret_matching_converges_to_defect PASSED [ 97%]
tests/test_solvers/test_stackelberg.py::test_stackelberg_commitment PASSED [100%]

======================== 47 passed in 1.36s ========================
```
