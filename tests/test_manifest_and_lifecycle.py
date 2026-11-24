"""Regression tests for the Dispatcharr manifest-v2 service contract."""

import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


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

    def run(self, stop_event):
        self.service_target = stop_event


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
        self.assertFalse(manifest.get("actions"))

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
        self.assertTrue(all(field["section"] == "dashboard_settings" for field in fields[1:4]))
        sections = {field["id"]: field for field in fields if field["type"] == "section"}
        self.assertFalse(sections["card_customization"]["collapsed"])
        self.assertNotIn("behavior", sections)

    def test_dashboard_preference_defaults_match_schema(self):
        plugin = load_plugin_module().Plugin()
        preference_ids = {"censor_provider", "allow_disconnect", "allow_stop", "allow_switch"}
        fields = {field["id"]: field for field in plugin.fields if field.get("section") == "card_customization" or field["id"] in preference_ids}
        spec = importlib.util.spec_from_file_location("dashboard_api_test", SRC / "dash" / "api.py")
        api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(api)
        self.assertEqual(api.dashboard_preferences({}), {key: field["default"] for key, field in fields.items()})
        self.assertFalse(api.dashboard_preferences({"show_stats": False})["show_stats"])
        self.assertTrue(api.dashboard_preferences({"show_stats": "false"})["show_stats"])
        self.assertNotIn("dash_port", api.dashboard_preferences({"dash_port": 9294}))
        self.assertEqual(api.dashboard_preferences({"session_types": []})["session_types"], [])
        self.assertEqual(api.dashboard_preferences({"session_types": ["vod", "invalid"]})["session_types"], ["vod"])

    def test_disabled_actions_are_rejected_before_calling_proxy(self):
        spec = importlib.util.spec_from_file_location("dashboard_action_api_test", SRC / "dash" / "api.py")
        api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(api)
        cases = [
            (api.handle_channel_switch, ("channel",), {"allow_switch": False}),
            (api.handle_channel_stop, ("channel",), {"allow_stop": False}),
            (api.handle_client_disconnect, ("channel", "client"), {"allow_disconnect": False}),
            (api.handle_vod_stop, ("client",), {"allow_stop": False}),
            (api.handle_vod_stop, ("client",), {"allow_disconnect": False}),
            (api.handle_catchup_stop, ("session",), {"allow_stop": False}),
            (api.handle_catchup_stop, ("session",), {"allow_disconnect": False}),
        ]
        with mock.patch.object(api, "_verify_token", return_value=True), mock.patch.object(api, "_sessions") as sessions:
            for handler, args, settings in cases:
                with self.subTest(handler=handler.__name__, settings=settings):
                    start = mock.Mock()
                    handler({"REQUEST_METHOD": "POST"}, start, *args, settings)
                    self.assertEqual(start.call_args.args[0], "403 Forbidden")
            sessions.assert_not_called()


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

    def test_leadership_registers_once_and_releases_service_reference(self):
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
        self.assertIsNone(plugin._dashboard_server)
        plugin.on_leader_acquired(context)
        self.assertEqual(len(self.created_servers), 2)

    def test_disabled_leader_does_not_start_listener(self):
        plugin = self.plugin_module.Plugin()
        plugin.on_leader_acquired({"settings": {"dash_enabled": "disabled"}, "start_service": self._start_service})
        self.assertEqual(self.created_servers, [])

    def test_missing_or_null_enabled_setting_uses_the_enabled_default(self):
        plugin = self.plugin_module.Plugin()
        plugin.on_leader_acquired({"settings": {"dash_enabled": None}, "start_service": self._start_service})
        self.assertEqual(len(self.created_servers), 1)

    def test_leadership_uses_current_settings(self):
        plugin = self.plugin_module.Plugin()
        plugin.on_leader_acquired({
            "settings": {"dash_port": 9294},
            "get_settings": lambda: {"dash_port": 9494},
            "start_service": self._start_service,
        })
        self.assertEqual(self.created_servers[0].port, 9494)

    def test_service_registration_failure_is_propagated(self):
        plugin = self.plugin_module.Plugin()
        def fail(*args, **kwargs):
            raise RuntimeError("registration failed")
        with self.assertRaisesRegex(RuntimeError, "registration failed"):
            plugin.on_leader_acquired({"settings": {}, "start_service": fail})
        self.assertIsNone(plugin._dashboard_server)

    def test_bind_failure_is_reported_to_service_runner(self):
        server_module = load_plugin_module()._server()
        stop_event = mock.Mock()
        stop_event.is_set.return_value = False
        with mock.patch.object(server_module, "make_server", side_effect=OSError("port in use")) as make_server:
            with self.assertRaisesRegex(OSError, "port in use"):
                server_module.SourceSwitchServer("0.0.0.0", 9294).run(stop_event)
        self.assertEqual(make_server.call_count, 3)

    def test_dashboard_path_default_and_saved_setting(self):
        server_module = load_plugin_module()._server()
        with mock.patch.object(server_module, "_settings", return_value={}):
            self.assertEqual(server_module._normalized_dash_path(), "/switch")
        with mock.patch.object(server_module, "_settings", return_value={"dash_path": "/stats"}):
            self.assertEqual(server_module._normalized_dash_path(), "/stats")
