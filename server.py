from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sqlite3, json, datetime, webbrowser, base64, binascii
ROOT = Path(__file__).resolve().parent
DB = ROOT / 'data' / 'worklog.sqlite3'
DB.parent.mkdir(exist_ok=True)
with sqlite3.connect(DB) as c:
    c.execute('CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL, category TEXT NOT NULL, hours REAL NOT NULL, updated TEXT NOT NULL)')
    if 'attachments' not in [r[1] for r in c.execute('PRAGMA table_info(entries)')]:
        c.execute("ALTER TABLE entries ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")

def validate_attachments(files):
    if not isinstance(files,list) or len(files)>3: raise ValueError('Choose up to 3 files')
    for f in files:
        if not isinstance(f,dict) or not isinstance(f.get('name'),str) or not 1 <= len(f['name']) <= 255: raise ValueError('Invalid file name')
        try: content=base64.b64decode(f['data'],validate=True)
        except (ValueError,KeyError,TypeError,binascii.Error): raise ValueError('Invalid file data')
        if len(content)>1048576 or f.get('size')!=len(content): raise ValueError('Files must be no larger than 1 MB each')
    return json.dumps(files)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT / 'public'), **kw)
    def reply(self, data, status=200):
        body=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/api/entries':
            with sqlite3.connect(DB) as c:
                c.row_factory=sqlite3.Row
                return self.reply([{**dict(r),'attachments':json.loads(r['attachments'])} for r in c.execute('SELECT * FROM entries ORDER BY date DESC, id DESC')])
        if self.path.startswith('/api/'): return self.reply({'error':'Not found'},404)
        return super().do_GET()
    def do_POST(self):
        if self.headers.get('Origin') not in (None, 'http://127.0.0.1:8080', 'http://localhost:8080'): return self.reply({'error':'Invalid origin'},403)
        if self.path != '/api/entries': return self.reply({'error':'Not found'},404)
        try:
            size=int(self.headers.get('Content-Length',0))
            if size < 1 or size > 4400000: raise ValueError('Entry is too large')
            d=json.loads(self.rfile.read(size)); datetime.date.fromisoformat(d['date'])
            title=str(d['title']).strip(); notes=str(d.get('notes','')).strip(); category=d.get('category','Work'); hours=float(d.get('hours',0))
            if not title or len(title)>160: raise ValueError('Enter a title of up to 160 characters')
            if category not in ['Work','Learning','Meeting','Personal']: raise ValueError('Invalid category')
            if not 0 <= hours <= 24: raise ValueError('Hours must be between 0 and 24')
            files=validate_attachments(d.get('attachments',[]))
            values=(d['date'],title,notes,category,hours,datetime.datetime.now().isoformat(),files)
            with sqlite3.connect(DB) as c:
                if d.get('id'):
                    cur=c.execute('UPDATE entries SET date=?,title=?,notes=?,category=?,hours=?,updated=?,attachments=? WHERE id=?', values+(int(d['id']),))
                    if not cur.rowcount: return self.reply({'error':'Entry no longer exists'},404)
                else: c.execute('INSERT INTO entries (date,title,notes,category,hours,updated,attachments) VALUES (?,?,?,?,?,?,?)',values)
            return self.reply({'ok':True})
        except (ValueError,KeyError,TypeError) as e: return self.reply({'error':str(e)},400)
    def do_DELETE(self):
        if self.headers.get('Origin') not in (None, 'http://127.0.0.1:8080', 'http://localhost:8080'): return self.reply({'error':'Invalid origin'},403)
        try:
            if not self.path.startswith('/api/entries/'): return self.reply({'error':'Not found'},404)
            entry_id=int(self.path.rsplit('/',1)[1])
            with sqlite3.connect(DB) as c: c.execute('DELETE FROM entries WHERE id=?',(entry_id,))
            return self.reply({'ok':True})
        except ValueError: return self.reply({'error':'Invalid entry ID'},400)
if __name__ == '__main__':
    app = ThreadingHTTPServer(('127.0.0.1',8080),Handler)
    print('Daily Work is running at http://127.0.0.1:8080',flush=True)
    webbrowser.open('http://127.0.0.1:8080')
    app.serve_forever()

