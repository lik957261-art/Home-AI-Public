# Security Policy

## Supported Versions

Security updates are provided for the latest released version of Hermes Mobile.
Public releases start at `v1.0.0`.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting when it is available for the public
repository. If private reporting is unavailable, open a GitHub issue that
describes the affected component without posting raw secrets, access keys,
tokens, private URLs, push endpoints, or user data.

Include:

- the Hermes Mobile version or commit
- the deployment mode, such as single Gateway or Gateway Pool
- the affected route, script, or adapter
- reproduction steps with placeholder credentials
- the security impact you believe is possible

## Deployment Guidance

- Keep Hermes Mobile behind localhost, a private network, or a trusted HTTPS
  reverse proxy.
- Use file-backed secrets or a deployment secret manager for Owner keys,
  Gateway API keys, Web Push VAPID keys, and ingress keys.
- Do not commit `workspace/`, logs, uploads, generated reports, databases,
  Access Key stores, VAPID private keys, push endpoints, OAuth tokens, or
  `.env` files containing real values.
- Use the low-privilege Gateway and protected-path settings for ordinary user
  workspaces. Owner-maintenance workers should be explicit and separate.
