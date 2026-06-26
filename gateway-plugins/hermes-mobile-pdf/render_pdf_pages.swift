import AppKit
import Foundation
import PDFKit

func jsonEscape(_ value: String) -> String {
    var out = ""
    for scalar in value.unicodeScalars {
        switch scalar.value {
        case 0x22: out += "\\\""
        case 0x5C: out += "\\\\"
        case 0x08: out += "\\b"
        case 0x0C: out += "\\f"
        case 0x0A: out += "\\n"
        case 0x0D: out += "\\r"
        case 0x09: out += "\\t"
        case 0x00...0x1F:
            out += String(format: "\\u%04X", scalar.value)
        default:
            out.unicodeScalars.append(scalar)
        }
    }
    return out
}

func printError(_ code: String) {
    print("{\"ok\":false,\"error\":\"\(jsonEscape(code))\"}")
}

func boundedInt(_ value: String?, _ fallback: Int, _ minValue: Int, _ maxValue: Int) -> Int {
    guard let value = value, let parsed = Int(value) else { return fallback }
    return max(minValue, min(maxValue, parsed))
}

func boundedDouble(_ value: String?, _ fallback: Double, _ minValue: Double, _ maxValue: Double) -> Double {
    guard let value = value, let parsed = Double(value), parsed.isFinite else { return fallback }
    return max(minValue, min(maxValue, parsed))
}

let args = CommandLine.arguments
if args.count < 6 {
    printError("pdf_renderer_args_required")
    exit(0)
}

let pdfURL = URL(fileURLWithPath: args[1])
let outputDir = URL(fileURLWithPath: args[2], isDirectory: true)
let startPage = boundedInt(args[3], 1, 1, 100000)
let maxPages = boundedInt(args[4], 12, 1, 50)
let scale = boundedDouble(args[5], 2.0, 0.5, 4.0)

do {
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
} catch {
    printError("pdf_output_dir_create_failed")
    exit(0)
}

guard let document = PDFDocument(url: pdfURL) else {
    printError("pdf_open_failed")
    exit(0)
}

let pageCount = document.pageCount
if pageCount <= 0 {
    printError("pdf_has_no_pages")
    exit(0)
}

let firstIndex = max(0, startPage - 1)
if firstIndex >= pageCount {
    printError("pdf_start_page_out_of_range")
    exit(0)
}

let lastIndexExclusive = min(pageCount, firstIndex + maxPages)
var pages: [String] = []

for index in firstIndex..<lastIndexExclusive {
    guard let page = document.page(at: index) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let width = max(1.0, bounds.width * scale)
    let height = max(1.0, bounds.height * scale)
    let size = NSSize(width: width, height: height)
    let image = NSImage(size: size)
    image.lockFocus()
    NSColor.white.setFill()
    NSRect(origin: .zero, size: size).fill()
    if let context = NSGraphicsContext.current?.cgContext {
        context.saveGState()
        context.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: context)
        context.restoreGState()
    }
    image.unlockFocus()

    guard
        let tiff = image.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:])
    else {
        printError("pdf_page_render_failed")
        exit(0)
    }

    let pageNumber = index + 1
    let filename = String(format: "page-%03d.png", pageNumber)
    let outputURL = outputDir.appendingPathComponent(filename)
    do {
        try png.write(to: outputURL)
    } catch {
        printError("pdf_page_write_failed")
        exit(0)
    }
    pages.append("{\"page\":\(pageNumber),\"path\":\"\(jsonEscape(outputURL.path))\",\"width\":\(Int(width)),\"height\":\(Int(height))}")
}

let payload = [
    "\"ok\":true",
    "\"source\":\"pdfkit\"",
    "\"pageCount\":\(pageCount)",
    "\"startPage\":\(startPage)",
    "\"pagesRendered\":\(pages.count)",
    "\"outputDir\":\"\(jsonEscape(outputDir.path))\"",
    "\"pages\":[\(pages.joined(separator: ","))]"
].joined(separator: ",")
print("{\(payload)}")
