#!/bin/bash
# Simple commands to create PR to upstream/V2-Otel

echo "Step 1: Fetch latest from upstream"
git fetch upstream

echo ""
echo "Step 2: Create new branch from upstream/V2-Otel"
git checkout -b pr-to-v2-otel upstream/V2-Otel

echo ""
echo "Step 3: Apply your changes from dashboard-fixes"
echo "Copying files from your dashboard-fixes branch..."
git checkout origin/dashboard-fixes -- .

echo ""
echo "Step 4: Stage and commit changes"
git add .
git commit -m "Update architecture docs: gRPC-only communication, k8s vs Helm comparison, and data flow diagrams"

echo ""
echo "✅ Branch 'pr-to-v2-otel' is ready!"
echo ""
echo "Step 5: Push to your fork (run this manually):"
echo "   git push origin pr-to-v2-otel"
echo ""
echo "Step 6: Create PR on GitHub:"
echo "   https://github.com/lawrobar90/Vegas-App/compare/V2-Otel...henrikrexed:Vegas-App:pr-to-v2-otel"
echo ""
echo "Or use GitHub UI:"
echo "   1. Go to https://github.com/lawrobar90/Vegas-App"
echo "   2. Click 'New Pull Request'"
echo "   3. Base: V2-Otel"
echo "   4. Compare: henrikrexed:Vegas-App:pr-to-v2-otel"

