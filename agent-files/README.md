# Agent files

This directory contains versioned support files for automated development and
browser testing. They are not part of the production AnimScape page.

The preview adapter serves the generated `../AnimScape.html` file through the
supervised cloud-browser preview service. It uses only Node's built-in modules;
no package installation is required.

The platform-specific `blud` executable and any build runtime remain outside
the repository.
