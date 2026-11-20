import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Upload, Search, Trash2, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function StudentsModule({ onBack }) {
  const [view, setView] = useState('menu'); // menu | directory | add | bulk
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Add Student Form
  const [form, setForm] = useState({ adm_no: '', name: '', class_name: '', monthly_pledge: 0, prev_arrears: 0, pin: '1234' });

  // Bulk CSV Text
  const [csvText, setCsvText] = useState('');

  // ക്ലാസ്സുകളുടെ ലിസ്റ്റ് മാത്രം ആദ്യം എടുക്കുന്നു (Zero Lag)
  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) {
      const unique = [...new Set(data.map(d => d.class_name).filter(Boolean))].sort();
      setClasses(unique);
    }
  }

  // തിരഞ്ഞെടുത്ത ക്ലാസ്സിലെ കുട്ടികളെ മാത്രം ലോഡ് ചെയ്യുന്നു
  async function loadStudentsByClass(cls) {
    setSelectedClass(cls);
    if (!cls) { setStudents([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_name', cls)
      .order('name');
    setStudents(data || []);
    setLoading(false);
  }

  // പുതിയ കുട്ടിയെ ചേർക്കാൻ
  async function handleAddStudent(e) {
    e.preventDefault();
    setLoading(true); setMsg('');
    const { error } = await supabase.from('students').upsert({
      adm_no: form.adm_no.trim(),
      name: form.name.trim(),
      class_name: form.class_name.trim(),
      monthly_pledge: Number(form.monthly_pledge) || 0,
      prev_arrears: Number(form.prev_arrears) || 0,
      pin: form.pin.trim() || '1234'
    });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg('✅ വിദ്യാർത്ഥിയെ വിജയകരമായി ചേർത്തു!');
      setForm({ adm_no: '', name: '', class_name: '', monthly_pledge: 0, prev_arrears: 0, pin: '1234' });
      loadClasses();
    }
  }

  // 300 കുട്ടികളെ ഒറ്റ ക്ലിക്കിൽ CSV വഴി അപ്‌ലോഡ് ചെയ്യാൻ
  async function handleBulkImport(e) {
    e.preventDefault();
    if (!csvText.trim()) return;
    setLoading(true); setMsg('');

    const lines = csvText.trim().split('\n');
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length >= 3 && cols[0].toLowerCase() !== 'adm_no') {
        rows.push({
          adm_no: cols[0],
          name: cols[1],
          class_name: cols[2],
          monthly_pledge: Number(cols[3]) || 0,
          prev_arrears: Number(cols[4]) || 0,
          pin: cols[5] || '1234'
        });
      }
    }

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('⚠️ ശരിയായ ഡാറ്റ കണ്ടെത്തിയില്ല.');
    }

    const { error } = await supabase.from('students').upsert(rows, { onConflict: 'adm_no' });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg(`✅ ${rows.length} കുട്ടികളുടെ വിവരങ്ങൾ ഒറ്റയടിക്ക് സേവ് ചെയ്തു!`);
      setCsvText('');
      loadClasses();
    }
  }

  async function deleteStudent(adm_no) {
    if (!window.confirm(`${adm_no} ഡിലീറ്റ് ചെയ്യണോ?`)) return;
    await supabase.from('students').delete().eq('adm_no', adm_no);
    loadStudentsByClass(selectedClass);
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.adm_no.toLowerCase().includes(search.toLowerCase())
  );

  // ഹെഡർ ബാർ
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
        <Header title="Students" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'directory', label: 'Student directory', icon: Users },
            { id: 'add', label: 'Add student', icon: UserPlus },
            { id: 'bulk', label: 'Bulk import (CSV)', icon: Upload }
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
        title={view === 'directory' ? 'Student Directory' : view === 'add' ? 'Add Student' : 'Bulk Import (CSV)'}
        backAction={() => setView('menu')}
      />

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. STUDENT DIRECTORY */}
      {view === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select
            value={selectedClass}
            onChange={e => loadStudentsByClass(e.target.value)}
            style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, fontWeight: 600 }}
          >
            <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {selectedClass && (
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: '#94a3b8' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="പേരോ അഡ്മിഷൻ നമ്പറോ തിരയുക..."
                style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14 }}
              />
            </div>
          )}

          {loading ? <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>ലോഡ് ചെയ്യുന്നു...</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(s => (
                <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Adm: <b>{s.adm_no}</b> • Pledge: ₹{s.monthly_pledge} • Arr: ₹{s.prev_arrears}</div>
                  </div>
                  <button onClick={() => deleteStudent(s.adm_no)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {selectedClass && filtered.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>കുട്ടികളെ കണ്ടെത്തിയില്ല.</p>}
            </div>
          )}
        </div>
      )}

      {/* 2. ADD STUDENT */}
      {view === 'add' && (
        <form onSubmit={handleAddStudent} style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input required placeholder="Admission No (ഉദാ: 1001)" value={form.adm_no} onChange={e => setForm({ ...form, adm_no: e.target.value })} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required placeholder="Student Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required placeholder="Class (ഉദാ: S 1)" value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="number" placeholder="Monthly Pledge (₹)" value={form.monthly_pledge} onChange={e => setForm({ ...form, monthly_pledge: e.target.value })} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input type="number" placeholder="Prev. Arrears (₹)" value={form.prev_arrears} onChange={e => setForm({ ...form, prev_arrears: e.target.value })} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          </div>
          <input placeholder="Login PIN (Default: 1234)" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} style={{ padding: 12, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <button type="submit" disabled={loading} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Saving...' : 'Save Student'}
          </button>
        </form>
      )}

      {/* 3. BULK IMPORT (CSV) */}
      {view === 'bulk' && (
        <form onSubmit={handleBulkImport} style={{ background: '#fff', padding: 18, borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', padding: 10, borderRadius: 8 }}>
            <b>ഫോർമാറ്റ് (ഓരോ വരിയിലും ഓരോ കുട്ടി):</b><br />
            <code>AdmNo, Name, Class, Pledge, Arrears</code><br />
            ഉദാഹരണം:<br />
            <code>1001, Muhammed Ali, S 1, 500, 0</code><br />
            <code>1002, Ahmed Shamil, S 1, 500, 1000</code>
          </div>
          <textarea
            required
            rows={8}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder="Excel-ൽ നിന്നോ Google Sheets-ൽ നിന്നോ കോപ്പി ചെയ്ത് ഇവിടെ പേസ്റ്റ് ചെയ്യുക..."
            style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'monospace' }}
          />
          <button type="submit" disabled={loading} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Importing...' : '📥 Import All Students'}
          </button>
        </form>
      )}
    </div>
  );
}