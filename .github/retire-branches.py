"""Retire only explicitly listed, unchanged, contained, inactive branches.
Git's deletion lease prevents losing a concurrent push between inspection/deletion.
The ephemeral job token is used from process environment only and never persisted.
"""
import base64,json,os,re,subprocess,urllib.request,urllib.parse
from pathlib import Path
repo=os.environ['GITHUB_REPOSITORY'];root=os.environ['ROOT_SHA'];token=os.environ['GH_TOKEN']
assert re.fullmatch(r'[0-9a-f]{40}',root)
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==root
def get(path):
    req=urllib.request.Request('https://api.github.com/repos/'+repo+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'Sabadchin-maintenance'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
default=get('')['default_branch'];active=set()
page=1
while True:
    prs=get('/pulls?state=open&per_page=100&page='+str(page))
    for pr in prs:active.update([pr['base']['ref'],pr['head']['ref']])
    if len(prs)<100:break
    page+=1
report={'root':root,'deleted':[],'preserved':[]}
env=dict(os.environ);env.update(GIT_CONFIG_COUNT='1',GIT_CONFIG_KEY_0='http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0='AUTHORIZATION: basic '+base64.b64encode(('x-access-token:'+token).encode()).decode())
for entry in json.loads(Path('.github/obsolete-branches.json').read_text()):
    name,sha=entry['name'],entry['sha'];reason=None
    assert re.fullmatch(r'codex/[a-z0-9-]+',name) and re.fullmatch(r'[0-9a-f]{40}',sha)
    if name==default or name=='codex/cross-platform-live' or name in active:reason='default or active PR branch'
    try:
        branch=get('/branches/'+urllib.parse.quote(name,safe=''))
        if branch.get('protected') or branch['commit']['sha']!=sha:reason='protected or changed since review'
        if not reason and get('/compare/'+sha+'...'+root)['merge_base_commit']['sha']!=sha:reason='contains unintegrated history'
        if not reason:
            result=subprocess.run(['git','push','--force-with-lease=refs/heads/'+name+':'+sha,'origin',':refs/heads/'+name],env=env,capture_output=True,text=True)
            if result.returncode:reason='atomic deletion rejected'
    except urllib.error.HTTPError as error:reason='API status '+str(error.code)
    if reason:report['preserved'].append({'branch':name,'reason':reason})
    else:report['deleted'].append(name)
Path('branch-retirement.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
