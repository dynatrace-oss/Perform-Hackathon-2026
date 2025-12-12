#!/bin/bash
# Script to install OpenFeature Operator and CRDs before installing the main chart

set -e

echo "Installing OpenFeature Operator..."

# Add Helm repository
helm repo add open-feature https://open-feature.github.io/open-feature-operator/ 2>/dev/null || true
helm repo update

# Install OpenFeature Operator (this installs the CRDs)
helm upgrade --install open-feature-operator open-feature/open-feature-operator \
  --version 0.8.8 \
  --namespace open-feature \
  --create-namespace \
  --wait

echo "Waiting for CRDs to be available..."
sleep 5

# Verify CRDs are installed
echo "Verifying CRDs..."
kubectl get crd featureflags.core.openfeature.dev || {
  echo "ERROR: FeatureFlag CRD not found"
  exit 1
}

kubectl get crd featureflagsources.core.openfeature.dev || {
  echo "ERROR: FeatureFlagSource CRD not found"
  exit 1
}

echo "✓ OpenFeature Operator and CRDs are installed and ready!"
echo "You can now install the vegas-casino chart with openfeature.enabled=true"




