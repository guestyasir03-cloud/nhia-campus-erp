import React, { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ClassSummaryBoard() {
  const [classCounts, setClassCounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.from('students').select('class_name').then(({ data, error }) => {
      if (error || !data || !active) return;
      const map = {};
      for (const row of data) {
        const cls = (row.class_name || 'Other').trim();
        map[cls] = (map[cls] || 0) + 1;
      }
      setClassCounts(Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' })));
      setTotal(data.length);
    });
    return () => { active = false; };
  }, []);

  if (classCounts.length === 0) return null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '10px 12px', marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          <Users size={15} color="#2e44d2" />
          <span>Class-wise Strength</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>({classCounts.length} Classes • {total})</span>
        </div>
        {open ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {classCounts.map(([cls, count]) => (
            <div key={cls} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 9px', fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#475569' }}>{cls}</span>
              <span style={{ fontWeight: 800, color: '#2e44d2' }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
