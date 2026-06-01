import sharp from 'sharp'

export async function replaceColorToBuffer(input, options = {}) {
  const image = sharp(input, { limitInputPixels: false }).ensureAlpha()
  const metadata = await image.metadata()
  const { width, height } = metadata
  if (!width || !height) throw new Error('Could not read image dimensions')

  const rgba = await image.raw().toBuffer()
  const targetColor = options.from ? parseColor(options.from) : dominantVisibleColor(rgba)
  const replacement = parseColor(options.to ?? '#00b82e')
  const tolerance = numberArg(options.tolerance, 42)
  const softness = Math.max(1, numberArg(options.softness, 22))
  const preserveLightness = options.preserveLightness !== false

  const output = Buffer.from(rgba)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    if (rgba[offset + 3] === 0) continue

    const distance = colorDistance(
      rgba[offset],
      rgba[offset + 1],
      rgba[offset + 2],
      targetColor[0],
      targetColor[1],
      targetColor[2],
    )
    if (distance >= tolerance + softness) continue

    const strength = distance <= tolerance ? 1 : 1 - (distance - tolerance) / softness
    const next = preserveLightness
      ? applyReplacementWithLightness(rgba[offset], rgba[offset + 1], rgba[offset + 2], replacement)
      : replacement

    output[offset] = mix(rgba[offset], next[0], strength)
    output[offset + 1] = mix(rgba[offset + 1], next[1], strength)
    output[offset + 2] = mix(rgba[offset + 2], next[2], strength)
  }

  const composed = sharp(output, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })

  const format = options.format === 'webp' ? 'webp' : 'png'
  const buffer =
    format === 'webp'
      ? await composed.webp({ quality: 98, alphaQuality: 100 }).toBuffer()
      : await composed.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()

  return {
    buffer,
    format,
    targetColor: rgbToHex(targetColor),
    replacementColor: rgbToHex(replacement),
  }
}

function dominantVisibleColor(rgba) {
  const buckets = new Map()
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] < 128) continue
    const r = rgba[index]
    const g = rgba[index + 1]
    const b = rgba[index + 2]
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    if (saturation < 36) continue
    const key = [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16)].join(',')
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }

  let dominant = null
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) dominant = bucket
  }

  if (!dominant) return [0, 0, 0]

  return [
    Math.round(dominant.r / dominant.count),
    Math.round(dominant.g / dominant.count),
    Math.round(dominant.b / dominant.count),
  ]
}

function applyReplacementWithLightness(r, g, b, replacement) {
  const originalLightness = Math.max(r, g, b) / 255
  const replacementMax = Math.max(...replacement) || 1
  const scale = originalLightness * 255 / replacementMax
  return replacement.map((channel) => clamp(Math.round(channel * scale), 0, 255))
}

function parseColor(value) {
  const text = String(value).trim()
  const hex = text.startsWith('#') ? text.slice(1) : text
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ]
  }

  const rgb = text.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]

  throw new Error(`Unsupported color: ${value}`)
}

function rgbToHex(color) {
  return `#${color.map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function mix(from, to, strength) {
  return Math.round(from + (to - from) * clamp(strength, 0, 1))
}

function numberArg(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
