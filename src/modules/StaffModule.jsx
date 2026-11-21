import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Users, UserCheck, UserPlus, Trash2, Save
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { clearClassAccessCache } from '../lib/useClassAccess';

export default function StaffModule({ onBack }) {
  const [tab, setTab] = useState('directory'); // directory | class_teachers | add
  const [staffList, setStaffList] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Assign Class Teacher State
  const [assignClass, setAssignClass] = useState('');
  const [assignStaffId, setAssignStaffId] = useState('');

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

  // Assign Class Teacher (Updates all modules instantly)
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
      clearClassAccessCache(); // Refresh cache for Finance, Attendance, etc.
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

  // Add / Update Staff
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
    if (error) {
      setMsg('Error: ' + error.message);
    } else {
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
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Staff & Class Teachers</h2>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 4 }}>
        {[
          { id: 'directory', label: 'Staff List' },
          { id: 'class_teachers', label: 'Class Teachers' },
          { id: 'add', label: 'Add Staff' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setMsg(''); }}
            style={{
              flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
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

      {/* TAB 2: CENTRALIZED CLASS TEACHER ASSIGNMENT */}
      {tab === 'class_teachers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <form onSubmit={handleAssignClassTeacher} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2', display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={16} /> Assign Class Teacher (Applies to All Modules)
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
              {loading ? 'Saving...' : 'Assign Class Teacher'}
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

      {/* TAB 3: ADD STAFF */}
      {tab === 'add' && (
        <form onSubmit={handleAddStaff} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input required value={newId} onChange={e => setNewId(e.target.value)} placeholder="Staff ID (e.g. 105)" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Staff Full Name" style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>
            <option value="teacher">Teacher</option>
            <option value="coordinator">Coordinator</option>
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