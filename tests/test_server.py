from http.client import HTTPConnection
from threading import Thread
from http.server import ThreadingHTTPServer
import json
import unittest

from cartoptimizer.server import Handler
from tests.test_optimizer import sample


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        conn = HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        conn.request(method, path, body, headers or {})
        response = conn.getresponse(); data = response.read(); conn.close()
        return response.status, data, dict(response.getheaders())

    def test_static_gui_and_headers(self):
        status, body, headers = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'Make every toman count', body)
        self.assertEqual(headers['X-Frame-Options'], 'DENY')
        self.assertIn("script-src 'self'", headers['Content-Security-Policy'])

    def test_optimize_http_roundtrip(self):
        status, body, _ = self.request('POST', '/api/optimize', json.dumps(sample()), {'Content-Type':'application/json'})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['total'], 2600)

    def test_json_validation_error(self):
        status, _, _ = self.request('POST', '/api/optimize', '{broken', {'Content-Type':'application/json'})
        self.assertEqual(status, 400)

    def test_other_websites_cannot_write_to_local_server(self):
        status, _, _ = self.request('POST', '/api/optimize', '{}', {'Content-Type':'application/json', 'Origin':'https://evil.example'})
        self.assertEqual(status, 403)
        status, _, _ = self.request('GET', '/', headers={'Host':'evil.example'})
        self.assertEqual(status, 403)

    def test_path_traversal_and_wrong_mime(self):
        self.assertEqual(self.request('GET', '/../models.py')[0], 404)
        self.assertEqual(self.request('POST', '/api/optimize', '{}', {'Content-Type':'text/plain'})[0], 415)


if __name__ == '__main__':
    unittest.main()
