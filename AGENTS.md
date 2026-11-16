# Development server

Keep the LDForge demo development server running throughout development and after
finishing a task, unless the user explicitly asks to stop it.

- Use `http://127.0.0.1:4173/` as the persistent preview URL.
- Before starting a server, check whether that URL already serves LDForge and reuse
  it when available.
- If needed, start `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` from
  the repository root in a persistent background process. Keep its output in a log
  outside the repository, such as `/tmp/ldforge-dev-server.log`.
- Do not rely on Playwright's temporary web server for the user's preview. Keep
  the persistent server running so Playwright can reuse it without stopping it.
- After checks or builds, verify that the preview still responds; restart it if
  necessary. Do not stop unrelated processes or other development servers.
