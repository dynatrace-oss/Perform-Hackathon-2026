#!/usr/bin/env bash

################################################################################
### Script deploying the Observ-K8s environment
### Parameters:
### Clustern name: name of your k8s cluster
### dttoken: Dynatrace api token with ingest metrics and otlp ingest scope
### dturl : url of your DT tenant wihtout any / at the end for example: https://dedede.live.dynatrace.com
################################################################################
WORKDIR="/workspaces/Perform-Hackathon-2026"

### Pre-flight checks for dependencies
if ! command -v jq >/dev/null 2>&1; then
    echo "Please install jq before continuing"
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "Please install git before continuing"
    exit 1
fi


if ! command -v helm >/dev/null 2>&1; then
    echo "Please install helm before continuing"
    exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
    echo "Please install kubectl before continuing"
    exit 1
fi
echo "parsing arguments"

kubectl label namespace  default oneagent=false
kubectl apply -f $WORKDIR/codespace/manifests/rbac.yaml
# Apply OpenTelemetry collector ConfigMaps and Deployments (no operator required)
# This reduces resource usage by removing cert-manager and OpenTelemetry Operator dependencies
echo "Deploying OpenTelemetry collectors (traditional Kubernetes resources)"
kubectl apply -f $WORKDIR/codespace/manifests/otel-collector-daemonset-config.yaml
kubectl apply -f $WORKDIR/codespace/manifests/otel-collector-statefulset-config.yaml
kubectl apply -f $WORKDIR/codespace/manifests/otel-collector-daemonset.yaml
kubectl apply -f $WORKDIR/codespace/manifests/otel-collector-statefulset.yaml
kubectl apply -f $WORKDIR/codespace/manifests/otel-collector-service.yaml



helm repo add openfeature https://open-feature.github.io/open-feature-operator
helm repo update

helm install open-feature-operator openfeature/open-feature-operator \
  --namespace open-feature-system \
  --create-namespace \
  --wait

kubectl create namespace vegas-casino
kubectl label namespace vegas-casino oneagent=false

######################
### Team Identifier ###
######################
# Construct team identifier matching Terraform team.tf logic
# Format: <demo_name_kebab>-<sanitized_codespace_name>
# This ensures consistency between Terraform-created teams and Helm-deployed resources
# The team identifier is used in dt.owner annotations for Dynatrace ownership tracking

# Default demo name (matches variables.tf default)
DEMO_NAME_KEBAB="${DEMO_NAME_KEBAB:-vegas-casino-app}"

# Sanitize codespace name to match Terraform init.sh logic
# Convert to lowercase, replace invalid chars with hyphens, remove leading/trailing hyphens
SANITIZED_CODESPACE=$(echo "${CODESPACE_NAME:-codespace}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/^-\+//' | sed 's/-\+$//' | sed 's/--\+/-/g')
# Ensure it doesn't start with a number (add prefix if needed)
if echo "$SANITIZED_CODESPACE" | grep -qE '^[0-9]'; then
    SANITIZED_CODESPACE="codespace-${SANITIZED_CODESPACE}"
fi

# Construct team identifier (matches team.tf: local.team_identifier)
TEAM_IDENTIFIER="${DEMO_NAME_KEBAB}-${SANITIZED_CODESPACE}"

echo "📋 Using team identifier: $TEAM_IDENTIFIER"
echo "   This will be used for dt.owner annotations in all deployed pods"

helm install vegas-casino $WORKDIR/helm/vegas-casino \
   --set global.codespace=true \
   --set global.teamIdentifier="$TEAM_IDENTIFIER" \
   --namespace vegas-casino

HTTP_IDX=$(kubectl get svc vegas-casino-gateway  -n vegas-casino -o json |  jq -r '.spec.ports | to_entries | .[] | select(.value.name == "listener-80") | .key')
PATCH_OPS="[{\"op\": \"replace\", \"path\": \"/spec/ports/${HTTP_IDX}/nodePort\", \"value\": 30080}]"
kubectl patch svc vegas-casino-gateway  -n vegas-casino  --type='json'  -p="${PATCH_OPS}"
