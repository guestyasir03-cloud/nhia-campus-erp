import React, { useState, useEffect } from 'react';
import { ChevronLeft, Trophy, FileSpreadsheet, Download, AlertCircle, Search, Users } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

export default function ReportsModule({ onBack }) {
  const [tab, setTab] = useState('performance'); // performance | class | pending
  const [loading, setLoading] = useState(false);

  // Master Data
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);

  // 1. Performance Evaluation State
  const [perfData, setPerfData] = useState(null);

  // 2. Class Report State
  const [selectedClass, setSelectedClass] = useState('');
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

  // Helper: CSV Download
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

  // Helper: PDF Download
  function downloadPDF(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el) return;
    html2pdf().set({
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  // ==========================================
  // 1. GENERATE CAMPUS PERFORMANCE REPORT
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

    // Class-wise max marks calculation
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

    // Student-wise scores
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

    // Rank all students
    const rankedStudents = [...studentScores].sort((a, b) => b.perc - a.perc);
    rankedStudents.forEach((s, i) => { s.rank = i + 1; });

    // Best Performing Classes
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

    const top10 = rankedStudents.slice(0, 10);
    const bottom10 = [...rankedStudents].reverse().slice(0, 10);

    setPerfData({ bestClasses, top10, bottom10, allRanked: rankedStudents });
    setLoading(false);
  }

  // ==========================================
  // 2. GENERATE CLASS REPORT
  // ==========================================
  async function generateClassReport() {
    if (!selectedClass) return alert('Class select cheyyuka!');
    setLoading(true);

    const [{ data: stData }, { data: mkData }, { data: asgData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
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
    subjects.forEach(sub => {
      const isHifz = sub.toUpperCase().includes('HIFZ') || sub.toUpperCase().includes('MIDTERM');
      maxFinal += isHifz ? 100 : 30;
    });

    const rows = (stData || []).map(s => {
      const myMarks = (mkData || []).filter(m => m.adm_no === s.adm_no);
      const subMap = {};
      let finalTotal = 0;
      myMarks.forEach(m => {
        subMap[m.subject.trim()] = m.total;
        finalTotal += Number(m.final_mark) || 0;
      });
      const perc = maxFinal > 0 ? ((finalTotal / maxFinal) * 100).toFixed(1) : '0.0';
      return { adm_no: s.adm_no, name: s.name, subMap, finalTotal: Number(finalTotal.toFixed(2)), perc };
    });

    const sorted = [...rows].sort((a, b) => b.finalTotal - a.finalTotal);
    const rankMap = {};
    sorted.forEach((r, idx) => { rankMap[r.adm_no] = idx + 1; });
    rows.forEach(r => { r.rank = rankMap[r.adm_no]; });

    setClassReport({ className: selectedClass, subjects, maxFinal, rows });
    setLoading(false);
  }

  // ==========================================
  // 3. PENDING MARK ENTRY TRACKER
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
      supabase.from('marks').select('adm_no, class_name, subject')
    ]);

    const classCount = {};
    (stData || []).forEach(s => {
      classCount[s.class_name] = (classCount[s.class_name] || 0) + 1;
    });

    const markCount = {};
    (mkData || []).forEach(m => {
      const key = `${m.class_name}__${String(m.subject || '').trim().toLowerCase()}`;
      markCount[key] = (markCount[key] || 0) + 1;
    });

    const results = (asgData || [])
      .filter(a => a.subject_name && a.subject_name !== 'EMPTY')
      .map(a => {
        const totalSt = classCount[a.class_name] || 0;
        const key = `${a.class_name}__${String(a.subject_name).trim().toLowerCase()}`;
        const entered = markCount[key] || 0;
        const pending = Math.max(0, totalSt - entered);
        const status = entered === 0 ? 'Not Started' : pending > 0 ? 'Partial' : 'Completed';
        return { ...a, totalSt, entered, pending, status };
      })
      .filter(r => r.pending > 0); // Pending ullava maathram kaanikkunnu

    setPendingTitle(
      mode === 'class'
        ? `Pending Marks — Class ${pendingClass}`
        : mode === 'teacher'
        ? `Pending Marks — ${pendingTeacher}`
        : 'Campus-Wide Pending Mark Entries'
    );
    setPendingList(results);
    setLoading(false);
  }

  const medal = idx => (idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '');

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
          { id: 'performance', label: 'Performance' },
          { id: 'class', label: 'Class Report' },
          { id: 'pending', label: 'Pending' }
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
      {/* TAB 1: PERFORMANCE EVALUATION                     */}
      {/* ================================================= */}
      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button
            onClick={generatePerformance}
            disabled={loading}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#10b981', color: '#fff',
              fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
            }}
          >
            <Trophy size={16} /> {loading ? 'GENERATING...' : 'GENERATE CAMPUS PERFORMANCE REPORT'}
          </button>

          {perfData && (
            <>
              <div id="nhia-perf-report" style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #cbd5e1' }}>
                <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, marginBottom: 14, letterSpacing: 0.5 }}>
                  NHIA PERFORMANCE EVALUATION
                </h3>

                {/* Best Performing Classes */}
                <div style={{ fontSize: 14, fontWeight: 800, color: '#047857', borderBottom: '2px solid #10b981', paddingBottom: 4, marginBottom: 8 }}>
                  🏆 Best Performing Classes
                </div>
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

                {/* Top 10 Students */}
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8', borderBottom: '2px solid #3b82f6', paddingBottom: 4, marginBottom: 8 }}>
                  🌟 Top 10 Students (Campus)
                </div>
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
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 700 }}>
                          {s.name} <span style={{ color: '#64748b', fontWeight: 500 }}>({s.adm_no})</span>
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7 }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: 7, fontWeight: 800, color: '#16a34a' }}>{s.perc}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Bottom 10 Students */}
                <div style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c', borderBottom: '2px solid #ef4444', paddingBottom: 4, marginBottom: 8 }}>
                  📉 Needs Attention (Bottom 10 Students)
                </div>
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
                        <td style={{ border: '1px solid #fca5a5', padding: 7, fontWeight: 700 }}>
                          {s.name} <span style={{ color: '#64748b', fontWeight: 500 }}>({s.adm_no})</span>
                        </td>
                        <td style={{ border: '1px solid #fca5a5', padding: 7 }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #fca5a5', padding: 7, fontWeight: 800, color: '#dc2626' }}>{s.perc}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* EXPORT BUTTONS */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => downloadPDF('nhia-perf-report', 'NHIA_Performance_Evaluation.pdf')}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Download size={15} /> DOWNLOAD PDF
                </button>
                <button
                  onClick={() => downloadCSV(
                    'NHIA_Full_Campus_Rank_List.csv',
                    ['Rank', 'Adm No', 'Name', 'Class', 'Scored', 'Max Marks', 'Percentage'],
                    perfData.allRanked.map(s => [s.rank, s.adm_no, s.name, s.class_name, s.scored, s.maxM, `${s.perc}%`])
                  )}
                  style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <FileSpreadsheet size={15} /> FULL RANK LIST (EXCEL)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 2: CLASS REPORT                               */}
      {/* ================================================= */}
      {tab === 'class' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}
            >
              <option value="">-- Select Class --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={generateClassReport}
              disabled={loading}
              style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              {loading ? '...' : 'GENERATE REPORT'}
            </button>
          </div>

          {classReport && (
            <>
              <div id="nhia-class-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, overflowX: 'auto' }}>
                <h3 style={{ textAlign: 'center', color: '#2563eb', fontSize: 17, fontWeight: 800, marginBottom: 12 }}>
                  Class Report - {classReport.className}
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 8 }}>Adm No</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Student Name</th>
                      {classReport.subjects.map(sub => <th key={sub} style={{ padding: 8 }}>{sub}</th>)}
                      <th style={{ padding: 8 }}>Final ({classReport.maxFinal})</th>
                      <th style={{ padding: 8 }}>%</th>
                      <th style={{ padding: 8 }}>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classReport.rows.map(r => (
                      <tr key={r.adm_no} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 8, color: '#475569' }}>{r.adm_no}</td>
                        <td style={{ padding: 8, textAlign: 'left', fontWeight: 700 }}>{r.name}</td>
                        {classReport.subjects.map(sub => {
                          const val = r.subMap[sub];
                          return (
                            <td key={sub} style={{ padding: 8 }}>
                              {val !== undefined && val !== null ? (
                                <span style={{ fontWeight: 600 }}>{val}</span>
                              ) : (
                                <span style={{ color: '#dc2626', fontStyle: 'italic', fontSize: 11 }}>Pending</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: 8, fontWeight: 800, color: '#2563eb' }}>{r.finalTotal}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{r.perc}%</td>
                        <td style={{ padding: 8, fontWeight: 800 }}>#{r.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => downloadCSV(
                  `Class_Report_${classReport.className}.csv`,
                  ['Adm No', 'Student Name', ...classReport.subjects, `Final (${classReport.maxFinal})`, '%', 'Rank'],
                  classReport.rows.map(r => [
                    r.adm_no,
                    r.name,
                    ...classReport.subjects.map(sub => r.subMap[sub] ?? 'Pending'),
                    r.finalTotal,
                    `${r.perc}%`,
                    r.rank
                  ])
                )}
                style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <FileSpreadsheet size={16} /> DOWNLOAD AS EXCEL (CSV)
              </button>
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: PENDING MARK ENTRY TRACKER                 */}
      {/* ================================================= */}
      {tab === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Class Filter */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={pendingClass}
              onChange={e => setPendingClass(e.target.value)}
              style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="">-- Filter by Class --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => checkPending('class')} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              SEARCH
            </button>
          </div>

          {/* Teacher Filter */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={pendingTeacher}
              onChange={e => setPendingTeacher(e.target.value)}
              style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="">-- Filter by Teacher --</option>
              {teachers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => checkPending('teacher')} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              SEARCH
            </button>
          </div>

          {/* Campus-Wide Button */}
          <button
            onClick={() => checkPending('all')}
            disabled={loading}
            style={{ width: '100%', padding: 13, borderRadius: 12, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 800, fontSize: 12, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
          >
            {loading ? 'CHECKING...' : 'VIEW CAMPUS-WIDE PENDING REPORTS'}
          </button>

          {pendingList && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{pendingTitle}</h4>
                <span style={{ fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: 8 }}>
                  {pendingList.length} Pending
                </span>
              </div>

              {pendingList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#16a34a', fontWeight: 700, fontSize: 13 }}>
                  ✅ Ellaa markukalum enter cheythittund! Pending onnumilla.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ background: '#f8fafc', textAlign: 'left' }}>
                      <tr>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Class</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Subject</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Teacher</th>
                        <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingList.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: 8, fontWeight: 700 }}>{p.class_name}</td>
                          <td style={{ padding: 8, fontWeight: 600 }}>{p.subject_name}</td>
                          <td style={{ padding: 8, color: '#475569' }}>{p.staff_name}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
                              background: p.status === 'Not Started' ? '#fee2e2' : '#fef3c7',
                              color: p.status === 'Not Started' ? '#dc2626' : '#d97706'
                            }}>
                              {p.status} ({p.entered}/{p.totalSt})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}