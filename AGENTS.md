# Agent instructions

- Use the GitHub connector for all AnimScape repository operations.
- A simple `git clone` of the public repository is sufficient to obtain an up-to-date checkout; no special reconstruction or synchronization procedure is needed.
- Do not assume that a local shell clone or GitHub CLI credentials are available.
- If installing a Debian/Ubuntu package fails because APT cannot use its sandbox or cache, try:
  `mkdir -p /tmp/apt-archives/partial && apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/apt-archives install -y PACKAGE`

## Browser testing

- Build the standalone page first with `./blud`; the generated `AnimScape.html` is intentionally ignored.
- The cloud browser rejects local `file://` URLs, including files under its shared `/home/oai/share` directory. It also rejects loopback URLs such as `http://127.0.0.1:8765/`.
- For actual browser rendering and DOM inspection, use the supported supervised preview service. Read the control-browser skill and the Sites environment instructions before doing this.
- `sites-preview` requires a `package.json` with a `dev` script and serves through the internal URL `http://terminal.local:4173/`. Navigate only to that URL; do not try alternate hosts or ports.
- This project is a plain static XML/XSLT build, so use an untracked, test-only Node HTTP adapter when browser testing is needed. The adapter should serve only the generated `AnimScape.html`, accept the forwarded `--host`, `--port`, and `--strictPort` arguments, and return 404 for other paths. Do not add the adapter or `package.json` to the project unless explicitly requested.
- Start with `sites-preview start "\$PWD"`, inspect the page in the cloud browser, then run `sites-preview stop`. A successful basic check should verify the title, visible status text, DOM state, console errors, and a screenshot when visual inspection is requested.
- Ignore unrelated console errors originating from the browser-control extension itself; distinguish them from errors whose URL is the AnimScape page.

### Testing file I/O without the native picker

- The production `fileio.js` and the test adapter should implement the same narrow interface: `file_io.open_svg()` and `file_io.save_svg(document, text)`.
- For automated browser testing, use an untracked preview-only adapter that replaces `window.file_io`. Its `open_svg()` uses an upload file input, and its `save_svg()` captures the exact SVG string (and may expose a download link).
- This exercises the real UI, `svg.js`, SVG parsing, rendering, keyframe creation, serialization, and reopen/save round trips. It does not test Chromium's native directory picker, filesystem permissions, actual disk writes, or persistence of native directory handles in IndexedDB.
- Keep the adapter out of the production XSLT build and repository unless explicitly requested. Use the shared browser-facing file path under `/workspace/scratch` (mapped to `/home/oai/share`) when supplying files to the cloud browser.
- When a test reveals an application defect, report it separately from adapter limitations. In particular, duplicated SVG objects currently retain their original SVG `id` values and do not automatically receive AnimScape object identity attributes; do not mistake that for a file-I/O failure.

### Response formatting

- Complete raw `<svg>` examples in assistant responses may be interpreted by the interface as visual SVG artifacts and render blank or misleading previews.
- For SVG schema examples, prefer escaped XML, short fragments, or clearly marked `xml` code blocks; do not rely on the rendered SVG preview as evidence about the code.
