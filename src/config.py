"""Shared Source Switch configuration defaults."""

DEFAULT_SERVER_PORT = 9294
DEFAULT_DASH_PATH = "/switch"
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
            "Enable the dashboard to view sessions and clients and switch "
            "live sources. Enabled by default. Save and reload the Source "
            "Switch plugin after changing this setting."
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
            "Port the dashboard listens on inside Dispatcharr (default 9294). "
            "For Docker, you may need to add a port mapping such as "
            "'9294:9294' under ports in docker-compose.yml and recreate the "
            "container. If you change this port, update the mapping to match "
            "the container port. Save and reload the Source Switch plugin "
            "after changing this setting."
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
            "Path used to open the dashboard. For example, the default "
            "'/switch' gives http://<host>:<port>/switch/. Use the host port "
            "from your Docker port mapping if it differs from the dashboard "
            "port. Changes take effect immediately after saving."
        ),
    },
]
