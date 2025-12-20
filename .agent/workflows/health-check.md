---
description: Check project health, file structure, and Redis connectivity.
---

# System Health Check

This workflow validates the basic integrity of the project environment.

1. **Check Project Structure**
   - Verify critical directories exist.
   ```powershell
   Test-Path -Path "CORE/BACKEND", "CORE/FRONTEND", ".agent"
   ```

2. **Verify Docker Status**
   - Check if Docker containers are running.
   ```powershell
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   ```

3. **Check Redis Connection (MCP)**
   - Use the `mcp_redis_list` tool to verify connection to the Redis server and list top-level keys.
   - *Action*: Call `mcp_redis_list(pattern="game:*")` to see game data.

4. **Report**
   - If any step fails, report the specific component that is down.
