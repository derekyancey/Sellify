"""
Private storage for digital deliverables: a Cloudflare R2 bucket reached through its S3 API.

The bucket is never public (no r2.dev URL, no custom domain). Files are only reachable through presigned URLs
that this module signs with SigV4 and that expire within minutes:
  - site-ops signs a PUT so an admin's browser can upload a zip straight to R2,
  - checkout signs a GET after it has verified a customer's download token.

Function environment variables (secrets: set them in the Appwrite console, never in code or git):
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default "sellify-deliverables")

Object keys are "<siteId>/<fileId>"; products store only the fileId. Never log a presigned URL.
"""
import datetime as dt
import hashlib
import hmac
import os
import re
import uuid
from urllib.parse import quote

EXTENSIONS = {"zip", "rar", "7z", "pdf", "epub", "mp3", "wav", "mp4", "mov", "png", "jpg", "jpeg", "psd", "ai", "svg",
              "ttf", "otf", "csv", "txt", "xlsx", "docx", "pptx", "procreate", "brushset", "abr", "cube", "xmp", "dng"}
MAX_BYTES = int(os.environ.get("DELIVERABLES_MAX_BYTES", str(5 * 1024 ** 3)))  # R2 accepts up to 5 GB in a single PUT
FILE_ID = re.compile(r"^[0-9a-f]{32}$")


class NotConfigured(Exception):
    pass


def _cfg():
    names = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        raise NotConfigured(f"Set {', '.join(missing)} on this function to store download files in R2")
    return (os.environ["R2_ACCOUNT_ID"], os.environ["R2_ACCESS_KEY_ID"], os.environ["R2_SECRET_ACCESS_KEY"],
            os.environ.get("R2_BUCKET", "sellify-deliverables"))


def new_file_id():
    return uuid.uuid4().hex


def object_key(site_id, file_id):
    if not FILE_ID.match(file_id or "") or not re.match(r"^[\w-]{1,36}$", site_id or ""):
        raise ValueError("Bad file reference")
    return f"{site_id}/{file_id}"


def safe_name(name):
    name = re.sub(r"[^\w.\- ]+", "_", (name or "").strip())[:200].strip(". ") or "download"
    return name


def allowed(name):
    return "." in name and name.rsplit(".", 1)[1].lower() in EXTENSIONS


def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def presign(method, key, expires=300, params=None, now=None):
    """A SigV4 query-string presigned URL for one object (method GET, PUT or HEAD)."""
    account, access, secret, bucket = _cfg()
    now = now or dt.datetime.now(dt.timezone.utc)
    amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    host = f"{account}.r2.cloudflarestorage.com"
    scope = f"{day}/auto/s3/aws4_request"
    path = "/" + quote(bucket, safe="") + "/" + "/".join(quote(p, safe="-_.~") for p in key.split("/"))
    q = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{access}/{scope}", "X-Amz-Date": amz_date,
         "X-Amz-Expires": str(int(expires)), "X-Amz-SignedHeaders": "host", **(params or {})}
    query = "&".join(f"{quote(k, safe='-_.~')}={quote(str(v), safe='-_.~')}" for k, v in sorted(q.items()))
    canonical = f"{method}\n{path}\n{query}\nhost:{host}\n\nhost\nUNSIGNED-PAYLOAD"
    to_sign = f"AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}"
    k = _sign(_sign(_sign(_sign(("AWS4" + secret).encode(), day), "auto"), "s3"), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    return f"https://{host}{path}?{query}&X-Amz-Signature={sig}"


def upload_url(site_id, file_id, expires=900):
    return presign("PUT", object_key(site_id, file_id), expires)


def download_url(site_id, file_id, name, expires=300):
    """Short-lived GET that makes the browser save the file under its original name."""
    n = safe_name(name)
    return presign("GET", object_key(site_id, file_id), expires,
                   {"response-content-disposition": f"attachment; filename=\"{n}\"; filename*=UTF-8''{quote(n)}"})


def exists(site_id, file_id, requests_mod=None):
    import requests
    r = (requests_mod or requests).head(presign("HEAD", object_key(site_id, file_id), 60), timeout=10)
    return r.status_code == 200
