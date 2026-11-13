# Deploying the demo

The public demo is available at [ldforge.nl](https://ldforge.nl/). The site is a static multi-page Vite build: no Node server, database or backend is required at runtime. The optional chart renderer loads its pinned external library only when activated. Browser requests to SPARQL endpoints still require endpoint CORS support.

## Deployment model

1. Build one generic container image from the intended source commit.
2. Push it to your registry under an immutable tag or digest.
3. Keep domain, ingress, TLS and analytics settings in your own private GitOps repository.
4. Let Argo CD combine this repository's generic Helm chart with those private values.
5. Promote or roll back by committing an image tag/digest change to the private values.

The public image and chart do not enable tracking. Analytics is injected into the served HTML at container startup, so one image works for different installations without embedding an operator's tracking ID in the source or build artifacts.

| Path                                     | Purpose                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Dockerfile`                             | Node build stage followed by a static unprivileged Nginx runtime.                                |
| `deploy/container/`                      | Nginx configuration and runtime analytics injection.                                             |
| `deploy/helm/ldforge-demo/`              | Generic Kubernetes Deployment, Service and optional Ingress.                                     |
| `deploy/values.example.yaml`             | Public operator-values example with placeholders and analytics disabled.                         |
| `deploy/argocd/application.example.yaml` | Argo CD multi-source Application template.                                                       |
| `.local/deploy/`                         | Gitignored installation settings and local rendered manifests. Also excluded from Docker builds. |

## Run and test the container locally

Requires Docker for image/runtime checks and Helm 3+ for manifest checks. Node/npm is only needed for running the repository helper scripts outside Docker; the Docker build supplies its own Node toolchain.

```sh
npm run deploy:check
npm run deploy:image:build
npm run deploy:test
```

The smoke test starts temporary local containers, verifies all four pages, health checks, cache rules, a non-root/read-only runtime and optional analytics, then removes the containers. It uses a dummy analytics URL and never sends events to a real analytics service. To test an existing local image:

```sh
node scripts/test-deployment.mjs your-image:tag
```

Run manually:

```sh
docker run --rm --read-only \
  --tmpfs /tmp:uid=101,gid=101,mode=1777 \
  --cap-drop=ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:8080:8080 ldforge-demo:local
```

Open `http://127.0.0.1:8080/`, `/guide.html`, `/api.html` and `/plugins.html`. `/healthz` returns `ok`. Missing pages return HTTP 404, not the main page: no SPA rewrite is needed. HTML uses `no-cache`; Vite's hashed `/assets/` files use long immutable caching. The runtime writes only to `/tmp`, including the served copy of the build and Nginx temporary files. The built image files remain unchanged.

## Build and publish an image

First commit and review the source and run the project's normal checks. Use a tag tied to the source commit, or deploy a registry digest. Do not reuse a mutable `latest` tag for GitOps rollouts.

```sh
LDFORGE_IMAGE="ghcr.io/YOUR_ORG/ldforge-demo:$(git rev-parse --short=12 HEAD)"
docker build --tag "$LDFORGE_IMAGE" .
# Authenticate with your chosen registry before publishing.
docker push "$LDFORGE_IMAGE"
```

Build for your cluster's architecture. For a multi-platform registry image, use an appropriately configured Buildx builder:

```sh
docker buildx build --platform linux/amd64,linux/arm64 \
  --tag "$LDFORGE_IMAGE" --push .
```

The build supports `NODE_IMAGE` and `NGINX_IMAGE` arguments. Pin both to reviewed image digests for reproducible production builds. Their defaults use Node 24 Alpine and the stable unprivileged Nginx Alpine image. Only the final static Nginx stage is published; npm dependencies and Node are not in that runtime.

The reusable **Deploy website** workflow publishes an ARM64 image and promotes its exact digest through a private GitOps repository. It can run manually without an npm release, and the Release workflow calls it after successful npm publication when `WEBSITE_DEPLOY_ENABLED=true`. No branch/PR test workflow is added; application tests still run only for npm release tags. Ordinary local builds do not publish images or change the cluster.

## Configure a site

Copy the public example to an ignored local file:

```sh
mkdir -p .local/deploy
cp deploy/values.example.yaml .local/deploy/values.yaml
```

If an operator-specific file is already present, edit it instead of overwriting it. The local installation profile prepared in this workspace uses the demo domain and the requested tracking settings; those values are deliberately not committed.

Set:

- `image.repository` and an immutable `image.tag`, or `image.digest` (`sha256:...`), which takes precedence over the tag.
- `ingress.enabled`, `ingress.host`, and optionally `ingress.className`. An empty class uses the cluster's default ingress class.
- `ingress.tls.enabled` and an existing `ingress.tls.secretName`. TLS terminates at the ingress; the container serves HTTP on 8080.
- `imagePullSecrets` when your registry is private. Reference existing Kubernetes Secrets rather than placing registry credentials in values files.
- `resources`, `replicaCount` and `strategy` for your deployment needs.

The chart does not install an ingress controller, create DNS records, issue certificates or create registry credentials. Provide those through your cluster's existing infrastructure. If using cert-manager, configure the relevant ingress annotations and a valid issuer in your private values.

Render and review before syncing:

```sh
helm lint deploy/helm/ldforge-demo --strict --values .local/deploy/values.yaml
helm template ldforge deploy/helm/ldforge-demo \
  --namespace ldforge --values .local/deploy/values.yaml \
  > .local/deploy/rendered.yaml
```

The chart uses release-scoped names/selectors, runs as UID/GID 101, drops Linux capabilities, disables service-account token mounting, applies resource requests/limits and exposes readiness/liveness probes. `/tmp` is an ephemeral volume. Chart versioning describes the infrastructure templates; the site version is selected explicitly through the image tag/digest.

## Optional analytics

Set the following only in operator values, not the public defaults:

```yaml
analytics:
  enabled: true
  scriptUrl: https://analytics.example.org/script.js
  websiteId: your-website-id
```

The chart passes `LDFORGE_ANALYTICS_SCRIPT_URL` and `LDFORGE_ANALYTICS_WEBSITE_ID` to the container. Startup inserts this form immediately before `</head>` in each served HTML page:

```html
<script
  defer
  src="https://analytics.example.org/script.js"
  data-website-id="your-website-id"
></script>
```

With analytics disabled, there is no tracking script or analytics request. Partial configuration fails startup instead of silently using another installation's ID. Attribute values are HTML-escaped. Changing analytics values changes the pod template and restarts the container, regenerating the served HTML from the original static build. IDs are visible in the browser once enabled; treat credentials separately.

If you enforce a content security policy at the ingress, allow your chosen analytics script origin and its event-ingestion requests, plus the chart runtime's origin when using the default external chart loader. The generic Nginx configuration does not impose a site-specific CSP.

## Argo CD and private GitOps values

Argo CD cannot read files that exist only in your local, gitignored `.local/` directory. Use a separate **private Git repository** for installation values and the Application manifest. Keep the reusable chart in the public LDForge repository.

Example private repository layout:

```text
private-gitops/
  applications/ldforge.yaml
  environments/ldforge/values.yaml
```

Copy your local production values to `environments/ldforge/values.yaml`. Copy `deploy/argocd/application.example.yaml` (or the prepared `.local/deploy/application.yaml`) to `applications/ldforge.yaml`, then set:

1. The public chart source `targetRevision` to an actual LDForge Git commit containing the chart. Push that public source commit first; an unpushed local commit is not available to Argo CD.
2. The private GitOps repository URL and revision on the source using `ref: values`.
3. The Helm `valueFiles` path to `$values/environments/ldforge/values.yaml` (relative to the private repository root).
4. Your Argo CD namespace/project, Helm release name and destination namespace/cluster.

The private values source must not have a `path`: Argo CD uses it only for the referenced values. Configure Argo CD's read access to both repositories and allow them in the selected AppProject. The templates contain no repository authentication credentials. This uses Argo CD's supported [multi-source external Helm values](https://argo-cd.readthedocs.io/en/stable/user-guide/multiple_sources/) feature (Argo CD 2.6+).

After review, bootstrap the Application using your normal cluster access:

```sh
kubectl apply -f .local/deploy/application.yaml
argocd app diff ldforge
argocd app sync ldforge
```

Do this only after replacing the repository/revision placeholders and putting the values file in the actual private repository. The public template starts with manual synchronization and namespace creation. To opt into your organization's automatic GitOps policy, add this to the Application in the private repository:

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

Updating the private image tag/digest causes a new Deployment revision on sync. Pin the public chart commit separately so infrastructure changes are reviewed intentionally. Argo CD does not build or push the image: that happens before updating GitOps values.

## Rollout, caching and rollback

The generic default is one replica with `strategy.type: Recreate`. This causes a brief restart outage, but avoids routing requests between old and new images with different hashed JavaScript assets during a rolling update. The startup/readiness probe prevents traffic before the static files are ready.

A browser tab left open across a deployment may still request a lazy chunk from the previous version. Without old asset retention it can receive HTTP 404; refreshing the page loads the new HTML. For high availability and long-lived sessions, keep immutable assets from earlier releases on shared storage/CDN and use an appropriate rolling or blue/green strategy. Do not claim zero-downtime asset compatibility just by increasing replicas. The provided chart deliberately has no external storage or rollout-controller dependency.

For rollback, commit the previous known-good image tag/digest and, if needed, chart source revision in the private GitOps repository, then sync. Changing only live Kubernetes state will otherwise be overwritten by GitOps reconciliation. No database migrations or persistent application data need rollback; browser-local queries remain on the user's device.

## Hosting without containers

You can still run `npm ci && npm run build` and upload `apps/demo/dist/` to a static web host. Serve JavaScript/SVG with their correct content types, retain the four HTML entry points, and avoid a catch-all SPA rewrite. For analytics, inject your operator's snippet into each built HTML page during your private deployment step; do not put the tracking ID into the public HTML sources. The Docker startup mechanism is one concrete implementation of that step, not a Node runtime requirement.

## Automated website releases

Configure these GitHub Actions repository variables and the dedicated secret once:

| Name                              | Meaning                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `WEBSITE_DEPLOY_ENABLED`          | `true` enables website deployment after successful npm publication. Manual dispatch is available independently.                      |
| `WEBSITE_GITOPS_REPOSITORY`       | Private GitHub repository in `owner/name` form.                                                                                      |
| `WEBSITE_GITOPS_BRANCH`           | GitOps branch, default `main`.                                                                                                       |
| `WEBSITE_GITOPS_VALUES_FILE`      | Relative path to the private Helm values file.                                                                                       |
| `WEBSITE_GITOPS_APPLICATION_FILE` | Optional relative Application path; updates its matching public Helm source to the deployed commit atomically with the image values. |
| `WEBSITE_IMAGE`                   | GHCR image repository without a tag; default `ghcr.io/OWNER/REPOSITORY-demo`.                                                        |
| Secret `WEBSITE_GITOPS_SSH_KEY`   | Dedicated write-enabled SSH deploy key for the private GitOps repository. Never put it in source or values files.                    |

The workflow uses its `GITHUB_TOKEN` with `packages: write` to publish to GHCR. Give the Kubernetes namespace read access if the image is private. The private GitOps checkout is performed only in a separate promotion job, never in the image build context. No cluster credentials or Argo CD token are stored in the public application repository.

Both flows use the same workflow:

```sh
# Full package release from clean main: publish npm, then deploy the website.
npm version patch

# Website only, after committing and pushing source to main:
gh workflow run website.yml --ref main -f source_ref=main
```

Manual website builds do not run `npm version`, publish npm packages, or create release tags. `source_ref` can also select a main-branch commit or a release tag. Source must belong to main. Workflow definitions are dispatched from main. Concurrent deployments are serialized. Image tags include the source commit and run/attempt IDs; deployment values pin the resulting immutable digest. Failed builds never update GitOps.

Promotion preserves operator fields such as analytics, hostname, TLS and pull secrets. It changes only image metadata and, when configured, the matching chart revision. It refuses accidental deployment of an older/divergent commit and never force-pushes GitOps. For an intentional rollback, dispatch the website workflow with the historical `source_ref` and `allow_rollback=true`. Argo CD must have automatic sync enabled on the actual site Application for automatic rollout; the public bootstrap template intentionally leaves that policy to its operator.

If npm publication succeeds but website deployment fails, the npm release remains published. Correct the deployment failure and rerun the website workflow; do not bump npm solely to retry the website.
