# Usage : blender -b -P tools/inspect_glb.py -- fichier.glb
import bpy, sys
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
tris = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        tris += n
        print('MESH', o.name, 'tris', n, 'dims', tuple(round(d, 2) for d in o.dimensions))
for img in bpy.data.images:
    print('IMG', img.name, img.size[0], img.size[1])
for m in bpy.data.materials:
    print('MAT', m.name)
print('TOTAL_TRIS', tris)
