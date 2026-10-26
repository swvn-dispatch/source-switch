"""Shared Source Switch configuration defaults."""

DEFAULT_SERVER_PORT = 9294
DEFAULT_DASH_PATH = "/stats"
DEFAULT_POLL_SECS = 5


PLUGIN_FIELDS = [
    {
        "id": "dashboard_settings",
        "label": "Dashboard Settings",
        "type": "section",
        "collapsed": False,
    },
    {
        "id": "dash_enabled",
        "label": "Web Dashboard",
        "type": "select",
        "default": "enabled",
        "options": [
            {"value": "disabled", "label": "Disabled"},
            {"value": "enabled", "label": "Enabled"},
        ],
        "section": "dashboard_settings",
        "description": (
            "Serves a mobile-friendly PWA dashboard for viewing live stream "
            "sessions, connected clients, and swapping sources. On by "
            "default. You may need to expose the configured port in your "
            "docker-compose.yml to reach it from outside the container. "
            "After changing this setting or the port, use the Restart "
            "Dashboard Server action or restart Dispatcharr to apply it."
        ),
    },
    {
        "id": "dash_port",
        "label": "Dashboard Port",
        "type": "number",
        "default": DEFAULT_SERVER_PORT,
        "min": 1024,
        "max": 65535,
        "placeholder": str(DEFAULT_SERVER_PORT),
        "section": "dashboard_settings",
        "description": (
            "TCP port the embedded dashboard server listens on. Use the "
            "Restart Dashboard Server action or restart Dispatcharr after "
            "changing it."
        ),
    },
    {
        "id": "dash_path",
        "label": "Dashboard Mount Path",
        "type": "string",
        "default": DEFAULT_DASH_PATH,
        "placeholder": DEFAULT_DASH_PATH,
        "section": "dashboard_settings",
        "description": (
            "URL path the dashboard is served under, e.g. '/stats' gives "
            "http://<host>:<port>/stats/. Takes effect immediately, no "
            "restart needed."
        ),
    },
]
