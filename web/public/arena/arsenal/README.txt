TORN VEIL / ARSENAL — V3 REFINED GEOMETRY
23 stylized dark-fantasy static weapon assets, with editable Blender master and individual GLB exports. Twin Vipers has been removed from the active catalog. The complete previous V2 remains in a separate backup and Library version history.

Visual direction: blued steel, silver honed edges, restrained antique brass, oxblood wrapping, walnut hafts, sparing arcane accents. Inspired by the supplied Torn Veil world reference.

Requested refinements: classical shallow continuous self-bow limbs for longbow/shortbow; integrated crossbow limb sockets, string anchors, bolt channel and trigger; straight clean polearm shafts with distinct fitted endcaps; rebuilt connected axe/hammer housings; more elegant cathedral holy scepter; handle-free orbital catalyst. Whole-set trim/contact audit also corrected inherited small gaps in the halberd root and mace crown.

Files: Torn-Veil-Arsenal.blend contains separately named asset collections and editable named mesh components plus an export-excluded presentation stage. glb/ contains exactly 23 single-weapon exports. inventory.json lists sizes, triangles, components and notes. verification.json records master reopen and all GLB import checks. join-audit.json records a conservative 8mm surface-contact graph audit; the magical staff crystal and orb have intentional clearance within their frames.

Coordinates: meters; asset-local origin at grip center, or focus center for the handle-free orb and book. Components retain common origins; all scales baked to 1. The Blender master arranges copies in a presentation layout; exports remain centered in local coordinates. GLB coordinate conversion follows Blender's standard glTF exporter.

Limitations: static concept/game prop assets, not rigged or animated; no draw simulation, working crossbow mechanics, chain physics, LODs, collision meshes or game-engine integration. Named overlapping/attached components are retained for editability; this is not a manufacturing-watertight boolean-unioned mesh set. Simple material-based PBR, no baked texture atlas. Intentional levitation remains only in magical focuses. Validate gameplay scale, collider needs and character grip poses in the target engine.

Rebuild: Blender 4.3+ background execution of build.py, followed by verify.py, audit-joins.py, render-refinements.py and package-refinements.py. Comparison renders require the adjacent V2 backup folder.
