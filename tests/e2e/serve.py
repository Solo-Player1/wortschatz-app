# Static server for D:/wortschatz-app/www with a large listen backlog (python -m http.server uses 5)
import http.server, functools, sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8131
class S(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory='D:/wortschatz-app/www')
H.log_message = lambda *a: None
S(('127.0.0.1', port), H).serve_forever()
