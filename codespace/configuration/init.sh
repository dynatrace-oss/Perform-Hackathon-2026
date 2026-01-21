#!/bin/bash

set -e

# Set workspace root directory
WORKDIR="/workspaces/Perform-Hackathon-2026"
### Pre-flight checks for dependencies
if ! command -v terraform >/dev/null 2>&1; then
    echo "Please install terraform before continuing"
    exit 1
fi

######################
### Infrastructure ###
######################
# Set DYNATRACE_API_TOKEN for the get_tokens provider
# This token needs permissions: apiTokens.read & apiTokens.write
if [ -z "$DYNATRACE_API_TOKEN" ]; then
    echo "❌ Error: DYNATRACE_API_TOKEN is not set!"
    echo "   This is required for the Terraform provider to create API tokens."
    echo "   Please configure DYNATRACE_API_TOKEN secret in Codespace settings with:"
    echo "   - apiTokens.read scope"
    echo "   - apiTokens.write scope"
    exit 1
fi
echo "✅ DYNATRACE_API_TOKEN is set (length: ${#DYNATRACE_API_TOKEN} characters)"
export DYNATRACE_API_TOKEN


# Get Dynatrace URLs
environment="$DYNATRACE_ENVIRONMENT"
#typeset -l environment
if [ "$environment" == "live" ]; then
  export DYNATRACE_LIVE_URL="$DYNATRACE_ENVIRONMENT_ID.live.dynatrace.com"
  export DYNATRACE_APPS_URL="$DYNATRACE_ENVIRONMENT_ID.apps.dynatrace.com"
  export DYNATRACE_SSO_URL="sso.dynatrace.com/sso/oauth2/token"
else
  export DYNATRACE_LIVE_URL="$DYNATRACE_ENVIRONMENT_ID.$environment.dynatracelabs.com"
  export DYNATRACE_APPS_URL="$DYNATRACE_ENVIRONMENT_ID.$environment.apps.dynatracelabs.com"
  export DYNATRACE_SSO_URL="sso-$environment.dynatracelabs.com/sso/oauth2/token"
fi

# Prepare environment for Terraform
export TF_VAR_github_token=$GITHUB_TOKEN
export TF_VAR_dynatrace_platform_token=$DYNATRACE_PLATFORM_TOKEN
export TF_VAR_dynatrace_live_url="https://$DYNATRACE_LIVE_URL"
export TF_VAR_dynatrace_environment_id=$DYNATRACE_ENVIRONMENT_ID

# Sanitize codespace name for use in team identifier
# Convert to lowercase, replace invalid chars with hyphens, remove leading/trailing hyphens
SANITIZED_CODESPACE=$(echo "${CODESPACE_NAME:-codespace}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/^-\+//' | sed 's/-\+$//' | sed 's/--\+/-/g')
# Ensure it doesn't start with a number (add prefix if needed)
if echo "$SANITIZED_CODESPACE" | grep -qE '^[0-9]'; then
    SANITIZED_CODESPACE="codespace-${SANITIZED_CODESPACE}"
fi
export TF_VAR_codespace_name="$SANITIZED_CODESPACE"



export DYNATRACE_AUTOMATION_CLIENT_ID=$DYNATRACE_OAUTH_CLIENT_ID
export DYNATRACE_AUTOMATION_CLIENT_SECRET=$DYNATRACE_OAUTH_CLIENT_SECRET

export DYNATRACE_DEBUG=true
export DYNATRACE_LOG_HTTP=terraform-provider-dynatrace.http.log
export DYNATRACE_HTTP_RESPONSE=true

# Change to configuration directory for Terraform
# Try multiple possible paths
if [ -d "$WORKDIR/codespace/configuration" ]; then
    cd "$WORKDIR/codespace/configuration"
elif [ -d "codespace/configuration" ]; then
    cd codespace/configuration
elif [ -d "configuration" ]; then
    cd configuration
else
    echo "❌ Could not find configuration directory"
    echo "Current directory: $(pwd)"
    echo "Looking for: $WORKDIR/codespace/configuration or codespace/configuration or configuration"
    exit 1
fi
echo "Working in: $(pwd)"

terraform init

#############################
### Kubernetes Monitoring ###
#############################

# Deploy Kubernetes operator tokens
terraform apply -target=dynatrace_api_token.kubernetes_operator -target=dynatrace_api_token.kubernetes_data_ingest -auto-approve

DYNATRACE_KUBERNETES_OPERATOR_TOKEN="$(terraform output kubernetes_operator_token | tr -d '"')"
export DYNATRACE_KUBERNETES_OPERATOR_TOKEN

DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN="$(terraform output kubernetes_data_ingest_token | tr -d '"')"
export DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN
export CLUSTER_NAME="Perform-Vegas-$CODESPACE_NAME" 

kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/experimental-install.yaml

# Install kgateway
helm install  --create-namespace --namespace kgateway-system --version v2.2.0-main \
kgateway-crds oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds \
--set controller.image.pullPolicy=Always

helm install  --namespace kgateway-system --version v2.2.0-main \
kgateway oci://cr.kgateway.dev/kgateway-dev/charts/kgateway \
--set controller.image.pullPolicy=Always 

#### Deploy the cert-manager (required for OpenFeature Operator)
echo "Deploying Cert Manager (required for OpenFeature Operator)"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.10.0/cert-manager.yaml
# Wait for pod webhook started
kubectl wait pod -l app.kubernetes.io/component=webhook -n cert-manager --for=condition=Ready --timeout=2m

# Determine kubernetes directory path (relative to current directory)
if [ -d "kubernetes" ]; then
    K8S_DIR="kubernetes"
elif [ -d "$WORKDIR/codespace/configuration/kubernetes" ]; then
    K8S_DIR="$WORKDIR/codespace/configuration/kubernetes"
else
    echo "⚠️ Kubernetes directory not found, trying to continue..."
    K8S_DIR="kubernetes"
fi

helm install dynatrace-operator oci://public.ecr.aws/dynatrace/dynatrace-operator \
  --version 1.7.2 \
  --create-namespace --namespace dynatrace \
  -f $K8S_DIR/operator.values.yaml \
  --atomic

kubectl -n dynatrace wait pod --for=condition=ready --selector=app.kubernetes.io/name=dynatrace-operator,app.kubernetes.io/component=webhook --timeout=300s
kubectl -n dynatrace create secret generic dynakube --from-literal="apiToken=$DYNATRACE_KUBERNETES_OPERATOR_TOKEN" --from-literal="dataIngestToken=$DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN"

### Update the ip of the ip adress for the ingres
#TODO to update this part to create the various Gateway rules



kubectl create secret generic dynatrace \
   --from-literal=dynatrace_oltp_url="$DYNATRACE_LIVE_URL" \
   --from-literal=dt_api_token="$DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN" \
   --from-literal=clustername="$CLUSTER_NAME"



sed -i "s|DYNATRACE_LIVE_URL|$DYNATRACE_LIVE_URL|g" "$K8S_DIR/dynakube.yaml"
sed -i "s|CLUSTER_NAME|$CLUSTER_NAME|g" "$K8S_DIR/dynakube.yaml"

kubectl apply --filename "$K8S_DIR/dynakube.yaml"

###############################
### Kubernetes Edge Connect ###
###############################

kubectl --namespace dynatrace \
  create secret generic "edge-connect-${CODESPACE_NAME:0:40}-credentials" \
  --from-literal=oauth-client-id="$DYNATRACE_OAUTH_CLIENT_ID" \
  --from-literal=oauth-client-secret="$DYNATRACE_OAUTH_CLIENT_SECRET"

sed -i "s|CODESPACE_NAME|${CODESPACE_NAME:0:40}|g" "$K8S_DIR/edge-connect.yaml"
sed -i "s|DYNATRACE_ENVIRONMENT_ID|$DYNATRACE_ENVIRONMENT_ID|g" "$K8S_DIR/edge-connect.yaml"
sed -i "s|DYNATRACE_APPS_URL|$DYNATRACE_APPS_URL|g" "$K8S_DIR/edge-connect.yaml"
sed -i "s|DYNATRACE_SSO_URL|$DYNATRACE_SSO_URL|g" "$K8S_DIR/edge-connect.yaml"
sed -i "s|DYNATRACE_ACCOUNT_ID|$DYNATRACE_ACCOUNT_ID|g" "$K8S_DIR/edge-connect.yaml"

kubectl apply --filename "$K8S_DIR/edge-connect.yaml"

# Sleep a bit to allow the Edge Connect to start
sleep 60

######################
### Infrastructure ###
######################

# Try to import existing team if it exists (prevents recreation errors)
# This allows Terraform to manage existing teams without trying to recreate them
# Note: Team identifier now includes codespace name for uniqueness
echo "Checking if team already exists and importing if needed..."

# Use the sanitized codespace name that was already set for Terraform
TEAM_IDENTIFIER="${TF_VAR_demo_name_kebab:-vegas-casino-app}-${TF_VAR_codespace_name}"

# Check if team is already in Terraform state
if terraform state show dynatrace_ownership_teams.demo >/dev/null 2>&1; then
    echo "✅ Team '$TEAM_IDENTIFIER' is already in Terraform state"
else
    # Try to import the team if it exists in Dynatrace
    echo "Attempting to import team '$TEAM_IDENTIFIER' from Dynatrace..."
    if terraform import dynatrace_ownership_teams.demo "$TEAM_IDENTIFIER" 2>/dev/null; then
        echo "✅ Successfully imported existing team: $TEAM_IDENTIFIER"
    else
        echo "ℹ️ Team '$TEAM_IDENTIFIER' does not exist in Dynatrace, will be created by Terraform"
        # Continue - Terraform will create it
    fi
fi
sed -i "s|TEAM_IDENTIFIER|$TEAM_IDENTIFIER|g" "$WORKDIR/helm/vegas-casino/values.yaml"
sed -i "s|GITHUB_USER|$GITHUB_USER|g" "$WORKDIR/helm/vegas-casino/values.yaml"


# Finally deploy all infrastructure
terraform apply -auto-approve
