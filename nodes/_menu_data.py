import json
import os
from pathlib import Path
from threading import Lock

import folder_paths


USER_DIR = Path(folder_paths.base_path) / "user" / "AlignLayout"
DATA_FILE = USER_DIR / "menu_data.json"
_lock = Lock()
_legacy_files = (
    (None, "favorites", "add_node_menu_quick.json"),
    ("add_node_menu", "pins", "add_node_menu_pins.json"),
    ("add_node_menu", "last_category", "add_node_menu_last_category.json"),
    ("quick_node_menu", "pins", "quick_menu_pins.json"),
    ("quick_node_menu", "last_category", "quick_menu_last_category.json"),
)


def _read_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _write_menu_data(data):
    USER_DIR.mkdir(parents=True, exist_ok=True)
    temporary_file = DATA_FILE.with_suffix(".json.tmp")
    try:
        with temporary_file.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=4, ensure_ascii=False)
        os.replace(temporary_file, DATA_FILE)
    finally:
        temporary_file.unlink(missing_ok=True)


def _load_menu_data():
    if DATA_FILE.exists():
        return _read_json(DATA_FILE, None)

    data = {
        "favorites": [],
        "add_node_menu": {"pins": {}, "last_category": {}},
        "quick_node_menu": {"pins": {}, "last_category": {}},
    }
    for section, key, filename in _legacy_files:
        target = data if section is None else data[section]
        value = _read_json(USER_DIR / filename, target[key])
        if key == "last_category":
            value = {"root": value} if isinstance(value, str) else (value or {})
        target[key] = value

    _write_menu_data(data)
    if _read_json(DATA_FILE, None) != data:
        raise ValueError("Menu data migration verification failed.")
    for _, _, filename in _legacy_files:
        (USER_DIR / filename).unlink(missing_ok=True)
    return data


def load_menu_data():
    with _lock:
        return _load_menu_data()


def update_menu_data(section, key, value):
    with _lock:
        data = _load_menu_data()
        target = data if section is None else data[section]
        target[key] = value
        _write_menu_data(data)
