# LocateAnything fixtures

This directory owns deterministic WeChat-shaped images, layout metadata, and
ground-truth data consumed by the LocateAnything scripts and manifests.

The paired image and JSON files under `wechat/` are stable test inputs. Keep a
pair's image, layout, and ground truth consistent when updating it. Generated
grounding responses, screenshots, and run reports belong in
`.runtime/tests/locateanything/`, not here.
