// CSV Export
export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const csv = bom + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// PDF Export (styled HTML → print)
export function exportPDF(title: string, headers: string[], rows: string[][], summary?: string[]) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #0D0F1A; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
  .summary { display: flex; gap: 24px; margin-bottom: 16px; }
  .summary-item { background: #f4f4f8; padding: 8px 14px; border-radius: 6px; font-size: 12px; }
  .summary-item strong { display: block; font-size: 16px; color: #6C63FF; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1E2236; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 16px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 12px; } }
</style></head><body>
<h1>${title}</h1>
<div class="subtitle">Exporté le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
${summary ? `<div class="summary">${summary.map(s => `<div class="summary-item">${s}</div>`).join('')}</div>` : ''}
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
<div class="footer">Legwan — La gestion, réinventée.</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
