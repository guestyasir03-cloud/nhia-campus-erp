import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, User, GraduationCap, Phone, Hash, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function StudentQuickLookup() {
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('students')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (active && data) setStudents(data);
      });
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(s =>
        String(s.adm_no || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, students]);

  const handleSelect = (st) => {
    setSelected(st);
    setQuery(`${st.name} (${st.adm_no})`);
    setShowList(false);
  };

  const clearSearch = () => {
    setQuery('');
    setSelected(null);
    setShowList(false);
  };

  const phone = selected?.phone || selected?.mobile || selected?.parent_phone || selected?.contact;
  const father = selected?.father_name || selected?.parent_name || selected?.guardian_name;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '10px 12px', marginBottom: 12, position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={16} color="#64748b" style={{ position: 'absolute', left: 10, pointerEvents: 'none' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setShowList(true);
          }}
          onFocus={() => query && setShowList(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              e.preventDefault();
              handleSelect(matches[0]);
            }
          }}
          placeholder="Quick Find: Type Adm No or Student Name..."
          style={{
            width: '100%', padding: '9px 32px 9px 34px', borderRadius: 10,
            border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#f8fafc'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'grid', placeItems: 'center' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showList && query.trim() && (
        <div style={{
          marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 10,
          background: '#fff', maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 6px 16px rgba(15,23,42,0.08)'
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>No student found</div>
          ) : (
            matches.map(s => (
              <div
                key={s.adm_no}
                onClick={() => handleSelect(s)}
                style={{
                  padding: '9px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Adm No: {s.adm_no}</div>
                </div>
                <span style={{ background: '#eef2ff', color: '#2e44d2', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                  {s.class_name || 'N/A'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <div style={{
          marginTop: 10, background: '#f8fafc', border: '1px solid #cbd5e1',
          borderRadius: 10, padding: 12, fontSize: 13
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={16} color="#2e44d2" />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{selected.name}</span>
            </div>
            <span style={{ background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, padding: '3px 10px', borderRadius: 99 }}>
              {selected.class_name || 'Unassigned'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6, color: '#334155', fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Hash size={13} color="#64748b" /> <b>Adm No:</b> {selected.adm_no}</div>
            {selected.roll_no && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><GraduationCap size={13} color="#64748b" /> <b>Roll No:</b> {selected.roll_no}</div>}
            {father && <div><b>Parent:</b> {father}</div>}
            {phone && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={13} color="#64748b" /> {phone}</div>}
            {selected.address && <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={13} color="#64748b" /> {selected.address}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
