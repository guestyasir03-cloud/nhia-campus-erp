import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, Star, ShieldCheck, Trash2, Copy, Download,
  FileSpreadsheet, Printer, Search, Users, Award, CheckCircle2, Plus
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const EMOJI_RATINGS = [
  { val: 1, emoji: '😡', label: 'Very Poor', color: '#dc2626' },
  { val: 2, emoji: '😕', label: 'Poor', color: '#ea580c' },
  { val: 3, emoji: '😐', label: 'Average', color: '#d97706' },
  { val: 4, emoji: '🙂', label: 'Good', color: '#16a34a' },
  { val: 5, emoji: '🤩', label: 'Excellent', color: '#2563eb' }
];

const QUICK_LIKED_TAGS = ['Clear Explanation', 'Friendly', 'Well Prepared', 'Good Examples', 'Interactive'];
const QUICK_IMPROVE_TAGS = ['Too Fast', 'Needs More Examples', 'Voice Clarity', 'More Revision'];

async function hashToken(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getBrowserToken() {
  try {
    let t = localStorage.getItem('nhia_fb_token');
    if (!t) {
      t = Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem('nhia_fb_token', t);
    }
    return t;
  } catch {
    return 'fb_' + Date.now();
  }
}

export default function FeedbackModule({ onBack, user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const [tab, setTab] = useState(isAdmin || isTeacher ? 'reports' : 'submit');

  const [config, setConfig] = useState([]);
  const [responses, setResponses] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [classCounts, setClassCounts] = useState({});
  const [allStaff, setAllStaff] = useState([]);
  const [syllabusSubjects, setSyllabusSubjects] = useState([]);
  const [settings, setSettings] = useState({ accessCode: '', cycle: 'Term 1', isOpen: true });
  const [msg, setMsg] = useState('');

  // Submit form state
  const [studentClass, setStudentClass] = useState(isStudent ? (user?.class_name || '') : '');
  const [selClass, setSelClass] = useState(isStudent ? (user?.class_name || '') : '');
  const [enteredCode, setEnteredCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [revealName, setRevealName] = useState(false);
  const [studentName, setStudentName] = useState(isStudent ? (user?.name || '') : '');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Admin config form state
  const [cfgClass, setCfgClass] = useState('');
  const [cfgSubject, setCfgSubject] = useState('');
  const [cfgTeacher, setCfgTeacher] = useState('');
  const [setupFilterClass, setSetupFilterClass] = useState('ALL');
  const [fbRatingFilter, setFbRatingFilter] = useState('ALL');
  const [fbSortBy, setFbSortBy] = useState('newest');

  // Report filters
  const [filterCycle, setFilterCycle] = useState('ACTIVE');
  const [filterTeacher, setFilterTeacher] = useState('ALL');
  const [filterClass, setFilterClass] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [
      { data: cfgData },
      { data: subAsgData },
      { data: tchAsgData },
      { data: setData },
      { data: stClsData },
      { data: staffData },
      { data: sylData },
      { data: respData }
    ] = await Promise.all([
      supabase.from('feedback_config').select('*').order('class_name').order('subject'),
      supabase.from('subject_assignments').select('*'),
      supabase.from('teacher_assignments').select('*'),
      supabase.from('app_settings').select('key, value').in('key', ['fb_access_code', 'fb_cycle', 'fb_open']),
      isAdmin ? supabase.from('students').select('class_name') : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('staff').select('name').order('name') : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('syllabus_links').select('subject') : Promise.resolve({ data: [] }),
      isAdmin || isTeacher
        ? supabase.from('feedback_responses').select('*').order('created_at', { ascending: false })
        : Promise.resolve({ data: [] })
    ]);

    // Auto-merge existing subject_assignments + teacher_assignments + custom feedback_config
    const mergedMap = new Map();
    const addMapping = (cls, sub, tch, id, isCustom) => {
      const c = String(cls || '').trim();
      const s = String(sub || '').trim();
      const t = String(tch || '').trim();
      if (!c || !s || !t) return;
      const key = `${c.toLowerCase()}|${s.toLowerCase()}|${t.toLowerCase()}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { id, class_name: c, subject: s, teacher_name: t, isCustom });
      }
    };
    (subAsgData || []).forEach(r => addMapping(r.class_name, r.subject_name || r.subject, r.staff_name || r.teacher_name, 'sa_' + r.id, false));
    (tchAsgData || []).forEach(r => addMapping(r.class_name, r.subject_name || r.subject, r.staff_name || r.teacher_name, 'ta_' + r.id, false));
    (cfgData || []).forEach(r => addMapping(r.class_name, r.subject, r.teacher_name, r.id, true));

    const mergedConfig = Array.from(mergedMap.values()).sort((a, b) =>
      a.class_name.localeCompare(b.class_name) || a.subject.localeCompare(b.subject)
    );
    setConfig(mergedConfig);
    setResponses(respData || []);

    if (stClsData) {
      const counts = {};
      stClsData.forEach(s => {
        if (s.class_name) counts[s.class_name] = (counts[s.class_name] || 0) + 1;
      });
      setClassCounts(counts);
      setAllClasses(Object.keys(counts).sort());
    }
    if (staffData) setAllStaff(staffData.map(s => s.name).filter(Boolean));
    if (sylData) setSyllabusSubjects([...new Set(sylData.map(s => s.subject).filter(Boolean))].sort());

    const sObj = { accessCode: '', cycle: 'Term 1', isOpen: true };
    (setData || []).forEach(r => {
      if (r.key === 'fb_access_code') sObj.accessCode = r.value || '';
      if (r.key === 'fb_cycle' && r.value) sObj.cycle = r.value;
      if (r.key === 'fb_open') sObj.isOpen = r.value !== 'false';
    });
    setSettings(sObj);
    if (!sObj.accessCode) setCodeVerified(true);

    if (isStudent && !user?.class_name) {
      let q = supabase.from('students').select('class_name').limit(1);
      if (user?.adm_no) q = q.eq('adm_no', user.adm_no);
      else if (user?.name) q = q.ilike('name', user.name);
      const { data: stRow } = await q.maybeSingle();
      if (stRow?.class_name) {
        setStudentClass(stRow.class_name);
        setSelClass(stRow.class_name);
      }
    }
  }

  const classes = useMemo(() => [...new Set(config.map(c => c.class_name))].sort(), [config]);
  const classSubjects = useMemo(() => config.filter(c => c.class_name === selClass), [config, selClass]);

  const completedCount = useMemo(() => {
    return classSubjects.filter(item => {
      const a = answers[`${item.subject}|${item.teacher_name}`];
      return a && (a.rating || a.liked?.trim() || a.improve?.trim() || a.other?.trim());
    }).length;
  }, [classSubjects, answers]);

  function updateAnswer(key, field, val) {
    setAnswers(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: val } }));
  }

  function toggleTag(key, field, tag) {
    const current = (answers[key]?.[field] || '').trim();
    const parts = current ? current.split(', ').filter(Boolean) : [];
    const next = parts.includes(tag) ? parts.filter(p => p !== tag) : [...parts, tag];
    updateAnswer(key, field, next.join(', '));
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault();
    setMsg('');
    if (!settings.isOpen) return setMsg('Feedback submission is currently closed.');
    if (settings.accessCode && enteredCode.trim() !== settings.accessCode) {
      return setMsg('Access code is incorrect.');
    }
    if (!selClass) return setMsg('Please select a class.');
    if (revealName && !studentName.trim()) return setMsg('Enter your name or choose Anonymous.');

    setSubmitting(true);
    const tokHash = await hashToken(getBrowserToken() + '|' + selClass + '|' + settings.cycle);

    const { data: existing } = await supabase
      .from('feedback_responses')
      .select('subject')
      .eq('cycle_name', settings.cycle)
      .eq('class_name', selClass)
      .eq('token_hash', tokHash);

    const doneSubjects = new Set((existing || []).map(x => x.subject));
    const idText = revealName && studentName.trim() ? studentName.trim().slice(0, 60) : 'Anonymous';

    const rows = [];
    let skipped = 0;
    classSubjects.forEach(item => {
      const k = `${item.subject}|${item.teacher_name}`;
      const a = answers[k] || {};
      const rating = a.rating ? Number(a.rating) : null;
      const liked = (a.liked || '').trim().slice(0, 1000);
      const improve = (a.improve || '').trim().slice(0, 1000);
      const other = (a.other || '').trim().slice(0, 1000);
      if (!rating && !liked && !improve && !other) return;
      if (doneSubjects.has(item.subject)) { skipped++; return; }
      rows.push({
        cycle_name: settings.cycle,
        class_name: selClass,
        subject: item.subject,
        teacher_name: item.teacher_name,
        rating,
        liked,
        improve,
        other,
        identity: idText,
        token_hash: tokHash
      });
    });

    if (rows.length === 0) {
      setSubmitting(false);
      return setMsg(skipped > 0
        ? 'You already submitted feedback for these subjects in this cycle.'
        : 'Please rate or comment on at least one subject.');
    }

    const { error } = await supabase.from('feedback_responses').insert(rows);
    setSubmitting(false);
    if (error) return setMsg('Error: ' + error.message);

    setAnswers({});
    setMsg(`Thank you! Feedback saved for ${rows.length} subject(s).` + (skipped ? ` (${skipped} already submitted)` : ''));
    if (isAdmin || isTeacher) loadAll();
  }

  async function handleAddConfig(e) {
    e.preventDefault();
    if (!cfgClass.trim() || !cfgSubject.trim() || !cfgTeacher.trim()) {
      return setMsg('Please select Class, Subject, and Teacher.');
    }
    const { data, error } = await supabase
      .from('feedback_config')
      .insert([{ class_name: cfgClass.trim(), subject: cfgSubject.trim(), teacher_name: cfgTeacher.trim() }])
      .select()
      .single();
    if (error) return setMsg('Error: ' + error.message);
    setConfig(prev => [...prev, data]);
    setCfgSubject('');
    setCfgTeacher('');
    setMsg(`Added ${data.subject} (${data.teacher_name}) to ${data.class_name}`);
  }

  async function handleDeleteConfig(id) {
    setConfig(prev => prev.filter(c => c.id !== id));
    await supabase.from('feedback_config').delete().eq('id', id);
  }

  async function saveSettings() {
    const upserts = [
      { key: 'fb_access_code', value: settings.accessCode.trim() },
      { key: 'fb_cycle', value: settings.cycle.trim() || 'Term 1' },
      { key: 'fb_open', value: String(settings.isOpen) }
    ];
    const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' });
    setMsg(error ? 'Error: ' + error.message : 'Feedback settings saved!');
  }

  async function handleDeleteResponse(id) {
    if (!window.confirm('Delete this feedback entry?')) return;
    setResponses(prev => prev.filter(r => r.id !== id));
    await supabase.from('feedback_responses').delete().eq('id', id);
  }

  const cyclesList = useMemo(() => {
    const s = new Set(responses.map(r => r.cycle_name).filter(Boolean));
    s.add(settings.cycle);
    return [...s];
  }, [responses, settings.cycle]);

  const activeCycleName = filterCycle === 'ACTIVE' ? settings.cycle : filterCycle;

  const visibleResponses = useMemo(() => {
    let list = responses;
    if (activeCycleName !== 'ALL') list = list.filter(r => r.cycle_name === activeCycleName);
    if (isTeacher && !isAdmin) {
      const myName = (user?.name || '').toLowerCase();
      list = list.filter(r => (r.teacher_name || '').toLowerCase().includes(myName));
    } else {
      if (filterTeacher !== 'ALL') list = list.filter(r => r.teacher_name === filterTeacher);
      if (filterClass !== 'ALL') list = list.filter(r => r.class_name === filterClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        (r.teacher_name || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q) ||
        (r.class_name || '').toLowerCase().includes(q) ||
        (r.liked || '').toLowerCase().includes(q) ||
        (r.improve || '').toLowerCase().includes(q) ||
        (r.other || '').toLowerCase().includes(q) ||
        (r.identity || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [responses, activeCycleName, isTeacher, isAdmin, user, filterTeacher, filterClass, searchQuery]);

  // Class-wise unique student participation
  const participationByClass = useMemo(() => {
    const map = {};
    responses
      .filter(r => activeCycleName === 'ALL' || r.cycle_name === activeCycleName)
      .forEach(r => {
        if (!map[r.class_name]) map[r.class_name] = new Set();
        map[r.class_name].add(r.token_hash);
      });
    return allClasses.map(cls => {
      const submitted = map[cls]?.size || 0;
      const total = classCounts[cls] || 0;
      const pct = total ? Math.min(100, Math.round((submitted / total) * 100)) : 0;
      return { cls, submitted, total, pct };
    });
  }, [responses, activeCycleName, allClasses, classCounts]);

  const summaryByTeacher = useMemo(() => {
    const map = {};
    visibleResponses.forEach(r => {
      const k = `${r.teacher_name}|${r.class_name}|${r.subject}`;
      if (!map[k]) map[k] = { teacher: r.teacher_name, cls: r.class_name, subject: r.subject, sum: 0, rated: 0, total: 0 };
      map[k].total++;
      if (r.rating) { map[k].sum += r.rating; map[k].rated++; }
    });
    return Object.values(map).sort((a, b) => (b.rated ? b.sum / b.rated : 0) - (a.rated ? a.sum / a.rated : 0));
  }, [visibleResponses]);

  const analytics = useMemo(() => {
    const rated = visibleResponses.filter(r => r.rating);
    const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2) : '—';
    const dist = [5, 4, 3, 2, 1].map(star => ({
      star,
      count: rated.filter(r => r.rating === star).length
    }));
    const uniqueStudents = new Set(visibleResponses.map(r => r.token_hash)).size;
    return { total: visibleResponses.length, avg, ratedCount: rated.length, uniqueStudents, dist };
  }, [visibleResponses]);

  const teachersList = useMemo(() => [...new Set(responses.map(r => r.teacher_name))].sort(), [responses]);

  function exportCSV() {
    const headers = ['Date', 'Cycle', 'Class', 'Subject', 'Teacher', 'Rating', 'Liked', 'Improve', 'Other', 'Identity'];
    const rows = visibleResponses.map(r => [
      new Date(r.created_at).toLocaleDateString('en-IN'), r.cycle_name, r.class_name, r.subject,
      r.teacher_name, r.rating || '', r.liked || '', r.improve || '', r.other || '', r.identity || 'Anonymous'
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Feedback_Report_${activeCycleName}.csv`;
    a.click();
  }

  function exportExcel() {
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const summaryRows = summaryByTeacher.map(s => `
      <tr>
        <td>${esc(s.teacher)}</td><td>${esc(s.cls)}</td><td>${esc(s.subject)}</td>
        <td>${s.rated ? (s.sum / s.rated).toFixed(2) : '-'}</td><td>${s.total}</td>
      </tr>`).join('');
    const detailRows = visibleResponses.map(r => `
      <tr>
        <td>${esc(new Date(r.created_at).toLocaleDateString('en-IN'))}</td>
        <td>${esc(r.cycle_name)}</td><td>${esc(r.class_name)}</td><td>${esc(r.subject)}</td>
        <td>${esc(r.teacher_name)}</td><td>${esc(r.rating || '')}</td>
        <td>${esc(r.liked)}</td><td>${esc(r.improve)}</td><td>${esc(r.other)}</td><td>${esc(r.identity || 'Anonymous')}</td>
      </tr>`).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="UTF-8"></head><body>
      <h3>NHIA Feedback Summary (${esc(activeCycleName)})</h3>
      <table border="1">
        <tr style="background:#dbeafe;font-weight:bold"><th>Teacher</th><th>Class</th><th>Subject</th><th>Avg Rating</th><th>Total Responses</th></tr>
        ${summaryRows}
      </table><br/>
      <h3>Detailed Feedback Responses</h3>
      <table border="1">
        <tr style="background:#fef3c7;font-weight:bold"><th>Date</th><th>Cycle</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Rating</th><th>Liked</th><th>Improve</th><th>Other</th><th>Identity</th></tr>
        ${detailRows}
      </table></body></html>`;
    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NHIA_Feedback_Full_Report_${activeCycleName}.xls`;
    a.click();
  }

  function printPDFReport() {
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const w = window.open('', '_blank');
    if (!w) return setMsg('Popup blocked. Please allow popups to print PDF.');
    w.document.write(`<html><head><meta charset="UTF-8"><title>Feedback Report - ${esc(activeCycleName)}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#0f172a}h2,h3{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#f1f5f9}</style>
      </head><body>
      <h2>Noorul Hidaya Islamic Academy — Feedback Report (${esc(activeCycleName)})</h2>
      <p style="font-size:12px;color:#475569">Responses: <b>${analytics.total}</b> | Students Participated: <b>${analytics.uniqueStudents}</b> | Overall Avg: <b>${analytics.avg}/5</b></p>
      <h3>Teacher & Subject Ranking</h3>
      <table><tr><th>Teacher</th><th>Class</th><th>Subject</th><th>Avg Rating</th><th>Responses</th></tr>
      ${summaryByTeacher.map(s => `<tr><td>${esc(s.teacher)}</td><td>${esc(s.cls)}</td><td>${esc(s.subject)}</td><td><b>${s.rated ? (s.sum / s.rated).toFixed(2) : '-'}</b></td><td>${s.total}</td></tr>`).join('')}
      </table>
      <h3>Detailed Comments</h3>
      <table><tr><th>Class</th><th>Subject</th><th>Teacher</th><th>Rating</th><th>Liked</th><th>Improve</th><th>Other</th><th>By</th></tr>
      ${visibleResponses.map(r => `<tr><td>${esc(r.class_name)}</td><td>${esc(r.subject)}</td><td>${esc(r.teacher_name)}</td><td>${esc(r.rating || '-')}</td><td>${esc(r.liked)}</td><td>${esc(r.improve)}</td><td>${esc(r.other)}</td><td>${esc(r.identity || 'Anonymous')}</td></tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  function copyWhatsAppSummary() {
    const lines = summaryByTeacher.map((s, i) =>
      `${i + 1}. *${s.teacher}* (${s.cls} - ${s.subject}): ⭐ ${s.rated ? (s.sum / s.rated).toFixed(1) : '—'}/5 (${s.total} responses)`
    );
    const text = `📊 *FEEDBACK SUMMARY (${activeCycleName})*\nOverall Avg: ⭐ ${analytics.avg}/5 | Responses: ${analytics.total}\n\n${lines.join('\n') || 'No feedback yet.'}`;
    navigator.clipboard.writeText(text);
    setMsg('WhatsApp summary copied!');
  }

  const filteredConfig = useMemo(() => {
    if (setupFilterClass === 'ALL') return config;
    return config.filter(c => c.class_name === setupFilterClass);
  }, [config, setupFilterClass]);

  return (
    <div style={{ padding: 14, maxWidth: 740, margin: '0 auto', paddingBottom: 90, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Student Feedback</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Cycle: <b>{settings.cycle}</b> •{' '}
              <span style={{ color: settings.isOpen ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                {settings.isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
        <button onClick={() => setTab('submit')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'submit' ? '#2e44d2' : 'transparent', color: tab === 'submit' ? '#fff' : '#475569' }}>
          Submit
        </button>
        {(isAdmin || isTeacher) && (
          <button onClick={() => setTab('reports')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'reports' ? '#2e44d2' : 'transparent', color: tab === 'reports' ? '#fff' : '#475569' }}>
            {isAdmin ? 'Reports & Excel' : 'My Feedback'}
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setTab('setup')} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: tab === 'setup' ? '#2e44d2' : 'transparent', color: tab === 'setup' ? '#fff' : '#475569' }}>
            Setup ({config.length})
          </button>
        )}
      </div>

      {msg && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eef2ff', color: '#1e3a8a', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* TAB 1: ATTRACTIVE STUDENT SUBMIT FLOW */}
      {tab === 'submit' && (
        <form onSubmit={handleSubmitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!settings.isOpen && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: 14, borderRadius: 14, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
              Feedback portal is currently closed by Admin.
            </div>
          )}

          {/* Top Identity & Class Card */}
          <div style={{ background: 'linear-gradient(135deg, #2e44d2 0%, #4338ca 100%)', padding: 16, borderRadius: 16, color: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: 'rgba(255,255,255,0.14)', padding: '8px 10px', borderRadius: 10 }}>
              <ShieldCheck size={16} />
              <span>Anonymous select cheythaal teachers-inu ningale thirichariyaan kazhiyilla.</span>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>Your Class</label>
              {isStudent && studentClass ? (
                <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: 14, marginTop: 4, background: 'rgba(255,255,255,0.18)', fontWeight: 800 }}>
                  {studentClass}
                </div>
              ) : (
                <select value={selClass} onChange={e => { setSelClass(e.target.value); setAnswers({}); }} style={{ width: '100%', padding: 10, borderRadius: 10, border: 'none', fontSize: 13, marginTop: 4, background: '#fff', color: '#0f172a', fontWeight: 700 }}>
                  <option value="">-- Select Class --</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            {settings.accessCode && !codeVerified && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="password" value={enteredCode} onChange={e => setEnteredCode(e.target.value)} placeholder="Enter Access Code" style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', fontSize: 13 }} />
                <button type="button" onClick={() => enteredCode.trim() === settings.accessCode ? setCodeVerified(true) : setMsg('Wrong access code')} style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Verify</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={!revealName} onChange={() => setRevealName(false)} /> Anonymous
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={revealName} onChange={() => setRevealName(true)} /> Show my name
              </label>
            </div>

            {revealName && (
              <input type="text" value={studentName} onChange={e => setStudentName(e.target.value)} maxLength={60} placeholder="Enter your name" style={{ padding: 10, borderRadius: 10, border: 'none', fontSize: 13, color: '#0f172a' }} />
            )}
          </div>

          {/* Progress Bar */}
          {selClass && codeVerified && classSubjects.length > 0 && (
            <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                <span>Feedback Progress</span>
                <span style={{ color: '#2e44d2' }}>{completedCount} / {classSubjects.length} Subjects</span>
              </div>
              <div style={{ height: 7, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((completedCount / classSubjects.length) * 100)}%`, height: '100%', background: '#16a34a', transition: 'width 0.25s ease' }} />
              </div>
            </div>
          )}

          {selClass && codeVerified && classSubjects.length === 0 && (
            <div style={{ background: '#fff', padding: 18, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
              No subjects configured for <b>{selClass}</b> yet. Ask Admin to add subjects in <b>Feedback → Setup</b>.
            </div>
          )}

          {/* Subject Cards */}
          {selClass && codeVerified && settings.isOpen && classSubjects.map((item, idx) => {
            const k = `${item.subject}|${item.teacher_name}`;
            const a = answers[k] || {};
            const isDone = !!(a.rating || a.liked?.trim() || a.improve?.trim() || a.other?.trim());
            return (
              <div key={item.id} style={{ background: '#fff', padding: 14, borderRadius: 16, border: isDone ? '1.5px solid #16a34a' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{idx + 1}. {item.subject}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2e44d2', marginTop: 2 }}>{item.teacher_name}</div>
                  </div>
                  {isDone && <CheckCircle2 size={20} color="#16a34a" />}
                </div>

                {/* Emoji + Star Rating */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {EMOJI_RATINGS.map(er => {
                    const active = a.rating === er.val;
                    return (
                      <button
                        key={er.val}
                        type="button"
                        onClick={() => updateAnswer(k, 'rating', er.val)}
                        style={{
                          padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                          border: active ? `2px solid ${er.color}` : '1px solid #e2e8f0',
                          background: active ? '#f8fafc' : '#fff',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{er.emoji}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: active ? er.color : '#64748b' }}>{er.val}★</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Liked Tags */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', marginBottom: 4 }}>What did you like? (Tap tags or type)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {QUICK_LIKED_TAGS.map(tag => {
                      const selected = (a.liked || '').includes(tag);
                      return (
                        <button key={tag} type="button" onClick={() => toggleTag(k, 'liked', tag)} style={{ padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: selected ? '1px solid #16a34a' : '1px solid #e2e8f0', background: selected ? '#dcfce7' : '#f8fafc', color: selected ? '#166534' : '#475569' }}>
                          + {tag}
                        </button>
                      );
                    })}
                  </div>
                  <textarea rows={2} value={a.liked || ''} onChange={e => updateAnswer(k, 'liked', e.target.value)} placeholder="Ishtappettath ivide ezhuthaam..." style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
                </div>

                {/* Quick Improve Tags */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>What can improve? (Optional)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                    {QUICK_IMPROVE_TAGS.map(tag => {
                      const selected = (a.improve || '').includes(tag);
                      return (
                        <button key={tag} type="button" onClick={() => toggleTag(k, 'improve', tag)} style={{ padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: selected ? '1px solid #dc2626' : '1px solid #e2e8f0', background: selected ? '#fee2e2' : '#f8fafc', color: selected ? '#991b1b' : '#475569' }}>
                          + {tag}
                        </button>
                      );
                    })}
                  </div>
                  <textarea rows={2} value={a.improve || ''} onChange={e => updateAnswer(k, 'improve', e.target.value)} placeholder="Mechappeduthendath..." style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
                </div>

                <textarea rows={1} value={a.other || ''} onChange={e => updateAnswer(k, 'other', e.target.value)} placeholder="Other suggestions (Optional)" style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, fontFamily: 'inherit' }} />
              </div>
            );
          })}

          {selClass && codeVerified && settings.isOpen && classSubjects.length > 0 && (
            <button type="submit" disabled={submitting} style={{ padding: 14, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              {submitting ? 'Submitting...' : `Submit Feedback (${completedCount}/${classSubjects.length} Ready)`}
            </button>
          )}
        </form>
      )}

      {/* TAB 2: ADVANCED REPORTS & EXCEL */}
      {tab === 'reports' && (isAdmin || isTeacher) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{analytics.total}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Total Responses</div>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>⭐ {analytics.avg}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Overall Rating</div>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2e44d2' }}>{analytics.uniqueStudents}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Students Submitted</div>
            </div>
          </div>

          {/* Participation Tracker (Admin Only) */}
          {isAdmin && participationByClass.length > 0 && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#2e44d2" /> Class Participation ({activeCycleName})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {participationByClass.map(p => (
                  <div key={p.cls} style={{ padding: 8, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700 }}>
                      <span>{p.cls}</span>
                      <span style={{ color: '#2e44d2' }}>{p.submitted}/{p.total}</span>
                    </div>
                    <div style={{ height: 5, background: '#e2e8f0', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${p.pct}%`, height: '100%', background: '#16a34a' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Star Rating Distribution */}
          {analytics.ratedCount > 0 && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>Rating Breakdown</div>
              {analytics.dist.map(d => {
                const pct = Math.round((d.count / analytics.ratedCount) * 100);
                return (
                  <div key={d.star} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ width: 28, fontWeight: 700, color: '#475569' }}>{d.star} ★</span>
                    <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: d.star >= 4 ? '#16a34a' : d.star === 3 ? '#f59e0b' : '#dc2626', borderRadius: 99 }} />
                    </div>
                    <span style={{ width: 45, textAlign: 'right', color: '#64748b', fontWeight: 600 }}>{d.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filters & Exports */}
          {isAdmin && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                <select value={filterCycle} onChange={e => setFilterCycle(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}>
                  <option value="ACTIVE">Current ({settings.cycle})</option>
                  <option value="ALL">All Cycles</option>
                  {cyclesList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}>
                  <option value="ALL">All Teachers</option>
                  {teachersList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}>
                  <option value="ALL">All Classes</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search teacher, subject, or comment..." style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <select value={fbRatingFilter} onChange={e => setFbRatingFilter(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="ALL">All Ratings</option>
                <option value="5">5 ★ Only</option>
                <option value="4">4 ★ & above</option>
                <option value="low">3 ★ & below (Needs Attention)</option>
              </select>
              <select value={fbSortBy} onChange={e => setFbSortBy(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="newest">Sort: Newest</option>
                <option value="highest">Sort: Highest Rating</option>
                <option value="lowest">Sort: Lowest Rating</option>
              </select>
            </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                <button onClick={exportExcel} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <FileSpreadsheet size={14} /> Excel (.xls)
                </button>
                <button onClick={exportCSV} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Download size={14} /> CSV
                </button>
                <button onClick={printPDFReport} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Printer size={14} /> Print / PDF
                </button>
                <button onClick={copyWhatsAppSummary} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Copy size={14} /> WhatsApp
                </button>
              </div>
            </div>
          )}

          {/* Teacher Leaderboard */}
          <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Award size={15} color="#d97706" /> Teacher & Subject Ranking ({activeCycleName})
            </div>
            {summaryByTeacher.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>No responses yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summaryByTeacher.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{i + 1}. {s.teacher}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{s.cls} • {s.subject} ({s.total} responses)</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', background: '#fef3c7', padding: '4px 9px', borderRadius: 8 }}>
                      ⭐ {s.rated ? (s.sum / s.rated).toFixed(1) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individual Comments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleResponses.map(r => (
              <div key={r.id} style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#2e44d2' }}>
                    {r.teacher_name} • {r.class_name} ({r.subject})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.rating && <span style={{ fontSize: 11, fontWeight: 800, color: '#d97706' }}>⭐ {r.rating}/5</span>}
                    {isAdmin && (
                      <button onClick={() => handleDeleteResponse(r.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {r.liked && <div style={{ fontSize: 12, color: '#166534', marginBottom: 3 }}><b>Liked:</b> {r.liked}</div>}
                {r.improve && <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 3 }}><b>Improve:</b> {r.improve}</div>}
                {r.other && <div style={{ fontSize: 12, color: '#334155', marginBottom: 3 }}><b>Other:</b> {r.other}</div>}
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                  — {r.identity || 'Anonymous'} • {new Date(r.created_at).toLocaleDateString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CLEAN RESPONSIVE ADMIN SETUP */}
      {tab === 'setup' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>Feedback Settings</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <input value={settings.cycle} onChange={e => setSettings({ ...settings, cycle: e.target.value })} placeholder="Cycle (e.g. Term 1)" style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
              <input value={settings.accessCode} onChange={e => setSettings({ ...settings, accessCode: e.target.value })} placeholder="Access Code (Optional)" style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
            </div>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.isOpen} onChange={e => setSettings({ ...settings, isOpen: e.target.checked })} />
              Feedback Portal Open for Students
            </label>
            <button onClick={saveSettings} style={{ padding: 10, borderRadius: 9, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              Save Settings
            </button>
          </div>

          <form onSubmit={handleAddConfig} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>Assign Subjects & Teachers to Class</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={cfgClass} onChange={e => setCfgClass(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#fff' }}>
                <option value="">-- Select Class --</option>
                {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input list="fb-syl-list" value={cfgSubject} onChange={e => setCfgSubject(e.target.value)} placeholder="Select or Type Subject" style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5 }} />
              <datalist id="fb-syl-list">{syllabusSubjects.map(s => <option key={s} value={s} />)}</datalist>
              <select value={cfgTeacher} onChange={e => setCfgTeacher(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12.5, background: '#fff' }}>
                <option value="">-- Select Teacher --</option>
                {allStaff.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button type="submit" style={{ padding: 10, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Plus size={15} /> Add Subject Mapping
            </button>

            {/* Filter & List */}
            {config.length > 0 && (
              <div style={{ marginTop: 6, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Configured Subjects ({filteredConfig.length})</span>
                  <select value={setupFilterClass} onChange={e => setSetupFilterClass(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11.5, background: '#fff' }}>
                    <option value="ALL">All Classes</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredConfig.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12 }}>
                      <span><b>{c.class_name}</b> • {c.subject} <span style={{ color: '#2e44d2', fontWeight: 600 }}>({c.teacher_name})</span></span>
                      {c.isCustom ? (
                        <button type="button" onClick={() => handleDeleteConfig(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: 6 }}>Auto</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
