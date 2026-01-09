# GitHub Actions Workflow Fixes

## Issues Identified and Fixed

### 1. ✅ Branch Name Mismatches
**Problem:** Workflows referenced branches (`V2-Otel`, `dashboard-fixes`) that don't exist in the new repository.

**Fixed in:**
- `.github/workflows/ci-cd.yml` - Updated to only trigger on `main`
- `.github/workflows/docker-build.yml` - Updated to only trigger on `main`
- `.github/workflows/security-scan.yml` - Updated to only trigger on `main`
- `.github/workflows/sbom.yml` - Updated to only trigger on `main`
- `.github/workflows/makefile.yml` - Updated to only trigger on `main` PRs

### 2. ✅ Registry Configuration
**Problem:** Workflows used `hrexed/vegasapp` registry instead of the new repository's registry.

**Fixed in:**
- `.github/workflows/ci-cd.yml` - Changed from `REGISTRY: hrexed/vegasapp` to:
  ```yaml
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ${{ github.repository_owner }}/vegasapp
  ```
  - Updated all image references to use `${{ env.REGISTRY }}/${{ env.IMAGE_PREFIX }}-${{ matrix.service }}`

**Note:** `.github/workflows/docker-build.yml` already had the correct registry configuration.

### 3. ✅ Linting Workflow
**Problem:** The linting workflow called `make markdownlint` which doesn't exist in the Makefile.

**Fixed in:**
- `.github/workflows/makefile.yml` - Replaced Makefile call with direct markdownlint-cli installation and execution
- Updated to use `actions/checkout@v4` (was v3)
- Added proper Node.js setup

### 4. ⚠️ Security Scan Image References
**Status:** The security scan in `ci-cd.yml` references Docker images that need to be built first. This should work correctly because:
- The `security-scan` job has `needs: build` dependency
- Images are built and pushed in the `build` job
- However, if images fail to build, the security scan will also fail

**Recommendation:** Consider making the security scan more resilient by:
- Adding `continue-on-error: true` for non-critical scans
- Or scanning filesystem instead of images (like `security-scan.yml` does)

### 5. ⚠️ SBOM Generation
**Status:** The SBOM workflow in `ci-cd.yml` also depends on built images. The standalone `sbom.yml` workflow builds images locally, which is better.

**Recommendation:** Consider using the standalone `sbom.yml` workflow approach or ensure images are available before running SBOM generation.

## Additional Recommendations

### 1. Workflow Dependencies
The `ci-cd.yml` workflow has proper job dependencies:
- `build` needs `test`
- `security-scan` needs `build`
- `sbom` needs `build`
- `build-summary` needs all of the above

This should work correctly once images are built.

### 2. Image Tagging
All workflows now use consistent image tagging:
- `ghcr.io/dynatrace-oss/vegasapp-{service}:{tag}`
- Tags include branch names, SHA, and `latest` for main branch

### 3. Test Failures
The test jobs use `|| true` to allow failures, which is good for a hackathon project where not all tests may be implemented.

### 4. Missing Gateway in docker-build-all
**Note:** The `docker-build.yml` workflow includes `gateway` in the matrix, but the Makefile's `docker-build-all` target doesn't include gateway. This is fine as the workflows don't use the Makefile.

## Next Steps

1. **Commit and push these changes** to trigger new workflow runs
2. **Monitor the first run** to ensure all fixes work correctly
3. **Review any remaining failures** and adjust as needed
4. **Consider adding workflow badges** to README once workflows are stable

## Testing the Fixes

After pushing these changes, you can:
1. Check the Actions tab: https://github.com/dynatrace-oss/Perform-Hackathon-2026/actions
2. Verify workflows trigger on:
   - Push to `main` branch
   - Pull requests to `main` branch
   - Manual workflow dispatch
3. Ensure all jobs complete successfully or fail gracefully
