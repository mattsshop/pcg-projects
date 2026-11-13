#!/usr/bin/env python3
"""Set the app version everywhere: python3 tools/bump.py 0.3.1
Stamps ?v=<version> on every local module URL so browsers load the new build instead of a cached one."""
import re, sys, json, pathlib
v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
cfg = root / 'js/config.js'
cfg.write_text(re.sub(r"APP_VERSION = '[^']*'", f"APP_VERSION = '{v}'", cfg.read_text()))
(root / 'version.json').write_text(json.dumps({'version': v}) + '\n')
spec = re.compile(r"""((?:from|import)\s*\(?\s*['"])(\.{1,2}/[\w./-]+?\.js)(?:\?v=[^'"]*)?(['"])""")
for f in list((root / 'js').glob('*.js')) + [root / 'r.html', root / 'index.html']:
    t = f.read_text()
    t = spec.sub(lambda m: f"{m[1]}{m[2]}?v={v}{m[3]}", t)
    t = re.sub(r'src="js/app\.js(?:\?v=[^"]*)?"', f'src="js/app.js?v={v}"', t)
    t = re.sub(r'href="css/style\.css(?:\?v=[^"]*)?"', f'href="css/style.css?v={v}"', t)
    f.write_text(t)
print('version', v)
