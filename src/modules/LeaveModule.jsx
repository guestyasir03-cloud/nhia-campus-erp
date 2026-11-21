import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { exportReportPDF, exportReportJPEG, exportReportCSV } from '../lib/exportReport';
import {
  CalendarClock, CheckCircle2, Trash2, Search, ChevronRight,
  ArrowLeft, Users, AlertTriangle, Clock, Edit3, Share2,
  RefreshCw, CheckCheck, X
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

function isLeaveOverdue(d) {
  if (d.status !== 'Active' || !d.exp_end_date) return false;
  const exp = new Date(`${d.exp_end_date}T${d.exp_end_time || '23:59'}`);
  return new Date() > exp;
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

export default function LeaveModule({ user, onBack }) {
  const role = (user?.role || '').toLowerCase();
  const isAdmin = role.includes('admin') || role.includes('principal') || user?.isAdmin === true;
  const isStudent = role === 'student';

  const [tab, setTab] = useState('active'); // 'active' | 'add' | 'reports' | 'insights'
  const [leaves, setLeaves] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Active tab filters
  const [selectedClassView, setSelectedClassView] = useState(null);
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'overdue' | 'today' | 'upcoming'
  const [globalSearch, setGlobalSearch] = useState('');

  // Modals: Return & Extend/Edit
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnDate, setReturnDate] = useState(getTodayStr());
  const [returnTime, setReturnTime] = useState(getNowTimeStr());

  const [editTarget, setEditTarget] = useState(null);
  const [editExpDate, setEditExpDate] = useState('');
  const [editExpTime, setEditExpTime] = useState('');
  const [editReason, setEditReason] = useState('');
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
  const [reportSearch, setReportSearch] = useState('');
  const [reportSort, setReportSort] = useState('date_desc'); // 'date_desc' | 'class_asc' | 'name_asc' | 'duration_desc'
  const [reportView, setReportView] = useState('folders'); // 'folders' | 'table'
  const [openReportDates, setOpenReportDates] = useState({});
  const [insightSearch, setInsightSearch] = useState('');
  const [selectedStudentReport, setSelectedStudentReport] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    const today = getTodayStr();

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

   if (isStudent) {
      const adm = user?.adm_no || user?.username || user?.student_id;
      if (adm) {
        leaveQuery = leaveQuery.eq('adm_no', String(adm).trim());
      } else if (user?.name) {
        leaveQuery = leaveQuery.ilike('student_name', user.name.trim());
      } else {
        setLeaves([]);
        setLoading(false);
        return;
      }
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

  const todayStr = getTodayStr();

  const classList = useMemo(() => {
    return [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  }, [students]);

  const activeLeaves = useMemo(() => leaves.filter(l => l.status === 'Active'), [leaves]);
  const upcomingLeaves = useMemo(() => leaves.filter(l => l.status === 'Upcoming'), [leaves]);
  const overdueLeaves = useMemo(() => activeLeaves.filter(isLeaveOverdue), [activeLeaves]);
  const returningTodayLeaves = useMemo(
    () => activeLeaves.filter(l => l.exp_end_date === todayStr),
    [activeLeaves, todayStr]
  );

  // Filtered list for Active tab (Zero-Lag)
  const displayedActiveList = useMemo(() => {
    let base = quickFilter === 'upcoming'
      ? upcomingLeaves
      : quickFilter === 'overdue'
      ? overdueLeaves
      : quickFilter === 'today'
      ? returningTodayLeaves
      : activeLeaves;

    if (selectedClassView) {
      base = base.filter(l => l.class_name === selectedClassView);
    }

    const q = globalSearch.trim().toLowerCase();
    if (q) {
      base = base.filter(l =>
        (l.student_name || '').toLowerCase().includes(q) ||
        String(l.adm_no || '').toLowerCase().includes(q) ||
        (l.class_name || '').toLowerCase().includes(q)
      );
    }
    return base;
  }, [activeLeaves, upcomingLeaves, overdueLeaves, returningTodayLeaves, quickFilter, selectedClassView, globalSearch]);

  const classSummary = useMemo(() => {
    const map = {};
    activeLeaves.forEach(l => {
      if (!map[l.class_name]) map[l.class_name] = { total: 0, overdue: 0 };
      map[l.class_name].total += 1;
      if (isLeaveOverdue(l)) map[l.class_name].overdue += 1;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeLeaves]);

  // Autocomplete suggestions
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
    const q = reportSearch.trim().toLowerCase();
    const list = leaves.filter(l => {
      if (filterClass !== 'All' && l.class_name !== filterClass) return false;
      if (filterStatus !== 'All' && l.status !== filterStatus) return false;
      if (filterFrom && l.start_date < filterFrom) return false;
      if (filterTo && l.start_date > filterTo) return false;
      if (q) {
        const hit =
          (l.student_name || '').toLowerCase().includes(q) ||
          String(l.adm_no || '').toLowerCase().includes(q) ||
          (l.class_name || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (reportSort === 'name_asc') return (a.student_name || '').localeCompare(b.student_name || '');
      if (reportSort === 'class_asc') {
        const c = (a.class_name || '').localeCompare(b.class_name || '');
        return c !== 0 ? c : (a.student_name || '').localeCompare(b.student_name || '');
      }
      if (reportSort === 'duration_desc') return calculateLeaveHours(b) - calculateLeaveHours(a);
      return (b.start_date || '').localeCompare(a.start_date || '') || (b.id - a.id);
    });
  }, [leaves, filterClass, filterStatus, filterFrom, filterTo, reportSearch, reportSort]);

  const groupedReportsByDate = useMemo(() => {
    const map = {};
    filteredReports.forEach(r => {
      const dt = r.start_date || 'Unknown Date';
      if (!map[dt]) map[dt] = { date: dt, rows: [], overdueCount: 0 };
      map[dt].rows.push(r);
      if (isLeaveOverdue(r)) map[dt].overdueCount += 1;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredReports]);

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
    return {
      classRows: Object.entries(classMap).sort((a, b) => b[1] - a[1]),
      studentRows: Object.values(studentMap).sort((a, b) => b.totalHours - a.totalHours)
    };
  }, [leaves]);

  // Actions
  function shareWhatsAppPass(item) {
    const overdue = isLeaveOverdue(item);
    const text = overdue
      ? `⚠️ *LATE RETURN ALERT*\nStudent: *${item.student_name}* (Adm: ${item.adm_no})\nClass: ${item.class_name}\nLeave Started: ${item.start_date} ${formatAMPM(item.start_time)}\nExpected Return: ${item.exp_end_date} ${formatAMPM(item.exp_end_time)}\nStatus: *OVERDUE*\nPlease update campus office immediately.`
      : `📋 *CAMPUS LEAVE PASS*\nStudent: *${item.student_name}* (Adm: ${item.adm_no})\nClass: ${item.class_name}\nType: ${item.leave_type}\nOut: ${item.start_date} ${formatAMPM(item.start_time)}\nExp. Return: ${item.exp_end_date || 'Not set'} ${formatAMPM(item.exp_end_time)}\nIssued By: ${item.issued_by}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function handleSaveLeave(e) {
    e.preventDefault();
    if (!formClass) return alert('Select Class!');
    if (!allClassMode && !selectedStudent) return alert('Select a Student from the list!');
    if (!startDate) return alert('Select Start Date!');

    setSaving(true);
    setMsg('');

    if (!allClassMode) {
      const hasOpen = leaves.some(
        l => String(l.adm_no) === String(selectedStudent.adm_no) && (l.status === 'Active' || l.status === 'Upcoming')
      );
      if (hasOpen) {
        setSaving(false);
        return alert(`${selectedStudent.name} already has an Active or Upcoming leave!`);
      }
    }

    const status = startDate > todayStr ? 'Upcoming' : 'Active';
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

    const { data, error } = await supabase.from('student_leaves').insert(payload).select();
    setSaving(false);

    if (error) {
      setMsg('❌ Error: ' + error.message);
    } else {
      setLeaves(prev => [...(data || []), ...prev]);
      setMsg(`✅ Leave saved for ${allClassMode ? `${payload.length} students in ${formClass}` : selectedStudent.name}!`);
      setStudentQuery('');
      setSelectedStudent(null);
      setReason('');
      setAllClassMode(false);
      setTab('active');
    }
  }

  async function handleQuickReturn(item) {
    const rDate = getTodayStr();
    const rTime = getNowTimeStr();
    // Optimistic update (Zero-Lag)
    setLeaves(prev => prev.map(l => l.id === item.id ? { ...l, status: 'Returned', return_date: rDate, return_time: rTime, returned_by: user?.name || 'Staff' } : l));
    const { error } = await supabase
      .from('student_leaves')
      .update({ status: 'Returned', return_date: rDate, return_time: rTime, returned_by: user?.name || 'Staff' })
      .eq('id', item.id);
    if (error) {
      alert('Update failed: ' + error.message);
      loadInitialData();
    } else {
      setMsg(`✅ ${item.student_name} marked as Returned!`);
    }
  }

  async function handleConfirmReturn() {
    if (!returnTarget || !returnDate || !returnTime) return alert('Enter Return Date & Time!');
    setSaving(true);
    const { error } = await supabase
      .from('student_leaves')
      .update({ status: 'Returned', return_date: returnDate, return_time: returnTime, returned_by: user?.name || 'Staff' })
      .eq('id', returnTarget.id);
    setSaving(false);
    if (error) {
      alert('Error updating: ' + error.message);
    } else {
      setLeaves(prev => prev.map(l => l.id === returnTarget.id ? { ...l, status: 'Returned', return_date: returnDate, return_time: returnTime, returned_by: user?.name || 'Staff' } : l));
      setMsg(`✅ ${returnTarget.student_name} marked as Returned!`);
      setReturnTarget(null);
    }
  }

  async function handleBulkReturnClass(className) {
    const targets = activeLeaves.filter(l => l.class_name === className);
    if (targets.length === 0) return;
    if (!window.confirm(`Mark all ${targets.length} active students in ${className} as Returned now?`)) return;
    const ids = targets.map(t => t.id);
    const rDate = getTodayStr();
    const rTime = getNowTimeStr();
    const { error } = await supabase
      .from('student_leaves')
      .update({ status: 'Returned', return_date: rDate, return_time: rTime, returned_by: user?.name || 'Staff' })
      .in('id', ids);
    if (!error) {
      setLeaves(prev => prev.map(l => ids.includes(l.id) ? { ...l, status: 'Returned', return_date: rDate, return_time: rTime, returned_by: user?.name || 'Staff' } : l));
      setSelectedClassView(null);
      setMsg(`✅ All ${targets.length} students in ${className} marked as Returned!`);
    }
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    const { error } = await supabase
      .from('student_leaves')
      .update({ exp_end_date: editExpDate || null, exp_end_time: editExpTime || '', reason: editReason.trim() })
      .eq('id', editTarget.id);
    setSaving(false);
    if (!error) {
      setLeaves(prev => prev.map(l => l.id === editTarget.id ? { ...l, exp_end_date: editExpDate || null, exp_end_time: editExpTime || '', reason: editReason.trim() } : l));
      setMsg(`✅ Leave updated for ${editTarget.student_name}!`);
      setEditTarget(null);
    }
  }

  function canDelete(item) {
  if (isAdmin) return true;
  if (item?.status === 'Returned') return false;
  const currentName = (user?.name || '').trim().toLowerCase();
  const issuerName = (item?.issued_by || '').trim().toLowerCase();
  return Boolean(currentName && issuerName && currentName === issuerName);
}

  async function handleDeleteLeave(item) {
    if (!canDelete(item)) return;
    if (!window.confirm('Permanently delete this leave record?')) return;
    setLeaves(prev => prev.filter(l => l.id !== item.id));
    await supabase.from('student_leaves').delete().eq('id', item.id);
  }

  function handleExportCSV() {
    const headers = ['Adm No', 'Student Name', 'Class', 'Type', 'Reason', 'Start Date', 'Start Time', 'Exp Return', 'Actual Return', 'Duration', 'Status', 'Issued By', 'Returned By'];
    const rows = filteredReports.map(l => [
      l.adm_no, l.student_name, l.class_name, l.leave_type, l.reason || '-',
      l.start_date, formatAMPM(l.start_time) || '-', l.exp_end_date || '-',
      l.return_date ? `${l.return_date} ${formatAMPM(l.return_time)}` : '-',
      formatDuration(calculateLeaveHours(l)), l.status, l.issued_by, l.returned_by || '-'
    ]);
    exportReportCSV(`Leave_Report_${filterClass}`, headers, rows);
  }

  // STUDENT SELF VIEW
  if (isStudent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <ArrowLeft size={15} /> Back
          </button>
        )}
        <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>My Leave History</div>
          {loading ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Loading...</div>
          ) : leaves.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No leave records found.</div>
          ) : (
            leaves.map(l => (
              <div key={l.id} style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8, borderLeft: `4px solid ${isLeaveOverdue(l) ? '#dc2626' : l.status === 'Active' ? '#2e44d2' : '#16a34a'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                  <span>{l.leave_type}</span>
                  <span style={{ color: isLeaveOverdue(l) ? '#dc2626' : l.status === 'Active' ? '#2e44d2' : '#16a34a' }}>
                    {isLeaveOverdue(l) ? 'OVERDUE' : l.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  Out: {l.start_date} {l.start_time ? `@ ${formatAMPM(l.start_time)}` : ''}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <ArrowLeft size={17} color="#0f172a" />
            </button>
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Leave Portal</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Live Campus Outpass & Tracking</div>
          </div>
        </div>
        <button onClick={loadInitialData} title="Refresh" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <RefreshCw size={15} color="#475569" />
        </button>
      </div>

      {/* LIVE KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { id: 'all', label: 'Active Out', val: activeLeaves.length, bg: '#eff6ff', col: '#1d4ed8', border: '#bfdbfe' },
          { id: 'overdue', label: 'Overdue', val: overdueLeaves.length, bg: '#fef2f2', col: '#dc2626', border: '#fecaca' },
          { id: 'today', label: 'Due Today', val: returningTodayLeaves.length, bg: '#f0fdf4', col: '#15803d', border: '#bbf7d0' },
          { id: 'upcoming', label: 'Upcoming', val: upcomingLeaves.length, bg: '#fffbeb', col: '#d97706', border: '#fde68a' }
        ].map(k => (
          <div
            key={k.id}
            onClick={() => { setTab('active'); setQuickFilter(k.id); setSelectedClassView(null); }}
            style={{
              background: k.bg, border: `1.5px solid ${quickFilter === k.id && tab === 'active' ? k.col : k.border}`,
              borderRadius: 12, padding: '8px 6px', textAlign: 'center', cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, color: k.col }}>{k.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: k.col }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* MAIN TABS */}
      <div style={{ display: 'flex', gap: 5, background: '#e2e8f0', padding: 4, borderRadius: 11 }}>
        {[
          { id: 'active', label: 'Live Status' },
          { id: 'add', label: '+ New Leave' },
          { id: 'reports', label: 'Reports' },
          { id: 'insights', label: 'Insights' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedClassView(null); setMsg(''); }}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: tab === t.id ? '#2e44d2' : 'transparent',
              color: tab === t.id ? '#fff' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ padding: '9px 12px', borderRadius: 10, background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          <X size={14} style={{ cursor: 'pointer' }} onClick={() => setMsg('')} />
        </div>
      )}

      {/* TAB 1: LIVE STATUS */}
      {tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* INSTANT GLOBAL SEARCH */}
          <div style={{ position: 'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: 11 }} />
            <input
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              placeholder="Instant search student name, Adm No, or class..."
              style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          {/* CLASS SUMMARY OR STUDENT CARDS */}
          {!selectedClassView && quickFilter === 'all' && !globalSearch.trim() ? (
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarClock size={16} color="#2e44d2" /> Active Leaves by Class
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>Loading...</div>
              ) : classSummary.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>All students are on campus!</div>
              ) : (
                classSummary.map(([cls, info]) => (
                  <div
                    key={cls}
                    onClick={() => setSelectedClassView(cls)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 8px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{cls}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {info.overdue > 0 && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
                          {info.overdue} Late
                        </span>
                      )}
                      <span style={{ background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 12, padding: '3px 10px', borderRadius: 20 }}>
                        {info.total}
                      </span>
                      <ChevronRight size={16} color="#94a3b8" />
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => { setSelectedClassView(null); setQuickFilter('all'); setGlobalSearch(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  <ArrowLeft size={14} /> {selectedClassView ? `All Classes (${selectedClassView})` : 'Back to Summary'}
                </button>
                {selectedClassView && displayedActiveList.length > 1 && (
                  <button
                    onClick={() => handleBulkReturnClass(selectedClassView)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <CheckCheck size={14} /> Return All ({displayedActiveList.length})
                  </button>
                )}
              </div>

              {displayedActiveList.length === 0 ? (
                <div style={{ background: '#fff', padding: 20, borderRadius: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No matching leave records.</div>
              ) : (
                displayedActiveList.map(item => {
                  const overdue = isLeaveOverdue(item);
                  return (
                    <div key={item.id} style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', borderLeft: `4px solid ${overdue ? '#dc2626' : item.status === 'Upcoming' ? '#d97706' : '#2e44d2'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.student_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {item.adm_no} • {item.class_name}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {overdue && (
                            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6, background: '#dc2626', color: '#fff' }}>
                              OVERDUE
                            </span>
                          )}
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: '#f1f5f9', color: '#334155' }}>
                            {item.leave_type}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: '#475569', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <span>Out: <b>{item.start_date}</b> {item.start_time ? `@ ${formatAMPM(item.start_time)}` : ''}</span>
                        {item.exp_end_date && (
                          <span style={{ color: overdue ? '#dc2626' : '#15803d' }}>
                            Exp: <b>{item.exp_end_date}</b> {item.exp_end_time ? `@ ${formatAMPM(item.exp_end_time)}` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                        Duration: <b>{formatDuration(calculateLeaveHours(item))}</b> • By: {item.issued_by} {item.reason ? `• "${item.reason}"` : ''}
                      </div>

                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        {item.status === 'Active' && (
                          <>
                            <button
                              onClick={() => handleQuickReturn(item)}
                              style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}
                            >
                              <CheckCircle2 size={14} /> Returned Now
                            </button>
                            <button
                              onClick={() => { setReturnTarget(item); setReturnDate(getTodayStr()); setReturnTime(getNowTimeStr()); }}
                              title="Custom Return Time"
                              style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
                            >
                              <Clock size={13} /> Time
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setEditTarget(item); setEditExpDate(item.exp_end_date || ''); setEditExpTime(item.exp_end_time || ''); setEditReason(item.reason || ''); }}
                          title="Extend / Edit Leave"
                          style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#2e44d2', cursor: 'pointer' }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => shareWhatsAppPass(item)}
                          title="Share WhatsApp Pass"
                          style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                        >
                          <Share2 size={14} />
                        </button>
                       {canDelete(item) && (
                          <button
                            onClick={() => handleDeleteLeave(item)}
                            title="Delete"
                            style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
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
                    <div key={s.adm_no} onClick={() => { setSelectedStudent(s); setStudentQuery(s.name); }} style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
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

     {/* TAB 3: REPORTS */}
      {tab === 'reports' && (
        <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 9, top: 10 }} />
              <input
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                placeholder="Search name / Adm No..."
                style={{ width: '100%', padding: '8px 8px 8px 28px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <select value={reportSort} onChange={e => setReportSort(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
              <option value="date_desc">Sort: Newest</option>
              <option value="class_asc">Sort: Class-wise</option>
              <option value="name_asc">Sort: Name (A-Z)</option>
              <option value="duration_desc">Sort: Highest Time</option>
            </select>
          </div>

          {/* VIEW TOGGLE: DAY FOLDERS VS FULL TABLE */}
          <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 9, marginBottom: 10 }}>
            <button
              onClick={() => setReportView('folders')}
              style={{
                flex: 1, padding: '7px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: reportView === 'folders' ? '#1e293b' : 'transparent',
                color: reportView === 'folders' ? '#fff' : '#475569'
              }}
            >
              📁 Day Folders ({groupedReportsByDate.length})
            </button>
            <button
              onClick={() => setReportView('table')}
              style={{
                flex: 1, padding: '7px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: reportView === 'table' ? '#1e293b' : 'transparent',
                color: reportView === 'table' ? '#fff' : '#475569'
              }}
            >
              📋 Full Table ({filteredReports.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => exportReportPDF('leave-report-print', `Leave_Report_${filterClass}`)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>PDF</button>
            <button onClick={() => exportReportJPEG('leave-report-print', `Leave_Report_${filterClass}`)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>JPEG</button>
            <button onClick={handleExportCSV} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Excel / CSV</button>
          </div>

          <div id="leave-report-print" style={{ overflowX: 'auto' }}>
            {reportView === 'folders' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groupedReportsByDate.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 13 }}>No records found.</div>
                ) : (
                  groupedReportsByDate.map(group => {
                    const isOpen = Boolean(openReportDates[group.date] || reportSearch.trim());
                    return (
                      <div key={group.date} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div
                          onClick={() => setOpenReportDates(prev => ({ ...prev, [group.date]: !prev[group.date] }))}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px', background: isOpen ? '#eff6ff' : '#f8fafc', cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ChevronRight
                              size={16}
                              color="#2e44d2"
                              style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                            />
                            <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>📅 {group.date}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {group.overdueCount > 0 && (
                              <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>
                                {group.overdueCount} Late
                              </span>
                            )}
                            <span style={{ background: '#2e44d2', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20 }}>
                              {group.rows.length} Students
                            </span>
                          </div>
                        </div>

                        {isOpen && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#1e293b', color: '#fff' }}>
                                <th style={{ padding: 7, textAlign: 'left' }}>Student</th>
                                <th style={{ padding: 7, textAlign: 'left' }}>Class</th>
                                <th style={{ padding: 7, textAlign: 'left' }}>Duration</th>
                                <th style={{ padding: 7, textAlign: 'left' }}>Status</th>
                                {isAdmin && <th style={{ padding: 7, textAlign: 'center' }}>Action</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: 7, fontWeight: 600 }}>{r.student_name}</td>
                                  <td style={{ padding: 7 }}>{r.class_name}</td>
                                  <td style={{ padding: 7 }}>{formatDuration(calculateLeaveHours(r))}</td>
                                  <td style={{ padding: 7, fontWeight: 700, color: isLeaveOverdue(r) ? '#dc2626' : r.status === 'Active' ? '#2e44d2' : '#16a34a' }}>
                                    {isLeaveOverdue(r) ? 'Overdue' : r.status}
                                  </td>
                                  {isAdmin && (
                                    <td style={{ padding: 7, textAlign: 'center' }}>
                                      <button
                                        onClick={() => handleDeleteLeave(r)}
                                        title="Delete Record"
                                        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#fff' }}>
                    <th style={{ padding: 7, textAlign: 'left' }}>Date</th>
                    <th style={{ padding: 7, textAlign: 'left' }}>Student</th>
                    <th style={{ padding: 7, textAlign: 'left' }}>Class</th>
                    <th style={{ padding: 7, textAlign: 'left' }}>Duration</th>
                    <th style={{ padding: 7, textAlign: 'left' }}>Status</th>
                    {isAdmin && <th style={{ padding: 7, textAlign: 'center' }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 14, color: '#94a3b8' }}>No records found.</td></tr>
                  ) : (
                    filteredReports.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: 7 }}>{r.start_date}</td>
                        <td style={{ padding: 7, fontWeight: 600 }}>{r.student_name}</td>
                        <td style={{ padding: 7 }}>{r.class_name}</td>
                        <td style={{ padding: 7 }}>{formatDuration(calculateLeaveHours(r))}</td>
                        <td style={{ padding: 7, fontWeight: 700, color: isLeaveOverdue(r) ? '#dc2626' : r.status === 'Active' ? '#2e44d2' : '#16a34a' }}>
                          {isLeaveOverdue(r) ? 'Overdue' : r.status}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: 7, textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteLeave(r)}
                              title="Delete Record"
                              style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
     {/* TAB 4: INSIGHTS & INDIVIDUAL STUDENT PROOF REPORT */}
      {tab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selectedStudentReport ? (() => {
            const stLeaves = leaves.filter(l => String(l.adm_no) === String(selectedStudentReport.adm_no));
            const totalHrs = stLeaves.reduce((acc, l) => acc + (l.status === 'Upcoming' ? 0 : calculateLeaveHours(l)), 0);
            const shareSummaryWA = () => {
              const lines = stLeaves.slice(0, 15).map((l, i) =>
                `${i + 1}. ${l.start_date} (${l.leave_type}) - ${formatDuration(calculateLeaveHours(l))} [${l.status}]`
              ).join('\n');
              const text = `📄 *STUDENT LEAVE HISTORY REPORT*\nStudent: *${selectedStudentReport.name}* (Adm: ${selectedStudentReport.adm_no})\nClass: ${selectedStudentReport.class_name}\nTotal Leaves: *${stLeaves.length}* | Total Time: *${formatDuration(totalHrs)}*\n\n${lines}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            };
            const exportStudentCSV = () => {
              const headers = ['Date', 'Out Time', 'Return Date', 'Return Time', 'Duration', 'Type', 'Reason', 'Issued By', 'Status'];
              const rows = stLeaves.map(l => [
                l.start_date, formatAMPM(l.start_time) || '-', l.return_date || '-', formatAMPM(l.return_time) || '-',
                formatDuration(calculateLeaveHours(l)), l.leave_type, l.reason || '-', l.issued_by, l.status
              ]);
              exportReportCSV(`Leave_History_${selectedStudentReport.adm_no}_${selectedStudentReport.name}`, headers, rows);
            };

            return (
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={() => setSelectedStudentReport(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <ArrowLeft size={14} /> Back to Insights
                  </button>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => exportReportPDF('student-proof-print', `Leave_Proof_${selectedStudentReport.name}`)} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>PDF</button>
                    <button onClick={() => exportReportJPEG('student-proof-print', `Leave_Proof_${selectedStudentReport.name}`)} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>JPEG</button>
                    <button onClick={exportStudentCSV} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>CSV</button>
                    <button onClick={shareSummaryWA} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>WhatsApp</button>
                  </div>
                </div>

                <div id="student-proof-print" style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{selectedStudentReport.name}</div>
                      <div style={{ fontSize: 12, color: '#475569' }}>Adm No: <b>{selectedStudentReport.adm_no}</b> • Class: <b>{selectedStudentReport.class_name}</b></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Total Leaves: <b style={{ color: '#0f172a' }}>{stLeaves.length}</b></div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>Total Time: {formatDuration(totalHrs)}</div>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                     <thead>
                        <tr style={{ background: '#1e293b', color: '#fff' }}>
                          <th style={{ padding: 6, textAlign: 'left' }}>Out Date & Time</th>
                          <th style={{ padding: 6, textAlign: 'left' }}>Return Date & Time</th>
                          <th style={{ padding: 6, textAlign: 'left' }}>Type / Reason</th>
                          <th style={{ padding: 6, textAlign: 'left' }}>Duration</th>
                          <th style={{ padding: 6, textAlign: 'left' }}>Issued By</th>
                          <th style={{ padding: 6, textAlign: 'left' }}>Status</th>
                          {isAdmin && <th style={{ padding: 6, textAlign: 'center' }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {stLeaves.map(l => (
                          <tr key={l.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: 6 }}>{l.start_date} {l.start_time ? `@ ${formatAMPM(l.start_time)}` : ''}</td>
                            <td style={{ padding: 6 }}>{l.return_date ? `${l.return_date} @ ${formatAMPM(l.return_time)}` : '-'}</td>
                            <td style={{ padding: 6 }}><b>{l.leave_type}</b>{l.reason ? ` (${l.reason})` : ''}</td>
                            <td style={{ padding: 6, fontWeight: 700 }}>{formatDuration(calculateLeaveHours(l))}</td>
                            <td style={{ padding: 6 }}>{l.issued_by}</td>
                            <td style={{ padding: 6, fontWeight: 700, color: isLeaveOverdue(l) ? '#dc2626' : l.status === 'Active' ? '#2e44d2' : '#16a34a' }}>
                              {isLeaveOverdue(l) ? 'Overdue' : l.status}
                            </td>
                            {isAdmin && (
                              <td style={{ padding: 6, textAlign: 'center' }}>
                                <button
                                  onClick={() => handleDeleteLeave(l)}
                                  title="Delete Entry"
                                  style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })() : (
            <>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={15} /> Top 5 Leave Takers (Click for Full Proof)
                </div>
                {insights.studentRows.slice(0, 5).map((s, idx) => (
                  <div
                    key={s.adm_no}
                    onClick={() => setSelectedStudentReport(s)}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid #f1f5f9', fontSize: 13, cursor: 'pointer' }}
                  >
                    <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🔹'} <b>{s.name}</b> <small style={{ color: '#64748b' }}>({s.class_name} • {s.count}x)</small></span>
                    <span style={{ fontWeight: 800, color: '#dc2626' }}>{formatDuration(s.totalHours)} →</span>
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

              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>All Students Leave Record (Click Any Student)</div>
                <input
                  value={insightSearch}
                  onChange={e => setInsightSearch(e.target.value)}
                  placeholder="Search student name, Adm No, or class..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, marginBottom: 10, boxSizing: 'border-box' }}
                />
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {insights.studentRows
                    .filter(s => {
                      const q = insightSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (s.name || '').toLowerCase().includes(q) || String(s.adm_no).includes(q) || (s.class_name || '').toLowerCase().includes(q);
                    })
                    .map(s => (
                      <div
                        key={s.adm_no}
                        onClick={() => setSelectedStudentReport(s)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 12, cursor: 'pointer' }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no} • {s.class_name} • {s.count} Leaves</div>
                        </div>
                        <span style={{ fontWeight: 800, color: '#2e44d2', background: '#eff6ff', padding: '4px 8px', borderRadius: 8 }}>
                          {formatDuration(s.totalHours)} →
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CUSTOM RETURN MODAL */}
      {returnTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', padding: 18, borderRadius: 14, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a', marginBottom: 6 }}>Custom Return Time</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}><b>{returnTarget.student_name}</b> ({returnTarget.class_name})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <input type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setReturnTarget(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button disabled={saving} onClick={handleConfirmReturn} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTEND / EDIT LEAVE MODAL */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', padding: 18, borderRadius: 14, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2e44d2', marginBottom: 6 }}>Extend / Edit Leave</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}><b>{editTarget.student_name}</b> ({editTarget.class_name})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>New Expected Return Date</label>
              <input type="date" value={editExpDate} onChange={e => setEditExpDate(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>New Expected Return Time</label>
              <input type="time" value={editExpTime} onChange={e => setEditExpTime(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Reason</label>
              <input type="text" value={editReason} onChange={e => setEditReason(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditTarget(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button disabled={saving} onClick={handleSaveEdit} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}