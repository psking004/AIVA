from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sqlite3
from pathlib import Path
import urllib.parse

DB_PATH = Path(__file__).parent / "knowledge_base.db"

class NoteHandler(BaseHTTPRequestHandler):
    def _get_db(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self._send_json({'status': 'ok'})

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)

        if url.path in ('/', '/index.html'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write((Path(__file__).parent / "index.html").read_bytes())
            return

        conn = self._get_db()
        cur = conn.cursor()

        if url.path == '/api/notes':
            cur.execute("SELECT * FROM notes ORDER BY id DESC")
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            self._send_json(rows)
            return

        if url.path == '/api/notes/search':
            qs = urllib.parse.parse_qs(url.query)
            q = qs.get('q', [''])[0].strip().lower()
            cur.execute("SELECT * FROM notes WHERE lower(title) LIKE ? OR lower(content) LIKE ?", (f'%{q}%', f'%{q}%'))
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            self._send_json(rows)
            return

        if url.path == '/api/stats':
            cur.execute("SELECT COUNT(*) as total_notes, COALESCE(SUM(word_count), 0) as total_words FROM notes")
            row = dict(cur.fetchone())
            conn.close()
            self._send_json(row)
            return

        conn.close()
        self._send_json({'error': 'Not Found'}, 404)

    def do_POST(self):
        if self.path == '/api/notes':
            length = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(body_raw)
            except Exception:
                self._send_json({'error': 'Invalid JSON'}, 400)
                return

            title = data.get('title', '').strip()
            content = data.get('content', '').strip()
            tags = data.get('tags', '').strip()

            if not title:
                self._send_json({'error': 'Validation error: Title is required'}, 422)
                return

            word_count = len(content.split()) if content else 0
            conn = self._get_db()
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO notes (title, content, tags, word_count) VALUES (?, ?, ?, ?)",
                (title, content, tags, word_count)
            )
            conn.commit()
            new_id = cur.lastrowid
            conn.close()
            self._send_json({'id': new_id, 'title': title, 'word_count': word_count, 'status': 'created'}, 201)
            return

        self._send_json({'error': 'Not Found'}, 404)

    def do_DELETE(self):
        url = urllib.parse.urlparse(self.path)
        if url.path.startswith('/api/notes/'):
            try:
                note_id = int(url.path.split('/')[-1])
            except ValueError:
                self._send_json({'error': 'Invalid ID'}, 400)
                return

            conn = self._get_db()
            cur = conn.cursor()
            cur.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            conn.commit()
            conn.close()
            self._send_json({'id': note_id, 'deleted': True})
            return

        self._send_json({'error': 'Not Found'}, 404)

def run_server(port=8085):
    server = HTTPServer(('127.0.0.1', port), NoteHandler)
    server.serve_forever()

if __name__ == '__main__':
    run_server()
