/**
 * MAKIETA eksportu PDF: najprostszy dokument PDF budowany w przeglądarce, bez bibliotek.
 * Docelowo PDF arkusza generuje backend (POST /evaluations/pdf, szablony arkusz_b/arkusz_c).
 *
 * Polskie znaki: czcionka Helvetica z kodowaniem WinAnsi i tablicą Differences
 * (glify aogonek, eogonek, lslash itd. są w standardowym zestawie Helvetica).
 */
export interface PdfBlock {
  text: string
  size?: number
  bold?: boolean
  /** Odstęp przed blokiem w punktach. */
  gap?: number
  indent?: number
}

const CODES: Record<string, number> = {
  Ś: 0x8c, Ź: 0x8f, ś: 0x9c, ź: 0x9f, Ł: 0xa3, Ą: 0xa5, Ż: 0xaf, ł: 0xb3, ą: 0xb9, ż: 0xbf,
  Ć: 0xc6, Ę: 0xca, Ń: 0xd1, Ó: 0xd3, ć: 0xe6, ę: 0xea, ń: 0xf1, ó: 0xf3,
  '„': 0x84, '”': 0x94, '“': 0x93, '–': 0x96, '—': 0x97, '§': 0xa7, '·': 0xb7,
}
const DIFFERENCES =
  '[140 /Sacute 143 /Zacute 156 /sacute 159 /zacute 163 /Lslash 165 /Aogonek 175 /Zdotaccent 179 /lslash 185 /aogonek 191 /zdotaccent 198 /Cacute 202 /Eogonek 209 /Nacute 230 /cacute 234 /eogonek 241 /nacute]'

/** Tekst jako literał PDF; znaki spoza ASCII jako ósemkowe \ddd, więc plik zostaje w ASCII. */
function pdfString(text: string): string {
  let out = '('
  for (const ch of text) {
    const code = CODES[ch] ?? ch.charCodeAt(0)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (code >= 32 && code < 127) out += ch
    else if (CODES[ch]) out += `\\${code.toString(8).padStart(3, '0')}`
    else out += '?'
  }
  return `${out})`
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 56

function wrap(text: string, size: number, bold: boolean, width: number): string[] {
  const maxChars = Math.floor(width / (size * (bold ? 0.56 : 0.51)))
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      if (line && (line + ' ' + word).length > maxChars) {
        lines.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    lines.push(line)
  }
  return lines
}

export function buildSimplePdf(blocks: PdfBlock[], footer: string): Blob {
  const pages: string[][] = [[]]
  let y = PAGE_H - MARGIN
  for (const b of blocks) {
    const size = b.size ?? 10
    const indent = b.indent ?? 0
    y -= b.gap ?? 0
    for (const line of wrap(b.text, size, !!b.bold, PAGE_W - 2 * MARGIN - indent)) {
      const lead = size * 1.4
      if (y - lead < MARGIN + 24) {
        pages.push([])
        y = PAGE_H - MARGIN
      }
      y -= lead
      pages[pages.length - 1].push(
        `BT /${b.bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN + indent} ${y.toFixed(1)} Td ${pdfString(line)} Tj ET`,
      )
    }
  }

  const objects: string[] = []
  const add = (body: string) => objects.push(body) // numer obiektu = indeks + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // Pages uzupełniane niżej
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${DIFFERENCES} >> >>`)
  add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${DIFFERENCES} >> >>`)

  const kids: string[] = []
  pages.forEach((lines, i) => {
    const footerLine = `BT /F1 8 Tf ${MARGIN} ${MARGIN - 8} Td ${pdfString(`${footer}  ·  Strona ${i + 1} z ${pages.length}`)} Tj ET`
    const stream = [...lines, footerLine].join('\n')
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    const contentRef = objects.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`)
    kids.push(`${objects.length} 0 R`)
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([out], { type: 'application/pdf' })
}
