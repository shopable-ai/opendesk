import AppKit
import Foundation

struct CountdownIcon {
  let symbol: String
  let file: String
}

let icons = [
  CountdownIcon(symbol: "3.circle.fill", file: "countdown-3.png"),
  CountdownIcon(symbol: "2.circle.fill", file: "countdown-2.png"),
  CountdownIcon(symbol: "1.circle.fill", file: "countdown-1.png"),
]

guard CommandLine.arguments.count == 2 else {
  fputs("usage: swift render-countdown-icons.swift <output-directory>\n", stderr)
  exit(64)
}

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

for icon in icons {
  guard let image = NSImage(systemSymbolName: icon.symbol, accessibilityDescription: nil)?
    .withSymbolConfiguration(.init(pointSize: 88, weight: .semibold)) else {
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
  image.draw(in: NSRect(x: 12, y: 12, width: 104, height: 104), from: .zero, operation: .sourceOver, fraction: 1)
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
