import importlib.util
import struct
from pathlib import Path
from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch):
    import os
    monkeypatch.setenv('DESKVERSE_DATA_DIR', str(tmp_path))
    path = Path(__file__).resolve().parents[1] / 'backend' / 'app.py'
    spec = importlib.util.spec_from_file_location('deskverse_backend_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app)


def sample_glb():
    # GLB 2.0 with a valid minimal JSON chunk.
    payload = b'{"asset":{"version":"2.0"},"scenes":[{}],"scene":0}'
    payload += b' ' * ((-len(payload)) % 4)
    total = 12 + 8 + len(payload)
    return b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I4s',len(payload),b'JSON') + payload


def test_upload_manifest_and_download(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    assert client.get('/health').json()['ok']
    response = client.post('/api/assets', data={'name':'Keyboard','width_cm':'35','depth_cm':'14','visible_width_cm':'35'}, files={'file':('keyboard.glb',sample_glb(),'model/gltf-binary')})
    assert response.status_code == 201, response.text
    obj = response.json()['asset']
    catalog = client.get('/api/manifest').json()
    assert catalog['version'] == 1
    assert catalog['assets'][0]['name']=='Keyboard'
    assert catalog['assets'][0]['widthMeters']==0.35
    assert client.get(obj['url']).content==sample_glb()


def test_reject_invalid_glb(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    response = client.post('/api/assets',data={'name':'bad','width_cm':'35','depth_cm':'14','visible_width_cm':'35'}, files={'file':('bad.glb',b'not glb','model/gltf-binary')})
    assert response.status_code == 400
    assert client.get('/api/manifest').json()['assets']==[]
