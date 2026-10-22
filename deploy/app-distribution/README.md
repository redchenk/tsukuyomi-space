# Application distribution

`https://downloads.yachiyo.hk` is served by the isolated distribution site on `39.105.82.189`. GitHub remains the public release archive. Websites and App 0.6.27+ read `/releases.json` and download from `/releases/<tag>/<filename>`.

The App repository's `Distribute published installers` workflow runs after standard and HarmonyOS publication, or a manual release/dispatch. It downloads the newest complete release, validates file sizes and GitHub SHA-256 digests, then streams a bounded archive through SSH. The receiver independently reads GitHub's public metadata, checks every filename, size, digest and both checksum manifests, then atomically changes `current`. A complete HarmonyOS supplement is sent by the second workflow run. Failed or incomplete transfers leave the previous complete version active. After activation, previous owned generations and incoming staging are removed, leaving only the latest installers. A 5 GiB free-space reserve protects existing projects.

The CI credential belongs only to `tsukuyomi-download`. Its root-owned authorized key uses `restrict` and one forced receiver command: no interactive commands, PTY, port forwarding or agent forwarding. The receiver is limited to 256 MiB address space, 600 CPU seconds and 45 minutes per invocation, with lower CPU priority. The account password stays locked. GitHub stores the generated private key as `APP_DISTRIBUTION_SSH_KEY` and the already verified host key as `APP_DISTRIBUTION_KNOWN_HOSTS`; neither enters source control. The receiver cannot choose paths outside its owned distribution directory. There is no root password in CI. A pull service is available for manual diagnosis but its timer is disabled because this host's cross-border downloads are too slow.

## Dedicated resources

- Account: `tsukuyomi-download`, locked password and a root-owned home containing only the forced-command public key.
- Code and certificate account: `/opt/tsukuyomi-app-distribution`.
- Packages: `/opt/1panel/www/sites/tsukuyomi-app-distribution`.
- ACME webroot and Nginx certificate copy: sibling directories ending in `-acme` and `-ssl`.
- Vhost: `/opt/1panel/www/conf.d/downloads.yachiyo.hk.conf`.
- Units: `tsukuyomi-app-distribution.{service,timer}` and `tsukuyomi-downloads-certificate.{service,timer}`.

Existing site files, certificates, FRP configuration and container lifetimes must remain unchanged. Only the existing OpenResty process is gracefully reloaded after checking its configuration. The certificate job uses the already installed, digest-pinned Certbot image, separate ACME state and a dedicated renewal timer. `sitecustomize.py` caps TCP segments only inside the dedicated receiver, pull and certificate Python processes to accommodate this host's Internet path; it does not change host routing, DNS, firewall or other applications. Certbot uses host networking to avoid the existing Docker bridge's outbound timeout. TLS verification stays enabled.

## Initial installation

First inspect the host, snapshot existing project/configuration hashes and container states, verify DNS, and confirm the new paths and account are absent. Copy this directory's scripts, vhost and unit files into `/tmp/tsukuyomi-app-distribution-install`, wait for the upload to finish, then run `bash /tmp/tsukuyomi-app-distribution-install/install.sh`. This installer targets the inspected 1Panel layout and `1Panel-openresty-ggdy`; adapt it only after inspecting another host. It refuses to overwrite its destination paths. Generate one dedicated Ed25519 CI key, then run `bash configure-push.sh <public-key-file>`; store its private half and verified SSH host keys in the two App repository secrets above. Never reuse a root or personal SSH key. If interrupted, inspect completed steps before resuming; do not blindly rerun or remove existing files.

## Verification and operations

- Run `python3 -m unittest discover -s deploy/app-distribution -p 'test_*.py'` locally.
- Inspect `journalctl -u tsukuyomi-app-distribution.service` and the certificate timer. The pull timer must stay disabled in push mode.
- Trigger delivery by manually dispatching `Distribute published installers` in the App repository. The receiver prints the activated tag and verified file count to its workflow log.
- Verify every public installer against its release digest, HTTP Range downloads, HTTPS, the catalog, and removal of the prior version after a successful switch.
- Compare protected file hashes and original container IDs/start times after deployment.
- The distribution root's ownership markers bound all cleanup. Never point it at an existing project, follow arbitrary symlinks, or delete a folder without its expected marker.
- Since old installers are removed, a previously opened page or stale client selection may need a fresh update check. The sites display a stale state on metadata failures; historical installers remain available from GitHub.
