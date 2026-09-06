"""Trusted entrypoint, invoked after Effect Schema validation. No user Python or paths."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time
import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from geometry import bounds, box, group
from materials import palette
from vehicle import build_vehicle
from dinosaur import build_driver
from preview import render_preview
from export import batch_meshes


def stage(name, **fields):
    print(json.dumps({"stage":name,**fields}),flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job",required=True)
    parser.add_argument("--output",required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    start = time.monotonic()
    envelope = json.loads(Path(args.job).read_text())
    job = envelope["job"]
    # Defense for direct Python callers; the canonical contract lives in domain.
    assert job["version"] == 1 and job["dinosaur"]["species"] in ("trex","raptor","unicorn")
    assert job["dinosaur"]["source"] in ("procedural","studio-trex")
    assert .6 <= job["dinosaur"]["scale"] <= 1.5
    assert 3.5 <= job["vehicle"]["wheelbase"] <= 5.5
    assert 3 <= job["vehicle"]["trackWidth"] <= 5
    assert .8 <= job["vehicle"]["cockpitScale"] <= 1.6
    assert job["dinosaur"]["species"] != "unicorn" or job["dinosaur"]["source"] == "procedural"
    output = Path(args.output).resolve()
    output.mkdir(parents=True,exist_ok=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    stage("prepare",jobId=envelope["jobId"],inputHash=envelope["inputHash"],blender=bpy.app.version_string)
    p = palette(job["seed"])
    stage("load-assets",source=job["dinosaur"]["source"])
    driver = build_driver(job["dinosaur"],p)
    stage("build-driver")
    driver_bounds = bounds(driver)
    hip_width = (driver_bounds["max"][0]-driver_bounds["min"][0])*.78
    cockpit_width = max(1.45,hip_width+.14)*job["vehicle"]["cockpitScale"]
    car = build_vehicle(job["vehicle"],p,cockpit_width)
    stage("build-vehicle",cockpitWidth=cockpit_width)
    vehicle_bounds = bounds(car)
    s = job["dinosaur"]["scale"]*(.78 if job["dinosaur"]["species"]=="raptor" else 1)
    anchors = {"cockpit":[0,1.1,0],"cameraTarget":[0,2,0],"hip":[0,1.1+.85*s,-.7*s],"head":[0,1.1+3.3*s,1.9*s],"tail":[0,1.1+.35*s,-4.5*s]}
    species = job["dinosaur"]["species"]
    identity = {"species":species,"name":"AURELIA" if species=="unicorn" else ("T. REX" if species=="trex" else "RAPTOR"),"classification":"TWIN-HORN UNICORN" if species=="unicorn" else "THEROPOD CLASS","massKg":940 if species=="unicorn" else 8200,"horns":["DINORACE_HORN_L","DINORACE_HORN_R"] if species=="unicorn" else []}
    if species == "unicorn":
        anchors.update({"hip":[0,1.1+.56*s,-.74*s],"head":[0,1.1+3.04*s,1.05*s],"tail":[.38*s,1.1+.30*s,-4.3*s],"cameraTarget":[0,2.5,0]})
    # AABB overlap is an explicit proxy, not a claim of triangle-accurate collision.
    tail_min,tail_max = [-.35,1.1+.2*s,-5.2*s],[.35,1.1+1.1*s,-1.65*s]
    tail_hits = 0
    for obj in car.children_recursive:
        if obj.type == "MESH":
            b = bounds(obj)
            if all(tail_min[i] <= b["max"][i] and tail_max[i] >= b["min"][i] for i in range(3)):
                tail_hits += 1
    fit = {"headClearance":round(anchors["head"][1]-1.55,3),"cockpitWidthDelta":round(cockpit_width-hip_width,3),"tailIntersections":tail_hits,"driverHeight":round(driver_bounds["max"][1]-driver_bounds["min"][1],3),"driverLength":round(driver_bounds["max"][2]-driver_bounds["min"][2],3)}
    stage("fit-driver",**fit)
    colliders=[]
    for name,b in [("VEHICLE",vehicle_bounds),("DRIVER",driver_bounds)]:
        collider = box("DINORACE_COLLIDER_"+name,[(a+c)/2 for a,c in zip(b["min"],b["max"])],[c-a for a,c in zip(b["min"],b["max"])],p["metal"],bevel=0)
        collider.hide_render = True
        collider["collider"] = "aabb-proxy"
        colliders.append(collider.name)
    stage("build-environment")
    if job["output"]["preview"]:
        stage("render-preview")
        render_preview(output)
    stage("optimize")
    if job["scene"]["quality"] == "draft":
        for obj in driver.children_recursive:
            if obj.type == "MESH" and len(obj.data.polygons)>200:
                mod=obj.modifiers.new("draft_budget","DECIMATE")
                mod.ratio=.5
    batch_meshes([car,driver])
    stage("export-glb")
    bpy.ops.export_scene.gltf(filepath=str(output/"scene.glb"),export_format="GLB",export_apply=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
    # Read the exported GLB JSON chunk; counts reflect the browser asset after modifiers.
    binary=(output/"scene.glb").read_bytes()
    length=int.from_bytes(binary[12:16],"little")
    gltf=json.loads(binary[20:20+length])
    triangles=sum(gltf["accessors"][primitive["indices"]]["count"]//3 for m in gltf["meshes"] for primitive in m["primitives"])
    manifest={"version":1,"asset":"scene.glb","preview":"preview.png" if job["output"]["preview"] else None,"jobId":envelope["jobId"],"inputHash":envelope["inputHash"],"pipelineVersion":envelope["pipelineVersion"],"blenderVersion":bpy.app.version_string,"generatedAt":datetime.now(timezone.utc).isoformat(),"durationSeconds":round(time.monotonic()-start,3),"bytes":len(binary),"triangles":triangles,"materials":len(gltf.get("materials",[])),"textures":len(gltf.get("textures",[])),"animations":len(gltf.get("animations",[])),"identity":identity,"objects":{"car":car.name,"driver":driver.name,"wheels":["DINORACE_WHEEL_FL","DINORACE_WHEEL_FR","DINORACE_WHEEL_RL","DINORACE_WHEEL_RR"],"colliders":colliders},"bounds":{"driver":driver_bounds,"vehicle":vehicle_bounds},"anchors":anchors,"fit":fit}
    (output/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    stage("write-manifest",**manifest)


if __name__ == "__main__":
    main()
