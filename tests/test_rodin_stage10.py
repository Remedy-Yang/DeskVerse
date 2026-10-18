import io
import importlib.util
import struct
from pathlib import Path
from PIL import Image
from fastapi.testclient import TestClient


def client_with_module(tmp_path, monkeypatch):
    monkeypatch.setenv('DESKVERSE_DATA_DIR', str(tmp_path))
    path = Path(__file__).resolve().parents[1] / 'backend' / 'app.py'
    spec = importlib.util.spec_from_file_location('deskverse_rodin_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app), module


def make_png():
    b = io.BytesIO()
    Image.new('RGB', (256,256), '#5079a6').save(b, 'PNG')
    return b.getvalue()


def make_glb():
    data=b'{"asset":{"version":"2.0"}}'
    data+=b' ' *((-len(data))%4)
    size=12+8+len(data)
    return b'glTF'+struct.pack('<II',2,size)+struct.pack('<I4s',len(data),b'JSON')+data


def stage_image(client):
    response = client.post('/api/sources', data={'name':'Speaker','width_cm':'14','depth_cm':'12','visible_width_cm':'14'}, files={'file':('speaker.png',make_png(),'image/png')})
    assert response.status_code == 201, response.text
    return response.json()['source']


def test_image_stage_and_no_key(tmp_path, monkeypatch):
    monkeypatch.delenv('RODIN_API_KEY', raising=False)
    client, _ = client_with_module(tmp_path, monkeypatch)
    source = stage_image(client)
    assert source['widthMeters'] == 0.14
    assert client.get('/api/source-image/'+source['id']).status_code == 200
    assert len(client.get('/api/sources').json()['sources']) == 1
    r = client.post('/api/generate',json={'source_id':source['id']})
    assert r.status_code == 503
    assert client.get('/api/manifest').json()['assets'] == []


def test_reject_invalid_picture(tmp_path, monkeypatch):
    client, _ = client_with_module(tmp_path, monkeypatch)
    r = client.post('/api/sources', data={'name':'Nope','width_cm':'1','depth_cm':'1','visible_width_cm':'1'}, files={'file':('bad.png',b'not an image','image/png')})
    assert r.status_code == 400
    assert client.get('/api/sources').json()['sources'] == []


def test_full_rodin_lifecycle_simulated_no_real_charge(tmp_path, monkeypatch):
    # Simulate responses from official Rodin endpoints; no external HTTP call.
    client, module = client_with_module(tmp_path, monkeypatch)
    source = stage_image(client)
    monkeypatch.setenv('RODIN_API_KEY','TEST_ONLY_DO_NOT_USE')
    monkeypatch.setattr(module.time, 'sleep', lambda _: None)
    endpoints=[]
    def fake_api(_session, endpoint, **kw):
        endpoints.append(endpoint)
        if endpoint == '/rodin': return {'uuid':'top-uuid','jobs':{'subscription_key':'status-token'}}
        if endpoint == '/status':
            assert kw['json_body']['subscription_key'] == 'status-token'
            return {'jobs':[{'status':'Done'}]}
        if endpoint == '/download':
            assert kw['json_body']['task_uuid'] == 'top-uuid'
            return {'list':[{'name':'model.glb','url':'https://public.example/model.glb'}]}
        raise AssertionError(endpoint)
    monkeypatch.setattr(module, '_api_json', fake_api)
    monkeypatch.setattr(module, '_download_signed_glb', lambda _session,_url,dest: dest.write_bytes(make_glb()))
    tid='test-task'
    module.TASKS[tid]={'task_id':tid,'source_id':source['id'],'status':'queued','message':'','asset_id':None}
    module._rodin_worker(tid, source)
    final=client.get('/api/tasks/'+tid).json()
    assert final['status']=='ready', final
    assert endpoints==['/rodin','/status','/download']
    catalog=client.get('/api/manifest').json()
    assert len(catalog['assets']) == 1
    assert catalog['assets'][0]['name']=='Speaker'
    assert client.get(catalog['assets'][0]['url']).content==make_glb()

