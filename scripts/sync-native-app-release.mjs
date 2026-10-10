import { writeFile } from 'node:fs/promises';
import { compareAppReleases, loadAppReleases } from '../src/frontend/services/nativeAppRelease.mjs';

// Refresh the small offline fallback only. Installers remain on GitHub.
const { catalog } = await loadAppReleases({ force: true });
const release = [catalog.stable, catalog.preview].filter(Boolean).sort((a, b) => compareAppReleases(b, a))[0];
const snapshot = {
  tag_name: release.tag, html_url: release.url, published_at: release.publishedAt,
  prerelease: release.preview, draft: false,
  assets: Object.values(release.assets).map(asset => ({
    name: asset.name, browser_download_url: asset.href, size: asset.size, state: 'uploaded',
    digest: asset.sha256 ? `sha256:${asset.sha256}` : null
  }))
};
await writeFile(new URL('../shared/native-app-release.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Verified fallback updated: ${release.tag} (${snapshot.assets.length} GitHub links)`);
