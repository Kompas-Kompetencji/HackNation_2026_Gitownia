/**
 * MAKIETA eksportu PDF: prosty dokument budowany w przeglądarce, bez bibliotek.
 * Docelowo PDF arkusza generuje backend (POST /evaluations/pdf, szablony arkusz_b/arkusz_c).
 *
 * Każda strona jest rysowana na canvasie czcionką aplikacji (IBM Plex Sans, pełne polskie znaki)
 * i osadzana w PDF jako obraz JPEG. Standardowa Helvetica bez osadzenia nie ma w przeglądarkach PDF
 * glifów ą, ę, ś, ż (puste miejsca), a osadzanie czcionki to zadanie dla backendu.
 * Wada makiety: tekstu w pliku nie da się zaznaczyć.
 */
export interface PdfBlock {
  text: string
  size?: number
  bold?: boolean
  /** Odstęp przed blokiem w punktach. */
  gap?: number
  indent?: number
}

const PAGE_W = 595 // A4 w punktach
const PAGE_H = 842
const MARGIN = 56
const SCALE = 2 // rozdzielczość rysowania (piksele na punkt)
const FONT = '"IBM Plex Sans", Arial, sans-serif'

function font(size: number, bold: boolean) {
  return `${bold ? 600 : 400} ${size * SCALE}px ${FONT}`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (line && ctx.measureText(candidate).width > width * SCALE) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    lines.push(line)
  }
  return lines
}

function newPage(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * SCALE
  canvas.height = PAGE_H * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#18212f'
  ctx.textBaseline = 'alphabetic'
  return ctx
}

function drawPages(blocks: PdfBlock[], footer: string): HTMLCanvasElement[] {
  const pages = [newPage()]
  let y = MARGIN
  for (const b of blocks) {
    const size = b.size ?? 10
    const indent = b.indent ?? 0
    y += b.gap ?? 0
    let ctx = pages[pages.length - 1]
    ctx.font = font(size, !!b.bold)
    for (const line of wrap(ctx, b.text, PAGE_W - 2 * MARGIN - indent)) {
      const lead = size * 1.45
      if (y + lead > PAGE_H - MARGIN - 24) {
        pages.push(newPage())
        ctx = pages[pages.length - 1]
        ctx.font = font(size, !!b.bold)
        y = MARGIN
      }
      y += lead
      ctx.fillText(line, (MARGIN + indent) * SCALE, y * SCALE)
    }
  }
  pages.forEach((ctx, i) => {
    ctx.font = font(8, false)
    ctx.fillStyle = '#4f5967'
    ctx.fillText(`${footer}  ·  Strona ${i + 1} z ${pages.length}`, MARGIN * SCALE, (PAGE_H - MARGIN + 12) * SCALE)
  })
  return pages.map((ctx) => ctx.canvas)
}

function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Składa PDF z obrazów stron (obiekty: katalog, strony, informacje, potem obraz, treść i strona). */
export async function buildSimplePdf(blocks: PdfBlock[], footer: string, title: string): Promise<Blob> {
  await document.fonts.load(font(10, false))
  await document.fonts.load(font(10, true))
  const canvases = drawPages(blocks, footer)

  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    parts.push(bytes)
    length += bytes.length
  }
  const object = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    if (typeof body === 'string') push(body)
    else body.forEach(push)
    push('\nendobj\n')
  }
  // Tytuł w słowniku Info jako UTF-16BE (obsługuje polskie znaki).
  const utf16 = (text: string) =>
    `<FEFF${[...text].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>`

  push('%PDF-1.4\n%âã\n')
  const kids = canvases.map((_, i) => `${6 + i * 3} 0 R`).join(' ')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${canvases.length} >>`)
  object(3, `<< /Title ${utf16(title)} /Producer (Kompas Kompetencji - makieta) >>`)
  canvases.forEach((canvas, i) => {
    const image = 4 + i * 3
    const content = image + 1
    const page = image + 2
    const jpeg = jpegBytes(canvas)
    object(image, [
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      encoder.encode('\nendstream'),
    ])
    const stream = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im${i} Do Q`
    object(content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${content} 0 R >>`,
    )
  })

  const count = offsets.length
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
