"""Assemble reviewable release candidates. Never includes keys or store credentials."""
import hashlib,json,os,pathlib,re,shutil,zipfile
root=pathlib.Path('publication-kit');root.mkdir(exist_ok=True)
source=pathlib.Path('release')
for name in ['README-fa.md','publication.json','check-publication.py','privacy-policy-fa.html']:
    shutil.copy2(source/name,root/name)
shutil.copytree(source/'store-listing',root/'store-listing',dirs_exist_ok=True)
candidates=pathlib.Path('candidates')
for f in candidates.rglob('*'):
    if not f.is_file():continue
    if f.suffix in ['.apk','.aab'] or f.name in ['mapping.txt','lint-results-release.html']:
        target=root/'android-candidates'/f.name;target.parent.mkdir(exist_ok=True);shutil.copy2(f,target)
        if f.suffix in ['.apk','.aab']:
            data=f.read_bytes();assert b'APK Sig Block 42' not in data
            with zipfile.ZipFile(f) as z:assert not any(n.upper().endswith(('.RSA','.DSA','.EC')) for n in z.namelist())
    if 'store-assets' in f.parts and f.suffix=='.png':
        target=root/'store-assets'/f.name;target.parent.mkdir(exist_ok=True);shutil.copy2(f,target)
for f in pathlib.Path('test-apk').glob('*.apk'):
    shutil.copy2(f,root/'Sabadchin-Android-0.10.0-test.apk')
validation={'desktop_live_smoke':os.environ.get('DESKTOP_LIVE_RESULT','not-run'),'source_commit':os.environ['SOURCE_COMMIT'],'run_url':os.environ['RUN_URL'],'job_results':json.loads(os.environ['JOB_RESULTS']),'android':{},'live_retailer_validation':False,'store_submission_ready':False}
for api in [30,36]:
    folder=pathlib.Path('qa')/str(api)
    logs=list(folder.rglob('instrumentation.txt'))
    text=logs[0].read_text(errors='replace') if logs else ''
    passed=[int(x) for x in re.findall(r'OK \((\d+) tests?\)',text)]
    validation['android'][str(api)]={'completed_test_counts':passed,'failed_or_incomplete':('FAILURES' in text or len(passed)!=2)}
    if logs:
        target=root/'validation'/('android-'+str(api)+'.txt');target.parent.mkdir(exist_ok=True);shutil.copy2(logs[0],target)
    for f in folder.rglob('*.png'):
        if f.name not in ['simple.png','modern.png','traditional.png']:continue
        assert f.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
        target=root/'screenshots'/('api-'+str(api))/f.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)
(root/'VALIDATION.json').write_text(json.dumps(validation,indent=2,ensure_ascii=False)+'\n')
(root/'README-English.txt').write_text("""Sabadchin 0.10.0 - publication preparation kit

The included test APK is installable. APK/AAB files in android-candidates are UNSIGNED release candidates requiring owner signing. Do not submit the debug-signed test APK to stores.

Includes Persian/English store copy, original icon/feature graphic, policy draft, owner preflight, lint output, QA records and available native app screenshots using sample list data.

Publication still requires public publisher/support details, a public HTTPS privacy-policy page, owner signing and developer accounts, review of retailer integration/terms and store declarations, and live testing of the actual selected supermarket, location, fees and basket changes. No store submission has been made.

VALIDATION.json reports actual completed checks, including incomplete coverage; it is not a claim that a failing or unfinished check passed. The policy and publisher fields remain drafts until the owner completes them. See README-fa.md for build/signing instructions and official store references.

Source: https://github.com/mojtaba-brz/ShopingCartOptimizer/tree/codex/cross-platform-live
""")
manifest=[]
for f in sorted(root.rglob('*')):
    if f.is_file():manifest.append(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+str(f.relative_to(root)))
(root/'SHA256SUMS.txt').write_text('\n'.join(manifest)+'\n')
print(json.dumps({'files':len(manifest),'validation':validation},ensure_ascii=False))
