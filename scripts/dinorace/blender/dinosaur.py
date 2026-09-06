import math
from pathlib import Path
import bpy
from geometry import bounds, ellipsoid, group, loft, rod, xyz
from materials import uv_project


def build_driver(spec, palette):
    if spec["species"] == "unicorn":
        from unicorn import build_unicorn
        return build_unicorn(spec, palette)
    driver = group("DINORACE_DRIVER")
    p = palette
    if spec["source"] == "studio-trex":
        source = Path(__file__).resolve().parent.parent / "sources" / "studio-trex.glb"
        if not source.is_file():
            raise ValueError("Trusted source missing: scripts/dinorace/sources/studio-trex.glb; use source=procedural or supply a licensed Y-up GLB.")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(source))
        for obj in set(bpy.data.objects)-before:
            if obj.parent is None:
                obj.parent = driver
        b = bounds(driver)
        normalize = 4.25/(b["max"][1]-b["min"][1])
        driver.scale = (normalize,)*3
        driver.location = xyz((-(b["min"][0]+b["max"][0])*normalize/2,.75-b["min"][1]*normalize,-(b["min"][2]+b["max"][2])*normalize/2))
    else:
        sections = [(-5.2,1.25,.018,.025),(-4.6,1.36,.09,.11),(-3.8,1.53,.19,.2),(-3,1.75,.32,.28),(-2.3,1.95,.47,.4),(-1.65,2.05,.67,.58),(-1,2.15,.8,.84),(-.4,2.35,.77,.95),(.15,2.6,.69,.9),(.55,2.9,.53,.77),(.65,3.3,.42,.67),(.85,3.7,.4,.55),(1.15,4.04,.45,.51),(1.45,4.2,.44,.38)]
        loft("DINORACE_TORSO_TAIL",sections,p["skin"],driver)
        ellipsoid("DINORACE_THROAT",(0,3.08,.76),(.29,.7,.19),p["skin"],driver)
        loft("DINORACE_SKULL",[(.87,4.25,.12,.15),(1.1,4.4,.49,.48),(1.5,4.42,.62,.55),(1.9,4.37,.57,.47),(2.35,4.28,.46,.34),(2.8,4.23,.43,.29),(2.99,4.19,.34,.22)],p["skin"],driver)
        ellipsoid("DINORACE_MOUTH_CAVITY",(0,3.95,2.22),(.45,.18,.82),p["mouth"],driver)
        loft("DINORACE_JAW",[(1.3,3.92,.28,.15),(1.7,3.76,.46,.18),(2.25,3.73,.43,.13),(2.8,3.81,.33,.11),(2.97,3.87,.22,.07)],p["skin"],driver)
        for side in [-1,1]:
            ellipsoid(f"DINORACE_ORBIT_{side}",(side*.535,4.56,1.67),(.09,.22,.27),p["ridge"],driver)
            ellipsoid(f"DINORACE_EYE_{side}",(side*.608,4.53,1.77),(.027,.04,.045),p["eye"],driver,20,12)
            ellipsoid(f"DINORACE_PUPIL_{side}",(side*.645,4.53,1.785),(.008,.032,.021),p["black"],driver,12,10)
            ellipsoid(f"DINORACE_BROW_{side}",(side*.55,4.72,1.64),(.10,.075,.30),p["skin"],driver)
            ellipsoid(f"DINORACE_NOSTRIL_{side}",(side*.39,4.36,2.76),(.025,.048,.07),p["black"],driver,12,8)
            ellipsoid(f"DINORACE_THIGH_{side}",(side*.72,1.58,-.65),(.49,.71,.8),p["skin"],driver)
            rod(f"DINORACE_SHIN_{side}",(side*.86,1.55,-.1),(side*.73,.91,.73),.21,p["skin"],driver,tip=.13)
            for toe in range(3):
                x = side*(.56+toe*.14)
                rod(f"DINORACE_TOE_{side}_{toe}",(x,.91,.55),(x,.85,1.18),.07,p["skin"],driver,tip=.045)
                rod(f"DINORACE_CLAW_{side}_{toe}",(x,.85,1.17),(x,.81,1.36),.05,p["white"],driver,tip=.003)
            rod(f"DINORACE_ARM_{side}",(side*.58,2.69,.46),(side*.85,2.08,1.0),.12,p["skin"],driver,tip=.075)
            rod(f"DINORACE_FOREARM_{side}",(side*.85,2.08,1),(side*.52,1.77,1.37),.07,p["skin"],driver,tip=.05)
            for digit in range(2):
                rod(f"DINORACE_HAND_{side}_{digit}",(side*(.5+digit*.12),1.77,1.37),(side*(.45+digit*.12),1.63,1.5),.035,p["white"],driver,tip=.004)
            for j in range(11):
                z = 1.5+j*.125
                x = side*(.40-.06*(j/10))
                length = .12+.10*math.sin(j*1.6)**2
                rod(f"DINORACE_TOOTH_{side}_{j}",(x,4.02,z),(x*.95,4.02-length,z+.025),.045,p["white"],driver,tip=.003,segments=8)
            for j in range(12):
                z = -2.9+j*.34
                ellipsoid(f"DINORACE_SCUTE_{side}_{j}",(side*(.27+.22*math.sin(j/12*math.pi)),2.14+.09*j,z),(.1,.08,.16),p["ridge"],driver,10,6)
        for j in range(13):
            z = -3.8+j*.39
            y = 1.76+j*.115
            rod(f"DINORACE_DORSAL_{j}",(0,y,z),(0,y+.2,z-.14),.105,p["ridge"],driver,tip=.006,segments=8)
        for obj in driver.children_recursive:
            uv_project(obj)
    scale = spec["scale"] * (.78 if spec["species"] == "raptor" else 1)
    driver.scale *= scale
    # Scale about the seated hip, keeping feet and pelvis coupled to the cockpit.
    driver.location.z += 1.1*(1-scale)
    return driver
