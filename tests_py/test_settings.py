"""
Tests for settings.py - the part of the backend that holds a user's own API
key and their wishlist alert history, so losing it is a real regression.

Run with:  python3 -m unittest discover -s tests_py
"""

import json
import logging
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

# settings.py imports the `decky` module the loader injects at runtime.
# Provide a stand-in that records log output.
_fake_decky = types.ModuleType("decky")
_fake_decky.logger = logging.getLogger("decky-test")
sys.modules["decky"] = _fake_decky

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from settings import SettingsManager  # noqa: E402


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "settings.json")

    def manager(self):
        return SettingsManager(name="settings", settings_directory=self.dir)

    def write(self, text):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write(text)

    def test_round_trip(self):
        m = self.manager()
        m.setSetting("itadApiKey", "abc")
        self.assertEqual(self.manager().getSetting("itadApiKey", None), "abc")

    def test_missing_file_gives_defaults(self):
        self.assertEqual(self.manager().getSetting("x", 42), 42)

    def test_loads_lazily_not_at_construction(self):
        self.write('{"x": 1}')
        m = self.manager()
        self.assertFalse(m.loaded)
        self.assertEqual(m.getSetting("x", None), 1)
        self.assertTrue(m.loaded)

    def test_empty_file_starts_from_defaults(self):
        # datbird found a 0-byte settings.json on a real Deck.
        self.write("")
        with self.assertLogs("decky-test", level="WARNING"):
            self.assertEqual(self.manager().getSetting("x", "default"), "default")

    def test_unreadable_file_is_kept_aside_and_logged(self):
        self.write('{"itadApiKey": "user-key", truncated')
        with self.assertLogs("decky-test", level="ERROR") as logs:
            self.assertEqual(self.manager().getSetting("itadApiKey", None), None)
        self.assertTrue(os.path.exists(self.path + ".corrupt"))
        with open(self.path + ".corrupt", encoding="utf-8") as f:
            self.assertIn("user-key", f.read())
        self.assertIn("corrupt", "\n".join(logs.output))

    def test_non_object_json_is_treated_as_unreadable(self):
        self.write("[1, 2, 3]")
        with self.assertLogs("decky-test", level="ERROR"):
            self.assertEqual(self.manager().getSetting("x", "d"), "d")

    def test_interrupted_save_leaves_previous_settings_intact(self):
        m = self.manager()
        m.setSetting("itadApiKey", "keep-me")

        with mock.patch("settings.json.dump", side_effect=OSError("power loss")):
            with self.assertRaises(OSError), self.assertLogs("decky-test", level="ERROR"):
                m.setSetting("wishlistSeen", {"570": "x"})

        with open(self.path, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"itadApiKey": "keep-me"})

    def test_failed_save_is_not_kept_in_memory(self):
        m = self.manager()
        m.setSetting("a", 1)
        with mock.patch("settings.os.replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError), self.assertLogs("decky-test", level="ERROR"):
                m.setSetting("a", 2)
        self.assertEqual(m.getSetting("a", None), 1)

    def test_no_temp_files_left_behind_after_a_failed_save(self):
        m = self.manager()
        with mock.patch("settings.os.replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError), self.assertLogs("decky-test", level="ERROR"):
                m.setSetting("a", 1)
        self.assertEqual([f for f in os.listdir(self.dir) if f.endswith(".tmp")], [])

    def test_value_json_cannot_represent_is_rejected_without_touching_the_file(self):
        m = self.manager()
        m.setSetting("a", 1)
        with self.assertRaises(TypeError):
            m.setSetting("b", object())
        with open(self.path, encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"a": 1})
        self.assertEqual(m.getSetting("b", "absent"), "absent")


if __name__ == "__main__":
    unittest.main()
