import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ExamClearanceBulkUpload({ students, itemsList, user, onComplete }) {
  const [mode, setMode] = useState('single'); // 'single' | 'multi'
  const [selectedItem, setSelectedItem] = useState(itemsList[0]?.name || '');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [autoClearZero, setAutoClearZero] = useState(false);

  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Quick bulk due state (no Excel needed)
  const [quickClass, setQuickClass] = useState('ALL');
  const [quickItem, setQuickItem] = useState(itemsList[0]?.name || '');
  const [quickAmt, setQuickAmt] = useState('');
  const [quickRemarks, setQuickRemarks] = useState('');

  const allClasses = useMemo(() => {
    return [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  }, [students]);

  const studentByAdm = useMemo(() => {
    const map = {};
    students.forEach(s => {
      map[String(s.adm_key || '').trim().toLowerCase()] = s;
    });
    return map;
  }, [students]);

  const studentByName = useMemo(() => {
    const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const map = {};
    students.forEach(s => {
      const k = norm(s.name);
      if (k) map[k] = s;
    });
    return map;
  }, [students]);

  const itemNames = useMemo(() => itemsList.map(i => i.name), [itemsList]);

  function downloadTemplate() {
    const scoped = students.filter(s => selectedClass === 'ALL' || s.class_name === selectedClass);
    if (!scoped.length) return setStatusMsg('No students available for this class.');

    let rows;
    let outName;
    if (mode === 'single') {
      const itemLabel = selectedItem || itemNames[0] || 'ITEM';
      rows = scoped.map(s => ({
        'Adm No': s.adm_key,
        'Name': s.name,
        'Class': s.class_name,
        'Amount Due': '',
        'Remarks': ''
      }));
      outName = `template_${itemLabel.replace(/\s+/g, '_')}_${selectedClass}.xlsx`;
    } else {
      rows = scoped.map(s => {
        const obj = { 'Adm No': s.adm_key, 'Name': s.name, 'Class': s.class_name };
        itemNames.forEach(it => { obj[it] = ''; });
        return obj;
      });
      outName = `template_ALL_ITEMS_${selectedClass}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clearance');
    XLSX.writeFile(wb, outName);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatusMsg('');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const normKey = k => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normName = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const itemLookup = {};
        itemNames.forEach(n => { itemLookup[normKey(n)] = n; });

        const records = [];
        let unmatched = 0;

        json.forEach(row => {
          const keys = Object.keys(row);
          const admCol = keys.find(k => ['admno', 'admissionno', 'adm', 'id', 'regno'].includes(normKey(k)));
          const nameCol = keys.find(k => ['name', 'studentname', 'student'].includes(normKey(k)));

          const rawAdm = admCol ? String(row[admCol] || '').trim().toLowerCase() : '';
          const rawName = nameCol ? normName(row[nameCol]) : '';
          const student = (rawAdm && studentByAdm[rawAdm]) || (rawName && studentByName[rawName]) || null;

          if (!student) {
            if (rawAdm || rawName) unmatched++;
            return;
          }

          if (mode === 'single') {
            const targetItem = selectedItem || itemNames[0];
            if (!targetItem) return;
            const amtCol = keys.find(k => ['amountdue', 'amount', 'due', 'rs', 'fee', 'fine', normKey(targetItem)].includes(normKey(k)));
            const remCol = keys.find(k => ['remarks', 'remark', 'note', 'notes', 'reason'].includes(normKey(k)));
            const rawVal = amtCol !== undefined ? row[amtCol] : '';
            const rawStr = String(rawVal).trim();
            if (rawStr === '' && !autoClearZero) return;

            const amt = Number(rawStr.replace(/[^0-9.-]/g, '')) || 0;
            const remarks = remCol ? String(row[remCol] || '').trim() : '';
            records.push({
              adm_no: student.adm_key,
              student_name: student.name,
              class_name: student.class_name || '',
              item_name: targetItem,
              amount_due: amt,
              remarks,
              is_cleared: amt <= 0 && autoClearZero
            });
          } else {
            keys.forEach(k => {
              const matchedItem = itemLookup[normKey(k)];
              if (!matchedItem) return;
              const rawStr = String(row[k] ?? '').trim();
              if (rawStr === '' && !autoClearZero) return;
              const isTextCleared = ['cleared', 'ok', 'yes', 'paid', 'done'].includes(rawStr.toLowerCase());
              const amt = isTextCleared ? 0 : (Number(rawStr.replace(/[^0-9.-]/g, '')) || 0);
              records.push({
                adm_no: student.adm_key,
                student_name: student.name,
                class_name: student.class_name || '',
                item_name: matchedItem,
                amount_due: amt,
                remarks: '',
                is_cleared: isTextCleared || (amt <= 0 && autoClearZero)
              });
            });
          }
        });

        setParsedRows(records);
        setStatusMsg(`Ready: ${records.length} records matched${unmatched ? ` (${unmatched} rows skipped - student not found)` : ''}.`);
      } catch (err) {
        setStatusMsg('Could not read Excel file: ' + err.message);
        setParsedRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function saveUploadedRows() {
    if (!parsedRows.length) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = parsedRows.map(r => ({
      adm_no: r.adm_no,
      class_name: r.class_name,
      item_name: r.item_name,
      amount_due: r.is_cleared ? 0 : r.amount_due,
      remarks: r.remarks,
      is_cleared: r.is_cleared,
      cleared_by: r.is_cleared ? (user?.name || 'Staff') : null,
      cleared_at: r.is_cleared ? now : null
    }));

    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from('exam_clearances')
        .upsert(payload.slice(i, i + 200), { onConflict: 'adm_no,item_name' });
      if (error) {
        setSaving(false);
        return setStatusMsg('Upload error: ' + error.message);
      }
    }

    setSaving(false);
    setParsedRows([]);
    setFileName('');
    onComplete(`Bulk uploaded ${payload.length} clearance records successfully!`);
  }

  async function applyQuickBulkDue(e) {
    e.preventDefault();
    const targetItem = quickItem || itemNames[0];
    const amt = Number(quickAmt) || 0;
    if (!targetItem || amt <= 0) return setStatusMsg('Select an item and enter amount > 0.');

    const scoped = students.filter(s => quickClass === 'ALL' || s.class_name === quickClass);
    if (!scoped.length) return;
    if (!window.confirm(`Set ₹${amt} due for "${targetItem}" to ${scoped.length} students (${quickClass === 'ALL' ? 'All Allowed' : quickClass})?`)) return;

    setSaving(true);
    const payload = scoped.map(s => ({
      adm_no: s.adm_key,
      class_name: s.class_name || '',
      item_name: targetItem,
      amount_due: amt,
      remarks: quickRemarks.trim(),
      is_cleared: false,
      cleared_by: null,
      cleared_at: null
    }));

    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await supabase
        .from('exam_clearances')
        .upsert(payload.slice(i, i + 200), { onConflict: 'adm_no,item_name' });
      if (error) {
        setSaving(false);
        return setStatusMsg('Error: ' + error.message);
      }
    }

    setSaving(false);
    setQuickAmt('');
    setQuickRemarks('');
    onComplete(`Applied ₹${amt} (${targetItem}) to ${scoped.length} students!`);
  }

  const totalPreviewDue = useMemo(() => parsedRows.reduce((s, r) => s + (r.is_cleared ? 0 : r.amount_due), 0), [parsedRows]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14 }}>
      {/* Excel / CSV Bulk Upload Card */}
      <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Bulk Upload Dues via Excel / CSV</h3>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>Upload different amounts per student for Minus of Account, Fine, Deposit, etc.</p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setMode('single'); setParsedRows([]); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${mode === 'single' ? '#2563eb' : '#cbd5e1'}`, background: mode === 'single' ? '#eff6ff' : '#fff', color: mode === 'single' ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Single Item (e.g. Fine / Minus)
          </button>
          <button type="button" onClick={() => { setMode('multi'); setParsedRows([]); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${mode === 'multi' ? '#2563eb' : '#cbd5e1'}`, background: mode === 'multi' ? '#eff6ff' : '#fff', color: mode === 'multi' ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Multi-Item Sheet (All Columns)
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mode === 'single' ? '1fr 1fr' : '1fr', gap: 8 }}>
          {mode === 'single' && (
            <select value={selectedItem} onChange={e => { setSelectedItem(e.target.value); setParsedRows([]); }} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#fff' }}>
              {itemNames.map(it => <option key={it} value={it}>{it}</option>)}
            </select>
          )}
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#fff' }}>
            <option value="ALL">All Allowed Classes</option>
            {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <button type="button" onClick={downloadTemplate} style={{ padding: 9, borderRadius: 9, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Download size={14} /> 1. Download Ready Excel Template (.xlsx)
        </button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoClearZero} onChange={e => setAutoClearZero(e.target.checked)} />
          <span>Auto-mark ₹0 / blank rows as <b>CLEARED</b></span>
        </label>

        <div style={{ border: '1.5px dashed #94a3b8', borderRadius: 10, padding: 12, textAlign: 'center', background: '#f8fafc' }}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ fontSize: 12, width: '100%' }} />
          {fileName && <div style={{ fontSize: 11, color: '#2563eb', marginTop: 4, fontWeight: 700 }}>Selected: {fileName}</div>}
        </div>

        {statusMsg && <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', background: '#f1f5f9', padding: 8, borderRadius: 8 }}>{statusMsg}</div>}

        {parsedRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
              Preview: {parsedRows.length} entries • Total Due: ₹{totalPreviewDue}
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th style={{ padding: 5, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Adm</th>
                    <th style={{ padding: 5, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Name</th>
                    <th style={{ padding: 5, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Item</th>
                    <th style={{ padding: 5, textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: 5, borderBottom: '1px solid #f1f5f9' }}>{r.adm_no}</td>
                      <td style={{ padding: 5, borderBottom: '1px solid #f1f5f9' }}>{r.student_name}</td>
                      <td style={{ padding: 5, borderBottom: '1px solid #f1f5f9' }}>{r.item_name}</td>
                      <td style={{ padding: 5, borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 700, color: r.is_cleared ? '#15803d' : '#dc2626' }}>
                        {r.is_cleared ? 'CLEARED ✓' : `₹${r.amount_due}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" disabled={saving} onClick={saveUploadedRows} style={{ padding: 10, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Upload size={15} /> {saving ? 'Uploading...' : `2. Upload & Save ${parsedRows.length} Records`}
            </button>
          </div>
        )}
      </div>

      {/* Quick Bulk Fine / Due Card (No Excel Needed) */}
      <form onSubmit={applyQuickBulkDue} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'start' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} color="#d97706" /> Quick Bulk Due (Without Excel)
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>Apply a common Fine or Fee to an entire class in 1 click.</p>
        </div>

        <select value={quickItem} onChange={e => setQuickItem(e.target.value)} required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
          {itemNames.map(it => <option key={it} value={it}>{it}</option>)}
        </select>

        <select value={quickClass} onChange={e => setQuickClass(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
          <option value="ALL">All Allowed Classes ({students.length} students)</option>
          {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <input type="number" value={quickAmt} onChange={e => setQuickAmt(e.target.value)} placeholder="Amount Due in ₹ (e.g. 50)" required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />

        <input type="text" value={quickRemarks} onChange={e => setQuickRemarks(e.target.value)} placeholder="Remarks (optional, e.g. Late Fine)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />

        <button type="submit" disabled={saving} style={{ padding: 10, borderRadius: 9, border: 'none', background: '#d97706', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckCircle2 size={15} /> {saving ? 'Applying...' : 'Apply Bulk Due to Class'}
        </button>
      </form>
    </div>
  );
}
