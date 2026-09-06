"""Small deterministic mesh primitives. Public coordinates match browser Y-up / +Z forward."""
import math
import bpy
from mathutils import Vector


def xyz(point):
    return Vector((point[0], -point[2], point[1]))


def group(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    return obj


def mesh(name, vertices, faces, material, parent=None, smooth=True):
    data = bpy.data.meshes.new(name + "_MESH")
    data.from_pydata([xyz(v) for v in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(material)
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    return obj


def box(name, center, size, material, parent=None, bevel=0.04):
    vertices = [(center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2)
                for x, y, z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    obj = mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(1,2,6,5),(0,4,7,3)], material, parent, False)
    if bevel:
        mod = obj.modifiers.new("edge_radius", "BEVEL")
        mod.width, mod.segments = bevel, 3
    return obj


def ellipsoid(name, center, radius, material, parent=None, segments=32, rings=18):
    vertices, faces = [], []
    for j in range(rings + 1):
        v = math.pi * j / rings
        for i in range(segments):
            u = 2 * math.pi * i / segments
            vertices.append((center[0] + radius[0]*math.sin(v)*math.cos(u), center[1] + radius[1]*math.cos(v), center[2] + radius[2]*math.sin(v)*math.sin(u)))
    for j in range(rings):
        for i in range(segments):
            a, b = j*segments+i, j*segments+(i+1)%segments
            faces.append((a, a+segments, b+segments, b))
    return mesh(name, vertices, faces, material, parent)


def rod(name, start, end, radius, material, parent=None, tip=None, segments=12):
    start, end = Vector(start), Vector(end)
    direction = (end-start).normalized()
    axis = direction.cross(Vector((0,1,0)))
    if axis.length < 0.001:
        axis = direction.cross(Vector((1,0,0)))
    axis.normalize()
    other = direction.cross(axis)
    vertices = []
    for center, r in [(start, radius), (end, radius if tip is None else tip)]:
        for i in range(segments):
            angle = 2*math.pi*i/segments
            vertices.append(center + r*(axis*math.cos(angle)+other*math.sin(angle)))
    faces = [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    faces += [tuple(reversed(range(segments))), tuple(range(segments,segments*2))]
    return mesh(name, vertices, faces, material, parent)


def loft(name, sections, material, parent=None, segments=40):
    # Sections: longitudinal Z, center Y, half-width X, half-height Y.
    vertices, faces = [], []
    for z,y,w,h in sections:
        for i in range(segments):
            angle = 2*math.pi*i/segments
            ripple = 1 + 0.015*math.sin(i*7+z*17)
            vertices.append((w*math.cos(angle)*ripple,y+h*math.sin(angle)*ripple,z))
    for j in range(len(sections)-1):
        for i in range(segments):
            a,b = j*segments+i,j*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces += [tuple(reversed(range(segments))), tuple(range((len(sections)-1)*segments,len(sections)*segments))]
    return mesh(name, vertices, faces, material, parent)


def bounds(root):
    bpy.context.view_layer.update()
    points = []
    for obj in [root, *root.children_recursive]:
        if obj.type == "MESH":
            for point in obj.bound_box:
                p = obj.matrix_world @ Vector(point)
                points.append((p.x,p.z,-p.y))
    return {"min": [round(min(p[i] for p in points),4) for i in range(3)], "max": [round(max(p[i] for p in points),4) for i in range(3)]}
