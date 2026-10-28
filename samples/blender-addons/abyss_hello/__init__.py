"""Smallest possible add-on, used to test Abyss' Blender add-on installer (not shipped)."""

bl_info = {
    "name": "Abyss Hello",
    "author": "Phineas",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "category": "Development",
    "description": "Test add-on for the Abyss launcher",
}

import bpy


class ABYSS_OT_hello(bpy.types.Operator):
    bl_idname = "abyss.hello"
    bl_label = "Hello from Abyss"

    def execute(self, context):
        self.report({"INFO"}, "Installed by Abyss")
        return {"FINISHED"}


def register():
    bpy.utils.register_class(ABYSS_OT_hello)


def unregister():
    bpy.utils.unregister_class(ABYSS_OT_hello)
