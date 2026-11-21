import html2pdf from 'html2pdf.js';

function getTableInfo(el, forceLandscape = null) {
  const firstTable = el.querySelector('table');
  const firstRow = firstTable ? firstTable.querySelector('tr') : null;
  const colCount = firstRow ? firstRow.children.length : 0;
  const isLandscape = forceLandscape !== null ? forceLandscape : colCount >= 8;
  return { firstTable, colCount, isLandscape };
}

function formatTitleFromFilename(filename = '') {
  return filename
    .replace(/\.(pdf|jpe?g|csv)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function buildPrintClone(el, mode = 'pdf', forceLandscape = null, rowSlice = null, pageInfo = null, filename = '') {
  const { colCount, isLandscape } = getTableInfo(el, forceLandscape);

  const targetWidth = isLandscape
    ? (mode === 'jpeg' ? 1000 : 1120)
    : (mode === 'jpeg' ? 540 : 794);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-1;';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    width: ${targetWidth}px;
    background: #ffffff;
    padding: ${mode === 'jpeg' && !isLandscape ? '16px 14px' : '20px 22px'};
    box-sizing: border-box;
    font-family: system-ui, -apple-system, sans-serif;
    color: #0f172a;
  `;

  // Universal Academy Report Layout CSS (Applies to ALL modules)
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: auto !important;
      margin-top: 6px !important;
    }
    thead { display: table-header-group !important; }
    thead tr, thead th {
      background: #1e293b !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      border: 1px solid #1e293b !important;
    }
    tbody tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      background: #ffffff !important;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc !important;
    }
    th, td {
      padding: ${isLandscape ? '6px 5px' : '8px 7px'} !important;
      font-size: ${isLandscape ? '11px' : (mode === 'jpeg' ? '12.5px' : '12.5px')} !important;
      line-height: 1.35 !important;
      border: 1px solid #e2e8f0 !important;
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

  clone.querySelectorAll('div').forEach(div => {
    if (['auto', 'hidden', 'scroll'].includes(div.style.overflowX) || ['auto', 'hidden', 'scroll'].includes(div.style.overflow)) {
      div.style.overflow = 'visible';
      div.style.overflowX = 'visible';
    }
  });

  // Slice table rows for multi-page JPEG export
  if (rowSlice) {
    const tbody = clone.querySelector('tbody');
    if (tbody) {
      const allRows = Array.from(tbody.querySelectorAll('tr'));
      tbody.innerHTML = '';
      allRows.slice(rowSlice.start, rowSlice.end).forEach(r => tbody.appendChild(r));
    }
  }

  wrapper.appendChild(style);

  // Auto-inject official Academy Letterhead if module doesn't already have it
  const hasAcademyHeader = (clone.textContent || '').toUpperCase().includes('NOORUL HIDAYA');
  if (!hasAcademyHeader) {
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding-bottom:10px;margin-bottom:10px;border-bottom:2px solid #1e293b;';
    header.innerHTML = `
      <div style="font-size:16px;font-weight:800;color:#0f172a;letter-spacing:0.3px;">NOORUL HIDAYA ISLAMIC ACADEMY</div>
      <div style="font-size:12px;font-weight:700;color:#2e44d2;margin-top:3px;">${formatTitleFromFilename(filename) || 'Official Campus Report'}</div>
    `;
    wrapper.appendChild(header);
  }

  wrapper.appendChild(clone);

  // Add Page X of Y footer when split across multiple pages
  if (pageInfo && pageInfo.total > 1) {
    const footer = document.createElement('div');
    footer.style.cssText = 'text-align:right;font-size:11px;font-weight:700;color:#64748b;margin-top:10px;padding-top:6px;border-top:1px solid #e2e8f0;';
    footer.textContent = `Page ${pageInfo.current} of ${pageInfo.total}`;
    wrapper.appendChild(footer);
  }

  host.appendChild(wrapper);
  document.body.appendChild(host);

  return { host, wrapper, targetWidth, isLandscape };
}

export async function exportReportPDF(elId, filename, forceLandscape = null) {
  const el = document.getElementById(elId);
  if (!el) return alert('Report content not found.');

  await new Promise(r => requestAnimationFrame(r));

  const { host, wrapper, targetWidth, isLandscape } = buildPrintClone(el, 'pdf', forceLandscape, null, null, filename);
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
          windowWidth: targetWidth,
          scrollX: 0,
          scrollY: 0
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
    document.body.removeChild(host);
  }
}

async function renderWrapperToJPEG(wrapper, targetWidth, downloadName) {
  const worker = html2pdf()
    .set({
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: targetWidth,
        windowWidth: targetWidth,
        scrollX: 0,
        scrollY: 0
      }
    })
    .from(wrapper);

  const canvas = await worker.toCanvas().get('canvas');
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error('Empty image canvas generated.');
  }

  await new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Failed to create JPEG file.'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = downloadName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/jpeg', 0.95);
  });
}

export async function exportReportJPEG(elId, filename, forceLandscape = null) {
  const el = document.getElementById(elId);
  if (!el) return alert('Report content not found.');

  await new Promise(r => requestAnimationFrame(r));

  const { isLandscape } = getTableInfo(el, forceLandscape);
  const rowsPerPage = isLandscape ? 16 : 22;
  const tbody = el.querySelector('tbody');
  const totalRows = tbody ? tbody.querySelectorAll('tr').length : 0;

  const baseName = filename.replace(/\.(jpe?g)$/i, '');

  if (totalRows <= rowsPerPage) {
    const { host, wrapper, targetWidth } = buildPrintClone(el, 'jpeg', forceLandscape, null, null, filename);
    try {
      await renderWrapperToJPEG(wrapper, targetWidth, `${baseName}.jpg`);
    } catch (err) {
      alert('JPEG export failed: ' + err.message);
    } finally {
      document.body.removeChild(host);
    }
    return;
  }

  const totalPages = Math.ceil(totalRows / rowsPerPage);
  for (let p = 0; p < totalPages; p++) {
    const start = p * rowsPerPage;
    const end = start + rowsPerPage;
    const { host, wrapper, targetWidth } = buildPrintClone(
      el,
      'jpeg',
      forceLandscape,
      { start, end },
      { current: p + 1, total: totalPages },
      filename
    );

    try {
      await renderWrapperToJPEG(wrapper, targetWidth, `${baseName}_Page${p + 1}.jpg`);
      if (p < totalPages - 1) {
        await new Promise(r => setTimeout(r, 450));
      }
    } catch (err) {
      alert(`JPEG Page ${p + 1} failed: ` + err.message);
      break;
    } finally {
      document.body.removeChild(host);
    }
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