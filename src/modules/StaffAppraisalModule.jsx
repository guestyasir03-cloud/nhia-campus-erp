import React, { useState, useEffect } from 'react';
import { Award, PlusCircle, ClipboardList, ChevronLeft, Save, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CRITERIA = [
  { key: 'punctuality', label: 'Punctuality & Attendance (10)' },
  { key: 'teaching', label: 'Teaching Quality & Prep (10)' },
  { key: 'engagement', label: 'Student Engagement (10)' },
  { key: 'documentation', label: 'ERP & Documentation (10)' },
  { key: 'teamwork', label: 'Teamwork & Discipline (10)' }
];

export default function StaffAppraisalModule({ onBack, user }) {
  const isAuthority = ['admin', 'coordinator', 'appraisal_authority'].includes(user?.role);
  const [view, setView] = useState(isAuthority ? 'menu' : 'list'); // menu | evaluate | list
  const [staffList, setStaffList] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Evaluation Form State
  const [form, setForm] = useState({
    staff_name: '',
    period: 'Term 1 (2026-27)',
    punctuality: 8,
    teaching: 8,
    engagement: 8,
    documentation: 8,
    teamwork: 8,
    remarks: ''
  });

  useEffect(() => {
    loadStaff();
    loadAppraisals();
  }, []);

  async function loadStaff() {
    const { data } = await supabase.from('staff').select('name');
    if (data && data.length > 0) {
      setStaffList(data.map(d => d.full_name).filter(Boolean));
    }
  }

  async function loadAppraisals() {
    setLoading(true);
    let query = supabase.from('staff_appraisals').select('*').order('created_at', { ascending: false });
    if (!isAuthority && user?.name) {
      query = query.eq('staff_name', user.name);
    }
    const { data } = await query;
    setRecords(data || []);
    setLoading(false);
  }

  const totalScore =
    Number(form.punctuality) +
    Number(form.teaching) +
    Number(form.engagement) +
    Number(form.documentation) +
    Number(form.teamwork);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.staff_name.trim()) return alert('സ്റ്റാഫിന്റെ പേര് നൽകുക!');
    setLoading(true); setMsg('');

    const { error } = await supabase.from('staff_appraisals').insert({
      staff_name: form.staff_name.trim(),
      period: form.period.trim(),
      punctuality: Number(form.punctuality),
      teaching: Number(form.teaching),
      engagement: Number(form.engagement),
      documentation: Number(form.documentation),
      teamwork: Number(form.teamwork),
      total_score: totalScore,
      remarks: form.remarks.trim(),
      evaluated_by: user?.name || 'Admin'
    });

    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg(`✅ ${form.staff_name}-ന്റെ അപ്രൈസൽ (${totalScore}/50) സേവ് ചെയ്തു!`);
      setForm(prev => ({ ...prev, staff_name: '', remarks: '' }));
      loadAppraisals();
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('ഈ അപ്രൈസൽ റിപ്പോർട്ട് ഡിലീറ്റ് ചെയ്യണോ?')) return;
    await supabase.from('staff_appraisals').delete().eq('id', id);
    loadAppraisals();
  }

  function getGrade(score) {
    if (score >= 45) return { label: 'A+ (Outstanding)', color: '#16a34a' };
    if (score >= 38) return { label: 'A (Very Good)', color: '#2563eb' };
    if (score >= 30) return { label: 'B (Good)', color: '#d97706' };
    return { label: 'C (Needs Improvement)', color: '#dc2626' };
  }

  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  if (view === 'menu') {
    return (
      <div>
        <Header title="Staff Appraisal" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'evaluate', label: 'New Staff Evaluation', icon: PlusCircle },
            { id: 'list', label: 'Appraisal Reports & History', icon: ClipboardList }
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setMsg(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center' }}>
                  <Icon size={18} />
                </div>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={view === 'evaluate' ? 'New Evaluation' : isAuthority ? 'Appraisal Reports' : 'My Appraisals'}
        backAction={() => isAuthority ? setView('menu') : onBack()}
      />

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. EVALUATE STAFF */}
      {view === 'evaluate' && isAuthority && (
        <form onSubmit={handleSave} style={{ background: '#fff', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Staff Name</label>
            <input
              required
              list="staff-options"
              value={form.staff_name}
              onChange={e => setForm({ ...form, staff_name: e.target.value })}
              placeholder="സ്റ്റാഫിന്റെ പേര് തിരഞ്ഞെടുക്കുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യുക"
              style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4 }}
            />
            <datalist id="staff-options">
              {staffList.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Period / Term</label>
            <input
              required
              value={form.period}
              onChange={e => setForm({ ...form, period: e.target.value })}
              style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4 }}
            />
          </div>

          {CRITERIA.map(c => (
            <div key={c.key} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                <span>{c.label}</span>
                <span style={{ color: '#2e44d2' }}>{form[c.key]} / 10</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={form[c.key]}
                onChange={e => setForm({ ...form, [c.key]: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#2e44d2' }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef2ff', padding: '12px 14px', borderRadius: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total Score</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: '#2e44d2' }}>{totalScore} / 50</span>
          </div>

          <textarea
            rows={3}
            value={form.remarks}
            onChange={e => setForm({ ...form, remarks: e.target.value })}
            placeholder="Remarks / Suggestions (Optional)..."
            style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }}
          />

          <button type="submit" disabled={loading} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Save size={16} /> {loading ? 'Saving...' : 'Submit Appraisal'}
          </button>
        </form>
      )}

      {/* 2. APPRAISAL REPORTS LIST */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? <p style={{ textAlign: 'center', color: '#64748b' }}>ലോഡ് ചെയ്യുന്നു...</p> : records.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              അപ്രൈസൽ റിപ്പോർട്ടുകളൊന്നും ഇതുവരെ ഇല്ല.
            </div>
          ) : records.map(r => {
            const grade = getGrade(r.total_score);
            return (
              <div key={r.id} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.staff_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{r.period} • By {r.evaluated_by}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#2e44d2' }}>{r.total_score}/50</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: grade.color }}>{grade.label}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: '#475569', marginBottom: r.remarks ? 8 : 0 }}>
                  <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 6 }}>Punct: {r.punctuality}</span>
                  <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 6 }}>Teach: {r.teaching}</span>
                  <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 6 }}>Eng: {r.engagement}</span>
                  <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 6 }}>Docs: {r.documentation}</span>
                  <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: 6 }}>Team: {r.teamwork}</span>
                </div>
                {r.remarks && <div style={{ fontSize: 12, color: '#334155', background: '#f8fafc', padding: 8, borderRadius: 8, marginTop: 6 }}>"{r.remarks}"</div>}
                {isAuthority && (
                  <div style={{ textAlign: 'right', marginTop: 8 }}>
                    <button onClick={() => handleDelete(r.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}