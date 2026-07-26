# Contributing

## Build

```bash
npm install
npm run build
```

## Lint

```bash
npm run lint       # check
npm run lintfix    # auto-fix
```

## Run locally against a DocupletionForms backend (Docker)

There is no bundled `docker-compose.yml` for this package. To run against a DocupletionForms backend instance (internal contributors: see the backend repo for how to run one locally):

1. Build: `npm install && npm run build`
2. Run n8n on the same Docker network as the backend, with this package's `dist/` mounted as a custom extension:
   ```bash
   docker run -d --name n8n-dev \
     --network <backend-compose-project>_default \
     -p 5678:5678 \
     -e N8N_CUSTOM_EXTENSIONS=/custom \
     -v $(pwd)/dist:/custom:ro \
     n8nio/n8n:latest
   ```
3. Open http://localhost:5678, complete the one-time owner setup, and confirm **DocupletionForms**, **DocupletionForms Trigger**, and **DocupletionForms Tool** appear in the node list.
4. Point the credential's **Base URL** at the backend's in-network address (its Docker container name, not `localhost`), since n8n is reaching it over the Docker network.
5. For **webhook trigger** testing, DocupletionForms must be able to POST to your n8n instance. If n8n runs only on localhost, use a tunnel (e.g. [ngrok](https://ngrok.com)) and set `WEBHOOK_URL`/`N8N_HOST` so the registered webhook URL is the public tunnel URL.
6. After code changes: `npm run build`, then `docker restart n8n-dev` (custom extensions are loaded at startup, not hot-reloaded).

## Releasing

The first-ever publish has to be done manually from a local machine (`npm login`, then `npm publish --access public`) — npm's Trusted Publisher can only be configured for a package that already exists on the registry.

After that, releases are tag-triggered:

```bash
npm version patch   # or minor / major
git push --tags
```

Pushing a tag matching `*.*.*` triggers [`.github/workflows/publish.yml`](.github/workflows/publish.yml), which builds, lints, and publishes to npm with a provenance attestation. See that file's header comment for the one-time npm Trusted Publisher setup.

Before submitting a new version for [n8n Creator Portal verification](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/#submit-your-node-for-verification-by-n8n), run:

```bash
npx @n8n/scan-community-package n8n-nodes-docupletionforms
```
