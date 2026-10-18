import base64
from email import policy
from email.parser import BytesParser
from functools import partial
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from rodin_service import (MAX_IMAGE_BYTES, RodinService, ServiceError, decode_image,
                           decode_images, download_glb, load_api_key, provider_json,
                           valid_id)
from start import DeskVerseServer, Handler

PNG = b'\x89PNG\r\n\x1a\n' + b'local-test-image'
SUBMISSION = {'uuid': str(uuid4()), 'jobs': {'subscription_key': 'private-subscription'}, 'consumed': 0.5}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.service = RodinService(self.temporary.name, 'test-only-key')

    def payload(self, images=None):
        images = images or [PNG]
        return {'id': str(uuid4()), 'name': '杯子',
                'images': [base64.b64encode(image).decode() for image in images],
                'confirmed': True}

    def submitted(self, payload=None):
        payload = payload or self.payload()
        with patch('rodin_service.provider_json', return_value=SUBMISSION) as provider:
            result = self.service.submit(payload)
            deadline = time.time() + 3
            while self.service.load(result['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)
            self.assertEqual(self.service.load(result['id'])['status'], 'queued')
            provider.assert_called_once()
        return result['id']

    def test_credentials_read_from_environment_without_exposing_them(self):
        with patch.dict(os.environ, {'RODIN_API_KEY': 'env-test-key'}):
            self.assertEqual(load_api_key(self.temporary.name), 'env-test-key')
        self.assertNotIn('test-only-key', json.dumps(self.service.list_jobs()))

    def test_local_env_fallback_and_header_injection_rejected(self):
        (Path(self.temporary.name) / '.env').write_text('RODIN_API_KEY="local-test-key"\n')
        with patch.dict(os.environ, {'RODIN_API_KEY': ''}):
            self.assertEqual(load_api_key(self.temporary.name), 'local-test-key')
        with patch.dict(os.environ, {'RODIN_API_KEY': 'invalid\nkey'}):
            with self.assertRaises(ServiceError):
                load_api_key(self.temporary.name)

    def test_image_type_is_verified_not_trusted_from_client(self):
        self.assertEqual(decode_image(base64.b64encode(PNG).decode())[1], 'image/png')
        for data in ('not base64', base64.b64encode(b'not an image').decode(), ''):
            with self.assertRaises(ServiceError):
                decode_image(data)

    def test_image_count_and_size_limits(self):
        self.assertEqual(len(decode_images({'images': [base64.b64encode(PNG).decode()] * 5})), 5)
        with self.assertRaises(ServiceError):
            decode_images({'images': [base64.b64encode(PNG).decode()] * 6})
        for images in ([], 'not-a-list', [1]):
            with self.assertRaises(ServiceError):
                decode_images({'images': images})
        maximum = b'\x89PNG\r\n\x1a\n' + b'x' * (MAX_IMAGE_BYTES - 8)
        encoded = base64.b64encode(maximum).decode()
        self.assertEqual(len(decode_images({'images': [encoded]})[0][0]), MAX_IMAGE_BYTES)
        with self.assertRaises(ServiceError) as caught:
            decode_images({'images': [encoded, encoded, base64.b64encode(PNG).decode()]})
        self.assertEqual(caught.exception.status, 413)
        with self.assertRaises(ServiceError) as caught:
            decode_images({'images': [base64.b64encode(maximum + b'x').decode()]})
        self.assertEqual(caught.exception.status, 413)

    def test_invalid_task_ids_and_unconfirmed_upload_are_rejected(self):
        for value in ('../../.env', '', None, '123'):
            with self.assertRaises(ServiceError):
                valid_id(value)
        payload = self.payload()
        payload['confirmed'] = False
        with patch('rodin_service.provider_json') as provider:
            with self.assertRaises(ServiceError):
                self.service.submit(payload)
            provider.assert_not_called()
        legacy = {'id': str(uuid4()), 'image': base64.b64encode(PNG).decode(), 'confirmed': True}
        with patch('rodin_service.provider_json') as provider:
            with self.assertRaises(ServiceError):
                self.service.submit(legacy)
            provider.assert_not_called()

    def test_multi_image_submission_sends_repeated_images_and_concat(self):
        images = [PNG, PNG + b'-second']
        payload = self.payload(images)
        with patch('rodin_service.provider_json', return_value=SUBMISSION) as provider:
            result = self.service.submit(payload)
            deadline = time.time() + 3
            while self.service.load(result['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)
            body, content_type = provider.call_args.args[2:4]
        message = BytesParser(policy=policy.default).parsebytes(('Content-Type: ' + content_type + '\r\n\r\n').encode() + body)
        image_parts = [part.get_payload(decode=True) for part in message.iter_parts()
                       if part.get_param('name', header='content-disposition') == 'images']
        fields = {part.get_param('name', header='content-disposition'): part.get_payload(decode=True)
                  for part in message.iter_parts() if part.get_param('name', header='content-disposition') != 'images'}
        self.assertEqual(image_parts, images)
        self.assertEqual(fields['condition_mode'], b'concat')
        self.assertEqual(fields['tier'], b'Regular')
        self.assertEqual(fields['geometry_file_format'], b'glb')
        self.assertEqual(fields['material'], b'PBR')
        self.assertEqual(result['imageCount'], 2)

    def test_submit_returns_promptly_while_provider_runs_in_background(self):
        entered, release = threading.Event(), threading.Event()
        def provider(*args):
            entered.set()
            release.wait(2)
            return SUBMISSION
        with patch('rodin_service.provider_json', side_effect=provider):
            job = self.service.submit(self.payload())
            self.assertEqual(job['status'], 'submitting')
            self.assertTrue(entered.wait(1))
            self.assertEqual(self.service.list_jobs()[0]['status'], 'submitting')
            release.set()
            deadline = time.time() + 3
            while self.service.load(job['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)

    def test_repeated_request_never_creates_second_paid_task(self):
        payload = self.payload()
        job_id = self.submitted(payload)
        with patch('rodin_service.provider_json') as provider:
            self.assertEqual(self.service.submit(payload)['id'], job_id)
            another_id = self.payload()
            self.assertEqual(self.service.submit(another_id)['id'], job_id)
            provider.assert_not_called()
    def test_multi_image_fingerprint_distinguishes_order_content_and_count(self):
        first = self.payload([PNG, PNG + b'-second'])
        job_id = self.submitted(first)
        same_group = self.payload([PNG, PNG + b'-second'])
        with patch('rodin_service.provider_json', return_value=SUBMISSION):
            self.assertEqual(self.service.submit(same_group)['id'], job_id)
            distinct = [self.service.submit(self.payload(images)) for images in (
                [PNG + b'-second', PNG], [PNG], [PNG, PNG + b'-second', PNG], [PNG, PNG + b'-changed'])]
            self.assertEqual(len({job_id, *(result['id'] for result in distinct)}), 5)
            for result in distinct:
                deadline = time.time() + 3
                while self.service.load(result['id'])['status'] == 'submitting' and time.time() < deadline:
                    time.sleep(.01)
            self.assertTrue(all(self.service.load(result['id'])['status'] == 'queued' for result in distinct))

    def test_reusing_task_id_for_different_photo_is_rejected(self):
        payload = self.payload()
        self.submitted(payload)
        payload['images'] = [base64.b64encode(PNG + b'changed').decode()]
        with self.assertRaises(ServiceError):
            self.service.submit(payload)

    def test_session_key_can_be_restored_after_restart_with_pending_jobs(self):
        job_id = self.submitted()
        restarted = RodinService(self.temporary.name, '')
        restarted.set_api_key('test-only-key')
        with patch('rodin_service.provider_json', return_value={'jobs': [{'status': 'Generating'}]}) as provider:
            self.assertEqual(restarted.refresh(job_id)['status'], 'generating')
            self.assertEqual(provider.call_args.args[0], 'test-only-key')


    def test_task_subscriptions_are_never_returned_to_browser(self):
        job_id = self.submitted()
        public = self.service.public(self.service.load(job_id))
        serialized = json.dumps(public)
        self.assertNotIn('private-subscription', serialized)
        self.assertNotIn('subscription_key', serialized)
        self.assertNotIn('test-only-key', serialized)

    def test_timeout_is_uncertain_and_not_automatically_resubmitted(self):
        payload = self.payload()
        with patch('rodin_service.provider_json', side_effect=ServiceError('timeout', 502, uncertain=True)) as provider:
            job = self.service.submit(payload)
            deadline = time.time() + 3
            while self.service.load(job['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)
            self.assertEqual(self.service.refresh(job['id'])['status'], 'uncertain')
            self.service.submit(payload)
            provider.assert_called_once()

    def test_definite_provider_rejection_is_failed_not_uncertain(self):
        with patch('rodin_service.provider_json', side_effect=ServiceError('invalid key', 502)):
            job = self.service.submit(self.payload())
            deadline = time.time() + 3
            while self.service.load(job['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)
            self.assertEqual(self.service.refresh(job['id'])['status'], 'failed')

    def test_incomplete_submission_cannot_be_silently_retried(self):
        with patch('rodin_service.provider_json', return_value={'uuid': 'missing-subscription'}):
            job = self.service.submit(self.payload())
            deadline = time.time() + 3
            while self.service.load(job['id'])['status'] == 'submitting' and time.time() < deadline:
                time.sleep(.01)
            self.assertEqual(self.service.refresh(job['id'])['status'], 'uncertain')

    def test_resume_after_restart_preserves_tasks_and_marks_interrupted_submit(self):
        job_id = self.submitted()
        saved = self.service.load(job_id)
        saved['status'] = 'submitting'
        self.service.save(saved)
        restarted = RodinService(self.temporary.name, 'test-only-key')
        self.assertEqual(restarted.list_jobs()[0]['status'], 'uncertain')
        self.assertEqual(restarted.list_jobs()[0]['id'], job_id)

    def test_downloaded_glb_is_saved_and_can_be_restored(self):
        job_id = self.submitted()
        responses = [{'jobs': [{'status': 'Done'}]}, {'list': [{'name': 'asset.glb', 'url': 'https://example.com/model'}]}]
        with patch('rodin_service.provider_json', side_effect=responses), patch('rodin_service.download_glb', return_value=b'local-glb'):
            result = self.service.refresh(job_id)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(self.service.model_path(job_id).read_bytes(), b'local-glb')
        restarted = RodinService(self.temporary.name, 'test-only-key')
        self.assertEqual(restarted.list_jobs()[0]['modelUrl'], result['modelUrl'])

    def test_failed_download_can_retry_without_paid_generation(self):
        job_id = self.submitted()
        responses = [{'jobs': [{'status': 'Done'}]}, {'list': [{'name': 'asset.glb', 'url': 'https://example.com/model'}]}]
        with patch('rodin_service.provider_json', side_effect=responses), patch('rodin_service.download_glb', side_effect=ServiceError('download failed')):
            self.assertEqual(self.service.refresh(job_id)['status'], 'downloading')
        job = self.service.load(job_id)
        job['checked'] = 0
        self.service.save(job)
        with patch('rodin_service.provider_json', return_value=responses[1]) as provider, patch('rodin_service.download_glb', return_value=b'retry-glb'):
            self.assertEqual(self.service.refresh(job_id)['status'], 'ready')
            self.assertEqual(provider.call_args.args[1], 'download')

    def test_unknown_status_does_not_claim_success(self):
        job_id = self.submitted()
        with patch('rodin_service.provider_json', return_value={'jobs': [{'status': 'unrecognized'}]}):
            result = self.service.refresh(job_id)
            self.assertNotEqual(result['status'], 'ready')
            self.assertTrue(result['error'])

    def test_private_download_hosts_and_unsafe_schemes_are_rejected(self):
        for url in ('file:///etc/passwd', 'http://example.com/a.glb', 'https://user:pass@example.com/a.glb', 'https://example.com:bad/a.glb'):
            with self.assertRaises(ServiceError):
                download_glb(url)
        with patch('rodin_service.socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ServiceError):
                download_glb('https://example.com/a.glb')

    def test_provider_auth_error_does_not_echo_body_or_credential(self):
        error = HTTPError('https://api.hyper3d.com/', 401, 'private response', {}, None)
        with patch('rodin_service.build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(ServiceError) as caught:
                provider_json('test-only-key', 'status', {})
            self.assertNotIn('test-only-key', str(caught.exception))
            self.assertNotIn('private response', str(caught.exception))


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        (self.dist / 'index.html').write_text('<html>DeskVerse</html>')
        (self.root / '.env').write_text('RODIN_API_KEY=private-test-key')
        service = RodinService(self.root, 'private-test-key')
        handler = partial(Handler, service=service, csrf='test-token', directory=str(self.dist))
        self.server = DeskVerseServer(('127.0.0.1', 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
    def config_request(self, key, token='test-token', origin=None):
        headers = {'Content-Type': 'application/json', 'X-DeskVerse-Token': token}
        if origin:
            headers['Origin'] = origin
        return urlopen(Request(self.base + '/api/generation/config', data=json.dumps({'apiKey': key}).encode(), headers=headers))

    def test_config_get_post_response_is_unified_and_key_stays_in_memory(self):
        with urlopen(self.base + '/api/generation/config') as response:
            before = json.loads(response.read())
            self.assertFalse(before['sessionKey'])
        with self.config_request('session-only-key') as response:
            after = json.loads(response.read())
            self.assertEqual(set(after), set(before))
            self.assertTrue(after['sessionKey'])
            self.assertNotIn('session-only-key', json.dumps(after))
        with urlopen(self.base + '/api/generation/config') as response:
            self.assertNotIn('session-only-key', response.read().decode())
        for path in self.root.rglob('*'):
            if path.is_file():
                self.assertNotIn(b'session-only-key', path.read_bytes())

    def test_config_rejects_invalid_session_keys(self):
        for key in ('', 'contains space', '中文密钥', 'line\nfeed', 'x' * 4097):
            with self.assertRaises(HTTPError) as caught:
                self.config_request(key)
            self.assertEqual(caught.exception.code, 400)

    def test_in_progress_task_rejects_key_change_but_allows_same_key(self):
        entered, release = threading.Event(), threading.Event()
        def provider(*args):
            entered.set()
            release.wait(2)
            return SUBMISSION
        with patch('rodin_service.provider_json', side_effect=provider):
            payload = {'id': str(uuid4()), 'name': '杯子',
                       'images': [base64.b64encode(PNG).decode()], 'confirmed': True}
            response = urlopen(Request(self.base + '/api/generation/jobs', data=json.dumps(payload).encode(),
                                       headers={'Content-Type': 'application/json', 'X-DeskVerse-Token': 'test-token'}))
            response.read()
            self.assertTrue(entered.wait(1))
            with self.assertRaises(HTTPError) as caught:
                self.config_request('different-key')
            self.assertEqual(caught.exception.code, 409)
            with self.config_request('private-test-key') as same:
                self.assertTrue(json.loads(same.read())['sessionKey'])
            release.set()

    def test_config_mutation_requires_csrf_and_local_origin(self):
        with self.assertRaises(HTTPError) as caught:
            self.config_request('new-key', token='')
        self.assertEqual(caught.exception.code, 403)
        with self.assertRaises(HTTPError) as caught:
            self.config_request('new-key', origin='https://attacker.example')
        self.assertEqual(caught.exception.code, 403)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)
        self.temporary.cleanup()

    def test_config_does_not_return_credential(self):
        with urlopen(self.base + '/api/generation/config') as response:
            data = response.read().decode()
            self.assertIn('"configured": true', data)
            self.assertNotIn('private-test-key', data)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.headers['X-Frame-Options'], 'DENY')

    def test_cross_origin_and_rebinding_hosts_are_rejected(self):
        for headers in ({'Origin': 'https://attacker.example'}, {'Host': 'attacker.example'}):
            with self.assertRaises(HTTPError) as caught:
                urlopen(Request(self.base + '/api/generation/config', headers=headers))
            self.assertEqual(caught.exception.code, 403)

    def test_mutation_requires_csrf_token(self):
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(self.base + '/api/generation/jobs', data=b'{}', headers={'Content-Type': 'application/json'}))
        self.assertEqual(caught.exception.code, 403)

    def test_invalid_body_returns_json_without_contacting_provider(self):
        with patch('rodin_service.provider_json') as provider:
            with self.assertRaises(HTTPError) as caught:
                urlopen(Request(self.base + '/api/generation/jobs', data=b'[]', headers={'Content-Type': 'application/json', 'X-DeskVerse-Token': 'test-token'}))
            self.assertEqual(caught.exception.code, 400)
            provider.assert_not_called()

    def test_dotfiles_are_not_served(self):
        for path in ('/.env', '/%2eenv', '/%2e%2e/.env'):
            with self.assertRaises(HTTPError) as caught:
                urlopen(self.base + path)
            self.assertEqual(caught.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
