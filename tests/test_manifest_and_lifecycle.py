"""Regression tests for the Dispatcharr manifest-v2 service contract."""

import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def load_plugin_module():
    name = "source_switch_test_plugin"
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, SRC / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeServer:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.service_target = None
        self.stopped = False

    def run(self, stop_event):
        self.service_target = stop_event

    def stop(self):
        self.stopped = True


class ManifestTests(unittest.TestCase):
    def test_manifest_declares_v2_service_capabilities_and_ui_contract(self):
        manifest = json.loads((SRC / "plugin.json").read_text())

        self.assertEqual(manifest["manifest_version"], 2)
        self.assertEqual(manifest["min_dispatcharr_version"], "v0.34.0")
        self.assertEqual(
            manifest["capabilities"],
            ["persistent_service", "network_listener", "proxy_internals", "user_data"],
        )
        self.assertNotIn("fields", manifest)
        self.assertEqual(manifest["actions"][0]["id"], "restart_dash")

    def test_runtime_fields_use_a_collapsible_dashboard_section(self):
        plugin_module = load_plugin_module()
        plugin = plugin_module.Plugin()
        fields = plugin.fields

        self.assertEqual(fields[0], {
            "id": "dashboard_settings",
            "label": "Dashboard Settings",
            "type": "section",
            "collapsed": False,
        })
        self.assertTrue(all(field["section"] == "dashboard_settings" for field in fields[1:]))
        self.assertEqual(plugin.actions[0]["id"], "restart_dash")


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.plugin_module = load_plugin_module()
        self.created_servers = []
        server_module = types.SimpleNamespace(SourceSwitchServer=self._create_server)
        self.plugin_module._server = lambda: server_module
        self.plugin_module._config = lambda: types.SimpleNamespace(DEFAULT_SERVER_PORT=9294)
        self.started_services = []

    def _create_server(self, host, port):
        server = FakeServer(host, port)
        self.created_servers.append(server)
        return server

    def _start_service(self, target, *, name):
        self.started_services.append((target, name))

    def test_construction_does_not_start_a_listener(self):
        self.plugin_module.Plugin()
        self.assertEqual(self.created_servers, [])

    def test_leadership_starts_once_and_loss_stops_owned_server(self):
        plugin = self.plugin_module.Plugin()
        context = {
            "settings": {"dash_enabled": "enabled", "dash_port": 9393},
            "start_service": self._start_service,
        }

        plugin.on_leader_acquired(context)
        plugin.on_leader_acquired(context)

        self.assertEqual(len(self.created_servers), 1)
        self.assertEqual(self.created_servers[0].port, 9393)
        self.assertEqual(self.started_services, [(self.created_servers[0].run, "dashboard")])

        plugin.on_leader_lost(context)
        plugin.on_leader_lost(context)
        self.assertTrue(self.created_servers[0].stopped)

    def test_disabled_leader_does_not_start_listener(self):
        plugin = self.plugin_module.Plugin()
        plugin.on_leader_acquired({"settings": {"dash_enabled": "disabled"}, "start_service": self._start_service})
        self.assertEqual(self.created_servers, [])

    def test_missing_or_null_enabled_setting_uses_the_enabled_default(self):
        plugin = self.plugin_module.Plugin()
        plugin.on_leader_acquired({"settings": {"dash_enabled": None}, "start_service": self._start_service})
        self.assertEqual(len(self.created_servers), 1)

    def test_restart_action_requests_single_plugin_reload(self):
        calls = []

        class Manager:
            @classmethod
            def get(cls):
                return cls()

            def reload_plugin(self, key):
                calls.append(key)

        apps = types.ModuleType("apps")
        plugins = types.ModuleType("apps.plugins")
        loader = types.ModuleType("apps.plugins.loader")
        loader.PluginManager = Manager
        old_modules = {key: sys.modules.get(key) for key in ("apps", "apps.plugins", "apps.plugins.loader")}
        sys.modules.update({"apps": apps, "apps.plugins": plugins, "apps.plugins.loader": loader})
        try:
            result = self.plugin_module.Plugin().run("restart_dash", {}, {})
        finally:
            for key, old_module in old_modules.items():
                if old_module is None:
                    sys.modules.pop(key, None)
                else:
                    sys.modules[key] = old_module

        self.assertEqual(calls, ["source_switch"])
        self.assertEqual(result["status"], "success")
