#!/bin/bash
# Script to create a PR to upstream's V2-Otel branch
# This script will:
# 1. Fetch the latest from upstream
# 2. Create a new branch based on upstream/V2-Otel
# 3. Apply your current changes
# 4. Push to your fork
# 5. Provide instructions for creating the PR

set -e

echo "🔍 Fetching latest from upstream..."
git fetch upstream

echo "📋 Checking current branch..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

echo ""
echo "📦 Creating new branch based on upstream/V2-Otel..."
NEW_BRANCH="pr-to-v2-otel-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$NEW_BRANCH" upstream/V2-Otel

echo ""
echo "🔄 Applying your changes from $CURRENT_BRANCH..."
# Check if there are commits to cherry-pick
COMMITS_TO_PICK=$(git log --oneline upstream/V2-Otel..origin/$CURRENT_BRANCH | wc -l | tr -d ' ')

if [ "$COMMITS_TO_PICK" -gt 0 ]; then
    echo "Found $COMMITS_TO_PICK commits to apply"
    echo ""
    echo "Option 1: Cherry-pick commits (preserves history)"
    echo "  git cherry-pick upstream/V2-Otel..origin/$CURRENT_BRANCH"
    echo ""
    echo "Option 2: Merge your branch (creates merge commit)"
    echo "  git merge origin/$CURRENT_BRANCH --no-ff -m 'Merge changes from $CURRENT_BRANCH'"
    echo ""
    echo "Option 3: Apply changes as a single commit"
    echo "  git checkout origin/$CURRENT_BRANCH -- ."
    echo "  git add ."
    echo "  git commit -m 'Apply changes from $CURRENT_BRANCH'"
    echo ""
    read -p "Choose option (1/2/3) or 's' to skip: " choice
    
    case $choice in
        1)
            echo "Cherry-picking commits..."
            git cherry-pick upstream/V2-Otel..origin/$CURRENT_BRANCH || {
                echo "⚠️  Cherry-pick had conflicts. Resolve them and run:"
                echo "   git cherry-pick --continue"
                exit 1
            }
            ;;
        2)
            echo "Merging branch..."
            git merge origin/$CURRENT_BRANCH --no-ff -m "Merge changes from $CURRENT_BRANCH"
            ;;
        3)
            echo "Applying changes as single commit..."
            git checkout origin/$CURRENT_BRANCH -- .
            git add .
            git commit -m "Apply changes from $CURRENT_BRANCH"
            ;;
        s|S)
            echo "Skipping. You can manually apply changes."
            ;;
        *)
            echo "Invalid choice. Skipping."
            ;;
    esac
else
    echo "No commits found to apply. Your branch might already be up to date."
fi

echo ""
echo "✅ Branch '$NEW_BRANCH' is ready!"
echo ""
echo "📤 Next steps:"
echo "1. Push the branch to your fork:"
echo "   git push origin $NEW_BRANCH"
echo ""
echo "2. Create PR on GitHub:"
echo "   - Go to: https://github.com/lawrobar90/Vegas-App/compare/V2-Otel...henrikrexed:Vegas-App:$NEW_BRANCH"
echo "   - Or use GitHub UI:"
echo "     * Go to https://github.com/lawrobar90/Vegas-App"
echo "     * Click 'New Pull Request'"
echo "     * Base: V2-Otel"
echo "     * Compare: henrikrexed:Vegas-App:$NEW_BRANCH"
echo ""
echo "Current branch: $NEW_BRANCH"
echo "Ready to push!"

