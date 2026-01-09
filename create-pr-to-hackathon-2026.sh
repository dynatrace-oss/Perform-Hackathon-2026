#!/bin/bash
# Script to create a PR to the Perform Hackathon 2026 repository
# This script will:
# 1. Guide you through SAML SSO authentication
# 2. Push the branch to the new repository
# 3. Provide instructions for creating the PR

set -e

echo "🚀 Creating PR to Perform Hackathon 2026 Repository"
echo "=================================================="
echo ""

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📋 Current branch: $CURRENT_BRANCH"
echo ""

# Check if remote exists
if ! git remote get-url perform-hackathon-2026 > /dev/null 2>&1; then
    echo "➕ Adding remote 'perform-hackathon-2026'..."
    git remote add perform-hackathon-2026 https://github.com/dynatrace-oss/Perform-Hackathon-2026.git
else
    echo "✅ Remote 'perform-hackathon-2026' already exists"
fi

echo ""
echo "🔐 Authentication Required"
echo "=========================="
echo "The 'dynatrace-oss' organization requires SAML SSO authentication."
echo ""
echo "To authenticate:"
echo "1. Visit: https://github.com/settings/tokens"
echo "2. Generate a new Personal Access Token (PAT) with 'repo' scope"
echo "3. Make sure to authorize it for the 'dynatrace-oss' organization"
echo "   (GitHub will prompt you during token creation)"
echo ""
echo "Alternatively, if using Git Credential Manager:"
echo "1. You may be prompted to authenticate in your browser"
echo "2. Complete the SAML SSO authentication flow"
echo ""
read -p "Press Enter when you're ready to push (or Ctrl+C to cancel)..."
echo ""

echo "📤 Pushing branch '$CURRENT_BRANCH' to perform-hackathon-2026..."
if git push perform-hackathon-2026 "$CURRENT_BRANCH"; then
    echo ""
    echo "✅ Branch pushed successfully!"
    echo ""
    echo "🔗 Create Pull Request"
    echo "===================="
    echo ""
    echo "Option 1: Using GitHub Web UI"
    echo "  Visit: https://github.com/dynatrace-oss/Perform-Hackathon-2026/compare/main...pr-to-v2-otel"
    echo ""
    echo "Option 2: Manual steps"
    echo "  1. Go to: https://github.com/dynatrace-oss/Perform-Hackathon-2026"
    echo "  2. Click 'New Pull Request' or 'Compare & pull request'"
    echo "  3. Base branch: main (or the default branch)"
    echo "  4. Compare branch: pr-to-v2-otel"
    echo "  5. Add title: 'Prepare Perform Hackathon 2026: Update to OpenTelemetry v2'"
    echo "  6. Add description explaining the changes"
    echo "  7. Click 'Create Pull Request'"
    echo ""
    echo "Option 3: Using GitHub CLI (if installed)"
    echo "  gh pr create --repo dynatrace-oss/Perform-Hackathon-2026 --base main --head pr-to-v2-otel --title 'Prepare Perform Hackathon 2026: Update to OpenTelemetry v2' --body 'Updates for Perform Hackathon 2026 including OpenTelemetry v2 configuration and various improvements.'"
    echo ""
else
    echo ""
    echo "❌ Push failed. This is likely due to authentication."
    echo ""
    echo "Please try one of these solutions:"
    echo ""
    echo "Solution 1: Use Personal Access Token"
    echo "  1. Create a PAT at: https://github.com/settings/tokens"
    echo "  2. Make sure to authorize it for 'dynatrace-oss' organization"
    echo "  3. Use it when prompted for password, or:"
    echo "     git push https://<YOUR_USERNAME>:<YOUR_TOKEN>@github.com/dynatrace-oss/Perform-Hackathon-2026.git pr-to-v2-otel"
    echo ""
    echo "Solution 2: Authenticate via browser"
    echo "  If using Git Credential Manager, you should be prompted to authenticate."
    echo "  Complete the SAML SSO flow in your browser."
    echo ""
    echo "Solution 3: Use SSH (if you have SSH keys set up)"
    echo "  git remote set-url perform-hackathon-2026 git@github.com:dynatrace-oss/Perform-Hackathon-2026.git"
    echo "  git push perform-hackathon-2026 pr-to-v2-otel"
    echo ""
    exit 1
fi
