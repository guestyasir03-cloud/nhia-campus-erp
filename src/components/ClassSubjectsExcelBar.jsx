import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { Upload, Download, RefreshCw, BookOpen, Layers, Users, FileText, Copy } from 'lucide-react';
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

export default function ClassSubjectsExcelBar({ onDone, onModeChange }) {
  const [mode, setMode] = useState('subjects'); // 'subjects' | 'syllabus' | 'report'
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

  // Teacher Report mode state
  const [repLoaded, setRepLoaded] = useState(false);
  const [repLoading, setRepLoading] = useState(false);
  const [repAssignments, setRepAssignments] = useState([]);
  const [repTeacherFilter, setRepTeacherFilter] = useState('ALL');
  const [repClassFilter, setRepClassFilter] = useState('ALL');
  const [copiedWA, setCopiedWA] = useState(false);

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

  async function loadReportData() {
    setRepLoading(true);
    const { data: asg } = await supabase
      .from('subject_assignments')
      .select('class_name, subject_name, staff_name, has_w1_w4, has_midterm, has_hifz')
      .order('class_name')
      .order('subject_name');
    setRepAssignments(asg || []);
    setRepLoaded(true);
    setRepLoading(false);
  }

  useEffect(() => {
    if (mode === 'report' && !repLoaded) {
      loadReportData();
    }
  }, [mode, repLoaded]);

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
    setRepLoaded(false);
    setStatus(`Synced ${payload.length} syllabus subjects (${selectedClass === 'ALL' ? 'All Classes' : selectedClass}).`);
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

    const dedupMap = new Map();
    resolved.forEach(r => {
      const k = `${r.class_name.toLowerCase()}|${r.subject_name.toLowerCase()}`;
      dedupMap.set(k, r);
    });
    const uniqueResolved = Array.from(dedupMap.values());

    setBusy(true);
    if (replaceExisting) {
      const uniqueClasses = [...new Set(uniqueResolved.map(r => r.class_name))];
      for (const c of uniqueClasses) {
        await supabase.from('subject_assignments').delete().eq('class_name', c);
      }
    }

    const { error } = await supabase
      .from('subject_assignments')
      .upsert(uniqueResolved, { onConflict: 'class_name,subject_name' });
    setBusy(false);
    if (error) return setStatus('Upload error: ' + error.message);

    setParsedRows([]);
    setRepLoaded(false);
    setStatus(`Successfully uploaded ${uniqueResolved.length} subjects!`);
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
    setRepLoaded(false);
    setStatus(`Uploaded ${resolved.length} syllabus topics${autoSyncSub ? ' & synced subjects!' : '!'}`);
    if (onDone) onDone();
  }

  // ==================== TEACHER-WISE CLASS & SUBJECT REPORT ====================
  const reportData = useMemo(() => {
    const teacherMap = new Map();
    const teacherNames = new Set();

    repAssignments.forEach(a => {
      const cls = String(a.class_name || '').trim();
      const sub = String(a.subject_name || '').trim();
      const tName = String(a.staff_name || '').trim() || 'Unassigned';
      teacherNames.add(tName);

      if (repClassFilter !== 'ALL' && cls !== repClassFilter) return;
      if (repTeacherFilter !== 'ALL' && tName !== repTeacherFilter) return;

      if (!teacherMap.has(tName)) {
        teacherMap.set(tName, {
          teacher: tName,
          totalSubjects: 0,
          classMap: {} // { S1: ['Fiqh', 'Arabic'], D2: ['Adab'] }
        });
      }
      const entry = teacherMap.get(tName);
      entry.totalSubjects += 1;
      if (!entry.classMap[cls]) entry.classMap[cls] = [];
      entry.classMap[cls].push(sub);
    });

    const list = Array.from(teacherMap.values()).sort((a, b) => {
      if (a.teacher === 'Unassigned') return 1;
      if (b.teacher === 'Unassigned') return -1;
      return a.teacher.localeCompare(b.teacher);
    });

    const totalSubjects = list.reduce((s, t) => s + t.totalSubjects, 0);

    return {
      list,
      allTeachers: [...teacherNames].sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b))),
      totalSubjects
    };
  }, [repAssignments, repTeacherFilter, repClassFilter]);

  function handleExportReportExcel() {
    if (reportData.list.length === 0) return setStatus('No data to export.');
    const summaryRows = reportData.list.map((t, i) => ({
      'Sl.': i + 1,
      Teacher: t.teacher,
      'Total Subjects': t.totalSubjects,
      'Class-wise Subjects': Object.entries(t.classMap)
        .map(([c, subs]) => `${c}: ${subs.join(', ')}`)
        .join(' | ')
    }));

    const detailRows = [];
    reportData.list.forEach(t => {
      Object.entries(t.classMap).forEach(([cls, subs]) => {
        subs.forEach(sub => {
          detailRows.push({ Teacher: t.teacher, Class: cls, Subject: sub });
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Teacher_Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Detailed_List');
    const tag = repTeacherFilter !== 'ALL' ? repTeacherFilter.replace(/[^a-zA-Z0-9_-]/g, '_') : (repClassFilter !== 'ALL' ? repClassFilter : 'All_Staff');
    XLSX.writeFile(wb, `NHIA_Teacher_Subjects_${tag}.xlsx`);
    setStatus(`Downloaded Excel (${tag})!`);
  }

  function handleExportReportPDF() {
    if (reportData.list.length === 0) return setStatus('No data to export.');
    const container = document.createElement('div');
    container.style.padding = '16px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.color = '#0f172a';

    const titleSub = `${repTeacherFilter === 'ALL' ? 'All Teachers' : repTeacherFilter} • ${repClassFilter === 'ALL' ? 'All Classes' : repClassFilter}`;
    let html = `
      <div style="text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:14px;">
        <div style="font-size:16px; font-weight:800; color:#1e3a8a;">NOORUL HIDAYA ISLAMIC ACADEMY</div>
        <div style="font-size:12px; font-weight:700; color:#334155; margin-top:2px;">Teacher-wise Class & Subject Allocation</div>
        <div style="font-size:10.5px; color:#64748b; margin-top:2px;">${titleSub} • ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background:#1e3a8a; color:#fff;">
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left; width:30px;">#</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left; width:150px;">Teacher</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Classes & Subjects</th>
          </tr>
        </thead>
        <tbody>
    `;

    reportData.list.forEach((t, idx) => {
      const clsLines = Object.entries(t.classMap)
        .map(([c, subs]) => `<div style="margin-bottom:3px;"><b>${c}:</b> ${subs.join(', ')}</div>`)
        .join('');
      html += `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; page-break-inside:avoid;">
          <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:top;">${idx + 1}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; font-weight:700; vertical-align:top;">${t.teacher}<div style="font-size:10px; color:#64748b; font-weight:600;">${t.totalSubjects} Subjects</div></td>
          <td style="padding:6px; border:1px solid #cbd5e1; vertical-align:top;">${clsLines}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const tag = repTeacherFilter !== 'ALL' ? repTeacherFilter.replace(/[^a-zA-Z0-9_-]/g, '_') : (repClassFilter !== 'ALL' ? repClassFilter : 'All_Staff');
    html2pdf().set({
      margin: 8,
      filename: `NHIA_Teacher_Subjects_${tag}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
  }

  function handleCopyReportWA() {
    if (reportData.list.length === 0) return setStatus('No data to copy.');
    const lines = [
      '📚 *NHIA TEACHER-WISE SUBJECTS*',
      `*Filter:* ${repTeacherFilter === 'ALL' ? 'All Teachers' : repTeacherFilter} | ${repClassFilter === 'ALL' ? 'All Classes' : repClassFilter}`,
      ''
    ];
    reportData.list.forEach((t, i) => {
      lines.push(`${i + 1}. *${t.teacher}* (${t.totalSubjects} Subjects)`);
      Object.entries(t.classMap).forEach(([c, subs]) => {
        lines.push(`   • *${c}:* ${subs.join(', ')}`);
      });
      lines.push('');
    });
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedWA(true);
        setTimeout(() => setCopiedWA(false), 2000);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedWA(true);
      setTimeout(() => setCopiedWA(false), 2000);
    }
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 14, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Clean 3-Tab Switcher */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, background: '#e2e8f0', padding: 3, borderRadius: 10 }}>
        <button
          type="button"
          onClick={() => { setMode('subjects'); onModeChange && onModeChange('subjects'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'subjects' ? '#fff' : 'transparent', color: mode === 'subjects' ? '#1e3a8a' : '#475569', boxShadow: mode === 'subjects' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <Layers size={13} /> Subjects
        </button>
        <button
          type="button"
          onClick={() => { setMode('syllabus'); onModeChange && onModeChange('syllabus'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'syllabus' ? '#fff' : 'transparent', color: mode === 'syllabus' ? '#1e3a8a' : '#475569', boxShadow: mode === 'syllabus' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <BookOpen size={13} /> Syllabus
        </button>
        <button
          type="button"
          onClick={() => { setMode('report'); onModeChange && onModeChange('report'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'report' ? '#fff' : 'transparent', color: mode === 'report' ? '#1e3a8a' : '#475569', boxShadow: mode === 'report' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <Users size={13} /> Staff Report
        </button>
      </div>

      {mode === 'subjects' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Subjects Excel (Sync / Download / Upload)</div>
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
              <Download size={13} /> Excel (.xlsx)
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
      )}

      {mode === 'syllabus' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Upload / Export Syllabus (Teacher Optional)</div>
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
              Auto-add subjects to Staff Assignments (CCE/Midterm OFF)
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

      {mode === 'report' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Teacher-wise Classes & Subjects ({reportData.list.length} Staff • {reportData.totalSubjects} Subjects)</div>
            <button type="button" onClick={loadReportData} disabled={repLoading} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
            <select value={repTeacherFilter} onChange={e => setRepTeacherFilter(e.target.value)} style={{ width: '100%', minWidth: 0, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="ALL">All Teachers</option>
              {reportData.allTeachers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={repClassFilter} onChange={e => setRepClassFilter(e.target.value)} style={{ width: '100%', minWidth: 0, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="ALL">All Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Single Place for Excel / PDF / WhatsApp Exports */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleExportReportExcel} style={{ flex: 1, minWidth: 95, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Download size={13} /> Excel (.xlsx)
            </button>
            <button type="button" onClick={handleExportReportPDF} style={{ flex: 1, minWidth: 95, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <FileText size={13} /> PDF Report
            </button>
            <button type="button" onClick={handleCopyReportWA} style={{ flex: 1, minWidth: 105, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Copy size={13} /> {copiedWA ? 'Copied!' : 'WhatsApp'}
            </button>
          </div>

          {/* Teacher Cards showing exact Class -> Subjects */}
          {repLoading ? (
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 12 }}>Loading...</div>
          ) : reportData.list.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 12 }}>No assignments found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
              {reportData.list.map(t => (
                <div key={t.teacher} style={{ flexShrink: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: t.teacher === 'Unassigned' ? '#dc2626' : '#0f172a' }}>
                      {t.teacher}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#eef2ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                      {t.totalSubjects} Subjects
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Object.entries(t.classMap).map(([cls, subs]) => (
                      <div key={cls} style={{ fontSize: 11.5, lineHeight: 1.4, color: '#334155' }}>
                        <span style={{ display: 'inline-block', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', padding: '1px 6px', borderRadius: 5, marginRight: 6 }}>{cls}</span>
                        <span>{subs.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {status && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#eef2ff', padding: '6px 10px', borderRadius: 8 }}>{status}</div>}
    </div>
  );
}
