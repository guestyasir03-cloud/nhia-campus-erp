import StudentQuickLookup from '../components/StudentQuickLookup';
import ClassSummaryBoard from '../components/ClassSummaryBoard';
import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Users, UserPlus, Upload, ArrowUpCircle,
  Save, Hash, CheckSquare, Square
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import YearResetPanel from '../components/YearResetPanel';

const NEXT_CLASS_MAP = {
  S1: 'S2',
  S2: 'S3',
  S3: 'S4',
  S4: 'S5',
  S5: 'SS1',
  SS1: 'SS2',
  SS2: 'D1',
  D1: 'D2',
  D2: 'D3',
  D3: 'ALUMNI'
};

export default function StudentsModule({ onBack, user }) {
  const [view, setView] = useState('menu'); // menu | directory | add | import | promotion | rollno
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Add Student State
  const [newAdm, setNewAdm] = useState('');
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newRoll, setNewRoll] = useState('');
  const [newPin, setNewPin] = useState('1234');

  // Bulk Import State
  const [csvText, setCsvText] = useState('');

  // Promotion State
  const [promoSource, setPromoSource] = useState('');
  const [promoTarget, setPromoTarget] = useState('');
  const [promoList, setPromoList] = useState([]);
  const [selectedAdms, setSelectedAdms] = useState(new Set());

  // Roll Number State
  const [rollClass, setRollClass] = useState('');
  const [rollList, setRollList] = useState([]);

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

  // ==========================================
  // 1. STUDENT DIRECTORY
  // ==========================================
  async function loadDirectory(cls) {
    setSelectedClass(cls);
    if (!cls) {
      setStudents([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_name', cls)
      .order('roll_no', { ascending: true, nullsFirst: false })
      .order('name');
    setStudents(data || []);
    setLoading(false);
  }

  // ==========================================
  // 2. ADD SINGLE STUDENT
  // ==========================================
  async function handleAddStudent(e) {
    e.preventDefault();
    if (!newAdm.trim() || !newName.trim() || !newClass.trim()) {
      return alert('Fill Admission No, Name, and Class.');
    }
    setLoading(true);
    setMsg('');
    const { error } = await supabase.from('students').upsert(
      {
        adm_no: newAdm.trim(),
        name: newName.trim(),
        class_name: newClass.trim().toUpperCase(),
        roll_no: newRoll ? Number(newRoll) : null,
        pin: newPin.trim() || '1234',
        status: 'active'
      },
      { onConflict: 'adm_no' }
    );
    setLoading(false);
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
      setMsg(`Student ${newName.trim()} saved.`);
      setNewAdm('');
      setNewName('');
      setNewRoll('');
      loadClasses();
    }
  }

  // ==========================================
  // 3. BULK CSV IMPORT
  // ==========================================
  async function handleBulkImport() {
    if (!csvText.trim()) return alert('Paste CSV data first.');
    setLoading(true);
    setMsg('');
    const lines = csvText.trim().split('\n');
    const rows = [];

    lines.forEach((line, idx) => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (idx === 0 && cols[0].toLowerCase().includes('adm')) return;
      if (cols.length >= 3 && cols[0] && cols[1] && cols[2]) {
        rows.push({
          adm_no: cols[0],
          name: cols[1],
          class_name: cols[2].toUpperCase(),
          roll_no: cols[3] ? Number(cols[3]) : null,
          pin: cols[4] || '1234',
          status: 'active'
        });
      }
    });

    if (rows.length === 0) {
      setLoading(false);
      return setMsg('No valid rows found. Format: adm_no, name, class_name, roll_no(optional)');
    }

    const { error } = await supabase.from('students').upsert(rows, { onConflict: 'adm_no' });
    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else {
      setMsg(`${rows.length} students imported successfully.`);
      setCsvText('');
      loadClasses();
    }
  }

  // ==========================================
  // 4. ANNUAL CLASS PROMOTION & D3 GRADUATION
  // ==========================================
  async function loadForPromotion(cls) {
    setPromoSource(cls);
    setPromoTarget(NEXT_CLASS_MAP[cls] || '');
    setMsg('');
    if (!cls) {
      setPromoList([]);
      setSelectedAdms(new Set());
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('adm_no, name, class_name, roll_no')
      .eq('class_name', cls)
      .order('roll_no', { ascending: true, nullsFirst: false })
      .order('name');
    const list = data || [];
    setPromoList(list);
    setSelectedAdms(new Set(list.map(s => s.adm_no)));
    setLoading(false);
  }

  function togglePromoStudent(admNo) {
    setSelectedAdms(prev => {
      const next = new Set(prev);
      if (next.has(admNo)) next.delete(admNo);
      else next.add(admNo);
      return next;
    });
  }

  async function executePromotion() {
    if (!promoSource || !promoTarget.trim()) {
      return alert('Select source class and enter target class.');
    }
    if (selectedAdms.size === 0) {
      return alert('Select at least one student to promote.');
    }

    const target = promoTarget.trim().toUpperCase();
    const isAlumni = target === 'ALUMNI';
    const detainedCount = promoList.length - selectedAdms.size;

    const ok = window.confirm(
      `Promote ${selectedAdms.size} students from ${promoSource} to ${target}?\n` +
      (detainedCount > 0 ? `(${detainedCount} unchecked students will remain in ${promoSource})` : '')
    );
    if (!ok) return;

    setLoading(true);
    setMsg('');

    const admArray = Array.from(selectedAdms);
    const { error } = await supabase
      .from('students')
      .update({
        class_name: target,
        status: isAlumni ? 'alumni' : 'active',
        roll_no: null
      })
      .in('adm_no', admArray);

    setLoading(false);
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
      setMsg(
        isAlumni
          ? `${admArray.length} students from ${promoSource} graduated to ALUMNI.`
          : `${admArray.length} students promoted from ${promoSource} to ${target}.`
      );
      loadClasses();
      loadForPromotion(promoSource);
    }
  }

  // ==========================================
  // 5. ROLL NUMBER MANAGER (AUTO & MANUAL)
  // ==========================================
  async function loadForRollNo(cls) {
    setRollClass(cls);
    setMsg('');
    if (!cls) {
      setRollList([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('adm_no, name, roll_no')
      .eq('class_name', cls)
      .order('roll_no', { ascending: true, nullsFirst: false })
      .order('name');
    setRollList(data || []);
    setLoading(false);
  }

  function autoAssignRoll(mode) {
    const sorted = [...rollList].sort((a, b) => {
      if (mode === 'adm') return String(a.adm_no).localeCompare(String(b.adm_no), undefined, { numeric: true });
      return a.name.localeCompare(b.name);
    });
    const numbered = sorted.map((s, idx) => ({ ...s, roll_no: idx + 1 }));
    setRollList(numbered);
  }

  async function saveRollNumbers() {
    if (rollList.length === 0) return;
    setLoading(true);
    setMsg('');

    const results = await Promise.all(
      rollList.map(s => {
        const val = s.roll_no === '' || s.roll_no === null || s.roll_no === undefined ? null : Number(s.roll_no);
        return supabase.from('students').update({ roll_no: val }).eq('adm_no', s.adm_no);
      })
    );
    const firstErr = results.find(r => r.error)?.error;
    setLoading(false);
    if (firstErr) setMsg('Error: ' + firstErr.message);
    else setMsg(`Roll numbers updated for ${rollClass}.`);
  }

  const Header = ({ title, backAction }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button onClick={backAction} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
    </div>
  );

  // MAIN MENU
  if (view === 'menu') {
    return (
      <div>
        <Header title="Students" backAction={onBack} />
        <ClassSummaryBoard />
        <StudentQuickLookup />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { id: 'directory', label: 'Student directory', icon: Users },
            { id: 'promotion', label: 'Annual class promotion & Year Reset', icon: ArrowUpCircle },
            { id: 'rollno', label: 'Manage roll numbers', icon: Hash },
            { id: 'add', label: 'Add student', icon: UserPlus },
            { id: 'import', label: 'Bulk import (CSV)', icon: Upload }
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

  const filteredDir = students.filter(
    s => s.name.toLowerCase().includes(search.toLowerCase()) || String(s.adm_no).includes(search)
  );

  return (
    <div>
      <Header
        title={
          view === 'directory' ? 'Student Directory' :
          view === 'promotion' ? 'Promotion & Year Reset' :
          view === 'rollno' ? 'Roll Numbers' :
          view === 'add' ? 'Add Student' : 'Bulk Import (CSV)'
        }
        backAction={() => setView('menu')}
      />

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* 1. STUDENT DIRECTORY */}
      {view === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={selectedClass} onChange={e => loadDirectory(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
              <option value="">Select Class</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ position: 'relative', flex: 1 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / Adm..." style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }} />
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>Loading...</p>
          ) : filteredDir.length > 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                {selectedClass} ({filteredDir.length} Students)
              </div>
              {filteredDir.map(s => (
                <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {s.roll_no ? `${s.roll_no}. ` : ''}{s.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Adm No: {s.adm_no}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, background: s.class_name === 'ALUMNI' ? '#f1f5f9' : '#eef2ff', color: s.class_name === 'ALUMNI' ? '#64748b' : '#2e44d2', padding: '4px 8px', borderRadius: 8 }}>
                    {s.class_name}
                  </span>
                </div>
              ))}
            </div>
          ) : selectedClass ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>No students found.</p>
          ) : null}
        </div>
      )}

      {/* 2. ANNUAL CLASS PROMOTION & SELECTIVE YEAR RESET */}
      {view === 'promotion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Start promoting from the highest class first (e.g., <b>D3 â†’ ALUMNI</b>, then <b>D2 â†’ D3</b>, down to <b>S1 â†’ S2</b>). Uncheck failed/detained students so they remain in the same class.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>From Class</label>
                <select value={promoSource} onChange={e => loadForPromotion(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4, background: '#fff', fontWeight: 600 }}>
                  <option value="">Select</option>
                  {classes.filter(c => c !== 'ALUMNI').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Promote To</label>
                <input
                  value={promoTarget}
                  onChange={e => setPromoTarget(e.target.value)}
                  placeholder="e.g. D2 or ALUMNI"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 4, fontWeight: 700, color: '#2e44d2' }}
                />
              </div>
            </div>
          </div>

          {promoList.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#334155', padding: '0 4px' }}>
                <span>Selected: {selectedAdms.size} / {promoList.length}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setSelectedAdms(new Set(promoList.map(s => s.adm_no)))} style={{ border: 'none', background: 'none', color: '#2e44d2', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Select All</button>
                  <button onClick={() => setSelectedAdms(new Set())} style={{ border: 'none', background: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Clear</button>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {promoList.map(s => {
                  const checked = selectedAdms.has(s.adm_no);
                  return (
                    <div
                      key={s.adm_no}
                      onClick={() => togglePromoStudent(s.adm_no)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        background: checked ? '#fff' : '#fef2f2'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {checked ? <CheckSquare size={18} color="#2e44d2" /> : <Square size={18} color="#dc2626" />}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: checked ? '#16a34a' : '#dc2626' }}>
                        {checked ? `â†’ ${promoTarget || '?'}` : 'Detained'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={executePromotion}
                disabled={loading}
                style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                {loading ? 'Processing...' : `Promote ${selectedAdms.size} Students to ${promoTarget || '...'}`}
              </button>
            </>
          )}

          {/* SELECTIVE ACADEMIC YEAR RESET (FINANCE PROTECTED) */}
          <YearResetPanel user={user} />
        </div>
      )}

      {/* 3. MANAGE ROLL NUMBERS */}
      {view === 'rollno' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <select value={rollClass} onChange={e => loadForRollNo(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600 }}>
            <option value="">Select Class</option>
            {classes.filter(c => c !== 'ALUMNI').map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {rollList.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => autoAssignRoll('name')} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                  Auto-Assign (A–Z)
                </button>
                <button onClick={() => autoAssignRoll('adm')} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                  Auto-Assign (Adm No)
                </button>
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {rollList.map((s, idx) => (
                  <div key={s.adm_no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Adm: {s.adm_no}</div>
                    </div>
                    <input
                      type="number"
                      value={s.roll_no ?? ''}
                      onChange={e => {
                        const val = e.target.value;
                        setRollList(prev => prev.map((item, i) => i === idx ? { ...item, roll_no: val } : item));
                      }}
                      placeholder="Roll"
                      style={{ width: 64, padding: 7, textAlign: 'center', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}
                    />
                  </div>
                ))}
              </div>

              <button onClick={saveRollNumbers} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Save size={16} /> {loading ? 'Saving...' : 'Save Roll Numbers'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 4. ADD STUDENT */}
      {view === 'add' && (
        <form onSubmit={handleAddStudent} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input required value={newAdm} onChange={e => setNewAdm(e.target.value)} placeholder="Admission Number" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Student Full Name" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required value={newClass} onChange={e => setNewClass(e.target.value)} placeholder="Class (e.g. S1, D1)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input type="number" value={newRoll} onChange={e => setNewRoll(e.target.value)} placeholder="Roll Number (Optional)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Login PIN (Default: 1234)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <button type="submit" disabled={loading} style={{ padding: 13, borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Saving...' : 'Save Student'}
          </button>
        </form>
      )}

      {/* 5. BULK CSV IMPORT */}
      {view === 'import' && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#475569' }}>
            Format: <b>adm_no, name, class_name, roll_no(optional), pin(optional)</b>
          </div>
          <textarea
            rows={8}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={'101, Muhammed Sinan, S1, 1, 1234\n102, Ahmed Fayiz, S1, 2, 1234'}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: 12 }}
          />
          <button onClick={handleBulkImport} disabled={loading} style={{ padding: 13, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Importing...' : 'Import Students'}
          </button>
        </div>
      )}
    </div>
  );
}

