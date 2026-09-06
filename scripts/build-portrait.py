"""Build original creator portraits and studio objects with Blender's bundled Python.

    blender --background --python scripts/build-portrait.py -- --preview
    blender --background --python scripts/build-portrait.py

The portrait is hand-shaped procedural geometry; no generated/reference image
textures or external models are embedded. Output paths are repository-relative.
"""

import argparse
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "creator"
OUT.mkdir(parents=True, exist_ok=True)
ARGS = argparse.ArgumentParser()
ARGS.add_argument("--preview", action="store_true")
ARGS.add_argument("--only", choices=("portrait", "icons", "all"), default="all")
OPTS = ARGS.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
random.seed(8127)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def material(name, color, roughness=0.4, metallic=0, subsurface=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Subsurface Weight"].default_value = subsurface
    p.inputs["Subsurface Radius"].default_value = (1, 0.45, 0.24)
    return mat


def mesh(name, verts, faces, mat, subd=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in data.polygons:
        p.use_smooth = True
    if subd:
        mod = obj.modifiers.new("Sculptural smoothing", "SUBSURF")
        mod.levels = subd
    return obj


def sphere(name, pos, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def paths(name, lines, mat, radius=0.008, resolution=3):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    for points in lines:
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for p, xyz in zip(spline.points, points):
            p.co = (*xyz[:3], 1)
            p.radius = xyz[3] if len(xyz) == 4 else 1
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def gauss(x, z, cx, cz, sx, sz):
    return math.exp(-0.5 * (((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2))


def smooth(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


# Anatomical cross-sections: crown, broad forehead, cheekbones, angular jaw,
# and a rounded chin. Catmull-Rom interpolation avoids separate "ball" features.
PROFILE = [
    (-1.58, 0.02, 0.025, -0.02),
    (-1.48, 0.35, 0.36, 0.02),
    (-1.28, 0.66, 0.58, 0.03),
    (-1.02, 0.82, 0.70, 0.06),
    (-0.60, 0.95, 0.81, 0.08),
    (-0.16, 1.04, 0.87, 0.09),
    (0.32, 1.025, 0.87, 0.10),
    (0.73, 1.06, 0.89, 0.14),
    (1.17, 1.065, 0.925, 0.19),
    (1.54, 0.91, 0.82, 0.22),
    (1.83, 0.57, 0.57, 0.24),
    (1.98, 0.025, 0.025, 0.25),
]


def profile(z):
    z = max(PROFILE[0][0], min(PROFILE[-1][0], z))
    if z >= 1.17:
        cap = math.sqrt(max(.00001, 1 - ((z - 1.17) / .81) ** 2))
        return 1.065 * cap, .925 * cap, .19 + .06 * (z - 1.17) / .81
    if z <= -1.02:
        cap = math.sqrt(max(.00001, 1 - ((z + 1.02) / .56) ** 2))
        return .82 * cap, .70 * cap, .06
    for i in range(len(PROFILE) - 1):
        if PROFILE[i][0] <= z <= PROFILE[i + 1][0]:
            span = PROFILE[i + 1][0] - PROFILE[i][0]
            t = (z - PROFILE[i][0]) / span
            p0, p1 = PROFILE[max(i - 1, 0)], PROFILE[i]
            p2, p3 = PROFILE[i + 1], PROFILE[min(i + 2, len(PROFILE) - 1)]
            return tuple(
                (2*t**3 - 3*t*t + 1)*p1[j]
                + (t**3 - 2*t*t + t)*span*(p2[j]-p0[j])/(p2[0]-p0[0])
                + (-2*t**3 + 3*t*t)*p2[j]
                + (t**3-t*t)*span*(0 if p2[0] == 1.17 and j in (1,2) else (p3[j]-p1[j])/(p3[0]-p1[0]))
                for j in (1, 2, 3)
            )
    return PROFILE[-1][1:]


def sculpt(x, z):
    y = 0
    for side in (-1, 1):
        y -= 0.115 * gauss(x, z, side * 0.56, -0.12, 0.28, 0.29)
        y -= 0.105 * gauss(x, z, side * 0.47, 0.66, 0.33, 0.15)
        y += 0.050 * gauss(x, z, side * 0.49, 0.32, 0.31, 0.18)
        y -= 0.125 * gauss(x, z, side * 0.19, -0.28, 0.11, 0.105)
        y += 0.019 * gauss(x, z, side * 0.41, -0.61, 0.08, 0.20)
    y -= 0.205 * gauss(x, z, 0, 0.29, 0.135, 0.46)
    y -= 0.410 * gauss(x, z, 0, -0.17, 0.175, 0.175)
    y -= 0.100 * gauss(x, z, 0, -0.57, 0.44, 0.22)
    y -= 0.125 * gauss(x, z, 0, -1.11, 0.42, 0.27)
    return y


def face_y(x, z):
    w, d, cy = profile(z)
    c = math.sqrt(max(0.001, 1 - (x / w) ** 2))
    flat = max(.001, 1 - abs(x/w)**2.55)**(1/2.55)
    return cy - d*flat + sculpt(x, z) * c**2


def beard_mask(x, z, front=1):
    ax = abs(x)
    jawline = -0.96 + 0.20 * smooth(0.08, 0.47, ax) + .26*smooth(.61,.98,ax)
    beard = 1 - smooth(jawline - 0.012, jawline + 0.025, z)
    beard *= 1 - smooth(1.04, 1.12, ax)
    # Trimmed connectors, deliberately leaving the upper cheeks bare.
    connector = (1 - smooth(0.035, 0.065, abs(ax - (0.39 + 0.20 * (-z - 0.65)))))
    connector *= smooth(-.91, -.80, z) * (1 - smooth(-0.64, -0.57, z))
    mt = -0.52 - 0.11 * (ax / 0.43) ** 1.55
    mb = mt - 0.070 - 0.012 * (ax / 0.43)
    moustache = smooth(mb - 0.015, mb + 0.010, z) * (1 - smooth(mt - 0.010, mt + 0.02, z))
    moustache *= 1 - smooth(0.35, 0.46, ax)
    moustache *= 0.80 + 0.20*smooth(0, 0.055, ax)
    soul_width = .02 + .09*smooth(-.84,-1.0,z)
    soul = (1 - smooth(soul_width*.4, soul_width, ax)) * (1 - smooth(-0.89, -0.85, z)) * smooth(-1.08, -0.96, z)
    return max(beard, connector, moustache, soul) * smooth(-.05, .10, front)


def skin_material():
    mat = material("Warm olive skin • satin subsurface", (0.46, 0.245, 0.145), .43, subsurface=.065)
    n, l = mat.node_tree.nodes, mat.node_tree.links
    p = n.get("Principled BSDF")
    p.inputs["Specular IOR Level"].default_value = .29
    attr = n.new("ShaderNodeVertexColor")
    attr.layer_name = "Complexion"
    l.new(attr.outputs["Color"], p.inputs["Base Color"])
    groom = n.new("ShaderNodeVertexColor")
    groom.layer_name = "Groom"
    for socket, low, high in [("Roughness",.43,.82),("Specular IOR Level",.29,.075),("Subsurface Weight",.065,0)]:
        mapping = n.new("ShaderNodeMapRange")
        mapping.inputs["To Min"].default_value = low
        mapping.inputs["To Max"].default_value = high
        l.new(groom.outputs["Color"],mapping.inputs["Value"])
        l.new(mapping.outputs["Result"],p.inputs[socket])
    tex = n.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 175
    tex.inputs["Detail"].default_value = 2
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .075
    bump.inputs["Distance"].default_value = .012
    l.new(tex.outputs["Fac"], bump.inputs["Height"])
    l.new(bump.outputs["Normal"], p.inputs["Normal"])
    return mat


def complexion(obj, colors):
    attr = obj.data.color_attributes.new(name="Complexion", type="FLOAT_COLOR", domain="POINT")
    for item, color in zip(attr.data, colors):
        item.color = (*color, 1)
    groom = obj.data.color_attributes.new(name="Groom",type="FLOAT_COLOR",domain="POINT")
    for item, color in zip(groom.data,colors):
        coverage = 1-smooth(.035,.20,color[0])
        item.color = (coverage,coverage,coverage,1)


BASE_SKIN = (0.46, .245, .145)


def skin_color(x, z, front=1):
    blush = gauss(abs(x), z, .67, -.08, .22, .22) * max(0,front)
    nose = gauss(x, z, 0, -.23, .25, .22) * max(0,front)
    skin = (BASE_SKIN[0] + .035*blush + .02*nose,
            BASE_SKIN[1] - .012*blush,
            BASE_SKIN[2] - .004*blush)
    m = beard_mask(x, z, front)
    dark = (.020, .013, .010)
    return tuple(a*(1-m) + b*m for a, b in zip(skin, dark))


def build_head(skin):
    verts, faces, colors = [], [], []
    rings, segs = 320, 320
    for i in range(rings + 1):
        z = -1.58 + 3.56*i/rings
        w, d, cy = profile(z)
        for j in range(segs):
            angle = 2*math.pi*j/segs
            x, c = w*math.sin(angle), math.cos(angle)
            y = cy - d*c
            front = max(0, c)
            if c >= 0:
                y = face_y(x,z)
            y -= .016*beard_mask(x, z, c)
            verts.append((x, y, z))
            colors.append(skin_color(x, z, c))
            if i < rings:
                a = i*segs+j
                b = i*segs+(j+1)%segs
                faces.append((a, b, b+segs, a+segs))
    faces.extend([tuple(range(segs-1, -1, -1)), tuple(rings*segs+j for j in range(segs))])
    obj = mesh("Continuous sculpted head", verts, faces, skin, 1)
    complexion(obj, colors)


def ear(side, skin, ear_inner):
    # Helix folds are one continuous bowl, not stacked ellipsoids.
    verts, faces, colors = [], [], []
    nr, ns = 18, 96
    for k in range(nr + 1):
        r = k/nr
        for j in range(ns):
            t = 2*math.pi*j/ns
            z = .015 + .405*r*math.sin(t)
            x = side*(1.055 + .228*r*math.cos(t) + .035*math.sin(t))
            y = -.04 - .11*r + .085*math.exp(-((r-.55)/.30)**2) - .070*math.exp(-((r-.89)/.10)**2)
            verts.append((x, y, z))
            red = .30*(1-r)
            colors.append((BASE_SKIN[0]*(1-.08*red), BASE_SKIN[1]*(1-.60*red), BASE_SKIN[2]*(1-.35*red)))
            if k < nr:
                a = k*ns+j
                b = k*ns+(j+1)%ns
                faces.append((a, b, b+ns, a+ns))
    obj = mesh(f"{side} ear • carved helix", verts, faces, skin, 1)
    complexion(obj, colors)
    fold = []
    for j in range(45):
        t = -.75 + j/44*3.2
        fold.append((side*(1.065+.116*math.cos(t)), -.114, .02+.275*math.sin(t), .65+.3*math.sin(j/44*math.pi)))
    paths(f"{side} ear antihelix", [fold], ear_inner, .030, 4)
    sphere(f"{side} ear tragus", (side*1.004, -.13, -.10), (.066, .074, .105), ear_inner)


EYE_Z = .32
EYE_X = .47
EYE_W = .355


def eye_border(t):
    dx = EYE_W*math.cos(t)
    dz = (.145 if math.sin(t) > 0 else .094)*math.sin(t)
    dz += .025*dx/EYE_W
    return dx, dz


def eye_y(x, z, side):
    dx, dz = x-side*EYE_X, z-EYE_Z
    h = .155 if dz > 0 else .113
    dome = max(0, 1-(dx/EYE_W)**2-(dz/h)**2)
    return face_y(x, z) - .016 - .075*dome


def disk(name, center, radius, side, mat, lift=.006):
    cx, cz = center
    verts = [(cx, eye_y(cx, cz, side)-lift, cz)]
    faces = []
    ns, nr = 96, 12
    for k in range(1, nr + 1):
        r = radius*k/nr
        for j in range(ns):
            t = 2*math.pi*j/ns
            x, z = cx + r*math.cos(t), cz + r*math.sin(t)
            lid_height = .145 if z-EYE_Z-.025*(x-side*EYE_X)/EYE_W > 0 else .094
            inside = ((x-side*EYE_X)/EYE_W)**2 + ((z-EYE_Z-.025*(x-side*EYE_X)/EYE_W)/lid_height)**2
            y = eye_y(x,z,side)-lift
            if inside > 1:
                y = face_y(x,z) + .045
            verts.append((x, y, z))
            if k == 1:
                faces.append((0, 1+j, 1+(j+1)%ns))
            else:
                a = 1+(k-2)*ns+j
                b = 1+(k-2)*ns+(j+1)%ns
                faces.append((a, b, b+ns, a+ns))
    obj = mesh(name, verts, faces, mat)
    uv = obj.data.uv_layers.new(name="Iris coordinates")
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x-cx)/radius*.5+.5, (co.z-cz)/radius*.5+.5)
    return obj


def iris_material():
    mat = material("Brown iris • radial amber fibers", (.13, .052, .017), .37)
    n, l = mat.node_tree.nodes, mat.node_tree.links
    n.get("Principled BSDF").inputs["Specular IOR Level"].default_value=.07
    uv = n.new("ShaderNodeTexCoord")
    sep = n.new("ShaderNodeSeparateXYZ")
    l.new(uv.outputs["UV"], sep.inputs[0])
    axes = []
    for axis in ("X", "Y"):
        sub = n.new("ShaderNodeMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = .5
        l.new(sep.outputs[axis], sub.inputs[0])
        axes.append(sub)
    angle = n.new("ShaderNodeMath")
    angle.operation = "ARCTAN2"
    l.new(axes[0].outputs[0], angle.inputs[0])
    l.new(axes[1].outputs[0], angle.inputs[1])
    mult = n.new("ShaderNodeMath")
    mult.operation = "MULTIPLY"
    mult.inputs[1].default_value = 127
    l.new(angle.outputs[0], mult.inputs[0])
    sine = n.new("ShaderNodeMath")
    sine.operation = "SINE"
    l.new(mult.outputs[0], sine.inputs[0])
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (.036, .013, .005, 1)
    ramp.color_ramp.elements[1].color = (.13, .047, .013, 1)
    l.new(sine.outputs[0], ramp.inputs[0])
    l.new(ramp.outputs[0], n.get("Principled BSDF").inputs["Base Color"])
    return mat


def build_eyes(skin, lid_mat, white, iris, pupil, brow):
    catchlight = material("Reflected photographic softbox",(.92,.94,1),.18)
    catchlight.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value=(.7,.78,1,1)
    catchlight.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value=.4
    for side in (-1, 1):
        verts, faces = [], []
        ns, nr = 128, 24
        cx = side*EYE_X
        for k in range(nr+1):
            r = k/nr
            for j in range(ns):
                dx, dz = eye_border(2*math.pi*j/ns)
                x, z = cx+dx*r, EYE_Z+dz*r
                verts.append((x, eye_y(x, z, side), z))
                if k < nr:
                    a, b = k*ns+j, k*ns+(j+1)%ns
                    faces.append((a, b, b+ns, a+ns))
        mesh(f"{side} almond sclera", verts, faces, white)
        verts, faces, colors = [], [], []
        for k in range(7):
            r = k/6
            for j in range(ns):
                t = 2*math.pi*j/ns
                dx, dz = eye_border(t)
                x = cx+dx*(1+.21*r)
                z = EYE_Z+dz + math.sin(t)*.11*r
                ix, iz = cx+dx, EYE_Z+dz
                inner = face_y(ix,iz)-eye_y(ix,iz,side)+.006
                fold = .016 if math.sin(t)>0 else .009
                y = face_y(x,z)-inner*(1-r)**2-fold*math.sin(math.pi*r)**2
                verts.append((x, y, z))
                colors.append(skin_color(x,z))
                if k < 6:
                    a,b=k*ns+j,k*ns+(j+1)%ns
                    faces.append((a,b,b+ns,a+ns))
        obj = mesh(f"{side} integrated eyelids", verts, faces, skin, 1)
        complexion(obj, colors)
        rim = []
        for j in range(65):
            t = j/64*math.pi
            dx,dz=eye_border(t)
            x,z=cx+dx,EYE_Z+dz
            rim.append((x, eye_y(x,z,side)-.013, z, .45+.55*math.sin(t)))
        paths(f"{side} upper lid lash line", [rim], brow, .005)
        lower=[]
        for j in range(65):
            t=math.pi+j/64*math.pi
            dx,dz=eye_border(t)
            x,z=cx+dx,EYE_Z+dz
            lower.append((x,eye_y(x,z,side)-.010,z,.5+.4*abs(math.sin(t))))
        paths(f"{side} warm lower eyelid rim", [lower], lid_mat, .006)
        center=(cx-side*.012,EYE_Z+.018)
        disk(f"{side} dark limbal ring",center,.125,side,pupil)
        disk(f"{side} brown iris",center,.116,side,iris,.008)
        disk(f"{side} pupil",center,.076,side,pupil,.011)
        for dx,dz,r in [(-.036,.040,.015),(.028,-.028,.005)]:
            xx,zz=center[0]+dx,center[1]+dz
            sphere(f"{side} eye catchlight",(xx,eye_y(xx,zz,side)-.019,zz),(r,.002,r*.76),catchlight)


def brows(brow):
    for side in (-1,1):
        verts,faces=[],[]
        for i in range(65):
            t=i/64
            x=side*(.15+.73*t)
            z=.655+.103*math.sin(math.pi*t)-.045*t
            width=.070*max(.002,math.sin(math.pi*t))**.45
            for j in range(9):
                r=(j/8-.5)*2
                zz=z+width*r
                yy=face_y(x,zz)-.018-.034*max(0,1-r*r)*math.sin(math.pi*(.08+.9*t))
                verts.append((x,yy,zz))
                if i<64 and j<8:
                    a=i*9+j
                    faces.append((a,a+1,a+10,a+9))
        mesh(f"{side} sculpted dark eyebrow",verts,faces,brow,1)
        hair=[]
        for i in range(180):
            t=random.random()
            x=side*(.15+.73*t)
            z=.655+.103*math.sin(math.pi*t)-.045*t
            width=.055*math.sin(math.pi*t)**.45
            zz=z+random.uniform(-width,width)
            line=[]
            for k in range(4):
                u=k/3
                xx=x+side*.04*u
                z2=zz+.032*math.sin(u*math.pi/2)
                line.append((xx,face_y(xx,z2)-.049-.006*math.sin(u*math.pi),z2,.3+.65*math.sin(math.pi*u)))
            hair.append(line)
        paths(f"{side} groomed eyebrow strands",hair,brow,.0025,2)


def mouth(lips, seam):
    half=.405
    def seam_z(x):
        u=x/half
        return -.702+.053*u*u-.012*math.exp(-(u/.21)**2)
    for upper in (True,False):
        verts,faces=[],[]
        for i in range(81):
            x=-half+2*half*i/80
            u=x/half
            taper=max(0,1-u*u)**.7
            zs=seam_z(x)
            if upper:
                boundary=zs+taper*(.048+.035*math.exp(-((abs(u)-.27)/.2)**2))
            else:
                boundary=zs-.088*taper
            for j in range(9):
                t=j/8
                z=zs+(boundary-zs)*t
                y=face_y(x,z)-.009-.042*taper*(1-t*.9)-.020*taper*math.sin(math.pi*t)
                verts.append((x,y,z))
                if i<80 and j<8:
                    a=i*9+j
                    faces.append((a,a+1,a+10,a+9))
        mesh("Upper cupid's bow" if upper else "Lower lip",verts,faces,lips,1)
    line=[]
    for i in range(81):
        x=-half+2*half*i/80
        z=seam_z(x)
        line.append((x,face_y(x,z)-.054,z,.25+.65*math.sin(math.pi*i/80)))
    paths("Quiet smile • lip separation",[line],seam,.009,4)


def nose(nostril):
    for side in (-1,1):
        # Small downward-facing apertures sit in the integrated nasal wings.
        obj=sphere(f"{side} nostril shadow",(side*.152,face_y(side*.152,-.315)-.005,-.317),(.046,.014,.020),nostril)
        obj.rotation_euler[1]=side*math.radians(12)


def facial_hair(hair):
    strands=[]
    for i in range(30000):
        z=random.uniform(-1.52,-.44)
        w,_,_=profile(z)
        x=random.uniform(-w*.99,w*.99)
        c=math.sqrt(max(0,1-(x/w)**2))
        m=beard_mask(x,z,c)
        if random.random()>m*.56:
            continue
        length=random.uniform(.012,.029)
        moustache=z>-.74 and abs(x)<.43
        points=[]
        for k in range(4):
            t=k/3
            xx=x+(1 if x>0 else -1)*(.020 if moustache else .006)*t
            zz=z-length*t
            ww,_,_=profile(zz)
            if abs(xx)>ww*.997:
                break
            yy=face_y(xx,zz)-.019-.008*math.sin(math.pi*t)
            points.append((xx,yy,zz,.25+.60*math.sin(math.pi*(.12+.86*t))))
        if len(points)>1:
            strands.append(points)
    paths("Closely trimmed beard and moustache • individual fibers",strands,hair,.0016,2)


def aim(obj, target):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


def light(name, pos, power, color, size, target=(0,0,.2), shape="DISK", size_y=2):
    data=bpy.data.lights.new(name,"AREA")
    data.energy=power
    data.color=color
    data.shape=shape
    data.size=size
    if shape=="RECTANGLE":
        data.size_y=size_y
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=pos
    aim(obj,target)


def setup_render(width, height, camera_pos, target, scale):
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=48 if OPTS.preview else 128
    scene.cycles.use_denoising=True
    scene.cycles.adaptive_threshold=.035 if OPTS.preview else .012
    scene.render.resolution_x=width
    scene.render.resolution_y=height
    scene.render.resolution_percentage=60 if OPTS.preview else 100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGBA"
    scene.render.image_settings.color_depth="8"
    scene.render.image_settings.compression=100
    scene.world.color=(.17,.17,.17)
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    data=bpy.data.cameras.new("Portrait studio camera")
    obj=bpy.data.objects.new("Portrait studio camera",data)
    bpy.context.collection.objects.link(obj)
    obj.location=camera_pos
    aim(obj,target)
    data.type="ORTHO"
    data.ortho_scale=scale
    scene.camera=obj


def render(name):
    bpy.context.scene.render.filepath=str(OUT/name)
    bpy.ops.render.render(write_still=True)


def portrait():
    clear()
    skin=skin_material()
    plain=material("Warm ear cartilage",BASE_SKIN,.46,subsurface=.075)
    lid=material("Rosy eyelid wetline",(.34,.125,.087),.37,subsurface=.025)
    brow=material("Espresso eyebrows",(.016,.011,.009),.47)
    hair=material("Black brown beard fibers",(.009,.007,.006),.78)
    hair.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value=.13
    white=material("Ivory sclera",(.51,.48,.42),.29,subsurface=.015)
    pupil=material("Deep brown pupil and limbus",(.0035,.0022,.0014),.36)
    pupil.node_tree.nodes.get("Principled BSDF").inputs["Specular IOR Level"].default_value=.05
    lips=material("Muted warm rose lips",(.33,.112,.085),.44,subsurface=.07)
    seam=material("Mouth and nostril recessed shadow",(.054,.017,.012),.6)
    build_head(skin)
    ear(-1,skin,plain)
    ear(1,skin,plain)
    build_eyes(skin,lid,white,iris_material(),pupil,brow)
    brows(brow)
    nose(seam)
    mouth(lips,seam)
    facial_hair(hair)
    for obj in bpy.context.scene.objects:
        obj.location.x *= .95
        obj.scale.x *= .95
    setup_render(1100,1300,(.85,-9.5,.53),(0,-.10,.21),3.98)
    light("Key • warm giant softbox",(-3.6,-4.7,5.3),490,(1,.88,.75),4)
    light("Fill • cool broad bounce",(3.2,-3.7,1),140,(.85,.9,1),3)
    light("Rim • icy strip",(2.6,1.3,2.8),650,(.53,.73,1),2.6,shape="RECTANGLE",size_y=4)
    light("Edge • warm reflector",(-2.4,.8,-.6),175,(1,.63,.38),2.5)
    light("Eye softbox",(-.8,-5.5,1.5),25,(1,.98,.94),1.1,shape="RECTANGLE",size_y=.7)
    render("portrait-preview.png" if OPTS.preview else "portrait.png")


def torus(name, location, rotation, major, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=128,minor_segments=32,location=location,rotation=rotation,major_radius=major,minor_radius=minor)
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth=True
    return obj


def icon_stage():
    setup_render(500,500,(3,-7,4),(0,0,0),3.25)
    bpy.context.scene.render.resolution_percentage=100
    light("Tall white studio card",(-3,-4,5),420,(1,.95,.87),3,shape="RECTANGLE",size_y=5)
    light("Blue edge reflection",(3,1,2),500,(.49,.7,1),2)
    light("Front silk",(1,-4,1),200,(.9,.92,1),3)
    light("Violet rim",(-1,3,-1),330,(.73,.51,1),2)


def icons():
    clear()
    silver=material("Polished silver",(.71,.77,.86),.18,.97)
    torus("Interlocking orbital loop A",(-.36,0,0),(math.radians(67),.3,-.25),.68,.145,silver)
    torus("Interlocking orbital loop B",(.38,.08,.07),(.45,math.radians(68),.55),.68,.145,silver)
    icon_stage()
    render("orbit.png")

    clear()
    azure=material("Azure glass ceramic",(.018,.28,.74),.24,.32)
    parts=[]
    for pos,scale in [((-.56,0,-.09),(.49,.4,.45)),((0,0,.25),(.61,.46,.62)),((.57,0,-.03),(.47,.37,.44)),((0,0,-.24),(.79,.42,.30))]:
        parts.append(sphere("Cloud sculpt",pos,scale,azure))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    obj=parts[0]
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    remesh=obj.modifiers.new("Continuous cloud silhouette","REMESH")
    remesh.mode="VOXEL"
    remesh.voxel_size=.065
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    dec=obj.modifiers.new("Cut gemstone facets","DECIMATE")
    dec.ratio=.10
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for p in obj.data.polygons:
        p.use_smooth=False
    obj.rotation_euler[1]=-.16
    icon_stage()
    render("cloud.png")

    clear()
    pearl=material("Pearl porcelain",(.79,.80,.88),.21,.17)
    pearl.node_tree.nodes.get("Principled BSDF").inputs["Coat Weight"].default_value=.35
    # Continuous command-key path; welded junctions make it a porcelain object.
    points=[]
    for cx,cz,start in [(.50,.50,-math.pi/2),(.50,-.50,math.pi),(-.50,-.50,math.pi/2),(-.50,.50,0)]:
        for j in range(97):
            t=start+j/96*math.pi*1.5
            points.append((cx+.25*math.cos(t),-.03,cz+.25*math.sin(t)))
    points.append(points[0])
    obj=paths("Pearl command flourish",[points],pearl,.087,6)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj=bpy.context.object
    remesh=obj.modifiers.new("Welded ceramic intersections","REMESH")
    remesh.mode="VOXEL"
    remesh.voxel_size=.013
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth_mod=obj.modifiers.new("Polished porcelain edges","SMOOTH")
    smooth_mod.factor=.5
    smooth_mod.iterations=3
    for p in obj.data.polygons:
        p.use_smooth=True
    icon_stage()
    bpy.context.scene.camera.location=(1.7,-7,3)
    aim(bpy.context.scene.camera,(0,0,0))
    bpy.context.scene.camera.data.ortho_scale=2.30
    render("command.png")

    clear()
    violet=material("Iridescent violet prism",(.23,.047,.58),.19,.62)
    p=violet.node_tree.nodes.get("Principled BSDF")
    p.inputs["Coat Weight"].default_value=.5
    p.inputs["Thin Film Thickness"].default_value=390
    p.inputs["Thin Film IOR"].default_value=1.42
    verts=[(-.73,-.39,-.57),(.73,-.39,-.57),(0,-.39,.80),(-.73,.39,-.57),(.73,.39,-.57),(0,.39,.80)]
    obj=mesh("Violet triangular prism",verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],violet)
    bevel=obj.modifiers.new("Hand polished bevels","BEVEL")
    bevel.width=.07
    bevel.segments=4
    obj.modifiers.new("Weighted facet normals","WEIGHTED_NORMAL")
    obj.rotation_euler=(.12,-.22,-.25)
    icon_stage()
    render("prism.png")


if OPTS.only in ("portrait","all"):
    portrait()
if OPTS.only in ("icons","all"):
    icons()
