import AppKit
import Foundation

struct Icon {
  let symbol: String
  let file: String
}

let icons = [
  Icon(symbol: "display", file: "screen.png"),
  Icon(symbol: "crop", file: "region.png"),
  Icon(symbol: "waveform", file: "audio.png"),
  Icon(symbol: "camera.fill", file: "camera.png"),
  Icon(symbol: "rectangle.on.rectangle", file: "window.png"),
  Icon(symbol: "mic.fill", file: "microphone.png"),
  Icon(symbol: "computermouse.fill", file: "pointer.png"),
  Icon(symbol: "pause.fill", file: "pause.png"),
  Icon(symbol: "stop.fill", file: "stop.png"),
  Icon(symbol: "timer", file: "timer.png"),
  Icon(symbol: "camera.viewfinder", file: "snapshot.png"),
  Icon(symbol: "square.grid.2x2.fill", file: "tools.png"),
  Icon(symbol: "list.bullet", file: "library.png"),
  Icon(symbol: "camera.viewfinder", file: "quick-screenshot.png"),
  Icon(symbol: "viewfinder", file: "quick-spotlight.png"),
  Icon(symbol: "pencil", file: "quick-doodle.png"),
  Icon(symbol: "rectangle.on.rectangle", file: "quick-exclude-window.png"),
  Icon(symbol: "drop", file: "quick-watermark.png"),
  Icon(symbol: "text.alignleft", file: "quick-prompter.png"),
  Icon(symbol: "keyboard", file: "quick-keyboard.png"),
  Icon(symbol: "timer", file: "quick-schedule.png")
]

guard CommandLine.arguments.count == 2 else {
  fputs("usage: swift render-sf-symbols.swift <output-directory>\n", stderr)
  exit(64)
}

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

for icon in icons {
  guard let image = NSImage(systemSymbolName: icon.symbol, accessibilityDescription: nil)?
    .withSymbolConfiguration(.init(pointSize: 84, weight: .regular)) else {
    fputs("missing SF Symbol: \(icon.symbol)\n", stderr)
    exit(1)
  }
  let size = NSSize(width: 128, height: 128)
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(size.width),
    pixelsHigh: Int(size.height),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bitmapFormat: .alphaFirst,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    fputs("could not allocate bitmap for \(icon.file)\n", stderr)
    exit(1)
  }
  NSGraphicsContext.saveGraphicsState()
  guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fputs("could not create graphics context for \(icon.file)\n", stderr)
    exit(1)
  }
  NSGraphicsContext.current = context
  NSColor.clear.setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
  let rect = NSRect(x: 14, y: 14, width: 100, height: 100)
  image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
  context.compositingOperation = .sourceIn
  NSColor.white.setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
  NSGraphicsContext.restoreGraphicsState()
  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("could not encode \(icon.file)\n", stderr)
    exit(1)
  }
  try png.write(to: output.appendingPathComponent(icon.file), options: .atomic)
}
