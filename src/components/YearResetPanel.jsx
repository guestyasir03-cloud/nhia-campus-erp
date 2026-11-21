import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearClassAccessCache } from '../lib/useClassAccess';

const RESET_OPTIONS = [
  { id: 'attendance', label: 'Attendance Records', desc: 'Clears daily & monthly attendance logs', defaultChecked: true },
  { id: 'marks', label: 'Exam Marks (W1–W4 / Midterm / Hifz)', desc: 'Clears previous year marks table', defaultChecked: true },
  { id: 'activity', label: 'Activity & Conduct Points', desc: 'Clears student merit (+) & demerit (-) logs', defaultChecked: true },
  { id: 'appraisal', label: 'Staff Appraisal Records', desc: 'Clears monitoring, self-forms & scorecards', defaultChecked: false },
  { id: 'assignments', label: 'Class Teachers & Subject Mapping', desc: 'Unassigns teachers for fresh year allocation', defaultChecked: false }
];

export default function YearResetPanel({ user }) {
  const isAdmin = ['admin', 'coordinator'].includes(user?.role);
  const [selected, setSelected] = useState(
    RESET_OPTIONS.reduce((acc, item) => ({ ...acc, [item.id]: item.defaultChecked }), {})
  );
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isAdmin) return null;

  function toggleOption(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSelectiveReset() {
    const activeKeys = Object.keys(selected).filter(k => selected[k]);
    if (activeKeys.length === 0) return alert('Select at least one module to reset.');
    if (confirmText.trim().toUpperCase() !== 'RESET') {
      return alert('Type RESET in the confirmation box to proceed.');
    }

    setLoading(true);
    setMsg('');

    try {
      const ops = [];
      if (selected.attendance) ops.push(supabase.from('attendance').delete().neq('id', 0));
      if (selected.marks) ops.push(supabase.from('marks').delete().neq('id', 0));
      if (selected.activity) ops.push(supabase.from('activity_points').delete().neq('id', 0));
      if (selected.appraisal) {
        ops.push(supabase.from('appraisal_monitoring').delete().neq('id', 0));
        ops.push(supabase.from('appraisal_self_assessments').delete().neq('id', 0));
        ops.push(supabase.from('appraisal_evaluations').delete().neq('id', 0));
      }
      if (selected.assignments) {
        ops.push(supabase.from('class_teachers').delete().neq('id', 0));
        ops.push(supabase.from('subject_assignments').delete().neq('id', 0));
      }

      await Promise.all(ops);
      if (selected.assignments) clearClassAccessCache();

      setConfirmText('');
      setMsg(`Selected modules (${activeKeys.join(', ')}) cleared successfully. Finance & Student records remain untouched.`);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 800, fontSize: 14 }}>
        <AlertTriangle size={18} /> Selective Academic Year Reset
      </div>

      <div style={{ background: '#ecfdf5', border: '1px solid #86efac', padding: 10, borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <ShieldCheck size={18} color="#15803d" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.4 }}>
          <b>Always Protected (Will NOT be deleted):</b> Finance & Monthly Donations (Arrears, Last Paid Month, Receipts), Students Directory, and Staff Directory.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {RESET_OPTIONS.map(opt => (
          <label
            key={opt.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, cursor: 'pointer',
              border: selected[opt.id] ? '1px solid #ef4444' : '1px solid #e2e8f0',
              background: selected[opt.id] ? '#fef2f2' : '#f8fafc'
            }}
          >
            <input type="checkbox" checked={!!selected[opt.id]} onChange={() => toggleOption(opt.id)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='Type "RESET" to confirm'
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
        />
        <button
          onClick={handleSelectiveReset}
          disabled={loading || confirmText.trim().toUpperCase() !== 'RESET'}
          style={{
            padding: '10px 14px', borderRadius: 8, border: 'none', fontWeight: 800, fontSize: 12,
            cursor: confirmText.trim().toUpperCase() === 'RESET' ? 'pointer' : 'not-allowed',
            background: confirmText.trim().toUpperCase() === 'RESET' ? '#dc2626' : '#cbd5e1',
            color: '#fff', display: 'flex', alignItems: 'center', gap: 5
          }}
        >
          <RotateCcw size={14} /> {loading ? 'Resetting...' : 'Reset Selected'}
        </button>
      </div>
    </div>
  );
}