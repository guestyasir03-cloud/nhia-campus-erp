import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle,
  BookOpen, Calendar, ExternalLink, Trash2, Link2, Layers, Upload
} from 'lucide-react';
import { supabase } from '../lib/supabase';

function parseWeekRange(raw) {
  const txt = String(raw || '').trim();
  const nums = txt.match(/\d+/g);
  if (nums && nums.length >= 2 && /week/i.test(txt)) {
    return { week_no: Number(nums[0]), week_end: Number(nums[1]), week_label: txt };
  }
  if (nums && nums.length === 1 && /week/i.test(txt)) {
    return { week_no: Number(nums[0]), week_end: Number(nums[0]), week_label: txt };
  }
  return { week_no: 0, week_end: 0, week_label: txt || 'General' };
}

export default function SyllabusModule({ onBack, user }) {
  const isSyllabusAdminOnly = ['admin', 'super_admin'].includes(String(user?.role || '').toLowerCase());
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  const [viewMode, setViewMode] = useState('week'); // 'week' | 'full' | 'links'
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedWeek, setSelectedWeek] = useState(1);

  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Filters
  const [filterClass, setFilterClass] = useState(isStudent ? (user?.class_name || '') : 'ALL');
  const [filterSubject, setFilterSubject] = useState('ALL');
  const [onlyMySubjects, setOnlyMySubjects] = useState(isTeacher);

  // Forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    class_name: '', subject: '', week_no: 1, week_end: 1, topic: '', subtopics: '', resource_url: ''
  });

  // Excel Upload State
  const [showExcelBox, setShowExcelBox] = useState(false);
  const [uploadClass, setUploadClass] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [autoSyncSubjects, setAutoSyncSubjects] = useState(true);
  const [parsedRows, setParsedRows] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Link Form
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ class_name: '', subject: '', title: '', url: '' });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [
      { data: weekData },
      { data: linkData },
      { data: subAsg },
      { data: tchAsg },
      { data: stCls },
      { data: setRow }
    ] = await Promise.all([
      supabase.from('syllabus_weeks').select('*').order('week_no').order('class_name').order('subject'),
      supabase.from('syllabus_links').select('*').order('created_at', { ascending: false }),
      supabase.from('subject_assignments').select('class_name, subject_name, staff_name'),
      supabase.from('teacher_assignments').select('class_name, subject_name, staff_name'),
      supabase.from('students').select('class_name'),
      supabase.from('app_settings').select('value').eq('key', 'current_syllabus_week').maybeSingle()
    ]);

    setItems(weekData || []);
    setLinks(linkData || []);

    const activeWk = Math.max(1, parseInt(setRow?.value || '1', 10) || 1);
    setCurrentWeek(activeWk);
    setSelectedWeek(activeWk);
    setForm(f => ({ ...f, week_no: activeWk, week_end: activeWk }));

    const map = new Map();
    const pushAsg = (c, s, t) => {
      const cls = String(c || '').trim();
      const sub = String(s || '').trim();
      const tch = String(t || '').trim();
      if (!cls || !sub) return;
      const k = `${cls.toLowerCase()}|${sub.toLowerCase()}`;
      if (!map.has(k)) map.set(k, { class_name: cls, subject: sub, teacher_name: tch });
    };
    (subAsg || []).forEach(r => pushAsg(r.class_name, r.subject_name, r.staff_name));
    (tchAsg || []).forEach(r => pushAsg(r.class_name, r.subject_name, r.staff_name));
    setAssignments(Array.from(map.values()));

    if (stCls) {
      setAllClasses([...new Set(stCls.map(s => s.class_name).filter(Boolean))].sort());
    }

    if (isStudent && !user?.class_name) {
      let q = supabase.from('students').select('class_name').limit(1);
      if (user?.adm_no) q = q.eq('adm_no', user.adm_no);
      else if (user?.name) q = q.ilike('name', user.name);
      const { data: st } = await q.maybeSingle();
      if (st?.class_name) setFilterClass(st.class_name);
    }
    setLoading(false);
  }

  const mySubjectKeys = useMemo(() => {
    if (!isTeacher || !user?.name) return new Set();
    const me = user.name.toLowerCase().trim();
    const s = new Set();
    assignments.forEach(a => {
      if ((a.teacher_name || '').toLowerCase().includes(me)) {
        s.add(`${a.class_name.toLowerCase()}|${a.subject.toLowerCase()}`);
      }
    });
    return s;
  }, [assignments, isTeacher, user]);

  const availableSubjects = useMemo(() => {
    const s = new Set();
    assignments.forEach(a => {
      if (filterClass === 'ALL' || a.class_name === filterClass) s.add(a.subject);
    });
    items.forEach(i => {
      if (filterClass === 'ALL' || i.class_name === filterClass) s.add(i.subject);
    });
    return [...s].sort();
  }, [assignments, items, filterClass]);

  const filteredItems = useMemo(() => {
    return items.filter(it => {
      if (filterClass !== 'ALL' && filterClass && it.class_name !== filterClass) return false;
      if (filterSubject !== 'ALL' && it.subject !== filterSubject) return false;
      if (isTeacher && onlyMySubjects && mySubjectKeys.size > 0) {
        const clsL = it.class_name.toLowerCase();
        const subL = it.subject.toLowerCase();
        let matched = mySubjectKeys.has(`${clsL}|${subL}`);
        if (!matched) {
          for (const k of mySubjectKeys) {
            const [ac, asub] = k.split('|');
            if (ac === clsL && (subL.includes(asub) || asub.includes(subL))) { matched = true; break; }
          }
        }
        if (!matched) return false;
      }
      return true;
    });
  }, [items, filterClass, filterSubject, isTeacher, onlyMySubjects, mySubjectKeys]);

  // Match week ranges (e.g. Week 14 matches Weeks 13-14)
  const weekItems = useMemo(() => {
    const wk = Number(selectedWeek);
    return filteredItems.filter(it => {
      const start = Number(it.week_no) || 0;
      const end = Number(it.week_end) || start;
      return start > 0 && wk >= start && wk <= end;
    });
  }, [filteredItems, selectedWeek]);

  // Group full syllabus by Subject
  const groupedBySubject = useMemo(() => {
    const map = {};
    filteredItems.forEach(it => {
      const key = `${it.class_name} — ${it.subject}`;
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems]);

  const progress = useMemo(() => {
    const total = filteredItems.length;
    const done = filteredItems.filter(i => i.is_completed).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [filteredItems]);

  async function toggleComplete(item) {
    if (isStudent) return;
    const nextVal = !item.is_completed;
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, is_completed: nextVal } : x));
    await supabase
      .from('syllabus_weeks')
      .update({ is_completed: nextVal, completed_at: nextVal ? new Date().toISOString() : null })
      .eq('id', item.id);
  }

  async function updateCurrentWeek(newWk) {
    const wk = Math.max(1, Math.min(52, Number(newWk) || 1));
    setCurrentWeek(wk);
    setSelectedWeek(wk);
    await supabase.from('app_settings').upsert({ key: 'current_syllabus_week', value: String(wk) }, { onConflict: 'key' });
    setMsg(`Active Current Week set to Week ${wk}`);
  }

  function handleExcelFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const clean = [];
        json.forEach(row => {
          const subject = String(row.Subject || row.subject || '').trim();
          const topic = String(row.Topic || row.topic || '').trim();
          if (!subject || !topic) return;
          const wk = parseWeekRange(row.Weeks || row.Week || row.weeks || '');
          clean.push({
            subject,
            code: String(row.Code || row.code || '').trim(),
            textbook: String(row.Textbook || row.textbook || '').trim(),
            periods_per_week: String(row['Periods/week'] || row.Periods || '').trim(),
            week_no: wk.week_no,
            week_end: wk.week_end,
            week_label: wk.week_label,
            topic
          });
        });
        setParsedRows(clean);
        setMsg(`Loaded ${clean.length} topics from Excel. Select Class and click Upload.`);
      } catch (err) {
        setMsg('Excel read error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleBulkUpload() {
    if (!uploadClass) return setMsg('Please select a Class first.');
    if (parsedRows.length === 0) return setMsg('Please choose a valid Excel (.xlsx) file.');
    setUploading(true);

    if (replaceExisting) {
      await supabase.from('syllabus_weeks').delete().eq('class_name', uploadClass);
    }

    const payload = parsedRows.map(r => {
      const subL = r.subject.toLowerCase();
      const matchAsg = assignments.find(
        a => a.class_name === uploadClass && (subL.includes(a.subject.toLowerCase()) || a.subject.toLowerCase().includes(subL))
      );
      return {
        class_name: uploadClass,
        subject: r.subject,
        teacher_name: matchAsg?.teacher_name || '',
        code: r.code,
        textbook: r.textbook,
        periods_per_week: r.periods_per_week,
        week_no: r.week_no,
        week_end: r.week_end,
        week_label: r.week_label,
        topic: r.topic
      };
    });

    const { error } = await supabase.from('syllabus_weeks').insert(payload);
    if (error) { setUploading(false); return setMsg('Upload error: ' + error.message); }

    let syncedCount = 0;
    if (autoSyncSubjects) {
      const subMap = new Map();
      payload.forEach(r => {
        const subName = String(r.subject || '').trim();
        if (!subName) return;
        const key = `${uploadClass.toLowerCase()}|${subName.toLowerCase()}`;
        if (!subMap.has(key)) {
          subMap.set(key, {
            class_name: uploadClass,
            subject_name: subName,
            staff_id: null,
            staff_name: null,
            has_w1_w4: false,
            has_midterm: false,
            has_hifz: false
          });
        }
      });
      const subRows = Array.from(subMap.values());
      if (subRows.length > 0) {
        await supabase
          .from('subject_assignments')
          .upsert(subRows, { onConflict: 'class_name,subject_name', ignoreDuplicates: true });
        syncedCount = subRows.length;
      }
    }
    setUploading(false);

    setParsedRows([]);
    setShowExcelBox(false);
    setMsg(`Uploaded ${payload.length} syllabus topics for ${uploadClass}${syncedCount ? ` & synced ${syncedCount} subjects` : ''}!`);
    loadAll();
  }

  async function handleAddTopic(e) {
    e.preventDefault();
    if (!form.class_name.trim() || !form.subject.trim() || !form.topic.trim()) {
      return setMsg('Class, Subject, and Topic are required.');
    }
    const wStart = Math.max(1, Number(form.week_no) || 1);
    const wEnd = Math.max(wStart, Number(form.week_end) || wStart);
    const matchAsg = assignments.find(
      a => a.class_name === form.class_name && a.subject.toLowerCase() === form.subject.trim().toLowerCase()
    );
    const payload = {
      class_name: form.class_name.trim(),
      subject: form.subject.trim(),
      teacher_name: matchAsg?.teacher_name || (isTeacher ? (user?.name || '') : ''),
      week_no: wStart,
      week_end: wEnd,
      week_label: wStart === wEnd ? `Week ${wStart}` : `Weeks ${wStart}-${wEnd}`,
      topic: form.topic.trim(),
      subtopics: form.subtopics.trim(),
      resource_url: form.resource_url.trim()
    };
    const { data, error } = await supabase.from('syllabus_weeks').insert([payload]).select().single();
    if (error) return setMsg('Error: ' + error.message);
    setItems(prev => [...prev, data].sort((a, b) => a.week_no - b.week_no));
    setForm(f => ({ ...f, topic: '', subtopics: '', resource_url: '' }));
    setShowAddForm(false);
    setMsg(`Added ${data.week_label} topic for ${data.class_name} - ${data.subject}`);
  }

  function handleExportSyllabusExcel() {
    const source = filterClass && filterClass !== 'ALL'
      ? items.filter(x => x.class_name === filterClass)
      : items;
    if (!source || source.length === 0) {
      return setMsg('No syllabus items to export.');
    }
    const rows = source.map(r => ({
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
    const tag = filterClass && filterClass !== 'ALL' ? filterClass.replace(/[^a-zA-Z0-9_-]/g, '_') : 'All_Classes';
    XLSX.writeFile(wb, `Syllabus_${tag}.xlsx`);
    setMsg(`Exported ${rows.length} syllabus topics (${tag}).`);
  }

  function handleDownloadTemplate() {
    const sample = [
      {
        Subject: 'Malayalam (മലയാളം)',
        Code: 'S121',
        Textbook: 'മലയാളം, കേരള പാഠാവലി',
        'Periods/week': '3',
        Weeks: 'Weeks 1-2',
        Topic: 'Chapter 1: Sample Topic'
      },
      {
        Subject: 'Mathematics',
        Code: 'S133',
        Textbook: 'Mathematics Text',
        'Periods/week': '6',
        Weeks: 'Weeks 3-4',
        Topic: 'Practical Geometry'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Syllabus_Template');
    XLSX.writeFile(wb, 'Syllabus_Upload_Template.xlsx');
  }

  async function handleBulkDelete(targetClass) {
    const isAll = !targetClass || targetClass === 'ALL';
    const label = isAll ? 'ALL CLASSES (Full Syllabus)' : `Class ${targetClass}`;
    if (!window.confirm(`⚠️ Are you sure you want to DELETE all syllabus topics for ${label}? This cannot be undone.`)) return;

    let q = supabase.from('syllabus_weeks').delete();
    if (isAll) q = q.neq('id', 0);
    else q = q.eq('class_name', targetClass);

    const { error } = await q;
    if (error) return setMsg('Delete error: ' + error.message);

    setItems(prev => isAll ? [] : prev.filter(x => x.class_name !== targetClass));
    setMsg(`Deleted all syllabus topics for ${label}.`);
  }

  async function handleDeleteTopic(id) {
    if (!window.confirm('Delete this syllabus topic?')) return;
    setItems(prev => prev.filter(x => x.id !== id));
    await supabase.from('syllabus_weeks').delete().eq('id', id);
  }

  async function handleAddLink(e) {
    e.preventDefault();
    if (!linkForm.class_name || !linkForm.subject || !linkForm.title || !linkForm.url) return;
    const { data, error } = await supabase.from('syllabus_links').insert([linkForm]).select().single();
    if (error) return setMsg('Error: ' + error.message);
    setLinks(prev => [data, ...prev]);
    setLinkForm({ class_name: '', subject: '', title: '', url: '' });
    setShowLinkForm(false);
    setMsg('Syllabus link added!');
  }

  async function handleDeleteLink(id) {
    setLinks(prev => prev.filter(x => x.id !== id));
    await supabase.from('syllabus_links').delete().eq('id', id);
  }

  const filteredLinks = useMemo(() => {
    if (filterClass === 'ALL' || !filterClass) return links;
    return links.filter(l => l.class_name === filterClass);
  }, [links, filterClass]);

  const renderTopicCard = (item) => (
    <div
      key={item.id}
      style={{
        background: '#fff', padding: 12, borderRadius: 12,
        border: item.is_completed ? '1.5px solid #bbf7d0' : '1px solid #e2e8f0',
        display: 'flex', gap: 10, alignItems: 'flex-start'
      }}
    >
      {!isStudent && (
        <button type="button" onClick={() => toggleComplete(item)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', marginTop: 2 }}>
          {item.is_completed ? <CheckCircle2 size={20} color="#16a34a" /> : <Circle size={20} color="#cbd5e1" />}
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, background: '#eef2ff', color: '#2e44d2', padding: '2px 7px', borderRadius: 6 }}>{item.class_name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>{item.subject}</span>
            {item.code && <span style={{ fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 6 }}>{item.code}</span>}
            {item.week_label && <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 6 }}>{item.week_label}</span>}
          </div>
          {isAdmin && (
            <button onClick={() => handleDeleteTopic(item.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {(item.textbook || item.periods_per_week || item.teacher_name) && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {item.textbook && <span>📖 {item.textbook}</span>}
            {item.periods_per_week && <span>⏱️ {item.periods_per_week}</span>}
            {item.teacher_name && <span>👤 {item.teacher_name}</span>}
          </div>
        )}

        <div style={{ fontSize: 13.5, fontWeight: 700, color: item.is_completed ? '#166534' : '#1e293b', marginTop: 6, textDecoration: item.is_completed ? 'line-through' : 'none', lineHeight: 1.5 }}>
          {item.topic}
        </div>
        {item.subtopics && <div style={{ fontSize: 12, color: '#475569', marginTop: 3, whiteSpace: 'pre-line' }}>{item.subtopics}</div>}
        {item.resource_url && (
          <a href={item.resource_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#2563eb', marginTop: 6, textDecoration: 'none' }}>
            <ExternalLink size={12} /> Open Resource
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 14, maxWidth: 740, margin: '0 auto', paddingBottom: 90, boxSizing: 'border-box' }}>
      {/* Syllabus Excel Upload / Export / Delete Tools */}
      {isSyllabusAdminOnly && (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>Syllabus Excel & Class Tools</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleDownloadTemplate} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              📥 Template (.xlsx)
            </button>
            <button type="button" onClick={handleExportSyllabusExcel} style={{ padding: '5px 9px', borderRadius: 7, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              📤 Export (.xlsx)
            </button>
            <button type="button" onClick={() => handleBulkDelete(uploadClass || filterClass)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              🗑️ Delete {uploadClass || (filterClass !== 'ALL' ? filterClass : 'All')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={uploadClass} onChange={e => setUploadClass(e.target.value)} style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
            <option value="">Select Class for Excel (e.g. S1, D1)</option>
            {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} style={{ fontSize: 11.5, maxWidth: '100%' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoSyncSubjects} onChange={e => setAutoSyncSubjects(e.target.checked)} />
              Auto-add subjects to Staff Assignments (CCE/Midterm OFF)
            </label>
            <label style={{ fontSize: 11.5, color: '#334155', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
              Replace existing syllabus for selected class
            </label>
          </div>
          {parsedRows.length > 0 && (
            <button type="button" onClick={handleBulkUpload} disabled={uploading} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : `⬆️ Upload ${parsedRows.length} Topics`}
            </button>
          )}
        </div>
      </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Syllabus Tracker</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>Active Week: <b>Week {currentWeek}</b> • {progress.done}/{progress.total} Completed ({progress.pct}%)</div>
          </div>
        </div>
        {(isAdmin || isTeacher) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {isAdmin && (
              <button onClick={() => { setShowExcelBox(v => !v); setShowAddForm(false); }} style={{ padding: '8px 11px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Upload size={14} /> Excel
              </button>
            )}
            <button onClick={() => viewMode === 'links' ? setShowLinkForm(v => !v) : (setShowAddForm(v => !v), setShowExcelBox(false))} style={{ padding: '8px 11px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={14} /> {viewMode === 'links' ? 'Link' : 'Topic'}
            </button>
          </div>
        )}
      </div>

      {/* Mode Switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
        <button onClick={() => setViewMode('week')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: viewMode === 'week' ? '#2e44d2' : 'transparent', color: viewMode === 'week' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Calendar size={13} /> Week View
        </button>
        <button onClick={() => setViewMode('full')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: viewMode === 'full' ? '#2e44d2' : 'transparent', color: viewMode === 'full' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Layers size={13} /> Full Syllabus
        </button>
        <button onClick={() => setViewMode('links')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: viewMode === 'links' ? '#2e44d2' : 'transparent', color: viewMode === 'links' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Link2 size={13} /> PDF ({filteredLinks.length})
        </button>
      </div>

      {msg && <div style={{ padding: '9px 12px', borderRadius: 10, background: '#eef2ff', color: '#1e3a8a', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{msg}</div>}

      {/* Direct Excel Bulk Upload Box */}
      {showExcelBox && isAdmin && (
        <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1.5px solid #86efac', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534' }}>Bulk Upload Syllabus Excel (.xlsx)</div>
            <button type="button" onClick={handleDownloadTemplate} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              📥 Download Template (.xlsx)
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: '#475569' }}>Supports columns: <b>Subject, Code, Textbook, Periods/week, Weeks, Topic</b></div>
          <select value={uploadClass} onChange={e => setUploadClass(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#fff' }}>
            <option value="">-- Select Class --</option>
            {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} style={{ fontSize: 12 }} />
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
            Replace existing syllabus for this class
          </label>
            <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}><input type="checkbox" checked={autoSyncSubjects} onChange={e => setAutoSyncSubjects(e.target.checked)} /> Auto-add subjects to Staff Assignments (CCE/Midterm OFF)</label>
          {parsedRows.length > 0 && (
            <button onClick={handleBulkUpload} disabled={uploading} style={{ padding: 10, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : `Upload ${parsedRows.length} Topics to ${uploadClass || 'Class'}`}
            </button>
          )}
        </div>
      )}

      {/* Filters & Current Week Selector */}
      <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isStudent ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          {!isStudent && (
            <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSubject('ALL'); }} style={{ width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="ALL">All Classes</option>
              {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} style={{ width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
            <option value="ALL">All Subjects</option>
            {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {isTeacher && (
            <label style={{ fontSize: 12, fontWeight: 700, color: '#2e44d2', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyMySubjects} onChange={e => setOnlyMySubjects(e.target.checked)} />
              Show Only My Subjects
            </label>
          )}
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
              <span>Set Current Week:</span>
              <select value={currentWeek} onChange={e => updateCurrentWeek(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff', fontWeight: 700 }}>
                {Array.from({ length: 40 }, (_, i) => i + 1).map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              </div>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkDelete(filterClass)}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Trash2 size={12} /> {filterClass === 'ALL' ? 'Delete All Syllabus' : `Delete ${filterClass} Syllabus`}
                </button>
              )}
            </div>
          )}
        </div>
        {viewMode !== 'links' && (
          <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${progress.pct}%`, height: '100%', background: '#16a34a', transition: 'width 0.25s ease' }} />
          </div>
        )}
      </div>

      {/* Add Single Topic Form */}
      {showAddForm && (isAdmin || isTeacher) && (
        <form onSubmit={handleAddTopic} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1.5px solid #c7d2fe', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Add Syllabus Topic</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
              <option value="">Class</option>
              {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input list="syl-sub-list" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Subject" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <datalist id="syl-sub-list">{availableSubjects.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input type="number" min={1} max={52} value={form.week_no} onChange={e => setForm({ ...form, week_no: e.target.value })} placeholder="From Week" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input type="number" min={1} max={52} value={form.week_end} onChange={e => setForm({ ...form, week_end: e.target.value })} placeholder="To Week" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
          </div>
          <input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Main Topic / Chapter" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
          <textarea rows={2} value={form.subtopics} onChange={e => setForm({ ...form, subtopics: e.target.value })} placeholder="Subtopics (Optional)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontFamily: 'inherit' }} />
          <input value={form.resource_url} onChange={e => setForm({ ...form, resource_url: e.target.value })} placeholder="Resource / PDF Link (Optional)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
          <button type="submit" style={{ padding: 10, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Save Topic</button>
        </form>
      )}

      {/* VIEW 1: WEEK VIEW */}
      {viewMode === 'week' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#2e44d2', color: '#fff', padding: '10px 14px', borderRadius: 14 }}>
            <button onClick={() => setSelectedWeek(w => Math.max(1, w - 1))} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={16} /></button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                Week {selectedWeek} {selectedWeek === currentWeek && <span style={{ fontSize: 10, background: '#22c55e', padding: '2px 7px', borderRadius: 99, marginLeft: 4 }}>Current</span>}
              </div>
              {selectedWeek !== currentWeek && (
                <button onClick={() => setSelectedWeek(currentWeek)} style={{ background: 'none', border: 'none', color: '#bfdbfe', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', marginTop: 2 }}>
                  Jump to Current Week ({currentWeek})
                </button>
              )}
            </div>
            <button onClick={() => setSelectedWeek(w => Math.min(52, w + 1))} style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={16} /></button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#64748b', fontSize: 13 }}>Loading syllabus...</div>
          ) : weekItems.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No topics for <b>Week {selectedWeek}</b> yet.
            </div>
          ) : weekItems.map(renderTopicCard)}
        </div>
      )}

      {/* VIEW 2: FULL SYLLABUS (GROUPED BY SUBJECT) */}
      {viewMode === 'full' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groupedBySubject.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>No syllabus topics added yet.</div>
          ) : groupedBySubject.map(([title, list]) => {
            const doneCount = list.filter(i => i.is_completed).length;
            return (
              <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#2e44d2', background: '#eef2ff', padding: '7px 12px', borderRadius: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BookOpen size={14} /> {title}</span>
                  <span style={{ fontSize: 11, color: '#166534' }}>{doneCount}/{list.length} Done</span>
                </div>
                {list.map(renderTopicCard)}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 3: PDF LINKS */}
      {viewMode === 'links' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showLinkForm && (isAdmin || isTeacher) && (
            <form onSubmit={handleAddLink} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={linkForm.class_name} onChange={e => setLinkForm({ ...linkForm, class_name: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="">Select Class</option>
                {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={linkForm.subject} onChange={e => setLinkForm({ ...linkForm, subject: e.target.value })} placeholder="Subject" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input value={linkForm.title} onChange={e => setLinkForm({ ...linkForm, title: e.target.value })} placeholder="Title" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="Google Drive / PDF Link" style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <button type="submit" style={{ padding: 9, borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save Link</button>
            </form>
          )}
          {filteredLinks.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>No syllabus PDF links added yet.</div>
          ) : filteredLinks.map(l => (
            <div key={l.id} style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2e44d2' }}>{l.class_name} • {l.subject}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{l.title}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ padding: '6px 10px', borderRadius: 8, background: '#eef2ff', color: '#2e44d2', fontSize: 11.5, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}><ExternalLink size={12} /> Open</a>
                {isAdmin && <button onClick={() => handleDeleteLink(l.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
