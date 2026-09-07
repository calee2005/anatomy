import json
import struct
from collections import Counter
from pathlib import Path

p = Path("public/models/body.glb")
data = p.read_bytes()
chunk_len, _chunk_type = struct.unpack_from("<I4s", data, 12)
gltf = json.loads(data[20 : 20 + chunk_len])
nodes = gltf["nodes"]
scene = gltf["scenes"][0]

print("SCENE ROOTS:")
for i in scene["nodes"]:
    n = nodes[i]
    kids = n.get("children", [])
    print(f"  [{i}] {n.get('name')} children={len(kids)} mesh={n.get('mesh')}")

print("\n--- first-level of each root ---")
for i in scene["nodes"]:
    n = nodes[i]
    print(f"\nROOT {n.get('name')}:")
    children = n.get("children", [])
    for c in children[:50]:
        cn = nodes[c]
        extras = cn.get("extras") or {}
        print(
            f"  [{c}] {cn.get('name')} mesh={cn.get('mesh')} "
            f"kids={len(cn.get('children', []))} type={extras.get('type')}"
        )
    if len(children) > 50:
        print("  ...", len(children) - 50, "more")

types = Counter()
mesh_names = []
for i, n in enumerate(nodes):
    if n.get("mesh") is None:
        continue
    t = (n.get("extras") or {}).get("type")
    types[t or "(none)"] += 1
    mesh_names.append((n.get("name"), t, i))

print("\ntype counts", types)
print("total meshes", len(mesh_names))

keys = (
    "Humerus",
    "Femur",
    "Tibia",
    "Fibula",
    "Radius",
    "Ulna",
    "Scapula",
    "Clavicle",
    "Pelvis",
    "Hip",
    "Coxal",
    "Ilium",
    "Ischium",
    "Pubis",
    "Sacrum",
    "Sternum",
    "Patella",
    "Rib",
    "Costal",
    "Mandible",
    "Occipital",
    "Vertebra",
    "Atlas",
    "Axis",
    "Coccyx",
    "Talus",
    "Calcaneus",
    "Hip bone",
    "Coxal bone",
    "Innominate",
)

print("\n--- major bone meshes ---")
for name, t, i in mesh_names:
    low = (name or "").lower()
    if any(k.lower() in low for k in keys):
        print(f"{i:4d} type={t} {name}")

print("\n--- all mesh names (no muscle/tendon) ---")
for name, t, i in mesh_names:
    low = (name or "").lower()
    if "muscle" in low or "tendon" in low or "ligament" in low:
        continue
    print(f"{i:4d} type={t} {name}")
