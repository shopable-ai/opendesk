# DesktopVision fixtures

This directory owns stable image inputs for the DesktopVision test domain.

- `legacy-testmonkey-desktop.png` is the maintained static CLI/documentation
  input used by `README.md` and `QUICKSTART.md`; its historical filename is not
  a current product name.
- `calculator/` holds the Calculator visual baseline used by the DesktopVision
  scripts.

Do not overwrite these files with a live capture. New screenshots, model
responses, traces, and replay output belong under `.runtime/tests/desktopvision/`
until they have been reviewed and deliberately promoted as deterministic input.
