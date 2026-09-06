"""Batch static geometry by material without losing independently animated assembly pivots."""
import bpy


def batch_meshes(roots):
    buckets = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for root in roots:
        for obj in list(root.children_recursive):
            if obj.type != "MESH" or "SKULL" in obj.name:
                continue
            if obj.modifiers:
                baked = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
                obj.modifiers.clear()
                obj.data = baked
            materials = tuple(mat.name for mat in obj.data.materials)
            buckets.setdefault((obj.parent.name, materials), []).append(obj)
    for (parent, materials), objects in sorted(buckets.items()):
        if len(objects) < 2:
            continue
        # Join is one of the few operators used: explicit selection and active object
        # make its context deterministic. It preserves UVs, normals and local pivots.
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = parent + "_" + "_".join(materials)
