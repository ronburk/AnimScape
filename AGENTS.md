# Agent instructions

- The repository is public. For a fresh checkout, run `git clone https://github.com/ronburk/AnimScape.git`. No GitHub credentials or special reconstruction procedure is needed.
- To update an existing clean checkout of `main`, run `git pull --ff-only`.
- Use the GitHub connector for remote writes, including branches, commits, pull requests, and merges. Local Git commands are available for checkout and inspection.

## Build setup

- The build requires `xsltproc` on PATH and a working `./blud` executable in the repository root.
- If `xsltproc` is missing in the current runtime, install it. Refresh APT's package lists first; otherwise installation can fail with "Unable to locate package xsltproc". These commands also handle the cloud environment's APT sandbox/cache problems:

  ```sh
  mkdir -p /tmp/apt-archives/partial
  apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/apt-archives update
  apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/apt-archives install -y xsltproc
  ```

- The `blud` executable is not included in this repository. Reuse an existing working executable for the current platform by copying it into the checkout as `./blud`; keep it out of commits. For the cloud build on 2026-09-10, it was copied from `/workspace/scratch/71285664f620/AnimScape/blud`. That is a session-specific scratch path, not a permanent dependency. If no executable is available, obtain/build one from `ronburk/blud` using that repository's build instructions.
- From the AnimScape repository root, run `./blud`. It runs `xsltproc --xinclude build.xslt mainhtml.xml > AnimScape.html`. The generated standalone page is intentionally ignored by Git.
- A successful build is sufficient for this setup step; browser testing is a separate step described below.

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
