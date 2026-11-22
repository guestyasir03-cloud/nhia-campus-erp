import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, PlusCircle, Award, BarChart3, Settings2, Search,
  CheckSquare, Square, Trash2, Download, FileSpreadsheet,
  TrendingUp, TrendingDown, ShieldAlert, User, X, CheckCircle2,
  AlertCircle, Edit3, History, Calendar, Layers, Users, Check
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['Ibadah', 'Academic', 'Discipline', 'Leadership'];

function getStanding(net) {
  if (net >= 50) return { label: 'Mumtaz', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
  if (net >= 15) return { label: 'Commendable', bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' };
  if (net >= 0) return { label: 'Good Standing', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  if (net >= -19) return { label: 'Warning', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  return { label: 'Action Required', bg: '#fee2e2', color: '#dc2626', border: '#fecaca' };
}

export default function ActivityModule({ onBack, user }) {
  const isStudent = user?.role === 'student' || user?.type === 'student';
  const roleStr = String(user?.role || '').toLowerCase();
  const isAdmin = roleStr.includes('admin') || roleStr.includes('coordinator');

  const [tab, setTab] = useState(isStudent ? 'student' : 'entry'); // entry | report | logs | reasons | student
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // Master Data (loaded once in parallel -> 0ms lag on filtering)
  const [allStudents, setAllStudents] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [allPoints, setAllPoints] = useState([]);

  // Entry State
  const [selectedClass, setSelectedClass] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedAdms, setSelectedAdms] = useState(new Set());
  const [reasonTypeFilter, setReasonTypeFilter] = useState('all');
  const [reasonCatFilter, setReasonCatFilter] = useState('All');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Analytics & Report State
  const [reportView, setReportView] = useState('students'); // students | classes | categories | staff
  const [reportClass, setReportClass] = useState('ALL');
  const [standingFilter, setStandingFilter] = useState('ALL');
  const [reportSearch, setReportSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detailStudent, setDetailStudent] = useState(null);

  // Audit Log State (Admin Edit / Delete)
  const [logSearch, setLogSearch] = useState('');
  const [logClass, setLogClass] = useState('ALL');
  const [logCategory, setLogCategory] = useState('ALL');
  const [logType, setLogType] = useState('ALL'); // ALL | MERIT | DEMERIT
  const [editingLog, setEditingLog] = useState(null); // { id, reason, category, points, remarks }

  // Manage Reasons State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Ibadah');
  const [newType, setNewType] = useState('merit');
  const [newPoints, setNewPoints] = useState('5');

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    setLoading(true);
    try {
      if (isStudent) {
        const { data: pts } = await supabase
          .from('activity_points')
          .select('*')
          .eq('adm_no', user.id)
          .order('created_at', { ascending: false });
        setAllPoints(pts || []);
      } else {
        const [stRes, rsnRes, ptsRes] = await Promise.all([
          supabase.from('students').select('adm_no, name, class_name, roll_no').order('name'),
          supabase.from('activity_reasons').select('*').order('points', { ascending: false }),
          supabase.from('activity_points').select('*').order('created_at', { ascending: false }).limit(5000)
        ]);
        setAllStudents(stRes.data || []);
        setReasons(rsnRes.data || []);
        setAllPoints(ptsRes.data || []);
      }
    } finally {
      setLoading(false);
    }
  }

  const studentMap = useMemo(() => {
    const map = {};
    for (const s of allStudents) map[String(s.adm_no)] = s;
    return map;
  }, [allStudents]);

  const classes = useMemo(() => {
    const set = new Set(allStudents.map(s => s.class_name).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [allStudents]);

  // Date-filtered points for Analytics
  const dateScopedPoints = useMemo(() => {
    if (!fromDate && !toDate) return allPoints;
    return allPoints.filter(p => {
      if (!p.created_at) return true;
      const d = p.created_at.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [allPoints, fromDate, toDate]);

  // Entry: Filtered Students
  const entryStudents = useMemo(() => {
    let list = selectedClass ? allStudents.filter(s => s.class_name === selectedClass) : [];
    const q = studentSearch.trim().toLowerCase();
    if (q) {
      list = (selectedClass ? list : allStudents).filter(
        s => String(s.name || '').toLowerCase().includes(q) || String(s.adm_no || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allStudents, selectedClass, studentSearch]);

  // Entry: Filtered Reasons
  const filteredReasons = useMemo(() => {
    return reasons.filter(r => {
      if (reasonTypeFilter === 'merit' && Number(r.points) < 0) return false;
      if (reasonTypeFilter === 'demerit' && Number(r.points) >= 0) return false;
      if (reasonCatFilter !== 'All' && r.category !== reasonCatFilter) return false;
      return true;
    });
  }, [reasons, reasonTypeFilter, reasonCatFilter]);

  const selectedReason = useMemo(
    () => reasons.find(r => String(r.id) === String(selectedReasonId)),
    [reasons, selectedReasonId]
  );

  // Master Analytics Computation (100% Lag-Free)
  const analytics = useMemo(() => {
    const byAdm = {};
    const byClass = {};
    const byCat = Object.fromEntries(CATEGORIES.map(c => [c, { category: c, merit: 0, demerit: 0, net: 0, count: 0 }]));
    const byStaff = {};

    let totalMerit = 0;
    let totalDemerit = 0;

    for (const p of dateScopedPoints) {
      const cls = p.class_name || studentMap[String(p.adm_no)]?.class_name || 'Unassigned';
      if (reportClass !== 'ALL' && cls !== reportClass) continue;

      const pts = Number(p.points) || 0;
      if (pts >= 0) totalMerit += pts;
      else totalDemerit += Math.abs(pts);

      // By Student
      if (!byAdm[p.adm_no]) byAdm[p.adm_no] = { merit: 0, demerit: 0, net: 0, count: 0, logs: [] };
      if (pts >= 0) byAdm[p.adm_no].merit += pts;
      else byAdm[p.adm_no].demerit += Math.abs(pts);
      byAdm[p.adm_no].net += pts;
      byAdm[p.adm_no].count += 1;
      byAdm[p.adm_no].logs.push(p);

      // By Category
      const catKey = CATEGORIES.includes(p.category) ? p.category : 'Other';
      if (!byCat[catKey]) byCat[catKey] = { category: catKey, merit: 0, demerit: 0, net: 0, count: 0 };
      if (pts >= 0) byCat[catKey].merit += pts;
      else byCat[catKey].demerit += Math.abs(pts);
      byCat[catKey].net += pts;
      byCat[catKey].count += 1;

      // By Staff
      const staff = (p.recorded_by || 'Unknown Staff').trim();
      if (!byStaff[staff]) byStaff[staff] = { staff, merit: 0, demerit: 0, net: 0, count: 0 };
      if (pts >= 0) byStaff[staff].merit += pts;
      else byStaff[staff].demerit += Math.abs(pts);
      byStaff[staff].net += pts;
      byStaff[staff].count += 1;
    }

    const scopedStudents = reportClass === 'ALL'
      ? allStudents
      : allStudents.filter(s => s.class_name === reportClass);

    let mumtazCount = 0;
    let attentionCount = 0;

    const studentRows = scopedStudents.map(s => {
      const stat = byAdm[s.adm_no] || { merit: 0, demerit: 0, net: 0, count: 0, logs: [] };
      const standing = getStanding(stat.net);
      if (stat.net >= 50) mumtazCount++;
      if (stat.net < 0) attentionCount++;

      // Class Aggregation
      const cls = s.class_name || 'Unassigned';
      if (!byClass[cls]) byClass[cls] = { className: cls, students: 0, merit: 0, demerit: 0, net: 0, mumtaz: 0, warning: 0 };
      byClass[cls].students += 1;
      byClass[cls].merit += stat.merit;
      byClass[cls].demerit += stat.demerit;
      byClass[cls].net += stat.net;
      if (stat.net >= 50) byClass[cls].mumtaz += 1;
      if (stat.net < 0) byClass[cls].warning += 1;

      return { ...s, ...stat, standing };
    }).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

    const classRows = Object.values(byClass)
      .map(c => ({ ...c, avg: c.students > 0 ? (c.net / c.students).toFixed(1) : '0.0' }))
      .sort((a, b) => b.net - a.net || a.className.localeCompare(b.className, undefined, { numeric: true }));

    const categoryRows = Object.values(byCat).sort((a, b) => b.count - a.count);
    const staffRows = Object.values(byStaff).sort((a, b) => b.count - a.count);

    return { studentRows, classRows, categoryRows, staffRows, totalMerit, totalDemerit, mumtazCount, attentionCount };
  }, [allStudents, dateScopedPoints, reportClass, studentMap]);

  const visibleStudentRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return analytics.studentRows.filter(r => {
      if (standingFilter === 'MERIT' && r.merit <= 0) return false;
      if (standingFilter === 'DEMERIT' && r.demerit <= 0) return false;
      if (standingFilter === 'MUMTAZ' && r.net < 50) return false;
      if (standingFilter === 'COMMENDABLE' && (r.net < 15 || r.net >= 50)) return false;
      if (standingFilter === 'WARNING' && (r.net >= 0 || r.net < -19)) return false;
      if (standingFilter === 'ACTION' && r.net >= -19) return false;
      if (standingFilter === 'ATTENTION' && r.net >= 0) return false;
      if (standingFilter === 'ACTIVE' && r.count === 0) return false;
      if (q && !String(r.name || '').toLowerCase().includes(q) && !String(r.adm_no || '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [analytics.studentRows, standingFilter, reportSearch]);

  // Filtered Master Audit Logs
  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return dateScopedPoints.filter(p => {
      const st = studentMap[String(p.adm_no)];
      const cls = p.class_name || st?.class_name || '';
      if (logClass !== 'ALL' && cls !== logClass) return false;
      if (logCategory !== 'ALL' && p.category !== logCategory) return false;
      if (logType === 'MERIT' && Number(p.points) < 0) return false;
      if (logType === 'DEMERIT' && Number(p.points) >= 0) return false;
      if (q) {
        const hay = `${p.adm_no} ${st?.name || ''} ${p.reason || ''} ${p.recorded_by || ''} ${p.remarks || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dateScopedPoints, logClass, logCategory, logType, logSearch, studentMap]);

  // Actions
  const toggleAdm = (adm) => {
    setSelectedAdms(prev => {
      const next = new Set(prev);
      if (next.has(adm)) next.delete(adm);
      else next.add(adm);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAdms.size === entryStudents.length && entryStudents.length > 0) {
      setSelectedAdms(new Set());
    } else {
      setSelectedAdms(new Set(entryStudents.map(s => s.adm_no)));
    }
  };

  async function handleRecordPoints() {
    if (!selectedReason || selectedAdms.size === 0) return;
    setLoading(true);
    setMsg(null);

    const pts = Number(selectedReason.points) || 0;
    const rows = Array.from(selectedAdms).map(admNo => ({
      adm_no: admNo,
      class_name: studentMap[String(admNo)]?.class_name || selectedClass || '',
      category: selectedReason.category,
      reason: selectedReason.title,
      points: pts,
      remarks: remarks.trim() || null,
      recorded_by: user?.name || 'Staff',
      academic_year: '2026-27'
    }));

    const { data, error } = await supabase.from('activity_points').insert(rows).select();
    setLoading(false);

    if (error) {
      setMsg({ type: 'err', text: 'Error: ' + error.message });
    } else {
      if (data) setAllPoints(prev => [...data, ...prev]);
      setMsg({
        type: 'ok',
        text: `${pts > 0 ? '+' : ''}${pts} points (${selectedReason.title}) recorded for ${rows.length} student(s).`
      });
      setSelectedAdms(new Set());
      setRemarks('');
    }
  }

  async function handleUpdateEntry(e) {
    e.preventDefault();
    if (!editingLog) return;
    setLoading(true);
    const updatedPts = Number(editingLog.points) || 0;
    const { data, error } = await supabase
      .from('activity_points')
      .update({
        reason: editingLog.reason.trim(),
        category: editingLog.category,
        points: updatedPts,
        remarks: editingLog.remarks?.trim() || null
      })
      .eq('id', editingLog.id)
      .select()
      .single();

    setLoading(false);
    if (error) {
      setMsg({ type: 'err', text: 'Update failed: ' + error.message });
    } else {
      setAllPoints(prev => prev.map(p => (p.id === editingLog.id ? (data || { ...p, ...editingLog, points: updatedPts }) : p)));
      if (detailStudent) {
        setDetailStudent(prev => {
          if (!prev) return null;
          const logs = prev.logs.map(l => (l.id === editingLog.id ? (data || { ...l, ...editingLog, points: updatedPts }) : l));
          let merit = 0, demerit = 0, net = 0;
          logs.forEach(l => {
            const v = Number(l.points) || 0;
            if (v >= 0) merit += v; else demerit += Math.abs(v);
            net += v;
          });
          return { ...prev, logs, merit, demerit, net, count: logs.length, standing: getStanding(net) };
        });
      }
      setEditingLog(null);
      setMsg({ type: 'ok', text: 'Activity entry updated successfully.' });
    }
  }

  async function handleDeleteEntry(id) {
    if (!window.confirm('Delete this activity record permanently?')) return;
    const { error } = await supabase.from('activity_points').delete().eq('id', id);
    if (error) {
      setMsg({ type: 'err', text: 'Delete failed: ' + error.message });
    } else {
      setAllPoints(prev => prev.filter(p => p.id !== id));
      if (detailStudent) {
        setDetailStudent(prev => {
          if (!prev) return null;
          const logs = prev.logs.filter(l => l.id !== id);
          let merit = 0, demerit = 0, net = 0;
          logs.forEach(l => {
            const v = Number(l.points) || 0;
            if (v >= 0) merit += v; else demerit += Math.abs(v);
            net += v;
          });
          return { ...prev, logs, merit, demerit, net, count: logs.length, standing: getStanding(net) };
        });
      }
      setMsg({ type: 'ok', text: 'Entry deleted.' });
    }
  }

  async function handleAddReason(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const val = Math.abs(Number(newPoints) || 0);
    const finalPts = newType === 'demerit' ? -val : val;

    setLoading(true);
    const { data, error } = await supabase
      .from('activity_reasons')
      .insert({ title: newTitle.trim(), category: newCategory, points: finalPts })
      .select()
      .single();
    setLoading(false);

    if (error) {
      setMsg({ type: 'err', text: 'Error: ' + error.message });
    } else {
      if (data) setReasons(prev => [data, ...prev]);
      setNewTitle('');
      setNewPoints('5');
      setMsg({ type: 'ok', text: 'New rule added successfully.' });
    }
  }

  async function handleDeleteReason(id) {
    if (!window.confirm('Remove this rule?')) return;
    const { error } = await supabase.from('activity_reasons').delete().eq('id', id);
    if (!error) setReasons(prev => prev.filter(r => r.id !== id));
  }

  function downloadCSV(filename, headers, rows) {
    const lines = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentReportCSV() {
    if (reportView === 'students') {
      downloadCSV(
        `NHIA_Activity_Students_${reportClass}.csv`,
        ['Rank', 'Adm No', 'Student Name', 'Class', 'Merit (+)', 'Demerit (-)', 'Net Score', 'Standing'],
        visibleStudentRows.map((r, i) => [i + 1, r.adm_no, r.name, r.class_name, r.merit, r.demerit, r.net, r.standing.label])
      );
    } else if (reportView === 'classes') {
      downloadCSV(
        `NHIA_Activity_ClassSummary.csv`,
        ['Class', 'Students', 'Merit (+)', 'Demerit (-)', 'Net Total', 'Avg/Student', 'Mumtaz', 'Warning'],
        analytics.classRows.map(c => [c.className, c.students, c.merit, c.demerit, c.net, c.avg, c.mumtaz, c.warning])
      );
    } else if (reportView === 'categories') {
      downloadCSV(
        `NHIA_Activity_Categories.csv`,
        ['Category', 'Entries', 'Merit (+)', 'Demerit (-)', 'Net Total'],
        analytics.categoryRows.map(c => [c.category, c.count, c.merit, c.demerit, c.net])
      );
    } else if (reportView === 'staff') {
      downloadCSV(
        `NHIA_Activity_StaffReport.csv`,
        ['Staff Name', 'Entries', 'Merit Given', 'Demerit Given', 'Net Impact'],
        analytics.staffRows.map(s => [s.staff, s.count, s.merit, s.demerit, s.net])
      );
    }
  }

  function exportAuditLogsCSV() {
    downloadCSV(
      `NHIA_Activity_AuditLog.csv`,
      ['Date', 'Adm No', 'Student Name', 'Class', 'Category', 'Reason', 'Points', 'Remarks', 'Recorded By'],
      filteredLogs.map(l => [
        l.created_at ? new Date(l.created_at).toLocaleDateString() : '',
        l.adm_no,
        studentMap[String(l.adm_no)]?.name || '',
        l.class_name || studentMap[String(l.adm_no)]?.class_name || '',
        l.category,
        l.reason,
        l.points,
        l.remarks || '',
        l.recorded_by || ''
      ])
    );
  }

  function exportPDF(elementId, filename) {
    const el = document.getElementById(elementId);
    if (!el) return;
    html2pdf().set({
      margin: 8,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  // ==================== STUDENT PERSONAL VIEW ====================
  if (isStudent) {
    let merit = 0, demerit = 0, net = 0;
    const catTotals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    allPoints.forEach(p => {
      const v = Number(p.points) || 0;
      if (v >= 0) merit += v; else demerit += Math.abs(v);
      net += v;
      if (catTotals[p.category] !== undefined) catTotals[p.category] += v;
    });
    const standing = getStanding(net);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#0f172a' }}>My Activity Record</h2>
            <div style={{ fontSize: 12, color: '#64748b' }}>Academic Year 2026–27</div>
          </div>
        </div>

        <div style={{ background: '#0f172a', color: '#fff', borderRadius: 16, padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.6 }}>Net Activity Score</div>
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>{net > 0 ? `+${net}` : net}</div>
            </div>
            <span style={{ background: standing.bg, color: standing.color, padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
              {standing.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Total Merit</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>+{merit}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Total Demerit</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f87171' }}>-{demerit}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          {CATEGORIES.map(cat => (
            <div key={cat} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{cat}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: catTotals[cat] >= 0 ? '#15803d' : '#dc2626' }}>
                {catTotals[cat] > 0 ? `+${catTotals[cat]}` : catTotals[cat]}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            Activity History ({allPoints.length})
          </div>
          {allPoints.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#64748b' }}>No activity points recorded yet.</div>
          ) : (
            allPoints.map(p => (
              <div key={p.id} style={{ padding: '11px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.reason}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {p.category} • By {p.recorded_by || 'Staff'} • {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                  </div>
                  {p.remarks && <div style={{ fontSize: 11, color: '#475569', marginTop: 2, fontStyle: 'italic' }}>"{p.remarks}"</div>}
                </div>
                <span style={{
                  fontWeight: 800, fontSize: 13, padding: '4px 10px', borderRadius: 8,
                  background: p.points >= 0 ? '#dcfce7' : '#fee2e2',
                  color: p.points >= 0 ? '#15803d' : '#dc2626', whiteSpace: 'nowrap'
                }}>
                  {p.points > 0 ? `+${p.points}` : p.points}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ==================== STAFF / ADMIN VIEW ====================
  const navTabs = [
    { id: 'entry', label: 'Entry', icon: PlusCircle },
    { id: 'report', label: 'Reports', icon: BarChart3 },
    ...(isAdmin ? [{ id: 'logs', label: 'Edit Logs', icon: History }] : []),
    ...(isAdmin ? [{ id: 'reasons', label: 'Rules', icon: Settings2 }] : [])
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#0f172a' }}>Activity & Conduct</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>Merit / Demerit Evaluation & Admin Reports</div>
          </div>
        </div>
      </div>

      {/* Top Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${navTabs.length}, 1fr)`, gap: 5, background: '#e2e8f0', padding: 4, borderRadius: 12, marginBottom: 14 }}>
        {navTabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMsg(null); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '9px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontWeight: 700,
                background: active ? '#fff' : 'transparent',
                color: active ? '#2e44d2' : '#475569',
                boxShadow: active ? '0 1px 4px rgba(15,23,42,0.08)' : 'none'
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Status Alert */}
      {msg && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          fontSize: 13, fontWeight: 600,
          background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
          color: msg.type === 'ok' ? '#15803d' : '#dc2626',
          border: `1px solid ${msg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={15} /></button>
        </div>
      )}

      {/* ==================== TAB 1: RECORD ENTRY ==================== */}
      {tab === 'entry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
              1. Select Student(s)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginBottom: 10 }}>
              <select
                value={selectedClass}
                onChange={e => { setSelectedClass(e.target.value); setSelectedAdms(new Set()); }}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#f8fafc', fontWeight: 600 }}
              >
                <option value="">All Classes (Search)</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <Search size={15} color="#64748b" style={{ position: 'absolute', left: 10, top: 12 }} />
                <input
                  type="text"
                  placeholder="Name or Adm No..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 10px 10px 32px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {entryStudents.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>
                    Showing {entryStudents.length} • Selected: <b style={{ color: '#2e44d2' }}>{selectedAdms.size}</b>
                  </span>
                  <button type="button" onClick={toggleSelectAll} style={{ background: 'none', border: 'none', color: '#2e44d2', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                    {selectedAdms.size === entryStudents.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  {entryStudents.map(s => {
                    const checked = selectedAdms.has(s.adm_no);
                    return (
                      <div
                        key={s.adm_no}
                        onClick={() => toggleAdm(s.adm_no)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '9px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          background: checked ? '#eef2ff' : '#fff'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          {checked ? <CheckSquare size={17} color="#2e44d2" /> : <Square size={17} color="#94a3b8" />}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no} • {s.class_name}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
              2. Select Evaluation Criteria
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'merit', label: 'Merit (+)' },
                { id: 'demerit', label: 'Demerit (-)' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setReasonTypeFilter(f.id)}
                  style={{
                    padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: reasonTypeFilter === f.id ? '1px solid #2e44d2' : '1px solid #cbd5e1',
                    background: reasonTypeFilter === f.id ? '#eef2ff' : '#fff',
                    color: reasonTypeFilter === f.id ? '#2e44d2' : '#475569'
                  }}
                >
                  {f.label}
                </button>
              ))}
              <select
                value={reasonCatFilter}
                onChange={e => setReasonCatFilter(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: 210, overflowY: 'auto', padding: 2 }}>
              {filteredReasons.map(r => {
                const active = String(selectedReasonId) === String(r.id);
                const isMerit = Number(r.points) >= 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReasonId(r.id)}
                    style={{
                      textAlign: 'left', padding: '10px 11px', borderRadius: 10, cursor: 'pointer',
                      border: active ? `2px solid ${isMerit ? '#16a34a' : '#dc2626'}` : '1px solid #e2e8f0',
                      background: active ? (isMerit ? '#f0fdf4' : '#fef2f2') : '#f8fafc',
                      display: 'flex', flexDirection: 'column', gap: 4
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{r.category}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: isMerit ? '#15803d' : '#dc2626' }}>
                        {r.points > 0 ? `+${r.points}` : r.points}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>{r.title}</div>
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="Optional remarks / note..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 10, boxSizing: 'border-box' }}
            />

            <button
              type="button"
              disabled={loading || !selectedReason || selectedAdms.size === 0}
              onClick={handleRecordPoints}
              style={{
                width: '100%', marginTop: 12, padding: 13, borderRadius: 12, border: 'none',
                background: (!selectedReason || selectedAdms.size === 0) ? '#94a3b8' : (Number(selectedReason.points) >= 0 ? '#16a34a' : '#dc2626'),
                color: '#fff', fontWeight: 800, fontSize: 14, cursor: (!selectedReason || selectedAdms.size === 0) ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Recording...' : selectedReason && selectedAdms.size > 0
                ? `Record ${selectedReason.points > 0 ? '+' : ''}${selectedReason.points} pts for ${selectedAdms.size} Student(s)`
                : 'Select Student(s) & Criteria'}
            </button>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: ADVANCED REPORTS & ANALYTICS ==================== */}
      {tab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI Cards (Clickable Quick Filters) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div
              onClick={() => { setReportView('students'); setStandingFilter(standingFilter === 'MERIT' ? 'ALL' : 'MERIT'); }}
              style={{
                background: standingFilter === 'MERIT' ? '#f0fdf4' : '#fff',
                border: standingFilter === 'MERIT' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 6px', textAlign: 'center', cursor: 'pointer'
              }}
            >
              <TrendingUp size={15} color="#16a34a" style={{ marginBottom: 2 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>+{analytics.totalMerit}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Merit List</div>
            </div>
            <div
              onClick={() => { setReportView('students'); setStandingFilter(standingFilter === 'DEMERIT' ? 'ALL' : 'DEMERIT'); }}
              style={{
                background: standingFilter === 'DEMERIT' ? '#fef2f2' : '#fff',
                border: standingFilter === 'DEMERIT' ? '2px solid #dc2626' : '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 6px', textAlign: 'center', cursor: 'pointer'
              }}
            >
              <TrendingDown size={15} color="#dc2626" style={{ marginBottom: 2 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>-{analytics.totalDemerit}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Demerit List</div>
            </div>
            <div
              onClick={() => { setReportView('students'); setStandingFilter(standingFilter === 'MUMTAZ' ? 'ALL' : 'MUMTAZ'); }}
              style={{
                background: standingFilter === 'MUMTAZ' ? '#eef2ff' : '#fff',
                border: standingFilter === 'MUMTAZ' ? '2px solid #2e44d2' : '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 6px', textAlign: 'center', cursor: 'pointer'
              }}
            >
              <Award size={15} color="#2e44d2" style={{ marginBottom: 2 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#2e44d2' }}>{analytics.mumtazCount}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Mumtaz</div>
            </div>
            <div
              onClick={() => { setReportView('students'); setStandingFilter(standingFilter === 'ATTENTION' ? 'ALL' : 'ATTENTION'); }}
              style={{
                background: standingFilter === 'ATTENTION' ? '#fffbeb' : '#fff',
                border: standingFilter === 'ATTENTION' ? '2px solid #b45309' : '1px solid #e2e8f0',
                borderRadius: 12, padding: '10px 6px', textAlign: 'center', cursor: 'pointer'
              }}
            >
              <ShieldAlert size={15} color="#b45309" style={{ marginBottom: 2 }} />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{analytics.attentionCount}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Warning</div>
            </div>
          </div>

          {/* Sub-Report Switcher */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { id: 'students', label: 'Students', icon: Users },
              { id: 'classes', label: 'Classes', icon: Layers },
              { id: 'categories', label: 'Category', icon: Award },
              { id: 'staff', label: 'Staff', icon: User }
            ].map(rv => {
              const Icon = rv.icon;
              const active = reportView === rv.id;
              return (
                <button
                  key={rv.id}
                  onClick={() => setReportView(rv.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '8px 4px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    border: active ? '1.5px solid #2e44d2' : '1px solid #e2e8f0',
                    background: active ? '#eef2ff' : '#fff',
                    color: active ? '#2e44d2' : '#475569'
                  }}
                >
                  <Icon size={14} /> {rv.label}
                </button>
              );
            })}
          </div>

          {/* Filters & Date Range + Export */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={reportClass} onChange={e => setReportClass(e.target.value)} style={{ padding: 8, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600 }}>
                <option value="ALL">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {reportView === 'students' ? (
                <select value={standingFilter} onChange={e => setStandingFilter(e.target.value)} style={{ padding: 8, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600 }}>
                  <option value="ALL">All Students</option>
                  <option value="MERIT">Merit Holders (+)</option>
                  <option value="DEMERIT">Demerit Holders (-)</option>
                  <option value="ATTENTION">All Warning &amp; Action (&lt; 0)</option>
                  <option value="WARNING">Warning Only (-1 to -19)</option>
                  <option value="ACTION">Action Required (-20 &amp; below)</option>
                  <option value="MUMTAZ">Mumtaz (50+)</option>
                  <option value="COMMENDABLE">Commendable (15 to 49)</option>
                  <option value="ACTIVE">Only Students with Entries</option>
                </select>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: '#64748b', paddingLeft: 4 }}>
                  <Calendar size={13} style={{ marginRight: 5 }} /> Filter by date below
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="From Date" style={{ padding: 7, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="To Date" style={{ padding: 7, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12 }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {reportView === 'students' && (
                <input
                  type="text"
                  placeholder="Search student..."
                  value={reportSearch}
                  onChange={e => setReportSearch(e.target.value)}
                  style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
              )}
              <button onClick={() => exportPDF('nhia-activity-pdf', `NHIA_Activity_${reportView}.pdf`)} style={{ flex: reportView === 'students' ? 0 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Download size={14} /> PDF
              </button>
              <button onClick={exportCurrentReportCSV} style={{ flex: reportView === 'students' ? 0 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <FileSpreadsheet size={14} /> CSV
              </button>
            </div>
          </div>

          {/* Printable Formal Report Area */}
          <div id="nhia-activity-pdf" style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflowX: 'auto', padding: 12 }}>
            <div style={{ textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Noorul Hidaya Islamic Academy</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {reportView === 'students' && `Student Activity Report • ${reportClass === 'ALL' ? 'All Classes' : reportClass}`}
                {reportView === 'classes' && 'Class-wise Conduct & Activity Summary'}
                {reportView === 'categories' && 'Category-wise Evaluation Breakdown'}
                {reportView === 'staff' && 'Staff-wise Activity Recording Summary'}
                {(fromDate || toDate) ? ` (${fromDate || 'Start'} to ${toDate || 'Today'})` : ' • 2026–27'}
              </div>
            </div>

            {/* 2A: Students Ranking Table */}
            {reportView === 'students' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>#</th>
                    <th style={{ padding: '8px 6px' }}>Student</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>+ / -</th>
                    <th style={{ padding: '8px 6px', textAlign: 'center' }}>Net</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Standing</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudentRows.map((r, i) => (
                    <tr key={r.adm_no} onClick={() => setDetailStudent(r)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <td style={{ padding: '9px 6px', fontWeight: 700, color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '9px 6px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{r.adm_no} • {r.class_name}</div>
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'center', fontSize: 11 }}>
                        <span style={{ color: '#15803d', fontWeight: 700 }}>+{r.merit}</span> / <span style={{ color: '#dc2626', fontWeight: 700 }}>-{r.demerit}</span>
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 800, fontSize: 13, color: r.net >= 0 ? '#0f172a' : '#dc2626' }}>
                        {r.net > 0 ? `+${r.net}` : r.net}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                        <span style={{ background: r.standing.bg, color: r.standing.color, border: `1px solid ${r.standing.border}`, padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {r.standing.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2B: Class-wise Summary Table */}
            {reportView === 'classes' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Class</th>
                    <th style={{ padding: 8 }}>Strength</th>
                    <th style={{ padding: 8 }}>Merit</th>
                    <th style={{ padding: 8 }}>Demerit</th>
                    <th style={{ padding: 8 }}>Net</th>
                    <th style={{ padding: 8 }}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.classRows.map(c => (
                    <tr key={c.className} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 9, textAlign: 'left', fontWeight: 800, color: '#0f172a' }}>{c.className}</td>
                      <td style={{ padding: 9 }}>{c.students}</td>
                      <td style={{ padding: 9, color: '#15803d', fontWeight: 700 }}>+{c.merit}</td>
                      <td style={{ padding: 9, color: '#dc2626', fontWeight: 700 }}>-{c.demerit}</td>
                      <td style={{ padding: 9, fontWeight: 800 }}>{c.net > 0 ? `+${c.net}` : c.net}</td>
                      <td style={{ padding: 9, color: '#2e44d2', fontWeight: 700 }}>{c.avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2C: Category-wise Breakdown Table */}
            {reportView === 'categories' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Category</th>
                    <th style={{ padding: 8 }}>Entries</th>
                    <th style={{ padding: 8 }}>Merit (+)</th>
                    <th style={{ padding: 8 }}>Demerit (-)</th>
                    <th style={{ padding: 8 }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.categoryRows.map(c => (
                    <tr key={c.category} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 9, textAlign: 'left', fontWeight: 800, color: '#0f172a' }}>{c.category}</td>
                      <td style={{ padding: 9 }}>{c.count}</td>
                      <td style={{ padding: 9, color: '#15803d', fontWeight: 700 }}>+{c.merit}</td>
                      <td style={{ padding: 9, color: '#dc2626', fontWeight: 700 }}>-{c.demerit}</td>
                      <td style={{ padding: 9, fontWeight: 800 }}>{c.net > 0 ? `+${c.net}` : c.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2D: Staff Activity Summary Table */}
            {reportView === 'staff' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Staff Name</th>
                    <th style={{ padding: 8 }}>Entries</th>
                    <th style={{ padding: 8 }}>Merit</th>
                    <th style={{ padding: 8 }}>Demerit</th>
                    <th style={{ padding: 8 }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.staffRows.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 16, color: '#64748b' }}>No entries recorded in this period.</td></tr>
                  ) : (
                    analytics.staffRows.map(s => (
                      <tr key={s.staff} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 9, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{s.staff}</td>
                        <td style={{ padding: 9, fontWeight: 700 }}>{s.count}</td>
                        <td style={{ padding: 9, color: '#15803d', fontWeight: 700 }}>+{s.merit}</td>
                        <td style={{ padding: 9, color: '#dc2626', fontWeight: 700 }}>-{s.demerit}</td>
                        <td style={{ padding: 9, fontWeight: 800 }}>{s.net > 0 ? `+${s.net}` : s.net}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: ADMIN MASTER AUDIT LOG (EDIT & DELETE) ==================== */}
      {tab === 'logs' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>All Recorded Entries ({filteredLogs.length})</div>
              <button onClick={exportAuditLogsCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                <FileSpreadsheet size={13} /> Export Log CSV
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <select value={logClass} onChange={e => setLogClass(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5 }}>
                <option value="ALL">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={logCategory} onChange={e => setLogCategory(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5 }}>
                <option value="ALL">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={logType} onChange={e => setLogType(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 11.5 }}>
                <option value="ALL">Merit & Demerit</option>
                <option value="MERIT">Merit Only (+)</option>
                <option value="DEMERIT">Demerit Only (-)</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Search by student, adm no, reason, or staff..."
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              style={{ padding: '8px 11px', borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12 }}
            />
          </div>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {filteredLogs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#64748b' }}>No activity logs match your filter.</div>
            ) : (
              filteredLogs.slice(0, 150).map(log => {
                const st = studentMap[String(log.adm_no)];
                return (
                  <div key={log.id} style={{ padding: '11px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                        {st?.name || `Adm #${log.adm_no}`} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>({log.adm_no} • {log.class_name || st?.class_name})</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginTop: 2 }}>{log.reason}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        {log.category} • By {log.recorded_by || 'Staff'} • {log.created_at ? new Date(log.created_at).toLocaleDateString() : ''}
                      </div>
                      {log.remarks && <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>"{log.remarks}"</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontWeight: 800, fontSize: 13, padding: '3px 8px', borderRadius: 8,
                        background: log.points >= 0 ? '#dcfce7' : '#fee2e2',
                        color: log.points >= 0 ? '#15803d' : '#dc2626'
                      }}>
                        {log.points > 0 ? `+${log.points}` : log.points}
                      </span>
                      <button
                        onClick={() => setEditingLog({ id: log.id, reason: log.reason || '', category: log.category || 'Ibadah', points: log.points, remarks: log.remarks || '' })}
                        title="Edit Entry"
                        style={{ background: '#eef2ff', border: 'none', borderRadius: 7, padding: 6, color: '#2e44d2', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(log.id)}
                        title="Delete Entry"
                        style={{ background: '#fee2e2', border: 'none', borderRadius: 7, padding: 6, color: '#dc2626', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 4: MANAGE RULES (ADMIN) ==================== */}
      {tab === 'reasons' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <form onSubmit={handleAddReason} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Add Evaluation Rule</div>
            <input
              type="text"
              placeholder="Rule Title (e.g., Best Speech, Late to Class)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              required
              style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ padding: 9, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12 }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newType} onChange={e => setNewType(e.target.value)} style={{ padding: 9, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12 }}>
                <option value="merit">Merit (+)</option>
                <option value="demerit">Demerit (-)</option>
              </select>
              <input
                type="number"
                min="1"
                value={newPoints}
                onChange={e => setNewPoints(e.target.value)}
                required
                style={{ padding: 9, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, textAlign: 'center' }}
              />
            </div>
            <button type="submit" disabled={loading} style={{ padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              + Add Rule
            </button>
          </form>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {reasons.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.category}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontWeight: 800, fontSize: 12, padding: '3px 9px', borderRadius: 8,
                    background: r.points >= 0 ? '#dcfce7' : '#fee2e2',
                    color: r.points >= 0 ? '#15803d' : '#dc2626'
                  }}>
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </span>
                  <button onClick={() => handleDeleteReason(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== STUDENT DETAIL MODAL ==================== */}
      {detailStudent && (
        <div
          onClick={() => setDetailStudent(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={18} color="#2e44d2" />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{detailStudent.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {detailStudent.adm_no} • {detailStudent.class_name}</div>
                </div>
              </div>
              <button onClick={() => setDetailStudent(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Net Score</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: detailStudent.net >= 0 ? '#0f172a' : '#dc2626' }}>
                  {detailStudent.net > 0 ? `+${detailStudent.net}` : detailStudent.net}
                </div>
              </div>
              <span style={{ background: detailStudent.standing.bg, color: detailStudent.standing.color, padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
                {detailStudent.standing.label}
              </span>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
              History Log ({detailStudent.logs.length})
            </div>

            {detailStudent.logs.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#64748b' }}>No entries yet.</div>
            ) : (
              detailStudent.logs.map(log => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{log.reason}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {log.category} • {log.recorded_by} • {log.created_at ? new Date(log.created_at).toLocaleDateString() : ''}
                    </div>
                    {log.remarks && <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>"{log.remarks}"</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: log.points >= 0 ? '#15803d' : '#dc2626' }}>
                      {log.points > 0 ? `+${log.points}` : log.points}
                    </span>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setEditingLog({ id: log.id, reason: log.reason || '', category: log.category || 'Ibadah', points: log.points, remarks: log.remarks || '' })}
                          style={{ background: '#eef2ff', border: 'none', borderRadius: 6, padding: 5, color: '#2e44d2', cursor: 'pointer' }}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => handleDeleteEntry(log.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: 5, color: '#dc2626', cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ==================== ADMIN EDIT ENTRY MODAL ==================== */}
      {editingLog && (
        <div
          onClick={() => setEditingLog(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1100 }}
        >
          <form onSubmit={handleUpdateEntry} onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Edit Activity Entry</div>
              <button type="button" onClick={() => setEditingLog(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Reason
              <input
                type="text"
                value={editingLog.reason}
                onChange={e => setEditingLog({ ...editingLog, reason: e.target.value })}
                required
                style={{ width: '100%', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Category
                <select
                  value={editingLog.category}
                  onChange={e => setEditingLog({ ...editingLog, category: e.target.value })}
                  style={{ width: '100%', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 12, marginTop: 4 }}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Points (+/-)
                <input
                  type="number"
                  value={editingLog.points}
                  onChange={e => setEditingLog({ ...editingLog, points: e.target.value })}
                  required
                  style={{ width: '100%', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, textAlign: 'center', boxSizing: 'border-box' }}
                />
              </label>
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Remarks
              <input
                type="text"
                value={editingLog.remarks}
                onChange={e => setEditingLog({ ...editingLog, remarks: e.target.value })}
                placeholder="Optional note..."
                style={{ width: '100%', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }}
              />
            </label>

            <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
              <Check size={16} /> {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
