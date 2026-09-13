"""
Tests for main.py's migration from the Deckdeals install folder.

Run with:  python3 -m unittest discover -s tests_py
"""

import asyncio
import importlib
import json
import logging
import os
import sys
import tempfile
import types
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_plugin(decky_home):
    """Import main.py fresh against a fake Decky home directory."""
    fake = types.ModuleType("decky")
    fake.logger = logging.getLogger("decky-test")
    fake.DECKY_HOME = decky_home
    fake.DECKY_PLUGIN_SETTINGS_DIR = os.path.join(decky_home, "settings", "DeckySales")
    sys.modules["decky"] = fake
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    for name in ("main", "settings"):
        sys.modules.pop(name, None)
    return importlib.import_module("main")


def run(coro):
    return asyncio.run(coro)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.legacy = os.path.join(self.home, "settings", "Deckdeals", "settings.json")
        self.current = os.path.join(self.home, "settings", "DeckySales", "settings.json")

    def write(self, path, data):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    def test_imports_deckdeals_settings_on_first_run(self):
        self.write(self.legacy, {"stores": [61, 35], "itadApiKey": "user-key"})
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin._migration())

        self.assertEqual(run(plugin.settings_load("itadApiKey", None)), "user-key")
        self.assertEqual(run(plugin.settings_load("stores", [])), [61, 35])

    def test_leaves_the_old_plugins_settings_in_place(self):
        # Deckdeals may still be installed; it must keep working.
        self.write(self.legacy, {"stores": [61]})
        main = load_plugin(self.home)

        run(main.Plugin()._migration())

        self.assertTrue(os.path.exists(self.legacy))

    def test_never_overwrites_existing_settings(self):
        self.write(self.legacy, {"itadApiKey": "old"})
        self.write(self.current, {"itadApiKey": "current"})
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin._migration())

        self.assertEqual(run(plugin.settings_load("itadApiKey", None)), "current")

    def test_nothing_to_migrate_is_fine(self):
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin._migration())

        self.assertFalse(os.path.exists(self.current))
        self.assertEqual(run(plugin.settings_load("stores", "default")), "default")

    def test_save_and_load_through_the_plugin_methods(self):
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin.settings_save("wishlistAlerts", False))

        self.assertIs(run(plugin.settings_load("wishlistAlerts", True)), False)


if __name__ == "__main__":
    unittest.main()
