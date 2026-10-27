"""Dispatcharr Source Switch plugin.

Mobile-friendly Mantine PWA dashboard showing active live, VOD, and catch-up
connections, connected clients (with disconnect), and a live source-swap
dropdown. It is a plugin-ified, mobile-friendly slice of Dispatcharr's own
Stats page.

Formerly published as "Force Fallback" (settings key `force_fallback`);
renamed because the plugin doesn't do automatic failover, it's a dashboard
for manually switching a channel's source. See _migrate_legacy_settings
below for how existing installs' saved settings carry over.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(_PLUGIN_DIR, "plugin.json")) as _f:
    _PLUGIN_CONFIG = json.load(_f)

PLUGIN_DB_KEY = "source_switch"
_LEGACY_PLUGIN_DB_KEY = "force_fallback"


def _load_submodule(name: str):
    """Load a sibling module by file path.

    importlib.import_module with a relative package requires the parent to be
    in sys.modules. During Dispatcharr reload cycles that entry may be absent,
    producing KeyError or ModuleNotFoundError. Loading by file path sidesteps
    that lookup entirely.
    """
    import importlib.util
    import sys
    full_name = f"{__name__}.{name}"
    if full_name in sys.modules:
        return sys.modules[full_name]
    spec = importlib.util.spec_from_file_location(
        full_name, os.path.join(_PLUGIN_DIR, f"{name}.py")
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = mod
    spec.loader.exec_module(mod)
    return mod


def _config():
    return _load_submodule("config")


def _server():
    return _load_submodule("server")


def _close_db_connections():
    """Release Django DB connections opened outside Django's own request cycle.

    Background threads/init here never go through Django's request_finished
    signal, so connections they open are never cleaned up on their own.
    """
    try:
        from django.db import close_old_connections
        close_old_connections()
    except Exception:
        pass


def _migrate_legacy_settings():
    """One-time carry-over of settings saved under the old "force_fallback"
    key (from before the Source Switch rename) onto the new PLUGIN_DB_KEY row.

    Dispatcharr derives a plugin's settings key from the installed zip's
    folder name, so this rename makes Dispatcharr treat the new build as a
    separate plugin install rather than an upgrade -- this only rescues the
    *data* (dash port/path/enabled), it can't merge the two plugin list
    entries. Idempotent via a sentinel written into the copied settings dict,
    so it only ever overwrites once and never clobbers subsequent edits made
    under the new key.
    """
    try:
        from apps.plugins.models import PluginConfig
        old_cfg = PluginConfig.objects.filter(key=_LEGACY_PLUGIN_DB_KEY).first()
        if not old_cfg or not old_cfg.settings:
            return
        new_cfg = PluginConfig.objects.filter(key=PLUGIN_DB_KEY).first()
        if new_cfg and new_cfg.settings.get("_migrated_from_force_fallback"):
            return
        migrated = dict(old_cfg.settings)
        migrated["_migrated_from_force_fallback"] = True
        if new_cfg:
            new_cfg.settings = migrated
            new_cfg.enabled = old_cfg.enabled
            new_cfg.save(update_fields=["settings", "enabled"])
        else:
            PluginConfig.objects.create(key=PLUGIN_DB_KEY, settings=migrated, enabled=old_cfg.enabled)
        logger.info("Source Switch: migrated settings from the legacy 'Force Fallback' plugin key")
    except Exception as e:
        logger.warning(f"Source Switch: legacy settings migration skipped: {e}")


class Plugin:
    """Dispatcharr Plugin: Source Switch stream dashboard."""

    name        = _PLUGIN_CONFIG["name"]
    description = _PLUGIN_CONFIG["description"]
    version     = _PLUGIN_CONFIG["version"]
    author      = _PLUGIN_CONFIG["author"]
    actions = [
        {
            "id": "restart_dash",
            "label": "Restart Dashboard Server",
            "description": "Reload Source Switch so the elected dashboard service applies the current enabled and port settings.",
            "button_label": "Restart Dashboard Server",
            "button_variant": "filled",
            "button_color": "blue",
        },
    ]

    def __init__(self):
        self._dashboard_server = None
        try:
            _migrate_legacy_settings()
        except Exception as e:
            logger.warning(f"Source Switch legacy settings migration skipped: {e}")
        finally:
            _close_db_connections()

    @property
    def fields(self):
        """Return the runtime settings schema, including its UI section."""
        return _config().PLUGIN_FIELDS

    # Action dispatcher

    def run(self, action: str, params: dict, context: dict):
        if action == "restart_dash":
            try:
                from apps.plugins.loader import PluginManager

                PluginManager.get().reload_plugin(PLUGIN_DB_KEY)
            except Exception as e:
                logger.error("Source Switch dashboard reload request failed", exc_info=True)
                return {"status": "error", "message": f"Could not request dashboard reload: {e}"}
            return {
                "status": "success",
                "message": "Dashboard reload requested. The elected service will apply the current settings shortly.",
            }
        return {"status": "error", "message": f"Unknown action: {action}"}

    # Elected persistent-service lifecycle

    def on_leader_acquired(self, context: dict):
        """Start the listener only while this plugin instance owns leadership."""
        settings = (context or {}).get("settings") or {}
        if settings.get("dash_enabled") == "disabled":
            logger.info("Source Switch dashboard is disabled; elected service will not start")
            self._stop_server()
            return

        result = self._start_server(settings, context["start_service"])
        if result["status"] == "success":
            logger.info("Source Switch elected dashboard service started: %s", result["message"])
        else:
            logger.warning("Source Switch elected dashboard service failed to start: %s", result["message"])

    def on_leader_lost(self, context: dict):
        """Release this process's listener when Dispatcharr revokes leadership."""
        self._stop_server()

    def _start_server(self, settings: dict, start_service) -> dict:
        cfg = _config()
        settings = settings or {}
        port = int(settings.get("dash_port") or cfg.DEFAULT_SERVER_PORT)

        if self._dashboard_server:
            return {
                "status": "success",
                "message": f"Source Switch dashboard service is already registered on port {self._dashboard_server.port}",
            }

        server = _server().SourceSwitchServer(host="0.0.0.0", port=port)
        try:
            start_service(server.run, name="dashboard")
            self._dashboard_server = server
            return {
                "status": "success",
                "message": f"Source Switch dashboard service registered on http://0.0.0.0:{port}/",
            }
        except Exception as e:
            return {"status": "error", "message": f"Could not register dashboard service: {e}"}

    def _stop_server(self):
        server, self._dashboard_server = self._dashboard_server, None
        if server:
            logger.info("Stopping Source Switch dashboard server")
            server.stop()

    # Lifecycle

    def stop(self, context: dict):
        """Called when the plugin is disabled or Dispatcharr shuts down."""
        self._stop_server()
