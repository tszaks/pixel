#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatValues, removeBackgroundToBuffer, strategyValues } from '../lib/background-engine.mjs'
import { replaceColorToBuffer } from '../lib/color-tools.mjs'
import { upscaleImageToBuffer, upscaleProviderValues } from '../lib/upscale-engine.mjs'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const input = args.input ?? args.i

  if (!input || args.help || args.h) {
    printHelp()
    process.exit(input ? 0 : 1)
  }

  const inputPath = path.resolve(String(input))
  const format = pickValue(args.format, formatValues, 'png')
  const outputPath = path.resolve(
    String(args.output ?? args.o ?? defaultOutputPath(inputPath, format)),
  )
  const started = Date.now()
  const result = await removeBackgroundToBuffer(inputPath, {
    strategy: pickValue(args.strategy, strategyValues, 'auto'),
    format,
    tolerance: args.tolerance,
    feather: args.feather,
    model: args.model,
    aiHandler: removeWithAiModel,
  })

  const finalResult = args.to
    ? await replaceColorToBuffer(result.buffer, {
        from: args.from,
        to: args.to,
        tolerance: args.colorTolerance ?? 42,
        softness: args.colorSoftness ?? 22,
        format,
      })
    : { buffer: result.buffer }

  const outputResult = shouldUpscale(args)
    ? await upscaleImageToBuffer(finalResult.buffer, {
        provider: pickValue(args['upscale-provider'], upscaleProviderValues, 'topaz'),
        scale: args.upscale,
        width: args['upscale-width'],
        height: args['upscale-height'],
        format,
        model: args['upscale-model'],
        waitMs: args['topaz-timeout-ms'],
        pollMs: args['topaz-poll-ms'],
        face_enhancement: args['face-enhancement'],
        face_enhancement_strength: args['face-enhancement-strength'],
        face_enhancement_creativity: args['face-enhancement-creativity'],
        subject_detection: args['subject-detection'],
        sharpen: args.sharpen,
        denoise: args.denoise,
        fix_compression: args['fix-compression'],
        strength: args.strength,
        recovery_strength: args['recovery-strength'],
        opacity: args.opacity,
      })
    : { buffer: finalResult.buffer }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, outputResult.buffer)

  const payload = {
    input: inputPath,
    output: outputPath,
    strategy: result.strategy,
    requestedStrategy: result.requestedStrategy,
    format: result.format,
    elapsedMs: Date.now() - started,
    analysis: result.analysis,
    color: finalResult.targetColor
      ? {
          from: finalResult.targetColor,
          to: finalResult.replacementColor,
        }
      : undefined,
    upscale: outputResult.provider && outputResult.provider !== 'none'
      ? {
          provider: outputResult.provider,
          model: outputResult.model,
          processId: outputResult.processId,
          inputWidth: outputResult.inputWidth,
          inputHeight: outputResult.inputHeight,
          outputWidth: outputResult.outputWidth,
          outputHeight: outputResult.outputHeight,
        }
      : undefined,
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(`Pixel wrote ${outputPath}`)
    console.log(`strategy=${payload.strategy} elapsedMs=${payload.elapsedMs}`)
  }
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const [rawKey, inlineValue] = token.slice(2).split('=')
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined && value && !String(value).startsWith('--')) index += 1
    args[rawKey] = value === undefined || String(value).startsWith('--') ? true : value
  }
  return args
}

function pickValue(value, allowed, fallback) {
  if (!value) return fallback
  const normalized = String(value).toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function defaultOutputPath(inputPath, format) {
  const parsed = path.parse(inputPath)
  return path.join(parsed.dir, `${parsed.name}-cutout.${format}`)
}

function shouldUpscale(args) {
  return Boolean(
    args.upscale
    || args['upscale-provider']
    || args['upscale-width']
    || args['upscale-height']
    || args['upscale-model'],
  )
}

function printHelp() {
  const scriptName = path.basename(fileURLToPath(import.meta.url))
  console.log(`
Usage:
  node scripts/${scriptName} --input image.png --output image-cutout.png

Options:
  --strategy auto|logo|ai   auto chooses logo for flat art, ai for photos
  --format png|webp         output format
  --tolerance 18            logo background color tolerance
  --feather 0               logo alpha feather amount
  --model medium            ai model: small or medium
  --to '#0066ff'            recolor dominant foreground after cutout
  --from '#00b82e'          optional source color; defaults to dominant visible color
  --upscale 2|3|4           world-class Topaz upscale after cutout
  --upscale-provider topaz|sharp
  --upscale-model transparent|high-fidelity|low-resolution|art|text
  --upscale-width 2048      target output width, preserves aspect if height omitted
  --upscale-height 2048     target output height, preserves aspect if width omitted
  --topaz-timeout-ms 600000 requires TOPAZ_API_KEY
  --json                    print machine-readable result
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

async function removeWithAiModel(input, options) {
  const { removeBackground } = await import('@imgly/background-removal-node')
  const outputFormat = options.outputFormat === 'webp' ? 'image/webp' : 'image/png'
  const blob = await removeBackground(input, {
    model: options.model,
    output: {
      format: outputFormat,
      quality: 0.98,
    },
  })

  return Buffer.from(await blob.arrayBuffer())
}
