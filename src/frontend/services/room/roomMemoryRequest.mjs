// Long Chinese messages and replay scopes can exceed an intermediary's URI
// limit. All memory reads share a short URL and carry search data in JSON.
export function memorySearchOptions(params, signal) {
    return {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(Object.fromEntries(params)),
        ...(signal ? { signal } : {})
    };
}
