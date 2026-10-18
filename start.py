"""Local static app with an optional Rodin API adapter. Standard library only."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
from urllib.parse import unquote, urlparse
import webbrowser

from rodin_service import RodinService, ServiceError, load_api_key

MAX_REQUEST = 56 * 1024 * 1024


class DeskVerseServer(ThreadingHTTPServer):
    # 浏览器会并发请求 ES 模块，默认的 5 个连接排队位置不足。
    request_queue_size = 64
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, service, csrf, **kwargs):
        self.service = service
        self.csrf = csrf
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "frame-ancestors 'none'")
        super().end_headers()

    def local_request(self):
        port = self.server.server_address[1]
        hosts = {'127.0.0.1:' + str(port), 'localhost:' + str(port)}
        if self.headers.get('Host') not in hosts:
            raise ServiceError('仅允许本机访问。', 403)
        origin = self.headers.get('Origin')
        if origin and origin not in {'http://' + host for host in hosts}:
            raise ServiceError('不允许跨站请求。', 403)

    def json_response(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_library_model(self, path):
        # 仅暴露素材库中的 GLB，禁止目录列表、归档、跨目录及符号链接逃逸。
        root = (Path(self.directory).parent / 'models').resolve()
        target = (root / unquote(path)[len('/models/'):]).resolve()
        if not target.is_relative_to(root) or target.suffix.lower() != '.glb' or not target.is_file():
            raise ServiceError('模型不存在。', 404)
        try:
            source = target.open('rb')
        except OSError:
            raise ServiceError('模型无法读取。', 404)
        with source:
            self.send_response(200)
            self.send_header('Content-Type', 'model/gltf-binary')
            self.send_header('Content-Length', str(target.stat().st_size))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.copyfile(source, self.wfile)


    def do_GET(self):
        try:
            self.local_request()
            path = urlparse(self.path).path
            if any(part.startswith('.') for part in unquote(path).split('/') if part):
                raise ServiceError('文件不存在。', 404)
            if path == '/DeskVerse-layout-default.json':
                target = Path(self.directory).parent / 'DeskVerse-layout-default.json'
                try:
                    source = target.open('rb')
                except OSError:
                    raise ServiceError('官方默认桌搭配置不存在。', 404)
                with source:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(target.stat().st_size))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.end_headers()
                    self.copyfile(source, self.wfile)
                return
            if path.startswith('/models/'):
                return self.serve_library_model(path)
            if path == '/api/generation/config':
                configured, session_key = self.service.config()
                return self.json_response({'configured': configured, 'csrf': self.csrf,
                                           'provider': 'Rodin', 'tier': 'Regular',
                                           'sessionKey': session_key})
            if path == '/api/generation/jobs':
                return self.json_response({'jobs': self.service.list_jobs()})
            if path.startswith('/api/generation/jobs/'):
                return self.json_response(self.service.refresh(path.rsplit('/', 1)[1]))
            if path.startswith('/api/generation/models/') and path.endswith('.glb'):
                model = self.service.model_path(path.rsplit('/', 1)[1][:-4])
                data = model.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'model/gltf-binary')
                self.send_header('Content-Disposition', 'attachment; filename="DeskVerse-' + model.name + '"')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if path.startswith('/api/'):
                raise ServiceError('接口不存在。', 404)
            super().do_GET()
        except ServiceError as error:
            self.json_response({'error': str(error)}, error.status)

    def do_POST(self):
        try:
            self.local_request()
            if not secrets.compare_digest(self.headers.get('X-DeskVerse-Token', '').encode('utf-8'), self.csrf.encode('utf-8')):
                raise ServiceError('请求验证失败，请刷新页面。', 403)
            path = urlparse(self.path).path
            if path not in ('/api/generation/jobs', '/api/generation/config'):
                raise ServiceError('接口不存在。', 404)
            if self.headers.get('Content-Type') != 'application/json':
                raise ServiceError('请求格式无效。', 415)
            try:
                size = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise ServiceError('请求长度无效。')
            if size <= 0 or size > MAX_REQUEST:
                raise ServiceError('照片请求过大或为空。', 413)
            self.connection.settimeout(30)
            try:
                body = json.loads(self.rfile.read(size))
            except (ValueError, UnicodeError, TimeoutError):
                raise ServiceError('请求内容损坏或接收超时。')
            if not isinstance(body, dict):
                raise ServiceError('请求内容无效。')
            if path == '/api/generation/config':
                self.service.set_api_key(body.get('apiKey'))
                configured, session_key = self.service.config()
                return self.json_response({'configured': configured, 'csrf': self.csrf,
                                           'provider': 'Rodin', 'tier': 'Regular',
                                           'sessionKey': session_key})
            self.json_response(self.service.submit(body), 202)
        except ServiceError as error:
            self.json_response({'error': str(error)}, error.status)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    service = RodinService(root, load_api_key(root))
    handler = partial(Handler, service=service, csrf=secrets.token_urlsafe(32), directory=str(root / 'dist'))
    try:
        server = DeskVerseServer(('127.0.0.1', args.port), handler)
    except OSError:
        raise SystemExit('Port is occupied. Choose another port with --port.')
    address = 'http://127.0.0.1:' + str(args.port)
    print('DeskVerse: ' + address + '  (Ctrl+C to stop)', flush=True)
    print('Rodin API: ' + ('configured' if service.key else 'not configured'), flush=True)
    if not args.no_browser:
        webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
