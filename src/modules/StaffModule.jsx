import React, { useState, useEffect } from 'react';
import { Briefcase, PlusCircle, Trash2, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function StaffModule({ onBack }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ staff_id: '', name: '', role: 'teacher', pin: '' });

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').order('staff_id');
    setStaff(data || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setLoading(true); setMsg('');
    const staffId = form.staff_id.trim();
    const { error } = await supabase.from('staff').insert({
      staff_id: staffId,
      name: form.name.trim(),
      role: form.role,
      pin: form.pin.trim() || staffId
    });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg('✅ സ്റ്റാഫിനെ വിജയകരമായി ചേർത്തു!');
      setForm({ staff_id: '', name: '', role: 'teacher', pin: '' });
      setShowAdd(false);
      loadStaff();
    }
  }

  async function handleDelete(staff_id) {
    if (!window.confirm('ഈ സ്റ്റാഫിനെ ഡിലീറ്റ് ചെയ്യണോ?')) return;
    await supabase.from('staff').delete().eq('staff_id', staff_id);
    loadStaff();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Staff Directory</h2>
        </div>

        <button
          onClick={() => { setShowAdd(!showAdd); setMsg(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          <PlusCircle size={16} /> {showAdd ? 'Close' : 'Add Staff'}
        </button>
      </div>

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <input required placeholder="Staff ID (ഉദാ: 128)" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required placeholder="Full Name (ഉദാ: Usthad Muhammed)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
            <option value="teacher">Teacher</option>
            <option value="coordinator">Academic Coordinator</option>
            <option value="admin">Principal / Admin</option>
          </select>
          <input placeholder="Login PIN (ഒഴിച്ചിട്ടാൽ Staff ID തന്നെ PIN ആകും)" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <button type="submit" disabled={loading} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Saving...' : 'Save Staff'}
          </button>
        </form>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>ലോഡ് ചെയ്യുന്നു...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {staff.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              സ്റ്റാഫ് വിവരങ്ങളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല.
            </div>
          ) : staff.map(s => (
            <div key={s.staff_id} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Briefcase size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>
                    ID: <b>{s.staff_id}</b> • {s.role}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(s.staff_id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}