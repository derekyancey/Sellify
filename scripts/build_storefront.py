"""Package a theme as a standalone storefront for a store's own domain.

    python scripts/build_storefront.py moonbear dist-storefront/moonbear

Writes index.html (absolute asset paths, so /products/<handle> and /collections/<handle>
work), engine/, yancey.js, theme.json, store.json and templates/. Host the folder on
Appwrite Sites (static, fallback file index.html) and point the store's domain at it.
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
theme_id, out = sys.argv[1], pathlib.Path(sys.argv[2])
src = ROOT / "public" / "themes" / theme_id
if not (src / "theme.json").exists():
    sys.exit(f"No theme at {src}")

if out.exists():
    shutil.rmtree(out)
shutil.copytree(src, out)
shutil.copytree(ROOT / "public" / "themes" / "engine", out / "engine")
shutil.copy(ROOT / "public" / "yancey.js", out / "yancey.js")

html = (out / "index.html").read_text(encoding="utf-8")
html = html.replace('data-theme-root="./"', 'data-theme-root="/"')
html = html.replace('href="../engine/', 'href="/engine/').replace('src="../engine/', 'src="/engine/')
(out / "index.html").write_text(html, encoding="utf-8")
print(f"Storefront for theme '{theme_id}' written to {out}")
