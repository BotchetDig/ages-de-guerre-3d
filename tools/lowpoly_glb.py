# Décime un GLB Meshy pour le jeu et rend un aperçu.
# Usage : blender -b -P tools/lowpoly_glb.py -- entree.glb sortie.glb apercu.png [triangles_cibles]
import bpy, sys, math
args = sys.argv[sys.argv.index('--') + 1:]
src, dst, preview = args[0], args[1], args[2]
target = int(args[3]) if len(args) > 3 else 15000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.object.mode_set(mode='OBJECT')
    m = o.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = min(1.0, target / max(tris, 1))
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    after = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print('DECIMATED', o.name, tris, '->', after)
    for p in o.data.polygons:
        p.use_smooth = False

# Matériaux : on garde seulement la couleur de base (la normal map haute-déf ne colle plus au maillage décimé)
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    for name in ('Normal', 'Metallic', 'Roughness'):
        for l in list(bsdf.inputs[name].links):
            nt.links.remove(l)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.8
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB') or (n.type == 'TEX_IMAGE' and not n.outputs['Color'].links):
            nt.nodes.remove(n)

for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)
        continue
    if img.size[0] > 1024:
        img.scale(1024, 1024)

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                          export_apply=True, export_yup=True)
print('EXPORTED', dst)

# Aperçu : vue de face (-Y Blender = +Z glTF) et vue 3/4
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x, scene.render.resolution_y = 900, 450
scene.render.film_transparent = False
cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.6
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
# Deux vues côte à côte via deux rendus assemblés : plus simple de rendre deux fichiers
for i, (ang, name) in enumerate(((0, 'front'), (math.radians(90), 'side'))):
    r = 6
    cam.location = (math.sin(ang) * r, -math.cos(ang) * r, 1.2)
    cam.rotation_euler = (math.radians(80), 0, ang)
    scene.render.resolution_x = 450
    scene.render.filepath = preview.replace('.png', f'_{name}.png')
    bpy.ops.render.render(write_still=True)
