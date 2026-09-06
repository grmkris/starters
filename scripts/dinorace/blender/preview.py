import os
import bpy
from geometry import box, xyz
from materials import material


def render_preview(output):
    scene = bpy.context.scene
    ground = box("DINORACE_PREVIEW_TRACK",(0,-.07,0),(200,.1,200),material("PREVIEW_ASPHALT",(.025,.035,.047),.4,.25))
    camera_data = bpy.data.cameras.new("DINORACE_CAMERA_PREVIEW")
    camera = bpy.data.objects.new("DINORACE_CAMERA_PREVIEW",camera_data)
    scene.collection.objects.link(camera)
    camera.location = xyz((10,4.5,13))
    camera.rotation_euler = (xyz((0,2,0))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.lens = 48
    scene.camera = camera
    lamps = []
    for name,pos,power,color,size in [
        ("KEY",(3,10,5),2400,(.65,.82,1),7),
        ("RIM",(-6,7,-3),3400,(.45,.7,1),6),
        ("WARM",(5,5,-6),2100,(1,.32,.1),5),
        ("FRONT",(-2,4,9),1100,(1,.87,.65),5),
    ]:
        data = bpy.data.lights.new("PREVIEW_"+name,"AREA")
        data.energy,data.color,data.shape,data.size = power,color,"DISK",size
        lamp = bpy.data.objects.new(data.name,data)
        scene.collection.objects.link(lamp)
        lamp.location = xyz(pos)
        lamp.rotation_euler = (xyz((0,1.8,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
        lamps.append(lamp)
    scene.world.color = (.045,.055,.075)
    scene.render.resolution_x,scene.render.resolution_y = 1200,800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output / "preview.png")
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    device = os.getenv("DINORACE_BLENDER_RENDER_DEVICE","cpu")
    # CPU is always available. Eevee can use Mesa EGL on headless Linux; no X server.
    if device == "cpu":
        scene.render.engine = "BLENDER_EEVEE_NEXT"
        scene.eevee.taa_render_samples = 32
    else:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX" if device in ("auto","optix") else "CUDA"
            prefs.get_devices()
            available = [d for d in prefs.devices if d.type != "CPU"]
            if not available:
                raise RuntimeError("No compatible GPU")
            for d in available:
                d.use = True
            scene.cycles.device = "GPU"
        except Exception as error:
            print('{"stage":"gpu-fallback","reason":'+__import__('json').dumps(str(error))+'}',flush=True)
    try:
        bpy.ops.render.render(write_still=True)
    except Exception:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        bpy.ops.render.render(write_still=True)
    for obj in [ground,camera,*lamps]:
        bpy.data.objects.remove(obj,do_unlink=True)
