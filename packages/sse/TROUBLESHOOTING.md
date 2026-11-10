# Troubleshooting & Operational Recovery
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-TROUBLE-001  
**Release:** 1.0.0  

---

### 1. Common Issues and Resolutions

#### 1.1 `GameValidationError: Expected N payoff profiles; received M`
- **Cause:** Payoff table size does not equal the Cartesian product of the player action counts $\prod |A_i|$.
- **Resolution:** Check that your `payoffs` array contains exactly $\prod_i |A_i|$ elements. For 2 players with 2 actions each, exactly 4 payoff vectors are required.

#### 1.2 `ModuleNotFoundError: No module named 'scipy'`
- **Cause:** Scientific optimization extras were not installed.
- **Resolution:** Run `pip install -e ".[science]"` or `pip install scipy`. Pure-Python fallbacks will still allow basic operations.

#### 1.3 `ValueError: Support enumeration currently supports 2-player games`
- **Cause:** Support enumeration was invoked on an $N \ge 3$ player game.
- **Resolution:** Use `pure_nash_enumeration`, `regret_matching`, or `correlated_equilibrium` for $N \ge 3$ games. Support enumeration indifference systems for general N-player games are polynomial systems requiring homotopy continuation.

#### 1.4 REST API Error `400 Bad Request`
- **Cause:** Malformed JSON payload or action set names with empty strings or duplicates.
- **Resolution:** Inspect the `detail` property in the HTTP error response for specific validation error messages.

---

### 2. Diagnostics & Bug Reporting

When submitting bug reports or investigating unexpected solver outcomes:
1. Provide the exact game definition JSON document.
2. Record the solver configuration and numerical tolerance parameter (`--tolerance`).
3. Run `sse validate <path_to_game>` to verify structural validity before solving.

