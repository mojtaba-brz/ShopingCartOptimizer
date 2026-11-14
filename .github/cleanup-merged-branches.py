"""Remove only inactive, unprotected branch heads already reachable from main.
The deletion lease preserves any concurrent push. Authentication is ephemeral.
"""
import base64
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


def cleanup(get, delete):
    default = get('')['default_branch']
    main_sha = get('/branches/main')['commit']['sha']
    active = set()
    page = 1
    while True:
        prs = get('/pulls?state=open&per_page=100&page=' + str(page))
        for pr in prs:
            active.update((pr['head']['ref'], pr['base']['ref']))
        if len(prs) < 100:
            break
        page += 1
    branches, page = [], 1
    while True:
        rows = get('/branches?per_page=100&page=' + str(page))
        branches.extend(rows)
        if len(rows) < 100:
            break
        page += 1
    report = {'main': main_sha, 'deleted': [], 'preserved': []}
    for branch in branches:
        name, sha = branch['name'], branch['commit']['sha']
        if name in (default, 'main') or branch.get('protected') or name in active:
            reason = 'default, protected or active PR branch'
        else:
            assert re.fullmatch(r'[0-9a-f]{40}', sha)
            proof = get('/compare/' + sha + '...' + main_sha)
            if proof['merge_base_commit']['sha'] != sha:
                reason = 'contains commits not merged into main'
            elif delete(name, sha):
                report['deleted'].append({'branch': name, 'sha': sha})
                continue
            else:
                reason = 'deletion lease rejected; branch may have changed'
        report['preserved'].append({'branch': name, 'reason': reason})
    return report


def main():
    repo, token = os.environ['GITHUB_REPOSITORY'], os.environ['GH_TOKEN']

    def get(path):
        request = urllib.request.Request(
            'https://api.github.com/repos/' + repo + path,
            headers={'Authorization': 'Bearer ' + token,
                     'Accept': 'application/vnd.github+json',
                     'User-Agent': 'Sabadchin-branch-cleanup'})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)

    env = dict(os.environ)
    env.update(GIT_CONFIG_COUNT='1',
               GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',
               GIT_CONFIG_VALUE_0='AUTHORIZATION: basic ' +
               base64.b64encode(('x-access-token:' + token).encode()).decode())

    def delete(name, sha):
        # Argument arrays avoid shell interpretation of branch names.
        valid = subprocess.run(['git', 'check-ref-format', 'refs/heads/' + name],
                               capture_output=True).returncode == 0
        if not valid:
            return False
        command = ['git', 'push', '--force-with-lease=refs/heads/' + name + ':' + sha,
                   'origin', ':refs/heads/' + name]
        return subprocess.run(command, env=env, capture_output=True).returncode == 0

    report = cleanup(get, delete)
    Path('branch-cleanup.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
