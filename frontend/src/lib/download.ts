/** Zapisuje plik pobrany z api.ts na dysku użytkownika (bez zapytań sieciowych). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Joanna Pietrzyk" → "arkusz-oceny-joanna-pietrzyk.pdf" (bez polskich znaków w nazwie pliku). */
export function assessmentPdfName(employeeName: string): string {
  const slug = employeeName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `arkusz-oceny-${slug}.pdf`
}
