{{- define "ldforge-demo.name" -}}
{{- printf "%s-site" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "ldforge-demo.labels" -}}
app.kubernetes.io/name: ldforge-demo
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
{{- end -}}
