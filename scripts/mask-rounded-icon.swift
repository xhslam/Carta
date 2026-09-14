import AppKit
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 3 else {
  fputs("usage: mask-rounded-icon INPUT OUTPUT\n", stderr)
  exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard
  let image = NSImage(contentsOf: input),
  let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  fputs("could not read input image\n", stderr)
  exit(1)
}

let width = source.width
let height = source.height
guard width == height else {
  fputs("input image must be square\n", stderr)
  exit(1)
}

let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
  data: nil,
  width: width,
  height: height,
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("could not create drawing context\n", stderr)
  exit(1)
}

// The generated artwork's tile begins 3.43% inside the square. Reconstruct
// that edge geometrically so the surrounding pixels are truly transparent.
let side = CGFloat(width)
let inset = side * 0.0343
let tile = CGRect(x: inset, y: inset, width: side - 2 * inset, height: side - 2 * inset)
let radius = side * 0.212
context.clear(CGRect(x: 0, y: 0, width: width, height: height))
context.saveGState()
context.addPath(CGPath(roundedRect: tile, cornerWidth: radius, cornerHeight: radius, transform: nil))
context.clip()
context.interpolationQuality = .high
context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
context.restoreGState()

guard
  let result = context.makeImage(),
  let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil)
else {
  fputs("could not create PNG output\n", stderr)
  exit(1)
}
CGImageDestinationAddImage(destination, result, nil)
guard CGImageDestinationFinalize(destination) else {
  fputs("could not write PNG output\n", stderr)
  exit(1)
}
