import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, FileSpreadsheet, Download, Image as ImageIcon } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

export default function ReportsModule({ onBack }) {
  const [tab, setTab] = useState('class'); // performance | class | pending
  const [loading, setLoading] = useState(false);

  // Master Data
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);

  // 1. Performance State
  const [perfData, setPerfData] = useState(null);

  // 2. Class Report State
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL'); // 'ALL' or specific subject
  const [markScale, setMarkScale] = useState('30'); // '30' | '100'
  const [classReport, setClassReport] = useState(null);

  // 3. Pending Tracker State
  const [pendingClass, setPendingClass] = useState('');
  const [pendingTeacher, setPendingTeacher] = useState('');
  const [pendingList, setPendingList] = useState(null);
  const [pendingTitle, setPendingTitle] = useState('');

  useEffect(() => {
    loadFilters();
  }, []);

  async function loadFilters() {
    const [{ data: st }, { data: ta }] = await Promise.all([
      supabase.from('students').select('class_name'),
      supabase.from('teacher_assignments').select('staff_name')
    ]);
    if (st) setClasses([...new Set(st.map(s => s.class_name).filter(Boolean))].sort());
    if (ta) setTeachers([...new Set(ta.map(t => t.staff_name).filter(Boolean))].sort());
  }

  // Export Helpers
  function downloadCSV(filename, headers, rows) {
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF(elementId, filename, landscape = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    html2pdf().set({
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' }
    }).from(el).save();
  }

  async function downloadJPEG(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el) return;
    try {
      const worker = html2pdf().set({
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
      }).from(el);
      const canvas = await worker.toCanvas().get('canvas');
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      alert('JPEG download error: ' + err.message);
    }
  }

  // ==========================================
  // 1. PERFORMANCE EVALUATION
  // ==========================================
  async function generatePerformance() {
    setLoading(true);
    const [{ data: students }, { data: marks }, { data: assignments }] = await Promise.all([
      supabase.from('students').select('adm_no, name, class_name'),
      supabase.from('marks').select('adm_no, class_name, subject, final_mark, total'),
      supabase.from('teacher_assignments').select('class_name, subject_name')
    ]);

    const stList = students || [];
    const mkList = marks || [];
    const asgList = assignments || [];

    const classSubjects = {};
    asgList.forEach(a => {
      if (!a.class_name || !a.subject_name || a.subject_name === 'EMPTY') return;
      if (!classSubjects[a.class_name]) classSubjects[a.class_name] = new Set();
      classSubjects[a.class_name].add(a.subject_name.trim());
    });
    mkList.forEach(m => {
      if (!m.class_name || !m.subject) return;
      if (!classSubjects[m.class_name]) classSubjects[m.class_name] = new Set();
      classSubjects[m.class_name].add(m.subject.trim());
    });

    const classMaxMap = {};
    Object.keys(classSubjects).forEach(cls => {
      let maxM = 0;
      classSubjects[cls].forEach(sub => {
        const isHifz = sub.toUpperCase().includes('HIFZ') || sub.toUpperCase().includes('MIDTERM');
        maxM += isHifz ? 100 : 30;
      });
      classMaxMap[cls] = maxM || 100;
    });

    const marksByAdm = {};
    mkList.forEach(m => {
      if (!marksByAdm[m.adm_no]) marksByAdm[m.adm_no] = 0;
      marksByAdm[m.adm_no] += Number(m.final_mark) || 0;
    });

    const studentScores = stList.map(s => {
      const scored = marksByAdm[s.adm_no] || 0;
      const maxM = classMaxMap[s.class_name] || 100;
      const perc = maxM > 0 ? (scored / maxM) * 100 : 0;
      return {
        adm_no: s.adm_no,
        name: s.name,
        class_name: s.class_name,
        scored: Number(scored.toFixed(2)),
        maxM,
        perc: Number(perc.toFixed(2))
      };
    });

    const rankedStudents = [...studentScores].sort((a, b) => b.perc - a.perc);
    rankedStudents.forEach((s, i) => { s.rank = i + 1; });

    const classAgg = {};
    studentScores.forEach(s => {
      if (!s.class_name) return;
      if (!classAgg[s.class_name]) classAgg[s.class_name] = { sum: 0, count: 0 };
      classAgg[s.class_name].sum += s.perc;
      classAgg[s.class_name].count += 1;
    });

    const bestClasses = Object.keys(classAgg)
      .map(cls => ({
        class_name: cls,
        avg: Number((classAgg[cls].sum / classAgg[cls].count).toFixed(2)),
        students: classAgg[cls].count
      }))
      .sort((a, b) => b.avg - a.avg);

    setPerfData({
      bestClasses,
      top10: rankedStudents.slice(0, 10),
      bottom10: [...rankedStudents].reverse().slice(0, 10),
      allRanked: rankedStudents
    });
    setLoading(false);
  }

  // ==========================================
  // 2. CLASS REPORT (CONSOLIDATED + W1-W4 SUBJECT WISE)
  // ==========================================
  async function generateClassReport() {
    if (!selectedClass) return alert('Class select cheyyuka!');
    setLoading(true);

    const [{ data: stData }, { data: mkData }, { data: asgData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('adm_no'),
      supabase.from('marks').select('*').eq('class_name', selectedClass),
      supabase.from('teacher_assignments').select('subject_name').eq('class_name', selectedClass)
    ]);

    const subSet = new Set();
    (asgData || []).forEach(a => {
      if (a.subject_name && a.subject_name !== 'EMPTY') subSet.add(a.subject_name.trim());
    });
    (mkData || []).forEach(m => {
      if (m.subject) subSet.add(m.subject.trim());
    });
    const subjects = [...subSet].sort();

    let maxFinal = 0;
    let maxRaw = 0;
    subjects.forEach(sub => {
      const isHifz = sub.toUpperCase().includes('HIFZ') || sub.toUpperCase().includes('MIDTERM');
      maxFinal += isHifz ? 100 : 30;
      maxRaw += 100;
    });

    const rows = (stData || []).map((s, idx) => {
      const myMarks = (mkData || []).filter(m => m.adm_no === s.adm_no);
      const subMap30 = {};
      const subMap100 = {};
      const detailMap = {}; // stores { w1, w2, w3, w4, total, final_mark } per subject
      let finalTotal = 0;
      let rawTotal = 0;

      myMarks.forEach(m => {
        const key = m.subject.trim();
        const rawVal = m.total !== null && m.total !== undefined ? Number(m.total) : null;
        const val30 = m.final_mark !== null && m.final_mark !== undefined
          ? Number(m.final_mark)
          : (rawVal !== null ? Number(((rawVal / 100) * 30).toFixed(2)) : null);

        subMap100[key] = rawVal;
        subMap30[key] = val30;
        detailMap[key] = {
          w1: m.w1,
          w2: m.w2,
          w3: m.w3,
          w4: m.w4,
          total: rawVal,
          final30: val30
        };
        finalTotal += val30 || 0;
        rawTotal += rawVal || 0;
      });

      const perc = maxFinal > 0 ? ((finalTotal / maxFinal) * 100).toFixed(1) : '0.0';
      return {
        roll: idx + 1,
        adm_no: s.adm_no,
        name: s.name,
        subMap30,
        subMap100,
        detailMap,
        finalTotal: Number(finalTotal.toFixed(2)),
        rawTotal: Number(rawTotal.toFixed(2)),
        perc
      };
    });

    const sorted = [...rows].sort((a, b) => b.finalTotal - a.finalTotal);
    const rankMap = {};
    sorted.forEach((r, idx) => { rankMap[r.adm_no] = idx + 1; });
    rows.forEach(r => { r.rank = rankMap[r.adm_no]; });

    setSelectedSubject('ALL');
    setClassReport({ className: selectedClass, subjects, maxFinal, maxRaw, rows });
    setLoading(false);
  }

  // ==========================================
  // 3. PENDING TRACKER (W1, W2, W3, W4 WISE)
  // ==========================================
  async function checkPending(mode) {
    if (mode === 'class' && !pendingClass) return alert('Class select cheyyuka!');
    if (mode === 'teacher' && !pendingTeacher) return alert('Teacher select cheyyuka!');

    setLoading(true);
    let asgQuery = supabase.from('teacher_assignments').select('*').order('class_name');
    if (mode === 'class') asgQuery = asgQuery.eq('class_name', pendingClass);
    if (mode === 'teacher') asgQuery = asgQuery.eq('staff_name', pendingTeacher);

    const [{ data: asgData }, { data: stData }, { data: mkData }] = await Promise.all([
      asgQuery,
      supabase.from('students').select('adm_no, class_name'),
      supabase.from('marks').select('adm_no, class_name, subject, w1, w2, w3, w4, total')
    ]);

    const classCount = {};
    (stData || []).forEach(s => {
      classCount[s.class_name] = (classCount[s.class_name] || 0) + 1;
    });

    // Count entered W1, W2, W3, W4 per (class + subject)
    const workCounts = {};
    (mkData || []).forEach(m => {
      const key = `${m.class_name}__${String(m.subject || '').trim().toLowerCase()}`;
      if (!workCounts[key]) workCounts[key] = { w1: 0, w2: 0, w3: 0, w4: 0, total: 0 };
      if (m.w1 !== null && m.w1 !== undefined && m.w1 !== '') workCounts[key].w1++;
      if (m.w2 !== null && m.w2 !== undefined && m.w2 !== '') workCounts[key].w2++;
      if (m.w3 !== null && m.w3 !== undefined && m.w3 !== '') workCounts[key].w3++;
      if (m.w4 !== null && m.w4 !== undefined && m.w4 !== '') workCounts[key].w4++;
      if (m.total !== null && m.total !== undefined && m.total !== '') workCounts[key].total++;
    });

    const results = (asgData || [])
      .filter(a => a.subject_name && a.subject_name !== 'EMPTY')
      .map(a => {
        const totalSt = classCount[a.class_name] || 0;
        const key = `${a.class_name}__${String(a.subject_name).trim().toLowerCase()}`;
        const wc = workCounts[key] || { w1: 0, w2: 0, w3: 0, w4: 0, total: 0 };
        const isHifz = a.subject_name.toUpperCase().includes('HIFZ') || a.subject_name.toUpperCase().includes('MIDTERM');

        const hasPending = isHifz
          ? wc.total < totalSt
          : wc.w1 < totalSt || wc.w2 < totalSt || wc.w3 < totalSt || wc.w4 < totalSt;

        return { ...a, totalSt, wc, isHifz, hasPending };
      })
      .filter(r => r.hasPending);

    setPendingTitle(
      mode === 'class'
        ? `Pending W1–W4 — Class ${pendingClass}`
        : mode === 'teacher'
        ? `Pending W1–W4 — ${pendingTeacher}`
        : 'Campus-Wide Pending (W1–W4)'
    );
    setPendingList(results);
    setLoading(false);
  }

  const medal = idx => (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '');

  const WorkBadge = ({ done, total }) => {
    if (total === 0) return <span style={{ color: '#94a3b8' }}>-</span>;
    if (done >= total) {
      return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#dcfce7', color: '#15803d' }}>✓ {done}/{total}</span>;
    }
    if (done > 0) {
      return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#fef3c7', color: '#b45309' }}>{done}/{total}</span>;
    }
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#fee2e2', color: '#dc2626' }}>0/{total}</span>;
  };

  const ExportBar = ({ onPDF, onJPEG, onExcel, excelLabel = 'EXCEL (CSV)' }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <button onClick={onPDF} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Download size={14} /> PDF
      </button>
      <button onClick={onJPEG} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <ImageIcon size={14} /> JPEG
      </button>
      <button onClick={onExcel} style={{ padding: '11px 6px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <FileSpreadsheet size={14} /> {excelLabel}
      </button>
    </div>
  );

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Academic Reports</h2>
      </div>

      {/* TOP TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 16, gap: 4 }}>
        {[
          { id: 'class', label: 'Class Report' },
          { id: 'pending', label: 'Pending (W1–W4)' },
          { id: 'performance', label: 'Performance' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2e44d2' : '#475569',
              boxShadow: tab === t.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================================================= */}
      {/* TAB 1: CLASS REPORT (CONSOLIDATED + W1-W4 VIEW)   */}
      {/* ================================================= */}
      {tab === 'class' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={generateClassReport} disabled={loading} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              {loading ? '...' : 'GENERATE'}
            </button>
          </div>

          {classReport && (
            <>
              {/* Subject Filter Dropdown */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #93c5fd', background: '#eff6ff', color: '#1e3a8a', fontWeight: 700, fontSize: 12 }}
                >
                  <option value="ALL">📊 All Subjects (Consolidated Report)</option>
                  {classReport.subjects.map(sub => (
                    <option key={sub} value={sub}>📝 {sub} — Detailed (W1, W2, W3, W4 & Out of 30)</option>
                  ))}
                </select>
              </div>

              {/* Scale Toggle (Only for Consolidated View) */}
              {selectedSubject === 'ALL' && (
                <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0', gap: 4 }}>
                  <button
                    onClick={() => setMarkScale('30')}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: markScale === '30' ? '#2563eb' : 'transparent', color: markScale === '30' ? '#fff' : '#475569' }}
                  >
                    CCE Mark List (Out of 30)
                  </button>
                  <button
                    onClick={() => setMarkScale('100')}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: markScale === '100' ? '#2563eb' : 'transparent', color: markScale === '100' ? '#fff' : '#475569' }}
                  >
                    Raw Total (Out of 100)
                  </button>
                </div>
              )}

              {/* REPORT TABLE */}
              <div id="nhia-class-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, overflowX: 'auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 12, borderBottom: '2px solid #1e293b', paddingBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                    NOORUL HIDAYA ISLAMIC ACADEMY — {selectedSubject === 'ALL' ? 'CCE MARK LIST' : `${selectedSubject} MARK SHEET`}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                    Class: {classReport.className} • {selectedSubject === 'ALL'
                      ? (markScale === '30' ? 'Out of 30 (Converted)' : 'Out of 100 (Raw)')
                      : 'W1–W4 Breakdown + Total (100) + Out of 30'}
                  </div>
                </div>

                {selectedSubject === 'ALL' ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <thead style={{ background: '#1e293b', color: '#fff' }}>
                      <tr>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Roll</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Adm No</th>
                        <th style={{ padding: 7, border: '1px solid #334155', textAlign: 'left' }}>Student Name</th>
                        {classReport.subjects.map(sub => (
                          <th key={sub} style={{ padding: 7, border: '1px solid #334155' }}>
                            {sub} ({markScale === '30' && !sub.toUpperCase().includes('HIFZ') && !sub.toUpperCase().includes('MIDTERM') ? '30' : '100'})
                          </th>
                        ))}
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Total ({markScale === '30' ? classReport.maxFinal : classReport.maxRaw})</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>%</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classReport.rows.map(r => {
                        const mapToUse = markScale === '30' ? r.subMap30 : r.subMap100;
                        const totToUse = markScale === '30' ? r.finalTotal : r.rawTotal;
                        return (
                          <tr key={r.adm_no}>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', color: '#64748b' }}>{r.roll}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', color: '#475569' }}>{r.adm_no}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700 }}>{r.name}</td>
                            {classReport.subjects.map(sub => {
                              const val = mapToUse[sub];
                              return (
                                <td key={sub} style={{ padding: 7, border: '1px solid #e2e8f0' }}>
                                  {val !== undefined && val !== null ? <span style={{ fontWeight: 600 }}>{val}</span> : <span style={{ color: '#dc2626', fontStyle: 'italic', fontSize: 10 }}>Pending</span>}
                                </td>
                              );
                            })}
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 800, color: '#2563eb' }}>{totToUse}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 700 }}>{r.perc}%</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 800 }}>#{r.rank}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* DETAILED SUBJECT W1-W4 + OUT OF 30 TABLE */
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <thead style={{ background: '#1e293b', color: '#fff' }}>
                      <tr>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Roll</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Adm No</th>
                        <th style={{ padding: 7, border: '1px solid #334155', textAlign: 'left' }}>Student Name</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>W1 (15)</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>W2 (20)</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>W3 (25)</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>W4 (40)</th>
                        <th style={{ padding: 7, border: '1px solid #334155' }}>Total (100)</th>
                        <th style={{ padding: 7, border: '1px solid #334155', background: '#1d4ed8' }}>Out of 30</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classReport.rows.map(r => {
                        const d = r.detailMap[selectedSubject] || {};
                        const cell = v => (v !== undefined && v !== null && v !== '' ? <span style={{ fontWeight: 600 }}>{v}</span> : <span style={{ color: '#dc2626', fontStyle: 'italic', fontSize: 10 }}>Pending</span>);
                        return (
                          <tr key={r.adm_no}>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', color: '#64748b' }}>{r.roll}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', color: '#475569' }}>{r.adm_no}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'left', fontWeight: 700 }}>{r.name}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0' }}>{cell(d.w1)}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0' }}>{cell(d.w2)}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0' }}>{cell(d.w3)}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0' }}>{cell(d.w4)}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 700 }}>{cell(d.total)}</td>
                            <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff' }}>{cell(d.final30)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-class-report', `Class_${classReport.className}_${selectedSubject}.pdf`, true)}
                onJPEG={() => downloadJPEG('nhia-class-report', `Class_${classReport.className}_${selectedSubject}.jpg`)}
                onExcel={() => {
                  if (selectedSubject === 'ALL') {
                    downloadCSV(
                      `Class_${classReport.className}_OutOf${markScale}.csv`,
                      ['Roll No', 'Adm No', 'Student Name', ...classReport.subjects, `Total (${markScale === '30' ? classReport.maxFinal : classReport.maxRaw})`, '%', 'Rank'],
                      classReport.rows.map(r => {
                        const mapToUse = markScale === '30' ? r.subMap30 : r.subMap100;
                        const totToUse = markScale === '30' ? r.finalTotal : r.rawTotal;
                        return [r.roll, r.adm_no, r.name, ...classReport.subjects.map(sub => mapToUse[sub] ?? 'Pending'), totToUse, `${r.perc}%`, r.rank];
                      })
                    );
                  } else {
                    downloadCSV(
                      `Class_${classReport.className}_${selectedSubject}_W1_W4.csv`,
                      ['Roll No', 'Adm No', 'Student Name', 'W1 (15)', 'W2 (20)', 'W3 (25)', 'W4 (40)', 'Total (100)', 'Out of 30'],
                      classReport.rows.map(r => {
                        const d = r.detailMap[selectedSubject] || {};
                        return [r.roll, r.adm_no, r.name, d.w1 ?? 'Pending', d.w2 ?? 'Pending', d.w3 ?? 'Pending', d.w4 ?? 'Pending', d.total ?? 'Pending', d.final30 ?? 'Pending'];
                      })
                    );
                  }
                }}
              />
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 2: PENDING TRACKER (W1, W2, W3, W4 WISE)      */}
      {/* ================================================= */}
      {tab === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={pendingClass} onChange={e => setPendingClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- Filter by Class --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => checkPending('class')} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>SEARCH</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <select value={pendingTeacher} onChange={e => setPendingTeacher(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- Filter by Teacher --</option>
              {teachers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => checkPending('teacher')} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>SEARCH</button>
          </div>

          <button onClick={() => checkPending('all')} disabled={loading} style={{ width: '100%', padding: 13, borderRadius: 12, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            {loading ? 'CHECKING...' : 'VIEW CAMPUS-WIDE PENDING (W1–W4)'}
          </button>

          {pendingList && (
            <>
              <div id="nhia-pending-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{pendingTitle}</h4>
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: 8 }}>
                    {pendingList.length} Pending
                  </span>
                </div>

                {pendingList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#16a34a', fontWeight: 700, fontSize: 13 }}>
                    ✅ Ellaa W1–W4 markukalum enter cheythittund!
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Class</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Subject</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Teacher</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>W1</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>W2</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>W3</th>
                          <th style={{ padding: 7, borderBottom: '1px solid #e2e8f0' }}>W4</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingList.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: 7, fontWeight: 700, textAlign: 'left' }}>{p.class_name}</td>
                            <td style={{ padding: 7, fontWeight: 600, textAlign: 'left' }}>{p.subject_name}</td>
                            <td style={{ padding: 7, color: '#475569', textAlign: 'left' }}>{p.staff_name}</td>
                            {p.isHifz ? (
                              <td colSpan={4} style={{ padding: 7 }}>
                                <WorkBadge done={p.wc.total} total={p.totalSt} /> <span style={{ fontSize: 10, color: '#64748b' }}>(Total)</span>
                              </td>
                            ) : (
                              <>
                                <td style={{ padding: 7 }}><WorkBadge done={p.wc.w1} total={p.totalSt} /></td>
                                <td style={{ padding: 7 }}><WorkBadge done={p.wc.w2} total={p.totalSt} /></td>
                                <td style={{ padding: 7 }}><WorkBadge done={p.wc.w3} total={p.totalSt} /></td>
                                <td style={{ padding: 7 }}><WorkBadge done={p.wc.w4} total={p.totalSt} /></td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {pendingList.length > 0 && (
                <ExportBar
                  onPDF={() => downloadPDF('nhia-pending-report', 'NHIA_Pending_W1_W4.pdf', true)}
                  onJPEG={() => downloadJPEG('nhia-pending-report', 'NHIA_Pending_W1_W4.jpg')}
                  onExcel={() => downloadCSV(
                    'NHIA_Pending_W1_W4.csv',
                    ['Class', 'Subject', 'Teacher', 'Total Students', 'W1 Entered', 'W2 Entered', 'W3 Entered', 'W4 Entered'],
                    pendingList.map(p => [p.class_name, p.subject_name, p.staff_name, p.totalSt, p.wc.w1, p.wc.w2, p.wc.w3, p.wc.w4])
                  )}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: PERFORMANCE EVALUATION                     */}
      {/* ================================================= */}
      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button onClick={generatePerformance} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Trophy size={16} /> {loading ? 'GENERATING...' : 'GENERATE CAMPUS PERFORMANCE REPORT'}
          </button>

          {perfData && (
            <>
              <div id="nhia-perf-report" style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #cbd5e1' }}>
                <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>NHIA PERFORMANCE EVALUATION</h3>

                <div style={{ fontSize: 14, fontWeight: 800, color: '#047857', borderBottom: '2px solid #10b981', paddingBottom: 4, marginBottom: 8 }}>🏆 Best Performing Classes</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Rank</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Class</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Average %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.bestClasses.map((c, i) => (
                      <tr key={c.class_name}>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 700 }}>{i + 1} {medal(i)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 800 }}>{c.class_name}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 600 }}>{c.avg}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', borderBottom: '2px solid #3b82f6', paddingBottom: 4, marginBottom: 8 }}>🌟 Top 10 Students (Campus)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 18 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Rank</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Name</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>Class</th>
                      <th style={{ border: '1px solid #cbd5e1', padding: 7 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.top10.map((s, i) => (
                      <tr key={s.adm_no}>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 700 }}>{i + 1} {medal(i)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 700 }}>{s.name} <span style={{ color: '#64748b', fontWeight: 500 }}>({s.adm_no})</span></td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7 }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 800, color: '#16a34a' }}>{s.perc}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c', borderBottom: '2px solid #ef4444', paddingBottom: 4, marginBottom: 8 }}>📉 Needs Attention (Bottom 10 Students)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                      <th style={{ border: '1px solid #fca5a5', padding: 7 }}>Name</th>
                      <th style={{ border: '1px solid #fca5a5', padding: 7 }}>Class</th>
                      <th style={{ border: '1px solid #fca5a5', padding: 7 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.bottom10.map(s => (
                      <tr key={s.adm_no}>
                        <td style={{ border: '1px solid #fca5a5', padding: 7, fontWeight: 700 }}>{s.name} <span style={{ color: '#64748b', fontWeight: 500 }}>({s.adm_no})</span></td>
                        <td style={{ border: '1px solid #fca5a5', padding: 7 }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #fca5a5', padding: 7, fontWeight: 800, color: '#dc2626' }}>{s.perc}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ExportBar
                onPDF={() => downloadPDF('nhia-perf-report', 'NHIA_Performance_Evaluation.pdf')}
                onJPEG={() => downloadJPEG('nhia-perf-report', 'NHIA_Performance_Evaluation.jpg')}
                onExcel={() => downloadCSV(
                  'NHIA_Full_Campus_Rank_List.csv',
                  ['Rank', 'Adm No', 'Name', 'Class', 'Scored (Out of 30)', 'Max Marks', 'Percentage'],
                  perfData.allRanked.map(s => [s.rank, s.adm_no, s.name, s.class_name, s.scored, s.maxM, `${s.perc}%`])
                )}
                excelLabel="RANK LIST"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}