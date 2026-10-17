"""Local-only static server for the bundled DeskVerse app. Python 3, no packages."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

if __name__ == '__main__':
    root = Path(__file__).resolve().parent / 'dist'
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8000), handler)
    except OSError:
        raise SystemExit('Port 8000 is occupied. Close the existing server and retry.')
    print('DeskVerse: http://127.0.0.1:8000  (Ctrl+C to stop)', flush=True)
    webbrowser.open('http://127.0.0.1:8000')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
