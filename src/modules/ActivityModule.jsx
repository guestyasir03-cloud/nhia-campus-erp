import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, PlusCircle, Award, ListChecks, Save,
  Download, Image as ImageIcon, FileSpreadsheet, Trash2, CheckSquare, Square
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['Ibadah', 'Academic', 'Discipline', 'Leadership'];

function getStanding(net) {
  if (net >= 50) return { label: 'Mumtaz', bg: '#dcfce7', color: '#15803d' };
  if (net >= 15) return { label: 'Commendable', bg: '#dbeafe', color: '#1d4ed8' };
  if (net >= 0) return { label: 'Good Standing', bg: '#f1f5f9', color: '#475569' };
  if (net >= -19) return { label: 'Warning', bg: '#fef3c7', color: '#b45309' };
  return { label: 'Action Required', bg: '#fee2e2', color: '#dc2626' };
}

export default function ActivityModule({ onBack, user }) {
  const isStudent = user?.role === 'student';
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);

  const [tab, setTab] = useState('entry'); // entry | report | reasons
  const [classes, setClasses] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Entry State
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedAdms, setSelectedAdms] = useState(new Set());
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [customPoints, setCustomPoints] = useState('');
  const [remarks, setRemarks] = useState('');

  // Report State
  const [reportClass, setReportClass] = useState('');
  const [reportRows, setReportRows] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  // Reasons Manager State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Discipline');
  const [newType, setNewType] = useState('merit'); // merit | demerit
  const [newPoints, setNewPoints] = useState('5');

  // Student Self-View State
  const [mySummary, setMySummary] = useState(null);

  useEffect(() => {
    if (isStudent && user?.id) {
      loadStudentSelfView(user.id);
    } else {
      loadInitial();
    }
  }, []);

  async function loadInitial() {
    const [{ data: st }, { data: rsn }] = await Promise.all([
      supabase.from('students').select('class_name'),
      supabase.from('activity_reasons').select('*').order('points', { ascending: false })
    ]);
    if (st) {
      setClasses([...new Set(st.map(d => d.class_name).filter(Boolean))].filter(c => c !== 'ALUMNI').sort());
    }
    if (rsn) setReasons(rsn);
  }

  async function loadStudentSelfView(admNo) {
    setLoading(true);
    const { data } = await supabase
      .from('activity_points')
      .select('*')
      .eq('adm_no', admNo)
      .order('created_at', { ascending: false })
      .limit(50);

    const logs = data || [];
    const merit = logs.filter(l => l.points > 0).reduce((s, l) => s + l.points, 0);
    const demerit = logs.filter(l => l.points < 0).reduce((s, l) => s + l.points, 0);
    setMySummary({ merit, demerit, net: merit + demerit, logs });
    setLoading(false);
  }

  async function loadClassStudents(cls) {
    setSelectedClass(cls);
    setSelectedAdms(new Set());
    setMsg('');
    if (!cls) {
      setStudents([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('adm_no, name, roll_no')
      .eq('class_name', cls)
      .order('roll_no', { ascending: true, nullsFirst: false })
      .order('name');
    setStudents(data || []);
    setLoading(false);
  }

  function handleReasonSelect(id) {
    setSelectedReasonId(id);
    const found = reasons.find(r => String(r.id) === String(id));
    if (found) setCustomPoints(String(found.points));
    else setCustomPoints('');
  }

  function toggleStudent(admNo) {
    setSelectedAdms(prev => {
      const next = new Set(prev);
      if (next.has(admNo)) next.delete(admNo);
      else next.add(admNo);
      return next;
    });
  }

  // Single Batch Insert (Zero Lag)
  async function submitPoints() {
    const rsn = reasons.find(r => String(r.id) === String(selectedReasonId));
    if (!selectedClass || !rsn || selectedAdms.size === 0) {
      return alert('Select class, reason, and at least one student.');
    }
    const pts = Number(customPoints);
    if (!pts) return alert('Enter valid points.');

    setLoading(true);
    setMsg('');

    const rows = Array.from(selectedAdms).map(admNo => ({
      adm_no: admNo,
      class_name: selectedClass,
      category: rsn.category,
      reason: rsn.title,
      points: pts,
      remarks: remarks.trim() || null,
      recorded_by: user?.name || 'Staff',
      academic_year: '2026-27'
    }));

    const { error } = await supabase.from('activity_points').insert(rows);
    setLoading(false);
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
      setMsg(`${pts > 0 ? '+' : ''}${pts} points recorded for ${rows.length} student(s).`);
      setSelectedAdms(new Set());
      setRemarks('');
    }
  }

  // Load Class Ranking & Discipline Report
  async function loadClassReport(cls) {
    setReportClass(cls);
    setMsg('');
    if (!cls) {
      setReportRows([]);
      setRecentLogs([]);
      return;
    }
    setLoading(true);

    const [{ data: stData }, { data: ptData }] = await Promise.all([
      supabase
        .from('students')
        .select('adm_no, name, roll_no')
        .eq('class_name', cls)
        .order('roll_no', { ascending: true, nullsFirst: false })
        .order('name'),
      supabase
        .from('activity_points')
        .select('*')
        .eq('class_name', cls)
        .order('created_at', { ascending: false })
    ]);

    const agg = {};
    (ptData || []).forEach(p => {
      if (!agg[p.adm_no]) agg[p.adm_no] = { merit: 0, demerit: 0, count: 0 };
      if (p.points > 0) agg[p.adm_no].merit += p.points;
      else agg[p.adm_no].demerit += p.points;
      agg[p.adm_no].count += 1;
    });

    const rows = (stData || []).map(s => {
      const a = agg[s.adm_no] || { merit: 0, demerit: 0, count: 0 };
      const net = a.merit + a.demerit;
      return {
        adm_no: s.adm_no,
        name: s.name,
        merit: a.merit,
        demerit: a.demerit,
        net,
        standing: getStanding(net)
      };
    });

    rows.sort((a, b) => b.net - a.net);
    rows.forEach((r, idx) => { r.rank = idx + 1; });

    setReportRows(rows);
    setRecentLogs((ptData || []).slice(0, 25));
    setLoading(false);
  }

  async function deleteLog(id) {
    if (!window.confirm('Delete this activity entry?')) return;
    await supabase.from('activity_points').delete().eq('id', id);
    loadClassReport(reportClass);
  }

  // Add / Delete Reasons (Admin)
  async function addReason(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newPoints) return;
    const val = Math.abs(Number(newPoints));
    const finalPts = newType === 'demerit' ? -val : val;

    setLoading(true);
    const { error } = await supabase.from('activity_reasons').insert({
      title: newTitle.trim(),
      category: newCategory,
      points: finalPts
    });
    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else {
      setNewTitle('');
      setNewPoints('5');
      loadInitial();
    }
  }

  async function deleteReason(id) {
    if (!window.confirm('Delete this reason?')) return;
    await supabase.from('activity_reasons').delete().eq('id', id);
    loadInitial();
  }

  // Export Helpers
  function downloadCSV(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF(elId, filename) {
    const el = document.getElementById(elId);
    if (!el) return;
    html2pdf().set({
      margin: 8, filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  async function downloadJPEG(elId, filename) {
    const el = document.getElementById(elId);
    if (!el) return;
    const worker = html2pdf().set({
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
    }).from(el);
    const canvas = await worker.toCanvas().get('canvas');
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  }

  // ==========================================
  // STUDENT / PARENT SELF-VIEW
  // ==========================================
  if (isStudent) {
    const standing = mySummary ? getStanding(mySummary.net) : null;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Activity & Conduct</h2>
        </div>

        {loading || !mySummary ? (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{user.name}</div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: standing.bg, color: standing.color }}>
                  {standing.label}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: '#ecfdf5', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#047857' }}>Merit (+)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#047857' }}>+{mySummary.merit}</div>
                </div>
                <div style={{ background: '#fef2f2', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#dc2626' }}>Demerit (-)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{mySummary.demerit}</div>
                </div>
                <div style={{ background: '#eff6ff', padding: 10, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#1d4ed8' }}>Net Score</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{mySummary.net > 0 ? `+${mySummary.net}` : mySummary.net}</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 10 }}>Activity History</div>
              {mySummary.logs.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>No records yet.</p>
              ) : (
                mySummary.logs.map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{l.reason}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {l.category} • {String(l.created_at).slice(0, 10)} • {l.recorded_by}
                      </div>
                      {l.remarks && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{l.remarks}</div>}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: l.points > 0 ? '#16a34a' : '#dc2626' }}>
                      {l.points > 0 ? `+${l.points}` : l.points}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // STAFF / ADMIN VIEW
  // ==========================================
  const meritReasons = reasons.filter(r => r.points > 0);
  const demeritReasons = reasons.filter(r => r.points < 0);

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Activity & Conduct</h2>
      </div>

      {/* TOP TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 4 }}>
        {[
          { id: 'entry', label: 'Point Entry' },
          { id: 'report', label: 'Ranking & Report' },
          { id: 'reasons', label: 'Reasons' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(''); }}
            style={{
              flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2e44d2' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 1: SINGLE / BULK MERIT (+) & DEMERIT (-)      */}
      {/* ================================================= */}
      {tab === 'entry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Class</label>
              <select value={selectedClass} onChange={e => loadClassStudents(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4, background: '#fff', fontWeight: 600 }}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Merit (+) / Demerit (-) Reason</label>
              <select value={selectedReasonId} onChange={e => handleReasonSelect(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4, background: '#fff', fontWeight: 600 }}>
                <option value="">Select Reason</option>
                <optgroup label="Merit (+)">
                  {meritReasons.map(r => (
                    <option key={r.id} value={r.id}>+{r.points} | {r.title} ({r.category})</option>
                  ))}
                </optgroup>
                <optgroup label="Demerit (-)">
                  {demeritReasons.map(r => (
                    <option key={r.id} value={r.id}>{r.points} | {r.title} ({r.category})</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 2fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Points</label>
                <input
                  type="number"
                  value={customPoints}
                  onChange={e => setCustomPoints(e.target.value)}
                  placeholder="+5 / -5"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4, fontWeight: 800, color: Number(customPoints) < 0 ? '#dc2626' : '#16a34a' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Remarks (Optional)</label>
                <input
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Short note..."
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4 }}
                />
              </div>
            </div>
          </div>

          {students.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#334155', padding: '0 4px' }}>
                <span>Selected: {selectedAdms.size} / {students.length}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setSelectedAdms(new Set(students.map(s => s.adm_no)))} style={{ border: 'none', background: 'none', color: '#2e44d2', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Select All</button>
                  <button onClick={() => setSelectedAdms(new Set())} style={{ border: 'none', background: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Clear</button>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {students.map((s, idx) => {
                  const checked = selectedAdms.has(s.adm_no);
                  return (
                    <div
                      key={s.adm_no}
                      onClick={() => toggleStudent(s.adm_no)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        background: checked ? '#eff6ff' : '#fff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {checked ? <CheckSquare size={18} color="#2e44d2" /> : <Square size={18} color="#cbd5e1" />}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {s.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={submitPoints}
                disabled={loading}
                style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: Number(customPoints) < 0 ? '#dc2626' : '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Save size={16} /> {loading ? 'Saving...' : `Record Points (${selectedAdms.size})`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 2: CLASS RANKING & DISCIPLINE REPORT          */}
      {/* ================================================= */}
      {tab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select value={reportClass} onChange={e => loadClassReport(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
            <option value="">Select Class</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {reportRows.length > 0 && (
            <>
              <div id="nhia-activity-report" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, overflowX: 'auto' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>TARBIYAH & CONDUCT REPORT — {reportClass}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Noorul Hidaya Islamic Academy • 2026–27</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <thead style={{ background: '#1e293b', color: '#fff' }}>
                    <tr>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Rank</th>
                      <th style={{ padding: 7, border: '1px solid #334155', textAlign: 'left' }}>Student</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Merit (+)</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Demerit (-)</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Net</th>
                      <th style={{ padding: 7, border: '1px solid #334155' }}>Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map(r => (
                      <tr key={r.adm_no}>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700 }}>#{r.rank}</td>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', fontWeight: 700 }}>
                          {r.name} <span style={{ color: '#64748b', fontWeight: 400 }}>({r.adm_no})</span>
                        </td>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>+{r.merit}</td>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{r.demerit}</td>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800, color: r.net < 0 ? '#dc2626' : '#2e44d2' }}>
                          {r.net > 0 ? `+${r.net}` : r.net}
                        </td>
                        <td style={{ padding: 7, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: r.standing.bg, color: r.standing.color }}>
                            {r.standing.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <button onClick={() => downloadPDF('nhia-activity-report', `Conduct_Report_${reportClass}.pdf`)} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Download size={14} /> PDF
                </button>
                <button onClick={() => downloadJPEG('nhia-activity-report', `Conduct_Report_${reportClass}.jpg`)} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <ImageIcon size={14} /> JPEG
                </button>
                <button
                  onClick={() => downloadCSV(
                    `Conduct_Report_${reportClass}.csv`,
                    ['Rank', 'Adm No', 'Name', 'Merit (+)', 'Demerit (-)', 'Net Score', 'Standing'],
                    reportRows.map(r => [r.rank, r.adm_no, r.name, r.merit, r.demerit, r.net, r.standing.label])
                  )}
                  style={{ padding: 11, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                >
                  <FileSpreadsheet size={14} /> Excel
                </button>
              </div>

              {/* RECENT LOGS WITH UNDO */}
              {recentLogs.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Recent Entries ({reportClass})</div>
                  {recentLogs.map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Adm {l.adm_no} — {l.reason}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{String(l.created_at).slice(0, 10)} • {l.recorded_by}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 800, color: l.points > 0 ? '#16a34a' : '#dc2626' }}>
                          {l.points > 0 ? `+${l.points}` : l.points}
                        </span>
                        {isAdmin && (
                          <Trash2 size={14} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => deleteLog(l.id)} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: REASONS & CATEGORIES MANAGER               */}
      {/* ================================================= */}
      {tab === 'reasons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isAdmin && (
            <form onSubmit={addReason} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Add New Reason</div>
              <input required value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Reason title (e.g. Library Research, Late Return)" style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: 8 }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={newType} onChange={e => setNewType(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                  <option value="merit">Merit (+)</option>
                  <option value="demerit">Demerit (-)</option>
                </select>
                <input required type="number" min="1" value={newPoints} onChange={e => setNewPoints(e.target.value)} placeholder="Pts" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }} />
              </div>
              <button type="submit" disabled={loading} style={{ padding: 10, borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Add Reason
              </button>
            </form>
          )}

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {reasons.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.category}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 12, padding: '3px 8px', borderRadius: 6, background: r.points > 0 ? '#dcfce7' : '#fee2e2', color: r.points > 0 ? '#15803d' : '#dc2626' }}>
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </span>
                  {isAdmin && (
                    <Trash2 size={14} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => deleteReason(r.id)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}