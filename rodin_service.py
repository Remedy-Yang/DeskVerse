"""Local Rodin adapter. Credentials and task subscriptions never reach the browser."""
import base64
import binascii
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import socket
import struct
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from uuid import UUID, uuid4

MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_MODEL_BYTES = 80 * 1024 * 1024
API_BASE = 'https://api.hyper3d.com/api/v2/'


class ServiceError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def load_api_key(root):
    key = os.environ.get('RODIN_API_KEY', '').strip()
    if not key:
        path = Path(root) / '.env'
        if path.is_file():
            for line in path.read_text(encoding='utf-8').splitlines():
                name, separator, value = line.partition('=')
                if separator and name.strip() == 'RODIN_API_KEY':
                    key = value.strip().strip('\"\'')
                    break
    if any(character.isspace() for character in key):
        raise ServiceError('RODIN_API_KEY 格式无效，请检查本机 .env。', 503)
    return key


def valid_id(value):
    try:
        if str(UUID(value)) != value:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ServiceError('任务编号无效。')
    return value


def decode_image(payload):
    data = payload.get('image')
    if not isinstance(data, str) or len(data) > (MAX_IMAGE_BYTES * 4 // 3 + 8):
        raise ServiceError('照片不能超过 20 MB。', 413)
    try:
        image = base64.b64decode(data, validate=True)
    except (ValueError, binascii.Error):
        raise ServiceError('照片数据损坏。')
    if not image or len(image) > MAX_IMAGE_BYTES:
        raise ServiceError('请选择 20 MB 以内的照片。', 413)
    if image.startswith(b'\x89PNG\r\n\x1a\n'):
        return image, 'image/png', 'photo.png'
    if image.startswith(b'\xff\xd8\xff'):
        return image, 'image/jpeg', 'photo.jpg'
    if image[:4] == b'RIFF' and image[8:12] == b'WEBP':
        return image, 'image/webp', 'photo.webp'
    raise ServiceError('仅支持 PNG、JPG 或 WebP 照片。')


def multipart_image(image, content_type, filename):
    boundary = 'DeskVerse' + uuid4().hex
    pieces = []
    fields = {'tier': 'Regular', 'geometry_file_format': 'glb',
              'material': 'PBR', 'quality': 'medium'}
    for name, value in fields.items():
        pieces.append(('--' + boundary + '\r\nContent-Disposition: form-data; '
                       'name="' + name + '"\r\n\r\n' + value + '\r\n').encode())
    pieces.extend([
        ('--' + boundary + '\r\nContent-Disposition: form-data; name="images"; '
         'filename="' + filename + '"\r\nContent-Type: ' + content_type + '\r\n\r\n').encode(),
        image, ('\r\n--' + boundary + '--\r\n').encode(),
    ])
    return b''.join(pieces), 'multipart/form-data; boundary=' + boundary


def provider_json(key, action, payload, content_type='application/json'):
    if content_type == 'application/json':
        payload = json.dumps(payload).encode()
    request = Request(API_BASE + action, data=payload, method='POST', headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': content_type,
        'Accept': 'application/json',
    })
    try:
        with urlopen(request, timeout=90) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ServiceError('Rodin 返回的数据过大。', 502)
        result = json.loads(data)
    except HTTPError as error:
        messages = {401: 'Rodin 密钥无效或已撤销。', 403: 'Rodin 账户没有 API 访问权限。',
                    402: 'Rodin API 额度不足。', 429: 'Rodin 当前请求过多，请稍后查询。'}
        raise ServiceError(messages.get(error.code, 'Rodin 请求失败，请在控制台核对任务。'), 502)
    except (URLError, TimeoutError, OSError):
        raise ServiceError('连接 Rodin 超时或网络不可用；不会自动重新提交付费任务。', 502)
    except (ValueError, UnicodeError):
        raise ServiceError('Rodin 返回的数据无法解析，请在控制台核对任务。', 502)
    if not isinstance(result, dict):
        raise ServiceError('Rodin 返回的任务格式无效。', 502)
    if result.get('error'):
        messages = {'API_INSUFFICIENT_FUNDS': 'Rodin API 额度不足。',
                    'API_NO_ACTIVE_SUBSCRIPTION': '请先开通 Rodin API 订阅。',
                    'API_SUBSCRIPTION_PLAN_TOO_LOW': 'Rodin API 订阅不支持当前档位。',
                    'API_PARALLELISM_LIMIT_REACHED': 'Rodin 并行任务达到上限。',
                    'IMAGE_CONTENT_VIOLATION': '照片未通过 Rodin 内容审核。',
                    'API_OBJECT_NOT_FOUND_ON_IMAGE': '未在照片中找到独立物品。'}
        raise ServiceError(messages.get(result['error'], 'Rodin 未完成请求，请在控制台核对任务。'), 502)
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def download_glb(url):
    # 下载地址来自上游，但仍拒绝本机/内网 URL 和重定向，不向 CDN 转发密钥。
    parts = urlparse(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.port not in (None, 443):
        raise ServiceError('Rodin 返回了不安全的下载地址。', 502)
    try:
        addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ServiceError('拒绝访问内网下载地址。', 502)
        with build_opener(NoRedirect).open(Request(url), timeout=90) as response:
            data = response.read(MAX_MODEL_BYTES + 1)
    except (URLError, OSError, ValueError):
        raise ServiceError('GLB 下载失败，可重试下载；不会重新生成模型。', 502)
    if len(data) > MAX_MODEL_BYTES:
        raise ServiceError('生成的 GLB 超过 80 MB，请在 Rodin 控制台简化模型。', 413)
    if len(data) < 20 or data[:4] != b'glTF' or struct.unpack_from('<II', data, 4) != (2, len(data)):
        raise ServiceError('Rodin 未返回有效的 glTF 2.0 GLB。', 502)
    return data


class RodinService:
    def __init__(self, root, key):
        self.root = Path(root)
        self.key = key
        self.jobs = self.root / '.deskverse' / 'jobs'
        self.models = self.root / '.deskverse' / 'models'
        self.jobs.mkdir(parents=True, exist_ok=True)
        self.models.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def save(self, job):
        target = self.jobs / (job['id'] + '.json')
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
        temporary.chmod(0o600)
        temporary.replace(target)

    def load(self, job_id):
        path = self.jobs / (valid_id(job_id) + '.json')
        if not path.is_file():
            raise ServiceError('找不到该生成任务。', 404)
        return json.loads(path.read_text(encoding='utf-8'))

    @staticmethod
    def public(job):
        result = {name: job.get(name) for name in ('id', 'name', 'status', 'created', 'error', 'consumed')}
        if job['status'] == 'ready':
            result['modelUrl'] = '/api/generation/models/' + job['id'] + '.glb'
        return result

    def list_jobs(self):
        with self.lock:
            jobs = [json.loads(path.read_text(encoding='utf-8')) for path in self.jobs.glob('*.json')]
            return [self.public(job) for job in sorted(jobs, key=lambda job: job['created'], reverse=True)]

    def submit(self, payload):
        if not self.key:
            raise ServiceError('尚未配置 Rodin API 密钥。', 503)
        if payload.get('confirmed') is not True:
            raise ServiceError('请确认照片上传和积分消耗。')
        job_id = valid_id(payload.get('id'))
        image, mime, filename = decode_image(payload)
        fingerprint = hashlib.sha256(image).hexdigest()
        with self.lock:
            path = self.jobs / (job_id + '.json')
            if path.exists():
                existing = self.load(job_id)
                if existing['fingerprint'] != fingerprint:
                    raise ServiceError('该任务编号已用于另一张照片。', 409)
                return self.public(existing)
            job = {'id': job_id, 'name': str(payload.get('name') or '照片模型')[:80],
                   'status': 'submitting', 'created': time.time(), 'fingerprint': fingerprint,
                   'error': '', 'consumed': None, 'checked': 0}
            self.save(job)
            # 提交前保存任务编号；网络中断后不能自动重发，避免重复扣费。
            try:
                body, content_type = multipart_image(image, mime, filename)
                result = provider_json(self.key, 'rodin', body, content_type)
                if not result.get('uuid') or not result.get('jobs', {}).get('subscription_key'):
                    raise ServiceError('提交结果不完整，请在 Rodin 控制台核对；不会自动重发。', 502)
                job.update(status='queued', task_uuid=result['uuid'],
                           subscription_key=result['jobs']['subscription_key'], consumed=result.get('consumed'))
            except ServiceError as error:
                job.update(status='uncertain', error=str(error))
            self.save(job)
            return self.public(job)

    def refresh(self, job_id):
        with self.lock:
            job = self.load(job_id)
            if job['status'] not in ('queued', 'generating', 'downloading'):
                return self.public(job)
            if time.time() - job.get('checked', 0) < 5:
                return self.public(job)
            job['checked'] = time.time()
            try:
                if job['status'] != 'downloading':
                    response = provider_json(self.key, 'status', {'subscription_key': job['subscription_key']})
                    statuses = [entry.get('status') for entry in response.get('jobs', [])]
                    if 'Failed' in statuses:
                        job.update(status='failed', error='Rodin 生成失败，请在控制台查看详情。')
                    elif statuses and all(status == 'Done' for status in statuses):
                        job['status'] = 'downloading'
                    else:
                        job['status'] = 'generating' if 'Generating' in statuses else 'queued'
                        job['error'] = ''
                if job['status'] == 'downloading':
                    result = provider_json(self.key, 'download', {'task_uuid': job['task_uuid']})
                    item = next((item for item in result.get('list', []) if str(item.get('name', '')).lower().endswith('.glb')), None)
                    if not item:
                        raise ServiceError('Rodin 的结果还没有可用 GLB，稍后将重试下载。', 502)
                    model = download_glb(item['url'])
                    path = self.models / (job['id'] + '.glb')
                    temporary = path.with_suffix('.tmp')
                    temporary.write_bytes(model)
                    temporary.replace(path)
                    job.update(status='ready', error='')
            except ServiceError as error:
                job['error'] = str(error)
            self.save(job)
            return self.public(job)

    def model_path(self, job_id):
        with self.lock:
            job = self.load(job_id)
            path = self.models / (job_id + '.glb')
            if job['status'] != 'ready' or not path.is_file():
                raise ServiceError('GLB 尚未就绪。', 409)
            return path
