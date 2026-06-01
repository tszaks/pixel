import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { preload, removeBackground } from '@imgly/background-removal'
import {
  Archive,
  Braces,
  Check,
  Download,
  Eraser,
  Gauge,
  ImagePlus,
  Loader2,
  Palette,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-react'
import './App.css'

type BrowserModel = 'isnet' | 'isnet_fp16' | 'isnet_quint8'
type DeviceMode = 'gpu' | 'cpu'
type ExportFormat = 'image/png' | 'image/webp'
type BackgroundSwatch = 'checker' | 'transparent' | 'white' | 'ink' | 'mint' | 'coral'

type QueueItem = {
  id: string
  file: File
  sourceUrl: string
  resultUrl?: string
  resultBlob?: Blob
  status: 'ready' | 'processing' | 'done' | 'failed'
  error?: string
}

type Refinement = {
  alphaFloor: number
  matteContrast: number
  edgeDimming: number
}

const modelOptions: Array<{ label: string; value: BrowserModel; hint: string }> = [
  { label: 'Max', value: 'isnet', hint: 'Largest matte' },
  { label: 'Balanced', value: 'isnet_fp16', hint: 'Best default' },
  { label: 'Fast', value: 'isnet_quint8', hint: 'Small model' },
]

const swatches: Array<{ label: string; value: BackgroundSwatch; color?: string }> = [
  { label: 'Grid', value: 'checker' },
  { label: 'Clear', value: 'transparent' },
  { label: 'White', value: 'white', color: '#ffffff' },
  { label: 'Ink', value: 'ink', color: '#111827' },
  { label: 'Mint', value: 'mint', color: '#c9f7e5' },
  { label: 'Coral', value: 'coral', color: '#ffb199' },
]

function App() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [model, setModel] = useState<BrowserModel>('isnet')
  const [device, setDevice] = useState<DeviceMode>('gpu')
  const [format, setFormat] = useState<ExportFormat>('image/png')
  const [background, setBackground] = useState<BackgroundSwatch>('checker')
  const [recolorEnabled, setRecolorEnabled] = useState(false)
  const [recolorTo, setRecolorTo] = useState('#0066ff')
  const [refinement, setRefinement] = useState<Refinement>({
    alphaFloor: 4,
    matteContrast: 18,
    edgeDimming: 8,
  })
  const [subjectHint, setSubjectHint] = useState('')
  const [progressLabel, setProgressLabel] = useState('Model idle')
  const [progress, setProgress] = useState(0)
  const [isPreloading, setIsPreloading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [compare, setCompare] = useState(54)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const activeItem = useMemo(
    () => queue.find((item) => item.id === activeId) ?? queue[0],
    [activeId, queue],
  )

  const completedCount = queue.filter((item) => item.status === 'done').length
  const processingCount = queue.filter((item) => item.status === 'processing').length

  useEffect(() => {
    return () => {
      queue.forEach((item) => {
        URL.revokeObjectURL(item.sourceUrl)
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
      })
    }
  }, [queue])

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    const items = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      sourceUrl: URL.createObjectURL(file),
      status: 'ready' as const,
    }))

    setQueue((current) => [...items, ...current])
    setActiveId(items[0].id)
    setProgressLabel(`${items.length} image${items.length === 1 ? '' : 's'} queued`)
    setProgress(0)
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        if (patch.resultUrl && item.resultUrl && patch.resultUrl !== item.resultUrl) {
          URL.revokeObjectURL(item.resultUrl)
        }
        return { ...item, ...patch }
      }),
    )
  }, [])

  const processItem = useCallback(
    async (item: QueueItem) => {
      updateItem(item.id, { status: 'processing', error: undefined })
      setActiveId(item.id)
      setProgress(0)
      setProgressLabel('Loading matte model')

      try {
        const rawBlob = await removeBackground(item.file, {
          device,
          model,
          output: { format, quality: 0.98 },
          progress: (key: string, current: number, total: number) => {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0
            setProgress(Math.max(3, Math.min(92, pct)))
            setProgressLabel(key.includes('model') ? 'Downloading model' : 'Building matte')
          },
        })

        setProgressLabel('Refining edge alpha')
        setProgress(94)
        const refinedBlob = await refineAlpha(rawBlob, refinement, format)
        const outputBlob = recolorEnabled
          ? await replaceDominantColor(refinedBlob, recolorTo, format)
          : refinedBlob
        const resultUrl = URL.createObjectURL(outputBlob)
        updateItem(item.id, {
          resultBlob: outputBlob,
          resultUrl,
          status: 'done',
        })
        setProgress(100)
        setProgressLabel('Cutout ready')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Background removal failed'
        updateItem(item.id, { status: 'failed', error: message })
        setProgressLabel(message)
        setProgress(0)
      }
    },
    [device, format, model, recolorEnabled, recolorTo, refinement, updateItem],
  )

  const processActive = useCallback(async () => {
    if (!activeItem || activeItem.status === 'processing') return
    await processItem(activeItem)
  }, [activeItem, processItem])

  const processAll = useCallback(async () => {
    for (const item of queue) {
      if (item.status === 'done' || item.status === 'processing') continue
      await processItem(item)
    }
  }, [processItem, queue])

  const downloadActive = useCallback(() => {
    if (!activeItem?.resultBlob) return
    const extension = format === 'image/webp' ? 'webp' : 'png'
    const link = document.createElement('a')
    link.href = activeItem.resultUrl ?? URL.createObjectURL(activeItem.resultBlob)
    link.download = `${stripExtension(activeItem.file.name)}-cutout.${extension}`
    link.click()
  }, [activeItem, format])

  const reset = useCallback(() => {
    queue.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl)
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    })
    setQueue([])
    setActiveId(null)
    setProgress(0)
    setProgressLabel('Model idle')
  }, [queue])

  const warmModel = useCallback(async () => {
    setIsPreloading(true)
    setProgressLabel('Preloading model assets')
    try {
      await preload({
        device,
        model,
        output: { format, quality: 0.98 },
        progress: (_key, current, total) => {
          setProgress(total > 0 ? Math.round((current / total) * 100) : 0)
        },
      })
      setProgressLabel('Model cached')
      setProgress(100)
    } catch (error) {
      setProgressLabel(error instanceof Error ? error.message : 'Preload failed')
    } finally {
      setIsPreloading(false)
    }
  }, [device, format, model])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Scissors size={18} />
          </div>
          <div>
            <h1>Pixel</h1>
            <p>Agent-ready background removal</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={warmModel} disabled={isPreloading}>
            {isPreloading ? <Loader2 className="spin" size={16} /> : <Archive size={16} />}
            Cache model
          </button>
          <button className="primary-button" type="button" onClick={processActive} disabled={!activeItem || processingCount > 0}>
            {processingCount > 0 ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
            Remove
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <button
            className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              addFiles(event.dataTransfer.files)
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files)
                event.currentTarget.value = ''
              }}
            />
            <UploadCloud size={24} />
            <span>Drop images</span>
            <small>PNG, JPG, WebP</small>
          </button>

          <div className="queue-header">
            <span>Batch</span>
            <strong>{completedCount}/{queue.length}</strong>
          </div>

          <div className="queue-list">
            {queue.length === 0 ? (
              <div className="empty-queue">
                <ImagePlus size={20} />
                <span>No images loaded</span>
              </div>
            ) : (
              queue.map((item) => (
                <button
                  className={`queue-item ${item.id === activeItem?.id ? 'is-active' : ''}`}
                  type="button"
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                >
                  <img src={item.resultUrl ?? item.sourceUrl} alt="" />
                  <span>{item.file.name}</span>
                  {item.status === 'processing' && <Loader2 className="spin" size={14} />}
                  {item.status === 'done' && <Check size={14} />}
                  {item.status === 'failed' && <Eraser size={14} />}
                </button>
              ))
            )}
          </div>

          <div className="button-row">
            <button type="button" onClick={processAll} disabled={queue.length === 0 || processingCount > 0}>
              <Play size={15} />
              Run all
            </button>
            <button type="button" onClick={reset} disabled={queue.length === 0}>
              <RotateCcw size={15} />
              Clear
            </button>
          </div>
        </aside>

        <section className={`preview-stage bg-${background}`}>
          {activeItem ? (
            <div className="preview-wrap">
              <div className="image-frame">
                <img className="before-image" src={activeItem.sourceUrl} alt={`Original ${activeItem.file.name}`} />
                {activeItem.resultUrl && (
                  <img
                    className="after-image"
                    src={activeItem.resultUrl}
                    alt={`Background removed ${activeItem.file.name}`}
                    style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                  />
                )}
                {activeItem.resultUrl && (
                  <input
                    className="compare-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={compare}
                    aria-label="Compare before and after"
                    onChange={(event) => setCompare(Number(event.target.value))}
                  />
                )}
              </div>
              {activeItem.error && <div className="error-strip">{activeItem.error}</div>}
            </div>
          ) : (
            <div className="empty-stage">
              <Sparkles size={28} />
              <span>Ready for cutouts</span>
            </div>
          )}
        </section>

        <aside className="panel right-panel">
          <section className="control-group">
            <div className="group-title">
              <Gauge size={16} />
              Model
            </div>
            <div className="segmented">
              {modelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={model === option.value ? 'is-selected' : ''}
                  onClick={() => setModel(option.value)}
                  title={option.hint}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="segmented two">
              <button type="button" className={device === 'gpu' ? 'is-selected' : ''} onClick={() => setDevice('gpu')}>
                GPU
              </button>
              <button type="button" className={device === 'cpu' ? 'is-selected' : ''} onClick={() => setDevice('cpu')}>
                CPU
              </button>
            </div>
          </section>

          <section className="control-group">
            <div className="group-title">
              <Eraser size={16} />
              Edge
            </div>
            <Slider label="Alpha floor" value={refinement.alphaFloor} max={22} onChange={(value) => setRefinement((current) => ({ ...current, alphaFloor: value }))} />
            <Slider label="Matte contrast" value={refinement.matteContrast} max={40} onChange={(value) => setRefinement((current) => ({ ...current, matteContrast: value }))} />
            <Slider label="Edge dimming" value={refinement.edgeDimming} max={28} onChange={(value) => setRefinement((current) => ({ ...current, edgeDimming: value }))} />
          </section>

          <section className="control-group">
            <div className="group-title">
              <Palette size={16} />
              Preview
            </div>
            <div className="swatch-grid">
              {swatches.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  className={`swatch ${background === swatch.value ? 'is-selected' : ''} swatch-${swatch.value}`}
                  onClick={() => setBackground(swatch.value)}
                  aria-label={swatch.label}
                  title={swatch.label}
                >
                  {swatch.color && <span style={{ backgroundColor: swatch.color }} />}
                </button>
              ))}
            </div>
          </section>

          <section className="control-group">
            <div className="group-title">
              <Palette size={16} />
              Color
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={recolorEnabled}
                onChange={(event) => setRecolorEnabled(event.target.checked)}
              />
              <span>Recolor dominant foreground</span>
            </label>
            <label className="color-row">
              <span>New color</span>
              <input
                type="color"
                value={recolorTo}
                onChange={(event) => setRecolorTo(event.target.value)}
                disabled={!recolorEnabled}
              />
              <code>{recolorTo}</code>
            </label>
          </section>

          <section className="control-group">
            <div className="group-title">
              <Braces size={16} />
              Agent
            </div>
            <label className="field">
              <span>Subject hint</span>
              <input
                value={subjectHint}
                onChange={(event) => setSubjectHint(event.target.value)}
                placeholder="person, product, logo"
              />
            </label>
            <code className="api-snippet">POST /api/remove-background</code>
            <code className="api-snippet">npm run cutout -- --input image.jpg</code>
          </section>

          <section className="control-group export-group">
            <div className="format-row">
              <button type="button" className={format === 'image/png' ? 'is-selected' : ''} onClick={() => setFormat('image/png')}>
                PNG
              </button>
              <button type="button" className={format === 'image/webp' ? 'is-selected' : ''} onClick={() => setFormat('image/webp')}>
                WebP
              </button>
            </div>
            <button className="download-button" type="button" onClick={downloadActive} disabled={!activeItem?.resultBlob}>
              <Download size={16} />
              Download
            </button>
          </section>

          <div className="status-box">
            <span>{progressLabel}</span>
            <div className="meter">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

function Slider({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min="0" max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}</strong>
    </label>
  )
}

async function refineAlpha(blob: Blob, refinement: Refinement, format: ExportFormat): Promise<Blob> {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return blob

  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const floor = refinement.alphaFloor / 100
  const contrast = 1 + refinement.matteContrast / 55
  const dimming = refinement.edgeDimming / 100

  for (let index = 0; index < pixels.length; index += 4) {
    let alpha = pixels[index + 3] / 255
    if (alpha <= floor) {
      pixels[index + 3] = 0
      continue
    }

    alpha = clamp((alpha - 0.5) * contrast + 0.5, 0, 1)
    if (alpha > 0.985) alpha = 1

    if (alpha > 0 && alpha < 0.96 && dimming > 0) {
      const factor = 1 - dimming * (1 - alpha)
      pixels[index] = Math.round(pixels[index] * factor)
      pixels[index + 1] = Math.round(pixels[index + 1] * factor)
      pixels[index + 2] = Math.round(pixels[index + 2] * factor)
    }

    pixels[index + 3] = Math.round(alpha * 255)
  }

  context.putImageData(imageData, 0, 0)

  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result ?? blob), format, 0.98)
  })
}

async function replaceDominantColor(blob: Blob, replacementHex: string, format: ExportFormat): Promise<Blob> {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return blob

  context.drawImage(image, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const source = dominantVisibleColor(pixels)
  const replacement = parseHexColor(replacementHex)
  const tolerance = 44
  const softness = 24

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue
    const distance = colorDistance(
      pixels[index],
      pixels[index + 1],
      pixels[index + 2],
      source[0],
      source[1],
      source[2],
    )
    if (distance >= tolerance + softness) continue

    const strength = distance <= tolerance ? 1 : 1 - (distance - tolerance) / softness
    const next = applyLightness(
      pixels[index],
      pixels[index + 1],
      pixels[index + 2],
      replacement,
    )
    pixels[index] = mix(pixels[index], next[0], strength)
    pixels[index + 1] = mix(pixels[index + 1], next[1], strength)
    pixels[index + 2] = mix(pixels[index + 2], next[2], strength)
  }

  context.putImageData(imageData, 0, 0)
  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result ?? blob), format, 0.98)
  })
}

function dominantVisibleColor(pixels: Uint8ClampedArray): [number, number, number] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
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

  let dominant: { count: number; r: number; g: number; b: number } | undefined
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

function parseHexColor(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function applyLightness(r: number, g: number, b: number, replacement: [number, number, number]): [number, number, number] {
  const lightness = Math.max(r, g, b) / 255
  const replacementMax = Math.max(...replacement) || 1
  const scale = (lightness * 255) / replacementMax
  return [
    clamp(Math.round(replacement[0] * scale), 0, 255),
    clamp(Math.round(replacement[1] * scale), 0, 255),
    clamp(Math.round(replacement[2] * scale), 0, 255),
  ]
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function mix(from: number, to: number, strength: number) {
  return Math.round(from + (to - from) * clamp(strength, 0, 1))
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default App
