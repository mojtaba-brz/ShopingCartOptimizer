"""Owner-facing preflight. Never reads or emits signing passwords."""
import json,pathlib,sys
config=json.loads((pathlib.Path(__file__).parent/'publication.json').read_text())
missing=[]
for key in ['developer_public_name','support_email','public_privacy_policy_url']:
    if not config.get(key):missing.append(key)
for key in ['retailer_integration_live_validated','retailer_use_reviewed','store_declarations_reviewed','production_signing_configured']:
    if config.get(key) is not True:missing.append(key)
if missing:
    print('Publication pending: '+', '.join(missing));sys.exit(1)
print('Owner checklist complete. Verify the signed binaries and store console declarations before submission.')
