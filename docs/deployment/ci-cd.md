# CI/CD and Release Management

This document explains the GitHub Actions workflows, how to create releases, and how to update the codespace environment.

## GitHub Actions Workflows

The project uses several GitHub Actions workflows for continuous integration, security scanning, and container image management.

### Workflow Overview

| Workflow | Purpose | Triggers |
|----------|---------|----------|
| `ci-cd.yml` | Full CI/CD pipeline with tests, builds, security scans, and SBOM generation | Push to main/V2-Otel, PRs, manual dispatch |
| `docker-build.yml` | Build and push Docker images to GitHub Container Registry | Push to main/V2-Otel, tags (v*), manual dispatch |
| `security-scan.yml` | Security vulnerability scanning with Trivy and CodeQL | Push to main/V2-Otel, PRs, weekly schedule |
| `sbom.yml` | Generate Software Bill of Materials for container images | Push to main/V2-Otel, tags (v*), manual dispatch |

### CI/CD Pipeline (`ci-cd.yml`)

The main CI/CD pipeline performs the following steps:

#### 1. Test Job
- **Runs**: On every push and pull request
- **Purpose**: Run unit tests for all services
- **Languages**: Node.js, Python, Go, Java
- **Services Tested**:
  - Gateway (Node.js)
  - Slots (Node.js)
  - Blackjack (Node.js)
  - Frontend (Node.js)
  - Roulette (Python)
  - Dice (Go)

#### 2. Build Job
- **Runs**: After tests pass
- **Purpose**: Build Docker images for all services
- **Registry**: GitHub Container Registry (`ghcr.io`)
- **Image Naming**: `{registry}/{owner}/vegasapp-{service}:{tag}`
- **Services Built**:
  - gateway
  - slots
  - blackjack
  - frontend
  - roulette
  - dice
  - scoring
  - dashboard
  - playwright
  - k6

#### 3. Security Scan Job
- **Runs**: After build completes
- **Purpose**: Scan images and code for vulnerabilities
- **Tools**:
  - Trivy (container and filesystem scanning)
  - CodeQL (code analysis)
  - Dependency Review (for PRs)
- **Severity Levels**: CRITICAL, HIGH, MEDIUM

#### 4. SBOM Generation Job
- **Runs**: After build completes
- **Purpose**: Generate Software Bill of Materials
- **Formats**: SPDX JSON, SPDX, CycloneDX JSON
- **Storage**: Uploaded as artifacts and attached to releases

#### 5. Build Summary Job
- **Runs**: After all jobs complete
- **Purpose**: Provide summary of build status

### Docker Build Workflow (`docker-build.yml`)

This workflow focuses specifically on building and pushing Docker images.

**Features**:
- Builds all services in parallel using matrix strategy
- Pushes to GitHub Container Registry (`ghcr.io`)
- Supports manual dispatch with service selection
- Automatic tagging based on branch, PR, or tag
- Build caching for faster builds

**Image Tags Generated**:
- Branch name (e.g., `main`)
- PR number (e.g., `pr-123`)
- Semantic version from tags (e.g., `v0.39.0`, `0.39`)
- SHA prefix (e.g., `main-abc1234`)
- `latest` (only for default branch)

**Manual Dispatch**:
You can manually trigger builds for specific services:
1. Go to **Actions** > **Docker Build and Push**
2. Click **Run workflow**
3. Select service to build (or "all" for all services)
4. Optionally specify image tag

### Security Scanning (`security-scan.yml`)

**Features**:
- **Trivy**: Scans container images and filesystem
- **CodeQL**: Static code analysis for JavaScript, Python, Java, Go
- **Dependency Review**: Checks PR dependencies for vulnerabilities
- **Scheduled**: Runs weekly on Sundays
- **Reporting**: Results uploaded to GitHub Security tab

### SBOM Generation (`sbom.yml`)

**Features**:
- Generates SBOMs in multiple formats (SPDX, CycloneDX)
- Attaches SBOMs to GitHub releases
- Stores artifacts for 90 days
- Can be triggered manually

## Creating a New Release

### Step 1: Update Version Numbers

Before creating a release, update the version numbers in:

1. **Makefile**:
   ```makefile
   IMAGE_TAG ?= 0.40  # Update to new version
   ```

2. **Helm Chart** (`helm/vegas-casino/values.yaml`):
   ```yaml
   global:
     imageTag: "0.40"  # Update to new version
   ```

3. **Commit and Push**:
   ```bash
   git add Makefile helm/vegas-casino/values.yaml
   git commit -m "Bump version to 0.40"
   git push origin main
   ```

### Step 2: Create Git Tag

Create a new tag for the release:

```bash
# Create annotated tag
git tag -a v0.40.0 -m "Release version 0.40.0"

# Push tag to remote
git push origin v0.40.0
```

**Tag Format**: Use semantic versioning (e.g., `v0.40.0`, `v1.0.0`)

### Step 3: GitHub Actions Automatically Builds

When you push a tag starting with `v`, the workflows automatically:
1. Build all Docker images
2. Tag images with the version number
3. Push to GitHub Container Registry
4. Generate SBOMs
5. Attach SBOMs to the release

### Step 4: Create GitHub Release

1. Go to **Releases** in your GitHub repository
2. Click **Draft a new release**
3. Select the tag you just created (e.g., `v0.40.0`)
4. Fill in release title and description
5. Click **Publish release**

**Release Notes Template**:
```markdown
## What's New in v0.40.0

### Features
- Feature 1
- Feature 2

### Bug Fixes
- Fix 1
- Fix 2

### Improvements
- Improvement 1

### Docker Images
All images are available at `ghcr.io/{owner}/vegasapp-{service}:0.40.0`
```

## Updating Codespace Environment

The codespace environment can be updated to use the latest release using Helm.

### Prerequisites

- Access to the Kubernetes cluster
- `kubectl` configured
- `helm` installed
- Required secrets and configuration

### Method 1: Using Deployment Script

The `codespace/deployment.sh` script handles the full deployment:

```bash
cd codespace
./deployment.sh \
  --clustername "my-cluster" \
  --dtid "abc12345" \
  --environment "live" \
  --dtoperatortoken "dt0c01.******" \
  --dtingesttoken "dt0c01.******" \
  --oauthclientid "dt0s10.******" \
  --oauthclientsecret "******" \
  --oauthclienturn "urn:dtenvironment:abc12345"
```

The script will:
1. Install required operators (OpenFeature, Dynatrace, OpenTelemetry)
2. Deploy the Vegas Casino application using Helm
3. Configure services and networking

### Method 2: Manual Helm Upgrade

To update to a specific version:

```bash
# Update Helm chart repository (if using external repo)
helm repo update

# Upgrade to specific version
helm upgrade vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --set global.imageTag="0.40" \
  --set global.imageRegistry="ghcr.io/{owner}/vegasapp" \
  --reuse-values
```

### Method 3: Update values.yaml and Upgrade

1. **Edit Helm values**:
   ```bash
   # Edit helm/vegas-casino/values.yaml
   # Update:
   global:
     imageTag: "0.40"
     imageRegistry: "ghcr.io/{owner}/vegasapp"
   ```

2. **Upgrade deployment**:
   ```bash
   helm upgrade vegas-casino ./helm/vegas-casino \
     --namespace vegas-casino \
     --create-namespace
   ```

### Method 4: Update Individual Services

To update specific services without affecting others:

```bash
# Update only frontend service
helm upgrade vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --set frontend.image.tag="0.40" \
  --reuse-values

# Update multiple services
helm upgrade vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --set frontend.image.tag="0.40" \
  --set slots.image.tag="0.40" \
  --set roulette.image.tag="0.40" \
  --reuse-values
```

### Verifying the Update

After updating, verify the deployment:

```bash
# Check pod status
kubectl get pods -n vegas-casino

# Check image versions
kubectl get pods -n vegas-casino -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Check Helm release status
helm status vegas-casino -n vegas-casino

# View release history
helm history vegas-casino -n vegas-casino
```

### Rollback if Needed

If the update causes issues, rollback to previous version:

```bash
# Rollback to previous release
helm rollback vegas-casino -n vegas-casino

# Rollback to specific revision
helm rollback vegas-casino 2 -n vegas-casino  # Rollback to revision 2

# View rollback history
helm history vegas-casino -n vegas-casino
```

## Image Registry Configuration

### GitHub Container Registry (ghcr.io)

Images are pushed to GitHub Container Registry by default:
- **Registry**: `ghcr.io`
- **Format**: `ghcr.io/{owner}/vegasapp-{service}:{tag}`
- **Authentication**: Uses `GITHUB_TOKEN` automatically

### Pulling Images

To pull images from GitHub Container Registry:

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull specific image
docker pull ghcr.io/{owner}/vegasapp-frontend:0.40
```

### Using Images in Helm

Update `helm/vegas-casino/values.yaml`:

```yaml
global:
  imageRegistry: ghcr.io/{owner}/vegasapp
  imageTag: "0.40"
  imagePullPolicy: IfNotPresent
```

Or use `--set` flags:

```bash
helm upgrade vegas-casino ./helm/vegas-casino \
  --set global.imageRegistry="ghcr.io/{owner}/vegasapp" \
  --set global.imageTag="0.40"
```

## Best Practices

### Version Management

1. **Use Semantic Versioning**: Follow `MAJOR.MINOR.PATCH` format
2. **Tag Releases**: Always create git tags for releases
3. **Update Documentation**: Update version numbers in docs
4. **Changelog**: Maintain a changelog for each release

### Deployment Strategy

1. **Test First**: Test new versions in a staging environment
2. **Gradual Rollout**: Consider using Helm's `replicaCount` for gradual rollouts
3. **Monitor**: Watch logs and metrics after deployment
4. **Rollback Plan**: Always have a rollback plan ready

### Security

1. **Scan Images**: Always review security scan results before deploying
2. **Update Dependencies**: Keep dependencies up to date
3. **Review SBOMs**: Review Software Bill of Materials for vulnerabilities
4. **Use Secrets**: Never commit secrets to the repository

## Troubleshooting

### Images Not Found

If Helm can't pull images:

```bash
# Check image exists
docker pull ghcr.io/{owner}/vegasapp-frontend:0.40

# Verify image pull secrets
kubectl get secrets -n vegas-casino

# Check pod events
kubectl describe pod <pod-name> -n vegas-casino
```

### Build Failures

If GitHub Actions builds fail:

1. Check workflow logs in **Actions** tab
2. Verify Dockerfile syntax
3. Check for dependency issues
4. Review build cache

### Deployment Issues

If Helm upgrade fails:

```bash
# Check release status
helm status vegas-casino -n vegas-casino

# View failed resources
kubectl get all -n vegas-casino

# Check pod logs
kubectl logs <pod-name> -n vegas-casino

# Dry-run to see what would change
helm upgrade vegas-casino ./helm/vegas-casino --dry-run --debug
```

---

**Next**: Learn about [Helm Deployment](helm.md) or [Kubernetes Manifests](manifests.md).
