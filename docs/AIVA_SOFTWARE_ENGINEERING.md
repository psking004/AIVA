# AIVA 2.0 Software Engineering Intelligence Engine

**Module:** `packages/tools/code_engine.py`  
**Model Binding:** `qwen3.5:latest` (Local PC-B) / `qwen/qwen-2.5-coder-32b-instruct`  

---

## 1. Capabilities & Architecture

The `CodeEngine` module equips AIVA with true software development and debugging skills:
1. **Repository Search & Understanding:** Traverses workspace hierarchies, skipping cache and virtual environment directories, to locate symbol and text patterns with exact line numbers.
2. **File Slicing & Inspection:** Reads arbitrary line ranges with line count awareness.
3. **Pre-Commit Syntax Validation:** Validates Python source code via `ast.parse` before writing to disk, preventing syntax regressions.
4. **Atomic Multi-File Patching:** Writes new file contents atomically and computes unified diff previews.
5. **Automated Test Runner:** Executes test suites (`pytest`, `unittest`, `npm test`) with stdout, stderr, and return code capture.

---

## 2. Verified Benchmark Evidence

In Benchmark D, `CodeEngine`:
* Created `packages/tools/test_scratch_module.py`
* Validated its AST syntax (Status: `valid=True`)
* Wrote 73 bytes with diff generation
* Read back and verified content matches on disk
* Cleaned up scratch artifacts with zero disk residue.
