# Agent instructions

- Use the GitHub connector for all AnimScape repository operations.
- Do not assume that a local shell clone or GitHub CLI credentials are available.
- If installing a Debian/Ubuntu package fails because APT cannot use its sandbox or cache, try:
  `mkdir -p /tmp/apt-archives/partial && apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/apt-archives install -y PACKAGE`

## Browser testing

- Build the standalone page first with `./blud`; the generated `AnimScape.html` is intentionally ignored.
- The cloud browser rejects local `file://` URLs, including files under its shared `/home/oai/share` directory. It also rejects loopback URLs such as `http://127.0.0.1:8765/`.
- For actual browser rendering and DOM inspection, use the supported supervised preview service. Read the control-browser skill and the Sites environment instructions before doing this.
- `sites-preview` requires a `package.json` with a `dev` script and serves through the internal URL `http://terminal.local:4173/`. Navigate only to that URL; do not try alternate hosts or ports.
- This project is a plain static XML/XSLT build, so use an untracked, test-only Node HTTP adapter when browser testing is needed. The adapter should serve only the generated `AnimScape.html`, accept the forwarded `--host`, `--port`, and `--strictPort` arguments, and return 404 for other paths. Do not add the adapter or `package.json` to the project unless explicitly requested.
- Start with `sites-preview start "$PWD"`, inspect the page in the cloud browser, then run `sites-preview stop`. A successful basic check should verify the title, visible status text, DOM state, console errors, and a screenshot when visual inspection is requested.
- Ignore unrelated console errors originating from the browser-control extension itself; distinguish them from errors whose URL is the AnimScape page.
