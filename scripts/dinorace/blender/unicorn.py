"""Aurelia: original seated equine sculpt, twin spiral horns and swept ribbon hair.

All dimensions are browser Y-up metres. No external meshes or Blender-only shaders.
The fused coat avoids the disconnected-primitive silhouette of the first theropod.
"""
import math
import bpy
from mathutils import Vector
from geometry import ellipsoid, group, mesh, rod
from materials import material


def strand(name, points, radii, mat, parent, sides=10, samples=6):
    """Catmull-Rom tapered tube with a stable frame; hair and horn ridges export as mesh."""
    centers, widths = [], []
    for i in range(len(points)-1):
        a,b,c,d = [Vector(points[max(0,min(len(points)-1,j))]) for j in (i-1,i,i+1,i+2)]
        for step in range(samples):
            t = step/samples
            centers.append((2*b+(c-a)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)*.5)
            widths.append(radii[i]+(radii[i+1]-radii[i])*t)
    centers.append(Vector(points[-1]))
    widths.append(radii[-1])
    vertices, faces = [], []
    for i,(center,width) in enumerate(zip(centers,widths)):
        tangent = (centers[min(i+1,len(centers)-1)]-centers[max(0,i-1)]).normalized()
        axis = tangent.cross(Vector((1,0,0)))
        if axis.length < .01:
            axis = tangent.cross(Vector((0,0,1)))
        axis.normalize()
        other = tangent.cross(axis).normalized()
        for j in range(sides):
            angle = math.tau*j/sides
            vertices.append(center+width*(axis*math.cos(angle)+other*math.sin(angle)))
    for i in range(len(centers)-1):
        for j in range(sides):
            a=i*sides+j
            b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(range((len(centers)-1)*sides,len(centers)*sides))])
    return mesh(name,vertices,faces,mat,parent)


def fuse_coat(parts, parent, mat):
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj=parts[0]
    obj.name="DINORACE_SKULL_AND_COAT"
    remesh=obj.modifiers.new("Continuous_anatomy","REMESH")
    remesh.mode="VOXEL"
    remesh.voxel_size=.047
    remesh.use_smooth_shade=True
    smooth=obj.modifiers.new("Sculpt_relax","SMOOTH")
    smooth.factor=1.15
    smooth.iterations=5
    decimate=obj.modifiers.new("Browser_budget","DECIMATE")
    decimate.ratio=.48
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data=bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    obj.data=data
    obj.parent=parent
    for face in data.polygons:
        face.use_smooth=True
    return obj


def horn(side, parent, gold, ivory):
    root=group("DINORACE_HORN_"+("L" if side<0 else "R"),parent)
    def center(t):
        return Vector((side*(.22+.24*t+.14*t*t),4.43+1.1*t,1.04+.24*t-.41*t*t))
    core=[center(i/48) for i in range(49)]
    widths=[max(.002,.128*(1-i/48)**.75) for i in range(49)]
    strand(root.name+"_CORE",core,widths,gold,root,20,1)
    ridge=[]
    radii=[]
    for i in range(128):
        t=i/127
        a=t*math.tau*6
        radius=.128*(1-t)**.75
        tangent=Vector((side*(.24+.28*t),1.1,.24-.82*t)).normalized()
        axis=tangent.cross(Vector((1,0,0))).normalized()
        other=tangent.cross(axis).normalized()
        ridge.append(center(t)+radius*(axis*math.cos(a)+other*math.sin(a)))
        radii.append(.015*(1-t)+.002)
    strand(root.name+"_IVORY_HELIX",ridge,radii,ivory,root,6,1)
    ellipsoid(root.name+"_COLLAR",(side*.22,4.44,1.04),(.155,.055,.155),gold,root,24,10)
    return root.name


def build_unicorn(spec, palette):
    driver=group("DINORACE_DRIVER")
    coat=material("AURELIA_PEARL_COAT",(.82,.86,.88),.15,.29)
    shader=coat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Coat Weight"].default_value=.38
    shader.inputs["Coat Roughness"].default_value=.22
    gold=material("AURELIA_CHAMPAGNE_GOLD",(.66,.38,.12),.82,.24)
    ivory=material("AURELIA_HORN_IVORY",(.91,.76,.43),.42,.24)
    dark=material("AURELIA_OBSIDIAN",(.012,.016,.027),.18,.24)
    eye=material("AURELIA_SAPPHIRE",(.06,.27,.39),.35,.17)
    rose=material("AURELIA_WARM_SKIN",(.35,.16,.21),.05,.55)
    hair=[material("AURELIA_MANE_"+str(i),color,.32,.31) for i,color in enumerate([
        (.62,.70,.79),(.27,.22,.45),(.48,.38,.62),(.21,.42,.48),(.76,.69,.59)
    ])]
    # Shared palette gives the fictional car a violet / champagne edition.
    palette["paint"]=material("AURELIA_MIDNIGHT_VIOLET",(.13,.055,.24),.7,.24)
    palette["metal"]=gold
    palette["white"]=ivory
    parts=[]
    def flesh(name,center,radius):
        obj=ellipsoid("AURELIA_"+name,center,radius,coat,driver,32,22)
        parts.append(obj)
        return obj
    flesh("PELVIS",(0,1.66,-.74),(.52,.64,.65))
    flesh("BARREL",(0,2.10,-.37),(.50,.78,.62))
    flesh("CHEST",(0,2.60,.02),(.47,.69,.53))
    flesh("NECK_BASE",(0,3.05,.08),(.36,.65,.49))
    flesh("NECK_CREST",(0,3.65,.29),(.28,.60,.46))
    flesh("POLL",(0,4.02,.67),(.29,.45,.40))
    flesh("SKULL",(0,4.14,1.05),(.32,.38,.44))
    parts.append(rod("AURELIA_FACE_BRIDGE",(0,4.13,1.16),(0,3.68,1.92),.29,coat,driver,tip=.23,segments=32))
    flesh("MUZZLE",(0,3.67,1.92),(.29,.23,.34))
    flesh("JAW",(0,3.78,1.35),(.28,.28,.33))
    for side in (-1,1):
        flesh("HAUNCH_"+str(side),(side*.46,1.35,-.71),(.31,.52,.55))
        parts.append(rod("AURELIA_HIND_CANNON_"+str(side),(side*.54,1.27,-.6),(side*.49,.84,.53),.14,coat,driver,tip=.08,segments=20))
        flesh("SHOULDER_"+str(side),(side*.42,2.36,.17),(.22,.45,.30))
        parts.append(rod("AURELIA_FORELEG_"+str(side),(side*.44,2.45,.25),(side*.62,1.80,1.07),.145,coat,driver,tip=.095,segments=20))
        flesh("KNEE_"+str(side),(side*.62,1.80,1.07),(.115,.14,.13))
        parts.append(rod("AURELIA_PASTERN_"+str(side),(side*.62,1.8,1.07),(side*.43,1.56,1.55),.09,coat,driver,tip=.07,segments=20))
        parts.append(strand("AURELIA_EAR_"+str(side),[(side*.23,4.34,.68),(side*.34,4.67,.56),(side*.37,4.91,.62)],[.13,.10,.009],coat,driver,14,6))
    fuse_coat(parts,driver,coat)
    for side in (-1,1):
        ellipsoid("AURELIA_EAR_INNER_"+str(side),(side*.32,4.63,.665),(.06,.16,.025),rose,driver,20,12)
        ellipsoid("AURELIA_EYELID_"+str(side),(side*.30,4.18,1.21),(.052,.099,.13),rose,driver,24,14)
        ellipsoid("AURELIA_EYE_"+str(side),(side*.34,4.18,1.235),(.046,.071,.098),dark,driver,24,14)
        ellipsoid("AURELIA_IRIS_"+str(side),(side*.379,4.185,1.255),(.012,.045,.055),eye,driver,20,14)
        ellipsoid("AURELIA_PUPIL_"+str(side),(side*.388,4.185,1.266),(.008,.028,.04),dark,driver,16,12)
        ellipsoid("AURELIA_EYE_GLINT_"+str(side),(side*.393,4.21,1.278),(.008,.014,.015),coat,driver,12,8)
        strand("AURELIA_BROW_"+str(side),[(side*.28,4.23,1.06),(side*.37,4.27,1.19),(side*.29,4.25,1.35)],[.027,.034,.008],coat,driver)
        ellipsoid("AURELIA_NOSTRIL_"+str(side),(side*.247,3.73,2.04),(.029,.06,.088),dark,driver,20,12)
        strand("AURELIA_LIP_"+str(side),[(side*.17,3.51,2.14),(side*.28,3.51,1.99),(side*.24,3.55,1.77)],[.01,.014,.002],rose,driver,8)
        for name,center in [("FRONT",(side*.43,1.54,1.56)),("REAR",(side*.49,.80,.57))]:
            ellipsoid("AURELIA_HOOF_"+name+str(side),center,(.14,.13,.20),dark,driver,24,14)
            ellipsoid("AURELIA_CORONET_"+name+str(side),(center[0],center[1]+.105,center[2]),(.14,.032,.18),gold,driver,24,10)
        horn(side,driver,gold,ivory)
    # Locks follow a swept crest and fall to alternating sides of the neck.
    for i in range(34):
        t=i/33
        side=-1 if i%3 else 1
        y=4.45-1.78*t
        z=.49-.79*t
        sweep=.42+.30*math.sin(t*math.pi)
        points=[(side*.05,y,z),(side*.22,y+.06,z-.27),(side*sweep,y-.28,z-.56),(side*(sweep+.09),y-.76,z-.82),(side*.30,y-1.05,z-1.03)]
        strand("AURELIA_MANE_LOCK_"+str(i),points,[.06,.082,.074,.04,.002],hair[i%len(hair)],driver,10,6)
    for i in range(8):
        side=-1 if i%2 else 1
        strand("AURELIA_FORELOCK_"+str(i),[(side*.06,4.51,.78),(side*.15,4.51,1.07),(side*(.12+i*.018),4.30,1.38),(side*.27,4.10,1.43)],[.055,.067,.041,.001],hair[i%3],driver,10,6)
    # The long tail clears the cockpit and streams behind the rear wing.
    for i in range(22):
        a=math.tau*i/22
        x=.17*math.cos(a)
        y=.14*math.sin(a)
        strand("AURELIA_TAIL_LOCK_"+str(i),[(x,1.89+y,-1.15),(x*1.5,1.72+y,-1.8),(.30+x,1.42+y,-2.65),(.52+x,1.18+y,-3.5),(.38+x*.3,1.40,-4.25-i*.008)],[.075,.085,.07,.043,.001],hair[i%len(hair)],driver,10,7)
    # A fitted harness and central sapphire anchor the mythic form to motorsport.
    strand("AURELIA_CHEST_HARNESS",[(-.43,2.65,.43),(-.3,2.42,.57),(0,2.34,.59),(.3,2.42,.57),(.43,2.65,.43)],[.025]*5,gold,driver,10,6)
    ellipsoid("AURELIA_BREASTPLATE",(0,2.38,.625),(.105,.14,.035),gold,driver,24,14)
    ellipsoid("AURELIA_CREST_GEM",(0,2.40,.66),(.062,.087,.027),eye,driver,20,12)
    driver.scale *= spec["scale"]
    driver.location.z += 1.1*(1-spec["scale"])
    return driver
