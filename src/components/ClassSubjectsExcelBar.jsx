import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

function parseBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['yes', 'true', '1', 'y', 'on'].includes(s);
}

export default function ClassSubjectsExcelBar({ onDone }) {
  const [classes, setClasses] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [targetClass, setTargetClass] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function init() {
      const [{ data: stCls }, { data: subCls }, { data: sylCls }, { data: stf }] = await Promise.all([
        supabase.from('students').select('class_name'),
        supabase.from('subject_assignments').select('class_name'),
        supabase.from('syllabus_weeks').select('class_name'),
        supabase.from('staff').select('staff_id, name')
      ]);
      const clsSet = new Set();
      (stCls || []).forEach(r => r.class_name && clsSet.add(r.class_name));
      (subCls || []).forEach(r => r.class_name && clsSet.add(r.class_name));
      (sylCls || []).forEach(r => r.class_name && clsSet.add(r.class_name));
      setClasses([...clsSet].sort());
      setStaffList(stf || []);
    }
    init();
  }, []);

  // 1-Click Sync: Pull non-CCE / non-Midterm subjects from Syllabus into subject_assignments
  async function handleSyncFromSyllabus() {
    setBusy(true);
    setStatus('');
    let q = supabase.from('syllabus_weeks').select('class_name, subject');
    if (selectedClass && selectedClass !== 'ALL') {
      q = q.eq('class_name', selectedClass);
    }
    const { data: sylData, error: sylErr } = await q;
    if (sylErr) {
      setBusy(false);
      return setStatus('Sync error: ' + sylErr.message);
    }
    if (!sylData || sylData.length === 0) {
      setBusy(false);
      return setStatus(`No syllabus subjects found for ${selectedClass === 'ALL' ? 'any class' : selectedClass}.`);
    }

    const uniqueMap = new Map();
    sylData.forEach(r => {
      const cls = String(r.class_name || '').trim();
      const sub = String(r.subject || '').trim();
      if (!cls || !sub) return;
      const key = `${cls.toLowerCase()}|${sub.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          class_name: cls,
          subject_name: sub,
          staff_id: null,
          staff_name: null,
          has_w1_w4: false,
          has_midterm: false,
          has_hifz: false
        });
      }
    });

    const payload = Array.from(uniqueMap.values());
    const { error: upErr } = await supabase
      .from('subject_assignments')
      .upsert(payload, { onConflict: 'class_name,subject_name', ignoreDuplicates: true });

    setBusy(false);
    if (upErr) return setStatus('Sync error: ' + upErr.message);

    setStatus(`Synced ${payload.length} syllabus subjects (${selectedClass === 'ALL' ? 'All Classes' : selectedClass}) with CCE/Midterm OFF! Now assign teachers below.`);
    if (onDone) onDone();
  }

  async function handleDownloadSubjects() {
    setBusy(true);
    setStatus('');
    let q = supabase
      .from('subject_assignments')
      .select('class_name, subject_name, staff_name, has_w1_w4, has_midterm, has_hifz')
      .order('class_name')
      .order('subject_name');
    if (selectedClass && selectedClass !== 'ALL') {
      q = q.eq('class_name', selectedClass);
    }
    const { data, error } = await q;
    setBusy(false);
    if (error) return setStatus('Download error: ' + error.message);
    if (!data || data.length === 0) return setStatus(`No subjects found for ${selectedClass === 'ALL' ? 'any class' : selectedClass}.`);

    const rows = data.map(r => ({
      Class: r.class_name || '',
      Subject: r.subject_name || '',
      Teacher: r.staff_name || '',
      CCE: r.has_w1_w4 ? 'Yes' : 'No',
      Midterm: r.has_midterm ? 'Yes' : 'No',
      Hifz: r.has_hifz ? 'Yes' : 'No'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects');
    const tag = selectedClass === 'ALL' ? 'All_Classes' : selectedClass.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Subjects_${tag}.xlsx`);
    setStatus(`Downloaded ${rows.length} subjects (${tag}).`);
  }

  function handleDownloadTemplate() {
    const sample = [
      { Class: targetClass || 'S1', Subject: 'Malayalam', Teacher: '', CCE: 'Yes', Midterm: 'Yes', Hifz: 'No' },
      { Class: targetClass || 'S1', Subject: 'Quran Recitation', Teacher: '', CCE: 'No', Midterm: 'No', Hifz: 'No' }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects_Template');
    XLSX.writeFile(wb, 'Class_Subjects_Template.xlsx');
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const rows = [];
        json.forEach(r => {
          const subject_name = String(r.Subject || r.subject || r.subject_name || '').trim();
          const class_name = String(r.Class || r.class || r.class_name || '').trim();
          const staff_name = String(r.Teacher || r.teacher || r.staff_name || r.Staff || '').trim();
          if (subject_name) {
            rows.push({
              class_name,
              subject_name,
              staff_name,
              has_w1_w4: parseBool(r.CCE ?? r.cce ?? r.has_w1_w4 ?? 'No'),
              has_midterm: parseBool(r.Midterm ?? r.midterm ?? r.has_midterm ?? 'No'),
              has_hifz: parseBool(r.Hifz ?? r.hifz ?? r.has_hifz ?? 'No')
            });
          }
        });
        setParsedRows(rows);
        setStatus(`Ready to upload ${rows.length} subjects.`);
      } catch (err) {
        setStatus('Excel read error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleBulkUpload() {
    if (parsedRows.length === 0) return setStatus('Please select an Excel file first.');
    const resolved = parsedRows.map(r => {
      const cls = targetClass || r.class_name;
      const stf = staffList.find(s => s.name && r.staff_name && s.name.toLowerCase().trim() === r.staff_name.toLowerCase().trim());
      return {
        class_name: cls,
        subject_name: r.subject_name,
        staff_name: stf ? stf.name : (r.staff_name || null),
        staff_id: stf ? String(stf.staff_id) : null,
        has_w1_w4: r.has_w1_w4,
        has_midterm: r.has_midterm,
        has_hifz: r.has_hifz
      };
    }).filter(r => r.class_name && r.subject_name);

    if (resolved.length === 0) {
      return setStatus('Please select a Target Class (or include a Class column in Excel).');
    }

    setBusy(true);
    if (replaceExisting) {
      const uniqueClasses = [...new Set(resolved.map(r => r.class_name))];
      for (const c of uniqueClasses) {
        await supabase.from('subject_assignments').delete().eq('class_name', c);
      }
    }

    const { error } = await supabase
      .from('subject_assignments')
      .upsert(resolved, { onConflict: 'class_name,subject_name' });
    setBusy(false);
    if (error) return setStatus('Upload error: ' + error.message);

    setParsedRows([]);
    setStatus(`Successfully uploaded ${resolved.length} subjects!`);
    if (onDone) onDone();
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 14, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Class Subjects Manager (Sync / Excel)</div>
        <button type="button" onClick={handleDownloadTemplate} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          📥 Template (.xlsx)
        </button>
      </div>

      {/* Sync from Syllabus + Download Section */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, minWidth: 110, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
          <option value="ALL">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" onClick={handleSyncFromSyllabus} disabled={busy} style={{ padding: '8px 11px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Sync from Syllabus
        </button>
        <button type="button" onClick={handleDownloadSubjects} disabled={busy} style={{ padding: '8px 11px', borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Download size={13} /> Download (.xlsx)
        </button>
      </div>

      {/* Upload Section */}
      <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={targetClass} onChange={e => setTargetClass(e.target.value)} style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
            <option value="">Use Class from Excel (or pick Class)</option>
            {classes.map(c => <option key={c} value={c}>Upload to: {c}</option>)}
          </select>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ fontSize: 11.5, maxWidth: '100%' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
            Replace existing subjects for uploaded class
          </label>
          {parsedRows.length > 0 && (
            <button type="button" onClick={handleBulkUpload} disabled={busy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Upload size={13} /> {busy ? 'Uploading...' : `Upload ${parsedRows.length} Subjects`}
            </button>
          )}
        </div>
      </div>

      {status && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#eef2ff', padding: '6px 10px', borderRadius: 8 }}>{status}</div>}
    </div>
  );
}
