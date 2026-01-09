{{/*
Expand the name of the chart.
*/}}
{{- define "vegas-casino.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "vegas-casino.fullname" -}}
{{- if .Values.nameOverride }}
{{- .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "vegas-casino.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "vegas-casino.labels" -}}
helm.sh/chart: {{ include "vegas-casino.chart" . }}
{{ include "vegas-casino.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "vegas-casino.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vegas-casino.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "vegas-casino.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- if .Values.serviceAccount.name }}
{{- .Values.serviceAccount.name }}
{{- else }}
{{- include "vegas-casino.fullname" . }}
{{- end }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Build OTEL_RESOURCE_ATTRIBUTES string
*/}}
{{- define "vegas-casino.resourceAttributes" -}}
service.name={{ .serviceName }},service.version={{ .serviceVersion }},service.namespace={{ .Values.global.namespace }},deployment.environment={{ .Values.opentelemetry.resourceAttributes.deployment.environment }},k8s.cluster.name={{ .Values.opentelemetry.resourceAttributes.k8s.cluster.name }}{{ if .gameAttributes }},{{ .gameAttributes }}{{ end }}
{{- end }}

{{/*
Get image repository for a service
*/}}
{{- define "vegas-casino.imageRepository" -}}
{{- if .service.image.repository }}
{{- .service.image.repository }}
{{- else }}
{{- printf "%s-%s" $.Values.global.imageRegistry .service.name }}
{{- end }}
{{- end }}

{{/*
Get image tag for a service
*/}}
{{- define "vegas-casino.imageTag" -}}
{{- if .service.image.tag }}
{{- .service.image.tag }}
{{- else }}
{{- $.Values.global.imageTag }}
{{- end }}
{{- end }}

{{/*
Get full image reference for a service
*/}}
{{- define "vegas-casino.image" -}}
{{- $repository := include "vegas-casino.imageRepository" . }}
{{- $tag := include "vegas-casino.imageTag" . }}
{{- printf "%s:%s" $repository $tag }}
{{- end }}

