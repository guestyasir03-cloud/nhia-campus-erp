import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, RefreshCw, BookOpen, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';

function parseBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['yes', 'true', '1', 'y', 'on'].includes(s);
}

function parseWeekRange(raw) {
  const str = String(raw || '').trim();
  const nums = str.match(/\d+/g);
  if (!nums || nums.length === 0) return { week_no: 1, week_end: 1, week_label: str || 'Week 1' };
  const start = parseInt(nums[0], 10) || 1;
  const end = nums.length > 1 ? (parseInt(nums[1], 10) || start) : start;
  return {
    week_no: Math.min(start, end),
    week_end: Math.max(start, end),
    week_label: str || (start === end ? `Week ${start}` : `Weeks ${start}-${end}`)
  };
}

export default function ClassSubjectsExcelBar({ onDone }) {
  const [mode, setMode] = useState('subjects'); // 'subjects' | 'syllabus'
  const [classes, setClasses] = useState([]);
  const [staffList, setStaffList] = useState([]);

  // Subjects mode state
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [targetClass, setTargetClass] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);

  // Syllabus mode state
  const [sylClass, setSylClass] = useState('');
  const [replaceSyl, setReplaceSyl] = useState(false);
  const [autoSyncSub, setAutoSyncSub] = useState(true);
  const [parsedSylRows, setParsedSylRows] = useState([]);

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

  function findStaff(name) {
    if (!name) return null;
    const low = String(name).toLowerCase().trim();
    return staffList.find(s => s.name && s.name.toLowerCase().trim() === low) || null;
  }

  // ==================== SUBJECTS & TEACHERS ====================
  async function handleSyncFromSyllabus() {
    setBusy(true);
    setStatus('');
    let q = supabase.from('syllabus_weeks').select('class_name, subject, teacher_name');
    if (selectedClass && selectedClass !== 'ALL') q = q.eq('class_name', selectedClass);
    const { data: sylData, error: sylErr } = await q;
    if (sylErr) { setBusy(false); return setStatus('Sync error: ' + sylErr.message); }
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
        const stf = findStaff(r.teacher_name);
        uniqueMap.set(key, {
          class_name: cls,
          subject_name: sub,
          staff_id: stf ? String(stf.staff_id) : null,
          staff_name: stf ? stf.name : (r.teacher_name || null),
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
    setStatus(`Synced ${payload.length} syllabus subjects (${selectedClass === 'ALL' ? 'All Classes' : selectedClass}). Assign teachers below if needed.`);
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
    if (selectedClass && selectedClass !== 'ALL') q = q.eq('class_name', selectedClass);
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

  function handleDownloadSubTemplate() {
    const sample = [
      { Class: targetClass || 'S1', Subject: 'Malayalam (മലയാളം)', Teacher: '', CCE: 'Yes', Midterm: 'Yes', Hifz: 'No' },
      { Class: targetClass || 'S1', Subject: 'Quran Recitation (عرض القرآن)', Teacher: '', CCE: 'No', Midterm: 'No', Hifz: 'No' }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subjects_Template');
    XLSX.writeFile(wb, 'Subjects_Teachers_Template.xlsx');
  }

  function handleSubFileChange(e) {
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

  async function handleBulkUploadSubjects() {
    if (parsedRows.length === 0) return setStatus('Please select an Excel file first.');
    const resolved = parsedRows.map(r => {
      const cls = targetClass || r.class_name;
      const stf = findStaff(r.staff_name);
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

    if (resolved.length === 0) return setStatus('Please select a Target Class (or include a Class column in Excel).');

    setBusy(true);
    if (replaceExisting) {
      const uniqueClasses = [...new Set(resolved.map(r => r.class_name))];
      for (const c of uniqueClasses) {
        await supabase.from('subject_assignments').delete().eq('class_name', c);
      }
    }

    // Deduplicate by class_name + subject_name to prevent ON CONFLICT error
    const dedupMap = new Map();
    resolved.forEach(r => {
      const k = `${r.class_name.toLowerCase()}|${r.subject_name.toLowerCase()}`;
      dedupMap.set(k, r);
    });
    const uniqueResolved = Array.from(dedupMap.values());

    const { error } = await supabase
      .from('subject_assignments')
      .upsert(uniqueResolved, { onConflict: 'class_name,subject_name' });
    setBusy(false);
    if (error) return setStatus('Upload error: ' + error.message);

    setParsedRows([]);
    setStatus(`Successfully uploaded ${resolved.length} subjects!`);
    if (onDone) onDone();
  }

  // ==================== SYLLABUS EXCEL UPLOAD & EXPORT ====================
  function handleDownloadSylTemplate() {
    const sample = [
      {
        Subject: 'Quran Recitation (عرض القرآن)',
        Code: 'S101',
        Textbook: 'القرآن الكريم (المصحف)',
        'Periods/week': 'Daily 20 min after Fajr',
        Weeks: 'Weeks 1-2',
        Topic: 'من سورة القيامة إلى سورة المدثر',
        Teacher: ''
      },
      {
        Subject: 'Hadith (الحديث النبوي الشريف)',
        Code: '104S',
        Textbook: 'مختار الآداب والأخلاق، متن الأربعين النووية',
        'Periods/week': '3',
        Weeks: 'Weeks 1-2',
        Topic: 'متن الأربعين: من الحديث الأول إلى الثالث',
        Teacher: ''
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Syllabus_Template');
    XLSX.writeFile(wb, 'Syllabus_Upload_Template.xlsx');
  }

  async function handleDownloadSyllabus() {
    setBusy(true);
    setStatus('');
    let q = supabase.from('syllabus_weeks').select('*').order('class_name').order('subject').order('week_no');
    if (sylClass) q = q.eq('class_name', sylClass);
    const { data, error } = await q;
    setBusy(false);
    if (error) return setStatus('Download error: ' + error.message);
    if (!data || data.length === 0) return setStatus(`No syllabus found for ${sylClass || 'any class'}.`);

    const rows = data.map(r => ({
      Class: r.class_name || '',
      Subject: r.subject || '',
      Code: r.code || '',
      Textbook: r.textbook || '',
      'Periods/week': r.periods_per_week || '',
      Weeks: r.week_label || (r.week_no === r.week_end ? `Week ${r.week_no}` : `Weeks ${r.week_no}-${r.week_end}`),
      Topic: r.topic || '',
      Teacher: r.teacher_name || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Syllabus');
    const tag = sylClass ? sylClass.replace(/[^a-zA-Z0-9_-]/g, '_') : 'All_Classes';
    XLSX.writeFile(wb, `Syllabus_${tag}.xlsx`);
    setStatus(`Downloaded ${rows.length} syllabus topics (${tag}).`);
  }

  function handleSylFileChange(e) {
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
          const subject = String(r.Subject || r.subject || '').trim();
          const topic = String(r.Topic || r.topic || '').trim();
          if (!subject && !topic) return;
          const wk = parseWeekRange(r.Weeks || r.weeks || r.Week || r.week || 'Week 1');
          rows.push({
            class_name: String(r.Class || r.class || r.class_name || '').trim(),
            subject,
            code: String(r.Code || r.code || '').trim(),
            textbook: String(r.Textbook || r.textbook || '').trim(),
            periods_per_week: String(r['Periods/week'] || r['Periods/Week'] || r.Periods || r.periods_per_week || '').trim(),
            week_no: wk.week_no,
            week_end: wk.week_end,
            week_label: wk.week_label,
            topic,
            teacher_name: String(r.Teacher || r.teacher || r.teacher_name || r.Staff || '').trim(),
            is_completed: false
          });
        });
        setParsedSylRows(rows);
        setStatus(`Ready to upload ${rows.length} syllabus topics.`);
      } catch (err) {
        setStatus('Excel read error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleBulkUploadSyllabus() {
    if (parsedSylRows.length === 0) return setStatus('Please select a Syllabus Excel file first.');
    const resolved = parsedSylRows.map(r => {
      const cls = sylClass || r.class_name;
      const stf = findStaff(r.teacher_name);
      return {
        ...r,
        class_name: cls,
        teacher_name: stf ? stf.name : (r.teacher_name || '')
      };
    }).filter(r => r.class_name && r.subject);

    if (resolved.length === 0) return setStatus('Please select a Class for this Syllabus (or include Class column in Excel).');

    setBusy(true);
    const uniqueClasses = [...new Set(resolved.map(r => r.class_name))];
    if (replaceSyl) {
      for (const c of uniqueClasses) {
        await supabase.from('syllabus_weeks').delete().eq('class_name', c);
      }
    }

    const { error } = await supabase.from('syllabus_weeks').insert(resolved);
    if (error) { setBusy(false); return setStatus('Syllabus upload error: ' + error.message); }

    if (autoSyncSub) {
      const subMap = new Map();
      resolved.forEach(r => {
        const key = `${r.class_name.toLowerCase()}|${r.subject.toLowerCase()}`;
        if (!subMap.has(key)) {
          const stf = findStaff(r.teacher_name);
          subMap.set(key, {
            class_name: r.class_name,
            subject_name: r.subject,
            staff_id: stf ? String(stf.staff_id) : null,
            staff_name: stf ? stf.name : (r.teacher_name || null),
            has_w1_w4: false,
            has_midterm: false,
            has_hifz: false
          });
        }
      });
      await supabase
        .from('subject_assignments')
        .upsert(Array.from(subMap.values()), { onConflict: 'class_name,subject_name', ignoreDuplicates: true });
    }

    setBusy(false);
    setParsedSylRows([]);
    setStatus(`Uploaded ${resolved.length} syllabus topics${autoSyncSub ? ' & synced subjects (assign teachers below if blank)' : ''}!`);
    if (onDone) onDone();
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 14, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Compact Mode Switcher */}
      <div style={{ display: 'flex', gap: 6, background: '#e2e8f0', padding: 3, borderRadius: 10 }}>
        <button
          type="button"
          onClick={() => { setMode('subjects'); setStatus(''); }}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: mode === 'subjects' ? '#fff' : 'transparent', color: mode === 'subjects' ? '#1e3a8a' : '#475569', boxShadow: mode === 'subjects' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <Layers size={13} /> Subjects & Teachers
        </button>
        <button
          type="button"
          onClick={() => { setMode('syllabus'); setStatus(''); }}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: mode === 'syllabus' ? '#fff' : 'transparent', color: mode === 'syllabus' ? '#1e3a8a' : '#475569', boxShadow: mode === 'syllabus' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <BookOpen size={13} /> Syllabus Excel
        </button>
      </div>

      {mode === 'subjects' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Download / Sync / Upload Subjects</div>
            <button type="button" onClick={handleDownloadSubTemplate} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              📥 Template (.xlsx)
            </button>
          </div>

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

          <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={targetClass} onChange={e => setTargetClass(e.target.value)} style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="">Use Class from Excel (or pick Class)</option>
                {classes.map(c => <option key={c} value={c}>Upload to: {c}</option>)}
              </select>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSubFileChange} style={{ fontSize: 11.5, maxWidth: '100%' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
                Replace existing subjects for uploaded class
              </label>
              {parsedRows.length > 0 && (
                <button type="button" onClick={handleBulkUploadSubjects} disabled={busy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Upload size={13} /> {busy ? 'Uploading...' : `Upload ${parsedRows.length} Subjects`}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Upload / Download Syllabus (Teacher Optional)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleDownloadSylTemplate} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                📥 Template (.xlsx)
              </button>
              <button type="button" onClick={handleDownloadSyllabus} disabled={busy} style={{ padding: '5px 9px', borderRadius: 7, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Download size={12} /> Export {sylClass || 'All'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={sylClass} onChange={e => setSylClass(e.target.value)} style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="">Select Class (e.g. S1, D1)</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSylFileChange} style={{ fontSize: 11.5, maxWidth: '100%' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoSyncSub} onChange={e => setAutoSyncSub(e.target.checked)} />
              Auto-add subjects to Staff Assignments (CCE/Midterm OFF — assign teachers below)
            </label>
            <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={replaceSyl} onChange={e => setReplaceSyl(e.target.checked)} />
              Replace existing syllabus for selected class
            </label>
          </div>

          {parsedSylRows.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleBulkUploadSyllabus} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Upload size={13} /> {busy ? 'Uploading...' : `Upload ${parsedSylRows.length} Syllabus Topics`}
              </button>
            </div>
          )}
        </>
      )}

      {status && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#eef2ff', padding: '6px 10px', borderRadius: 8 }}>{status}</div>}
    </div>
  );
}
