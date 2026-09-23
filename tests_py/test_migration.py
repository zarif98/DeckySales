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
PY_MODULES = os.path.join(ROOT, "py_modules")


class DeckyOwnSettingsManager:
    """
    Stand-in for decky_loader's own SettingsManager.

    The loader aliases its internal modules into sys.modules, so an unqualified
    `import settings` from a plugin resolves to Decky's class, not the plugin's.
    That shadowing is what crashed v1.2.3: this class has no settings_file and
    no ensure_loaded, so if main.py ever imports the bare name again, every test
    in this file fails with the same AttributeError the users saw.
    """

    def __init__(self, name, settings_directory=None):
        self.path = os.path.join(settings_directory or "", f"{name}.json")
        self.settings = {}

    def read(self):
        pass

    def commit(self):
        pass

    def getSetting(self, key, default=None):
        return self.settings.get(key, default)

    def setSetting(self, key, value):
        self.settings[key] = value
        return value


def load_plugin(decky_home):
    """
    Import main.py fresh against a fake Decky home directory.

    The import environment mirrors the real loader: py_modules/ is importable,
    the plugin root is not a source of library modules, and sys.modules already
    holds Decky's own "settings" module.
    """
    fake = types.ModuleType("decky")
    fake.logger = logging.getLogger("decky-test")
    fake.DECKY_HOME = decky_home
    fake.DECKY_PLUGIN_SETTINGS_DIR = os.path.join(decky_home, "settings", "DeckySales")
    sys.modules["decky"] = fake

    decoy = types.ModuleType("settings")
    decoy.SettingsManager = DeckyOwnSettingsManager
    sys.modules["settings"] = decoy

    for path in (PY_MODULES, ROOT):
        if path not in sys.path:
            sys.path.insert(0, path)
    for name in ("main", "deckysales_settings"):
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

    def test_uses_the_plugins_own_settings_manager_not_deckys(self):
        # Decky's class is in sys.modules under the name "settings"; importing
        # main must not pick it up. See DeckyOwnSettingsManager.
        main = load_plugin(self.home)

        self.assertIsNot(main.SettingsManager, DeckyOwnSettingsManager)
        self.assertEqual(main.SettingsManager.__module__, "deckysales_settings")
        self.assertTrue(hasattr(main.settings, "settings_file"))
        self.assertTrue(hasattr(main.settings, "ensure_loaded"))

    def test_startup_sequence_runs_clean(self):
        # _migration then _main is the order the loader calls them in, and it is
        # where v1.2.3 raised before the backend could answer a single call.
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin._migration())
        run(plugin._main())

        self.assertEqual(run(plugin.settings_load("stores", "default")), "default")

    def test_save_and_load_through_the_plugin_methods(self):
        main = load_plugin(self.home)
        plugin = main.Plugin()

        run(plugin.settings_save("wishlistAlerts", False))

        self.assertIs(run(plugin.settings_load("wishlistAlerts", True)), False)


if __name__ == "__main__":
    unittest.main()
