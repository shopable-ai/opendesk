import AppKit
import Foundation

struct Registry: Decodable {
  let schemaVersion: Int
  let icons: [Icon]
}

struct Icon: Decodable {
  let name: String
  let token: String
  let systemSymbol: String
  let scale: Double
  let offsetX: Double
  let offsetY: Double
}

struct RenderedIcon {
  let definition: Icon
  let png: Data
}

struct Manifest: Encodable {
  let schemaVersion: Int
  let registrySchemaVersion: Int
  let platform: String
  let operatingSystem: String
  let count: Int
  let rendered: Int
  let runtimeButtons: Int
  let missing: [String]
  let files: [String]
}

enum CatalogError: Error, CustomStringConvertible {
  case invalidArguments
  case invalidRegistry(String)
  case missingSymbols([String])
  case renderFailed(String)

  var description: String {
    switch self {
    case .invalidArguments:
      return "usage: swift main.swift <toolbar-icons-v1.json> <output-directory>"
    case .invalidRegistry(let message):
      return "invalid icon registry: \(message)"
    case .missingSymbols(let names):
      return "SF Symbols unavailable on this macOS version: \(names.joined(separator: ", "))"
    case .renderFailed(let name):
      return "could not render icon: \(name)"
    }
  }
}

func htmlText(_ value: String) -> String {
  value
    .replacingOccurrences(of: "&", with: "&amp;")
    .replacingOccurrences(of: "<", with: "&lt;")
    .replacingOccurrences(of: ">", with: "&gt;")
}

func htmlAttribute(_ value: String) -> String {
  htmlText(value)
    .replacingOccurrences(of: "\"", with: "&quot;")
    .replacingOccurrences(of: "'", with: "&#39;")
}

func runtimeButtonID(_ iconName: String) -> String {
  "icon-" + iconName.replacingOccurrences(of: ".", with: "-")
}

func render(_ icon: Icon) throws -> Data {
  guard let symbol = NSImage(
    systemSymbolName: icon.systemSymbol,
    accessibilityDescription: nil
  )?.withSymbolConfiguration(.init(
    pointSize: CGFloat(58 * icon.scale),
    weight: .medium,
    scale: .medium
  )) else {
    throw CatalogError.missingSymbols([icon.name])
  }

  let size = NSSize(width: 96, height: 96)
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
  ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw CatalogError.renderFailed(icon.name)
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  NSColor.clear.setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

  let pointSize = CGFloat(58 * icon.scale)
  let target = NSRect(
    x: (size.width - pointSize) / 2 + CGFloat(icon.offsetX * 2),
    y: (size.height - pointSize) / 2 + CGFloat(icon.offsetY * 2),
    width: pointSize,
    height: pointSize
  )
  symbol.draw(in: target, from: .zero, operation: .sourceOver, fraction: 1)
  context.compositingOperation = .sourceIn
  NSColor(calibratedRed: 0.91, green: 0.94, blue: 1, alpha: 1).setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
  NSGraphicsContext.restoreGraphicsState()

  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    throw CatalogError.renderFailed(icon.name)
  }
  return png
}

func validate(_ registry: Registry) throws {
  guard registry.schemaVersion == 1 else {
    throw CatalogError.invalidRegistry("schemaVersion must be 1")
  }
  guard registry.icons.count == 150 else {
    throw CatalogError.invalidRegistry("expected exactly 150 icons")
  }
  guard Set(registry.icons.map(\.name)).count == registry.icons.count else {
    throw CatalogError.invalidRegistry("icon names must be unique")
  }
  guard Set(registry.icons.map(\.token)).count == registry.icons.count else {
    throw CatalogError.invalidRegistry("icon tokens must be unique")
  }
  guard Set(registry.icons.map(\.systemSymbol)).count == registry.icons.count else {
    throw CatalogError.invalidRegistry("system symbols must be unique")
  }
  let runtimeButtonIDs = registry.icons.map { runtimeButtonID($0.name) }
  guard Set(runtimeButtonIDs).count == registry.icons.count else {
    throw CatalogError.invalidRegistry("icon names must map to unique Runtime button ids")
  }
  for buttonID in runtimeButtonIDs {
    guard buttonID.range(of: #"^[A-Za-z][A-Za-z0-9_-]{0,63}$"#, options: .regularExpression) != nil else {
      throw CatalogError.invalidRegistry("invalid Runtime button id \(buttonID)")
    }
  }
  for icon in registry.icons {
    guard (0.5 ... 1.25).contains(icon.scale),
          abs(icon.offsetX) <= 4,
          abs(icon.offsetY) <= 4 else {
      throw CatalogError.invalidRegistry("invalid presentation for \(icon.name)")
    }
  }
}

func makeHTML(_ icons: [RenderedIcon]) -> String {
  let cards = icons.map { item -> String in
    let name = htmlText(item.definition.name)
    let nameAttribute = htmlAttribute(item.definition.name)
    let buttonID = runtimeButtonID(item.definition.name)
    let usage = "toolbar.addButton(\"\(buttonID)\", \"动作说明\", \"\(item.definition.name)\", () => {});"
    let image = item.png.base64EncodedString()
    return """
      <article class="icon-card" data-search="\(nameAttribute)">
        <button class="icon-preview" type="button" data-copy="\(nameAttribute)" aria-label="复制图标名称 \(nameAttribute)" title="复制 \(nameAttribute)">
          <img src="data:image/png;base64,\(image)" alt="">
        </button>
        <code class="icon-name">\(name)</code>
        <button class="copy-usage" type="button" data-copy="\(htmlAttribute(usage))">复制用法</button>
      </article>
    """
  }.joined(separator: "\n")

  return """
  <!doctype html>
  <!-- Generated by scripts/render_custom_ui_icon_catalog.sh; do not edit by hand. -->
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>OpenDesk Custom UI 内置图标</title>
      <style>
        :root{--card-min:150px;--preview-size:92px;--image-size:84px;color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        body.compact{--card-min:112px;--preview-size:66px;--image-size:58px}
        *{box-sizing:border-box}
        body{margin:0;background:#080b12;color:#f7f9ff}
        .shell{max-width:1440px;margin:auto;padding:36px}
        .hero{display:flex;justify-content:space-between;align-items:end;gap:24px;padding-bottom:24px;border-bottom:1px solid #263047}
        h1{margin:0 0 8px;font-size:30px}.hero p{margin:0;color:#aab5c9;line-height:1.6}
        .summary{white-space:nowrap;padding:10px 14px;border:1px solid #334468;border-radius:999px;background:#17213a;color:#bed1ff;font-weight:700}
        .controls{position:sticky;top:0;z-index:2;display:flex;gap:10px;padding:18px 0;background:#080b12e8;backdrop-filter:blur(12px)}
        input{min-width:240px;flex:1;padding:11px 13px;border:1px solid #344158;border-radius:9px;background:#101622;color:#fff;font:inherit}
        button{border:1px solid #344158;color:#eef3ff;background:#172033;cursor:pointer;font:inherit}
        button:hover{background:#22304a;border-color:#5f78a7}button:focus-visible,input:focus-visible{outline:2px solid #74a2ff;outline-offset:2px}
        .toolbar-button{padding:10px 13px;border-radius:9px}.status{min-width:120px;align-self:center;color:#9eacc3;font-size:13px;text-align:right}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--card-min),1fr));gap:12px}
        .icon-card{min-width:0;padding:14px 10px;border:1px solid #253047;border-radius:12px;background:#111722;text-align:center}
        .icon-card[hidden]{display:none}.icon-preview{display:grid;width:var(--preview-size);height:var(--preview-size);margin:auto;place-items:center;border-radius:14px;background:#1b2536}
        .icon-preview img{width:var(--image-size);height:var(--image-size)}.icon-name{display:block;margin:10px 0 9px;overflow:hidden;color:#cbd6e9;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-overflow:ellipsis;white-space:nowrap}
        .copy-usage{width:100%;padding:6px;border-radius:7px;color:#aebbd1;font-size:11px}
        footer{margin-top:28px;padding-top:18px;border-top:1px solid #263047;color:#8f9db4;line-height:1.6}
        @media(max-width:700px){:root{--card-min:120px}.shell{padding:20px}.hero{align-items:start;flex-direction:column}.controls{flex-wrap:wrap}.status{width:100%;text-align:left}}
      </style>
    </head>
    <body>
      <main class="shell">
        <header class="hero">
          <div>
            <h1>Custom UI 内置图标</h1>
            <p>点击图标复制名称，或复制完整的 <code>FloatingWindow.addButton()</code> 用法。页面自包含，可离线保存和打开。</p>
          </div>
          <div class="summary">150 / 150 已渲染</div>
        </header>
        <section class="controls" aria-label="图标目录工具">
          <input id="search" type="search" placeholder="搜索，例如 camera、doc、wifi" aria-label="搜索图标">
          <button id="toggleDensity" class="toolbar-button" type="button" aria-pressed="false">紧凑模式</button>
          <button id="copyAll" class="toolbar-button" type="button">复制全部名称</button>
          <button id="saveJSON" class="toolbar-button" type="button">保存 JSON</button>
          <span id="status" class="status" aria-live="polite">150 个图标</span>
        </section>
        <section id="grid" class="grid" aria-label="内置图标列表">
          \(cards)
        </section>
        <footer>由 <code>pkg/customui/assets/toolbar-icons-v1.json</code> 在当前 macOS 上生成。此 HTML 用于查找和复制；真实 Runtime 窗口由 <code>examples/custom-ui/icon-catalog.js</code> 加载同一批生成图像，并在一个可滚动界面中绑定全部 150 个按钮。</footer>
      </main>
      <script>
        const cards = [...document.querySelectorAll('.icon-card')];
        const status = document.getElementById('status');
        const names = cards.map(card => card.dataset.search);
        async function copyText(value) {
          try {
            await navigator.clipboard.writeText(value);
          } catch (_) {
            const field = document.createElement('textarea');
            field.value = value;
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            const copied = document.execCommand('copy');
            field.remove();
            if (!copied) throw new Error('copy failed');
          }
          status.textContent = '已复制：' + (value.length > 44 ? value.slice(0, 44) + '…' : value);
        }
        document.addEventListener('click', event => {
          const button = event.target.closest('[data-copy]');
          if (button) copyText(button.dataset.copy).catch(() => { status.textContent = '复制失败，请手动选择名称'; });
        });
        document.getElementById('search').addEventListener('input', event => {
          const query = event.target.value.trim().toLowerCase();
          let visible = 0;
          for (const card of cards) {
            card.hidden = query !== '' && !card.dataset.search.includes(query);
            if (!card.hidden) visible += 1;
          }
          status.textContent = visible + ' 个图标';
        });
        document.getElementById('toggleDensity').addEventListener('click', event => {
          const compact = document.body.classList.toggle('compact');
          event.currentTarget.setAttribute('aria-pressed', String(compact));
          event.currentTarget.textContent = compact ? '大图模式' : '紧凑模式';
        });
        document.getElementById('copyAll').addEventListener('click', () => copyText(names.join('\\n')));
        document.getElementById('saveJSON').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify({schemaVersion:1,icons:names}, null, 2)], {type:'application/json'});
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'opendesk-custom-ui-icons.json';
          link.click();
          URL.revokeObjectURL(link.href);
          status.textContent = '已保存 JSON';
        });
      </script>
    </body>
  </html>
  """
}

func makeRuntimeHTML(_ icons: [RenderedIcon]) -> String {
  let cards = icons.enumerated().map { index, item -> String in
    let name = htmlText(item.definition.name)
    let tooltip = htmlAttribute(item.definition.name + " · 点击复制按钮代码")
    let image = item.png.base64EncodedString()
    return """
          <button id="\(runtimeButtonID(item.definition.name))" class="icon-card" type="button" title="\(tooltip)" aria-label="\(tooltip)" aria-pressed="false" data-index="\(String(format: "%03d", index + 1))"><img src="data:image/png;base64,\(image)" alt=""><span class="icon-name">\(name)</span><span class="sr-only"> · 点击复制按钮代码</span></button>
    """
  }.joined(separator: "\n")

  return """
  <!doctype html>
  <!-- Generated Runtime-safe view; business behavior stays in icon-catalog.js. -->
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <title>OpenDesk Custom UI 内置图标目录</title>
      <style>
        html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#080b12;color:#f7f9ff;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}
        body{display:flex;flex-direction:column}
        header{flex:0 0 72px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 24px;border-bottom:1px solid #263047;background:#0d1320}
        header strong{font-size:22px}#catalogStatus{color:#aebbd1;text-align:right}
        main{flex:1;min-height:0;overflow-y:auto;padding:18px 20px 28px}
        .icon-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:10px}
        .icon-card{min-width:0;min-height:104px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 6px;border:1px solid #2b3850;border-radius:12px;background:#141d2b;color:#eef3ff;cursor:pointer}
        .icon-card:hover{border-color:#6b87ba;background:#1b2940}.icon-card:focus-visible{outline:3px solid #74a2ff;outline-offset:2px}
        .icon-card.is-copied,.icon-card[aria-pressed="true"]{border-color:#58d68d;background:#17352f;box-shadow:0 0 0 2px #58d68d}
        .icon-card img{width:48px;height:48px;pointer-events:none}
        .icon-card span{display:block;max-width:100%;pointer-events:none}
        .icon-name{margin-top:4px;overflow:hidden;color:#d8e2f4;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-overflow:ellipsis;white-space:nowrap}
        .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;border:0;clip:rect(0,0,0,0);white-space:nowrap}
      </style>
    </head>
    <body>
      <header>
        <strong>150 个内置图标</strong>
        <span id="catalogStatus" aria-live="polite">向下滚动查看全部图标 · 悬停看名称 · 点击复制按钮代码</span>
      </header>
      <main aria-label="全部 150 个内置图标，可滚动">
        <section class="icon-grid" aria-label="内置图标列表">
  \(cards)
        </section>
      </main>
    </body>
  </html>
  """
}

func makeContactSheet(_ icons: [RenderedIcon]) throws -> Data {
  let columns = 10
  let rows = (icons.count + columns - 1) / columns
  let cellWidth: CGFloat = 150
  let cellHeight: CGFloat = 92
  let headerHeight: CGFloat = 76
  let size = NSSize(width: cellWidth * CGFloat(columns), height: headerHeight + cellHeight * CGFloat(rows))
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
  ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw CatalogError.renderFailed("contact-sheet")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.075, alpha: 1).setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

  let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 24, weight: .bold),
    .foregroundColor: NSColor.white
  ]
  ("OpenDesk Custom UI · 150 Built-in Icons" as NSString).draw(
    at: NSPoint(x: 16, y: size.height - 46),
    withAttributes: titleAttributes
  )

  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  paragraph.lineBreakMode = .byTruncatingTail
  let labelAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: 9, weight: .regular),
    .foregroundColor: NSColor(calibratedRed: 0.78, green: 0.83, blue: 0.91, alpha: 1),
    .paragraphStyle: paragraph
  ]

  for (index, item) in icons.enumerated() {
    let column = index % columns
    let row = index / columns
    let x = CGFloat(column) * cellWidth + 6
    let y = size.height - headerHeight - CGFloat(row + 1) * cellHeight + 5
    let card = NSBezierPath(
      roundedRect: NSRect(x: x, y: y, width: cellWidth - 12, height: cellHeight - 10),
      xRadius: 10,
      yRadius: 10
    )
    NSColor(calibratedRed: 0.067, green: 0.09, blue: 0.133, alpha: 1).setFill()
    card.fill()
    guard let image = NSImage(data: item.png) else {
      throw CatalogError.renderFailed(item.definition.name)
    }
    image.draw(
      in: NSRect(x: x + (cellWidth - 70) / 2, y: y + 23, width: 58, height: 58),
      from: .zero,
      operation: .sourceOver,
      fraction: 1
    )
    (item.definition.name as NSString).draw(
      in: NSRect(x: x + 5, y: y + 7, width: cellWidth - 22, height: 13),
      withAttributes: labelAttributes
    )
  }
  NSGraphicsContext.restoreGraphicsState()

  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    throw CatalogError.renderFailed("contact-sheet")
  }
  return png
}

do {
  guard CommandLine.arguments.count == 3 else {
    throw CatalogError.invalidArguments
  }
  let registryURL = URL(fileURLWithPath: CommandLine.arguments[1])
  let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
  let registryData = try Data(contentsOf: registryURL)
  let registry = try JSONDecoder().decode(Registry.self, from: registryData)
  try validate(registry)
  try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

  var rendered: [RenderedIcon] = []
  var missing: [String] = []
  for icon in registry.icons {
    do {
      rendered.append(RenderedIcon(definition: icon, png: try render(icon)))
    } catch CatalogError.missingSymbols(_) {
      missing.append(icon.name)
    }
  }
  guard missing.isEmpty else {
    throw CatalogError.missingSymbols(missing)
  }

  let html = makeHTML(rendered)
  try html.write(
    to: outputURL.appendingPathComponent("index.html"),
    atomically: true,
    encoding: .utf8
  )
  try makeRuntimeHTML(rendered).write(
    to: outputURL.appendingPathComponent("runtime-window.html"),
    atomically: true,
    encoding: .utf8
  )
  try makeContactSheet(rendered).write(
    to: outputURL.appendingPathComponent("contact-sheet.png"),
    options: .atomic
  )

  let manifest = Manifest(
    schemaVersion: 1,
    registrySchemaVersion: registry.schemaVersion,
    platform: "darwin",
    operatingSystem: ProcessInfo.processInfo.operatingSystemVersionString,
    count: registry.icons.count,
    rendered: rendered.count,
    runtimeButtons: rendered.count,
    missing: missing,
    files: ["index.html", "runtime-window.html", "contact-sheet.png", "manifest.json"]
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  try encoder.encode(manifest).write(
    to: outputURL.appendingPathComponent("manifest.json"),
    options: .atomic
  )
  print("Rendered \(rendered.count)/\(registry.icons.count) Custom UI icons.")
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
