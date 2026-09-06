import math
import random
import bpy


def material(name, color, metallic=0, roughness=0.4, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color,1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Color"].default_value = (*color,1)
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def palette(seed):
    skin = material("DR_SCALED_HIDE", (0.19,0.23,0.10), 0.05, 0.58)
    # Embedded image texture exports identically to glTF; no unsupported Blender-only noise node.
    image = bpy.data.images.new("DR_HIDE_256", width=256, height=256)
    rng, pixels = random.Random(seed), []
    for y in range(256):
        for x in range(256):
            cell_x = (x + (4 if (y//8)%2 else 0))%8-4
            cell_y = y%8-4
            scale = max(0,1-(cell_x*cell_x+cell_y*cell_y)/22)
            m = 0.65 + scale*0.42 + rng.random()*0.15 + 0.08*math.sin(x/19)
            pixels.extend((0.17*m,0.21*m,0.085*m,1))
    image.pixels = pixels
    image.pack()
    node = skin.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    skin.node_tree.links.new(node.outputs["Color"],skin.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    return {
        "skin":skin, "belly":material("DR_UNDERSIDE",(0.28,0.26,0.15),0,0.68),
        "ridge":material("DR_SCUTES",(0.065,0.09,0.043),0,0.66),
        "paint":material("DR_VERMILION",(0.72,0.048,0.014),0.65,0.24),
        "carbon":material("DR_CARBON",(0.014,0.019,0.022),0.6,0.32),
        "rubber":material("DR_SLICK",(0.012,0.015,0.018),0,0.72),
        "metal":material("DR_TITANIUM",(0.34,0.39,0.43),0.88,0.21),
        "white":material("DR_IVORY",(0.8,0.82,0.72),0.1,0.4),
        "eye":material("DR_AMBER_IRIS",(0.92,0.42,0.03),0.15,0.17,0.25),
        "black":material("DR_PUPIL",(0.002,0.003,0.002),0,0.1),
        "mouth":material("DR_MOUTH",(0.055,0.016,0.014),0,0.72),
        "red":material("DR_RAIN_LIGHT",(1,0.012,0.005),0,0.25,6),
    }


def uv_project(obj):
    if obj.type != "MESH":
        return
    uv = obj.data.uv_layers.new(name="UVMap")
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (vertex.y*0.65,vertex.z*0.65+vertex.x*0.3)
