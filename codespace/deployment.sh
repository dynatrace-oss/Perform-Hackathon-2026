#!/usr/bin/env bash

################################################################################
### Script deploying the Observ-K8s environment
### Parameters:
### Clustern name: name of your k8s cluster
### dttoken: Dynatrace api token with ingest metrics and otlp ingest scope
### dturl : url of your DT tenant wihtout any / at the end for example: https://dedede.live.dynatrace.com
################################################################################


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
while [ $# -gt 0 ]; do
  case "$1" in
   --dtoperatortoken)
          DTOPERATORTOKEN="$2"
         shift 2
          ;;
       --dtingesttoken)
          DTTOKEN="$2"
         shift 2
          ;;
        --environment)
        ENVIRONMENT="$2"
        shift 2
        ;;
       --dtid)
          DT_TENANT_ID="$2"
         shift 2
          ;;
       --clustername)
         CLUSTERNAME="$2"
         shift 2
         ;;
       --type)
         TYPE="$2"
         shift 2
         ;;
       --oauthclientid)
         OAUTH_CLIENT_ID="$2"
         shift 2
         ;;
        --oauthclientsecret)
          OAUTH_CLIENT_SECRET="$2"
          shift 2
          ;;
      --oauthclienturn)
          OAUTH_CLIENT_URN="$2"
          shift 2
          ;;
  *)
    echo "Warning: skipping unsupported option: $1"
    shift
    ;;
  esac
done
echo "Checking arguments"
 if [ -z "$CLUSTERNAME" ]; then
   echo "Error: clustername not set!"
   exit 1
 fi
 if [ -z "$DT_TENANT_ID" ]; then
   echo "Error: tennat id not set!"
   exit 1
 fi
 if [ -z "$ENVIRONMENT" ]; then
   ENVIRONMENT="live"
 fi

 if [ -z "$DTTOKEN" ]; then
   echo "Error: Data ingest api-token not set!"
   exit 1
 fi

 if [ -z "$DTOPERATORTOKEN" ]; then
   echo "Error: DT operator token not set!"
   exit 1
 fi
 if [ -z "$TYPE" ]; then
   echo "Error: type of test  not set!"
   exit 1
 fi


if [ "$ENVIRONMENT" == "live" ]; then
  export DYNATRACE_LIVE_URL="$DT_TENANT_ID.live.dynatrace.com"
  export DYNATRACE_APPS_URL="$DT_TENANT_ID.apps.dynatrace.com"
else
  export DYNATRACE_LIVE_URL="$DT_TENANT_ID.$ENVIRONMENT.dynatracelabs.com"
  export DYNATRACE_APPS_URL="$DT_TENANT_ID.$ENVIRONMENT.apps.dynatracelabs.com"
fi

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
kubectl -n dynatrace create secret generic dynakube --from-literal="apiToken=$DTOPERATORTOKEN" --from-literal="dataIngestToken=$DTTOKEN"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s,TENANTURL_TOREPLACE,$DYNATRACE_LIVE_URL," codespace/dynatrace/dynakube.yaml
    sed -i '' "s,CLUSTER_NAME_TO_REPLACE,$CLUSTERNAME," codespace/dynatrace/dynakube.yaml
else
    # Linux
    sed -i "s,TENANTURL_TOREPLACE,$DYNATRACE_LIVE_URL," codespace/dynatrace/dynakube.yaml
    sed -i "s,CLUSTER_NAME_TO_REPLACE,$CLUSTERNAME," codespace/dynatrace/dynakube.yaml
fi

### Update the ip of the ip adress for the ingres
#TODO to update this part to create the various Gateway rules

#Deploy collector
kubectl create secret generic dynatrace  --from-literal=dynatrace_oltp_url="https://$DYNATRACE_LIVE_URL" --from-literal=clustername="$CLUSTERNAME"  --from-literal=clusterid=$CLUSTERID  --from-literal=dt_api_token="$DTTOKEN"
kubectl label namespace  default oneagent=false
kubectl apply -f codespace/opentelemetry/rbac.yaml
kubectl apply -f codespace/opentelemetry/openTelemetry-manifest_ds.yaml
kubectl apply -f codespace/opentelemetry/openTelemetry-manifest_statefulset.yaml



#deploy demo application
kubectl apply -f codespace/dynatrace/dynakube.yaml -n dynatrace
#Deploy otel-demop

sed -i '', "s,TENANTID_TOREPLACE,$DT_TENANT_ID," codespace/dynatrace/edge-connect.yaml
sed -i '', "s,SSO_URL_TO_REPLACE,$DYNATRACE_SSO_URL," codespace/dynatrace/edge-connect.yaml
sed -i '', "s,API_URL_TO_REPLACE,$DYNATRACE_APPS_URL," codespace/dynatrace/edge-connect.yaml
sed -i '', "s,URN_TO_REPLACE,$OAUTH_CLIENT_URN," codespace/dynatrace/edge-connect.yaml

kubectl --namespace dynatrace \
  create secret generic "edgeconnect-oauth" \
  --from-literal=oauth-client-id="$OAUTH_CLIENT_ID" \
  --from-literal=oauth-client-secret="$OAUTH_CLIENT_SECRET"

helm repo add openfeature https://open-feature.github.io/open-feature-operator
helm repo update

helm install open-feature-operator openfeature/open-feature-operator \
  --namespace open-feature-system \
  --create-namespace \
  --wait

helm install vegas-casino ./helm/vegas-casino \
   --set global.codespace=true

HTTP_IDX=$(kubectl get svc vegas-casino-gateway  -n vegas-casino -o json |  jq -r '.spec.ports | to_entries | .[] | select(.value.name == "listener-80") | .key')
PATCH_OPS="[{\"op\": \"replace\", \"path\": \"/spec/ports/${HTTP_IDX}/nodePort\", \"value\": 30080}]"
kubectl patch svc vegas-casino-gateway  -n vegas-casino  --type='json'  -p="${PATCH_OPS}"
