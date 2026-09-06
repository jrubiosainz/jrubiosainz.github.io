"""Generate the original STRATUM exosuit and its transparent studio portrait.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-armor.py
Only Blender's bundled Python modules are required. Coordinates are metres, Z up.
"""

import json
import math
import os
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "models"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)


def material(name, color, metal=0.0, roughness=0.4, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1)
        shader.inputs["Emission Strength"].default_value = 2.4
    return mat


TITANIUM = material("Satin / bead-blasted titanium", (0.43, 0.48, 0.52), 0.78, 0.31)
SILVER = material("Edges / brushed pale alloy", (0.66, 0.72, 0.76), 0.82, 0.25)
GRAPHITE = material("Graphite / ceramic-metal composite", (0.044, 0.056, 0.070), 0.62, 0.4)
DARK = material("Flexible carbon / articulation", (0.015, 0.021, 0.028), 0.18, 0.56)
INSET = material("Recesses / black anodized metal", (0.008, 0.014, 0.020), 0.6, 0.3)
WARM = material("Fasteners / champagne titanium", (0.32, 0.29, 0.24), 0.8, 0.32)
CYAN = material("Status / fine ice-blue inlay", (0.07, 0.36, 0.44), 0.3, 0.3, (0.12, 0.66, 0.79))

ASSET = bpy.data.collections.new("STRATUM / independent assembly components")
bpy.context.scene.collection.children.link(ASSET)
ASSEMBLY = []
PARTS = []
GROUP_COUNTS = {}


def mesh(name, vertices, faces, mat, bevel=0.0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(mat)
    data.update()
    obj = bpy.data.objects.new(name, data)
    ASSET.objects.link(obj)
    if bevel:
        mod = obj.modifiers.new("Machined edge radius", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.affect = "EDGES"
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(24)
    PARTS.append(obj)
    return obj


def loft(name, sections, mat, bevel=0.005):
    """Chamfered octagonal sections: (center, half-width, half-depth)."""
    axis = (Vector(sections[-1][0]) - Vector(sections[0][0])).normalized()
    across = Vector((1, 0, 0))
    across = (across - axis * across.dot(axis)).normalized()
    depth = axis.cross(across).normalized()
    profile = [(-0.63, -1), (0.63, -1), (1, -0.62), (1, 0.6),
               (0.65, 1), (-0.65, 1), (-1, 0.6), (-1, -0.62)]
    vertices = []
    for center, width, thickness in sections:
        center = Vector(center)
        vertices.extend(tuple(center + across * x * width + depth * y * thickness)
                        for x, y in profile)
    faces = [tuple(reversed(range(8)))]
    for i in range(len(sections) - 1):
        for j in range(8):
            faces.append((i * 8 + j, i * 8 + (j + 1) % 8,
                          (i + 1) * 8 + (j + 1) % 8, (i + 1) * 8 + j))
    faces.append(tuple(range((len(sections) - 1) * 8, len(sections) * 8)))
    return mesh(name, vertices, faces, mat, bevel)


def plate(name, outline, y, thickness=0.028, mat=TITANIUM, bevel=0.003,
          crown=0.008, slope=0.0):
    """An individually extruded, shallow-crowned angular armor panel."""
    outline = list(outline)
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(outline, outline[1:] + outline[:1]))
    if area < 0:
        outline.reverse()
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cz = sum(p[1] for p in outline) / n
    vertices = [(x, y + slope * (x - cx), z) for x, z in outline]
    vertices += [(cx + (x - cx) * 0.8, y + slope * (x - cx) * 0.8 - crown,
                  cz + (z - cz) * 0.8) for x, z in outline]
    vertices += [(x, y + slope * (x - cx) + thickness, z) for x, z in outline]
    faces = [tuple(range(n, 2 * n)), tuple(reversed(range(2 * n, 3 * n)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
        faces.append((j, i, 2 * n + i, 2 * n + j))
    return mesh(name, vertices, faces, mat, bevel)


def rod(name, start, end, radius, mat=SILVER, vertices=12):
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.95 else Vector((0, 1, 0))
    u = axis.cross(ref).normalized()
    v = axis.cross(u).normalized()
    points = []
    for center in [start, end]:
        points += [tuple(center + radius * (u * math.cos(i * math.tau / vertices)
                                            + v * math.sin(i * math.tau / vertices)))
                   for i in range(vertices)]
    faces = [tuple(reversed(range(vertices))), tuple(range(vertices, 2 * vertices))]
    faces += [(i, (i + 1) % vertices, (i + 1) % vertices + vertices, i + vertices)
              for i in range(vertices)]
    return mesh(name, points, faces, mat)


def fastener(x, y, z, radius=0.005):
    rod("Countersunk retaining pin", (x, y + 0.003, z), (x, y, z), radius, WARM)
    rod("Pin hexagonal recess", (x, y - 0.0005, z), (x, y - 0.001, z),
        radius * 0.48, INSET, 6)


def line(points, mat=SILVER, radius=0.002):
    for a, b in zip(points, points[1:]):
        rod("Inset edge / fine seam", a, b, radius, mat, 8)


def vents(x, y, z, width=0.055, count=5, spacing=0.015, sign=1):
    for i in range(count):
        line([(x, y, z - i * spacing),
              (x + sign * width, y + 0.005, z - i * spacing + 0.009)],
             SILVER, 0.0024)


def complete(name, group, order):
    """Bake subdetails into one animated component and give it a local origin."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in PARTS:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + " / geometry"
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj["groupId"] = group
    obj["order"] = order
    obj["component"] = name
    obj["design"] = "STRATUM / original aerospace exosuit"
    ASSEMBLY.append(obj)
    GROUP_COUNTS[group] = GROUP_COUNTS.get(group, 0) + 1
    PARTS.clear()
    return obj


def mirrored(points, sign):
    return [(sign * x, z) for x, z in points]


print("STRATUM: constructing torso", flush=True)
loft("Flexible cervical coupling", [((0, 0.015, 1.91), 0.082, 0.074),
                                   ((0, 0.015, 2.042), 0.068, 0.066)], DARK)
for z in [1.952, 1.970, 1.988, 2.006, 2.024]:
    rod("Cervical lamella", (-0.059, -0.053, z), (0.059, -0.053, z), 0.003, GRAPHITE)
complete("T01 / cervical bellows", "torso", 9)

loft("Thoracic pressure frame", [((0, 0.035, 1.33), 0.163, 0.108),
                                ((0, 0.030, 1.56), 0.213, 0.118),
                                ((0, 0.020, 1.77), 0.294, 0.124),
                                ((0, 0.024, 1.91), 0.267, 0.101)], GRAPHITE, 0.008)
complete("T02 / thoracic load frame", "torso", 1)

loft("Spinal column", [((0, 0.159, 1.30), 0.042, 0.033),
                      ((0, 0.163, 1.85), 0.063, 0.043)], TITANIUM)
for z in [1.4 + i * 0.045 for i in range(10)]:
    rod("Vertebral bridge", (-0.054, 0.198, z), (0.054, 0.198, z), 0.008, GRAPHITE)
complete("T03 / dorsal service spine", "torso", 4)

for s, side in [(-1, "left"), (1, "right")]:
    plate("Split collar", mirrored([(0.069, 1.995), (0.119, 2.021), (0.210, 1.968),
                                   (0.171, 1.914), (0.082, 1.945)], s),
          -0.064, 0.095, SILVER, slope=s * 0.20)
    line([(s * 0.089, -0.084, 1.982), (s * 0.144, -0.074, 1.976)], INSET, 0.003)
    complete(f"T04-{side} / floating collar", "torso", 10)

    plate("Clavicle bridge", mirrored([(0.065, 1.92), (0.18, 1.953), (0.323, 1.91),
                                      (0.295, 1.862), (0.167, 1.885), (0.08, 1.878)], s),
          -0.112, 0.030, TITANIUM, slope=s * 0.18)
    for j in range(3):
        line([(s * (0.122 + j * 0.041), -0.133 + j * 0.006, 1.922),
              (s * (0.150 + j * 0.041), -0.139 + j * 0.006, 1.891)],
             INSET, 0.003)
    fastener(s * 0.28, -0.102, 1.893)
    complete(f"T05-{side} / clavicle rib bridge", "torso", 11)

    chest = [(0.025, 1.87), (0.125, 1.881), (0.258, 1.848), (0.299, 1.786),
             (0.238, 1.689), (0.078, 1.718), (0.024, 1.766)]
    plate("Pectoral main facet", mirrored(chest, s), -0.157, 0.042, TITANIUM,
          0.004, 0.011, slope=s * 0.12)
    line([(s * 0.041, -0.184, 1.843), (s * 0.122, -0.177, 1.854),
          (s * 0.247, -0.16, 1.827)], SILVER, 0.0025)
    line([(s * 0.07, -0.179, 1.744), (s * 0.127, -0.173, 1.735)], CYAN, 0.0015)
    fastener(s * 0.247, -0.153, 1.789)
    fastener(s * 0.066, -0.182, 1.819, 0.004)
    complete(f"T06-{side} / faceted split pectoral", "torso", 12)

    plate("Pectoral floating lower blade",
          mirrored([(0.038, 1.743), (0.080, 1.700), (0.231, 1.675),
                    (0.263, 1.699), (0.227, 1.621), (0.085, 1.635), (0.042, 1.666)], s),
          -0.149, 0.032, GRAPHITE, 0.004, 0.011, slope=s * 0.14)
    line([(s * 0.067, -0.172, 1.666), (s * 0.124, -0.163, 1.650),
          (s * 0.215, -0.151, 1.644)], SILVER, 0.002)
    complete(f"T07-{side} / lower thoracic blade", "torso", 13)

    plate("Oblique flank shell",
          mirrored([(0.200, 1.601), (0.243, 1.618), (0.223, 1.447),
                    (0.173, 1.340), (0.148, 1.363), (0.163, 1.463)], s),
          -0.065, 0.122, GRAPHITE, slope=s * 0.3)
    vents(s * 0.179, -0.100, 1.534, 0.04, 6, 0.021, s)
    complete(f"T08-{side} / ventilated oblique shell", "torso", 7)

plate("Sternum narrow recessed spine", [(-0.013, 1.865), (0.013, 1.865),
                                      (0.02, 1.69), (0, 1.642), (-0.02, 1.69)],
      -0.143, 0.045, GRAPHITE, crown=0.002)
line([(0, -0.157, 1.792), (0, -0.157, 1.842)], CYAN, 0.0014)
complete("T09 / linear sternum interface", "torso", 8)

for i, (z, w) in enumerate([(1.573, 0.158), (1.470, 0.145), (1.369, 0.126)]):
    plate("Interlocking abdominal lamella",
          [(-w, z + 0.047), (-0.059, z + 0.065), (0, z + 0.049),
           (0.059, z + 0.065), (w, z + 0.047), (w * 0.87, z - 0.034),
           (0, z - 0.057), (-w * 0.87, z - 0.034)],
          -0.130 + i * 0.008, 0.043, TITANIUM if i != 1 else GRAPHITE,
          crown=0.011)
    line([(-w * 0.78, -0.143 + i * 0.008, z - 0.025),
          (0, -0.145 + i * 0.008, z - 0.042),
          (w * 0.78, -0.143 + i * 0.008, z - 0.025)], SILVER, 0.002)
    for s in [-1, 1]:
        fastener(s * w * 0.81, -0.137 + i * 0.008, z + 0.022, 0.004)
    complete(f"T10-{i + 1} / abdominal lamella", "torso", 5 + i)

loft("Pelvic load distribution frame", [((0, 0.025, 1.11), 0.225, 0.108),
                                       ((0, 0.025, 1.19), 0.218, 0.13),
                                       ((0, 0.025, 1.296), 0.151, 0.102)], DARK)
rod("Waist retaining rail", (-0.159, -0.084, 1.268), (0.159, -0.084, 1.268),
    0.008, TITANIUM)
complete("T11 / pelvic suspension frame", "torso", 2)

plate("Pelvic shield", [(-0.12, 1.265), (0.12, 1.265), (0.135, 1.188),
                       (0.058, 1.075), (-0.045, 1.085), (-0.13, 1.188)],
      -0.125, 0.049, GRAPHITE, 0.004, 0.018)
plate("Pelvic narrow alloy facet", [(-0.073, 1.245), (0.078, 1.245),
                                   (0.068, 1.200), (0.012, 1.145), (-0.049, 1.188)],
      -0.15, 0.008, TITANIUM, crown=0.003)
fastener(0.09, -0.146, 1.218)
complete("T12 / asymmetric pelvic shield", "torso", 3)

for s, side in [(-1, "left"), (1, "right")]:
    plate("Iliac crest blade", mirrored([(0.148, 1.291), (0.226, 1.24),
                                        (0.253, 1.138), (0.19, 1.103),
                                        (0.155, 1.174), (0.126, 1.231)], s),
          -0.077, 0.112, TITANIUM, 0.004, slope=s * 0.18)
    line([(s * 0.175, -0.097, 1.239), (s * 0.216, -0.085, 1.161)], INSET, 0.003)
    fastener(s * 0.199, -0.079, 1.22)
    complete(f"T13-{side} / floating iliac plate", "torso", 4)


print("STRATUM: constructing sculptural head shell", flush=True)
loft("Faceless cranial insert", [((0, 0.005, 2.083), 0.056, 0.058),
                                ((0, 0.01, 2.133), 0.082, 0.082),
                                ((0, 0.015, 2.278), 0.096, 0.087),
                                ((0, 0.02, 2.36), 0.067, 0.065)], INSET, 0.008)
complete("H01 / non-anthropomorphic cranial insert", "head", 15)

loft("Cranial dorsal crown", [((0, 0.049, 2.172), 0.090, 0.052),
                             ((0, 0.041, 2.288), 0.104, 0.068),
                             ((0, 0.036, 2.367), 0.090, 0.071),
                             ((0, 0.027, 2.400), 0.037, 0.038)], GRAPHITE, 0.004)
line([(-0.009, -0.038, 2.365), (-0.009, -0.029, 2.393)], INSET, 0.003)
complete("H02 / open-face cranial crown", "head", 17)

for s, side in [(-1, "left"), (1, "right")]:
    plate("Temporal floating blade", mirrored([(0.080, 2.342), (0.108, 2.314),
                                              (0.115, 2.206), (0.075, 2.126),
                                              (0.061, 2.145), (0.085, 2.233)], s),
          -0.046, 0.099, TITANIUM, 0.0025, 0.004, slope=s * 0.35)
    rod("Temporal retention pivot", (s * 0.092, 0.002, 2.247),
        (s * 0.119, 0.002, 2.247), 0.018, GRAPHITE, 16)
    line([(s * 0.105, -0.04, 2.237), (s * 0.095, -0.048, 2.201)], CYAN, 0.0014)
    complete(f"H03-{side} / temporal shell and comms fin", "head", 16)

plate("Raised brow structural rail", [(-0.083, 2.318), (-0.068, 2.356),
                                     (0.021, 2.374), (0.086, 2.329),
                                     (0.081, 2.306), (0.015, 2.329), (-0.047, 2.321)],
      -0.077, 0.036, GRAPHITE, 0.002, 0.003)
line([(-0.059, -0.083, 2.344), (0.015, -0.083, 2.36),
      (0.06, -0.083, 2.334)], SILVER, 0.0017)
complete("H04 / asymmetric brow rail", "head", 18)

plate("Mandibular partial cradle", [(-0.069, 2.151), (-0.045, 2.131),
                                   (0.041, 2.13), (0.069, 2.153),
                                   (0.059, 2.107), (0.022, 2.091),
                                   (-0.033, 2.098), (-0.066, 2.127)],
      -0.068, 0.070, GRAPHITE, 0.003, 0.003)
line([(-0.046, -0.073, 2.119), (0.029, -0.073, 2.111)], SILVER, 0.0018)
complete("H05 / partial chin cradle", "head", 16)


print("STRATUM: constructing articulated arms and individual digits", flush=True)
for s, side in [(-1, "left"), (1, "right")]:
    group = f"arm-{side}"
    dy = 0.021 if s == -1 else -0.027
    dz = -0.016 if s == -1 else 0.0

    def pt(x, y, z):
        return (s * x, y + dy, z + dz)

    def ap(name, points, y, thickness=0.025, mat=TITANIUM, **kwargs):
        return plate(name, [(s * x, z + dz) for x, z in points],
                     y + dy, thickness, mat, **kwargs)

    rod("Scapulohumeral spindle", pt(0.263, 0.025, 1.859),
        pt(0.372, 0.025, 1.859), 0.084, DARK, 20)
    rod("Shoulder bearing flange", pt(0.346, 0.025, 1.859),
        pt(0.366, 0.025, 1.859), 0.074, WARM, 20)
    complete(f"A-{side}-01 / shoulder suspension", group, 3)

    loft("Angular shoulder pauldron",
         [(pt(0.37, 0.025, 1.739), 0.064, 0.088),
          (pt(0.386, 0.025, 1.835), 0.100, 0.119),
          (pt(0.366, 0.025, 1.908), 0.094, 0.114),
          (pt(0.339, 0.025, 1.947), 0.050, 0.072)], TITANIUM, 0.006)
    ap("Shoulder front inset", [(0.314, 1.927), (0.416, 1.917),
                                (0.442, 1.83), (0.387, 1.79), (0.334, 1.827)],
       -0.101, 0.012, GRAPHITE, crown=0.003)
    line([pt(0.329, -0.117, 1.908), pt(0.406, -0.117, 1.90)], SILVER, 0.002)
    if side == "left":
        for i in range(3):
            line([pt(0.365 + i * 0.013, -0.116, 1.874),
                  pt(0.373 + i * 0.013, -0.116, 1.845)], SILVER, 0.0018)
    fastener(s * 0.411, -0.111 + dy, 1.84 + dz)
    complete(f"A-{side}-02 / split shoulder shell", group, 9)

    loft("Upper arm flexible core",
         [(pt(0.447, 0.024, 1.438), 0.063, 0.067),
          (pt(0.421, 0.025, 1.592), 0.077, 0.078),
          (pt(0.393, 0.025, 1.752), 0.070, 0.074)], DARK, 0.006)
    for i in range(5):
        rod("Upper arm tension rib", pt(0.419, -0.035, 1.51 + i * 0.032),
            pt(0.456, -0.035, 1.515 + i * 0.032), 0.003, GRAPHITE)
    complete(f"A-{side}-03 / upper arm pressure sleeve", group, 4)

    ap("Brachial outer facet",
       [(0.379, 1.758), (0.442, 1.754), (0.483, 1.638), (0.482, 1.498),
        (0.435, 1.474), (0.392, 1.559)], -0.055, 0.085, TITANIUM,
       crown=0.013, slope=s * 0.1)
    line([pt(0.427, -0.069, 1.716), pt(0.454, -0.069, 1.633),
          pt(0.455, -0.069, 1.534)], INSET, 0.0028)
    fastener(s * 0.428, -0.071 + dy, 1.709 + dz)
    complete(f"A-{side}-04 / brachial armor blade", group, 8)

    rod("Elbow radial bearing", pt(0.397, 0.007, 1.429),
        pt(0.51, 0.007, 1.429), 0.059, GRAPHITE, 20)
    rod("Elbow bearing flange", pt(0.497, 0.007, 1.429),
        pt(0.512, 0.007, 1.429), 0.041, SILVER, 16)
    rod("Elbow bearing cap", pt(0.511, 0.007, 1.429),
        pt(0.515, 0.007, 1.429), 0.027, INSET, 12)
    ap("Elbow cover", [(0.422, 1.466), (0.478, 1.466), (0.5, 1.421),
                       (0.463, 1.382), (0.415, 1.414)], -0.067, 0.023, GRAPHITE)
    complete(f"A-{side}-05 / articulated elbow", group, 5)

    loft("Forearm core",
         [(pt(0.485, -0.05, 1.106), 0.046, 0.05),
          (pt(0.480, -0.014, 1.252), 0.065, 0.073),
          (pt(0.457, 0.002, 1.378), 0.069, 0.070)], DARK)
    complete(f"A-{side}-06 / forearm pressure sleeve", group, 4)

    ap("Dorsal forearm shield",
       [(0.423, 1.38), (0.494, 1.367), (0.538, 1.295), (0.526, 1.142),
        (0.501, 1.103), (0.46, 1.132), (0.433, 1.253)],
       -0.09, 0.067, TITANIUM, crown=0.014)
    ap("Forearm recessed service strip", [(0.472, 1.329), (0.498, 1.317),
                                         (0.501, 1.173), (0.48, 1.181)],
       -0.107, 0.005, INSET, bevel=0.001, crown=0.001)
    line([pt(0.486, -0.111, 1.242), pt(0.486, -0.111, 1.287)], CYAN, 0.0013)
    fastener(s * 0.459, -0.11 + dy, 1.316 + dz, 0.004)
    fastener(s * 0.508, -0.105 + dy, 1.166 + dz, 0.004)
    complete(f"A-{side}-07 / tapered forearm shell", group, 10)

    rod("Exposed ulnar tendon", pt(0.442, 0.029, 1.128),
        pt(0.411, 0.070, 1.361), 0.007, WARM)
    rod("Exposed ulnar guide", pt(0.444, 0.027, 1.126),
        pt(0.435, 0.039, 1.192), 0.012, GRAPHITE)
    ap("Volar forearm bracket", [(0.405, 1.34), (0.423, 1.333),
                                 (0.458, 1.18), (0.448, 1.15), (0.422, 1.217)],
       -0.013, 0.058, GRAPHITE, crown=0.002)
    complete(f"A-{side}-08 / ulnar tendon and brace", group, 7)

    loft("Wrist compression cuff",
         [(pt(0.487, -0.053, 1.064), 0.046, 0.051),
          (pt(0.484, -0.046, 1.110), 0.053, 0.055)], GRAPHITE, 0.003)
    line([pt(0.461, -0.108, 1.083), pt(0.511, -0.108, 1.083)], SILVER, 0.002)
    complete(f"A-{side}-09 / wrist gimbal cuff", group, 6)

    loft("Metacarpal pressure glove",
         [(pt(0.492, -0.067, 0.958), 0.05, 0.028),
          (pt(0.49, -0.062, 1.016), 0.051, 0.035),
          (pt(0.487, -0.054, 1.067), 0.037, 0.033)], DARK, 0.003)
    ap("Dorsal hand shield", [(0.458, 1.057), (0.516, 1.054), (0.535, 1.011),
                              (0.53, 0.971), (0.478, 0.959), (0.45, 0.996)],
       -0.097, 0.012, TITANIUM, bevel=0.002, crown=0.004)
    for j in range(3):
        line([pt(0.468 + j * 0.019, -0.109, 1.003),
              pt(0.471 + j * 0.019, -0.109, 1.034)], INSET, 0.0015)
    complete(f"A-{side}-10 / articulated metacarpal shield", group, 11)

    for j, (finger, length) in enumerate([("index", 0.087), ("middle", 0.100),
                                        ("ring", 0.093), ("little", 0.071)]):
        x = 0.454 + j * 0.025
        ztop = 0.969 + (0.006 if j in (0, 3) else 0)
        bend = 0.022 + j * 0.003
        points = [pt(x, -0.066, ztop),
                  pt(x + 0.004, -0.066 - bend * 0.45, ztop - length * 0.48),
                  pt(x + 0.006, -0.066 - bend, ztop - length * 0.78),
                  pt(x + 0.004, -0.066 - bend * 1.35, ztop - length)]
        for k in range(3):
            a, b = Vector(points[k]), Vector(points[k + 1])
            inset_a = a.lerp(b, 0.08)
            inset_b = a.lerp(b, 0.87)
            radius = 0.0105 - k * 0.0013
            loft("Individual phalange", [(inset_b, radius * 0.9, radius),
                                         (inset_a, radius, radius * 1.05)],
                 TITANIUM if k != 1 else GRAPHITE, 0.0015)
            if k < 2:
                rod("Finger hinge", b + Vector((-0.010, 0, 0)),
                    b + Vector((0.010, 0, 0)), 0.006, DARK, 10)
        complete(f"A-{side}-11-{finger} / three-link digit", group, 12 + j)

    points = [pt(0.449, -0.063, 1.034), pt(0.424, -0.079, 1.006),
              pt(0.417, -0.104, 0.975), pt(0.43, -0.123, 0.955)]
    for j, (a, b) in enumerate(zip(points, points[1:])):
        a, b = Vector(a), Vector(b)
        loft("Opposable thumb link", [(b.lerp(a, 0.1), 0.012 - j * 0.001, 0.013),
                                      (a.lerp(b, 0.1), 0.013 - j * 0.001, 0.014)],
             TITANIUM if j != 1 else GRAPHITE, 0.002)
    complete(f"A-{side}-11-thumb / opposable three-link digit", group, 12)


print("STRATUM: constructing leg greaves and grounded sabatons", flush=True)
for s, side in [(-1, "left"), (1, "right")]:
    group = f"leg-{side}"
    dy = 0.036 if s == -1 else -0.022

    def lp(x, y, z):
        return (s * x, y + dy, z)

    def legplate(name, points, y, thickness=0.028, mat=TITANIUM, **kwargs):
        return plate(name, mirrored(points, s), y + dy, thickness, mat, **kwargs)

    rod("Hip transverse coupling", lp(0.087, 0.026, 1.103),
        lp(0.23, 0.026, 1.103), 0.073, GRAPHITE, 20)
    rod("Hip outer bearing", lp(0.218, 0.026, 1.103),
        lp(0.238, 0.026, 1.103), 0.055, WARM, 16)
    complete(f"L-{side}-01 / hip suspension coupling", group, 2)

    loft("Thigh tension core", [(lp(0.179, 0.02, 0.662), 0.071, 0.071),
                                (lp(0.171, 0.025, 0.89), 0.09, 0.091),
                                (lp(0.158, 0.028, 1.105), 0.094, 0.087)], DARK)
    complete(f"L-{side}-02 / femoral pressure sleeve", group, 3)

    legplate("Anterior femoral shell",
             [(0.086, 1.083), (0.161, 1.11), (0.224, 1.073), (0.254, 0.917),
              (0.235, 0.758), (0.193, 0.682), (0.144, 0.704), (0.112, 0.901)],
             -0.083, 0.055, TITANIUM, crown=0.015, bevel=0.004)
    legplate("Thigh graphite inlay",
             [(0.186, 1.054), (0.211, 1.041), (0.228, 0.916),
              (0.205, 0.796), (0.191, 0.794), (0.204, 0.938)],
             -0.100, 0.005, GRAPHITE, crown=0.002, bevel=0.001)
    line([lp(0.128, -0.103, 1.04), lp(0.147, -0.107, 0.917),
          lp(0.165, -0.107, 0.769)], SILVER, 0.0025)
    line([lp(0.199, -0.109, 1.015), lp(0.206, -0.109, 0.973)], CYAN, 0.0013)
    fastener(s * 0.129, -0.101 + dy, 1.017)
    fastener(s * 0.201, -0.102 + dy, 0.749)
    complete(f"L-{side}-03 / split femoral front blade", group, 8)

    legplate("Lateral thigh armor",
             [(0.242, 1.057), (0.278, 0.985), (0.272, 0.848),
              (0.236, 0.749), (0.224, 0.804), (0.244, 0.954)],
             -0.022, 0.10, GRAPHITE, crown=0.009)
    for j in range(5):
        line([lp(0.248, -0.036, 0.983 - j * 0.026),
              lp(0.268, -0.026, 0.957 - j * 0.026)], SILVER, 0.0023)
    complete(f"L-{side}-04 / ventilated femoral side rail", group, 7)

    loft("Posterior thigh carapace",
         [(lp(0.183, 0.091, 0.731), 0.055, 0.038),
          (lp(0.169, 0.099, 0.907), 0.074, 0.044),
          (lp(0.153, 0.088, 1.064), 0.066, 0.044)], GRAPHITE)
    rod("Hamstring actuator", lp(0.146, 0.137, 0.766),
        lp(0.129, 0.129, 1.021), 0.011, WARM)
    rod("Hamstring actuator sleeve", lp(0.128, 0.13, 1.022),
        lp(0.136, 0.135, 0.922), 0.018, TITANIUM)
    complete(f"L-{side}-05 / hamstring actuator shell", group, 5)

    rod("Knee hinge spindle", lp(0.117, 0.012, 0.653),
        lp(0.249, 0.012, 0.653), 0.06, DARK, 20)
    rod("Knee outer flange", lp(0.231, 0.012, 0.653),
        lp(0.253, 0.012, 0.653), 0.043, GRAPHITE, 16)
    rod("Knee outer pivot cap", lp(0.253, 0.012, 0.653),
        lp(0.257, 0.012, 0.653), 0.022, WARM, 12)
    legplate("Angular kneecap", [(0.135, 0.708), (0.193, 0.728), (0.24, 0.686),
                                 (0.234, 0.629), (0.186, 0.601), (0.134, 0.635)],
             -0.106, 0.046, GRAPHITE, crown=0.014)
    legplate("Patellar floating face", [(0.153, 0.693), (0.192, 0.706),
                                        (0.222, 0.681), (0.211, 0.643), (0.162, 0.647)],
             -0.126, 0.01, TITANIUM, crown=0.004, bevel=0.002)
    complete(f"L-{side}-06 / compound knee articulation", group, 6)

    loft("Shin tension core", [(lp(0.2, 0.025, 0.165), 0.056, 0.058),
                               (lp(0.194, 0.028, 0.407), 0.075, 0.078),
                               (lp(0.184, 0.021, 0.604), 0.066, 0.07)], DARK)
    complete(f"L-{side}-07 / tibial pressure sleeve", group, 3)

    legplate("Tibial full-length greave",
             [(0.133, 0.601), (0.185, 0.616), (0.24, 0.584), (0.251, 0.455),
              (0.238, 0.225), (0.215, 0.163), (0.174, 0.179), (0.139, 0.41)],
             -0.082, 0.052, TITANIUM, crown=0.016, bevel=0.004)
    legplate("Shin graphite channel",
             [(0.181, 0.566), (0.199, 0.566), (0.218, 0.284), (0.202, 0.222),
              (0.19, 0.304)], -0.103, 0.007, GRAPHITE, crown=0.002, bevel=0.001)
    line([lp(0.147, -0.091, 0.555), lp(0.164, -0.103, 0.408),
          lp(0.185, -0.103, 0.222)], SILVER, 0.0025)
    fastener(s * 0.22, -0.093 + dy, 0.554)
    fastener(s * 0.223, -0.092 + dy, 0.235)
    complete(f"L-{side}-08 / tapered tibial greave", group, 9)

    loft("Rear calf shell", [(lp(0.199, 0.07, 0.226), 0.054, 0.038),
                             (lp(0.194, 0.096, 0.414), 0.081, 0.059),
                             (lp(0.188, 0.079, 0.57), 0.063, 0.042)], GRAPHITE)
    rod("Calf vertical piston", lp(0.222, 0.105, 0.25),
        lp(0.221, 0.138, 0.49), 0.009, SILVER)
    for j in range(5):
        rod("Calf heat rejection fin", lp(0.141, 0.14, 0.389 + j * 0.022),
            lp(0.223, 0.14, 0.391 + j * 0.022), 0.004, TITANIUM)
    complete(f"L-{side}-09 / finned calf actuator cover", group, 7)

    loft("Ankle coupling", [(lp(0.2, 0.01, 0.111), 0.064, 0.064),
                            (lp(0.2, 0.022, 0.188), 0.057, 0.059)], GRAPHITE, 0.004)
    rod("Ankle transverse pivot", lp(0.126, 0.011, 0.143),
        lp(0.274, 0.011, 0.143), 0.023, WARM, 12)
    complete(f"L-{side}-10 / ankle universal coupling", group, 4)

    loft("Grounded boot sole", [(lp(0.204, -0.057, 0.012), 0.082, 0.141),
                                (lp(0.204, -0.057, 0.040), 0.085, 0.145),
                                (lp(0.203, -0.037, 0.075), 0.078, 0.125)], INSET, 0.004)
    loft("Sabatons main carapace", [(lp(0.203, -0.058, 0.048), 0.078, 0.137),
                                   (lp(0.203, -0.039, 0.101), 0.075, 0.117),
                                   (lp(0.20, 0.003, 0.143), 0.057, 0.067)], GRAPHITE, 0.004)
    line([lp(0.147, -0.191, 0.045), lp(0.251, -0.191, 0.045)], SILVER, 0.002)
    complete(f"L-{side}-11 / split grounded sabaton", group, 1)

    loft("Floating toe cap", [(lp(0.204, -0.151, 0.047), 0.073, 0.064),
                             (lp(0.204, -0.148, 0.077), 0.075, 0.059),
                             (lp(0.201, -0.127, 0.099), 0.068, 0.043)], TITANIUM, 0.003)
    for x in [0.179, 0.207, 0.235]:
        line([lp(x, -0.184, 0.077), lp(x, -0.139, 0.099)], INSET, 0.0015)
    complete(f"L-{side}-12 / floating articulated toe cap", group, 5)


assert not PARTS
assert len(ASSEMBLY) == 81, f"Expected 81 independently animated parts; got {len(ASSEMBLY)}"

# Consolidate the seven surface finishes into vertex-colored alloy plus inlays:
# this retains the fine hardware colors without hundreds of material draw calls.
ALLOY = material("STRATUM / vertex-tinted satin alloy", (1, 1, 1), 0.68, 0.38)
colors = ALLOY.node_tree.nodes.new("ShaderNodeVertexColor")
colors.layer_name = "SurfaceTone"
ALLOY.node_tree.links.new(colors.outputs["Color"],
                          ALLOY.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
for obj in ASSEMBLY:
    if obj["groupId"] == "head":
        obj.location.z -= 0.06
    data = obj.data
    tint = data.color_attributes.new(name="SurfaceTone", type="BYTE_COLOR", domain="CORNER")
    old_materials = list(data.materials)
    has_emission = False
    material_indices = []
    for polygon in data.polygons:
        old = old_materials[polygon.material_index]
        color = old.diffuse_color
        for loop in polygon.loop_indices:
            tint.data[loop].color = color
        material_indices.append(1 if old == CYAN else 0)
        has_emission |= old == CYAN
    data.materials.clear()
    data.materials.append(ALLOY)
    if has_emission:
        data.materials.append(CYAN)
    for polygon, index in zip(data.polygons, material_indices):
        polygon.material_index = index

bpy.context.view_layer.update()

# A small built-in turn makes a straight-on web camera read the designed depth.
rotation = Matrix.Rotation(math.radians(-11), 4, "Z")
for obj in ASSEMBLY:
    obj.matrix_world = rotation @ obj.matrix_world

corners = [obj.matrix_world @ Vector(corner) for obj in ASSEMBLY for corner in obj.bound_box]
minimum = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
maximum = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
scale = 2.4 / (maximum.z - minimum.z)
offset = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
for obj in ASSEMBLY:
    obj.location = (obj.location - offset) * scale
    obj.scale *= scale
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.context.view_layer.update()
corners = [obj.matrix_world @ Vector(corner) for obj in ASSEMBLY for corner in obj.bound_box]
minimum = [min(v[i] for v in corners) for i in range(3)]
maximum = [max(v[i] for v in corners) for i in range(3)]
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in ASSEMBLY)
bpy.ops.object.select_all(action="DESELECT")
for obj in ASSEMBLY:
    obj.select_set(True)

glb_path = OUTPUT / "exosuit.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_yup=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_materials="EXPORT",
    export_normals=True,
    export_texcoords=False,
    export_animations=False,
    export_all_vertex_colors=False,
)
with glb_path.open("rb") as glb:
    magic, version, byte_length = struct.unpack("<4sII", glb.read(12))
    chunk_length, chunk_type = struct.unpack("<I4s", glb.read(8))
    document = json.loads(glb.read(chunk_length))
assert magic == b"glTF" and version == 2 and chunk_type == b"JSON"
assert byte_length == glb_path.stat().st_size < 2_000_000
assert len(document["meshes"]) == len(document["nodes"]) == 81
assert all("groupId" in node["extras"] and "order" in node["extras"]
           for node in document["nodes"])
draw_calls = sum(len(item["primitives"]) for item in document["meshes"])
assert draw_calls < 150
stats = {
    "design": "STRATUM / original aerospace exosuit",
    "meshCount": len(ASSEMBLY),
    "groups": GROUP_COUNTS,
    "triangles": triangles,
    "drawCalls": draw_calls,
    "blenderBounds": {"min": minimum, "max": maximum},
    "gltfBounds": {"min": [minimum[0], minimum[2], -maximum[1]],
                   "max": [maximum[0], maximum[2], -minimum[1]]},
    "glbBytes": os.path.getsize(glb_path),
    "recommendedCamera": {"position": [0, 1.25, 5.2], "target": [0, 1.18, 0], "fov": 32},
    "notes": "81 separate mesh origins at each component's bounds center; groupId and order are node extras. Feet Y=0, crown Y=2.4. No external assets or textures.",
}
(OUTPUT / "exosuit-metadata.json").write_text(json.dumps(stats, indent=2) + "\n")
print("STRATUM ASSET STATS\n" + json.dumps(stats, indent=2), flush=True)


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area_light(name, location, energy, color, size, target=(0, 0, 1.25), size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y or size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)


scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 7
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x = 1000
scene.render.resolution_y = 1300
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.filepath = str(OUTPUT / "exosuit-fallback.png")
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = -0.5
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.24, 0.28, 0.34, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.13

area_light("Key / tall warm softbox", (-3.4, -4.2, 4.7), 540, (1.0, 0.91, 0.8), 2.3, size_y=4.3)
area_light("Fill / cool card", (2.8, -3.0, 2.5), 150, (0.68, 0.8, 1.0), 2.5, size_y=3.4)
area_light("Rim / cyan separation", (-2.7, 2.0, 3.2), 700, (0.30, 0.68, 0.82), 1.4, size_y=3.5)
area_light("Rim / platinum edge", (3.0, 1.4, 4.0), 900, (0.84, 0.93, 1.0), 1.3, size_y=4)
area_light("Top / crown card", (-0.4, 0.1, 5.5), 300, (1, 0.98, 0.92), 2.2)
area_light("Front / narrow catchlight", (0.2, -4.5, 1.4), 55, (0.84, 0.94, 1), 0.5, size_y=2.5)

camera_data = bpy.data.cameras.new("Portrait camera")
camera = bpy.data.objects.new("Portrait camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (1.6, -8.6, 2.75)
aim(camera, (0, 0, 1.21))
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.77
scene.camera = camera
print("STRATUM: rendering transparent 1000 × 1300 studio portrait", flush=True)
bpy.ops.render.render(write_still=True)
print(f"STRATUM: finished {glb_path} and {scene.render.filepath}", flush=True)
