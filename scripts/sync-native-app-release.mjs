import { writeFile } from 'node:fs/promises';
import { fetchGitHubAppReleases, appReleaseSnapshot } from '../src/frontend/services/nativeAppRelease.mjs';

// Refresh the small offline fallback only. Installers remain on GitHub.
const catalog = await fetchGitHubAppReleases();
const release = catalog.latest;
const snapshot = appReleaseSnapshot(release);
await writeFile(new URL('../shared/native-app-release.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Verified fallback updated: ${release.tag} (${snapshot.assets.length} GitHub links)`);
