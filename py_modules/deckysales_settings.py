import json
import os
import tempfile

import decky


class SettingsManager:
    """
    JSON settings persisted to the plugin's settings directory.

    Two properties matter on a Steam Deck, where suspend and power loss are
    routine:

    - Saves are atomic. The new contents go to a temporary file in the same
      directory, which is then renamed over the old one, so an interrupted
      save leaves the previous settings intact instead of an empty file.
    - An unreadable file is never silently discarded. It is moved aside as
      settings.json.corrupt and the failure is logged, so a user's own API key
      can still be recovered by hand.

    Loading is deferred to first use rather than done at import time: at
    import, logging is not yet wired up, so failures there were invisible.
    """

    def __init__(self, name: str, settings_directory: str):
        self.name = name
        self.settings_directory = settings_directory
        self.settings_file = os.path.join(settings_directory, f"{name}.json")
        self.settings = {}
        self.loaded = False

    def read(self):
        os.makedirs(self.settings_directory, exist_ok=True)
        self.settings = {}
        self.loaded = True

        if not os.path.exists(self.settings_file):
            return

        try:
            with open(self.settings_file, "r", encoding="utf-8") as f:
                raw = f.read()
            if not raw.strip():
                decky.logger.warning("Settings file was empty; starting from defaults")
                return
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("settings file does not contain a JSON object")
            self.settings = data
        except Exception as e:
            backup = self.settings_file + ".corrupt"
            try:
                os.replace(self.settings_file, backup)
            except OSError:
                backup = "(could not be preserved)"
            decky.logger.error(
                f"Could not read settings ({e}). The unreadable file was kept as {backup}; "
                "starting from defaults."
            )

    def ensure_loaded(self):
        if not self.loaded:
            self.read()

    def save(self):
        os.makedirs(self.settings_directory, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix=f".{self.name}.", suffix=".tmp", dir=self.settings_directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self.settings, f, indent=4)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.settings_file)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def getSetting(self, key: str, default):
        self.ensure_loaded()
        return self.settings.get(key, default)

    def setSetting(self, key: str, value):
        self.ensure_loaded()

        # Reject values JSON cannot represent before touching anything. Storing
        # one would make every later save fail until the plugin restarts.
        json.dumps(value)

        previous_exists = key in self.settings
        previous = self.settings.get(key)
        self.settings[key] = value
        try:
            self.save()
        except Exception as e:
            if previous_exists:
                self.settings[key] = previous
            else:
                self.settings.pop(key, None)
            decky.logger.error(f"Failed to save setting {key}: {e}")
            raise
        return value
