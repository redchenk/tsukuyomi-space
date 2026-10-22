# Application distribution

`https://downloads.yachiyo.hk` is served by the isolated distribution site on `39.105.82.189`. GitHub remains the public release archive. Websites and App 0.6.27+ read `/releases.json` and download from `/releases/<tag>/<filename>`.

The unprivileged systemd job polls the public repository every five minutes. It selects the newest complete published release, downloads through GitHub's official asset API, validates sizes, GitHub SHA-256 digests and both checksum manifests, then atomically changes `current`. A complete HarmonyOS supplement is picked up on the next check. Incomplete or failed downloads leave the previous complete release active. After activation, previous owned generations are deleted, leaving only the latest installers. At least 5 GiB remains free beyond the new download's declared size. There are no server passwords, GitHub tokens or CI SSH keys in this service.

## Dedicated resources

- Account: `tsukuyomi-download`, without a login shell or home.
- Code and certificate account: `/opt/tsukuyomi-app-distribution`.
- Packages: `/opt/1panel/www/sites/tsukuyomi-app-distribution`.
- ACME webroot and Nginx certificate copy: sibling directories ending in `-acme` and `-ssl`.
- Vhost: `/opt/1panel/www/conf.d/downloads.yachiyo.hk.conf`.
- Units: `tsukuyomi-app-distribution.{service,timer}` and `tsukuyomi-downloads-certificate.{service,timer}`.

Existing site files, certificates, FRP configuration and container lifetimes must remain unchanged. Only the existing OpenResty process is gracefully reloaded after checking its configuration. The certificate job uses the already installed, digest-pinned Certbot image, separate ACME state and a dedicated renewal timer. `sitecustomize.py` caps TCP segments only inside these Python processes to accommodate this host's Internet path; it does not change host routing, DNS, firewall or other applications. Certbot uses host networking to avoid the existing Docker bridge's outbound timeout. TLS verification stays enabled.

## Initial installation

First inspect the host, snapshot existing project/configuration hashes and container states, verify DNS, and confirm the new paths and account are absent. Copy this directory's scripts, vhost and unit files into `/tmp/tsukuyomi-app-distribution-install`, wait for the upload to finish, then run `bash /tmp/tsukuyomi-app-distribution-install/install.sh`. This installer targets the inspected 1Panel layout and `1Panel-openresty-ggdy`; adapt it only after inspecting another host. It refuses to overwrite its destination paths. If interrupted, inspect completed steps before resuming; do not blindly rerun or remove existing files.

## Verification and operations

- Run `python3 -m unittest discover -s deploy/app-distribution -p 'test_*.py'` locally.
- Inspect `journalctl -u tsukuyomi-app-distribution.service` and both dedicated timers.
- Trigger a check with `systemctl start tsukuyomi-app-distribution.service`.
- Verify every public installer against its release digest, HTTP Range downloads, HTTPS, the catalog, and removal of the prior version after a successful switch.
- Compare protected file hashes and original container IDs/start times after deployment.
- The distribution root's ownership markers bound all cleanup. Never point it at an existing project, follow arbitrary symlinks, or delete a folder without its expected marker.
- Since old installers are removed, a previously opened page or stale client selection may need a fresh update check. The sites display a stale state on metadata failures; historical installers remain available from GitHub.
