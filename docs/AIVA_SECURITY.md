# AIVA 2.0 Security, Sandboxing & Permission Boundaries

**Security Principle:** Least-Privilege Execution & Deterministic Containment  

---

## 1. Safety Policies

AIVA 2.0 enforces strict boundaries before executing any computer-use or shell command:

1. **Path Traversal Sandboxing:** All file operations in `DesktopTool`, `CodeEngine`, and `DocumentEngine` are constrained to `C:\Users\bhara\AIVA`. Relative path resolution that escapes the repository root is rejected.
2. **Forbidden Command Interception:** Dangerous system commands are permanently blacklisted:
   * Format drives (`format`)
   * Recursive destructive deletion (`del /s /q c:\`, `rmdir /s /q c:\`)
   * Registry corruption (`reg delete`)
   * Force power shutdown (`shutdown`)
   * Arbitrary database drops (`drop database`)
3. **AST Pre-Validation:** Code generation requires syntax tree verification before being written to disk.
4. **Approval Gates:** High-risk actions require transitioning to `AWAITING_APPROVAL` before proceeding.

