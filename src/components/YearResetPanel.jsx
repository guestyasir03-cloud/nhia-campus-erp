import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, RotateCcw, Download, RefreshCw,
  CheckSquare, Square, Database
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearClassAccessCache } from '../lib/useClassAccess';

const MODULES = [
  { id: 'attendance', label: 'Attendance Records', desc: 'Daily & monthly attendance logs', tables: ['attendance'], classScoped: true, critical: false },
  { id: 'leaves', label: 'Leave & Outpass Records', desc: 'Student leave applications & return logs', tables: ['student_leaves'], classScoped: true, critical: false },
  { id: 'gadgets', label: 'Gadget Registry & Requests', desc: 'Approved campus gadgets & pending requests', tables: ['gadgets', 'gadget_requests'], classScoped: false, critical: false },
  { id: 'feedback', label: 'Student Feedback Records', desc: 'Student ratings, comments & custom subject mappings', tables: ['feedback_responses', 'feedback_config'], classScoped: true, critical: false },
  { id: 'marks', label: 'Exam Marks (W1–W4 / Midterm / Hifz)', desc: 'All student marks & grade records', tables: ['marks'], classScoped: true, critical: false },
  { id: 'activity', label: 'Activity & Conduct Points', desc: 'Student merit (+) & demerit (-) logs', tables: ['activity_points'], classScoped: true, critical: false },
  { id: 'appraisal', label: 'Staff Appraisal Records', desc: 'Monitoring logs, self-forms & scorecards', tables: ['appraisal_monitoring', 'appraisal_self_assessments', 'appraisal_evaluations'], classScoped: false, critical: false },
  { id: 'assignments', label: 'Class Teachers & Subject Mapping', desc: 'Class teacher & subject-teacher allocations', tables: ['class_teachers', 'subject_assignments'], classScoped: true, critical: false },
  { id: 'syllabus', label: 'Syllabus & Teaching Progress', desc: 'Syllabus entries & completion logs', tables: ['syllabus'], classScoped: true, critical: false },
  { id: 'announcements', label: 'Announcements & Notices', desc: 'Campus notices & circulars', tables: ['announcements'], classScoped: false, critical: false },
  { id: 'finance', label: 'Finance & Monthly Donations', desc: 'Receipts, payment logs, arrears & monthly amounts', tables: ['donation_receipts', 'donation_payments'], classScoped: true, critical: true },
  { id: 'students', label: 'Students Directory', desc: 'Deletes student profiles & login records', tables: ['students'], classScoped: true, critical: true },
  { id: 'staff', label: 'Staff Directory', desc: 'Deletes staff accounts (keeps active admin)', tables: ['staff'], classScoped: false, critical: true }
];

export default function YearResetPanel({ user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [selected, setSelected] = useState({});
  const [classes, setClasses] = useState([]);
  const [scopeClass, setScopeClass] = useState('ALL');
  const [counts, setCounts] = useState({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (isAdmin) {
      loadMeta();
    }
  }, [isAdmin]);

  async function loadMeta() {
    setLoadingCounts(true);
    const { data: st } = await supabase.from('students').select('class_name');
    if (st) {
      setClasses([...new Set(st.map(d => d.class_name).filter(Boolean))].sort());
    }

    // Fast parallel row counts (head: true transfers zero rows = zero lag)
    const countEntries = await Promise.all(
      MODULES.map(async m => {
        const res = await Promise.allSettled(
          m.tables.map(t => supabase.from(t).select('*', { count: 'exact', head: true }))
        );
        const total = res.reduce((sum, r) => sum + (r.status === 'fulfilled' ? (r.value.count || 0) : 0), 0);
        return [m.id, total];
      })
    );

    setCounts(Object.fromEntries(countEntries));
    setLoadingCounts(false);
  }

  if (!isAdmin) return null;

  const activeKeys = Object.keys(selected).filter(k => selected[k]);
  const hasCritical = MODULES.some(m => m.critical && selected[m.id]);

  function toggleOption(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function applyPreset(type) {
    setMsg('');
    if (type === 'all') {
      setSelected(MODULES.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}));
    } else if (type === 'none') {
      setSelected({});
    } else if (type === 'academic_year') {
      setSelected({
        attendance: true,
        marks: true,
        activity: true,
        syllabus: true,
        announcements: true
      });
    }
  }

  // Export JSON Backup of all selected modules before wiping
  async function handleBackupSelected() {
    if (activeKeys.length === 0) return alert('Select at least one module to backup.');
    setLoading(true);
    setMsg('');

    try {
      const backupObj = {
        exported_at: new Date().toISOString(),
        scope: scopeClass,
        data: {}
      };

      const selectedMods = MODULES.filter(m => selected[m.id]);
      await Promise.all(
        selectedMods.map(async m => {
          for (const tbl of m.tables) {
            let q = supabase.from(tbl).select('*');
            if (scopeClass !== 'ALL' && m.classScoped) {
              q = q.eq('class_name', scopeClass);
            }
            const { data } = await q;
            if (data) backupObj.data[tbl] = data;
          }
        })
      );

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NHIA_Backup_${scopeClass}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setMsg('Backup JSON downloaded. Safe to proceed with reset.');
    } catch (err) {
      setMsg('Backup error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Execute Selective Reset (Parallel & Fault-Tolerant)
  async function handleSelectiveReset() {
    if (activeKeys.length === 0) return alert('Select at least one module to reset.');
    if (confirmText.trim().toUpperCase() !== 'RESET') {
      return alert('Type RESET to confirm.');
    }

    const ok = window.confirm(
      `Confirm permanent reset for: ${activeKeys.join(', ').toUpperCase()}\nScope: ${scopeClass === 'ALL' ? 'FULL CAMPUS' : `Class ${scopeClass}`}`
    );
    if (!ok) return;

    setLoading(true);
    setMsg('');

    try {
      const ops = [];
      const isScoped = scopeClass !== 'ALL';

      const delTable = (tbl, canScope) => {
        const q = supabase.from(tbl).delete();
        if (isScoped && canScope) return q.eq('class_name', scopeClass);
        return q.neq('id', -1);
      };

      if (selected.attendance) ops.push(delTable('attendance', true));
      if (selected.marks) ops.push(delTable('marks', true));
      if (selected.activity) ops.push(delTable('activity_points', true));
      if (selected.syllabus) ops.push(delTable('syllabus', true));
      if (selected.announcements) ops.push(delTable('announcements', false));

      if (selected.appraisal) {
        ops.push(delTable('appraisal_monitoring', false));
        ops.push(delTable('appraisal_self_assessments', false));
        ops.push(delTable('appraisal_evaluations', false));
      }

      if (selected.assignments) {
        ops.push(delTable('class_teachers', true));
        ops.push(delTable('subject_assignments', true));
      }

      if (selected.finance) {
        ops.push(delTable('donation_receipts', true));
        ops.push(delTable('donation_payments', true));
        // Reset student-level donation amounts & last paid month
        let finUpdate = supabase.from('students').update({ monthly_donation: 0, last_paid_month: null });
        finUpdate = isScoped ? finUpdate.eq('class_name', scopeClass) : finUpdate.neq('adm_no', '');
        ops.push(finUpdate);
      }

      if (selected.students) {
        let stDel = supabase.from('students').delete();
        stDel = isScoped ? stDel.eq('class_name', scopeClass) : stDel.neq('adm_no', '');
        ops.push(stDel);
      }

      if (selected.staff) {
        const currentAdminId = String(user?.staff_id || user?.id || '');
        const staffDel = currentAdminId
          ? supabase.from('staff').delete().neq('staff_id', currentAdminId)
          : supabase.from('staff').delete().neq('staff_id', '');
        ops.push(staffDel);
      }

      await Promise.allSettled(ops);
      if (selected.assignments || selected.students || selected.staff) {
        clearClassAccessCache();
      }

      setConfirmText('');
      setSelected({});
      setMsg(`Reset completed (${scopeClass === 'ALL' ? 'Full Campus' : scopeClass}): ${activeKeys.join(', ')}.`);
      loadMeta();
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 800, fontSize: 15 }}>
          <Database size={18} /> Advanced System Reset
        </div>
        <button
          type="button"
          onClick={loadMeta}
          disabled={loadingCounts}
          style={{ border: 'none', background: '#f1f5f9', padding: '6px 9px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#475569' }}
        >
          <RefreshCw size={12} /> {loadingCounts ? '...' : 'Refresh'}
        </button>
      </div>

      {/* SCOPE SELECTOR & QUICK PRESETS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Reset Scope:</label>
          <select
            value={scopeClass}
            onChange={e => setScopeClass(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700 }}
          >
            <option value="ALL">Full Campus (All Classes)</option>
            {classes.map(c => <option key={c} value={c}>Only Class: {c}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 6 }}>
          <button type="button" onClick={() => applyPreset('academic_year')} style={{ padding: '7px 4px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#2e44d2', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            New Academic Year
          </button>
          <button type="button" onClick={() => applyPreset('all')} style={{ padding: '7px 4px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            Select All
          </button>
          <button type="button" onClick={() => applyPreset('none')} style={{ padding: '7px 4px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            Clear All
          </button>
        </div>
      </div>

      {/* ALL MODULES CHECKLIST (NO SPECIAL PRIVILEGE) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {MODULES.map(m => {
          const checked = !!selected[m.id];
          const disabledByScope = scopeClass !== 'ALL' && !m.classScoped;
          return (
            <div
              key={m.id}
              onClick={() => !disabledByScope && toggleOption(m.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                cursor: disabledByScope ? 'not-allowed' : 'pointer',
                opacity: disabledByScope ? 0.45 : 1,
                border: checked ? (m.critical ? '1.5px solid #dc2626' : '1px solid #ef4444') : '1px solid #e2e8f0',
                background: checked ? '#fef2f2' : '#fff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                {checked ? <CheckSquare size={17} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={17} color="#94a3b8" style={{ marginTop: 1, flexShrink: 0 }} />}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: m.critical ? '#991b1b' : '#0f172a' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    {disabledByScope ? 'Full Campus scope only' : m.desc}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6, background: '#f1f5f9', color: '#475569', whiteSpace: 'nowrap' }}>
                {counts[m.id] ?? 0} rows
              </span>
            </div>
          );
        })}
      </div>

      {/* CRITICAL WARNING */}
      {hasCritical && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: 10, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#991b1b', fontWeight: 700 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          Warning: Critical data (Finance / Students / Staff) is selected. Download a JSON backup before resetting.
        </div>
      )}

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      {/* BACKUP BUTTON */}
      <button
        type="button"
        onClick={handleBackupSelected}
        disabled={loading || activeKeys.length === 0}
        style={{
          width: '100%', padding: 11, borderRadius: 10, border: '1px solid #2e44d2',
          background: activeKeys.length > 0 ? '#eef2ff' : '#f8fafc',
          color: activeKeys.length > 0 ? '#2e44d2' : '#94a3b8',
          fontWeight: 700, fontSize: 12, cursor: activeKeys.length > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
        }}
      >
        <Download size={14} /> Download Backup JSON ({activeKeys.length} Selected)
      </button>

      {/* CONFIRMATION & RESET */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='Type "RESET" to confirm'
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
        />
        <button
          type="button"
          onClick={handleSelectiveReset}
          disabled={loading || activeKeys.length === 0 || confirmText.trim().toUpperCase() !== 'RESET'}
          style={{
            padding: '10px 14px', borderRadius: 8, border: 'none', fontWeight: 800, fontSize: 12,
            cursor: activeKeys.length > 0 && confirmText.trim().toUpperCase() === 'RESET' ? 'pointer' : 'not-allowed',
            background: activeKeys.length > 0 && confirmText.trim().toUpperCase() === 'RESET' ? '#dc2626' : '#cbd5e1',
            color: '#fff', display: 'flex', alignItems: 'center', gap: 5
          }}
        >
          <RotateCcw size={14} /> {loading ? 'Resetting...' : 'Reset'}
        </button>
      </div>
    </div>
  );
}