"""
Create/update Yancey's Appwrite Functions from appwrite.json and deploy them.

If GIT_INSTALLATION_ID and GIT_REPOSITORY_ID are set (copy them from your Appwrite site: Sites → site →
Settings → Git), each function is connected to the repo, so every push to the branch redeploys it.
Otherwise the function folder is uploaded as a .tar.gz.

    APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \\
    GIT_INSTALLATION_ID=... GIT_REPOSITORY_ID=... GIT_BRANCH=main \\
    python appwrite/deploy_functions.py [function-id ...]

Runs appwrite/sync_shared.py --check first so stale copies of shared code are never deployed.
"""
import io
import json
import os
import subprocess
import sys
import tarfile
from pathlib import Path

from appwrite.client import Client
from appwrite.enums.project_key_scopes import ProjectKeyScopes
from appwrite.enums.runtime import Runtime
from appwrite.enums.vcs_reference_type import VCSReferenceType
from appwrite.exception import AppwriteException
from appwrite.input_file import InputFile
from appwrite.services.functions import Functions

ROOT = Path(__file__).resolve().parent.parent


def tarball(folder: Path) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in sorted(folder.rglob("*")):
            if p.is_file() and "__pycache__" not in p.parts:
                tar.add(p, arcname=str(p.relative_to(folder)))
    return buf.getvalue()


def main():
    if subprocess.call([sys.executable, str(ROOT / "appwrite" / "sync_shared.py"), "--check"]) != 0:
        sys.exit("Shared code is out of date: run python appwrite/sync_shared.py and commit first.")
    client = (Client().set_endpoint(os.environ["APPWRITE_ENDPOINT"]).set_project(os.environ["APPWRITE_PROJECT_ID"])
              .set_key(os.environ["APPWRITE_API_KEY"]))
    fns = Functions(client)
    git = {"installation_id": os.environ.get("GIT_INSTALLATION_ID"), "provider_repository_id": os.environ.get("GIT_REPOSITORY_ID")}
    branch = os.environ.get("GIT_BRANCH", "main")
    only = set(sys.argv[1:])
    for f in json.load(open(ROOT / "appwrite.json"))["functions"]:
        if only and f["$id"] not in only:
            continue
        cfg = dict(name=f["name"], runtime=Runtime(f["runtime"]), execute=f.get("execute", []), events=f.get("events", []),
                   timeout=f.get("timeout", 15), enabled=f.get("enabled", True),
                   logging=f.get("logging", True), entrypoint=f["entrypoint"], commands=f.get("commands", ""),
                   scopes=[ProjectKeyScopes(s) for s in f.get("scopes", [])])
        if f.get("schedule"):  # cron needs a paid plan; "interval" (minutes) works on free
            cfg["schedule"] = f["schedule"]
        elif f.get("interval"):
            cfg["interval"] = f["interval"]
        if all(git.values()):
            cfg.update(git, provider_branch=branch, provider_root_directory=f["path"], provider_silent_mode=False)
        try:
            fns.get(f["$id"])
            fns.update(f["$id"], **cfg)
            print(f"~ updated {f['$id']}")
        except AppwriteException as e:
            if e.code != 404:
                raise
            fns.create(f["$id"], **cfg)
            print(f"+ created {f['$id']}")
        if all(git.values()):
            d = fns.create_vcs_deployment(f["$id"], VCSReferenceType.BRANCH, branch, activate=True)
            print(f"  deploying from git {branch}: {getattr(d, 'id', None)}")
        else:
            code = InputFile.from_bytes(tarball(ROOT / f["path"]), filename=f"{f['$id']}.tar.gz")
            d = fns.create_deployment(f["$id"], code, activate=True, entrypoint=f["entrypoint"], commands=f.get("commands"))
            print(f"  uploaded deployment {getattr(d, 'id', None)}")


if __name__ == "__main__":
    main()
