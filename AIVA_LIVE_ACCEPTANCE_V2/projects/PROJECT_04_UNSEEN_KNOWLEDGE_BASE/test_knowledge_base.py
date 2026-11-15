import unittest
import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8085"

class TestKnowledgeBaseAPI(unittest.TestCase):
    def test_01_create_valid_note(self):
        payload = {
            "title": "Quantum Computing Principles",
            "content": "Quantum superposition allows qubits to scale exponentially.",
            "tags": "quantum,physics,hardware"
        }
        req = urllib.request.Request(
            f"{BASE_URL}/api/notes",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 201)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(data.get("status"), "created")
            self.assertTrue(data.get("word_count") > 5)

    def test_02_validation_error_empty_title(self):
        payload = {"title": "", "content": "Missing title should fail"}
        req = urllib.request.Request(
            f"{BASE_URL}/api/notes",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 422)

    def test_03_search_functionality(self):
        req = urllib.request.Request(f"{BASE_URL}/api/notes/search?q=quantum")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertTrue(len(data) >= 1)
            self.assertIn("Quantum", data[0]["title"])

    def test_04_stats_aggregation(self):
        req = urllib.request.Request(f"{BASE_URL}/api/stats")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertTrue(data.get("total_notes") >= 1)
            self.assertTrue(data.get("total_words") >= 5)

if __name__ == '__main__':
    unittest.main()
