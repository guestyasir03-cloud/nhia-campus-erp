import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { exportReportPDF, exportReportJPEG, exportReportCSV } from '../lib/exportReport';
import {
  CalendarClock, Plus, CheckCircle2, Trash2, BarChart3,
  FileSpreadsheet, FileText, Image as ImageIcon, Search,
  ChevronRight, ArrowLeft, Users, AlertTriangle
} from 'lucide-react';

function formatAMPM(timeStr) {
  if (!timeStr) return '';
  const [hStr, m] = timeStr.split(':');
  let h = Number(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getNowTimeStr() {
  return new Date().toTimeString().slice(0, 5);
}

function calculateLeaveHours(d) {
  if (!d.start_date) return 0;
  const start = new Date(`${d.start_date}T${d.start_time || '00:00'}`);
  const end = d.status === 'Returned' && d.return_date
    ? new Date(`${d.return_date}T${d.return_time || '00:00'}`)
    : new Date();
  const diff = end - start;
  return diff > 0 ? diff / (1000 * 60 * 60) : 0;
}

function formatDuration(totalHours) {
  if (!totalHours || totalHours <= 0) return '0 Hrs';
  const d = Math.floor(totalHours / 24);
  const h = Math.floor(totalHours % 24);
  if (d > 0 && h > 0) return `${d}d ${h}h`;
  if (d > 0) return `${d} Days`;
  return `${h} Hrs`;
}

export default function LeaveModule({ user }) {
  const role = (user?.role || '').toLowerCase();
  const isAdmin = role.includes('admin') || role.includes('principal') || user?.isAdmin === true;
  const isStudent = role === 'student';

  const [tab, setTab] = useState('active'); // 'active' | 'add' | 'reports' | 'insights'
  const [leaves, setLeaves] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Active class drill-down
  const [selectedClassView, setSelectedClassView] = useState(null);

  // Return modal state
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnDate, setReturnDate] = useState(getTodayStr());
  const [returnTime, setReturnTime] = useState(getNowTimeStr());
  const [saving, setSaving] = useState(false);

  // Add Leave Form State
  const [allClassMode, setAllClassMode] = useState(false);
  const [formClass, setFormClass] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [leaveType, setLeaveType] = useState('Home/Casual');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState(getTodayStr());
  const [startTime, setStartTime] = useState(getNowTimeStr());
  const [expEndDate, setExpEndDate] = useState('');
  const [expEndTime, setExpEndTime] = useState('');

  // Report Filters
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterClass, setFilterClass] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const today = getTodayStr();

    // Auto-activate Upcoming leaves whose start_date has arrived
    await supabase
      .from('student_leaves')
      .update({ status: 'Active' })
      .eq('status', 'Upcoming')
      .lte('start_date', today);

    let leaveQuery = supabase
      .from('student_leaves')
      .select('*')
      .order('start_date', { ascending: false })
      .order('id', { ascending: false });

    if (isStudent && user?.adm_no) {
      leaveQuery = leaveQuery.eq('adm_no', String(user.adm_no));
    }

    const [{ data: lvData }, { data: stData }] = await Promise.all([
      leaveQuery,
      isStudent
        ? Promise.resolve({ data: [] })
        : supabase.from('students').select('adm_no, name, class_name').order('name')
    ]);

    setLeaves(lvData || []);
    setStudents(stData || []);
    setLoading(false);
  }

  const classList = useMemo(() => {
    return [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  }, [students]);

  const activeLeaves = useMemo(() => leaves.filter(l => l.status === 'Active'), [leaves]);
  const upcomingLeaves = useMemo(() => leaves.filter(l => l.status === 'Upcoming'), [leaves]);

  const classSummary = useMemo(() => {
    const map = {};
    activeLeaves.forEach(l => {
      map[l.class_name] = (map[l.class_name] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeLeaves]);

  // Autocomplete suggestions (Zero-Lag)
  const studentSuggestions = useMemo(() => {
    if (!formClass || !studentQuery.trim() || selectedStudent) return [];
    const q = studentQuery.toLowerCase();
    return students
      .filter(s => s.class_name === formClass && (
        (s.name || '').toLowerCase().includes(q) || String(s.adm_no).includes(q)
      ))
      .slice(0, 8);
  }, [students, formClass, studentQuery, selectedStudent]);

  // Filtered report rows
  const filteredReports = useMemo(() => {
    return leaves.filter(l => {
      if (filterClass !== 'All' && l.class_name !== filterClass) return false;
      if (filterStatus !== 'All' && l.status !== filterStatus) return false;
      if (filterFrom && l.start_date < filterFrom) return false;
      if (filterTo && l.start_date > filterTo) return false;
      return true;
    });
  }, [leaves, filterClass, filterStatus, filterFrom, filterTo]);

  // Insights calculations
  const insights = useMemo(() => {
    const classMap = {};
    const studentMap = {};
    leaves.forEach(l => {
      if (l.status === 'Upcoming') return;
      const hrs = calculateLeaveHours(l);
      classMap[l.class_name] = (classMap[l.class_name] || 0) + hrs;
      if (!studentMap[l.adm_no]) {
        studentMap[l.adm_no] = { adm_no: l.adm_no, name: l.student_name, class_name: l.class_name, totalHours: 0, count: 0 };
      }
      studentMap[l.adm_no].totalHours += hrs;
      studentMap[l.adm_no].count += 1;
    });
    const classRows = Object.entries(classMap).sort((a, b) => b[1] - a[1]);
    const studentRows = Object.values(studentMap).sort((a, b) => b.totalHours - a.totalHours);
    return { classRows, studentRows };
  }, [leaves]);

  async function handleSaveLeave(e) {
    e.preventDefault();
    if (!formClass) return alert('Select Class!');
    if (!allClassMode && !selectedStudent) return alert('Select a Student from the list!');
    if (!startDate) return alert('Select Start Date!');

    setSaving(true);
    setMsg('');

    // Duplicate prevention
    if (!allClassMode) {
      const hasOpen = leaves.some(
        l => String(l.adm_no) === String(selectedStudent.adm_no) && (l.status === 'Active' || l.status === 'Upcoming')
      );
      if (hasOpen) {
        setSaving(false);
        return alert(`${selectedStudent.name} already has an Active or Upcoming leave! Please mark them Returned first.`);
      }
    }

    const today = getTodayStr();
    const status = startDate > today ? 'Upcoming' : 'Active';
    const base = {
      class_name: formClass,
      leave_type: leaveType,
      reason: reason.trim(),
      start_date: startDate,
      start_time: startTime || '',
      exp_end_date: expEndDate || null,
      exp_end_time: expEndTime || '',
      status,
      issued_by: user?.name || 'Staff',
      academic_year: '2026-27'
    };

    const payload = allClassMode
      ? students
          .filter(s => s.class_name === formClass)
          .map(s => ({ ...base, adm_no: String(s.adm_no), student_name: s.name }))
      : [{ ...base, adm_no: String(selectedStudent.adm_no), student_name: selectedStudent.name }];

    if (payload.length === 0) {
      setSaving(false);
      return alert('No students found in this class.');
    }

    const { error } = await supabase.from('student_leaves').insert(payload);
    setSaving(false);

    if (error) {
      setMsg('❌ Error: ' + error.message);
    } else {
      setMsg(`✅ Leave saved for ${allClassMode ? `${payload.length} students in ${formClass}` : selectedStudent.name}!`);
      setStudentQuery('');
      setSelectedStudent(null);
      setReason('');
      setAllClassMode(false);
      await loadInitialData();
      setTab('active');
    }
  }

  async function handleConfirmReturn() {
    if (!returnTarget || !returnDate || !returnTime) return alert('Enter Return Date & Time!');
    setSaving(true);
    const { error } = await supabase
      .from('student_leaves')
      .update({
        status: 'Returned',
        return_date: returnDate,
        return_time: returnTime,
        returned_by: user?.name || 'Staff'
      })
      .eq('id', returnTarget.id);

    setSaving(false);
    if (error) {
      alert('Error updating: ' + error.message);
    } else {
      setReturnTarget(null);
      await loadInitialData();
    }
  }

  async function handleDeleteLeave(id) {
    if (!isAdmin) return;
    if (!window.confirm('Permanently delete this leave record?')) return;
    const { error } = await supabase.from('student_leaves').delete().eq('id', id);
    if (!error) setLeaves(prev => prev.filter(l => l.id !== id));
  }

  function handleExportCSV() {
    const headers = ['Adm No', 'Student Name', 'Class', 'Type', 'Reason', 'Start Date', 'Start Time', 'Return Date', 'Return Time', 'Duration', 'Status', 'Issued By', 'Returned By'];
    const rows = filteredReports.map(l => [
      l.adm_no, l.student_name, l.class_name, l.leave_type, l.reason || '-',
      l.start_date, formatAMPM(l.start_time) || '-', l.return_date || '-', formatAMPM(l.return_time) || '-',
      formatDuration(calculateLeaveHours(l)), l.status, l.issued_by, l.returned_by || '-'
    ]);
    exportReportCSV(`Leave_Report_${filterClass}`, headers, rows);
  }

  // STUDENT SELF VIEW
  if (isStudent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>My Leave History</div>
          {loading ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Loading...</div>
          ) : leaves.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No leave records found.</div>
          ) : (
            leaves.map(l => (
              <div key={l.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8, borderLeft: `4px solid ${l.status === 'Active' ? '#dc2626' : l.status === 'Upcoming' ? '#f59e0b' : '#16a34a'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                  <span>{l.leave_type}</span>
                  <span style={{ color: l.status === 'Active' ? '#dc2626' : '#16a34a' }}>{l.status}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  From: {l.start_date} {l.start_time ? `@ ${formatAMPM(l.start_time)}` : ''}
                  {l.return_date ? ` • Returned: ${l.return_date} @ ${formatAMPM(l.return_time)}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Duration: <b>{formatDuration(calculateLeaveHours(l))}</b> • Issued by: {l.issued_by}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* TOP TABS */}
      <div style={{ display: 'flex', gap: 6, background: '#e2e8f0', padding: 4, borderRadius: 12 }}>
        {[
          { id: 'active', label: `Active (${activeLeaves.length})` },
          { id: 'add', label: '+ Add Leave' },
          { id: 'reports', label: 'Reports' },
          { id: 'insights', label: 'Insights' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedClassView(null); setMsg(''); }}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: tab === t.id ? '#2e44d2' : 'transparent',
              color: tab === t.id ? '#fff' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      {/* TAB 1: ACTIVE LEAVES */}
      {tab === 'active' && (
        selectedClassView ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setSelectedClassView(null)}
              style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              <ArrowLeft size={15} /> Back to Summary ({selectedClassView})
            </button>

            {activeLeaves.filter(l => l.class_name === selectedClassView).map(item => (
              <div key={item.id} style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', borderLeft: '4px solid #dc2626' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.student_name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {item.adm_no} • {item.class_name}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fef2f2', color: '#dc2626' }}>
                    {item.leave_type}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>
                  Out: <b>{item.start_date}</b> {item.start_time ? `@ ${formatAMPM(item.start_time)}` : ''} • Duration: <b>{formatDuration(calculateLeaveHours(item))}</b>
                </div>
                {item.reason && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Reason: {item.reason}</div>}
                <div style={{ fontSize: 11, color: '#2e44d2', marginTop: 4 }}>Issued By: {item.issued_by}</div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { setReturnTarget(item); setReturnDate(getTodayStr()); setReturnTime(getNowTimeStr()); }}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <CheckCircle2 size={15} /> Mark as Returned
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteLeave(item.id)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarClock size={16} color="#dc2626" /> Current Active Leaves (Class-wise)
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>Loading...</div>
              ) : classSummary.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>No students currently on leave.</div>
              ) : (
                classSummary.map(([cls, count]) => (
                  <div
                    key={cls}
                    onClick={() => setSelectedClassView(cls)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{cls}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 12, padding: '3px 10px', borderRadius: 20 }}>
                        {count}
                      </span>
                      <ChevronRight size={16} color="#94a3b8" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {upcomingLeaves.length > 0 && (
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706', marginBottom: 8 }}>
                  Upcoming Scheduled Leaves ({upcomingLeaves.length})
                </div>
                {upcomingLeaves.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                    <div>
                      <b>{u.student_name}</b> ({u.class_name}) • Starts: {u.start_date}
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleDeleteLeave(u.id)} style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* TAB 2: ADD NEW LEAVE */}
      {tab === 'add' && (
        <form onSubmit={handleSaveLeave} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef2f2', padding: '10px 12px', borderRadius: 10, border: '1px solid #fecaca' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} /> Apply for Entire Class
            </span>
            <input type="checkbox" checked={allClassMode} onChange={e => { setAllClassMode(e.target.checked); setSelectedStudent(null); setStudentQuery(''); }} style={{ width: 18, height: 18 }} />
          </div>

          <select value={formClass} onChange={e => { setFormClass(e.target.value); setSelectedStudent(null); setStudentQuery(''); }} required style={{ padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}>
            <option value="">-- Select Class --</option>
            {classList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {!allClassMode && (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                disabled={!formClass}
                value={selectedStudent ? `${selectedStudent.name} (Adm: ${selectedStudent.adm_no})` : studentQuery}
                onChange={e => { setStudentQuery(e.target.value); setSelectedStudent(null); }}
                placeholder={formClass ? 'Type student name or Adm No...' : 'Select class first'}
                style={{ width: '100%', padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
              {studentSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 9, zIndex: 20, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {studentSuggestions.map(s => (
                    <div
                      key={s.adm_no}
                      onClick={() => { setSelectedStudent(s); setStudentQuery(s.name); }}
                      style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}
                    >
                      <b>{s.name}</b> <span style={{ color: '#64748b' }}>(Adm: {s.adm_no})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <select value={leaveType} onChange={e => setLeaveType(e.target.value)} required style={{ padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }}>
            <option value="Home/Casual">Home / Casual Leave</option>
            <option value="Medical">Medical Leave</option>
            <option value="Official/Program">Official / Program</option>
            <option value="Other">Other</option>
          </select>

          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (Optional)" style={{ padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Start Date *</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Exp. Return Date</label>
              <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Exp. Return Time</label>
              <input type="time" value={expEndTime} onChange={e => setExpEndTime(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>

          <button type="submit" disabled={saving} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            {saving ? 'Saving...' : 'Save Leave Entry'}
          </button>
        </form>
      )}

      {/* TAB 3: ADVANCED REPORTS */}
      {tab === 'reports' && (
        <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
              <option value="All">All Classes</option>
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Returned">Returned</option>
              <option value="Upcoming">Upcoming</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => exportReportPDF('leave-report-print', `Leave_Report_${filterClass}`)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>PDF</button>
            <button onClick={() => exportReportJPEG('leave-report-print', `Leave_Report_${filterClass}`)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>JPEG</button>
            <button onClick={handleExportCSV} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Excel / CSV</button>
          </div>

          <div id="leave-report-print" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={{ padding: 7, textAlign: 'left' }}>Date</th>
                  <th style={{ padding: 7, textAlign: 'left' }}>Student</th>
                  <th style={{ padding: 7, textAlign: 'left' }}>Class</th>
                  <th style={{ padding: 7, textAlign: 'left' }}>Duration</th>
                  <th style={{ padding: 7, textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 14, color: '#94a3b8' }}>No records found.</td></tr>
                ) : (
                  filteredReports.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: 7 }}>{r.start_date}</td>
                      <td style={{ padding: 7, fontWeight: 600 }}>{r.student_name}</td>
                      <td style={{ padding: 7 }}>{r.class_name}</td>
                      <td style={{ padding: 7 }}>{formatDuration(calculateLeaveHours(r))}</td>
                      <td style={{ padding: 7, fontWeight: 700, color: r.status === 'Active' ? '#dc2626' : '#16a34a' }}>{r.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LEAVE INSIGHTS */}
      {tab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={15} /> Top 5 Leave Takers
            </div>
            {insights.studentRows.slice(0, 5).map((s, idx) => (
              <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} <b>{s.name}</b> <small style={{ color: '#64748b' }}>({s.class_name})</small></span>
                <span style={{ fontWeight: 800, color: '#dc2626' }}>{formatDuration(s.totalHours)}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Class-wise Total Leave Duration</div>
            {insights.classRows.map(([cls, hrs]) => (
              <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{cls}</span>
                <span style={{ fontWeight: 800, color: '#dc2626' }}>{formatDuration(hrs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RETURN MODAL */}
      {returnTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', padding: 18, borderRadius: 14, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', marginBottom: 6 }}>Mark as Returned</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}><b>{returnTarget.student_name}</b> ({returnTarget.class_name})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setReturnTarget(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button disabled={saving} onClick={handleConfirmReturn} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}