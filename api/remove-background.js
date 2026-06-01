import { removeBackgroundToBuffer, strategyValues, formatValues } from '../lib/background-engine.mjs'
import { replaceColorToBuffer } from '../lib/color-tools.mjs'
import { upscaleImageToBuffer, upscaleProviderValues } from '../lib/upscale-engine.mjs'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16mb',
    },
  },
}

export default async function handler(request, response) {
  setCors(response)

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Use POST /api/remove-background' })
    return
  }

  try {
    const body = parseBody(request.body)
    const input = await readInput(body)
    const format = pickValue(body.format, formatValues, 'png')
    const started = Date.now()
    const result = await removeBackgroundToBuffer(input, {
      strategy: pickValue(body.strategy, strategyValues, 'auto'),
      format,
      tolerance: body.tolerance,
      feather: body.feather,
      model: body.model,
    })

    const finalResult = body.to
      ? await replaceColorToBuffer(result.buffer, {
          from: body.from,
          to: body.to,
          tolerance: body.colorTolerance ?? 42,
          softness: body.colorSoftness ?? 22,
          format,
        })
      : { buffer: result.buffer }

    const outputResult = shouldUpscale(body)
      ? await upscaleImageToBuffer(finalResult.buffer, {
          provider: pickValue(upscaleField(body, 'provider') ?? body.upscaleProvider, upscaleProviderValues, 'topaz'),
          scale: upscaleField(body, 'scale') ?? body.upscale,
          width: upscaleField(body, 'width') ?? body.upscaleWidth,
          height: upscaleField(body, 'height') ?? body.upscaleHeight,
          format,
          model: upscaleField(body, 'model') ?? body.upscaleModel,
          waitMs: upscaleField(body, 'waitMs') ?? body.topazWaitMs ?? process.env.TOPAZ_WAIT_MS ?? 55000,
          pollMs: upscaleField(body, 'pollMs') ?? body.topazPollMs ?? 2500,
          face_enhancement: upscaleField(body, 'faceEnhancement') ?? body.faceEnhancement,
          face_enhancement_strength: upscaleField(body, 'faceEnhancementStrength') ?? body.faceEnhancementStrength,
          face_enhancement_creativity: upscaleField(body, 'faceEnhancementCreativity') ?? body.faceEnhancementCreativity,
          subject_detection: upscaleField(body, 'subjectDetection') ?? body.subjectDetection,
          sharpen: upscaleField(body, 'sharpen') ?? body.sharpen,
          denoise: upscaleField(body, 'denoise') ?? body.denoise,
          fix_compression: upscaleField(body, 'fixCompression') ?? body.fixCompression,
          strength: upscaleField(body, 'strength') ?? body.strength,
          recovery_strength: upscaleField(body, 'recoveryStrength') ?? body.recoveryStrength,
          opacity: upscaleField(body, 'opacity') ?? body.opacity,
        })
      : { buffer: finalResult.buffer }

    response.setHeader('Content-Type', format === 'webp' ? 'image/webp' : 'image/png')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Background-Lift-Strategy', result.strategy)
    response.setHeader('X-Background-Lift-Elapsed-Ms', String(Date.now() - started))
    response.setHeader('X-Background-Lift-Analysis', encodeURIComponent(JSON.stringify(result.analysis)))
    if (outputResult.provider && outputResult.provider !== 'none') {
      response.setHeader('X-Background-Lift-Upscale', encodeURIComponent(JSON.stringify({
        provider: outputResult.provider,
        model: outputResult.model,
        processId: outputResult.processId,
        inputWidth: outputResult.inputWidth,
        inputHeight: outputResult.inputHeight,
        outputWidth: outputResult.outputWidth,
        outputHeight: outputResult.outputHeight,
      })))
    }
    if (finalResult.targetColor) {
      response.setHeader('X-Background-Lift-Color', encodeURIComponent(JSON.stringify({
        from: finalResult.targetColor,
        to: finalResult.replacementColor,
      })))
    }
    response.status(200).send(outputResult.buffer)
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Background removal failed',
    })
  }
}

function parseBody(body) {
  if (!body) return {}
  if (typeof body === 'string') return JSON.parse(body)
  return body
}

async function readInput(body) {
  if (body.imageBase64) {
    return Buffer.from(String(body.imageBase64).replace(/^data:image\/\w+;base64,/, ''), 'base64')
  }

  if (body.imageUrl) {
    const result = await fetch(String(body.imageUrl))
    if (!result.ok) throw new Error(`Could not fetch imageUrl: ${result.status}`)
    return Buffer.from(await result.arrayBuffer())
  }

  throw new Error('Provide imageBase64 or imageUrl')
}

function pickValue(value, allowed, fallback) {
  if (!value) return fallback
  const normalized = String(value).toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function shouldUpscale(body) {
  return Boolean(body.upscale || body.upscaleProvider || body.upscaleWidth || body.upscaleHeight || body.upscaleModel)
}

function upscaleField(body, key) {
  return body.upscale && typeof body.upscale === 'object' ? body.upscale[key] : undefined
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
