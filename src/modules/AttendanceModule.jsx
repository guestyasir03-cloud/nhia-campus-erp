import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, ClipboardCheck, Edit3, Save,
  Copy, Download, FileSpreadsheet, UserCheck, Trash2
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';
import { exportReportPDF, exportReportJPEG } from '../lib/exportReport';

const DEFAULT_SESSIONS = [
  'Friday Register',
  'Morning Assembly',
  'Maghrib / Isha Prayer',
  'Night Study',
  'Special Program',
  'Custom'
];

export default function AttendanceModule({ onBack, user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [mainTab, setMainTab] = useState('spot');
  const [classes, setClasses] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Class Teacher Assignment State
  const [assignClass, setAssignClass] = useState('');
  const [assignStaff, setAssignStaff] = useState('');

  // Session Attendance State
  const [spotView, setSpotView] = useState('take');
  const [spotDate, setSpotDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [spotSession, setSpotSession] = useState('Friday Register');
  const [customSession, setCustomSession] = useState('');
  const [spotClass, setSpotClass] = useState('');
  const [spotStudents, setSpotStudents] = useState([]);
  const [spotMap, setSpotMap] = useState({});
  const [historyList, setHistoryList] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);

  // Admin Editable Sessions State
  const [sessions, setSessions] = useState(DEFAULT_SESSIONS);
  const [showManageSessions, setShowManageSessions] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [editingSessionIdx, setEditingSessionIdx] = useState(null);
  const [editingSessionVal, setEditingSessionVal] = useState('');
  const [savingSessions, setSavingSessions] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'attendance_sessions')
        .maybeSingle();
      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSessions(parsed);
            if (!parsed.includes(spotSession)) setSpotSession(parsed[0]);
          }
        } catch {}
      }
    })();
  }, []);

  async function persistSessions(nextList, renamedFrom, renamedTo) {
    setSavingSessions(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'attendance_sessions', value: JSON.stringify(nextList) }, { onConflict: 'key' });
    setSavingSessions(false);
    if (error) {
      setMsg('Error saving sessions: ' + error.message);
      return false;
    }
    setSessions(nextList);
    if (renamedFrom && spotSession === renamedFrom) {
      setSpotSession(renamedTo || nextList[0] || '');
    } else if (!nextList.includes(spotSession)) {
      setSpotSession(nextList[0] || '');
    }
    setMsg('Sessions updated!');
    return true;
  }

  async function handleAddSession() {
    const trimmed = newSessionName.trim();
    if (!trimmed) return;
    if (sessions.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setMsg('Session already exists.');
      return;
    }
    const next = [...sessions, trimmed];
    if (await persistSessions(next)) setNewSessionName('');
  }

  async function handleUpdateSession(idx) {
    const trimmed = editingSessionVal.trim();
    if (!trimmed) return;
    const oldName = sessions[idx];
    if (sessions.some((s, i) => i !== idx && s.toLowerCase() === trimmed.toLowerCase())) {
      setMsg('Session name already exists.');
      return;
    }
    const next = sessions.map((s, i) => (i === idx ? trimmed : s));
    if (await persistSessions(next, oldName, trimmed)) {
      setEditingSessionIdx(null);
      setEditingSessionVal('');
    }
  }

  async function handleDeleteSession(idx) {
    if (sessions.length <= 1) {
      setMsg('At least one session is required.');
      return;
    }
    const target = sessions[idx];
    if (!window.confirm(`Delete session "${target}"?`)) return;
    const next = sessions.filter((_, i) => i !== idx);
    await persistSessions(next, target, next[0]);
  }

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

  async function handleAssignClassTeacher() {
    if (!assignClass || !assignStaff) return alert('Select both class and teacher.');
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
      setMsg('Error: ' + error.message);
    } else {
      setMsg(`${assignStaff} assigned to ${assignClass}.`);
      setAssignClass('');
      setAssignStaff('');
      loadInitialData();
    }
  }

  async function removeClassTeacher(clsName) {
    if (!window.confirm(`Remove class teacher assignment for ${clsName}?`)) return;
    await supabase.from('class_teachers').delete().eq('class_name', clsName);
    loadInitialData();
  }

  const activeSessionName = spotSession === 'Custom' ? customSession.trim() : spotSession;

  async function loadSpotStudents(clsParam, dateParam, sessParam) {
    const targetCls = clsParam || spotClass;
    const targetDate = dateParam || spotDate;
    const targetSess = sessParam || activeSessionName;

    if (!targetCls || !targetDate || !targetSess) {
      return alert('Select date, session, and class.');
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
      setMsg(`Existing record loaded (${targetDate} - ${targetSess}).`);
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
    if (error) setMsg('Error: ' + error.message);
    else setMsg(`Attendance saved for ${spotClass} (${activeSessionName}).`);
  }

  async function loadSpotHistory() {
    setLoading(true);
    setMsg('');
    const { data, error } = await supabase
      .from('spot_attendance')
      .select('session_date, session_name, class_name, status, taken_by')
      .order('session_date', { ascending: false })
      .limit(2500);

    setLoading(false);
    if (error) return setMsg('Error: ' + error.message);

    const sessionGroups = {};
    (data || []).forEach(r => {
      const sKey = `${r.session_date}__${r.session_name}`;
      if (!sessionGroups[sKey]) {
        sessionGroups[sKey] = {
          key: sKey,
          date: r.session_date,
          session: r.session_name,
          P: 0, A: 0, L: 0, total: 0,
          classMap: {}
        };
      }
      const sg = sessionGroups[sKey];
      sg[r.status] = (sg[r.status] || 0) + 1;
      sg.total += 1;

      if (!sg.classMap[r.class_name]) {
        sg.classMap[r.class_name] = {
          date: r.session_date,
          session: r.session_name,
          className: r.class_name,
          takenBy: r.taken_by || 'Staff',
          P: 0, A: 0, L: 0, total: 0
        };
      }
      sg.classMap[r.class_name][r.status] = (sg.classMap[r.class_name][r.status] || 0) + 1;
      sg.classMap[r.class_name].total += 1;
    });

    const groupedList = Object.values(sessionGroups).map(sg => ({
      key: sg.key,
      date: sg.date,
      session: sg.session,
      P: sg.P,
      A: sg.A,
      L: sg.L,
      total: sg.total,
      classes: Object.values(sg.classMap).sort((a, b) =>
        a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' })
      )
    }));

    setHistoryList(groupedList);
  }

  async function fetchSessionStudentDetails(sg) {
    const [{ data: attRows }, { data: stRows }] = await Promise.all([
      supabase
        .from('spot_attendance')
        .select('adm_no, class_name, status')
        .eq('session_date', sg.date)
        .eq('session_name', sg.session)
        .in('status', ['A', 'L']),
      supabase.from('students').select('adm_no, name')
    ]);
    const nameMap = {};
    (stRows || []).forEach(s => { nameMap[String(s.adm_no)] = s.name; });

    const byClass = {};
    (attRows || []).forEach(r => {
      if (!byClass[r.class_name]) byClass[r.class_name] = { A: [], L: [] };
      const label = `${nameMap[String(r.adm_no)] || r.adm_no} (${r.adm_no})`;
      if (r.status === 'A') byClass[r.class_name].A.push(label);
      if (r.status === 'L') byClass[r.class_name].L.push(label);
    });
    return byClass;
  }

  async function copyCombinedSessionReport(sg) {
    setLoading(true);
    const details = await fetchSessionStudentDetails(sg);
    setLoading(false);

    const grandPerc = sg.total > 0 ? ((sg.P / sg.total) * 100).toFixed(1) : '0.0';
    let text = `*NOORUL HIDAYA ISLAMIC ACADEMY*\n`;
    text += `*Attendance Report — ${sg.session}*\n`;
    text += `Date: ${sg.date} | Classes: ${sg.classes.length}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*GRAND TOTAL:* ${sg.total} Students\n`;
    text += `• Present: *${sg.P}* (${grandPerc}%)\n`;
    text += `• Absent: *${sg.A}*\n`;
    text += `• Leave: *${sg.L}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    sg.classes.forEach((c, idx) => {
      const cPerc = c.total > 0 ? ((c.P / c.total) * 100).toFixed(1) : '0.0';
      const d = details[c.className] || { A: [], L: [] };
      text += `*${idx + 1}. Class ${c.className}* (_${c.takenBy}_)\n`;
      text += `Total: ${c.total} | P: ${c.P} (${cPerc}%) | A: ${c.A} | L: ${c.L}\n`;
      if (d.A.length > 0) {
        text += `*Absent (${d.A.length}):*\n`;
        d.A.forEach(name => { text += `• ${name}\n`; });
      }
      if (d.L.length > 0) {
        text += `*Leave (${d.L.length}):*\n`;
        d.L.forEach(name => { text += `• ${name}\n`; });
      }
      text += `\n`;
    });

    navigator.clipboard.writeText(text.trim());
    setMsg(`Copied detailed WhatsApp report for ${sg.session} (${sg.date}).`);
  }

  async function downloadCombinedSessionPDF(sg) {
    setLoading(true);
    const details = await fetchSessionStudentDetails(sg);
    setLoading(false);

    const grandPerc = sg.total > 0 ? ((sg.P / sg.total) * 100).toFixed(1) : '0.0';

    const classRowsHtml = sg.classes.map((c, idx) => {
      const cPerc = c.total > 0 ? ((c.P / c.total) * 100).toFixed(1) : '0.0';
      return `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-weight:700;">${c.className}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;">${c.takenBy}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:600;">${c.total}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;color:#15803d;font-weight:700;">${c.P}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;color:#dc2626;font-weight:700;">${c.A}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;color:#d97706;font-weight:700;">${c.L}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:700;">${cPerc}%</td>
      </tr>`;
    }).join('');

    const absLeaveBlocks = sg.classes.map(c => {
      const d = details[c.className] || { A: [], L: [] };
      if (d.A.length === 0 && d.L.length === 0) return '';
      const absList = d.A.map(n => `<div style="padding:1.5px 0;">• ${n}</div>`).join('');
      const leaveList = d.L.map(n => `<div style="padding:1.5px 0;">• ${n}</div>`).join('');
      return `<div style="page-break-inside:avoid;margin-bottom:10px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;">
        <div style="background:#f1f5f9;padding:6px 10px;font-weight:700;font-size:12px;color:#0f172a;border-bottom:1px solid #cbd5e1;display:flex;justify-content:space-between;">
          <span>Class ${c.className} — ${c.takenBy}</span>
          <span>P: ${c.P} | A: ${c.A} | L: ${c.L}</span>
        </div>
        <div style="padding:8px 12px;font-size:11px;line-height:1.45;display:flex;gap:20px;">
          ${d.A.length > 0 ? `<div style="flex:1;"><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">Absent (${d.A.length}):</div>${absList}</div>` : ''}
          ${d.L.length > 0 ? `<div style="flex:1;"><div style="font-weight:700;color:#b45309;margin-bottom:4px;">Leave (${d.L.length}):</div>${leaveList}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding:20px;font-family:Arial,sans-serif;color:#0f172a;border:1.5px solid #0f172a;">
        <div style="position:relative;text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px;min-height:52px;">
          <img src="/logo.jpg" style="position:absolute;left:4px;top:0;width:48px;height:48px;object-fit:contain;" />
          <div style="font-size:17px;font-weight:800;letter-spacing:0.3px;">NOORUL HIDAYA ISLAMIC ACADEMY, PATTAMBI</div>
          <div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:2px;">Detailed Attendance Report — ${sg.session}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">Date: <b>${sg.date}</b> &nbsp;|&nbsp; Total Classes: <b>${sg.classes.length}</b></div>
        </div>

        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:14px;text-align:center;">
          <div style="flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;">
            <div style="font-size:10px;color:#64748b;font-weight:700;">TOTAL</div>
            <div style="font-size:16px;font-weight:800;">${sg.total}</div>
          </div>
          <div style="flex:1;padding:8px;border:1px solid #bbf7d0;border-radius:6px;background:#f0fdf4;">
            <div style="font-size:10px;color:#15803d;font-weight:700;">PRESENT</div>
            <div style="font-size:16px;font-weight:800;color:#15803d;">${sg.P} (${grandPerc}%)</div>
          </div>
          <div style="flex:1;padding:8px;border:1px solid #fecaca;border-radius:6px;background:#fef2f2;">
            <div style="font-size:10px;color:#dc2626;font-weight:700;">ABSENT</div>
            <div style="font-size:16px;font-weight:800;color:#dc2626;">${sg.A}</div>
          </div>
          <div style="flex:1;padding:8px;border:1px solid #fde68a;border-radius:6px;background:#fffbeb;">
            <div style="font-size:10px;color:#b45309;font-weight:700;">LEAVE</div>
            <div style="font-size:16px;font-weight:800;color:#b45309;">${sg.L}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:16px;">
          <thead>
            <tr style="background:#0f172a;color:#ffffff;">
              <th style="border:1px solid #0f172a;padding:7px;width:30px;">#</th>
              <th style="border:1px solid #0f172a;padding:7px;text-align:left;">Class</th>
              <th style="border:1px solid #0f172a;padding:7px;text-align:left;">Teacher Taken</th>
              <th style="border:1px solid #0f172a;padding:7px;">Total</th>
              <th style="border:1px solid #0f172a;padding:7px;">Present</th>
              <th style="border:1px solid #0f172a;padding:7px;">Absent</th>
              <th style="border:1px solid #0f172a;padding:7px;">Leave</th>
              <th style="border:1px solid #0f172a;padding:7px;">%</th>
            </tr>
          </thead>
          <tbody>
            ${classRowsHtml}
            <tr style="background:#e2e8f0;font-weight:800;">
              <td colspan="3" style="border:1px solid #cbd5e1;padding:7px;text-align:right;">GRAND TOTAL</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;">${sg.total}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;color:#15803d;">${sg.P}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;color:#dc2626;">${sg.A}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;color:#b45309;">${sg.L}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;">${grandPerc}%</td>
            </tr>
          </tbody>
        </table>

        ${absLeaveBlocks ? `<div style="font-size:13px;font-weight:800;margin-bottom:8px;color:#0f172a;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">Absent & Leave Student List</div>${absLeaveBlocks}` : ''}
      </div>
    `;

    html2pdf().set({
      margin: 8,
      filename: `NHIA_Attendance_${sg.session}_${sg.date}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
  }

  async function deleteSessionGroup(sg) {
    if (!window.confirm(`Delete entire "${sg.session}" (${sg.date}) attendance for all ${sg.classes.length} class(es)?`)) return;
    setLoading(true);
    const { error } = await supabase
      .from('spot_attendance')
      .delete()
      .eq('session_date', sg.date)
      .eq('session_name', sg.session);
    setLoading(false);
    if (error) return setMsg('Delete failed: ' + error.message);
    setHistoryList(prev => prev.filter(item => item.key !== sg.key));
    setMsg(`Deleted "${sg.session}" (${sg.date}).`);
  }

  async function deleteClassSession(sg, c) {
    if (!window.confirm(`Delete ${c.className} attendance from "${sg.session}" (${sg.date})?`)) return;
    setLoading(true);
    const { error } = await supabase
      .from('spot_attendance')
      .delete()
      .eq('session_date', sg.date)
      .eq('session_name', sg.session)
      .eq('class_name', c.className);
    setLoading(false);
    if (error) return setMsg('Delete failed: ' + error.message);
    loadSpotHistory();
    setMsg(`Deleted ${c.className} from "${sg.session}".`);
  }

  function canEditClassEntry(takenBy) {
    if (user?.role === 'admin') return true;
    const me = (user?.name || '').trim().toLowerCase();
    const owner = (takenBy || '').trim().toLowerCase();
    return Boolean(me && owner && me === owner);
  }

  function openForEdit(h) {
    if (!canEditClassEntry(h.takenBy)) {
      return alert(`Only Admin or ${h.takenBy || 'the entry staff'} can edit this attendance.`);
    }
    setSpotDate(h.date);
    if (DEFAULT_SESSIONS.includes(h.session)) {
      setSpotSession(h.session);
    } else {
      setSpotSession('Custom');
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

    let text = `NHIA ATTENDANCE REPORT\n`;
    text += `Date: ${spotDate}\n`;
    text += `Session: ${activeSessionName}\n`;
    text += `Class: ${spotClass}\n`;
    text += `Present: ${presentCount} | Absent: ${absentees.length} | Leave: ${leaves.length}\n\n`;

    if (absentees.length > 0) {
      text += `ABSENTEES:\n`;
      absentees.forEach((s, i) => { text += `${i + 1}. ${s.name} (${s.adm_no})\n`; });
    } else {
      text += `All students present.\n`;
    }

    if (leaves.length > 0) {
      text += `\nON LEAVE:\n`;
      leaves.forEach((s, i) => { text += `${i + 1}. ${s.name} (${s.adm_no})\n`; });
    }

    navigator.clipboard.writeText(text);
    setMsg('Absentees report copied to clipboard.');
  }

  async function loadMonthlyStudents() {
    if (!monthlyClass || !monthYear) return alert('Select month and class.');
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
    if (!wd || wd <= 0) return alert('Enter valid total working days.');
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
        entered_by: user?.name || 'Staff'
      });
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('No present days entered to save.');
    }

    const { error } = await supabase
      .from('monthly_attendance')
      .upsert(rows, { onConflict: 'adm_no,month_year' });

    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else setMsg(`Monthly ledger saved for ${rows.length} students (${monthYear}).`);
  }

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

  function downloadPDF(elId, filename, landscape = null) {
    exportReportPDF(elId, filename, landscape);
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
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Attendance</h2>
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
          Session Register
        </button>
        <button
          onClick={() => { setMainTab('monthly'); setMsg(''); }}
          style={{
            flex: 1, padding: '10px 6px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            background: mainTab === 'monthly' ? '#fff' : 'transparent',
            color: mainTab === 'monthly' ? '#2e44d2' : '#475569'
          }}
        >
          Monthly Ledger
        </button>
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* SESSION REGISTER */}
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
                      <option value="">Select</option>
                      {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Session</label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setShowManageSessions(v => !v); setEditingSessionIdx(null); }}
                        style={{ background: 'none', border: 'none', color: '#2e44d2', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {showManageSessions ? 'Done' : '+ Manage Sessions'}
                      </button>
                    )}
                  </div>
                  <select value={spotSession} onChange={e => setSpotSession(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                    {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  {isAdmin && showManageSessions && (
                    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={newSessionName}
                          onChange={e => setNewSessionName(e.target.value)}
                          placeholder="New session name..."
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                        />
                        <button
                          type="button"
                          onClick={handleAddSession}
                          disabled={savingSessions || !newSessionName.trim()}
                          style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Add
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {sessions.map((s, idx) => (
                          <div key={s + idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            {editingSessionIdx === idx ? (
                              <>
                                <input
                                  value={editingSessionVal}
                                  onChange={e => setEditingSessionVal(e.target.value)}
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 12 }}
                                />
                                <button type="button" onClick={() => handleUpdateSession(idx)} disabled={savingSessions} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                                <button type="button" onClick={() => setEditingSessionIdx(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{s}</span>
                                <button type="button" onClick={() => { setEditingSessionIdx(idx); setEditingSessionVal(s); }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#2e44d2', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                                <button type="button" onClick={() => handleDeleteSession(idx)} disabled={savingSessions} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {spotSession === 'Custom' && (
                  <input value={customSession} onChange={e => setCustomSession(e.target.value)} placeholder="Enter session name" style={{ padding: 10, borderRadius: 10, border: '1px solid #93c5fd', fontSize: 13 }} />
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
                    <Save size={16} /> {loading ? 'Saving...' : 'Save Attendance'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <button onClick={copyWhatsAppAbsentees} style={{ padding: 10, borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Copy size={13} /> Copy Report
                    </button>
                    <button onClick={() => downloadPDF('nhia-spot-sheet', `${spotClass}_${activeSessionName}_${spotDate}.pdf`)} style={{ padding: 10, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Download size={13} /> PDF
                    </button>
                    <button
                                onClick={() => downloadCombinedSessionPDF(sg)}
                                title="Download Detailed PDF Report"
                                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Download size={11} /> PDF
                              </button>
                              {user?.role === 'admin' && (
                                <button
                                onClick={() => deleteSessionGroup(sg)}
                                title="Delete entire session"
                                style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={12} />
                              </button>
                              )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#0f172a' }}>Grouped Attendance Sessions</h4>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Tap card to view classes</span>
              </div>
              {historyList.length === 0 ? (
                <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 16 }}>No attendance records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyList.map((sg) => {
                    const isOpen = expandedSession === sg.key;
                    return (
                      <div key={sg.key} style={{ borderRadius: 12, border: isOpen ? '1.5px solid #0284c7' : '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
                        {/* Grouped Session Header */}
                        <div
                          onClick={() => setExpandedSession(isOpen ? null : sg.key)}
                          style={{ padding: 12, background: isOpen ? '#f0f9ff' : '#f8fafc', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{sg.session}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {sg.date} • <b>{sg.classes.length} Class{sg.classes.length > 1 ? 'es' : ''}</b>
                              </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 9px', borderRadius: 8 }}>
                              {isOpen ? 'Hide ▲' : 'Details ▼'}
                            </span>
                          </div>

                          {/* Grand Total Badges */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 10, fontSize: 12, fontWeight: 800 }}>
                              <span style={{ color: '#16a34a' }}>P: {sg.P}</span>
                              <span style={{ color: '#dc2626' }}>A: {sg.A}</span>
                              <span style={{ color: '#d97706' }}>L: {sg.L}</span>
                              <span style={{ color: '#475569' }}>Total: {sg.total}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => copyCombinedSessionReport(sg)}
                                title="Copy Detailed WhatsApp Report"
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Copy size={11} /> Copy
                              </button>
                              <button
                                onClick={() => downloadCombinedSessionPDF(sg)}
                                title="Download Detailed PDF Report"
                                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Download size={11} /> PDF
                              </button>
                              {user?.role === 'admin' && (
                                <button
                                onClick={() => deleteSessionGroup(sg)}
                                title="Delete entire session"
                                style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={12} />
                              </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Class-wise Breakdown */}
                        {isOpen && (
                          <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                            {sg.classes.map((c, idx) => (
                              <div
                                key={c.className}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '8px 4px',
                                  borderBottom: idx < sg.classes.length - 1 ? '1px solid #f1f5f9' : 'none'
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                                    {c.className} <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>• {c.takenBy}</span>
                                  </div>
                                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, display: 'flex', gap: 8 }}>
                                    <span style={{ color: '#16a34a' }}>P: {c.P}</span>
                                    <span style={{ color: '#dc2626' }}>A: {c.A}</span>
                                    <span style={{ color: '#d97706' }}>L: {c.L}</span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  {canEditClassEntry(c.takenBy) && (
                                    <button
                                  onClick={() => openForEdit(c)}
                                  style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                                  )}
                                  {user?.role === 'admin' && (
                                    <button
                                    onClick={() => deleteClassSession(sg, c)}
                                    title="Delete this class attendance"
                                    style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MONTHLY LEDGER */}
      {mainTab === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {myAssignedClasses.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              No class assigned for monthly ledger entry. Contact admin.
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
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Class</label>
                    <select value={monthlyClass} onChange={e => setMonthlyClass(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: '#fff' }}>
                      <option value="">Select</option>
                      {myAssignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={loadMonthlyStudents} disabled={loading} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {loading ? 'Loading...' : 'Load Register'}
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
                                    if (e.target.value !== '' && Number(e.target.value) > wd) return alert(`Cannot exceed working days (${wd}).`);
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
                    <Save size={16} /> {loading ? 'Saving...' : 'Save Monthly Ledger'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => downloadPDF('nhia-monthly-sheet', `Monthly_Attendance_${monthlyClass}_${monthYear}.pdf`)} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Download size={14} /> PDF
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
                      <FileSpreadsheet size={14} /> Excel
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