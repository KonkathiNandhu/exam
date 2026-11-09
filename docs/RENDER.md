# Render deployment

Create a Node Web Service from this repository. Use:

- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`

The repository's `.npmrc` also includes development dependencies, so existing
services using `npm ci && npm run build` continue to work when
`NODE_ENV=production` is configured. TypeScript, Vite, and `@types/node` are build
requirements. A missing Node type definition (TS2688) indicates an incomplete
build dependency installation, not a missing application API key.

For remote access, configure these in Render's Environment settings:

```dotenv
NODE_ENV=production
PAIRING_MODE=cloud
LOCAL_PAIRING_PREVIEW=false
BIND_HOST=0.0.0.0
PUBLIC_APP_URL=https://YOUR-ACTUAL-SERVICE.onrender.com
AI_API_KEY=YOUR-SECRET-KEY
AI_BASE_URL=https://api.openai.com/v1
AI_VISION_MODEL=gpt-5.6-luna
AI_ANSWER_MODEL=gpt-5.6-luna
```

Replace the placeholders with the actual service origin and private key. Keep
the key only in the hosting service's secret environment settings. Do not set
PORT manually; the server reads Render's assigned PORT. Leave PUBLIC_API_URL
and PUBLIC_WS_URL unset to derive them from the app origin. Leave TLS_CERT and
TLS_KEY unset when Render terminates HTTPS.

PUBLIC_APP_URL may also be left unset on Render: when RENDER=true, the server
uses Render's automatically supplied RENDER_EXTERNAL_URL, validates it as an
HTTPS origin, and derives the API and WSS origins from it. An explicit
PUBLIC_APP_URL takes priority (use it for a custom domain). Render deployments
default to cloud mode and bind to 0.0.0.0 unless BIND_HOST is explicitly set.
Other hosting environments still require PUBLIC_APP_URL in cloud mode.

Use one instance while session state is stored in memory. Restarts and deploys
end existing sessions. Protect company use behind employee authentication.

After pushing this configuration, deploy the latest commit. If Render reused
an incomplete dependency installation, choose Clear build cache & deploy. This
repository change does not itself prove that a hosted deployment succeeded.
