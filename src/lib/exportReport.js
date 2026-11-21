import html2pdf from 'html2pdf.js';

function buildPrintClone(el, forceLandscape = null) {
  // Auto-detect wide tables (e.g. Monthly Attendance / Class Mark Report)
  const firstTable = el.querySelector('table');
  const colCount = firstTable ? firstTable.querySelectorAll('thead th, tr:first-child th, tr:first-child td').length : 0;
  const isLandscape = forceLandscape !== null ? forceLandscape : colCount >= 7;
  const targetWidth = isLandscape ? 1120 : 794; // Standard A4 px width at 96dpi

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed;
    left: -99999px;
    top: 0;
    width: ${targetWidth}px;
    background: #ffffff;
    padding: 22px 24px;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, sans-serif;
    color: #0f172a;
    z-index: -1;
  `;

  // Inject clean print styles for crisp PDF & JPEG tables
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    table { width: 100% !important; border-collapse: collapse !important; table-layout: auto !important; }
    thead { display: table-header-group !important; }
    tr { page-break-inside: avoid !important; break-inside: avoid !important; }
    th, td {
      padding: ${isLandscape ? '6px 5px' : '8px 7px'} !important;
      font-size: ${isLandscape ? '11px' : '12.5px'} !important;
      line-height: 1.35 !important;
      white-space: ${colCount > 12 ? 'nowrap' : 'normal'} !important;
      word-break: break-word;
    }
  `;

  const clone = el.cloneNode(true);
  clone.style.width = '100%';
  clone.style.maxWidth = '100%';
  clone.style.overflow = 'visible';
  clone.style.border = 'none';
  clone.style.borderRadius = '0';
  clone.style.boxShadow = 'none';
  clone.style.padding = '0';

  // Remove any inner horizontal scroll clipping
  clone.querySelectorAll('div').forEach(div => {
    if (div.style.overflowX === 'auto' || div.style.overflow === 'auto' || div.style.overflow === 'hidden') {
      div.style.overflow = 'visible';
      div.style.overflowX = 'visible';
    }
  });

  wrapper.appendChild(style);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { wrapper, targetWidth, isLandscape };
}

export async function exportReportPDF(elId, filename, forceLandscape = null) {
  const el = document.getElementById(elId);
  if (!el) return alert('Report content not found.');

  // Yield 1 frame so UI stays responsive (zero lag feel)
  await new Promise(r => requestAnimationFrame(r));

  const { wrapper, targetWidth, isLandscape } = buildPrintClone(el, forceLandscape);
  try {
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: targetWidth,
          windowWidth: targetWidth
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: isLandscape ? 'landscape' : 'portrait'
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      })
      .from(wrapper)
      .save();
  } catch (err) {
    alert('PDF export failed: ' + err.message);
  } finally {
    document.body.removeChild(wrapper);
  }
}

export async function exportReportJPEG(elId, filename, forceLandscape = null) {
  const el = document.getElementById(elId);
  if (!el) return alert('Report content not found.');

  await new Promise(r => requestAnimationFrame(r));

  const { wrapper, targetWidth } = buildPrintClone(el, forceLandscape);
  try {
    const worker = html2pdf()
      .set({
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: targetWidth,
          windowWidth: targetWidth
        }
      })
      .from(wrapper);

    const canvas = await worker.toCanvas().get('canvas');
    const link = document.createElement('a');
    link.download = filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? filename : `${filename}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
  } catch (err) {
    alert('JPEG export failed: ' + err.message);
  } finally {
    document.body.removeChild(wrapper);
  }
}

export function exportReportCSV(filename, headers, rows) {
  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}