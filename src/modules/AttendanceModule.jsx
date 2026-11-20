import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ClipboardCheck, Edit3, Save,
  Copy, Download, FileSpreadsheet, UserCheck, Trash2
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const DEFAULT_SESSIONS = [
  'Friday Register',
  'Morning Assembly',
  'Maghrib / Isha Prayer',
  'Night Study',
  'Special Program',
  'Custom...'
];

export default function AttendanceModule({ onBack, user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [mainTab, setMainTab] = useState('spot'); // 'spot' | 'monthly'
  const [classes, setClasses] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Admin Class Teacher Assignment State
  const [assignClass, setAssignClass] = useState('');
  const [assignStaff, setAssignStaff] = useState('');

  // Spot Attendance State
  const [spotView, setSpotView] = useState('take'); // 'take' | 'history'
  const [spotDate, setSpotDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [spotSession, setSpotSession] = useState('Friday Register');
  const [customSession, setCustomSession] = useState('');
  const [spotClass, setSpotClass] = useState('');
  const [spotStudents, setSpotStudents] = useState([]);
  const [spotMap, setSpotMap] = useState({});
  const [historyList, setHistoryList] = useState([]);

  // Monthly Ledger State
  const [monthYear, setMonthYear] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthlyClass, setMonthlyClass] = useState('');
  const [workingDays, setWorkingDays] = useState('25');
  const [monthlyStudents, setMonthlyStudents] = useState([]);
  const [monthlyMap, setMonthlyMap] = useState({});

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    const [{ data: st }, { data: ta }, { data: ct }] = await Promise.all([
      supabase.from('students').select('class_name'),
      supabase.from('teacher_assignments').select('staff_id, staff_name'),
      supabase.from('class_teachers').select('*').order('class_name')
    ]);

    if (st) {
      setClasses([...new Set(st.map(d => d.class_name).filter(Boolean))].sort());
    }
    if (ta) {
      const uniqueStaff = [];
      const seen = new Set();
      ta.forEach(t => {
        const key = String(t.staff_name || '').trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          uniqueStaff.push({ staff_id: t.staff_id || '', staff_name: t.staff_name.trim() });
        }
      });
      uniqueStaff.sort((a, b) => a.staff_name.localeCompare(b.staff_name));
      setStaffList(uniqueStaff);
    }
    if (ct) {
      setClassTeachers(ct);
    }
  }

  // Filter classes allowed for Monthly Ledger
  const uId = String(user?.staff_id || user?.id || '').trim().toLowerCase();
  const uName = String(user?.name || '').trim().toLowerCase();

  const myAssignedClasses = isAdmin
    ? classes
    : classTeachers
        .filter(ct => {
          const ctId = String(ct.staff_id || '').trim().toLowerCase();
          const ctName = String(ct.staff_name || '').trim().toLowerCase();
          return (uId && ctId === uId) || (uName && ctName === uName);
        })
        .map(ct => ct.class_name);

  // Admin: Assign Class Teacher
  async function handleAssignClassTeacher() {
    if (!assignClass || !assignStaff) return alert('Class-um Teacher-um select cheyyuka!');
    const staffObj = staffList.find(s => s.staff_name === assignStaff);
    setLoading(true);
    setMsg('');

    const { error } = await supabase.from('class_teachers').upsert(
      {
        class_name: assignClass,
        staff_id: staffObj?.staff_id || '',
        staff_name: assignStaff
      },
      { onConflict: 'class_name' }
    );

    setLoading(false);
    if (error) {
      setMsg('❌ Error: ' + error.message);
    } else {
      setMsg(`✅ ${assignClass} Class Teacher aayi ${assignStaff}-ne assign cheythu!`);
      setAssignClass('');
      setAssignStaff('');
      loadInitialData();
    }
  }

  async function removeClassTeacher(clsName) {
    if (!window.confirm(`${clsName} class teacher assignment remove cheyyano?`)) return;
    await supabase.from('class_teachers').delete().eq('class_name', clsName);
    loadInitialData();
  }

  const activeSessionName = spotSession === 'Custom...' ? customSession.trim() : spotSession;

  // ==========================================
  // SPOT ATTENDANCE FUNCTIONS
  // ==========================================
  async function loadSpotStudents(clsParam, dateParam, sessParam) {
    const targetCls = clsParam || spotClass;
    const targetDate = dateParam || spotDate;
    const targetSess = sessParam || activeSessionName;

    if (!targetCls || !targetDate || !targetSess) {
      return alert('Date, Session, Class ellam select cheyyuka!');
    }

    setLoading(true);
    setMsg('');

    const [{ data: stData }, { data: attData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', targetCls).order('adm_no'),
      supabase.from('spot_attendance')
        .select('*')
        .eq('class_name', targetCls)
        .eq('session_date', targetDate)
        .eq('session_name', targetSess)
    ]);

    const map = {};
    (stData || []).forEach(s => { map[s.adm_no] = 'P'; });
    (attData || []).forEach(a => { map[a.adm_no] = a.status; });

    setSpotStudents(stData || []);
    setSpotMap(map);
    setLoading(false);

    if (attData && attData.length > 0) {
      setMsg(`✏️ Existing attendance loaded (${targetDate} - ${targetSess}). Edit cheythu Save cheyyaam.`);
    }
  }

  function markAllSpot(status) {
    const updated = {};
    spotStudents.forEach(s => { updated[s.adm_no] = status; });
    setSpotMap(updated);
  }

  async function saveSpotAttendance() {
    if (spotStudents.length === 0) return;
    setLoading(true);
    setMsg('');

    const rows = spotStudents.map(s => ({
      session_date: spotDate,
      session_name: activeSessionName,
      class_name: spotClass,
      adm_no: s.adm_no,
      status: spotMap[s.adm_no] || 'P',
      taken_by: user?.name || 'Staff'
    }));

    const { error } = await supabase
      .from('spot_attendance')
      .upsert(rows, { onConflict: 'session_date,session_name,adm_no' });

    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else setMsg(`✅ ${spotClass} (${activeSessionName}) attendance save aayi!`);
  }

  async function loadSpotHistory() {
    setLoading(true);
    setMsg('');
    const { data, error } = await supabase
      .from('spot_attendance')
      .select('session_date, session_name, class_name, status, taken_by')
      .order('session_date', { ascending: false })
      .limit(1000);

    setLoading(false);
    if (error) return setMsg('❌ Error: ' + error.message);

    const grouped = {};
    (data || []).forEach(r => {
      const key = `${r.session_date}__${r.session_name}__${r.class_name}`;
      if (!grouped[key]) {
        grouped[key] = {
          date: r.session_date,
          session: r.session_name,
          className: r.class_name,
          takenBy: r.taken_by,
          P: 0, A: 0, L: 0, total: 0
        };
      }
      grouped[key][r.status] = (grouped[key][r.status] || 0) + 1;
      grouped[key].total += 1;
    });

    setHistoryList(Object.values(grouped));
  }

  function openForEdit(h) {
    setSpotDate(h.date);
    if (DEFAULT_SESSIONS.includes(h.session)) {
      setSpotSession(h.session);
    } else {
      setSpotSession('Custom...');
      setCustomSession(h.session);
    }
    setSpotClass(h.className);
    setSpotView('take');
    loadSpotStudents(h.className, h.date, h.session);
  }

  function copyWhatsAppAbsentees() {
    const absentees = spotStudents.filter(s => spotMap[s.adm_no] === 'A');
    const leaves = spotStudents.filter(s => spotMap[s.adm_no] === 'L');
    const presentCount = spotStudents.filter(s => spotMap[s.adm_no] === 'P').length;

    let text = `*NHIA ATTENDANCE REPORT*\n`;
    text += `📅 Date: ${spotDate}\n`;
    text += `📌 Session: ${activeSessionName}\n`;
    text += `🏫 Class: ${spotClass}\n`;
    text += `✅ Present: ${presentCount} | ❌ Absent: ${absentees.length} | 🟡 Leave: ${leaves.length}\n\n`;

    if (absentees.length > 0) {
      text += `*❌ ABSENTEES:*\n`;
      absentees.forEach((s, i) => { text += `${i + 1}. ${s.name} (${s.adm_no})\n`; });
    } else {
      text += `✅ *All Students Present!*\n`;
    }

    if (leaves.length > 0) {
      text += `\n*🟡 ON LEAVE:*\n`;
      leaves.forEach((s, i) => { text += `${i + 1}. ${s.name} (${s.adm_no})\n`; });
    }

    navigator.clipboard.writeText(text);
    setMsg('📋 WhatsApp Absentees Report copy cheythu!');
  }

  // ==========================================
  // MONTHLY HARD-LEDGER FUNCTIONS
  // ==========================================
  async function loadMonthlyStudents() {
    if (!monthlyClass || !monthYear) return alert('Month-um Class-um select cheyyuka!');
    setLoading(true);
    setMsg('');

    const [{ data: stData }, { data: mData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', monthlyClass).order('adm_no'),
      supabase.from('monthly_attendance')
        .select('*')
        .eq('class_name', monthlyClass)
        .eq('month_year', monthYear)
    ]);

    const map = {};
    if (mData && mData.length > 0) {
      setWorkingDays(String(mData[0].working_days || 25));
      mData.forEach(r => { map[r.adm_no] = String(r.present_days ?? ''); });
    }

    setMonthlyStudents(stData || []);
    setMonthlyMap(map);
    setLoading(false);
  }

  async function saveMonthlyLedger() {
    const wd = Number(workingDays);
    if (!wd || wd <= 0) return alert('Total Working Days krithyamaayi nalkuka!');
    setLoading(true);
    setMsg('');

    const rows = [];
    monthlyStudents.forEach(s => {
      const val = monthlyMap[s.adm_no];
      if (val === undefined || val === '') return;
      rows.push({
        adm_no: s.adm_no,
        class_name: monthlyClass,
        month_year: monthYear,
        working_days: wd,
        present_days: Number(val),
        entered_by: user?.name || 'Class Teacher'
      });
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ Save cheyyaan present days onnum nalkiyittilla.');
    }

    const { error } = await supabase
      .from('monthly_attendance')
      .upsert(rows, { onConflict: 'adm_no,month_year' });

    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else setMsg(`✅ ${rows.length} kuttikalude ${monthYear} monthly attendance save aayi!`);
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

  const pCount = spotStudents.filter(s => spotMap[s.adm_no] === 'P').length;
  const aCount = spotStudents.filter(s => spotMap[s.adm_no] === 'A').length;
  const lCount = spotStudents.filter(s => spotMap[s.adm_no] === 'L').length;

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Attendance Portal</h2>
      </div>

      {/* MAIN MODE SWITCHER */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 4 }}>
        <button
          onClick={() => { setMainTab('spot'); setMsg(''); }}
          style={{
            flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            background: mainTab === 'spot' ? '#fff' : 'transparent',
            color: mainTab === 'spot' ? '#2e44d2' : '#475569'
          }}
        >
          ⚡ Spot / Register (All Staff)
        </button>
        <button
          onClick={() => { setMainTab('monthly'); setMsg(''); }}
          style={{
            flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            background: mainTab === 'monthly' ? '#fff' : 'transparent',
            color: mainTab === 'monthly' ? '#2e44d2' : '#475569'
          }}
        >
          📒 Monthly Ledger (Class Tr)
        </button>
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* ================================================= */}
      {/* TYPE 1: SPOT / SESSION ATTENDANCE                 */}
      {/* ================================================= */}
      {mainTab === 'spot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSpotView('take')} style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: spotView === 'take' ? '#16a34a' : '#f1f5f9', color: spotView === 'take' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ClipboardCheck size={15} /> Take Attendance
            </button>
            <button onClick={() => { setSpotView('history'); loadSpotHistory(); }} style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: spotView === 'history' ? '#0284c7' : '#f1f5f9', color: spotView === 'history' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Edit3 size={15} /> Edit / History
            </button>
          </div>

          {spotView === 'take' ? (
            <>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Date</label>
                    <input type="date" value={spotDate} onChange={e => setSpotDate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Class</label>
                    <select value={spotClass} onChange={e => setSpotClass(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                      <option value="">-- Select --</option>
                      {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Session / Register Type</label>
                  <select value={spotSession} onChange={e => setSpotSession(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                    {DEFAULT_SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {spotSession === 'Custom...' && (
                  <input value={customSession} onChange={e => setCustomSession(e.target.value)} placeholder="Session peru nalkuka..." style={{ padding: 10, borderRadius: 10, border: '1px solid #93c5fd', fontSize: 13 }} />
                )}

                <button onClick={() => loadSpotStudents()} disabled={loading} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {loading ? 'Loading...' : 'Load Students'}
                </button>
              </div>

              {spotStudents.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 800 }}>
                      <span style={{ color: '#16a34a' }}>P: {pCount}</span>
                      <span style={{ color: '#dc2626' }}>A: {aCount}</span>
                      <span style={{ color: '#d97706' }}>L: {lCount}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => markAllSpot('P')} style={{ padding: '5px 9px', borderRadius: 8, border: 'none', background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>All P</button>
                      <button onClick={() => markAllSpot('A')} style={{ padding: '5px 9px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>All A</button>
                    </div>
                  </div>

                  <div id="nhia-spot-sheet" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: '#eef2ff', fontSize: 12, fontWeight: 800, color: '#2e44d2', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{spotClass} — {activeSessionName}</span>
                      <span>{spotDate}</span>
                    </div>
                    {spotStudents.map((s, idx) => {
                      const st = spotMap[s.adm_no] || 'P';
                      return (
                        <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {s.name}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>Adm: {s.adm_no}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {[
                              { k: 'P', bg: '#16a34a', light: '#dcfce7', txt: '#15803d' },
                              { k: 'A', bg: '#dc2626', light: '#fee2e2', txt: '#dc2626' },
                              { k: 'L', bg: '#d97706', light: '#fef3c7', txt: '#b45309' }
                            ].map(b => (
                              <button key={b.k} onClick={() => setSpotMap(prev => ({ ...prev, [s.adm_no]: b.k }))} style={{ width: 34, height: 32, borderRadius: 8, border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer', background: st === b.k ? b.bg : b.light, color: st === b.k ? '#fff' : b.txt }}>
                                {b.k}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={saveSpotAttendance} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Save size={16} /> {loading ? 'Saving...' : 'SAVE ATTENDANCE'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <button onClick={copyWhatsAppAbsentees} style={{ padding: 10, borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Copy size={13} /> WhatsApp
                    </button>
                    <button onClick={() => downloadPDF('nhia-spot-sheet', `${spotClass}_${activeSessionName}_${spotDate}.pdf`)} style={{ padding: 10, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Download size={13} /> PDF
                    </button>
                    <button onClick={() => downloadCSV(`${spotClass}_${activeSessionName}_${spotDate}.csv`, ['Adm No', 'Student Name', 'Status', 'Date', 'Session'], spotStudents.map(s => [s.adm_no, s.name, spotMap[s.adm_no] || 'P', spotDate, activeSessionName]))} style={{ padding: 10, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <FileSpreadsheet size={13} /> Excel
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Recent Attendance Sessions</h4>
              {historyList.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 16 }}>Attendance records onnumilla.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historyList.map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{h.className} — {h.session}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>📅 {h.date} • By: {h.takenBy}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, display: 'flex', gap: 8 }}>
                          <span style={{ color: '#16a34a' }}>P: {h.P}</span>
                          <span style={{ color: '#dc2626' }}>A: {h.A}</span>
                          <span style={{ color: '#d97706' }}>L: {h.L}</span>
                        </div>
                      </div>
                      <button onClick={() => openForEdit(h)} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Edit</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================= */}
      {/* TYPE 2: MONTHLY HARD-LEDGER (CLASS TEACHER ONLY)  */}
      {/* ================================================= */}
      {mainTab === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ADMIN PANEL: ASSIGN CLASS TEACHERS */}
          {isAdmin && (
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2', display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={16} /> Assign Class Teachers (Admin)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8 }}>
                <select value={assignClass} onChange={e => setAssignClass(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                  <option value="">-- Class --</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={assignStaff} onChange={e => setAssignStaff(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                  <option value="">-- Select Teacher --</option>
                  {staffList.map(s => <option key={s.staff_name} value={s.staff_name}>{s.staff_name}</option>)}
                </select>
              </div>
              <button onClick={handleAssignClassTeacher} disabled={loading} style={{ padding: 9, borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Assign Class Teacher
              </button>

              {classTeachers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {classTeachers.map(ct => (
                    <span key={ct.id} style={{ fontSize: 11, fontWeight: 700, background: '#eef2ff', color: '#1e3a8a', padding: '4px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {ct.class_name}: {ct.staff_name}
                      <Trash2 size={12} style={{ cursor: 'pointer', color: '#dc2626' }} onClick={() => removeClassTeacher(ct.class_name)} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LOCK CHECK FOR NON-CLASS TEACHERS */}
          {myAssignedClasses.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #fecaca', textAlign: 'center', color: '#dc2626', fontSize: 13, fontWeight: 700 }}>
              🔒 നിങ്ങൾക്ക് ഇതുവരെ ക്ലാസ്സ് ടീച്ചർ ചുമതല നൽകിയിട്ടില്ല. Monthly Ledger അപ്‌ഡേറ്റ് ചെയ്യാൻ അഡ്മിനുമായി ബന്ധപ്പെടുക.
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Month</label>
                    <input type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Assigned Class</label>
                    <select value={monthlyClass} onChange={e => setMonthlyClass(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                      <option value="">-- Select --</option>
                      {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={loadMonthlyStudents} disabled={loading} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {loading ? 'Loading...' : 'Load Class Register'}
                </button>
              </div>

              {monthlyStudents.length > 0 && (
                <>
                  <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Total Working Days ({monthYear}):</span>
                    <input type="number" value={workingDays} onChange={e => setWorkingDays(e.target.value)} style={{ width: 70, padding: 8, textAlign: 'center', borderRadius: 8, border: '2px solid #2e44d2', fontWeight: 800, fontSize: 14 }} />
                  </div>

                  <div id="nhia-monthly-sheet" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: '#1e293b', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Monthly Ledger — {monthlyClass} ({monthYear})</span>
                      <span>Working Days: {workingDays}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: 9, textAlign: 'left' }}>Student</th>
                          <th style={{ padding: 9, textAlign: 'center' }}>Present Days</th>
                          <th style={{ padding: 9, textAlign: 'center' }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyStudents.map(s => {
                          const val = monthlyMap[s.adm_no] ?? '';
                          const wd = Number(workingDays) || 0;
                          const perc = val !== '' && wd > 0 ? ((Number(val) / wd) * 100).toFixed(1) : '-';
                          const isLow = perc !== '-' && Number(perc) < 75;
                          return (
                            <tr key={s.adm_no} style={{ borderBottom: '1px solid #f1f5f9', background: isLow ? '#fef2f2' : '#fff' }}>
                              <td style={{ padding: 9, fontWeight: 600 }}>
                                {s.name}<div style={{ fontSize: 10, color: '#64748b' }}>{s.adm_no}</div>
                              </td>
                              <td style={{ padding: 6, textAlign: 'center' }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={val}
                                  onChange={e => {
                                    if (e.target.value !== '' && Number(e.target.value) > wd) return alert(`Working days (${wd})-il kooduthal nalkaan kazhiyilla!`);
                                    setMonthlyMap(prev => ({ ...prev, [s.adm_no]: e.target.value }));
                                  }}
                                  style={{ width: 65, padding: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 700 }}
                                />
                              </td>
                              <td style={{ padding: 9, textAlign: 'center', fontWeight: 800, color: isLow ? '#dc2626' : '#16a34a' }}>
                                {perc === '-' ? '-' : `${perc}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <button onClick={saveMonthlyLedger} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Save size={16} /> {loading ? 'Saving...' : 'SAVE MONTHLY LEDGER'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => downloadPDF('nhia-monthly-sheet', `Monthly_Attendance_${monthlyClass}_${monthYear}.pdf`)} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Download size={14} /> Download PDF
                    </button>
                    <button
                      onClick={() => downloadCSV(
                        `Monthly_Attendance_${monthlyClass}_${monthYear}.csv`,
                        ['Adm No', 'Student Name', 'Working Days', 'Present Days', 'Percentage'],
                        monthlyStudents.map(s => {
                          const v = monthlyMap[s.adm_no] ?? '';
                          const wd = Number(workingDays) || 0;
                          const p = v !== '' && wd > 0 ? `${((Number(v) / wd) * 100).toFixed(1)}%` : '-';
                          return [s.adm_no, s.name, wd, v, p];
                        })
                      )}
                      style={{ padding: 11, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <FileSpreadsheet size={14} /> Download Excel
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}