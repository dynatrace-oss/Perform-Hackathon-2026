#!/usr/bin/env bash

################################################################################
### Script deploying the Observ-K8s environment
### Parameters:
### Clustern name: name of your k8s cluster
### dttoken: Dynatrace api token with ingest metrics and otlp ingest scope
### dturl : url of your DT tenant wihtout any / at the end for example: https://dedede.live.dynatrace.com
################################################################################
WORKDIR="/workspaces/Vegas-App"

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



helm install vegas-casino $WORKDIR/helm/vegas-casino \
   --set global.codespace=true \
   --namespace vegas-casino

HTTP_IDX=$(kubectl get svc vegas-casino-gateway  -n vegas-casino -o json |  jq -r '.spec.ports | to_entries | .[] | select(.value.name == "listener-80") | .key')
PATCH_OPS="[{\"op\": \"replace\", \"path\": \"/spec/ports/${HTTP_IDX}/nodePort\", \"value\": 30080}]"
kubectl patch svc vegas-casino-gateway  -n vegas-casino  --type='json'  -p="${PATCH_OPS}"
