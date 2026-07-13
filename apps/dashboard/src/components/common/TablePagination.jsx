function TablePagination({
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
}) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const safePageSize = Math.max(1, Number(pageSize) || 20)
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize))
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages)

  if (safeTotal <= safePageSize) return null

  const start = (safePage - 1) * safePageSize + 1
  const end = Math.min(safePage * safePageSize, safeTotal)

  return (
    <div className="dw-table-pagination" aria-label="Table pagination">
      <div className="dw-table-pagination-summary">
        Showing {start}-{end} of {safeTotal}
      </div>

      <div className="dw-table-pagination-actions">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
        >
          First
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
        >
          Previous
        </button>
        <span aria-current="page">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
        >
          Last
        </button>
      </div>
    </div>
  )
}

export default TablePagination
