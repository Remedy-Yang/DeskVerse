"""DeskVerse Stage 9 — local-only GLB upload server for PICO runtime loading.

Run on a trusted LAN only: there is deliberately no account/auth system in this MVP.
"""
from __future__ import annotations

import json
import os
import struct
import threading
import uuid
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

HERE = Path(__file__).resolve().parent
DATA = Path(os.getenv("DESKVERSE_DATA_DIR", str(HERE / "data")))
ASSETS = DATA / "assets"
CATALOG = DATA / "catalog.json"
MAX_BYTES = 40 * 1024 * 1024
LOCK = threading.Lock()

ASSETS.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="DeskVerse Local GLB Server", version="0.9")


def _read_catalog() -> dict:
    if not CATALOG.exists():
        return {"version": 0, "assets": []}
    return json.loads(CATALOG.read_text(encoding="utf-8"))


def _write_catalog(catalog: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    temp = DATA / "catalog.json.tmp"
    temp.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, CATALOG)


@app.get("/health")
def health():
    return {"ok": True, "service": "DeskVerse Stage9"}


@app.get("/", response_class=HTMLResponse)
def homepage():
    return (HERE / "web" / "index.html").read_text(encoding="utf-8")


@app.get("/web/{filename}")
def web_static(filename: str):
    # Only serve the bundled UI resources; never accept an arbitrary path.
    if filename not in {"style.css", "app.js"}:
        raise HTTPException(status_code=404, detail="Not found")
    media = "text/css" if filename.endswith(".css") else "text/javascript"
    return FileResponse(HERE / "web" / filename, media_type=media)



@app.get("/api/manifest")
def manifest():
    with LOCK:
        return _read_catalog()


@app.get("/api/glb/{asset_id}")
def glb(asset_id: str):
    # Never accept arbitrary paths or filenames from clients.
    if len(asset_id) != 32 or any(c not in '0123456789abcdef' for c in asset_id):
        raise HTTPException(status_code=404, detail="Not found")
    path = ASSETS / f"{asset_id}.glb"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type="model/gltf-binary", filename=f"{asset_id}.glb")


@app.post("/api/assets", status_code=201)
async def create_asset(
    file: UploadFile = File(...),
    name: str = Form(...),
    width_cm: float = Form(...),
    depth_cm: float = Form(...),
    visible_width_cm: float = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".glb"):
        raise HTTPException(400, "Only .glb files are accepted")
    if not name.strip() or len(name.strip()) > 80:
        raise HTTPException(400, "Name must be 1–80 characters")
    for label, value in (("width_cm", width_cm), ("depth_cm", depth_cm),
                         ("visible_width_cm", visible_width_cm)):
        if not (1 <= value <= 500):
            raise HTTPException(400, f"{label} must be 1–500 cm")

    asset_id = uuid.uuid4().hex
    path = ASSETS / f"{asset_id}.glb"
    written = 0
    first = bytearray()
    try:
        with path.open("wb") as out:
            while True:
                piece = await file.read(1024 * 1024)
                if not piece:
                    break
                written += len(piece)
                if written > MAX_BYTES:
                    raise HTTPException(413, "GLB exceeds 40 MiB size limit")
                if len(first) < 12:
                    first.extend(piece[:12 - len(first)])
                out.write(piece)
        if len(first) < 12 or first[:4] != b"glTF":
            raise HTTPException(400, "Invalid GLB header (expected glTF)")
        version, length = struct.unpack_from("<II", first, 4)
        if version != 2 or length != written:
            raise HTTPException(400, "Invalid GLB v2 version or byte length")
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    asset = {
        "id": asset_id,
        "name": name.strip(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "url": f"/api/glb/{asset_id}",
        "widthMeters": round(width_cm / 100, 5),
        "depthMeters": round(depth_cm / 100, 5),
        "visibleWidthMeters": round(visible_width_cm / 100, 5),
    }
    with LOCK:
        catalog = _read_catalog()
        catalog["assets"].append(asset)
        catalog["version"] += 1
        _write_catalog(catalog)
    return {"ok": True, "asset": asset, "version": catalog["version"]}


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str):
    # Removal is intended for the web UI/server. Runtime deletion in Unity is a later stage.
    with LOCK:
        catalog = _read_catalog()
        kept = [a for a in catalog["assets"] if a["id"] != asset_id]
        if len(kept) == len(catalog["assets"]):
            raise HTTPException(404, "Asset not found")
        catalog["assets"] = kept
        catalog["version"] += 1
        _write_catalog(catalog)
    (ASSETS / f"{asset_id}.glb").unlink(missing_ok=True)
    return {"ok": True, "note": "Restart the PICO application to clear already loaded models."}

# -------- Stage 10: locally staged images -> Rodin -> Stage 9 GLB catalog -------
# The picture upload and Rodin API key stay on the Windows server.
import io
import ipaddress
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

IMAGE_DIR = DATA / 'images'
SOURCES = DATA / 'sources.json'
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
RODIN_URL = 'https://api.hyper3d.com/api/v2'
RODIN_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix='rodin')
TASK_LOCK = threading.Lock()
TASKS = {}  # Development process memory only; restarted jobs are not resumed.
MAX_IMG_BYTES = 10 * 1024 * 1024


def _read_sources():
    if not SOURCES.exists():
        return {'sources': []}
    return json.loads(SOURCES.read_text(encoding='utf-8'))


def _write_sources(data):
    temp = DATA / 'sources.json.tmp'
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temp, SOURCES)


@app.get('/api/sources')
def list_sources():
    with LOCK:
        return _read_sources()


@app.get('/api/source-image/{source_id}')
def source_image(source_id: str):
    if len(source_id) != 32 or any(c not in '0123456789abcdef' for c in source_id):
        raise HTTPException(404, 'Not found')
    file_path = IMAGE_DIR / f'{source_id}.png'
    if not file_path.is_file():
        raise HTTPException(404, 'Not found')
    return FileResponse(file_path, media_type='image/png')


@app.post('/api/sources', status_code=201)
async def upload_image_source(
    file: UploadFile = File(...),
    name: str = Form(...),
    width_cm: float = Form(...),
    depth_cm: float = Form(...),
    visible_width_cm: float = Form(...),
):
    if not name.strip() or len(name.strip()) > 80:
        raise HTTPException(400, 'Name must be 1–80 characters')
    for label, value in [('width_cm', width_cm), ('depth_cm', depth_cm), ('visible_width_cm', visible_width_cm)]:
        if not (1 <= value <= 500):
            raise HTTPException(400, f'{label} must be 1–500 cm')
    raw = await file.read(MAX_IMG_BYTES + 1)
    await file.close()
    if len(raw) > MAX_IMG_BYTES:
        raise HTTPException(413, 'Image exceeds 10 MiB')
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.verify()
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
            if img.width > 4096 or img.height > 4096 or img.width < 64 or img.height < 64:
                raise HTTPException(400, 'Image dimensions must be 64–4096 pixels')
            converted = img.convert('RGB')
            if converted.width * converted.height > 16_000_000:
                raise HTTPException(400, 'Image has too many pixels')
            output = io.BytesIO()
            converted.save(output, format='PNG', optimize=True)
            png = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, f'Invalid image: {exc}')
    if len(png) > MAX_IMG_BYTES:
        raise HTTPException(413, 'Encoded image exceeds 10 MiB')
    source_id = uuid.uuid4().hex
    (IMAGE_DIR / f'{source_id}.png').write_bytes(png)
    source = {
        'id': source_id, 'name': name.strip(),
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'widthMeters': round(width_cm / 100, 5),
        'depthMeters': round(depth_cm / 100, 5),
        'visibleWidthMeters': round(visible_width_cm / 100, 5),
        'imageUrl': f'/api/source-image/{source_id}',
    }
    with LOCK:
        state = _read_sources()
        state['sources'].append(source)
        _write_sources(state)
    return {'ok': True, 'source': source}


class GenerateBody(BaseModel):
    source_id: str


def _task_update(task_id, status, message='', asset_id=None):
    with TASK_LOCK:
        if task_id in TASKS:
            TASKS[task_id].update({'status': status, 'message': message, 'asset_id': asset_id})


def _api_json(session, endpoint, *, data=None, files=None, json_body=None, deadline=None):
    delay = 5
    while True:
        if deadline is not None and time.monotonic() > deadline:
            raise TimeoutError('Rodin deadline exceeded')
        if files:
            for file_tuple in files.values():
                file_tuple[1].seek(0)  # multipart retry must replay the original image
        response = session.post(RODIN_URL + endpoint, data=data, files=files, json=json_body, timeout=75)
        if response.status_code == 429 or 500 <= response.status_code <= 599:
            if deadline is not None and time.monotonic() + delay > deadline:
                raise TimeoutError('Rodin retry deadline exceeded')
            header = response.headers.get('Retry-After', '')
            try:
                sleep_for = max(1, min(60, int(header)))
            except ValueError:
                sleep_for = delay
            time.sleep(sleep_for)
            delay = min(delay * 2, 30)
            continue
        response.raise_for_status()
        result = response.json()
        if result.get('error'):
            raise RuntimeError(f"Rodin: {result['error']}: {result.get('message', '')}")
        return result


def _download_signed_glb(session, signed_url, dest):
    u = urlparse(signed_url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password:
        raise RuntimeError('Invalid Rodin download URL')
    # This URL comes only from Rodin, not an end user's link. Reject local targets.
    addrs = socket.getaddrinfo(u.hostname, None)
    if not addrs or any(not ipaddress.ip_address(a[4][0]).is_global for a in addrs):
        raise RuntimeError('Rodin URL resolved to a nonpublic address')
    size = 0
    with requests.get(signed_url, stream=True, timeout=90, allow_redirects=False) as res:
        res.raise_for_status()
        with dest.open('wb') as out:
            for chunk in res.iter_content(1024 * 1024):
                if chunk:
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise RuntimeError('Generated GLB exceeds Stage 9 40 MiB limit')
                    out.write(chunk)
    first = dest.read_bytes()[:12]
    if len(first) < 12 or first[:4] != b'glTF':
        raise RuntimeError('Rodin response does not contain GLB')
    glb_version, expected_len = struct.unpack_from('<II', first, 4)
    if glb_version != 2 or expected_len != size:
        raise RuntimeError('Generated GLB version/length mismatch')


def _rodin_worker(task_id, source):
    asset_id = uuid.uuid4().hex
    out_path = ASSETS / f'{asset_id}.glb'
    tmp = ASSETS / f'{asset_id}.partial'
    try:
        token = os.getenv('RODIN_API_KEY', '').strip()
        if not token:
            raise RuntimeError('RODIN_API_KEY is not configured')
        with requests.Session() as session:
            session.headers.update({'Authorization': 'Bearer ' + token})
            deadline = time.monotonic() + 20 * 60
            _task_update(task_id, 'submitting', 'Sending image to Rodin')
            with (IMAGE_DIR / f"{source['id']}.png").open('rb') as image_file:
                submission = _api_json(session, '/rodin', files={
                    'images': ('product.png', image_file, 'image/png')
                }, data={'tier': 'Gen-2.5-Medium', 'mesh_mode': 'Raw', 'quality': 'medium'}, deadline=deadline)
            remote_id = submission.get('uuid')
            subscription_key = (submission.get('jobs') or {}).get('subscription_key')
            if not remote_id or not subscription_key:
                raise RuntimeError('Rodin returned no task UUID or subscription key')
            _task_update(task_id, 'generating', 'Rodin generation in progress')
            delay = 5
            while True:
                if time.monotonic() > deadline:
                    raise TimeoutError('Rodin generation timed out after 20 minutes')
                time.sleep(delay)
                status = _api_json(session, '/status', json_body={'subscription_key': subscription_key}, deadline=deadline)
                jobs = status.get('jobs') or []
                states = [job.get('status') for job in jobs]
                if 'Failed' in states:
                    raise RuntimeError('Rodin reported a failed generation job')
                if states and all(state == 'Done' for state in states):
                    break
                delay = min(30, delay + 5)
            _task_update(task_id, 'downloading', 'Downloading GLB')
            downloadable = _api_json(session, '/download', json_body={'task_uuid': remote_id}, deadline=deadline)
            choices = downloadable.get('list') or []
            model = next((f for f in choices if str(f.get('name', '')).lower().endswith('.glb')), None)
            if not model or not model.get('url'):
                raise RuntimeError('Rodin has no .glb output (check export settings/plan)')
            _download_signed_glb(session, model['url'], tmp)
        os.replace(tmp, out_path)
        asset = {
            'id': asset_id, 'name': source['name'],
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'sourceId': source['id'],
            'imageUrl': source.get('imageUrl'),
            'url': f'/api/glb/{asset_id}',
            'widthMeters': source['widthMeters'],
            'depthMeters': source['depthMeters'],
            'visibleWidthMeters': source['visibleWidthMeters'],
        }
        with LOCK:
            catalog = _read_catalog()
            catalog['assets'].append(asset)
            catalog['version'] += 1
            _write_catalog(catalog)
        _task_update(task_id, 'ready', 'Model ready; PICO will load from catalog', asset_id)
    except Exception as exc:
        _task_update(task_id, 'failed', str(exc)[:400])
    finally:
        tmp.unlink(missing_ok=True)


@app.post('/api/generate', status_code=202)
def create_rodin_task(body: GenerateBody):
    if not os.getenv('RODIN_API_KEY', '').strip():
        raise HTTPException(503, 'RODIN_API_KEY missing: configure API access on Windows server')
    with LOCK:
        source = next((s for s in _read_sources()['sources'] if s['id'] == body.source_id), None)
    if source is None:
        raise HTTPException(404, 'Unknown source_id')
    with TASK_LOCK:
        for tid, existing in TASKS.items():
            if existing['source_id'] == body.source_id and existing['status'] not in ('ready', 'failed'):
                return {'task_id': tid, 'status': existing['status'], 'duplicate': True}
        task_id = uuid.uuid4().hex
        TASKS[task_id] = {'task_id': task_id, 'source_id': body.source_id, 'createdAt': datetime.now(timezone.utc).isoformat(), 'status': 'queued', 'message': 'Queued', 'asset_id': None}
    RODIN_POOL.submit(_rodin_worker, task_id, source)
    return {'task_id': task_id, 'status': 'queued'}


@app.get('/api/tasks/{task_id}')
def task_status(task_id: str):
    with TASK_LOCK:
        task = TASKS.get(task_id)
        if task is None:
            raise HTTPException(404, 'Unknown task or server was restarted')
        return dict(task)

# -------- Stage 12: headset URL -> public product image -> existing source list --------
# This intentionally does NOT bypass JD/Taobao login walls / platform APIs.
# URL mode accepts public HTTPS image links, or pages exposing public og:image metadata.
from html.parser import HTMLParser
from urllib.parse import urljoin


class URLSourceBody(BaseModel):
    url: str
    name: str
    width_cm: float
    depth_cm: float
    visible_width_cm: float


class _OpenGraphImage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None

    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'meta' or self.image:
            return
        attrs = {k.lower(): v for k, v in attrs if k}
        key = (attrs.get('property') or attrs.get('name') or '').lower()
        if key in ('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'):
            self.image = attrs.get('content', '').strip()


def _public_https_url(url: str):
    url = (url or '').strip()
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(422, 'Only public HTTPS image/product URLs are accepted')
    if parsed.port not in (None, 443):
        raise HTTPException(422, 'Nonstandard ports are not allowed')
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise HTTPException(422, 'Private/local network URLs are not allowed')
    except socket.gaierror:
        raise HTTPException(422, 'Domain did not resolve')
    return url


def _get_public(url: str, max_bytes: int):
    checked = _public_https_url(url)
    # No redirects: each redirect hop otherwise needs its own public-IP validation.
    with requests.Session() as session:
        session.trust_env = False
        with session.get(checked, stream=True, timeout=(8, 22), allow_redirects=False,
                         headers={'User-Agent': 'DeskVerseDemo/1.0'}) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                raise HTTPException(422, 'Redirected link. Paste final image URL or select a picture locally.')
            if response.status_code in (401, 403):
                raise HTTPException(422, 'Site requires login/authorization. Choose an image in PICO instead.')
            response.raise_for_status()
            content_type = response.headers.get('content-type', '').split(';')[0].lower()
            length = int(response.headers.get('content-length', '0') or 0)
            if length > max_bytes:
                raise HTTPException(413, 'Remote content is too large')
            data = bytearray()
            for chunk in response.iter_content(64 * 1024):
                data.extend(chunk)
                if len(data) > max_bytes:
                    raise HTTPException(413, 'Remote content exceeds size limit')
            return bytes(data), content_type


@app.post('/api/sources/from-url', status_code=201)
def source_from_url(body: URLSourceBody):
    if not body.name.strip() or len(body.name.strip()) > 80:
        raise HTTPException(422, 'Product name must contain 1–80 characters')
    for value in (body.width_cm, body.depth_cm, body.visible_width_cm):
        if not (1 <= value <= 500):
            raise HTTPException(422, 'Real dimensions must be 1–500 cm')
    try:
        data, content_type = _get_public(body.url, MAX_IMG_BYTES)
        if content_type in ('text/html', 'application/xhtml+xml'):
            parser = _OpenGraphImage()
            parser.feed(data.decode('utf-8', errors='replace'))
            if not parser.image:
                raise HTTPException(422, 'Product page has no public image metadata. Choose image in headset.')
            image_url = urljoin(body.url, parser.image)
            data, content_type = _get_public(image_url, MAX_IMG_BYTES)
        if not content_type.startswith('image/'):
            raise HTTPException(422, 'URL did not return an image')
        with Image.open(io.BytesIO(data)) as pic:
            pic.load()
            if pic.width < 64 or pic.height < 64 or pic.width > 4096 or pic.height > 4096:
                raise HTTPException(422, 'Image resolution must be 64–4096 px')
            output = io.BytesIO()
            pic.convert('RGB').save(output, format='PNG')
            png = output.getvalue()
        if len(png) > MAX_IMG_BYTES:
            raise HTTPException(413, 'Processed image is too large')
    except requests.RequestException as exc:
        raise HTTPException(422, f'Could not retrieve URL: {str(exc)[:120]}')
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(422, f'URL image could not be decoded: {str(exc)[:120]}')
    source_id = uuid.uuid4().hex
    (IMAGE_DIR / f'{source_id}.png').write_bytes(png)
    source = {
        'id': source_id, 'name': body.name.strip(),
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'widthMeters': round(body.width_cm / 100, 5),
        'depthMeters': round(body.depth_cm / 100, 5),
        'visibleWidthMeters': round(body.visible_width_cm / 100, 5),
        'imageUrl': f'/api/source-image/{source_id}',
    }
    with LOCK:
        state = _read_sources()
        state['sources'].append(source)
        _write_sources(state)
    return {'ok': True, 'source': source}


# -------- Stage 14: asset studio management (additive, Unity-compatible) --------

@app.get('/api/tasks')
def list_tasks():
    with TASK_LOCK:
        return {'tasks': sorted((dict(t) for t in TASKS.values()),
                                key=lambda t: t.get('createdAt', ''), reverse=True)[:100]}


@app.delete('/api/sources/{source_id}')
def delete_source(source_id: str):
    if len(source_id) != 32 or any(c not in '0123456789abcdef' for c in source_id):
        raise HTTPException(404, 'Source not found')
    with TASK_LOCK:
        if any(t['source_id'] == source_id and t['status'] not in ('ready', 'failed')
               for t in TASKS.values()):
            raise HTTPException(409, 'Generation is in progress; cannot delete this source')
    with LOCK:
        state = _read_sources()
        kept = [s for s in state['sources'] if s['id'] != source_id]
        if len(kept) == len(state['sources']):
            raise HTTPException(404, 'Source not found')
        state['sources'] = kept
        _write_sources(state)
    (IMAGE_DIR / f'{source_id}.png').unlink(missing_ok=True)
    return {'ok': True}
