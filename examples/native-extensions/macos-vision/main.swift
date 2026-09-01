import Foundation
import ImageIO
import Vision

let protocolName = "opendesk-native-extension"
let protocolVersion = 1

struct ExtensionFailure: Error {
    let code: String
    let message: String
}

struct Request {
    let id: String
    let method: String
    let params: [String: Any]
}

struct ResponseContext {
    var id = ""
    var method = ""
}

struct RecognizedOCRItem {
    let text: String
    let confidence: Double
    let boundingBox: CGRect
}

struct OCRLine {
    let anchorMaxY: CGFloat
    let anchorMidY: CGFloat
    var items: [RecognizedOCRItem]
}

// Vision can split one visual line into observations whose vertical bounds
// differ slightly. Grouping with a normalized tolerance before sorting avoids
// placing that framework-order drift into the public result.
let normalizedSameLineTolerance: CGFloat = 0.02

func parseRequest(_ data: Data, context: inout ResponseContext) throws -> Request {
    guard !data.isEmpty else {
        throw ExtensionFailure(
            code: "invalid_json",
            message: "stdin must contain one valid JSON request"
        )
    }

    let value: Any
    do {
        value = try JSONSerialization.jsonObject(with: data)
    } catch {
        throw ExtensionFailure(
            code: "invalid_json",
            message: "stdin must contain one valid JSON request"
        )
    }
    guard let object = value as? [String: Any] else {
        throw ExtensionFailure(code: "invalid_request", message: "request must be a JSON object")
    }

    if let id = object["id"] as? String {
        context.id = id
    }
    if let method = object["method"] as? String {
        context.method = method
    }

    guard let requestProtocol = object["protocol"] as? String else {
        throw ExtensionFailure(code: "invalid_request", message: "protocol must be a string")
    }
    guard requestProtocol == protocolName else {
        throw ExtensionFailure(code: "protocol_mismatch", message: "unsupported protocol")
    }
    guard let version = exactInteger(object["version"]) else {
        throw ExtensionFailure(code: "invalid_request", message: "version must be an integer")
    }
    guard version == protocolVersion else {
        throw ExtensionFailure(code: "unsupported_version", message: "unsupported protocol version")
    }
    guard let id = object["id"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw ExtensionFailure(code: "invalid_request", message: "id must be a non-empty string")
    }
    guard let method = object["method"] as? String,
          !method.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw ExtensionFailure(code: "invalid_request", message: "method must be a non-empty string")
    }
    guard let params = object["params"] as? [String: Any] else {
        throw ExtensionFailure(code: "invalid_params", message: "params must be an object")
    }

    return Request(id: id, method: method, params: params)
}

func exactInteger(_ value: Any?) -> Int? {
    guard let number = value as? NSNumber,
          CFGetTypeID(number) != CFBooleanGetTypeID() else {
        return nil
    }
    let doubleValue = number.doubleValue
    guard doubleValue.isFinite,
          doubleValue.rounded(.towardZero) == doubleValue,
          doubleValue >= Double(Int.min),
          doubleValue <= Double(Int.max) else {
        return nil
    }
    return number.intValue
}

func dispatch(_ request: Request) throws -> [String: Any] {
    guard request.method == "ocr" else {
        throw ExtensionFailure(code: "unknown_method", message: "unknown method")
    }
    return try callOCR(params: request.params)
}

func callOCR(params: [String: Any]) throws -> [String: Any] {
    guard let imagePathValue = params["imagePath"] else {
        throw ExtensionFailure(code: "invalid_params", message: "imagePath is required")
    }
    guard let imagePath = imagePathValue as? String,
          !imagePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw ExtensionFailure(code: "invalid_params", message: "imagePath must be a non-empty string")
    }
    guard NSString(string: imagePath).isAbsolutePath else {
        throw ExtensionFailure(code: "invalid_params", message: "imagePath must be absolute")
    }

    let levelName: String
    if let value = params["recognitionLevel"] {
        guard let stringValue = value as? String else {
            throw ExtensionFailure(
                code: "invalid_params",
                message: "recognitionLevel must be accurate or fast"
            )
        }
        levelName = stringValue
    } else {
        levelName = "accurate"
    }

    let recognitionLevel: VNRequestTextRecognitionLevel
    switch levelName {
    case "accurate":
        recognitionLevel = .accurate
    case "fast":
        recognitionLevel = .fast
    default:
        throw ExtensionFailure(
            code: "invalid_params",
            message: "recognitionLevel must be accurate or fast"
        )
    }

    let languages = try parseLanguages(params["languages"])
    let visionRequest = VNRecognizeTextRequest()
    visionRequest.revision = VNRecognizeTextRequestRevision2
    visionRequest.recognitionLevel = recognitionLevel
    visionRequest.usesLanguageCorrection = true

    if let languages = languages {
        let supported: [String]
        do {
            supported = try visionRequest.supportedRecognitionLanguages()
        } catch {
            throw ExtensionFailure(
                code: "ocr_failed",
                message: "failed to query supported OCR languages"
            )
        }
        let unsupported = languages.filter { !supported.contains($0) }
        guard unsupported.isEmpty else {
            throw ExtensionFailure(
                code: "invalid_params",
                message: "languages contain values unsupported by the selected recognition level"
            )
        }
        visionRequest.recognitionLanguages = languages
    }

    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: imagePath, isDirectory: &isDirectory) else {
        throw ExtensionFailure(code: "image_not_found", message: "imagePath does not exist")
    }
    guard !isDirectory.boolValue else {
        throw ExtensionFailure(code: "invalid_image", message: "imagePath is not an image file")
    }

    let imageURL = URL(fileURLWithPath: imagePath)
    guard let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
          CGImageSourceGetCount(source) > 0,
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw ExtensionFailure(code: "invalid_image", message: "imagePath is not a supported image")
    }

    let orientation = imageOrientation(source)
    let dimensions = processedDimensions(image: image, orientation: orientation)
    let handler = VNImageRequestHandler(
        cgImage: image,
        orientation: orientation,
        options: [:]
    )
    do {
        try handler.perform([visionRequest])
    } catch {
        throw ExtensionFailure(code: "ocr_failed", message: "Vision text recognition failed")
    }

    let recognizedItems: [RecognizedOCRItem] = (visionRequest.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else {
            return nil
        }
        return RecognizedOCRItem(
            text: candidate.string,
            confidence: Double(candidate.confidence),
            boundingBox: observation.boundingBox
        )
    }
    let orderedItems = stableReadingOrder(recognizedItems)
    let items: [[String: Any]] = orderedItems.map { item in
        let box = item.boundingBox
        return [
            "text": item.text,
            "confidence": item.confidence,
            "boundingBox": [
                "x": Double(box.minX),
                "y": Double(box.minY),
                "width": Double(box.width),
                "height": Double(box.height),
            ],
        ]
    }

    return [
        "text": orderedItems.map(\.text).joined(separator: "\n"),
        "items": items,
        "image": [
            "width": dimensions.width,
            "height": dimensions.height,
        ],
        "coordinateSystem": [
            "unit": "normalized",
            "origin": "lower-left",
            "reference": "processed-image",
        ],
    ]
}

func parseLanguages(_ value: Any?) throws -> [String]? {
    guard let value = value else {
        return nil
    }
    guard let values = value as? [Any], !values.isEmpty else {
        throw ExtensionFailure(
            code: "invalid_params",
            message: "languages must be a non-empty array of language strings"
        )
    }
    var languages: [String] = []
    languages.reserveCapacity(values.count)
    for value in values {
        guard let language = value as? String,
              !language.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ExtensionFailure(
                code: "invalid_params",
                message: "languages must be a non-empty array of language strings"
            )
        }
        languages.append(language)
    }
    return languages
}

func stableReadingOrder(_ items: [RecognizedOCRItem]) -> [RecognizedOCRItem] {
    // Do not put a tolerance directly in a sorted comparator: pairwise
    // "approximately equal" comparisons are not transitive. Build explicit
    // line groups from a deterministic vertical order, then sort within lines.
    let verticalOrder = items.sorted(by: verticalPrecedes)
    var lines: [OCRLine] = []

    for item in verticalOrder {
        var bestLineIndex: Int?
        var bestDistance = CGFloat.greatestFiniteMagnitude

        for index in lines.indices {
            guard let distance = sameLineDistance(item, line: lines[index]) else {
                continue
            }
            if distance < bestDistance {
                bestDistance = distance
                bestLineIndex = index
            }
        }

        if let index = bestLineIndex {
            lines[index].items.append(item)
        } else {
            lines.append(OCRLine(
                anchorMaxY: item.boundingBox.maxY,
                anchorMidY: item.boundingBox.midY,
                items: [item]
            ))
        }
    }

    lines.sort(by: linePrecedes)
    return lines.flatMap { line in
        line.items.sorted(by: horizontalPrecedes)
    }
}

func sameLineDistance(_ item: RecognizedOCRItem, line: OCRLine) -> CGFloat? {
    let maxYDistance = abs(item.boundingBox.maxY - line.anchorMaxY)
    let midYDistance = abs(item.boundingBox.midY - line.anchorMidY)
    guard maxYDistance <= normalizedSameLineTolerance ||
          midYDistance <= normalizedSameLineTolerance else {
        return nil
    }
    return min(maxYDistance, midYDistance)
}

func verticalPrecedes(_ lhs: RecognizedOCRItem, _ rhs: RecognizedOCRItem) -> Bool {
    let lhsBox = lhs.boundingBox
    let rhsBox = rhs.boundingBox
    if lhsBox.maxY != rhsBox.maxY {
        return lhsBox.maxY > rhsBox.maxY
    }
    if lhsBox.midY != rhsBox.midY {
        return lhsBox.midY > rhsBox.midY
    }
    return horizontalPrecedes(lhs, rhs)
}

func linePrecedes(_ lhs: OCRLine, _ rhs: OCRLine) -> Bool {
    if lhs.anchorMaxY != rhs.anchorMaxY {
        return lhs.anchorMaxY > rhs.anchorMaxY
    }
    if lhs.anchorMidY != rhs.anchorMidY {
        return lhs.anchorMidY > rhs.anchorMidY
    }
    guard let lhsFirst = lhs.items.sorted(by: horizontalPrecedes).first,
          let rhsFirst = rhs.items.sorted(by: horizontalPrecedes).first else {
        return !lhs.items.isEmpty && rhs.items.isEmpty
    }
    return horizontalPrecedes(lhsFirst, rhsFirst)
}

func horizontalPrecedes(_ lhs: RecognizedOCRItem, _ rhs: RecognizedOCRItem) -> Bool {
    let lhsBox = lhs.boundingBox
    let rhsBox = rhs.boundingBox
    if lhsBox.minX != rhsBox.minX {
        return lhsBox.minX < rhsBox.minX
    }
    if lhsBox.maxX != rhsBox.maxX {
        return lhsBox.maxX < rhsBox.maxX
    }
    if lhsBox.maxY != rhsBox.maxY {
        return lhsBox.maxY > rhsBox.maxY
    }
    if lhsBox.minY != rhsBox.minY {
        return lhsBox.minY > rhsBox.minY
    }
    if lhs.text != rhs.text {
        return lhs.text < rhs.text
    }
    return lhs.confidence > rhs.confidence
}

func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let number = properties[kCGImagePropertyOrientation] as? NSNumber,
          let orientation = CGImagePropertyOrientation(rawValue: number.uint32Value) else {
        return .up
    }
    return orientation
}

func processedDimensions(
    image: CGImage,
    orientation: CGImagePropertyOrientation
) -> (width: Int, height: Int) {
    switch orientation {
    case .leftMirrored, .right, .rightMirrored, .left:
        return (image.height, image.width)
    default:
        return (image.width, image.height)
    }
}

func writeSuccess(id: String, result: [String: Any]) {
    writeResponse([
        "protocol": protocolName,
        "version": protocolVersion,
        "id": id,
        "ok": true,
        "result": result,
    ])
}

func writeFailure(id: String, failure: ExtensionFailure) {
    writeResponse([
        "protocol": protocolName,
        "version": protocolVersion,
        "id": id,
        "ok": false,
        "error": [
            "code": failure.code,
            "message": failure.message,
        ],
    ])
}

func writeResponse(_ object: [String: Any]) {
    do {
        var data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        data.append(0x0A)
        FileHandle.standardOutput.write(data)
    } catch {
        writeDiagnostic(method: "unknown", status: "fatal", code: "response_encode_failed")
        exit(1)
    }
}

func writeDiagnostic(method: String, status: String, code: String? = nil) {
    var line = "native-ext-macos-vision method=\(safeMethod(method)) status=\(status)"
    if let code = code {
        line += " code=\(code)"
    }
    line += "\n"
    FileHandle.standardError.write(Data(line.utf8))
}

func safeMethod(_ method: String) -> String {
    switch method {
    case "ocr":
        return "ocr"
    case "":
        return "missing"
    default:
        return "unknown"
    }
}

var context = ResponseContext()
do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let request = try parseRequest(input, context: &context)
    let result = try dispatch(request)
    writeSuccess(id: request.id, result: result)
    writeDiagnostic(method: request.method, status: "ok")
} catch let failure as ExtensionFailure {
    writeFailure(id: context.id, failure: failure)
    writeDiagnostic(method: context.method, status: "error", code: failure.code)
} catch {
    let failure = ExtensionFailure(code: "internal_error", message: "unexpected extension failure")
    writeFailure(id: context.id, failure: failure)
    writeDiagnostic(method: context.method, status: "error", code: failure.code)
}
