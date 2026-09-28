# Reachy Mini — notice

`reachy.glb` and `rig.json` are derived from **Reachy Mini** by [Pollen Robotics](https://www.pollen-robotics.com/),
published at <https://github.com/pollen-robotics/reachy_mini> under the Apache License 2.0 (copy in `LICENSE`).

Changes made for this site (by `blender/reachy/build_reachy.py`, commit 292b2434 of the SDK repository):

- the visual STL meshes of the MJCF description were posed with the MJCF forward kinematics at qpos = 0,
  decimated, merged into 17 moving parts and given new materials;
- `rig.json` collects the Stewart-platform geometry (horns, rods, head attachment points), the SDK's INIT and
  SLEEP poses and joint positions, and the antenna rest frames, re-expressed in the part frames of the GLB.

The wake-up and go-to-sleep sounds (`site/assets/audio/reachy_wake.mp3`, `reachy_sleep.mp3`) are Pollen Robotics'
`wake_up.wav` and `go_sleep.wav` from the same repository, downmixed, resampled and levelled.

Reachy Mini is a trademark of Pollen Robotics. This site is not affiliated with or endorsed by Pollen Robotics.
