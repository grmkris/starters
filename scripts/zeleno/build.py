"""Authored concept model. Metres, converted from Y-up layout into Blender Z-up."""
import json
import math
from pathlib import Path
import random
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/zeleno"
PUBLIC = ROOT / "apps/web/public/zeleno"
SOURCE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
random.seed(19)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, hex_color, roughness=.65, metal=0):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*linear, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metal
    return mat


M = {name: material(name, color) for name, color in {
    "Forest": "344c36", "Sage": "718266", "Cream": "eee9d8",
    "Floor": "c1b39b", "Wood": "b99561", "Crate": "d5b77f",
    "Steel": "545f57", "Orange": "d96c36", "Tomato": "c94b32",
    "Leaf": "6b9346", "LeafLight": "94ad59", "Carrot": "e38a38",
    "Potato": "bfa576", "Beet": "8c4966", "Screen": "203e31",
    "Box": "bb8f55", "Ink": "234032", "Ground": "dfddcf",
    "White": "faf8eb", "Yellow": "ecc957", "Rubber": "28352d",
    "Aluminium": "aab4ac", "Soil": "574934", "Vein": "b7c775",
}.items()}

for name, roughness, metal in [("Steel", .35, .85), ("Aluminium", .28, .95), ("Tomato", .33, 0), ("Screen", .23, 0), ("Orange", .36, 0)]:
    shader = M[name].node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal


def loc(v):
    return (v[0], -v[2], v[1])


def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def parent(obj, root):
    if root:
        obj.parent = root
    return obj


def box(name, at, size, mat, bevel=.015, root=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc(at))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(M[mat])
    if bevel:
        mod = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return parent(obj, root)


def sphere(name, at, scale, mat, root=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=loc(at))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    obj.data.materials.append(M[mat])
    for face in obj.data.polygons:
        face.use_smooth = True
    return parent(obj, root)


def text(name, body, at, size, mat, root=None):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.extrude = .001
    curve.align_x = "CENTER"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = loc(at)
    obj.rotation_euler.x = math.pi / 2
    curve.materials.append(M[mat])
    return parent(obj, root)


def cylinder(name, a, b, radius, mat, root=None, radius_end=None, vertices=12):
    av, bv = Vector(loc(a)), Vector(loc(b))
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius_end is None else radius_end, depth=(bv-av).length, location=(av+bv)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (bv-av).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(M[mat])
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return parent(obj, root)


def leaf(name, at, angle, length, width, lift, mat, root=None):
    vertices, faces = [], []
    for row in range(9):
        t = row / 8
        for col in range(5):
            side = (col-2)/2
            w = math.sin(math.pi*t)**.7 * width * side
            forward = length*t
            height = lift*t + .025*math.sin(math.pi*t) + .012*math.sin(t*math.pi*6)*abs(side)
            vertices.append(loc((at[0]+math.cos(angle)*forward-math.sin(angle)*w, at[1]+height+.012*side*side, at[2]+math.sin(angle)*forward+math.cos(angle)*w)))
    for row in range(8):
        for col in range(4):
            i=row*5+col
            faces.append((i,i+1,i+6,i+5))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(M[mat])
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    obj.modifiers.new("Leaf thickness", "SOLIDIFY").thickness=.003
    for face in mesh.polygons: face.use_smooth=True
    parent(obj,root)
    return obj


def produce(kind, at, root=None, prefix="Produce"):
    x,y,z=at
    if kind == "Carrot":
        cylinder(prefix+" tapered root", (x,y,z+.16), (x,y,z-.12), .008, "Carrot", root, .052, 14)
        for i in range(5):
            leaf(prefix+" frond", (x,y,z-.12), -math.pi/2+(i-2)*.28, .11, .02, .025+i*.009, "Leaf",root)
        for i in range(4):
            box(prefix+" root groove", (x,y+.034-i*.004,z-.06+i*.044), (.055-i*.008,.003,.003), "Orange", 0, root)
    elif kind == "Leaf":
        sphere(prefix+" heart",(x,y+.045,z),(.073,.072,.072),"LeafLight",root)
        for i in range(9):
            angle=i*math.pi*2/9
            leaf(prefix+" curled leaf", (x,y-.04,z),angle,.125,.06,.03 if i%2 else .07,"Leaf" if i%3==0 else "LeafLight",root)
            cylinder(prefix+" vein",(x,y-.03,z),(x+math.cos(angle)*.095,y+.02,z+math.sin(angle)*.095),.0025,"Vein",root, .0015,6)
    elif kind == "Tomato":
        body=sphere(prefix+" lobed tomato",at,(.097,.079,.097),"Tomato",root)
        for vertex in body.data.vertices:
            angle=math.atan2(vertex.co.y,vertex.co.x)
            bulge=1+.065*math.cos(angle*5)*(1-abs(vertex.co.z)*.7)
            vertex.co.x*=bulge
            vertex.co.y*=bulge
        cylinder(prefix+" stem",(x,y+.06,z),(x+.009,y+.107,z),.009,"Leaf",root,.005,8)
        for i in range(5):
            leaf(prefix+" calyx",(x,y+.069,z),i*math.pi*2/5,.065,.012,-.013,"Leaf",root)
    else:
        sphere(prefix+" potato",at,(.105,.074,.085),kind,root)
        for i in range(3):
            sphere(prefix+" eye",(x+(i-1)*.035,y+.069,z+.018*(i%2)),(.009,.003,.005),"Wood",root)


cutaway = group("CutawayShell")
roof = group("Roof")
box("Landscape plinth", (0, -.19, .4), (8.5, .18, 4.9), "Ground", .12)
box("Container chassis", (0, -.035, 0), (6.15, .18, 2.5), "Forest", .03)
box("Plywood floor", (0, .075, 0), (5.95, .08, 2.34), "Floor")
for i in range(25):
    box("Floor seam", (-2.88+i*.24, .12, 0), (.008, .002, 2.31), "Wood", 0)
box("Back wall", (0, 1.35, -1.2), (6, 2.5, .09), "Sage")
box("Left wall", (-3, 1.35, 0), (.09, 2.5, 2.4), "Forest")
box("Right wall", (3, 1.35, 0), (.09, 2.5, 2.4), "Forest", root=cutaway)
for i in range(41):
    box("Back corrugation", (-2.94+i*.147, 1.35, -1.145), (.042, 2.43, .025), "Sage", .005)
for x in [-3, 3]:
    for z in [-1.2, 1.2]:
        box("Corner casting", (x, 1.35, z), (.14, 2.6, .14), "Forest", .018)
        for y in [.18, 2.51]:
            box("Corner fitting", (x, y, z), (.19, .17, .19), "Steel")
box("Roof panel", (0, 2.64, 0), (6.16, .1, 2.5), "Forest", root=roof)
for z in [-1.2, 1.2]:
    box("Top beam", (0, 2.56, z), (6.1, .12, .14), "Forest", root=cutaway if z > 0 else None)
box("Shop fascia", (0, 2.35, 1.25), (6.1, .39, .13), "Forest", root=cutaway)
text("Brand", "zeleno.", (-2.1, 2.22, 1.322), .34, "Cream", cutaway)
text("Shop description", "Z VRTA. V SKATLO. ZATE.", (.05, 2.32, 1.322), .095, "Cream", cutaway)
text("Opening hours", "24 / 7", (2.54, 2.29, 1.322), .13, "Yellow", cutaway)
box("Front infill", (-.91, 1.17, 1.19), (4.14, 2.1, .1), "Forest", root=cutaway)
for i in range(27):
    box("Front corrugation", (-2.88+i*.15, 1.15, 1.252), (.055, 2.02, .035), "Sage", .004, cutaway)
box("Hatch surround lower", (2.1, .44, 1.2), (1.8, .7, .14), "Forest")
box("Hatch surround upper", (2.1, 1.99, 1.2), (1.8, .42, .14), "Forest")
for x in [1.24, 2.95]:
    box("Hatch jamb", (x, 1.3, 1.2), (.16, 1.1, .16), "Forest")
box("Pickup counter", (2.1, .8, 1.38), (1.83, .09, .65), "Wood", .025)
hatch = group("PickupHatch")
box("Sliding shutter", (2.1, 1.29, 1.22), (1.54, .9, .045), "Cream", .008, hatch)
for i in range(8):
    box("Shutter line", (2.1, .9+i*.11, 1.249), (1.5, .012, .003), "Floor", .001, hatch)
text("Hatch label", "PREVZEM", (2.1, 1.27, 1.252), .11, "Forest", hatch)
box("Kiosk mount", (.7, 1.25, 1.23), (.64, 1.5, .16), "Cream", .04)
box("Kiosk screen", (.7, 1.58, 1.328), (.49, .56, .025), "Screen", .018)
text("Screen greeting", "Zivjo!", (.7, 1.67, 1.348), .092, "White")
text("Screen prompt", "Kaj bo dobrega?", (.7, 1.5, 1.348), .045, "Cream")
box("Screen button", (.7, 1.4, 1.35), (.27, .045, .01), "Sage", .01)
sphere("Microphone", (.7, 1.21, 1.335), (.025, .025, .01), "Steel")
box("Payment terminal", (.7, .99, 1.35), (.23, .26, .08), "Steel", .03)
box("Card screen", (.7, 1.03, 1.398), (.15, .12, .008), "LeafLight", .004)
text("Voice label", "POVEJ. IZBERI. PREVZEMI.", (-1.1, 1.17, 1.283), .12, "Cream", cutaway)

# Open wooden bins on a two-tier rear rack.
for x in [-2.78, -1.5, -.2, 1.12]:
    box("Rack upright", (x, 1.09, -.99), (.065, 1.92, .065), "Cream")
for y in [.44, 1.14]:
    box("Rack shelf", (-.83, y, -.81), (4.02, .07, .65), "Wood")
    box("Shelf LED channel", (-.83,y-.055,-.53),(4,.026,.032),"Aluminium",.004)
    box("Shelf light diffuser",(-.83,y-.07,-.53),(3.9,.006,.024),"White",.002)
    for col, kind in enumerate(["Tomato", "Carrot", "Leaf", "Potato"]):
        x = -2.29 + col*.97
        box("Crate base", (x, y+.065, -.79), (.85, .045, .54), "Crate")
        for z in [-1.06, -.52]:
            for offset in [.11, .22]:
                box("Crate slat", (x, y+offset, z), (.85, .08, .03), "Crate", .008)
        for sx in [-.416, .416]:
            box("Crate end", (x+sx, y+.145, -.79), (.035, .22, .56), "Wood")
        box("Bin label", (x, y+.16, -.499), (.28, .095, .008), "Cream", .003)
        text("Produce label", ["PARADIZNIK", "KORENJE", "SOLATA", "KROMPIR"][col], (x, y+.148, -.493), .028, "Ink")
        text("Bin number", f"{'B' if y<1 else 'A'}{col+1}", (x-.32,y+.15,-.491),.042,"Ink")
        for sx in [-.36,.36]:
            for offset in [.11,.22]:
                cylinder("Crate screw",(x+sx,y+offset,-.505),(x+sx,y+offset,-.499),.008,"Steel",vertices=8)
        for i in range(6):
            at=(x+(i%3-1)*.23,y+.18,-.8+(i//3-.5)*.23)
            if y>1 and col<3 and i==4:
                stock=group("Stock"+str(col))
                stock.location=loc(at)
                produce(kind,(0,0,0),stock)
            else:
                produce(kind,at)
text("Interior lettering", "LOKALNO. SEZONSKO. DOBRO.", (-.9, 1.98, -1.08), .115, "Cream")

# Rails and a clear aisle to the packing station.
for z in [-.12, .18]:
    box("Overhead linear rail", (0, 2.31, z), (5.65, .09, .065), "Aluminium", .008)
    box("Rail linear bearing groove",(0,2.32,z+.035),(5.52,.022,.01),"Rubber",.002)
    for x in [-2.7,-2,-1,0,1,2,2.7]:
        cylinder("Rail mounting bolt",(x,2.36,z),(x,2.371,z),.017,"Steel",vertices=6)
for x in [-2.6, 2.6]:
    box("Rail hanger", (x, 2.44, .03), (.075, .27, .47), "Cream")
box("Packing bench", (2.07, .77, .23), (1.28, .1, 1.02), "Cream", .025)
for x in [1.53, 2.61]:
    for z in [-.18, .63]:
        box("Bench leg", (x, .43, z), (.075, .67, .075), "Steel")
for z in [i*.115 for i in range(14)]:
    cylinder("Conveyor roller",(1.56,.835,z),(2.58,.835,z),.038,"Aluminium",vertices=16)
for x in [1.52,2.62]:
    box("Conveyor side channel",(x,.805,.72),(.055,.11,1.72),"Steel")
    for z in [.03,.48,.93,1.38]:
        cylinder("Roller shaft",(x-.035,.835,z),(x+.035,.835,z),.016,"Rubber",vertices=8)
box("Scale platform",(2.07,.845,.25),(.82,.018,.64),"Aluminium",.008)
box("Scale readout housing",(2.67,.88,-.11),(.2,.15,.16),"Steel")
box("Scale display",(2.67,.9,-.021),(.15,.07,.009),"Screen",.003)
text("Scale units","kg",(2.67,.875,-.014),.04,"LeafLight")
delivery = group("DeliveryBox")
box("Box base", (2.07, .87, .25), (.77, .06, .58), "Box", .006, delivery)
for x in [1.7, 2.44]:
    box("Box end", (x, 1.025, .25), (.035, .3, .58), "Box", .005, delivery)
for z in [-.025, .525]:
    box("Box side", (2.07, 1.025, z), (.77, .3, .035), "Box", .005, delivery)
text("Box brand", "zeleno.", (2.07, .98, .546), .12, "Forest", delivery)
for i, kind in enumerate(["Tomato", "Carrot", "Leaf"]):
    packed = group("Packed"+str(i))
    packed.parent = delivery
    produce(kind, (1.83+i*.22, 1.065, .25), packed)

for x in [-3.57,3.57]:
    box("Herb planter",(x,.15,1.52),(.53,.4,.58),"Forest",.025)
    box("Planter soil",(x,.354,1.52),(.46,.008,.51),"Soil",.01)
    for i in range(18):
        angle=i*2.4
        at=(x+math.cos(angle)*.085,.36,1.52+math.sin(angle)*.085)
        leaf("Herb leaf",at,angle,.2+(i%3)*.035,.05,.16+(i%4)*.055,"Leaf" if i%2 else "LeafLight")
for x in [-3.2, -1.6, 0, 1.6, 3.2]:
    box("Forecourt paving", (x, -.075, 2.2), (1.5, .025, .74), "Cream", .02)

# Visible construction details for the close-up inspection views.
for x in [-2.78,-1.5,-.2,1.12]:
    for y in [.46,1.16]:
        box("Shelf bracket",(x,y-.1,-.82),(.045,.16,.39),"Aluminium",.006)
    for y in [.3,.7,1.5,1.85]:
        box("Rack adjustment slot",(x, y,-.952),(.019,.05,.007),"Steel",.003)
box("Cable tray",(0,2.41,-.23),(5.5,.065,.13),"Steel",.008)
for i in range(38):
    box("Cable chain rib",(-2.65+i*.14,2.454,-.23),(.055,.025,.14),"Rubber",.003)
for x in [-2.77,2.77]:
    box("Rail limit switch",(x,2.26,.035),(.09,.09,.13),"Orange",.008)
    cylinder("Rail end buffer",(x,2.22,-.02),(x,2.22,.09),.024,"Rubber")
box("Service module",(2.15,1.93,-1.025),(1.21,.6,.24),"Cream",.035)
for i in range(10):
    box("Ventilation louver",(2.3,1.73+i*.042,-.891),(.63,.014,.017),"Steel",.003)
text("Service module label","SERVIS",(1.78,1.92,-.887),.055,"Forest")
box("Cable conduit",(2.85,1.25,-1.075),(.045,2.12,.045),"Aluminium",.005)
for y in [.39,1.14,2.04]:
    box("Conduit clip",(2.85,y,-1.047),(.09,.04,.024),"Steel",.004)
box("Bench lower shelf",(2.07,.31,.2),(1.1,.045,.85),"Wood")
for i in range(5):
    box("Flat packed spare box",(2.06,.35+i*.04,.15),(.86,.032,.54),"Box",.007)
for x in [1.31,2.87]:
    box("Shutter guide",(x,1.3,1.286),(.035,1.02,.033),"Aluminium",.004)
box("Pickup status light",(2.1,1.831,1.284),(1.12,.023,.018),"LeafLight",.004)
box("Pickup lip",(2.1,.864,1.69),(1.72,.03,.035),"Aluminium",.006)
for i in range(5):
    cylinder("Microphone perforation",(.62+i*.04,1.21,1.335),(.62+i*.04,1.21,1.344),.006,"Rubber",vertices=8)
for i in range(3):
    box("Payment key",(.65+i*.05,.916,1.398),(.032,.024,.005),"Cream",.003)
text("Terminal payment label","PRISLONI",(.7,.821,1.326),.035,"Forest")
box("Canopy",(.0,2.61,1.64),(6.18,.065,.87),"Cream",.02,roof)
for x in [-2.85,2.85]:
    cylinder("Canopy stay",(x,2.31,1.23),(x,2.57,2.03),.023,"Steel",roof)
for i in range(29):
    box("Roof rib",(-2.92+i*.21,2.705,0),(.075,.027,2.42),"Sage",.007,roof)
text("Facade subline","PRIDELANO BLIZU. NA VOLJO VEDNO.",(-1.1,.84,1.283),.06,"Cream",cutaway)
for x in [-2.9,2.9]:
    cylinder("Door hinge",(x,.39,1.302),(x,.53,1.302),.022,"Aluminium",cutaway)
    cylinder("Door hinge",(x,1.8,1.302),(x,1.94,1.302),.022,"Aluminium",cutaway)

# A matching rest-pose robot is retained in the editable source. Browser motion
# owns its procedural articulated links, so the preview collection is not exported.
preview = group("PreviewRobot")
box("PreviewCarriage", (.8, 2.23, .03), (.46, .18, .49), "Orange", .04, preview)
for name, a, b in [
    ("PreviewUpper", (.8, 2.12, .03), (.8, 1.52, .67)),
    ("PreviewLower", (.8, 1.52, .67), (.8, 1.12, -.12)),
]:
    av, bv = Vector(loc(a)), Vector(loc(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.085, depth=(bv-av).length, location=(av+bv)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (bv-av).to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(M["Orange"])
    obj.parent = preview
    sphere(name+"Joint", a, (.13, .13, .13), "Steel", preview)
box("PreviewGripper", (.8, 1.05, -.12), (.2, .2, .18), "Steel", .025, preview)

bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.world.color = (.6, .6, .6)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "zeleno.blend"))
# Bake modifiers and batch only within the same movable parent and material.
# This keeps the source editable and cuts the browser's static draw calls.
batches = {}
for obj in list(bpy.context.scene.objects):
    if obj.type not in {"MESH", "FONT"} or obj.name.startswith("Preview"):
        continue
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    key = (obj.parent.name if obj.parent else "Static", obj.data.materials[0].name)
    batches.setdefault(key, []).append(obj)
for (parent_name, material_name), objects in batches.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    objects[0].name = parent_name + "_" + material_name
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if not obj.name.startswith("Preview"):
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(PUBLIC / "container.glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
manifest = {"revision": "detail-02", "blender": bpy.app.version_string, "seed": 19, "units": "metres", "up": "+Y", "front": "+Z", "container": [6, 2.6, 2.4], "source": "assets/zeleno/zeleno.blend", "script": "scripts/zeleno/build.py", "asset": "container.glb", "bytes": (PUBLIC / "container.glb").stat().st_size, "license": "Original project-authored geometry; no third-party assets", "movingNodes": ["CutawayShell", "Roof", "PickupHatch", "DeliveryBox", "Packed0", "Packed1", "Packed2", "Stock0", "Stock1", "Stock2"]}
(SOURCE / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
print(json.dumps(manifest), flush=True)
