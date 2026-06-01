import sharp from 'sharp'

export const upscaleProviderValues = new Set(['topaz', 'sharp'])

const TOPAZ_BASE_URL = 'https://api.topazlabs.com/image/v1'
const TOPAZ_TRANSPARENCY_MODEL = 'Transparency Upscale'

const topazModelAliases = new Map([
  ['auto', 'auto'],
  ['transparent', TOPAZ_TRANSPARENCY_MODEL],
  ['transparency', TOPAZ_TRANSPARENCY_MODEL],
  ['transparency-upscale', TOPAZ_TRANSPARENCY_MODEL],
  ['high-fidelity', 'Upscale High Fidelity V3'],
  ['high-fidelity-3', 'Upscale High Fidelity V3'],
  ['photo', 'Upscale High Fidelity V3'],
  ['standard', 'Standard V2'],
  ['low-resolution', 'Low Resolution V2'],
  ['low-resolution-2', 'Low Resolution V2'],
  ['art', 'CGI'],
  ['cgi', 'CGI'],
  ['text', 'Text Refine'],
  ['text-shapes', 'Text Refine'],
])

export async function upscaleImageToBuffer(input, options = {}) {
  const provider = pickValue(options.provider, upscaleProviderValues, 'topaz')
  const image = sharp(input, { limitInputPixels: false })
  const metadata = await image.metadata()
  const inputWidth = metadata.width ?? 0
  const inputHeight = metadata.height ?? 0
  if (!inputWidth || !inputHeight) throw new Error('Could not read image dimensions for upscaling')

  const target = targetDimensions(inputWidth, inputHeight, options)
  if (target.width === inputWidth && target.height === inputHeight) {
    return {
      buffer: Buffer.isBuffer(input) ? input : await sharp(input, { limitInputPixels: false }).toBuffer(),
      provider: 'none',
      inputWidth,
      inputHeight,
      outputWidth: inputWidth,
      outputHeight: inputHeight,
    }
  }

  if (provider === 'sharp') {
    return upscaleWithSharp(input, metadata, target, options)
  }

  return upscaleWithTopaz(input, metadata, target, options)
}

export function parseTopazModel(value, metadata = {}) {
  if (!value) return metadata.hasAlpha ? TOPAZ_TRANSPARENCY_MODEL : 'Upscale High Fidelity V3'
  const normalized = String(value).trim()
  const alias = topazModelAliases.get(normalized.toLowerCase())
  if (!alias || alias === 'auto') return metadata.hasAlpha ? TOPAZ_TRANSPARENCY_MODEL : 'Upscale High Fidelity V3'
  return alias
}

export function normalizeScale(value, fallback = 2) {
  if (value === true || value === 'true') return fallback
  const scale = Number(value)
  if (!Number.isFinite(scale) || scale <= 1) return 1
  return Math.min(scale, 8)
}

async function upscaleWithSharp(input, metadata, target, options) {
  const format = outputFormat(options.format)
  const composed = sharp(input, { limitInputPixels: false })
    .ensureAlpha()
    .resize(target.width, target.height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.35, m1: 0.45, m2: 1.7 })

  return {
    buffer: await encode(composed, format),
    provider: 'sharp',
    model: 'lanczos3-sharpen',
    inputWidth: metadata.width,
    inputHeight: metadata.height,
    outputWidth: target.width,
    outputHeight: target.height,
    format,
  }
}

async function upscaleWithTopaz(input, metadata, target, options) {
  const apiKey = String(options.apiKey ?? process.env.TOPAZ_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('Topaz upscaling requires TOPAZ_API_KEY')

  const hasAlpha = Boolean(metadata.hasAlpha || metadata.channels === 4)
  const model = parseTopazModel(options.model, { hasAlpha })
  const isTransparencyModel = model === TOPAZ_TRANSPARENCY_MODEL
  const requestedScale = Math.max(target.width / metadata.width, target.height / metadata.height)
  if (isTransparencyModel && requestedScale > 4) {
    throw new Error('Topaz Transparency Upscale supports up to 4x. Use --upscale 4 or lower for transparent PNGs.')
  }

  const sourceBuffer = await sharp(input, { limitInputPixels: false })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()

  const process = await createTopazProcess(sourceBuffer, {
    apiKey,
    endpoint: isTransparencyModel ? 'tool' : 'enhance',
    filename: 'pixel.png',
    model,
    outputWidth: target.width,
    outputHeight: target.height,
    outputFormat: 'png',
    extra: topazExtraOptions(options),
  })

  const status = await waitForTopazProcess(process.process_id, {
    apiKey,
    waitMs: numberArg(options.waitMs, 600000),
    pollMs: numberArg(options.pollMs, 2500),
  })
  const output = await downloadTopazOutput(process.process_id, { apiKey })
  const format = outputFormat(options.format)
  const buffer = format === 'webp'
    ? await encode(sharp(output, { limitInputPixels: false }), 'webp')
    : output
  const outputMetadata = await sharp(buffer, { limitInputPixels: false }).metadata()

  return {
    buffer,
    provider: 'topaz',
    model,
    processId: process.process_id,
    status,
    inputWidth: metadata.width,
    inputHeight: metadata.height,
    outputWidth: outputMetadata.width ?? target.width,
    outputHeight: outputMetadata.height ?? target.height,
    format: isTransparencyModel ? format : outputFormat(options.format),
  }
}

async function createTopazProcess(buffer, options) {
  const form = new FormData()
  form.append('image', new Blob([buffer], { type: 'image/png' }), options.filename)
  form.append('model', options.model)
  form.append('output_width', String(options.outputWidth))
  form.append('output_height', String(options.outputHeight))
  form.append('output_format', options.outputFormat)
  form.append('crop_to_fill', 'false')
  for (const [key, value] of Object.entries(options.extra)) {
    form.append(key, String(value))
  }

  const response = await fetch(`${TOPAZ_BASE_URL}/${options.endpoint}/async`, {
    method: 'POST',
    headers: { 'X-API-Key': options.apiKey },
    body: form,
  })

  if (!response.ok) throw new Error(`Topaz ${options.endpoint} request failed: ${response.status} ${await response.text()}`)
  return response.json()
}

async function waitForTopazProcess(processId, options) {
  const deadline = Date.now() + options.waitMs
  let lastStatus
  while (Date.now() <= deadline) {
    const response = await fetch(`${TOPAZ_BASE_URL}/status/${processId}`, {
      headers: { 'X-API-Key': options.apiKey },
    })
    if (!response.ok) throw new Error(`Topaz status failed for ${processId}: ${response.status} ${await response.text()}`)
    lastStatus = await response.json()
    if (lastStatus.status === 'Completed') return lastStatus
    if (lastStatus.status === 'Failed' || lastStatus.status === 'Cancelled') {
      throw new Error(`Topaz process ${processId} ended with status ${lastStatus.status}`)
    }
    await sleep(options.pollMs)
  }
  throw new Error(`Topaz process ${processId} did not finish before timeout. Last status: ${lastStatus?.status ?? 'unknown'}`)
}

async function downloadTopazOutput(processId, options) {
  const response = await fetch(`${TOPAZ_BASE_URL}/download/${processId}`, {
    headers: { 'X-API-Key': options.apiKey },
  })
  if (!response.ok) throw new Error(`Topaz download link failed for ${processId}: ${response.status} ${await response.text()}`)

  const payload = await response.json()
  const download = await fetch(payload.download_url)
  if (!download.ok) throw new Error(`Topaz output download failed for ${processId}: ${download.status} ${await download.text()}`)
  return Buffer.from(await download.arrayBuffer())
}

function targetDimensions(width, height, options) {
  const targetWidth = positiveInt(options.width)
  const targetHeight = positiveInt(options.height)
  if (targetWidth || targetHeight) {
    if (targetWidth && targetHeight) return { width: targetWidth, height: targetHeight }
    if (targetWidth) return { width: targetWidth, height: Math.round((height * targetWidth) / width) }
    return { width: Math.round((width * targetHeight) / height), height: targetHeight }
  }

  const scale = normalizeScale(options.scale, 2)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

function topazExtraOptions(options) {
  const extra = {}
  for (const key of ['face_enhancement', 'face_enhancement_strength', 'face_enhancement_creativity', 'subject_detection', 'sharpen', 'denoise', 'fix_compression', 'strength', 'recovery_strength', 'opacity']) {
    if (options[key] !== undefined) extra[key] = options[key]
  }
  return extra
}

function pickValue(value, allowed, fallback) {
  if (!value) return fallback
  const normalized = String(value).toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function outputFormat(format) {
  return format === 'webp' ? 'webp' : 'png'
}

function positiveInt(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function numberArg(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function encode(image, format) {
  return format === 'webp'
    ? image.webp({ quality: 98, alphaQuality: 100 }).toBuffer()
    : image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
