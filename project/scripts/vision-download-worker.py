"""Bounded HTTPS range downloader for official immutable vision artifacts; no inference."""
import concurrent.futures, hashlib, json, os, pathlib, sys, time, urllib.request

artifact = json.load(sys.stdin)
target = pathlib.Path(artifact['destination']).resolve()
allowed = (pathlib.Path(__file__).resolve().parent.parent / 'runtime' / 'models' / 'vision').resolve()
if target.parent != allowed or not artifact['url'].startswith('https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/1cd86afb9a95c410a6038ab3b40d8b578c892266/'):
    raise ValueError('Unexpected artifact target or source')
total = artifact['bytes']
step = 64 * 1024 * 1024
ranges = [(start, min(start + step - 1, total - 1)) for start in range(0, total, step)]

def fetch(span):
    start, end = span
    part = pathlib.Path(str(target) + f'.range-{start}-{end}')
    if part.exists() and part.stat().st_size == end - start + 1:
        return end - start + 1
    for attempt in range(3):
        try:
            request = urllib.request.Request(artifact['url'], headers={'Range': f'bytes={start}-{end}'})
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{total}':
                    raise ValueError('Unexpected HTTP range response')
                temporary = pathlib.Path(str(part) + '.part')
                with temporary.open('wb') as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
            if temporary.stat().st_size != end - start + 1:
                raise ValueError('Incomplete range')
            os.replace(temporary, part)
            return end - start + 1
        except Exception:
            if attempt == 2:
                raise

done = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for future in concurrent.futures.as_completed([pool.submit(fetch, span) for span in ranges]):
        done += future.result()
        print(f'{target.name}: {done // 1048576}/{total // 1048576} MiB', flush=True)
temporary = pathlib.Path(str(target) + '.assembled')
digest = hashlib.sha256()
with temporary.open('wb') as output:
    for start, end in ranges:
        with pathlib.Path(str(target) + f'.range-{start}-{end}').open('rb') as part:
            while chunk := part.read(2 * 1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
if temporary.stat().st_size != total or digest.hexdigest() != artifact['sha256']:
    raise ValueError('Artifact SHA-256 mismatch')
os.replace(temporary, target)
for start, end in ranges:
    pathlib.Path(str(target) + f'.range-{start}-{end}').unlink()
print(f'VERIFIED {target.name} SHA256 {artifact["sha256"]}', flush=True)
