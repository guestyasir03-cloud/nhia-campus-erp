import React, { useState, useEffect } from 'react';
import { Star, PlusCircle, ListChecks, Trophy, ChevronLeft, Trash2, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ActivityModule({ onBack, user }) {
  const [view, setView] = useState(user?.role === 'student' ? 'student_view' : 'menu');
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Entry State
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [reasonId, setReasonId] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [points, setPoints] = useState('');
  const [pointType, setPointType] = useState('positive'); // positive | negative

  // Manage Reasons State
  const [newReasonTitle, setNewReasonTitle] = useState('');
  const [newReasonPts, setNewReasonPts] = useState('');

  // Ranking & Student View State
  const [ranking, setRanking] = useState(null);
  const [studentLogs, setStudentLogs] = useState(null);

  useEffect(() => {
    loadClasses();
    loadReasons();
    if (user?.role === 'student' && user.id) {
      loadStudentPoints(user.id);
    }
  }, []);

  async function loadClasses() {
    const { data } = await supabase.from('students').select('class_name');
    if (data) setClasses([...new Set(data.map(d => d.class_name).filter(Boolean))].sort());
  }

  async function loadReasons() {
    const { data } = await supabase.from('activity_reasons').select('*').order('title');
    setReasons(data || []);
  }

  async function loadStudentsForClass(cls) {
    setSelectedClass(cls);
    setSelectedStudents([]);
    if (!cls) { setStudents([]); return; }
    const { data } = await supabase.from('students').select('adm_no, name').eq('class_name', cls).order('name');
    setStudents(data || []);
  }

  // സ്റ്റുഡന്റിന് സ്വന്തം പോയിന്റുകൾ കാണാൻ
  async function loadStudentPoints(admNo) {
    setLoading(true);
    const { data } = await supabase
      .from('activity_points')
      .select('*')
      .eq('adm_no', admNo)
      .order('created_at', { ascending: false });
    const list = data || [];
    const total = list.reduce((sum, item) => sum + (Number(item.points) || 0), 0);
    setStudentLogs({ list, total });
    setLoading(false);
  }

  function handleReasonSelect(id) {
    setReasonId(id);
    const found = reasons.find(r => String(r.id) === String(id));
    if (found) {
      setCustomReason(found.title);
      setPoints(Math.abs(found.default_points));
      setPointType(found.default_points >= 0 ? 'positive' : 'negative');
    }
  }

  function toggleStudent(admNo) {
    setSelectedStudents(prev =>
      prev.includes(admNo) ? prev.filter(id => id !== admNo) : [...prev, admNo]
    );
  }

  function toggleAllStudents() {
    if (selectedStudents.length === students.length) setSelectedStudents([]);
    else setSelectedStudents(students.map(s => s.adm_no));
  }

  // 1. പോയിന്റ് സേവ് ചെയ്യാൻ (Single / Bulk)
  async function savePoints(e) {
    e.preventDefault();
    if (selectedStudents.length === 0) return alert('കുറഞ്ഞത് ഒരു കുട്ടിയെയെങ്കിലും തിരഞ്ഞെടുക്കുക!');
    if (!customReason.trim() || !points) return alert('കാരണവും പോയിന്റും നൽകുക!');

    setLoading(true); setMsg('');
    const finalPts = pointType === 'positive' ? Math.abs(Number(points)) : -Math.abs(Number(points));
    const rows = selectedStudents.map(admNo => ({
      adm_no: admNo,
      class_name: selectedClass,
      reason: customReason.trim(),
      points: finalPts,
      awarded_by: user?.name || 'Admin',
      academic_year: '2026-27'
    }));

    const { error } = await supabase.from('activity_points').insert(rows);
    setLoading(false);
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setMsg(`✅ ${rows.length} കുട്ടികൾക്ക് ${finalPts > 0 ? '+' : ''}${finalPts} പോയിന്റ് നൽകി!`);
      setSelectedStudents([]);
    }
  }

  // 2. പുതിയ Reason ചേർക്കാൻ
  async function addReason(e) {
    e.preventDefault();
    if (!newReasonTitle.trim() || !newReasonPts) return;
    const { error } = await supabase.from('activity_reasons').insert({
      title: newReasonTitle.trim(),
      default_points: Number(newReasonPts)
    });
    if (error) setMsg('❌ Error: ' + error.message);
    else {
      setNewReasonTitle(''); setNewReasonPts('');
      loadReasons();
    }
  }

  async function deleteReason(id) {
    await supabase.from('activity_reasons').delete().eq('id', id);
    loadReasons();
  }

  // 3. ക്ലാസ്സ് റാങ്കിംഗ് & ഡിസിപ്ലിൻ റിപ്പോർട്ട്
  async function generateRanking() {
    if (!selectedClass) return alert('ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക!');
    setLoading(true);
    const [{ data: stData }, { data: ptData }] = await Promise.all([
      supabase.from('students').select('adm_no, name').eq('class_name', selectedClass).order('name'),
      supabase.from('activity_points').select('*').eq('class_name', selectedClass)
    ]);

    const rows = (stData || []).map(s => {
      const mine = (ptData || []).filter(p => p.adm_no === s.adm_no);
      const pos = mine.filter(p => p.points > 0).reduce((a, b) => a + b.points, 0);
      const neg = mine.filter(p => p.points < 0).reduce((a, b) => a + b.points, 0);
      return { adm_no: s.adm_no, name: s.name, pos, neg, net: pos + neg };
    }).sort((a, b) => b.net - a.net);

    setRanking({ className: selectedClass, rows });
    setLoading(false);
  }

  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  if (view === 'student_view') {
    return (
      <div>
        <Header title="My Activity Points" backAction={onBack} />
        {loading || !studentLogs ? <p style={{ textAlign: 'center', color: '#64748b' }}>ലോഡ് ചെയ്യുന്നു...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#2e44d2', color: '#fff', padding: 18, borderRadius: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Net Activity Score</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{studentLogs.total > 0 ? `+${studentLogs.total}` : studentLogs.total}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
              {studentLogs.list.length === 0 ? <p style={{ fontSize: 13, color: '#94a3b8' }}>പോയിന്റുകളൊന്നും ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല.</p> : studentLogs.list.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.reason}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>By {item.awarded_by}</div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: item.points >= 0 ? '#16a34a' : '#dc2626' }}>
                    {item.points > 0 ? `+${item.points}` : item.points}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'menu') {
    return (
      <div>
        <Header title="Activity Points" backAction={onBack} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'entry', label: 'Single / Bulk point entry', icon: PlusCircle },
            { id: 'ranking', label: 'Class ranking & Discipline report', icon: Trophy },
            { id: 'reasons', label: 'Reasons and categories', icon: ListChecks }
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
        title={view === 'entry' ? 'Point Entry' : view === 'ranking' ? 'Class Ranking' : 'Manage Reasons'}
        backAction={() => setView('menu')}
      />
      {msg && <div style={{ background: '#eff6ff', color: '#1e40af', padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{msg}</div>}

      {/* 1. SINGLE / BULK ENTRY */}
      {view === 'entry' && (
        <form onSubmit={savePoints} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={selectedClass} onChange={e => loadStudentsForClass(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
              <option value="">-- ക്ലാസ്സ് തിരഞ്ഞെടുക്കുക --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {reasons.length > 0 && (
              <select value={reasonId} onChange={e => handleReasonSelect(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                <option value="">-- Preset Reason (Optional) --</option>
                {reasons.map(r => (
                  <option key={r.id} value={r.id}>{r.title} ({r.default_points > 0 ? '+' : ''}{r.default_points})</option>
                ))}
              </select>
            )}

            <input
              required
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="കാരണം (ഉദാ: Quiz Winner, Late Coming)"
              style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <select value={pointType} onChange={e => setPointType(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', fontWeight: 700, color: pointType === 'positive' ? '#16a34a' : '#dc2626' }}>
                <option value="positive">+ Positive (Reward)</option>
                <option value="negative">- Negative (Penalty)</option>
              </select>
              <input
                required
                type="number"
                value={points}
                onChange={e => setPoints(e.target.value)}
                placeholder="Points"
                style={{ width: 90, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', textAlign: 'center' }}
              />
            </div>
          </div>

          {students.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Select Students ({selectedStudents.length}/{students.length})</span>
                <button type="button" onClick={toggleAllStudents} style={{ background: '#eff6ff', color: '#2e44d2', border: 'none', padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {selectedStudents.length === students.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {students.map(s => {
                  const checked = selectedStudents.includes(s.adm_no);
                  return (
                    <div
                      key={s.adm_no}
                      onClick={() => toggleStudent(s.adm_no)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: checked ? '#eff6ff' : '#f8fafc', border: checked ? '1px solid #bfdbfe' : '1px solid transparent' }}
                    >
                      {checked ? <CheckSquare size={18} color="#2e44d2" /> : <Square size={18} color="#94a3b8" />}
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>{s.adm_no}</span>
                    </div>
                  );
                })}
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 12, padding: 13, borderRadius: 12, border: 'none', background: pointType === 'positive' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {loading ? 'Saving...' : `Submit Points (${selectedStudents.length} Students)`}
              </button>
            </div>
          )}
        </form>
      )}

      {/* 2. CLASS RANKING */}
      {view === 'ranking' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
              <option value="">-- ക്ലാസ്സ് --</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={generateRanking} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              View
            </button>
          </div>
          {ranking && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'center' }}>
                <thead style={{ background: '#1e293b', color: '#fff' }}>
                  <tr>
                    <th style={{ padding: 8 }}>#</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Name</th>
                    <th style={{ padding: 8 }}>+ve</th>
                    <th style={{ padding: 8 }}>-ve</th>
                    <th style={{ padding: 8 }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.rows.map((r, i) => (
                    <tr key={r.adm_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 8, fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: 8, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: 8, color: '#16a34a' }}>+{r.pos}</td>
                      <td style={{ padding: 8, color: '#dc2626' }}>{r.neg}</td>
                      <td style={{ padding: 8, fontWeight: 800, color: r.net >= 0 ? '#2e44d2' : '#dc2626' }}>{r.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. MANAGE REASONS */}
      {view === 'reasons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <form onSubmit={addReason} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
            <input required placeholder="Reason title" value={newReasonTitle} onChange={e => setNewReasonTitle(e.target.value)} style={{ flex: 2, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <input required type="number" placeholder="Pts (e.g. 5 or -5)" value={newReasonPts} onChange={e => setNewReasonPts(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <button type="submit" style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reasons.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '12px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: r.default_points >= 0 ? '#16a34a' : '#dc2626' }}>
                    ({r.default_points > 0 ? '+' : ''}{r.default_points})
                  </span>
                </div>
                <button onClick={() => deleteReason(r.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: 7, borderRadius: 8, cursor: 'pointer' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}