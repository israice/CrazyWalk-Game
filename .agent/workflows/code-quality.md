---
description: Run code quality checks/linting on the project.
---

# Code Quality Check

This workflow runs the Ruff linter to analyze the codebase for errors and style issues.

1. **Run Ruff**
   - Execute the linter on the current directory.
   ```powershell
   ruff check .
   ```

2. **Fix Issues (Optional)**
   - Automatically fix fixable issues.
   ```powershell
   ruff check --fix .
   ```
