# Source Switch

Mobile-friendly Dispatcharr plugin dashboard to view live, VOD, and catch-up connections, see connected clients, and force-swap a running channel to a different source, without touching the Dispatcharr admin UI.

Formerly published as "Force Fallback," renamed because the plugin doesn't do automatic failover: it's a dashboard for manually switching a channel's source.

## Support

This project is maintained in my spare time. If it's saved you some headaches, a tip is always appreciated.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/sethwv)

---

## Dashboard

A mobile-friendly PWA served under a configurable mount path (**Dashboard Mount Path** setting, default `/stats`). **Enabled by default**; disable it via the **Web Dashboard** setting if you don't want it running. Log in with your Dispatcharr credentials to:

- See active live, VOD, and catch-up connections, including live uptime, bitrate, and stream stats (resolution, codec, FPS).
- Switch a running channel's source live, without stopping playback for connected clients.
- View and disconnect individual connected clients per session, including each live client's delivery container and Output Profile.
- See catch-up programme details and an advancing archived-playback playhead.
- Stop individual VOD and catch-up viewers.
- Stop a channel's stream entirely.

Unlike `multiview`, the mount path here is runtime-configurable (not fixed at build time): the plugin injects the currently-configured path into the served page at request time, so the same build works no matter what path you set it to.

## Dispatcharr requirements

Source Switch requires Dispatcharr `v0.34.0` or newer. It uses manifest version 2 and requires approval for persistent service, network listener, proxy internals, and user data access. Restart Dispatcharr after approving the network-listener capability.

Dispatcharr elects one plugin process to own the dashboard listener. Use **Restart Dashboard Server** after changing the dashboard enabled setting or port. The action reloads Source Switch and the elected service applies the saved settings.

---

## Development

The dashboard SPA (`src/dash/ui/`) is React + Mantine, built with Vite. It shares its theme, header bar, login screen, confirm modal, and a few small utilities with the `multiview` plugin's dashboard via a separate package, `@swvn-dispatch/dispatch-ui-kit`; see [that package's README](https://github.com/swvn-dispatch/plugins/blob/main/ui-kit/README.md) for the full component list and local-testing instructions.

Quick start:

```bash
cd src/dash/ui
npm install   # needs a personal GitHub Packages PAT, see ui-kit README
npm run dev
```

Run `npm run dev:mock` to preview the dashboard with reusable live, movie,
series, and catch-up fixture data. The mock accepts any username and password
and does not require Dispatcharr to be running.

`./package.sh` (repo root) builds the dashboard and packages the full plugin zip; CI (`release.yml`, `dev-prerelease.yml`) does the same with registry auth wired in.
