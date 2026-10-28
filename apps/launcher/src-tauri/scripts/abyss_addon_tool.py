"""Run by Abyss inside Blender 4.2+:  blender -b --python abyss_addon_tool.py -- install <zip>
                                                                                 -- remove <module>

Installs a Blender add-on zip (legacy add-on or 4.2+ extension), enables it and saves the user
preferences; or disables and removes one. Runs in Blender's own Python, so stdlib + bpy only.
The last line printed is the result for Abyss:  ABYSS_RESULT {"ok": true, "module": "...", "kind": "..."}
"""
import json
import sys
import traceback
import zipfile

import bpy


def result(ok, **kw):
    print("ABYSS_RESULT " + json.dumps({"ok": ok, **kw}), flush=True)


def inspect_zip(path):
    """('extension', id) for a zip with blender_manifest.toml, ('addon', module) for a legacy add-on."""
    with zipfile.ZipFile(path) as z:
        # Windows PowerShell's Compress-Archive writes backslashes; read both.
        original = {n.replace("\\", "/"): n for n in z.namelist() if not n.endswith(("/", "\\"))}
        names = list(original)
        manifests = [n for n in names if n.split("/")[-1] == "blender_manifest.toml" and n.count("/") <= 1]
        if manifests:
            import tomllib

            data = tomllib.loads(z.read(original[manifests[0]]).decode("utf-8"))
            return "extension", data["id"]
    tops = {n.split("/")[0] for n in names if "/" in n}
    for top in sorted(tops):
        if f"{top}/__init__.py" in names:
            return "addon", top
    singles = [n for n in names if "/" not in n and n.endswith(".py")]
    if singles:
        return "addon", singles[0][:-3]
    raise ValueError("Not a Blender add-on: no __init__.py, single .py file or blender_manifest.toml")


def install(path):
    kind, name = inspect_zip(path)
    if kind == "extension":
        bpy.ops.extensions.package_install_files(filepath=path, repo="user_default", enable_on_install=True)
        module = f"bl_ext.user_default.{name}"
    else:
        bpy.ops.preferences.addon_install(filepath=path, overwrite=True)
        bpy.ops.preferences.addon_enable(module=name)
        module = name
    bpy.ops.wm.save_userpref()
    result(True, module=module, kind=kind)


def remove(module):
    # addon_remove / package_uninstall redraw the Preferences area, which does not exist in
    # background mode; disable through addon_utils and delete the files ourselves instead.
    import os
    import shutil

    import addon_utils

    path = next((m.__file__ for m in addon_utils.modules() if m.__name__ == module), None)
    if path is None:
        raise ValueError(f"Add-on '{module}' is not installed")
    addon_utils.disable(module, default_set=True)
    target = os.path.dirname(path) if os.path.basename(path) == "__init__.py" else path
    # Only ever delete inside this Blender's user folders, never a bundled or system add-on.
    roots = [bpy.utils.user_resource("SCRIPTS"), bpy.utils.user_resource("EXTENSIONS")]
    if not any(os.path.normcase(os.path.abspath(target)).startswith(os.path.normcase(os.path.abspath(r)) + os.sep) for r in roots if r):
        raise ValueError(f"'{module}' is not a user add-on ({target}); remove it in Blender")
    if os.path.isdir(target):
        shutil.rmtree(target)
    else:
        os.remove(target)
    bpy.ops.wm.save_userpref()
    result(True, module=module)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) != 2 or argv[0] not in ("install", "remove"):
        result(False, error="usage: -- install <zip> | -- remove <module>")
        return
    try:
        (install if argv[0] == "install" else remove)(argv[1])
    except Exception as e:  # noqa: BLE001 - every failure goes back to Abyss as text
        traceback.print_exc()
        result(False, error=f"{type(e).__name__}: {e}")


main()
