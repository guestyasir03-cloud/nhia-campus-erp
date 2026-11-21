import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { KeyRound, Search, Eye, EyeOff, Check, X, Edit2 } from 'lucide-react';

export default function UserPasswordsPanel() {
  const [tab, setTab] = useState('staff');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadUsers(tab);
  }, [tab]);

  async function loadUsers(activeTab) {
    setLoading(true);
    setMsg('');
    setEditingId(null);

    const table = activeTab === 'staff' ? 'staff' : 'students';
    const { data, error } = await supabase.from(table).select('*').order('name');
    if (error) {
      setMsg('❌ Error loading users: ' + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      String(r.adm_no || r.staff_id || r.email || '').toLowerCase().includes(q) ||
      (r.class_name || r.role || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  function getRowKey(r) {
    return r.id ?? r.adm_no ?? r.email;
  }

  function getPassColumn(r) {
    if ('password' in r) return 'password';
    if ('pin' in r) return 'pin';
    return 'password';
  }

  async function handleSavePassword(row) {
    const trimmed = newPass.trim();
    if (!trimmed) return alert('Puthiya password nalkuka!');

    setSaving(true);
    setMsg('');

    const table = tab === 'staff' ? 'staff' : 'students';
    const passCol = getPassColumn(row);
    const idCol = 'id' in row ? 'id' : (tab === 'students' ? 'adm_no' : 'email');
    const idVal = row[idCol];

    const { error } = await supabase
      .from(table)
      .update({ [passCol]: trimmed })
      .eq(idCol, idVal);

    setSaving(false);

    if (error) {
      setMsg('❌ Update failed: ' + error.message);
    } else {
      setRows(prev =>
        prev.map(r => (getRowKey(r) === getRowKey(row) ? { ...r, [passCol]: trimmed } : r))
      );
      setEditingId(null);
      setNewPass('');
      setMsg(`✅ ${row.name}-inte password maatti!`);
    }
  }

  return (
    <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
          <KeyRound size={17} color="#2e44d2" /> User Passwords & Reset
        </div>
        <button
          type="button"
          onClick={() => setShowPass(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPass ? 'Hide' : 'Show'}
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => { setTab('staff'); setSearch(''); }}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            background: tab === 'staff' ? '#2e44d2' : 'transparent',
            color: tab === 'staff' ? '#fff' : '#475569'
          }}
        >
          Staff
        </button>
        <button
          type="button"
          onClick={() => { setTab('students'); setSearch(''); }}
          style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            background: tab === 'students' ? '#2e44d2' : 'transparent',
            color: tab === 'students' ? '#fff' : '#475569'
          }}
        >
          Students
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: 11 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'staff' ? 'Search staff name or ID...' : 'Search student name, Adm No, or class...'}
          style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      {msg && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
          {msg}
        </div>
      )}

      {/* LIST */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#94a3b8', fontSize: 13 }}>No users found.</div>
          ) : (
            filtered.map(r => {
              const key = getRowKey(r);
              const passCol = getPassColumn(r);
              const currentPass = r[passCol] || '—';
              const isEditing = editingId === key;

              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {tab === 'staff' ? `${r.role || 'Staff'} • ${r.email || r.staff_id || ''}` : `Adm: ${r.adm_no} • ${r.class_name || ''}`}
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input
                        type="text"
                        value={newPass}
                        onChange={e => setNewPass(e.target.value)}
                        placeholder="New password"
                        style={{ width: 110, padding: '6px 8px', borderRadius: 7, border: '1px solid #2e44d2', fontSize: 12 }}
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSavePassword(r)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setNewPass(''); }}
                        style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: '#e2e8f0', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, background: '#f8fafc', padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', color: '#1e293b' }}>
                        {showPass ? currentPass : '••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(key); setNewPass(r[passCol] || ''); setMsg(''); }}
                        style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#2e44d2', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      >
                        <Edit2 size={12} /> Change
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}