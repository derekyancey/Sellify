"""
Copy appwrite/shared/*.py into every function's src/ folder (each Appwrite function deploys on its own).

    python appwrite/sync_shared.py          # copy
    python appwrite/sync_shared.py --check  # exit 1 if any copy is out of date (use before deploying)
"""
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent
SHARED = sorted((ROOT / "shared").glob("*.py"))
FUNCTIONS = sorted(p for p in (ROOT / "functions").iterdir() if (p / "src").is_dir())

stale = []
for fn in FUNCTIONS:
    for f in SHARED:
        dest = fn / "src" / f.name
        if not dest.exists() or not filecmp.cmp(f, dest, shallow=False):
            stale.append(dest)
            if "--check" not in sys.argv:
                shutil.copyfile(f, dest)

if "--check" in sys.argv:
    for d in stale:
        print(f"out of date: {d.relative_to(ROOT.parent)}")
    sys.exit(1 if stale else 0)
print(f"synced {len(SHARED)} shared file(s) into {len(FUNCTIONS)} function(s); updated {len(stale)}")
