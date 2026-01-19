#!/bin/bash

set -e

cd configuration || exit

######################
### Infrastructure ###
######################

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
export TF_VAR_codespace_name=$CODESPACE_NAME



export DYNATRACE_AUTOMATION_CLIENT_ID=$DYNATRACE_OAUTH_CLIENT_ID
export DYNATRACE_AUTOMATION_CLIENT_SECRET=$DYNATRACE_OAUTH_CLIENT_SECRET

export DYNATRACE_DEBUG=true
export DYNATRACE_LOG_HTTP=terraform-provider-dynatrace.http.log
export DYYNATRACE_HTTP_RESPONSE=true

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


#### Deploy the cert-manager
echo "Deploying Cert Manager ( for OpenTelemetry Operator)"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.10.0/cert-manager.yaml
# Wait for pod webhook started
kubectl wait pod -l app.kubernetes.io/component=webhook -n cert-manager --for=condition=Ready --timeout=2m
# Deploy the opentelemetry operator
sleep 10
echo "Deploying the OpenTelemetry Operator"
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml




helm install dynatrace-operator oci://public.ecr.aws/dynatrace/dynatrace-operator \
  --version 1.7.2 \
  --create-namespace --namespace dynatrace \
  --atomic

kubectl -n dynatrace wait pod --for=condition=ready --selector=app.kubernetes.io/name=dynatrace-operator,app.kubernetes.io/component=webhook --timeout=300s
kubectl -n dynatrace create secret generic dynakube --from-literal="apiToken=$DDYNATRACE_KUBERNETES_OPERATOR_TOKEN" --from-literal="dataIngestToken=$DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN"

### Update the ip of the ip adress for the ingres
#TODO to update this part to create the various Gateway rules



kubectl create secret generic dynatrace \
   --from-literal=dynatrace_oltp_url="$DYNATRACE_LIVE_URL" \
   --from-literal=dt_api_token="$DYNATRACE_KUBERNETES_DATA_INGEST_TOKEN" \
   --from-literal=clustername="$CLUSTER_NAME"

sed -i '' "s|DYNATRACE_LIVE_URL|$DYNATRACE_LIVE_URL|g" kubernetes/dynakube.yaml
sed -i '' "s|CLUSTER_NAME|$CLUSTER_NAME|g" kubernetes/dynakube.yaml

kubectl apply --filename kubernetes/dynakube.yaml

###############################
### Kubernetes Edge Connect ###
###############################

kubectl --namespace dynatrace \
  create secret generic "edge-connect-${CODESPACE_NAME:0:40}-credentials" \
  --from-literal=oauth-client-id="$DYNATRACE_OAUTH_CLIENT_ID" \
  --from-literal=oauth-client-secret="$DYNATRACE_OAUTH_CLIENT_SECRET"

sed -i '' "s|CODESPACE_NAME|${CODESPACE_NAME:0:40}|g" kubernetes/edge-connect.yaml
sed -i '' "s|DYNATRACE_ENVIRONMENT_ID|$DYNATRACE_ENVIRONMENT_ID|g" kubernetes/edge-connect.yaml
sed -i '' "s|DYNATRACE_APPS_URL|$DYNATRACE_APPS_URL|g" kubernetes/edge-connect.yaml
sed -i '' "s|DYNATRACE_SSO_URL|$DYNATRACE_SSO_URL|g" kubernetes/edge-connect.yaml
sed -i '' "s|DYNATRACE_ACCOUNT_ID|$DYNATRACE_ACCOUNT_ID|g" kubernetes/edge-connect.yaml


kubectl apply --filename kubernetes/edge-connect.yaml

# Sleep a bit to allow the Edge Connect to start
sleep 60

######################
### Infrastructure ###
######################

# Finally deploy all infrastructure
terraform apply -auto-approve
