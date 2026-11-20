import React, { useState, useEffect } from 'react';
import { BookOpen, PlusCircle, ExternalLink, Trash2, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function SyllabusModule({ onBack, user }) {
  const isStaff = user?.role !== 'student';
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(user?.role === 'student' ? (user.class_name || '') : '');
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Add Form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ class_name: '', subject: '', title: '', url: '' });

  useEffect(() => {
    loadClasses();
    if (user?.role === 'student' && user.class_name) {
      loadLinks(user.class_name);
    } else {
      loadLinks('');
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].sort());
  }

  async function loadLinks(cls) {
    setSelectedClass(cls);
    setLoading(true);
    let query = supabase.from('syllabus_links').select('*').order('created_at', { ascending: false });
    if (cls) query = query.eq('class_name', cls);
    const { data } = await query;
    setLinks(data || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setLoading(true); setMsg('');
    const { error } = await supabase.from('syllabus_links').insert({
      class_name: form.class_name.trim(),
      subject: form.subject.trim(),
      title: form.title.trim(),
      url: form.url.trim(),
      added_by: user?.name || 'Admin'
    });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg('✅ സിലബസ് ലിങ്ക് വിജയകരമായി ചേർത്തു!');
      setForm({ class_name: '', subject: '', title: '', url: '' });
      setShowAdd(false);
      loadLinks(selectedClass);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('ഈ ലിങ്ക് ഡിലീറ്റ് ചെയ്യണോ?')) return;
    await supabase.from('syllabus_links').delete().eq('id', id);
    loadLinks(selectedClass);
  }

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Syllabus</h2>
        </div>

        {isStaff && (
          <button
            onClick={() => { setShowAdd(!showAdd); setMsg(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <PlusCircle size={16} /> {showAdd ? 'Close' : 'Add Link'}
          </button>
        )}
      </div>

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* ADD FORM (STAFF ONLY) */}
      {showAdd && isStaff && (
        <form onSubmit={handleAdd} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <input required placeholder="Class (ഉദാ: S 1 അല്ലെങ്കിൽ All)" value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required placeholder="Subject (ഉദാ: Fiqh, English)" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required placeholder="Title (ഉദാ: Term 1 Syllabus PDF)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required type="url" placeholder="Link URL (https://...)" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <button type="submit" disabled={loading} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Saving...' : 'Save Syllabus Link'}
          </button>
        </form>
      )}

      {/* CLASS FILTER */}
      {isStaff && (
        <select
          value={selectedClass}
          onChange={e => loadLinks(e.target.value)}
          style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 14 }}
        >
          <option value="">-- എല്ലാ ക്ലാസ്സുകളും (All Classes) --</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      {/* LINKS LIST */}
      {loading ? <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>ലോഡ് ചെയ്യുന്നു...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {links.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              സിലബസ് ലിങ്കുകളൊന്നും ഇതുവരെ ചേർത്തിട്ടില്ല.
            </div>
          ) : links.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', color: '#2e44d2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <BookOpen size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <b>{item.class_name}</b> • {item.subject}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: '#eff6ff', color: '#2e44d2', padding: '8px 10px', borderRadius: 8, display: 'grid', placeItems: 'center', textDecoration: 'none' }}
                >
                  <ExternalLink size={16} />
                </a>
                {isStaff && (
                  <button onClick={() => handleDelete(item.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: 8, borderRadius: 8, cursor: 'pointer' }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}