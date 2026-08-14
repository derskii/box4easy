#!/bin/sh
set -eu
cd "$(dirname "$0")"
cat source/main.go.part.* > main.go
# Keep state transactional: validate/generated core config before committing state.json.
python3 - <<'PY'
from pathlib import Path
p = Path('main.go')
s = p.read_text()
old = '''func saveAndRebuild(dir string, st State) error {
\tif err := saveState(dir, st); err != nil {
\t\treturn err
\t}
\tif !st.EasyEnabled {
\t\treturn nil
\t}
\treturn rebuildConfig(dir, st)
}
'''
new = '''func saveAndRebuild(dir string, st State) error {
\tif st.EasyEnabled {
\t\tif err := rebuildConfig(dir, st); err != nil {
\t\t\treturn err
\t\t}
\t}
\treturn saveState(dir, st)
}
'''
if old not in s:
    raise SystemExit('transactional saveAndRebuild patch target not found')
p.write_text(s.replace(old, new))
PY
gofmt -w main.go
