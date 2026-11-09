#!/usr/bin/env python3
"""In-app web updates (no new APK): the app downloads a zip with the changed www/ files and restarts updated.

  python tools/web_update.py baseline
      Snapshot of www/ as it is inside the APK -> updates/baseline-<versionCode>.json
      (tools/build_apk.sh runs this after every APK build).

  python tools/web_update.py make --notes "what changed"
      1. WEB_BUILD in www/js/version.js +1
      2. zips every www/ file that differs from the APK baseline -> dist/www-<build>.zip
      3. writes manifest.json "web" { build, version, zip, sha256, size, minVersionCode, notes, date }
      Then publish:  gh release create web-<build> dist/www-<build>.zip ...  and push updates/manifest.json
      (the script prints the exact commands).

Only web files (js/css/data/audio/lib…) can be updated like this. Native changes (plugins, permissions, icon)
need a new APK: python tools/bump_version.py X.Y.Z, then tools/build_apk.sh.
"""
import datetime, hashlib, json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, 'www')
REPO = 'Solo-Player1/wortschatz-app'
VERSION_JS = os.path.join(WWW, 'js', 'version.js')
MANIFEST = os.path.join(ROOT, 'updates', 'manifest.json')


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def snapshot():
    out = {}
    for d, _, files in os.walk(WWW):
        for n in files:
            p = os.path.join(d, n)
            out[os.path.relpath(p, WWW).replace(os.sep, '/')] = sha(p)
    return out


def version_code():
    g = open(os.path.join(ROOT, 'android', 'app', 'build.gradle'), encoding='utf-8').read()
    return int(re.search(r'versionCode\s+(\d+)', g).group(1))


def baseline():
    code = version_code()
    p = os.path.join(ROOT, 'updates', f'baseline-{code}.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump({'versionCode': code, 'files': snapshot()}, open(p, 'w', encoding='utf-8'), indent=0, sort_keys=True)
    print(f'baseline for versionCode {code}: {p}')


def make(notes):
    code = version_code()
    bp = os.path.join(ROOT, 'updates', f'baseline-{code}.json')
    if not os.path.exists(bp):
        sys.exit(f'ERROR: {bp} missing - build the APK first (tools/build_apk.sh writes it)')
    base = json.load(open(bp, encoding='utf-8'))['files']
    vj = open(VERSION_JS, encoding='utf-8').read()
    m = re.search(r'WEB_BUILD\s*=\s*(\d+)', vj)
    if not m:
        sys.exit('ERROR: WEB_BUILD not found in www/js/version.js')
    build = int(m.group(1)) + 1
    open(VERSION_JS, 'w', encoding='utf-8', newline='\n').write(vj[:m.start(1)] + str(build) + vj[m.end(1):])
    app_version = re.search(r"APP_VERSION\s*=\s*'([^']+)'", vj).group(1)

    now = snapshot()
    changed = sorted(k for k, v in now.items() if base.get(k) != v)
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    zp = os.path.join(ROOT, 'dist', f'www-{build}.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for k in changed:
            z.write(os.path.join(WWW, k), k)
    man = json.load(open(MANIFEST, encoding='utf-8'))
    man['web'] = {
        'build': build, 'version': f'1.{build}',
        'zip': f'https://github.com/{REPO}/releases/download/web-{build}/www-{build}.zip',
        'sha256': sha(zp), 'size': os.path.getsize(zp), 'minVersionCode': code,
        'notes': notes, 'date': datetime.date.today().isoformat(),
    }
    json.dump(man, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'web build {build}: {len(changed)} changed files, {os.path.getsize(zp)} bytes -> {zp}')
    for k in changed[:40]:
        print('  ', k)
    print('\npublish:')
    print(f'  gh release create web-{build} dist/www-{build}.zip -R {REPO} --title "Web update {build}" --notes "{notes}"')
    print('  git add -A && git commit -m "Web update %d" && git push' % build)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['baseline']:
        baseline()
    elif a[:1] == ['make']:
        make(a[a.index('--notes') + 1] if '--notes' in a else '')
    else:
        print(__doc__)
