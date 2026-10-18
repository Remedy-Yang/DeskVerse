import importlib.util
import io
import struct
from pathlib import Path
from fastapi.testclient import TestClient
from PIL import Image


def get_app(tmp_path, monkeypatch):
    monkeypatch.setenv('DESKVERSE_DATA_DIR', str(tmp_path))
    spec=importlib.util.spec_from_file_location('deskverse_studio_test',Path(__file__).parents[1]/'backend'/'app.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app), module

def tiny_glb():
    payload=b'{"asset":{"version":"2.0"}}'
    payload+=b' ' * (-len(payload) % 4)
    n=12+8+len(payload)
    return b'glTF'+struct.pack('<II',2,n)+struct.pack('<I4s',len(payload),b'JSON')+payload

def picture():
    buf=io.BytesIO()
    Image.new('RGB',(256,256),'#b6ccb4').save(buf,format='PNG')
    return buf.getvalue()

def test_home_and_static_resources(tmp_path,monkeypatch):
    client,_=get_app(tmp_path,monkeypatch)
    html=client.get('/')
    assert html.status_code==200
    assert '我的空间资产库' in html.text
    assert 'previewModal' in html.text
    assert client.get('/web/style.css').status_code==200
    assert client.get('/web/app.js').status_code==200
    assert client.get('/web/../../app.py').status_code==404


def test_asset_preserves_manifest_contract_and_delete(tmp_path,monkeypatch):
    client,_=get_app(tmp_path,monkeypatch)
    payload={'name':'Headphone','width_cm':'20','depth_cm':'12','visible_width_cm':'20'}
    result=client.post('/api/assets',data=payload, files={'file':('headphone.glb',tiny_glb(),'model/gltf-binary')})
    assert result.status_code==201,result.text
    asset=result.json()['asset']
    assert asset['createdAt']
    manifest=client.get('/api/manifest').json()
    assert manifest['assets'][0]['id']==asset['id']
    assert manifest['assets'][0]['url'].startswith('/api/glb/')
    assert manifest['assets'][0]['widthMeters']==.2
    assert client.get(asset['url']).status_code==200
    assert client.delete('/api/assets/'+asset['id']).status_code==200
    assert client.get('/api/manifest').json()['assets']==[]


def test_image_list_and_delete(tmp_path,monkeypatch):
    client,_=get_app(tmp_path,monkeypatch)
    res=client.post('/api/sources',data={'name':'Lamp','width_cm':30,'depth_cm':20,'visible_width_cm':30},files={'file':('lamp.png',picture(),'image/png')})
    assert res.status_code==201,res.text
    source=res.json()['source']
    assert source['createdAt']
    assert client.get(source['imageUrl']).status_code==200
    assert client.delete('/api/sources/'+source['id']).json()['ok']
    assert client.get('/api/sources').json()['sources']==[]
    assert client.get(source['imageUrl']).status_code==404


def test_task_list_and_active_delete_denied(tmp_path,monkeypatch):
    client,module=get_app(tmp_path,monkeypatch)
    res=client.post('/api/sources',data={'name':'Chair','width_cm':40,'depth_cm':30,'visible_width_cm':40},files={'file':('x.png',picture(),'image/png')})
    source=res.json()['source']
    module.TASKS['running-task']={'task_id':'running-task','source_id':source['id'],'status':'generating','message':'Generating','asset_id':None}
    assert client.get('/api/tasks').json()['tasks'][0]['status']=='generating'
    assert client.delete('/api/sources/'+source['id']).status_code==409
