import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, UserCheck, Trash2, Save, BookOpen, Plus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ClassSubjectsExcelBar from '../components/ClassSubjectsExcelBar';
import { clearClassAccessCache } from '../lib/useClassAccess';

export default function StaffModule({ onBack }) {
  const [tab, setTab] = useState('directory');
  const [subMode, setSubMode] = useState('subjects'); // directory | class_teachers | subjects | add
  const [staffList, setStaffList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Assign Class Teacher State
  const [assignClass, setAssignClass] = useState('');
  const [assignStaffId, setAssignStaffId] = useState('');

  // Subject Mapping State
  const [subClass, setSubClass] = useState('');
  const [classSubjects, setClassSubjects] = useState([]);
  const [newSubName, setNewSubName] = useState('');
  const [newSubStaffId, setNewSubStaffId] = useState('');
  const [newW1W4, setNewW1W4] = useState(true);
  const [newMidterm, setNewMidterm] = useState(true);
  const [newHifz, setNewHifz] = useState(false);

  // Add Staff State
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('teacher');
  const [newPin, setNewPin] = useState('1234');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: sf }, { data: st }, { data: ct }] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase.from('students').select('class_name'),
      supabase.from('class_teachers').select('*').order('class_name')
    ]);

    if (sf) setStaffList(sf);
    if (st) {
      setClasses([...new Set(st.map(d => d.class_name).filter(Boolean))].filter(c => c !== 'ALUMNI').sort());
    }
    if (ct) setClassTeachers(ct);
    setLoading(false);
  }

  // Load subjects for selected class only (Zero Lag)
  async function loadClassSubjects(cls) {
    setSubClass(cls);
    setMsg('');
    if (!cls) {
      setClassSubjects([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('subject_assignments')
      .select('*')
      .eq('class_name', cls)
      .order('subject_name');
    setClassSubjects(data || []);
    setLoading(false);
  }

  // Add Subject & Assign Teacher
  async function handleAddSubject(e) {
    e.preventDefault();
    if (!subClass || !newSubName.trim()) return alert('Select class and enter subject name.');
    const staffObj = staffList.find(s => String(s.staff_id) === String(newSubStaffId));

    setLoading(true);
    setMsg('');
    const { error } = await supabase.from('subject_assignments').upsert(
      {
        class_name: subClass,
        subject_name: newSubName.trim(),
        staff_id: staffObj ? String(staffObj.staff_id) : null,
        staff_name: staffObj ? staffObj.name : null,
        has_w1_w4: newW1W4,
        has_midterm: newMidterm,
        has_hifz: newHifz
      },
      { onConflict: 'class_name,subject_name' }
    );

    setLoading(false);
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
      setMsg(`${newSubName.trim()} added to ${subClass}.`);
      setNewSubName('');
      loadClassSubjects(subClass);
    }
  }

  // Optimistic Toggle for W1-W4 / Midterm / Hifz (Instant, Zero Lag)
  function toggleSubjectFlag(sub, field) {
    const nextVal = !sub[field];
    setClassSubjects(prev => prev.map(item => item.id === sub.id ? { ...item, [field]: nextVal } : item));
    supabase.from('subject_assignments').update({ [field]: nextVal }).eq('id', sub.id).then();
  }

  // Optimistic Inline Teacher Change (Instant, Zero Lag)
  function changeSubjectTeacher(sub, staffId) {
    const staffObj = staffList.find(s => String(s.staff_id) === String(staffId));
    const sId = staffObj ? String(staffObj.staff_id) : null;
    const sName = staffObj ? staffObj.name : null;

    setClassSubjects(prev => prev.map(item => item.id === sub.id ? { ...item, staff_id: sId, staff_name: sName } : item));
    supabase.from('subject_assignments').update({ staff_id: sId, staff_name: sName }).eq('id', sub.id).then();
  }

  // Optimistic Inline Subject Name Edit (Instant, Zero Lag + Syncs Syllabus)
  async function renameSubject(sub) {
    const next = window.prompt('Edit Subject Name:', sub.subject_name || '');
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === sub.subject_name) return;

    const prevName = sub.subject_name;
    setClassSubjects(prev => prev.map(item => item.id === sub.id ? { ...item, subject_name: trimmed } : item));

    const { error } = await supabase
      .from('subject_assignments')
      .update({ subject_name: trimmed })
      .eq('id', sub.id);

    if (error) {
      setClassSubjects(prev => prev.map(item => item.id === sub.id ? { ...item, subject_name: prevName } : item));
      alert('Rename error: ' + error.message);
      return;
    }

    // Keep syllabus_weeks in sync if old name existed there
    if (prevName && sub.class_name) {
      supabase
        .from('syllabus_weeks')
        .update({ subject: trimmed })
        .eq('class_name', sub.class_name)
        .eq('subject', prevName)
        .then();
    }
  }

  async function deleteSubject(id, name) {
    if (!window.confirm(`Remove ${name} from ${subClass}?`)) return;
    setClassSubjects(prev => prev.filter(s => s.id !== id));
    await supabase.from('subject_assignments').delete().eq('id', id);
  }

  // Assign Class Teacher
  async function handleAssignClassTeacher(e) {
    e.preventDefault();
    if (!assignClass || !assignStaffId) return alert('Select both class and teacher.');
    const staffObj = staffList.find(s => String(s.staff_id) === String(assignStaffId));
    if (!staffObj) return;

    setLoading(true);
    setMsg('');
    const { error } = await supabase.from('class_teachers').upsert(
      {
        class_name: assignClass,
        staff_id: String(staffObj.staff_id),
        staff_name: staffObj.name
      },
      { onConflict: 'class_name' }
    );

    setLoading(false);
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
      clearClassAccessCache();
      setMsg(`${staffObj.name} assigned as Class Teacher for ${assignClass}.`);
      setAssignClass('');
      setAssignStaffId('');
      loadAll();
    }
  }

  async function removeClassTeacher(clsName) {
    if (!window.confirm(`Remove class teacher assignment for ${clsName}?`)) return;
    await supabase.from('class_teachers').delete().eq('class_name', clsName);
    clearClassAccessCache();
    setMsg(`Removed class teacher for ${clsName}.`);
    loadAll();
  }

  // Add Staff
  async function handleAddStaff(e) {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) return alert('Enter Staff ID and Name.');
    setLoading(true);
    setMsg('');

    const { error } = await supabase.from('staff').upsert(
      {
        staff_id: newId.trim(),
        name: newName.trim(),
        role: newRole,
        pin: newPin.trim() || '1234'
      },
      { onConflict: 'staff_id' }
    );

    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else {
      setMsg(`Staff ${newName.trim()} saved.`);
      setNewId('');
      setNewName('');
      setNewPin('1234');
      loadAll();
    }
  }

  async function deleteStaff(staffId, name) {
    if (!window.confirm(`Delete staff member ${name}?`)) return;
    await supabase.from('staff').delete().eq('staff_id', staffId);
    loadAll();
  }

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Staff & Assignments</h2>
      </div>

      {/* 4 TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 3 }}>
        {[
          { id: 'directory', label: 'Staff' },
          { id: 'class_teachers', label: 'Class Tr' },
          { id: 'subjects', label: 'Subjects' },
          { id: 'add', label: 'Add Staff' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(''); }}
            style={{
              flex: 1, padding: '9px 3px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2e44d2' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* TAB 1: STAFF DIRECTORY */}
      {tab === 'directory' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
            Total Staff ({staffList.length})
          </div>
          {staffList.map(s => {
            const assignedCls = classTeachers
              .filter(ct => String(ct.staff_id) === String(s.staff_id))
              .map(ct => ct.class_name);
            return (
              <div key={s.staff_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    ID: {s.staff_id} • Role: <span style={{ textTransform: 'capitalize' }}>{s.role || 'teacher'}</span>
                  </div>
                  {assignedCls.length > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#2e44d2', marginTop: 2 }}>
                      Class Teacher: {assignedCls.join(', ')}
                    </div>
                  )}
                </div>
                <Trash2 size={15} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => deleteStaff(s.staff_id, s.name)} />
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: CLASS TEACHERS */}
      {tab === 'class_teachers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <form onSubmit={handleAssignClassTeacher} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2', display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={16} /> Assign Class Teacher
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 8 }}>
              <select value={assignClass} onChange={e => setAssignClass(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', fontWeight: 600 }}>
                <option value="">Class</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={assignStaffId} onChange={e => setAssignStaffId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', fontWeight: 600 }}>
                <option value="">Select Teacher</option>
                {staffList.map(s => (
                  <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.staff_id})</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={loading} style={{ padding: 11, borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              Assign
            </button>
          </form>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
              Assigned Class Teachers ({classTeachers.length})
            </div>
            {classTeachers.length === 0 ? (
              <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 16 }}>No class teachers assigned yet.</p>
            ) : (
              classTeachers.map(ct => (
                <div key={ct.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 800, background: '#eef2ff', color: '#2e44d2', padding: '3px 8px', borderRadius: 6, marginRight: 8 }}>
                      {ct.class_name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{ct.staff_name}</span>
                  </div>
                  <Trash2 size={15} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => removeClassTeacher(ct.class_name)} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CLASS-WISE SUBJECTS, TEACHERS & EXAM CONFIG (W1-W4 / MIDTERM) */}
      {tab === 'subjects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ClassSubjectsExcelBar onDone={() => loadAll()}  onModeChange={setSubMode} />
          {subMode === 'subjects' && (
            <>
          <select
            value={subClass}
            onChange={e => loadClassSubjects(e.target.value)}
            style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 13 }}
          >
            <option value="">Select Class to Manage Subjects</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {subClass && (
            <>
              {/* ADD NEW SUBJECT FORM */}
              <form onSubmit={handleAddSubject} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BookOpen size={15} /> Add Subject to {subClass}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    required
                    value={newSubName}
                    onChange={e => setNewSubName(e.target.value)}
                    placeholder="Subject Name (e.g. Fiqh, Arabic)"
                    style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />
                  <select
                    value={newSubStaffId}
                    onChange={e => setNewSubStaffId(e.target.value)}
                    style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                  >
                    <option value="">Assign Teacher</option>
                    {staffList.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
                  </select>
                </div>

                {/* EXAM TYPE TOGGLES */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { label: 'W1–W4', val: newW1W4, set: setNewW1W4 },
                    { label: 'Midterm', val: newMidterm, set: setNewMidterm },
                    { label: 'Hifz / Viva', val: newHifz, set: setNewHifz }
                  ].map(b => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => b.set(!b.val)}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        border: b.val ? '1px solid #16a34a' : '1px solid #cbd5e1',
                        background: b.val ? '#dcfce7' : '#f8fafc',
                        color: b.val ? '#15803d' : '#64748b'
                      }}
                    >
                      {b.label}: {b.val ? 'ON' : 'OFF'}
                    </button>
                  ))}
                </div>

                <button type="submit" disabled={loading} style={{ padding: 10, borderRadius: 8, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Plus size={14} /> Add Subject
                </button>
              </form>

              {/* ASSIGNED SUBJECTS LIST */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classSubjects.length === 0 ? (
                  <div style={{ background: '#fff', padding: 18, borderRadius: 14, border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                    No subjects configured for {subClass} yet.
                  </div>
                ) : (
                  classSubjects.map(sub => (
                    <div key={sub.id} style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{sub.subject_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            value={sub.staff_id || ''}
                            onChange={e => changeSubjectTeacher(sub, e.target.value)}
                            style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 600, background: '#f8fafc', maxWidth: 160 }}
                          >
                            <option value="">Unassigned</option>
                            {staffList.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
                          </select>
                          <Trash2 size={14} color="#dc2626" style={{ cursor: 'pointer' }} onClick={() => deleteSubject(sub.id, sub.subject_name)} />
                        </div>
                      </div>

                      {/* INSTANT EXAM CONFIG CHIPS */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { key: 'has_w1_w4', label: 'W1–W4' },
                          { key: 'has_midterm', label: 'Midterm' },
                          { key: 'has_hifz', label: 'Hifz / Viva' }
                        ].map(f => {
                          const on = !!sub[f.key];
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => toggleSubjectFlag(sub, f.key)}
                              style={{
                                flex: 1, padding: '5px 4px', borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                border: on ? '1px solid #16a34a' : '1px solid #e2e8f0',
                                background: on ? '#16a34a' : '#f1f5f9',
                                color: on ? '#fff' : '#64748b'
                              }}
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </>
          )}
        </div>
      )}

      {/* TAB 4: ADD STAFF */}
      {tab === 'add' && (
        <form onSubmit={handleAddStaff} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input required value={newId} onChange={e => setNewId(e.target.value)} placeholder="Staff ID (e.g. 105)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Staff Full Name" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
            <option value="teacher">Teacher</option>
            <option value="coordinator">Coordinator</option>
            <option value="Principal">Principal</option>
              <option value="admin">Admin</option>
          </select>
          <input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Login PIN (Default: 1234)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <button type="submit" disabled={loading} style={{ padding: 13, borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Save size={15} /> {loading ? 'Saving...' : 'Save Staff'}
          </button>
        </form>
      )}
    </div>
  );
}