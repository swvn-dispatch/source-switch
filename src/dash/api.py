"""JSON API handlers (/api/*) and static file serving for the dashboard SPA."""

import json
import logging
import mimetypes
import os

logger = logging.getLogger(__name__)

_STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
# Duplicated from __init__.py's PLUGIN_DB_KEY (see server.py's _settings() for
# why this file-path-loaded module can't just import it directly).
_PLUGIN_KEY = "source_switch"

_CORS_HEADERS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Authorization, Content-Type"),
]


def _json_ok(start_response, data, status="200 OK"):
    body = json.dumps(data).encode()
    start_response(status, [
        ("Content-Type", "application/json"),
        ("Content-Length", str(len(body))),
    ] + _CORS_HEADERS)
    return [body]


def _json_error(start_response, status, message):
    body = json.dumps({"error": message}).encode()
    start_response(status, [
        ("Content-Type", "application/json"),
        ("Content-Length", str(len(body))),
    ] + _CORS_HEADERS)
    return [body]


def cors_preflight(start_response):
    start_response("204 No Content", _CORS_HEADERS)
    return [b""]


def _read_body(environ) -> bytes:
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
        return environ["wsgi.input"].read(length) if length > 0 else b""
    except Exception:
        return b""


def _verify_token(environ) -> bool:
    auth = environ.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return False
    token = auth[7:]
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        AccessToken(token)
        return True
    except Exception:
        return False


def _sessions():
    """Load sibling dash/sessions.py using the same file-path loader pattern."""
    import importlib.util
    import sys
    parent = __name__.rsplit(".", 1)[0] if "." in __name__ else __name__
    mod_name = f"{parent}.sessions"
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions.py")
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


# ------------------------------------------------------------------
# Route handlers
# ------------------------------------------------------------------

def handle_auth_token(environ, start_response):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")

    try:
        data = json.loads(_read_body(environ))
    except Exception:
        return _json_error(start_response, "400 Bad Request", "Invalid JSON")

    username = data.get("username", "")
    password = data.get("password", "")
    if not username or not password:
        return _json_error(start_response, "400 Bad Request", "username and password required")

    from django.contrib.auth import authenticate
    user = authenticate(username=username, password=password)
    if user is None:
        return _json_error(start_response, "401 Unauthorized", "Invalid credentials")

    try:
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        return _json_ok(start_response, {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        })
    except Exception as e:
        logger.error(f"Token generation failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", f"Token error: {e}")


def handle_auth_refresh(environ, start_response):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")

    try:
        data = json.loads(_read_body(environ))
    except Exception:
        return _json_error(start_response, "400 Bad Request", "Invalid JSON")

    refresh_str = data.get("refresh", "")
    if not refresh_str:
        return _json_error(start_response, "400 Bad Request", "refresh required")

    try:
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import TokenError
        token = RefreshToken(refresh_str)
        return _json_ok(start_response, {"access": str(token.access_token)})
    except TokenError:
        return _json_error(start_response, "401 Unauthorized", "Refresh token invalid or expired")


DASHBOARD_DEFAULTS = {
    "show_program": True, "show_metrics": True, "show_source": True,
    "show_stream_profile": True, "show_m3u_profile": True, "show_stats": True,
    "censor_provider": False, "allow_disconnect": True, "allow_stop": True, "allow_switch": True,
    "session_types": ["live", "vod", "catchup"],
}


def dashboard_preferences(settings):
    """Expose only dashboard preferences, preserving defaults on older installs."""
    preferences = {key: settings.get(key) if isinstance(settings.get(key), bool) else default
                   for key, default in DASHBOARD_DEFAULTS.items() if key != "session_types"}
    session_types = settings.get("session_types")
    preferences["session_types"] = ([value for value in session_types if value in DASHBOARD_DEFAULTS["session_types"]]
                                    if isinstance(session_types, list) else DASHBOARD_DEFAULTS["session_types"][:])
    return preferences


def handle_sessions_list(environ, start_response, settings=None):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")

    try:
        sessions = _sessions().list_sessions()
        return _json_ok(start_response, {"sessions": sessions, "count": len(sessions),
                                         "preferences": dashboard_preferences(settings or {})})
    except Exception as e:
        logger.error(f"Sessions list failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_session_detail(environ, start_response, channel_uuid):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")

    try:
        info = _sessions().session_detail(channel_uuid)
        if info is None:
            return _json_error(start_response, "404 Not Found", "Session not found")
        return _json_ok(start_response, info)
    except Exception as e:
        logger.error(f"Session detail failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_media_connections(environ, start_response):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")
    try:
        return _json_ok(start_response, _sessions().media_connections())
    except Exception as e:
        logger.error(f"Media connections lookup failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_channel_streams(environ, start_response, channel_uuid):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")

    try:
        result = _sessions().channel_streams(channel_uuid)
        if "error" in result:
            return _json_error(start_response, "404 Not Found", result["error"])
        return _json_ok(start_response, result)
    except Exception as e:
        logger.error(f"Channel streams lookup failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_channel_switch(environ, start_response, channel_uuid, settings=None):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    if not dashboard_preferences(settings or {})["allow_switch"]:
        return _json_error(start_response, "403 Forbidden", "Source switching is disabled")

    try:
        data = json.loads(_read_body(environ) or b"{}")
    except Exception:
        return _json_error(start_response, "400 Bad Request", "Invalid JSON")

    stream_id = data.get("stream_id")
    if stream_id is None:
        return _json_error(start_response, "400 Bad Request", "stream_id required")

    try:
        result = _sessions().switch_source(channel_uuid, int(stream_id))
        if result.get("status") == "error":
            return _json_error(start_response, "404 Not Found", result.get("message", "Switch failed"))
        return _json_ok(start_response, result)
    except Exception as e:
        logger.error(f"Source switch failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_client_disconnect(environ, start_response, channel_uuid, client_id, settings=None):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    if not dashboard_preferences(settings or {})["allow_disconnect"]:
        return _json_error(start_response, "403 Forbidden", "Client disconnection is disabled")

    try:
        result = _sessions().disconnect_client(channel_uuid, client_id)
        if result.get("status") == "error":
            return _json_error(start_response, "404 Not Found", result.get("message", "Disconnect failed"))
        return _json_ok(start_response, result)
    except Exception as e:
        logger.error(f"Client disconnect failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_channel_stop(environ, start_response, channel_uuid, settings=None):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    if not dashboard_preferences(settings or {})["allow_stop"]:
        return _json_error(start_response, "403 Forbidden", "Stopping streams is disabled")

    try:
        result = _sessions().stop_channel(channel_uuid)
        if result.get("status") == "error":
            return _json_error(start_response, "404 Not Found", result.get("message", "Stop failed"))
        return _json_ok(start_response, result)
    except Exception as e:
        logger.error(f"Channel stop failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def _handle_media_stop(environ, start_response, stop, settings):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    preferences = dashboard_preferences(settings or {})
    if not preferences["allow_stop"] or not preferences["allow_disconnect"]:
        return _json_error(start_response, "403 Forbidden", "Stopping media connections is disabled")
    try:
        result = stop()
        if result.get("status") == "error":
            return _json_error(start_response, "404 Not Found", result.get("message", "Stop failed"))
        return _json_ok(start_response, result)
    except Exception as e:
        logger.error(f"Media connection stop failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_vod_stop(environ, start_response, client_id, settings=None):
    return _handle_media_stop(
        environ, start_response, lambda: _sessions().stop_vod_client(client_id), settings
    )


def handle_catchup_stop(environ, start_response, session_id, settings=None):
    return _handle_media_stop(
        environ, start_response, lambda: _sessions().stop_catchup_session(session_id), settings
    )


def handle_catchup_programmes(environ, start_response):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    try:
        data = json.loads(_read_body(environ) or b"{}")
    except Exception:
        return _json_error(start_response, "400 Bad Request", "Invalid JSON")
    sessions = data.get("sessions")
    if not isinstance(sessions, list):
        return _json_error(start_response, "400 Bad Request", "sessions must be an array")
    try:
        return _json_ok(start_response, {"sessions": _sessions().catchup_programmes(sessions)})
    except Exception as e:
        logger.error(f"Catch-up programme lookup failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_live_programmes(environ, start_response):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if not _verify_token(environ):
        return _json_error(start_response, "401 Unauthorized", "Authentication required")
    if environ.get("REQUEST_METHOD") != "POST":
        return _json_error(start_response, "405 Method Not Allowed", "POST only")
    try:
        data = json.loads(_read_body(environ) or b"{}")
    except Exception:
        return _json_error(start_response, "400 Bad Request", "Invalid JSON")
    channel_uuids = data.get("channel_uuids")
    if not isinstance(channel_uuids, list):
        return _json_error(start_response, "400 Bad Request", "channel_uuids must be an array")
    try:
        return _json_ok(start_response, {"programmes": _sessions().live_programmes(channel_uuids)})
    except Exception as e:
        logger.error(f"Live programme lookup failed: {e}", exc_info=True)
        return _json_error(start_response, "500 Internal Server Error", str(e))


def handle_channel_logo(environ, start_response, channel_uuid):
    # No JWT check: <img> tags can't send an Authorization header, and logos
    # aren't sensitive (Dispatcharr's own logo-cache endpoint is AllowAny too).
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")

    try:
        kind, value = _sessions().channel_logo_info(channel_uuid)
    except Exception as e:
        logger.error(f"Logo lookup failed: {e}", exc_info=True)
        kind, value = None, None

    if kind == "redirect":
        start_response("302 Found", [("Location", value)] + _CORS_HEADERS)
        return [b""]

    if kind == "file":
        if not os.path.isfile(value):
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Not Found\n"]
        mime, _ = mimetypes.guess_type(value)
        mime = mime or "image/jpeg"
        with open(value, "rb") as f:
            data = f.read()
        start_response("200 OK", [
            ("Content-Type", mime),
            ("Content-Length", str(len(data))),
            ("Cache-Control", "public, max-age=14400"),
        ] + _CORS_HEADERS)
        return [data]

    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"Not Found\n"]


def handle_vod_logo(environ, start_response, content_type, content_uuid):
    if environ.get("REQUEST_METHOD") == "OPTIONS":
        return cors_preflight(start_response)
    if environ.get("REQUEST_METHOD") != "GET":
        return _json_error(start_response, "405 Method Not Allowed", "GET only")
    try:
        kind, value = _sessions().vod_logo_info(content_type, content_uuid)
    except Exception as e:
        logger.error(f"VOD logo lookup failed: {e}", exc_info=True)
        kind, value = None, None
    if kind == "redirect":
        start_response("302 Found", [("Location", value)] + _CORS_HEADERS)
        return [b""]
    if kind == "file":
        if not os.path.isfile(value):
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Not Found\n"]
        mime, _ = mimetypes.guess_type(value)
        mime = mime or "image/jpeg"
        with open(value, "rb") as f:
            data = f.read()
        start_response("200 OK", [
            ("Content-Type", mime),
            ("Content-Length", str(len(data))),
            ("Cache-Control", "public, max-age=14400"),
        ] + _CORS_HEADERS)
        return [data]
    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"Not Found\n"]


# ------------------------------------------------------------------
# Static file serving (configurable mount path)
# ------------------------------------------------------------------

def serve_static(mount_path: str, sub_path: str, start_response):
    """Serve files from dash/static/, under a runtime-configurable mount path.

    mount_path: normalized prefix the server routed on, e.g. "/switch" (or "").
    sub_path: request path relative to mount_path, e.g. "/", "/assets/index-x.js".
    """
    rel = sub_path.lstrip("/") or "index.html"

    # Block path traversal
    safe = os.path.normpath(rel)
    if safe.startswith("..") or os.path.isabs(safe):
        start_response("403 Forbidden", [("Content-Type", "text/plain")])
        return [b"Forbidden\n"]

    file_path = os.path.join(_STATIC_DIR, safe)
    if not os.path.isfile(file_path):
        # SPA fallback: always serve index.html for unknown paths
        file_path = os.path.join(_STATIC_DIR, "index.html")
        if not os.path.isfile(file_path):
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Not Found\n"]

    mime, _ = mimetypes.guess_type(file_path)
    mime = mime or "application/octet-stream"

    with open(file_path, "rb") as f:
        data = f.read()

    if mime == "text/html":
        # The SPA build uses relative asset paths (base: './'), so it doesn't
        # know its own mount path at build time. Inject it at request time so
        # the frontend can build correct API/asset URLs.
        base = (mount_path or "") + "/"
        snippet = f'<script>window.__BASE_PATH__={json.dumps(base)};</script>'.encode()
        data = data.replace(b"<head>", b"<head>" + snippet, 1)
        cache_control = "no-cache"
    else:
        cache_control = "public, max-age=3600"

    start_response("200 OK", [
        ("Content-Type", mime),
        ("Content-Length", str(len(data))),
        ("Cache-Control", cache_control),
    ])
    return [data]
