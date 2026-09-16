"""Publish reviewed Git objects only. Never creates or updates any Git ref."""
from pathlib import Path
import base64, json, os, subprocess, urllib.request
root = Path.cwd()
out = root / '.runtime/measurement-web-transaction'
base = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
base_tree = subprocess.check_output(['git','rev-parse','HEAD^{tree}'], text=True).strip()
paths = json.loads((out/'changed.json').read_text())
allowed = ('apps/opendesk/prototypes/desktop-measurement/', 'pkg/measurement/', 'pkg/customui/', 'docs/architecture/desktop-automation/desktop-measurement', 'docs/quality/desktop-measurement', 'tests/desktop-measurement/')
assert all(p.startswith(allowed) for p in paths)
api = 'https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY']
def post(endpoint, value):
    req = urllib.request.Request(api+endpoint, data=json.dumps(value).encode(), method='POST', headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'], 'Accept':'application/vnd.github+json', 'Content-Type':'application/json', 'X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(req, timeout=60) as res: return json.load(res)
elements = []
for path in paths:
    data = (root/path).read_bytes()
    blob = post('/git/blobs', {'encoding':'base64','content':base64.b64encode(data).decode()})
    elements.append({'path':path, 'mode':'100644', 'type':'blob', 'sha':blob['sha']})
# Temporary execution scaffolding does not ship in the product tree.
for path in ('.github/scripts/measurement-baseline-transaction.py', '.github/scripts/measurement-browser.test.py', '.github/scripts/measurement-publish-tree.py', '.github/workflows/measurement-baseline-transaction.yml'):
    elements.append({'path':path,'mode':'100644','type':'blob','sha':None})
tree = post('/git/trees', {'base_tree':base_tree, 'tree':elements})
result = {'baseCommit':base,'baseTree':base_tree,'tree':tree['sha'],'elements':elements,'refUpdated':False,'nativeQualification':'NOT_RUN'}
(out/'tree.json').write_text(json.dumps(result, indent=2))
print('MEASUREMENT_REVIEW_TREE '+json.dumps(result))
