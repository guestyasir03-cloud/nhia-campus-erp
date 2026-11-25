import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, BookOpen, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

function sameSubject(a, b) {
  const x = String(a || "").toLowerCase().trim();
  const y = String(b || "").toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const toks = s => s.split(/[\s\-\u2013\u2014_/(),.:;]+/).filter(Boolean);
  const tx = toks(x);
  const ty = toks(y);
  if (!tx.length || !ty.length) return false;
  return tx.every(w => ty.includes(w)) || ty.every(w => tx.includes(w));
}

export default function TeacherCurrentWeekCard({ user, onOpenSyllabus }) {
  const [weekNo, setWeekNo] = useState(1);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (user?.role !== 'teacher') return;
    let active = true;

    async function loadMyWeek() {
      const { data: setRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'current_syllabus_week')
        .maybeSingle();

      if (!active) return;

      const curWk = Math.max(1, parseInt(setRow?.value || '1', 10) || 1);

      const [
        { data: subAsg },
        { data: tchAsg },
        { data: sylRows }
      ] = await Promise.all([
        supabase.from('subject_assignments').select('class_name, subject_name, staff_id, staff_name').limit(2000),
        supabase.from('teacher_assignments').select('class_name, subject_name, staff_name').limit(2000),
        supabase
          .from('syllabus_weeks')
          .select('*')
          .lte('week_no', curWk)
          .or(`week_end.gte.${curWk},week_end.is.null`)
          .order('class_name')
          .order('subject')
          .limit(2000)
      ]);

      if (!active) return;
      setWeekNo(curWk);

      const normName = (str) => String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/dh/g, 'd')
        .replace(/th/g, 't')
        .replace(/ee/g, 'i')
        .replace(/oo/g, 'u');

      const meRaw = (user?.name || '').toLowerCase().trim();
      const meNorm = normName(meRaw);
      const isSameTeacher = (t) => {
        if (!t || !meNorm) return false;
        const tRaw = String(t).toLowerCase().trim();
        const tNorm = normName(tRaw);
        return tRaw.includes(meRaw) || tNorm.includes(meNorm) || meNorm.includes(tNorm);
      };

      const myPairs = [];
      const myStaffId = String(user?.staff_id || '').trim().toLowerCase();
      const addPair = (c, s, t, sid) => {
        if (!c || !s) return;
        const idMatch = myStaffId && sid && String(sid).trim().toLowerCase() === myStaffId;
        if (idMatch || isSameTeacher(t)) {
          myPairs.push({ cls: String(c).trim().toLowerCase(), sub: String(s).trim().toLowerCase() });
        }
      };
      (subAsg || []).forEach(r => addPair(r.class_name, r.subject_name, r.staff_name, r.staff_id));
      (tchAsg || []).forEach(r => addPair(r.class_name, r.subject_name, r.staff_name));

      const matched = (sylRows || []).filter(it => {
        const start = Number(it.week_no) || 0;
        const end = Number(it.week_end) || start;
        if (!(start > 0 && curWk >= start && curWk <= end)) return false;

        if (isSameTeacher(it.teacher_name)) return true;
        if (myPairs.length === 0) return false;
        const cL = (it.class_name || '').toLowerCase().trim();
        const sL = (it.subject || '').toLowerCase().trim();
        return myPairs.some(p => p.cls === cL && sameSubject(sL, p.sub));
      });

      setTopics(matched);
      setLoading(false);
    }

    loadMyWeek();
    return () => { active = false; };
  }, [user]);

  if (user?.role !== 'teacher') return null;

  async function toggleDone(item) {
    const nextVal = !item.is_completed;
    setTopics(prev => prev.map(t => t.id === item.id ? { ...t, is_completed: nextVal } : t));
    await supabase
      .from('syllabus_weeks')
      .update({ is_completed: nextVal, completed_at: nextVal ? new Date().toISOString() : null })
      .eq('id', item.id);
  }

  const weekLabel = topics[0]?.week_label || `WEEK ${weekNo}`;

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 14, marginBottom: 14, boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: expanded ? 10 : 0, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#38a116', color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 99, letterSpacing: 0.3, cursor: 'pointer' }}
        >
          📍 CURRENT {weekLabel.toUpperCase()} {expanded ? '▴' : '▾'}
        </button>
        <button
          type="button"
          onClick={onOpenSyllabus}
          style={{ background: '#eef2ff', color: '#2e44d2', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
        >
          Full Syllabus <ChevronRight size={13} />
        </button>
      </div>

      {expanded && (loading ? (
        <div style={{ fontSize: 12, color: '#64748b', padding: '6px 2px' }}>Loading your syllabus...</div>
      ) : topics.length === 0 ? (
        <div style={{ fontSize: 12, color: '#64748b', padding: '6px 2px' }}>
          No syllabus topics scheduled for your subjects in <b>Week {weekNo}</b>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topics.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 10px',
                borderRadius: 11, background: item.is_completed ? '#f0fdf4' : '#f8fafc',
                border: item.is_completed ? '1px solid #bbf7d0' : '1px solid #e2e8f0'
              }}
            >
              <button
                type="button"
                onClick={() => toggleDone(item)}
                style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer', marginTop: 1 }}
              >
                {item.is_completed
                  ? <CheckCircle2 size={18} color="#16a34a" />
                  : <Circle size={18} color="#94a3b8" />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, background: '#eef2ff', color: '#2e44d2', padding: '1px 6px', borderRadius: 5 }}>
                    {item.class_name}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{item.subject}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: item.is_completed ? '#166534' : '#334155', marginTop: 3, textDecoration: item.is_completed ? 'line-through' : 'none', lineHeight: 1.45 }}>
                  {item.topic}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
