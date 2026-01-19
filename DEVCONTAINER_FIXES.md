# DevContainer Fixes

## Issues Found and Fixed

### 1. ✅ Typo in devcontainer.json
**Problem:** Line 32 had `chmd` instead of `chmod`
**Fix:** Corrected to `chmod`

### 2. ✅ Path Issues
**Problem:** Used `/workspaces/${RepositoryName}/` which may not resolve correctly
**Fix:** Changed to relative paths from workspace root: `codespace/configuration/init.sh`

### 3. ✅ Variable Typo in init.sh
**Problem:** Line 87 used `$DDYNATRACE_KUBERNETES_OPERATOR_TOKEN` (double D)
**Fix:** Corrected to `$DYNATRACE_KUBERNETES_OPERATOR_TOKEN`

### 4. ✅ Variable Typo in init.sh
**Problem:** Line 38 had `DYYNATRACE_HTTP_RESPONSE` (double Y)
**Fix:** Corrected to `DYNATRACE_HTTP_RESPONSE`

### 5. ✅ sed Command Syntax (macOS vs Linux)
**Problem:** Used `sed -i ''` which is macOS syntax, but container is Ubuntu Linux
**Fix:** Changed to `sed -i` (Linux syntax) for all sed commands

### 6. ✅ Incomplete Helm Command
**Problem:** Line 54 in deployment.sh had incomplete command: `--set global.codesp`
**Fix:** Completed to: `--set global.codespace=true --namespace vegas-casino --create-namespace`

### 7. ✅ Better Error Handling
**Problem:** No logging/error messages in postCreateCommand
**Fix:** Added `set -e` and echo statements to show progress

## How to Get DevContainer Logs

If the devcontainer still fails, you can get logs in several ways:

### Option 1: View Codespace Logs
1. In your Codespace, open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "Codespaces: View Creation Log"
3. This shows the full devcontainer build log

### Option 2: Check Container Logs
```bash
# In the Codespace terminal
docker logs <container-id>
# Or check the devcontainer logs
cat ~/.codespaces/logs/devcontainer.log
```

### Option 3: Run Scripts Manually
If postCreateCommand fails, you can run scripts manually to debug:

```bash
# Make scripts executable
chmod +x .devcontainer/post_create.sh
chmod +x codespace/configuration/init.sh
chmod +x codespace/deployment.sh

# Run them one by one to see where it fails
.devcontainer/post_create.sh
codespace/configuration/init.sh
codespace/deployment.sh
```

### Option 4: Check Specific Services
```bash
# Check if Docker is running
docker info

# Check if kind cluster exists
kind get clusters

# Check Kubernetes
kubectl cluster-info
kubectl get nodes

# Check if secrets are set
env | grep DYNATRACE
```

## Common Issues

1. **Missing Secrets**: Make sure all required secrets are set in Codespace settings
2. **Docker not ready**: The post_create.sh waits for Docker, but if it times out, check Docker status
3. **Network issues**: Some helm installs may fail due to network/timeout issues
4. **Resource limits**: Codespace may need more resources (check hostRequirements)

## Files Modified

- `.devcontainer/devcontainer.json` - Fixed typo and paths
- `codespace/configuration/init.sh` - Fixed variable typos and sed commands
- `codespace/deployment.sh` - Fixed incomplete helm command
