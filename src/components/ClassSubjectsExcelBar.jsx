import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { Upload, Download, RefreshCw, BookOpen, Layers, BarChart3, FileText, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';

function parseBool(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['yes', 'true', '1', 'y', 'on'].includes(s);
}

function cleanSubKey(v) {
  return String(v || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parsePeriodsNumber(raw) {
  const s = String(raw || '').trim();
  if (!s) return { num: 0, label: '-' };
  if (/^\d+(\.\d+)?$/.test(s)) return { num: Number(s), label: `${s}p` };
  const m = s.match(/^(\d+(\.\d+)?)\s*(p|per|hr|hrs|period|periods)?$/i);
  if (m) return { num: Number(m[1]), label: `${m[1]}p` };
  return { num: 0, label: s };
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
  const [mode, setMode] = useState('subjects'); // 'subjects' | 'syllabus' | 'workload'
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

  // Workload mode state
  const [wlLoaded, setWlLoaded] = useState(false);
  const [wlLoading, setWlLoading] = useState(false);
  const [wlAssignments, setWlAssignments] = useState([]);
  const [wlPeriodsMap, setWlPeriodsMap] = useState({});
  const [wlTeacherFilter, setWlTeacherFilter] = useState('ALL');
  const [wlClassFilter, setWlClassFilter] = useState('ALL');
  const [expandedTeacher, setExpandedTeacher] = useState(null);
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

  async function loadWorkloadData() {
    setWlLoading(true);
    const [{ data: asg }, { data: syl }] = await Promise.all([
      supabase
        .from('subject_assignments')
        .select('class_name, subject_name, staff_name, has_w1_w4, has_midterm, has_hifz')
        .order('class_name')
        .order('subject_name'),
      supabase.from('syllabus_weeks').select('class_name, subject, periods_per_week')
    ]);

    const pMap = {};
    (syl || []).forEach(r => {
      if (!r.class_name || !r.subject || !r.periods_per_week) return;
      const cls = String(r.class_name).trim().toLowerCase();
      const exactKey = `${cls}|${String(r.subject).trim().toLowerCase()}`;
      const cleanKey = `${cls}|${cleanSubKey(r.subject)}`;
      if (!pMap[exactKey]) pMap[exactKey] = String(r.periods_per_week).trim();
      if (!pMap[cleanKey]) pMap[cleanKey] = String(r.periods_per_week).trim();
    });

    setWlAssignments(asg || []);
    setWlPeriodsMap(pMap);
    setWlLoaded(true);
    setWlLoading(false);
  }

  useEffect(() => {
    if (mode === 'workload' && !wlLoaded) {
      loadWorkloadData();
    }
  }, [mode, wlLoaded]);

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
    setWlLoaded(false);
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

  async function handleDownloadSubjectsPDF() {
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
    if (error) return setStatus('PDF error: ' + error.message);
    if (!data || data.length === 0) return setStatus(`No subjects found for ${selectedClass === 'ALL' ? 'any class' : selectedClass}.`);

    const container = document.createElement('div');
    container.style.padding = '16px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.color = '#0f172a';

    const tagLabel = selectedClass === 'ALL' ? 'All Classes' : `Class ${selectedClass}`;
    let html = `
      <div style="text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:14px;">
        <div style="font-size:16px; font-weight:800; color:#1e3a8a;">NOORUL HIDAYA ISLAMIC ACADEMY</div>
        <div style="font-size:12px; font-weight:700; color:#334155; margin-top:2px;">Subjects & Teachers Assignment List — ${tagLabel}</div>
        <div style="font-size:10.5px; color:#64748b; margin-top:2px;">Total: ${data.length} Subjects • Generated: ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead>
          <tr style="background:#1e3a8a; color:#fff;">
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left; width:35px;">#</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left; width:65px;">Class</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Subject</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Teacher</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left; width:110px;">Exam Mode</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach((r, idx) => {
      const modes = [r.has_w1_w4 ? 'CCE' : '', r.has_midterm ? 'Midterm' : '', r.has_hifz ? 'Hifz' : ''].filter(Boolean).join(', ') || 'Syllabus Only';
      html += `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding:6px; border:1px solid #cbd5e1;">${idx + 1}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; font-weight:700;">${r.class_name || ''}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; font-weight:600;">${r.subject_name || ''}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; color:${r.staff_name ? '#0f172a' : '#dc2626'};">${r.staff_name || 'Unassigned'}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; color:#475569;">${modes}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const fileTag = selectedClass === 'ALL' ? 'All_Classes' : selectedClass.replace(/[^a-zA-Z0-9_-]/g, '_');
    html2pdf().set({
      margin: 8,
      filename: `NHIA_Subjects_Teachers_${fileTag}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
    setStatus(`Downloaded PDF for ${tagLabel} (${data.length} subjects).`);
  }

  async function handleCopySubjectsWA() {
    setBusy(true);
    setStatus('');
    let q = supabase
      .from('subject_assignments')
      .select('class_name, subject_name, staff_name')
      .order('class_name')
      .order('subject_name');
    if (selectedClass && selectedClass !== 'ALL') q = q.eq('class_name', selectedClass);
    const { data, error } = await q;
    setBusy(false);
    if (error) return setStatus('Copy error: ' + error.message);
    if (!data || data.length === 0) return setStatus(`No subjects found for ${selectedClass === 'ALL' ? 'any class' : selectedClass}.`);

    const tagLabel = selectedClass === 'ALL' ? 'All Classes' : `Class ${selectedClass}`;
    const lines = [
      '📚 *NHIA SUBJECTS & TEACHERS*',
      `*Class:* ${tagLabel} • *Total:* ${data.length}`,
      ''
    ];
    data.forEach((r, i) => {
      const clsPrefix = selectedClass === 'ALL' ? `[${r.class_name}] ` : '';
      lines.push(`${i + 1}. ${clsPrefix}*${r.subject_name}* — ${r.staff_name || 'Unassigned'}`);
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
    setStatus(`Copied ${data.length} subjects for WhatsApp!`);
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
    setWlLoaded(false);
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
    setWlLoaded(false);
    setStatus(`Uploaded ${resolved.length} syllabus topics${autoSyncSub ? ' & synced subjects (assign teachers below if blank)' : ''}!`);
    if (onDone) onDone();
  }

  // ==================== WORKLOAD & REPORTS (MEMOIZED, ZERO LAG) ====================
  const workloadData = useMemo(() => {
    const teacherMap = new Map();
    const teacherNames = new Set();

    wlAssignments.forEach(a => {
      const cls = String(a.class_name || '').trim();
      const sub = String(a.subject_name || '').trim();
      const tName = String(a.staff_name || '').trim() || 'Unassigned';
      teacherNames.add(tName);

      if (wlClassFilter !== 'ALL' && cls !== wlClassFilter) return;
      if (wlTeacherFilter !== 'ALL' && tName !== wlTeacherFilter) return;

      const cLow = cls.toLowerCase();
      const rawPer = wlPeriodsMap[`${cLow}|${sub.toLowerCase()}`] || wlPeriodsMap[`${cLow}|${cleanSubKey(sub)}`] || '';
      const parsedPer = parsePeriodsNumber(rawPer);

      if (!teacherMap.has(tName)) {
        teacherMap.set(tName, {
          teacher: tName,
          totalSubjects: 0,
          totalPeriods: 0,
          extraNotes: 0,
          classTotals: {},
          items: []
        });
      }
      const entry = teacherMap.get(tName);
      entry.totalSubjects += 1;
      entry.totalPeriods += parsedPer.num;
      if (parsedPer.num === 0 && rawPer) entry.extraNotes += 1;

      if (!entry.classTotals[cls]) entry.classTotals[cls] = { subjects: 0, periods: 0 };
      entry.classTotals[cls].subjects += 1;
      entry.classTotals[cls].periods += parsedPer.num;

      entry.items.push({
        class_name: cls,
        subject_name: sub,
        periods_raw: rawPer || '-',
        periods_num: parsedPer.num,
        periods_label: parsedPer.label,
        has_w1_w4: !!a.has_w1_w4,
        has_midterm: !!a.has_midterm,
        has_hifz: !!a.has_hifz
      });
    });

    const list = Array.from(teacherMap.values()).sort((a, b) => {
      if (a.teacher === 'Unassigned') return 1;
      if (b.teacher === 'Unassigned') return -1;
      return b.totalPeriods - a.totalPeriods || a.teacher.localeCompare(b.teacher);
    });

    const totalSubjects = list.reduce((s, t) => s + t.totalSubjects, 0);
    const totalPeriods = list.reduce((s, t) => s + t.totalPeriods, 0);
    const unassignedCount = list.find(t => t.teacher === 'Unassigned')?.totalSubjects || 0;

    return {
      list,
      allTeachers: [...teacherNames].sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b))),
      totalSubjects,
      totalPeriods,
      unassignedCount
    };
  }, [wlAssignments, wlPeriodsMap, wlTeacherFilter, wlClassFilter]);

  function handleExportWorkloadExcel() {
    if (workloadData.list.length === 0) return setStatus('No workload data to export.');
    const summaryRows = workloadData.list.map((t, i) => ({
      'Sl.': i + 1,
      Teacher: t.teacher,
      'Total Subjects': t.totalSubjects,
      'Total Periods/Week': t.totalPeriods,
      'Class-wise Breakdown': Object.entries(t.classTotals)
        .map(([c, v]) => `${c}: ${v.periods}p (${v.subjects} sub)`)
        .join(', ')
    }));

    const detailRows = [];
    workloadData.list.forEach(t => {
      t.items.forEach(it => {
        detailRows.push({
          Teacher: t.teacher,
          Class: it.class_name,
          Subject: it.subject_name,
          'Periods/Week': it.periods_raw,
          CCE: it.has_w1_w4 ? 'Yes' : 'No',
          Midterm: it.has_midterm ? 'Yes' : 'No',
          Hifz: it.has_hifz ? 'Yes' : 'No'
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Teacher_Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Class_Subject_Details');
    const tag = wlTeacherFilter !== 'ALL' ? wlTeacherFilter.replace(/[^a-zA-Z0-9_-]/g, '_') : (wlClassFilter !== 'ALL' ? wlClassFilter : 'All_Staff');
    XLSX.writeFile(wb, `NHIA_Workload_${tag}.xlsx`);
    setStatus(`Exported Workload Excel (${tag})!`);
  }

  function handleExportWorkloadPDF() {
    if (workloadData.list.length === 0) return setStatus('No workload data to export.');
    const container = document.createElement('div');
    container.style.padding = '16px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.color = '#0f172a';

    const titleSub = `${wlTeacherFilter === 'ALL' ? 'All Teachers' : wlTeacherFilter} • ${wlClassFilter === 'ALL' ? 'All Classes' : wlClassFilter}`;
    let html = `
      <div style="text-align:center; border-bottom:2px solid #1e3a8a; padding-bottom:8px; margin-bottom:14px;">
        <div style="font-size:16px; font-weight:800; color:#1e3a8a;">NOORUL HIDAYA ISLAMIC ACADEMY</div>
        <div style="font-size:12px; font-weight:700; color:#334155; margin-top:2px;">Teacher Workload & Class-wise Periods Report</div>
        <div style="font-size:10.5px; color:#64748b; margin-top:2px;">${titleSub} • Generated: ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:14px;">
        <thead>
          <tr style="background:#1e3a8a; color:#fff;">
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">#</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Teacher</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Subjects</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Periods/Wk</th>
            <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Class-wise Breakdown</th>
          </tr>
        </thead>
        <tbody>
    `;

    workloadData.list.forEach((t, idx) => {
      const clsStr = Object.entries(t.classTotals)
        .map(([c, v]) => `<b>${c}</b>: ${v.periods}p (${v.subjects})`)
        .join(' | ');
      html += `
        <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding:6px; border:1px solid #cbd5e1;">${idx + 1}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; font-weight:700;">${t.teacher}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${t.totalSubjects}</td>
          <td style="padding:6px; border:1px solid #cbd5e1; text-align:center; font-weight:700; color:#1d4ed8;">${t.totalPeriods}</td>
          <td style="padding:6px; border:1px solid #cbd5e1;">${clsStr}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;

    // Detailed subject list per teacher
    workloadData.list.forEach(t => {
      html += `
        <div style="page-break-inside:avoid; margin-bottom:12px; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
          <div style="background:#eff6ff; padding:6px 10px; font-size:11.5px; font-weight:800; color:#1e3a8a; display:flex; justify-content:space-between;">
            <span>${t.teacher}</span>
            <span>${t.totalSubjects} Subjects • ${t.totalPeriods} Periods/Week</span>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:4px 8px; border-top:1px solid #cbd5e1; text-align:left; width:60px;">Class</th>
                <th style="padding:4px 8px; border-top:1px solid #cbd5e1; text-align:left;">Subject</th>
                <th style="padding:4px 8px; border-top:1px solid #cbd5e1; text-align:center; width:90px;">Periods/Wk</th>
                <th style="padding:4px 8px; border-top:1px solid #cbd5e1; text-align:left; width:110px;">Exam Mode</th>
              </tr>
            </thead>
            <tbody>
      `;
      t.items.forEach(it => {
        const tags = [
          it.has_w1_w4 ? 'CCE' : '',
          it.has_midterm ? 'Midterm' : '',
          it.has_hifz ? 'Hifz' : ''
        ].filter(Boolean).join(', ') || 'Syllabus Only';
        html += `
          <tr>
            <td style="padding:4px 8px; border-top:1px solid #e2e8f0; font-weight:700;">${it.class_name}</td>
            <td style="padding:4px 8px; border-top:1px solid #e2e8f0;">${it.subject_name}</td>
            <td style="padding:4px 8px; border-top:1px solid #e2e8f0; text-align:center;">${it.periods_raw}</td>
            <td style="padding:4px 8px; border-top:1px solid #e2e8f0; color:#475569;">${tags}</td>
          </tr>
        `;
      });
      html += `</tbody></table></div>`;
    });

    container.innerHTML = html;
    const tag = wlTeacherFilter !== 'ALL' ? wlTeacherFilter.replace(/[^a-zA-Z0-9_-]/g, '_') : (wlClassFilter !== 'ALL' ? wlClassFilter : 'All_Staff');
    html2pdf().set({
      margin: 8,
      filename: `NHIA_Workload_${tag}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
  }

  function handleCopyWorkloadWA() {
    if (workloadData.list.length === 0) return setStatus('No workload data to copy.');
    const lines = [
      '📊 *NHIA TEACHER WORKLOAD & PERIODS*',
      `*Filter:* ${wlTeacherFilter === 'ALL' ? 'All Teachers' : wlTeacherFilter} | ${wlClassFilter === 'ALL' ? 'All Classes' : wlClassFilter}`,
      ''
    ];
    workloadData.list.forEach((t, i) => {
      const clsStr = Object.entries(t.classTotals)
        .map(([c, v]) => `${c}: ${v.periods}p`)
        .join(', ');
      lines.push(`${i + 1}. *${t.teacher}* — *${t.totalPeriods} Periods/wk* (${t.totalSubjects} Sub)`);
      if (clsStr) lines.push(`   Classes: ${clsStr}`);
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
      {/* 3-Tab Mode Switcher */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, background: '#e2e8f0', padding: 3, borderRadius: 10 }}>
        <button
          type="button"
          onClick={() => { setMode('subjects'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'subjects' ? '#fff' : 'transparent', color: mode === 'subjects' ? '#1e3a8a' : '#475569', boxShadow: mode === 'subjects' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <Layers size={13} /> Subjects
        </button>
        <button
          type="button"
          onClick={() => { setMode('syllabus'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'syllabus' ? '#fff' : 'transparent', color: mode === 'syllabus' ? '#1e3a8a' : '#475569', boxShadow: mode === 'syllabus' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <BookOpen size={13} /> Syllabus
        </button>
        <button
          type="button"
          onClick={() => { setMode('workload'); setStatus(''); }}
          style={{ padding: '7px 6px', borderRadius: 8, border: 'none', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: mode === 'workload' ? '#fff' : 'transparent', color: mode === 'workload' ? '#1e3a8a' : '#475569', boxShadow: mode === 'workload' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          <BarChart3 size={13} /> Periods
        </button>
      </div>

      {mode === 'subjects' && (
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
            <button type="button" onClick={handleDownloadSubjects} disabled={busy} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Download size={13} /> Excel
            </button>
            <button type="button" onClick={handleDownloadSubjectsPDF} disabled={busy} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <FileText size={13} /> PDF
            </button>
            <button type="button" onClick={handleCopySubjectsWA} disabled={busy} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Copy size={13} /> {copiedWA ? 'Copied!' : 'WhatsApp'}
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

      {mode === 'workload' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Teacher Periods & Workload Report</div>
            <button type="button" onClick={loadWorkloadData} disabled={wlLoading} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
            <select value={wlTeacherFilter} onChange={e => setWlTeacherFilter(e.target.value)} style={{ width: '100%', minWidth: 0, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="ALL">All Teachers</option>
              {workloadData.allTeachers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={wlClassFilter} onChange={e => setWlClassFilter(e.target.value)} style={{ width: '100%', minWidth: 0, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="ALL">All Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Export Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleExportWorkloadExcel} style={{ flex: 1, minWidth: 95, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Download size={13} /> Excel (.xlsx)
            </button>
            <button type="button" onClick={handleExportWorkloadPDF} style={{ flex: 1, minWidth: 95, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <FileText size={13} /> PDF Report
            </button>
            <button type="button" onClick={handleCopyWorkloadWA} style={{ flex: 1, minWidth: 105, padding: '8px 10px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Copy size={13} /> {copiedWA ? 'Copied!' : 'WhatsApp'}
            </button>
          </div>

          {/* Quick KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a' }}>{workloadData.list.length}</div>
              <div style={{ fontSize: 10.5, color: '#64748b' }}>Teachers</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f766e' }}>{workloadData.totalPeriods}</div>
              <div style={{ fontSize: 10.5, color: '#64748b' }}>Periods / Wk</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: workloadData.unassignedCount > 0 ? '#dc2626' : '#16a34a' }}>{workloadData.totalSubjects}</div>
              <div style={{ fontSize: 10.5, color: '#64748b' }}>Subjects</div>
            </div>
          </div>

          {/* Teacher Cards List */}
          {wlLoading ? (
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 12 }}>Loading workload...</div>
          ) : workloadData.list.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 12 }}>No assignments found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
              {workloadData.list.map(t => {
                const isOpen = expandedTeacher === t.teacher;
                return (
                  <div key={t.teacher} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedTeacher(isOpen ? null : t.teacher)}
                      style={{ width: '100%', padding: '9px 10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 5 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: t.teacher === 'Unassigned' ? '#dc2626' : '#0f172a' }}>
                          {t.teacher} {isOpen ? '▴' : '▾'}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, background: '#eef2ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                          {t.totalPeriods}p/wk • {t.totalSubjects} sub
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {Object.entries(t.classTotals).map(([c, v]) => (
                          <span key={c} style={{ fontSize: 10.5, fontWeight: 700, background: '#f1f5f9', color: '#334155', padding: '2px 7px', borderRadius: 6 }}>
                            {c}: {v.periods}p ({v.subjects})
                          </span>
                        ))}
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ borderTop: '1px solid #e2e8f0', padding: '6px 10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {t.items.map((it, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, gap: 6, padding: '3px 0', borderBottom: idx < t.items.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 800, color: '#2e44d2', marginRight: 6 }}>{it.class_name}</span>
                              <span style={{ color: '#0f172a', fontWeight: 600 }}>{it.subject_name}</span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                              {it.periods_raw}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {status && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e3a8a', background: '#eef2ff', padding: '6px 10px', borderRadius: 8 }}>{status}</div>}
    </div>
  );
}
