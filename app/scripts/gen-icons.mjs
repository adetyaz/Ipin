// Draws the Ìpín mark (indigo tile, three palm-gold bars) as PNG app icons.
// No dependencies: rasterises with supersampling and encodes PNG via zlib.
import { writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"

const INDIGO = [0x1f, 0x32, 0x70]
const PALM = [0xe3, 0xa8, 0x2f]

function crc32(buf) {
  let c,
    crc = 0xffffffff
  for (const b of buf) {
    c = (crc ^ b) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Shapes in a 32-unit design space. `maskable` = full-bleed square with the
// mark inside the 80% safe zone.
function sample(x, y, maskable) {
  const s = maskable ? 0.72 : 1
  const o = maskable ? (32 - 32 * s) / 2 : 0
  const inTile = maskable || roundRect(x, y, 0, 0, 32, 32, 9)
  if (!inTile) return null
  const u = (x - o) / s,
    v = (y - o) / s
  const bars = [
    [9, 14, 22.5],
    [16, 9.5, 22.5],
    [23, 17, 22.5],
  ]
  for (const [cx, y0, y1] of bars) {
    if (capsule(u, v, cx, y0, y1, 1.6)) return PALM
  }
  return INDIGO
}
function roundRect(x, y, x0, y0, w, h, r) {
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r)
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r)
  return (
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r &&
    x >= x0 &&
    y >= y0 &&
    x <= x0 + w &&
    y <= y0 + h
  )
}
function capsule(x, y, cx, y0, y1, r) {
  const cy = Math.min(Math.max(y, y0), y1)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function png(size, maskable) {
  const SS = 4
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(
            ((px + (sx + 0.5) / SS) / size) * 32,
            ((py + (sy + 0.5) / SS) / size) * 32,
            maskable,
          )
          if (c) {
            r += c[0]
            g += c[1]
            b += c[2]
            a += 255
          }
        }
      const n = SS * SS,
        i = py * (size * 4 + 1) + 1 + px * 4
      const cov = a / 255
      raw[i] = cov ? r / cov : 0
      raw[i + 1] = cov ? g / cov : 0
      raw[i + 2] = cov ? b / cov : 0
      raw[i + 3] = a / n
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

const out = new URL("../static/", import.meta.url)
writeFileSync(new URL("icon-192.png", out), png(192, false))
writeFileSync(new URL("icon-512.png", out), png(512, false))
writeFileSync(new URL("icon-maskable-512.png", out), png(512, true))
console.log("icons written")
