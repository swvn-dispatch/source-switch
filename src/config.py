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

# Display and behavior settings are read from the database on each dashboard
# refresh. They control presentation only, not access to API actions.
CARD_SETTINGS = [
    ("show_program", "Show program data", True),
    ("show_metrics", "Show metrics line", True),
    ("show_source", "Show source", True),
    ("show_stream_profile", "Show stream profile", True),
    ("show_m3u_profile", "Show M3U profile", True),
    ("show_stats", "Show stats", True),
]
BEHAVIOR_SETTINGS = [
    ("censor_provider", "Censor provider name", False),
    ("allow_disconnect", "Allow disconnecting clients", True),
    ("allow_stop", "Allow killing streams", True),
    ("allow_switch", "Allow swapping streams", True),
]

for section_id, label, fields in (
    ("dashboard_settings", "Dashboard Settings", BEHAVIOR_SETTINGS),
    ("card_customization", "Card Customization", CARD_SETTINGS),
):
    if section_id != "dashboard_settings":
        PLUGIN_FIELDS.append({"id": section_id, "label": label, "type": "section", "collapsed": False})
    if section_id == "card_customization":
        PLUGIN_FIELDS.append({
            "id": "session_types", "label": "Session types", "type": "multiselect",
            "default": ["live", "vod", "catchup"], "section": section_id,
            "options": [{"value": "live", "label": "Live"}, {"value": "vod", "label": "VOD"},
                        {"value": "catchup", "label": "Catch-up"}],
            "description": "Choose which session types appear on the dashboard.",
        })
    for field_id, field_label, default in fields:
        PLUGIN_FIELDS.append({
            "id": field_id, "label": field_label, "type": "boolean",
            "default": default, "section": section_id,
            "description": (
                ("This obscures labels in the dashboard, not data returned by APIs or text embedded in stream names." if field_id == "censor_provider" else "")
                + ("This blocks the Source Switch API action, not Dispatcharr's own API." if field_id.startswith("allow_") else "")
                + (" VOD and catch-up stop and disconnect are the same action, so both must be allowed for either control to be available." if field_id in {"allow_stop", "allow_disconnect"} else "")
            ),
        })
