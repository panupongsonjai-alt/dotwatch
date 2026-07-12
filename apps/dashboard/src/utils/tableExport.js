const SYSTEM_FONT_STACK =
  "'Inter', 'Prompt', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

export function getLocalDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function isDateInRange(value, startDate, endDate) {
  if (!value) return false

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return false

  const startTimestamp = startDate
    ? new Date(`${startDate}T00:00:00`).getTime()
    : Number.NEGATIVE_INFINITY
  const endTimestamp = endDate
    ? new Date(`${endDate}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY

  return timestamp >= startTimestamp && timestamp <= endTimestamp
}

export function sanitizeFileName(value) {
  return String(value || 'dotwatch-export')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function downloadCsv({ fileName, columns, rows, metadata = [] }) {
  const lines = []

  metadata.forEach(([label, value]) => {
    lines.push([escapeCsv(label), escapeCsv(value)].join(','))
  })

  if (metadata.length > 0) lines.push('')

  lines.push(columns.map((column) => escapeCsv(column.label)).join(','))
  rows.forEach((row) => {
    lines.push(
      columns.map((column) => escapeCsv(row[column.key])).join(',')
    )
  })

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sanitizeFileName(fileName)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function openPrintableTable({
  title,
  subtitle,
  fileName,
  columns,
  rows,
  metadata = [],
}) {
  const reportWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!reportWindow) {
    throw new Error('Browser blocked the PDF report window. Please allow pop-ups.')
  }

  const metadataHtml = metadata
    .map(
      ([label, value]) => `
        <div class="meta-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>`
    )
    .join('')

  const headerHtml = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join('')
  const bodyHtml = rows
    .map(
      (row) => `
        <tr>
          ${columns
            .map((column) => `<td>${escapeHtml(row[column.key])}</td>`)
            .join('')}
        </tr>`
    )
    .join('')

  reportWindow.document.write(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fileName || title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: ${SYSTEM_FONT_STACK};
      font-size: 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { margin: 0; font-size: 22px; line-height: 1.2; }
    .subtitle { margin: 6px 0 0; color: #64748b; font-size: 11px; font-weight: 600; }
    .meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    .meta-item {
      padding: 8px 10px;
      border: 1px solid #dbe3ee;
      border-radius: 8px;
      background: #f8fafc;
    }
    .meta-item span { display: block; color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .meta-item strong { display: block; margin-top: 3px; color: #0f172a; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th, td {
      padding: 7px 6px;
      border: 1px solid #dbe3ee;
      text-align: center;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }
    th { background: #eaf0f7; color: #334155; font-size: 9px; text-transform: uppercase; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .empty { padding: 28px; color: #64748b; text-align: center; border: 1px solid #dbe3ee; }
    .footer { margin-top: 10px; color: #64748b; font-size: 9px; text-align: right; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(subtitle || '')}</p>
  ${metadataHtml ? `<section class="meta">${metadataHtml}</section>` : ''}
  ${
    rows.length > 0
      ? `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
      : '<div class="empty">No data for the selected filters.</div>'
  }
  <div class="footer">Generated by dotWatch</div>
  <script>
    document.fonts.ready.finally(() => setTimeout(() => window.print(), 250));
  <\/script>
</body>
</html>`)
  reportWindow.document.close()
}
