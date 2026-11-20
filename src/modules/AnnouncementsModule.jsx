import React, { useState, useEffect } from 'react';
import { Bell, PlusCircle, Trash2, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AnnouncementsModule({ onBack, user }) {
  const isStaff = user?.role !== 'student';
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', audience: 'All' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadNotices();
  }, []);

  async function loadNotices() {
    setLoading(true);
    let query = supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(30);
    if (!isStaff) {
      query = query.in('audience', ['All', 'Students']);
    }
    const { data } = await query;
    setNotices(data || []);
    setLoading(false);
  }

  async function handlePost(e) {
    e.preventDefault();
    setLoading(true); setMsg('');
    const { error } = await supabase.from('announcements').insert({
      title: form.title.trim(),
      message: form.message.trim(),
      audience: form.audience,
      posted_by: user?.name || 'Admin'
    });
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg('✅ അറിയിപ്പ് പബ്ലിഷ് ചെയ്തു!');
      setForm({ title: '', message: '', audience: 'All' });
      setShowAdd(false);
      loadNotices();
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('ഈ അറിയിപ്പ് ഡിലീറ്റ് ചെയ്യണോ?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    loadNotices();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Announcements</h2>
        </div>

        {isStaff && (
          <button
            onClick={() => { setShowAdd(!showAdd); setMsg(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <PlusCircle size={16} /> {showAdd ? 'Close' : 'New Notice'}
          </button>
        )}
      </div>

      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {showAdd && isStaff && (
        <form onSubmit={handlePost} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <input required placeholder="Title (ഉദാ: Exam Timetable Published)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <textarea required rows={3} placeholder="വിശദാംശങ്ങൾ ഇവിടെ എഴുതുക..." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13 }} />
          <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
            <option value="All">All (Staff & Students)</option>
            <option value="Students">Students Only</option>
            <option value="Staff">Staff Only</option>
          </select>
          <button type="submit" disabled={loading} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Publishing...' : 'Publish Notice'}
          </button>
        </form>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>ലോഡ് ചെയ്യുന്നു...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notices.length === 0 ? (
            <div style={{ background: '#fff', padding: 24, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              പുതിയ അറിയിപ്പുകളൊന്നുമില്ല.
            </div>
          ) : notices.map(n => (
            <div key={n.id} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bell size={16} color="#2e44d2" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{n.title}</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#eef2ff', color: '#2e44d2', padding: '3px 8px', borderRadius: 6 }}>
                  {n.audience}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{n.message}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                <span>By {n.posted_by} • {new Date(n.created_at).toLocaleDateString()}</span>
                {isStaff && (
                  <button onClick={() => handleDelete(n.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Trash2 size={12} /> Delete
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