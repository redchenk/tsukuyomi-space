import { writeFile } from 'node:fs/promises';
import { fetchDistributedAppReleases, appReleaseSnapshot } from '../src/frontend/services/nativeAppRelease.mjs';

// Refresh the small offline fallback only. Installers are served from the dedicated distribution server.
const catalog = await fetchDistributedAppReleases();
const release = catalog.latest;
const snapshot = appReleaseSnapshot(release);
await writeFile(new URL('../shared/native-app-release.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Verified fallback updated: ${release.tag} (${snapshot.assets.length} distribution links)`);
