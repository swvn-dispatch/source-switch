"""Source Switch dashboard server.

Embeds a gevent WSGI server (own port) inside the Dispatcharr plugin process,
since Dispatcharr's plugin system has no route/static-serving hook of its own.
Serves:

  GET  /health                       Health check (loopback only)
  *    {dash_path}/api/*             JSON API (see dash/api.py)
  GET  {dash_path}[/*]               Static SPA (see dash/api.py::serve_static)

`dash_path` (default "/stats") is read from plugin settings on every request
rather than baked in at build/start time, so it can be reconfigured live.
"""

import logging
import socket
import time

logger = logging.getLogger(__name__)

_dash_api = None


def _load_dash_api():
    """Load src/dash/api.py using the same file-path loader as other submodules."""
    global _dash_api
    if _dash_api is not None:
        return _dash_api
    import importlib.util
    import os
    import sys
    parent = __name__.rsplit(".", 1)[0] if "." in __name__ else __name__
    mod_name = f"{parent}.dash_api"
    if mod_name in sys.modules:
        _dash_api = sys.modules[mod_name]
        return _dash_api
    api_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dash", "api.py")
    spec = importlib.util.spec_from_file_location(mod_name, api_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    _dash_api = mod
    return _dash_api


def _settings() -> dict:
    # Duplicates __init__.py's PLUGIN_DB_KEY as a literal rather than importing
    # it -- this module is loaded via the manual spec_from_file_location path
    # loader (see _load_dash_api's docstring below), where normal package-
    # relative imports aren't reliable. Keep this in sync with __init__.py by
    # hand if it ever changes again.
    try:
        from apps.plugins.models import PluginConfig
        return PluginConfig.objects.get(key="source_switch").settings
    except Exception:
        return {}


def _normalized_dash_path() -> str:
    """Return the configured mount path, normalized to e.g. '/stats' (no trailing slash), or '' for root."""
    raw = (_settings().get("dash_path") or "/stats").strip()
    if not raw.startswith("/"):
        raw = "/" + raw
    raw = raw.rstrip("/")
    return raw  # "" means mounted at server root


class SourceSwitchServer:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._server = None
        self._listener = None
        self._greenlet = None
        self.running = False

    # ------------------------------------------------------------------ WSGI

    def wsgi_app(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        remote = environ.get("REMOTE_ADDR", "")
        loopback = remote in ("127.0.0.1", "::1")

        if path == "/health":
            if not loopback:
                start_response("403 Forbidden", [("Content-Type", "text/plain")])
                return [b"Forbidden\n"]
            start_response("200 OK", [("Content-Type", "text/plain")])
            return [b"OK\n"]

        try:
            return self._route(path, environ, start_response)
        finally:
            # Everything below here can touch Django's ORM (settings, channel
            # lookups) outside of Django's own request cycle, which never runs
            # Django's usual request_finished cleanup. Do it ourselves so
            # connections don't accumulate and eventually go stale.
            try:
                from django.db import close_old_connections
                close_old_connections()
            except Exception:
                pass

    def _route(self, path, environ, start_response):
        dash_path = _normalized_dash_path()

        if _settings().get("dash_enabled", "disabled") != "enabled":
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Not Found\n"]

        # Redirect the bare mount root (no trailing slash) so the browser's
        # location bar ends in "/" -- the SPA build uses relative asset paths,
        # which resolve against the current document's directory.
        if dash_path and path == dash_path:
            start_response("302 Found", [("Location", dash_path + "/")])
            return [b""]

        prefix = dash_path if dash_path else ""
        if path == prefix or path.startswith(prefix + "/"):
            sub = path[len(prefix):] or "/"
            if sub.startswith("/api/"):
                return self._handle_api(sub, environ, start_response)
            return _load_dash_api().serve_static(dash_path, sub, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not Found\n"]

    def _handle_api(self, sub_path, environ, start_response):
        api = _load_dash_api()
        method = environ.get("REQUEST_METHOD", "GET")

        if sub_path == "/api/auth/token":
            return api.handle_auth_token(environ, start_response)
        if sub_path == "/api/auth/refresh":
            return api.handle_auth_refresh(environ, start_response)
        if sub_path == "/api/sessions":
            return api.handle_sessions_list(environ, start_response)
        if sub_path == "/api/media-connections":
            return api.handle_media_connections(environ, start_response)
        if sub_path == "/api/catchup/programmes":
            return api.handle_catchup_programmes(environ, start_response)
        if sub_path == "/api/live/programmes":
            return api.handle_live_programmes(environ, start_response)

        import re
        m = re.match(r"^/api/sessions/([^/]+)$", sub_path)
        if m:
            return api.handle_session_detail(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/streams$", sub_path)
        if m:
            return api.handle_channel_streams(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/switch$", sub_path)
        if m:
            return api.handle_channel_switch(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/stop$", sub_path)
        if m:
            return api.handle_channel_stop(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/logo$", sub_path)
        if m:
            return api.handle_channel_logo(environ, start_response, m.group(1))

        m = re.match(r"^/api/vod/(movie|episode)/([^/]+)/logo$", sub_path)
        if m:
            return api.handle_vod_logo(environ, start_response, m.group(1), m.group(2))

        m = re.match(r"^/api/vod/clients/([^/]+)/stop$", sub_path)
        if m:
            return api.handle_vod_stop(environ, start_response, m.group(1))

        m = re.match(r"^/api/catchup/sessions/([^/]+)/stop$", sub_path)
        if m:
            return api.handle_catchup_stop(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/clients/([^/]+)/disconnect$", sub_path)
        if m:
            return api.handle_client_disconnect(environ, start_response, m.group(1), m.group(2))

        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not Found\n"]

    # ------------------------------------------------------------- lifecycle

    def start(self) -> bool:
        if self.running:
            logger.warning("Source Switch server is already running")
            return True

        try:
            from gevent import pywsgi
            import gevent as _gevent
        except ImportError:
            logger.error("gevent is not installed; cannot start Source Switch server")
            return False

        listener = None
        last_error = None
        for attempt in range(1, 4):
            try:
                listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                listener.bind((self.host, self.port))
                listener.listen(128)
                break
            except OSError as e:
                last_error = e
                if listener:
                    listener.close()
                    listener = None
                if attempt < 3:
                    logger.info(
                        "Source Switch: port %s unavailable during leader handoff; retrying (%s)",
                        self.port,
                        e,
                    )
                    time.sleep(0.5)

        if listener is None:
            logger.info("Source Switch: port %s is unavailable (%s)", self.port, last_error)
            return False

        self._listener = listener
        self.running = True

        try:
            def _run():
                try:
                    self._server = pywsgi.WSGIServer(self._listener, self.wsgi_app, log=None)
                    self._server.serve_forever()
                except OSError as e:
                    logger.info("Source Switch server stopped during startup (%s)", e)
                except Exception as e:  # noqa: BLE001
                    logger.error(f"Source Switch server crashed: {e}", exc_info=True)
                finally:
                    self.running = False
                    self._server = None
                    if self._listener:
                        self._listener.close()
                        self._listener = None

            self._greenlet = _gevent.spawn(_run)
            return True
        except Exception as e:  # noqa: BLE001
            self.running = False
            self._listener.close()
            self._listener = None
            logger.error(f"Source Switch server could not start: {e}", exc_info=True)
            return False

    def stop(self):
        if self._server:
            try:
                self._server.stop()
            except Exception:
                pass
        if self._listener:
            try:
                self._listener.close()
            except OSError:
                pass
            self._listener = None
        self.running = False
        logger.info("Source Switch server stopped")

    def is_running(self) -> bool:
        return self.running
