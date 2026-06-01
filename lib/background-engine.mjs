import sharp from 'sharp'

export const strategyValues = new Set(['auto', 'logo', 'smooth', 'ai'])
export const formatValues = new Set(['png', 'webp'])

export async function removeBackgroundToBuffer(input, options = {}) {
  const format = pickValue(options.format, formatValues, 'png')
  const strategy = pickValue(options.strategy, strategyValues, 'auto')
  const analysis = await analyzeImage(input)
  const effectiveStrategy = strategy === 'auto' ? chooseStrategy(analysis) : strategy

  let resultBuffer
  if (effectiveStrategy === 'logo') {
    resultBuffer = await removeConnectedBackground(input, {
      tolerance: numberArg(options.tolerance, 18),
      feather: numberArg(options.feather, 0),
      outputFormat: format,
    })
  } else if (effectiveStrategy === 'smooth') {
    resultBuffer = await removeSmoothBackground(input, {
      tolerance: numberArg(options.tolerance, 30),
      softness: numberArg(options.softness, 24),
      outputFormat: format,
    })
  } else {
    if (typeof options.aiHandler !== 'function') {
      throw new Error('AI strategy is available in the browser UI and local CLI, not this hosted API function')
    }
    resultBuffer = await options.aiHandler(input, {
      model: String(options.model ?? 'medium'),
      outputFormat: format,
    })
  }

  return {
    buffer: resultBuffer,
    analysis,
    strategy: effectiveStrategy,
    requestedStrategy: strategy,
    format,
  }
}

export async function analyzeImage(input) {
  const image = sharp(input, { limitInputPixels: false }).ensureAlpha()
  const metadata = await image.metadata()
  const stats = await image.stats()
  const raw = await image.resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
  const colors = countSampledColors(raw.data)
  const edge = edgeColorScore(raw.data, raw.info.width, raw.info.height)

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    channels: metadata.channels ?? 0,
    dominantColors: colors,
    edgeColor: edge,
    entropy: Number(stats.entropy.toFixed(4)),
    likelySmoothBackground: edge.confidence < 0.24 && stats.entropy < 4.2,
    likelyFlatArt: edge.confidence > 0.98 && colors <= 80 && stats.entropy < 1.2,
  }
}

export function chooseStrategy(analysis) {
  if (analysis.likelyFlatArt) return 'logo'
  if (analysis.likelySmoothBackground) return 'smooth'
  return 'ai'
}

export function pickValue(value, allowed, fallback) {
  if (!value) return fallback
  const normalized = String(value).toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

export function numberArg(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function removeConnectedBackground(input, options) {
  const image = sharp(input, { limitInputPixels: false }).ensureAlpha()
  const metadata = await image.metadata()
  const { width, height } = metadata
  if (!width || !height) throw new Error('Could not read image dimensions')

  const rgba = await image.raw().toBuffer()
  const backgroundColor = dominantEdgeColor(rgba, width, height).rgb
  const alpha = floodFillBackgroundAlpha(rgba, width, height, options.tolerance, backgroundColor)
  const featheredAlpha = await featherAlpha(alpha, width, height, options.feather)
  const composedRgba = Buffer.from(rgba)
  const foregroundColor = dominantForegroundColor(rgba, featheredAlpha, backgroundColor)
  cleanExteriorAntialias(composedRgba, featheredAlpha, width, height, backgroundColor, foregroundColor)
  for (let index = 0; index < width * height; index += 1) {
    composedRgba[index * 4 + 3] = featheredAlpha[index]
  }

  const composed = sharp(composedRgba, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })

  return options.outputFormat === 'webp'
    ? composed.webp({ quality: 98, alphaQuality: 100 }).toBuffer()
    : composed.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

async function removeSmoothBackground(input, options) {
  const image = sharp(input, { limitInputPixels: false }).ensureAlpha()
  const metadata = await image.metadata()
  const { width, height } = metadata
  if (!width || !height) throw new Error('Could not read image dimensions')

  const rgba = await image.raw().toBuffer()
  const backgroundProfile = estimateHorizontalBackground(rgba, width, height)
  const tolerance = options.tolerance
  const softness = Math.max(1, options.softness)
  const composedRgba = Buffer.from(rgba)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const offset = index * 4
      const bg = backgroundProfile[x]
      const distance = colorDistance(
        rgba[offset],
        rgba[offset + 1],
        rgba[offset + 2],
        bg[0],
        bg[1],
        bg[2],
      )

      if (distance <= tolerance) {
        composedRgba[offset + 3] = 0
      } else if (distance < tolerance + softness) {
        composedRgba[offset + 3] = Math.round(((distance - tolerance) / softness) * 255)
      }
    }
  }

  const composed = sharp(composedRgba, {
    raw: { width, height, channels: 4 },
    limitInputPixels: false,
  })

  return options.outputFormat === 'webp'
    ? composed.webp({ quality: 98, alphaQuality: 100 }).toBuffer()
    : composed.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

function estimateHorizontalBackground(rgba, width, height) {
  const profile = Array.from({ length: width }, () => [0, 0, 0])
  const sampleRows = [
    0,
    1,
    2,
    Math.max(0, height - 3),
    Math.max(0, height - 2),
    Math.max(0, height - 1),
  ]

  for (let x = 0; x < width; x += 1) {
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (const y of sampleRows) {
      const offset = (y * width + x) * 4
      r += rgba[offset]
      g += rgba[offset + 1]
      b += rgba[offset + 2]
      count += 1
    }
    profile[x] = [r / count, g / count, b / count]
  }

  return smoothProfile(profile, Math.max(9, Math.round(width / 90)))
}

function smoothProfile(profile, radius) {
  const smoothed = []
  for (let index = 0; index < profile.length; index += 1) {
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    const start = Math.max(0, index - radius)
    const end = Math.min(profile.length - 1, index + radius)
    for (let sample = start; sample <= end; sample += 1) {
      r += profile[sample][0]
      g += profile[sample][1]
      b += profile[sample][2]
      count += 1
    }
    smoothed.push([r / count, g / count, b / count])
  }
  return smoothed
}

function floodFillBackgroundAlpha(rgba, width, height, tolerance, seedColor) {
  const pixelCount = width * height
  const alpha = Buffer.alloc(pixelCount, 255)
  const visited = new Uint8Array(pixelCount)
  const queue = new Uint32Array(pixelCount)
  let head = 0
  let tail = 0

  for (const seed of perimeterIndexes(width, height)) {
    if (!matchesColor(rgba, seed, seedColor, tolerance)) continue
    visited[seed] = 1
    queue[tail] = seed
    tail += 1
  }

  while (head < tail) {
    const index = queue[head]
    head += 1
    alpha[index] = 0

    const x = index % width
    const y = Math.floor(index / width)
    pushNeighbor(index - 1, x > 0)
    pushNeighbor(index + 1, x < width - 1)
    pushNeighbor(index - width, y > 0)
    pushNeighbor(index + width, y < height - 1)
  }

  function pushNeighbor(next, allowed) {
    if (!allowed || visited[next]) return
    if (!matchesColor(rgba, next, seedColor, tolerance)) return
    visited[next] = 1
    queue[tail] = next
    tail += 1
  }

  return alpha
}

function cleanExteriorAntialias(rgba, alpha, width, height, backgroundColor, foregroundColor) {
  const originalAlpha = Buffer.from(alpha)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (originalAlpha[index] === 0 || !touchesTransparent(originalAlpha, width, height, x, y)) continue

      const offset = index * 4
      const pixel = [rgba[offset], rgba[offset + 1], rgba[offset + 2]]
      if (colorDistance(pixel[0], pixel[1], pixel[2], foregroundColor[0], foregroundColor[1], foregroundColor[2]) <= 6) continue

      const estimatedAlpha = estimateBlendAlpha(pixel, backgroundColor, foregroundColor)
      if (estimatedAlpha >= 0.985) continue

      const nextAlpha = clamp(Math.round(estimatedAlpha * 255), 0, 255)
      alpha[index] = nextAlpha

      if (nextAlpha > 0) {
        rgba[offset] = foregroundColor[0]
        rgba[offset + 1] = foregroundColor[1]
        rgba[offset + 2] = foregroundColor[2]
      }
    }
  }
}

function touchesTransparent(alpha, width, height, x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      if (alpha[ny * width + nx] === 0) return true
    }
  }
  return false
}

function estimateBlendAlpha(pixel, backgroundColor, foregroundColor) {
  const estimates = []
  for (let channel = 0; channel < 3; channel += 1) {
    const denominator = foregroundColor[channel] - backgroundColor[channel]
    if (Math.abs(denominator) < 8) continue
    estimates.push((pixel[channel] - backgroundColor[channel]) / denominator)
  }

  if (estimates.length === 0) return 1
  const average = estimates.reduce((sum, value) => sum + value, 0) / estimates.length
  return clamp(average, 0, 1)
}

function dominantForegroundColor(rgba, alpha, backgroundColor) {
  const buckets = new Map()

  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] === 0) continue
    const offset = index * 4
    const r = rgba[offset]
    const g = rgba[offset + 1]
    const b = rgba[offset + 2]
    if (colorDistance(r, g, b, backgroundColor[0], backgroundColor[1], backgroundColor[2]) < 42) continue
    const saturation = Math.max(r, g, b) - Math.min(r, g, b)
    if (saturation < 40) continue

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

async function featherAlpha(alpha, width, height, feather) {
  if (feather <= 0) {
    return alpha
  }

  return sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(feather)
    .raw()
    .toBuffer()
}

function matchesColor(rgba, index, color, tolerance) {
  const offset = index * 4
  return colorDistance(rgba[offset], rgba[offset + 1], rgba[offset + 2], color[0], color[1], color[2]) <= tolerance
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function countSampledColors(data) {
  const colors = new Set()
  for (let index = 0; index < data.length; index += 4) {
    const r = Math.round(data[index] / 16) * 16
    const g = Math.round(data[index + 1] / 16) * 16
    const b = Math.round(data[index + 2] / 16) * 16
    colors.add(`${r},${g},${b}`)
    if (colors.size > 80) break
  }
  return colors.size
}

function edgeColorScore(data, width, height) {
  const edge = dominantEdgeColor(data, width, height)
  return {
    rgb: edge.rgb,
    confidence: edge.confidence,
  }
}

function dominantEdgeColor(data, width, height) {
  const buckets = new Map()
  const samples = perimeterIndexes(width, height)

  for (const index of samples) {
    const offset = index * 4
    const key = [
      Math.round(data[offset] / 16),
      Math.round(data[offset + 1] / 16),
      Math.round(data[offset + 2] / 16),
    ].join(',')
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[offset]
    bucket.g += data[offset + 1]
    bucket.b += data[offset + 2]
    buckets.set(key, bucket)
  }

  let dominant = null
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) dominant = bucket
  }

  if (!dominant) {
    return { rgb: [255, 255, 255], confidence: 0 }
  }

  return {
    rgb: [
      Math.round(dominant.r / dominant.count),
      Math.round(dominant.g / dominant.count),
      Math.round(dominant.b / dominant.count),
    ],
    confidence: Number((dominant.count / samples.length).toFixed(4)),
  }
}

function perimeterIndexes(width, height) {
  const indexes = []
  for (let x = 0; x < width; x += 1) {
    indexes.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    indexes.push(y * width, y * width + width - 1)
  }
  return indexes
}
