import os
import shutil

import decky

# py_modules/, not the plugin root, is what the loader puts on sys.path, and the
# loader also aliases its own decky_loader.settings into sys.modules as
# "settings". A module named settings.py in the plugin root is therefore never
# the one that gets imported - `from settings import SettingsManager` silently
# returns Decky's own class instead. That shadowing crashed v1.2.3 on startup
# (AttributeError: no attribute 'settings_file'), taking every backend call with
# it. The prefixed name cannot collide; do not rename it back.
from deckysales_settings import SettingsManager


settings = SettingsManager(name="settings", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR)

# Install folders used by earlier releases of this plugin. Decky keeps each
# plugin's settings under ~/homebrew/settings/<install folder>, so without this
# anyone moving over from Deckdeals would start from scratch - losing their
# store selection, wishlist alert baseline and any API key they had entered.
LEGACY_INSTALL_FOLDERS = ("Deckdeals",)


class Plugin:
    async def _main(self):
        settings.ensure_loaded()

    async def _unload(self):
        pass

    async def _migration(self):
        """Import settings from an earlier install, once, if there are none yet."""
        if os.path.exists(settings.settings_file):
            return

        for folder in LEGACY_INSTALL_FOLDERS:
            legacy_file = os.path.join(decky.DECKY_HOME, "settings", folder, "settings.json")
            if not os.path.isfile(legacy_file):
                continue
            try:
                os.makedirs(settings.settings_directory, exist_ok=True)
                # Copy rather than move: the old plugin may still be installed,
                # and it should keep working with its own settings.
                shutil.copy2(legacy_file, settings.settings_file)
                settings.loaded = False
                decky.logger.info(f"Imported settings from the earlier {folder} install")
            except OSError as e:
                decky.logger.error(f"Could not import settings from {folder}: {e}")
            return

    async def settings_load(self, key: str, defaults):
        return settings.getSetting(key, defaults)

    async def settings_save(self, key: str, value):
        # Log only the key; values can include a user's API key.
        decky.logger.info(f"Set {key}")
        return settings.setSetting(key, value)
