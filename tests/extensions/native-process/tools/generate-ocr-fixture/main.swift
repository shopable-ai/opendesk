import AppKit
import Foundation

private struct Options {
    var outputDirectory: URL
}

private func parseOptions() throws -> Options {
    let arguments = Array(CommandLine.arguments.dropFirst())
    guard arguments.count == 2, arguments[0] == "--output-dir" else {
        throw NSError(
            domain: "GenerateOCRFixture",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "usage: generate-ocr-fixture --output-dir <directory>"]
        )
    }
    return Options(outputDirectory: URL(fileURLWithPath: arguments[1], isDirectory: true))
}

private func sha256(_ fileURL: URL) throws -> String {
    let process = Process()
    let stdout = Pipe()
    let stderr = Pipe()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/shasum")
    process.arguments = ["-a", "256", fileURL.path]
    process.standardOutput = stdout
    process.standardError = stderr
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        let message = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        throw NSError(
            domain: "GenerateOCRFixture",
            code: Int(process.terminationStatus),
            userInfo: [NSLocalizedDescriptionKey: "shasum failed: \(message)"]
        )
    }
    let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    guard let digest = output.split(whereSeparator: { $0.isWhitespace }).first else {
        throw NSError(
            domain: "GenerateOCRFixture",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey: "shasum returned no digest"]
        )
    }
    return String(digest)
}

private func makeFixture(width: Int, height: Int) throws -> (Data, String, String) {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(
            domain: "GenerateOCRFixture",
            code: 4,
            userInfo: [NSLocalizedDescriptionKey: "could not create bitmap graphics context"]
        )
    }

    let englishFont = NSFont(name: "Helvetica-Bold", size: 78) ?? NSFont.boldSystemFont(ofSize: 78)
    let chineseFont = NSFont(name: "PingFangSC-Semibold", size: 78) ?? NSFont.systemFont(ofSize: 78, weight: .semibold)
    let englishFontName = englishFont.fontName
    let chineseFontName = chineseFont.fontName
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.shouldAntialias = true
    context.imageInterpolation = .high

    NSColor.white.setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

    let englishAttributes: [NSAttributedString.Key: Any] = [
        .font: englishFont,
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph,
    ]
    let chineseAttributes: [NSAttributedString.Key: Any] = [
        .font: chineseFont,
        .foregroundColor: NSColor.black,
        .paragraphStyle: paragraph,
    ]

    NSString(string: "OPENDESK OCR 123").draw(
        in: NSRect(x: 60, y: 285, width: width - 120, height: 110),
        withAttributes: englishAttributes
    )
    NSString(string: "你好 456").draw(
        in: NSRect(x: 60, y: 105, width: width - 120, height: 110),
        withAttributes: chineseAttributes
    )

    NSGraphicsContext.restoreGraphicsState()

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(
            domain: "GenerateOCRFixture",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "could not encode fixture as PNG"]
        )
    }
    return (png, englishFontName, chineseFontName)
}

private func run() throws {
    let options = try parseOptions()
    let fileManager = FileManager.default
    try fileManager.createDirectory(at: options.outputDirectory, withIntermediateDirectories: true)

    let width = 1200
    let height = 520
    let imageName = "opendesk-ocr-123.png"
    let imageURL = options.outputDirectory.appendingPathComponent(imageName)
    let manifestURL = options.outputDirectory.appendingPathComponent("manifest.json")
    let (png, englishFont, chineseFont) = try makeFixture(width: width, height: height)
    try png.write(to: imageURL, options: .atomic)
    let digest = try sha256(imageURL)

    let manifest: [String: Any] = [
        "schemaVersion": "1.0.0",
        "fixtureId": "native-process-apple-vision-ocr-v0",
        "image": imageName,
        "width": width,
        "height": height,
        "sha256": digest,
        "expected": [
            "contains": ["OPENDESK OCR 123", "你好 456"],
            "text": "OPENDESK OCR 123\n你好 456",
        ],
        "languages": ["zh-Hans", "en-US"],
        "privacy": "synthetic-no-user-data",
        "provenance": [
            "kind": "project-generated",
            "generator": "tests/extensions/native-process/tools/generate-ocr-fixture/main.swift",
            "externalImageAssets": false,
            "fontFilesRedistributed": false,
            "englishSystemFont": englishFont,
            "chineseSystemFont": chineseFont,
        ],
        "license": [
            "status": "project-created-test-fixture",
            "note": "No external image or font file is redistributed; macOS system fonts are rasterized into this synthetic PNG.",
        ],
    ]
    let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    var output = manifestData
    output.append(0x0A)
    try output.write(to: manifestURL, options: .atomic)

    print("generated \(imageURL.path)")
    print("sha256 \(digest)")
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("generate-ocr-fixture: \(error.localizedDescription)\n".utf8))
    exit(1)
}
