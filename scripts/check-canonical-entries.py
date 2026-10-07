#!/usr/bin/env python3
"""Read-only CDN redirect acceptance. Uses curl's default TLS verification."""
import argparse
import concurrent.futures
import json
import pathlib
import subprocess
import tempfile
import urllib.parse

ORIGIN = 'https://yachiyo.hk'
ENTRIES = ('http://yachiyo.hk', 'http://www.yachiyo.hk', 'https://www.yachiyo.hk')
PATHS = (
    '/', '/hub', '/login?redirect=%2Fhub%3Fx%3D1',
    '/articles/258/%E5%82%BB%E7%93%9C%E4%B9%9F%E8%83%BD%E7%9C%8B%E6%87%82%E7%9A%84%E6%9C%88%E8%AF%BB%E7%A9%BA%E9%97%B4%E9%9B%B6%E5%9F%BA%E7%A1%80%E4%BD%BF%E7%94%A8%E6%95%99%E7%A8%8B?from=%2Fstage',
    '/hub?tag=a&tag=b&next=https%3A%2F%2Fexample.com%2F&empty=',
    '//example.com/hub?redirect=%2Fhub',
    '/sitemap.xml', '/rss.xml',
)


def probe(url, method='HEAD', resolve=None):
    with tempfile.TemporaryDirectory() as directory:
        header_path = pathlib.Path(directory) / 'headers'
        command = ['curl', '--silent', '--show-error', '--path-as-is',
                   '--connect-timeout', '10', '--max-time', '20',
                   '--dump-header', str(header_path), '--output', '/dev/null',
                   '--write-out', '%{http_code}', '--request', method]
        if method == 'HEAD':
            command.append('--head')
        if resolve:
            hostname = urllib.parse.urlsplit(url).hostname
            port = 443 if url.startswith('https:') else 80
            command += ['--resolve', f'{hostname}:{port}:{resolve}']
        result = subprocess.run(command + [url], capture_output=True, text=True)
        # Never retain cookies, response bodies, or unfiltered headers.
        location = None
        if header_path.exists():
            for line in header_path.read_text(errors='replace').splitlines():
                if line.lower().startswith('location:'):
                    location = line.split(':', 1)[1].strip()
        return {'url': url, 'method': method, 'status': int(result.stdout or 0),
                'location': location, 'curl_exit': result.returncode}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    domains = parser.add_mutually_exclusive_group()
    domains.add_argument('--www-only', action='store_true')
    domains.add_argument('--apex-only', action='store_true')
    parser.add_argument('--resolve', help='Staging IP for the selected domain')
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    if args.resolve and not (args.www_only or args.apex_only):
        parser.error('--resolve requires --www-only or --apex-only')
    entries = ENTRIES[1:] if args.www_only else (ENTRIES[:1] if args.apex_only else ENTRIES)
    jobs = [(entry + path, 'HEAD') for entry in entries for path in PATHS]
    jobs += [(entry + '/login?redirect=%2Fhub', 'GET') for entry in entries]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(lambda job: probe(*job, resolve=args.resolve), jobs))
    for row in rows:
        parsed = urllib.parse.urlsplit(row['url'])
        expected = ORIGIN + parsed.path + ('?' + parsed.query if parsed.query else '')
        row['expected'] = expected
        row['pass'] = row['curl_exit'] == 0 and row['status'] == 308 and row['location'] == expected
    if not args.resolve or args.apex_only:
        # Canonical URLs must not loop back through a second entry redirect.
        for path in ('/', '/hub', '/sitemap.xml', '/rss.xml', '/api/health'):
            row = probe(ORIGIN + path, resolve=args.resolve)
            row['pass'] = row['curl_exit'] == 0 and row['status'] == 200 and not row['location']
            rows.append(row)
    report = {'passed': sum(row['pass'] for row in rows), 'total': len(rows), 'results': rows}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['passed'] == report['total'] else 1)


if __name__ == '__main__':
    main()
