import importlib.util
import io
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient


def client(tmp_path, monkeypatch):
    monkeypatch.setenv('DESKVERSE_DATA_DIR', str(tmp_path))
    path = Path(__file__).resolve().parents[1] / 'backend' / 'app.py'
    spec = importlib.util.spec_from_file_location('deskverse_url', path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return TestClient(m.app), m


def png():
    buf=io.BytesIO()
    Image.new('RGB',(256,256)).save(buf,'PNG')
    return buf.getvalue()


def test_link_image_creates_source(tmp_path, monkeypatch):
    c,m=client(tmp_path,monkeypatch)
    monkeypatch.setattr(m, '_get_public', lambda url, max_bytes: (png(), 'image/png'))
    r=c.post('/api/sources/from-url',json={'url':'https://public.example/image.png','name':'Monitor', 'width_cm':40,'depth_cm':12,'visible_width_cm':40})
    assert r.status_code==201,r.text
    source=r.json()['source']
    assert source['widthMeters']==0.4
    assert c.get(source['imageUrl']).status_code==200


def test_product_metadata_source(tmp_path, monkeypatch):
    c,m=client(tmp_path,monkeypatch)
    def stub(url, _max):
        if url.endswith('product'): return (b'<html><meta property="og:image" content="/p.png"></html>','text/html')
        assert url == 'https://public.example/p.png'
        return (png(),'image/png')
    monkeypatch.setattr(m, '_get_public', stub)
    r=c.post('/api/sources/from-url',json={'url':'https://public.example/product','name':'Lamp', 'width_cm':20,'depth_cm':20,'visible_width_cm':20})
    assert r.status_code==201, r.text


def test_url_link_missing_image_returns_error(tmp_path, monkeypatch):
    c,m=client(tmp_path,monkeypatch)
    monkeypatch.setattr(m, '_get_public',lambda *_:(b'<html>No product img</html>','text/html'))
    r=c.post('/api/sources/from-url',json={'url':'https://public.example/item','name':'Lamp', 'width_cm':20,'depth_cm':20,'visible_width_cm':20})
    assert r.status_code==422,r.text
