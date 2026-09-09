# Agent instructions

- Use the GitHub connector for all AnimScape repository operations.
- Do not assume that a local shell clone or GitHub CLI credentials are available.
- If installing a Debian/Ubuntu package fails because APT cannot use its sandbox or cache, try:
  `mkdir -p /tmp/apt-archives/partial && apt-get -o APT::Sandbox::User=root -o Dir::Cache::archives=/tmp/apt-archives install -y PACKAGE`
