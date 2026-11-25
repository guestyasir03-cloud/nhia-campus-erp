import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, Clock, Printer, Download, Copy, RefreshCw, ShieldCheck, FileText, Users, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ALL_ITEMS = [
  'ADF', 'SIBAQ', 'FEST', 'CALENDAR', 'MINUS OF ACCOUNT',
  'DEPOSIT', 'FINE', 'EXAM FEE', 'MONTHLY', 'NUSHA',
  'CLASS FUND', 'PRINTER', 'LIBRARY', 'COLLECTIVE BURDEN'
];

const PAGE_SIZE = 25;

export default function ExamClearanceModule({ onBack, user }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'principal' || user?.role === 'coordinator';
  const isStudent = user?.role === 'student';

  const [activeTab, setActiveTab] = useState('clearance');
  const [reportTab, setReportTab] = useState('class_summary');
  const [reportClass, setReportClass] = useState('ALL');

  const [students, setStudents] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [staffPerms, setStaffPerms] = useState({});
  const [clearanceMap, setClearanceMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bulkItem, setBulkItem] = useState('ALL_ITEMS');
  const [page, setPage] = useState(1);
  const [printAdm, setPrintAdm] = useState(null);

  // Staff permission editor state
  const [editStaffId, setEditStaffId] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [editClasses, setEditClasses] = useState([]);

  async function loadAll() {
    setLoading(true);
    const [stRes, sfRes, permRes, clrRes] = await Promise.all([
      supabase.from('students').select('*').order('class_name').order('name').limit(2000),
      supabase.from('staff').select('staff_id, name').order('name').limit(500),
      supabase.from('exam_clearance_staff').select('*').limit(500),
      supabase.from('exam_clearances').select('*').limit(10000)
    ]);

    const stList = (stRes.data || []).map(s => ({
      ...s,
      adm_key: String(s.adm_no || s.admission_no || s.id).trim()
    }));
    setStudents(stList);
    setStaffList(sfRes.data || []);

    const pMap = {};
    (permRes.data || []).forEach(p => { pMap[String(p.staff_id)] = p; });
    setStaffPerms(pMap);

    const cMap = {};
    (clrRes.data || []).forEach(c => {
      cMap[`${c.adm_no}|${c.item_name}`] = c;
    });
    setClearanceMap(cMap);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const allClasses = useMemo(() => {
    return [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  }, [students]);

  const myPerm = useMemo(() => {
    if (isAdmin) return { assigned_items: ALL_ITEMS, assigned_classes: [] };
    const sid = String(user?.staff_id || user?.id || '').trim().toLowerCase();
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const uName = norm(user?.name);
    const list = Object.values(staffPerms);
    const found = list.find(p =>
      (sid && String(p.staff_id || '').trim().toLowerCase() === sid) ||
      (uName && norm(p.staff_name) && (norm(p.staff_name) === uName || norm(p.staff_name).includes(uName) || uName.includes(norm(p.staff_name))))
    );
    return found || { assigned_items: [], assigned_classes: [] };
  }, [isAdmin, user, staffPerms]);

  const visibleItems = isAdmin ? ALL_ITEMS : (myPerm.assigned_items || []);

  const allowedStudents = useMemo(() => {
    if (isStudent) {
      const myAdm = String(user?.adm_no || user?.admission_no || '').trim().toLowerCase();
      return students.filter(s => s.adm_key.toLowerCase() === myAdm);
    }
    if (isAdmin) return students;
    const cls = myPerm.assigned_classes || [];
    if (!cls.length) return students;
    return students.filter(s => cls.includes(s.class_name));
  }, [students, isAdmin, isStudent, user, myPerm]);

  function getItemRec(admKey, item) {
    return clearanceMap[`${admKey}|${item}`] || {
      adm_no: admKey,
      item_name: item,
      is_cleared: false,
      amount_due: 0,
      remarks: '',
      cleared_by: null,
      cleared_at: null
    };
  }

  function getStats(s) {
    let clearedCount = 0;
    let totalDue = 0;
    for (let i = 0; i < ALL_ITEMS.length; i++) {
      const rec = clearanceMap[`${s.adm_key}|${ALL_ITEMS[i]}`];
      if (rec?.is_cleared) clearedCount++;
      totalDue += Number(rec?.amount_due) || 0;
    }
    const isApproved = clearedCount === ALL_ITEMS.length && totalDue === 0;
    return { clearedCount, totalDue, isApproved };
  }

  // Instant optimistic toggle
  async function toggleItem(student, item) {
    const key = `${student.adm_key}|${item}`;
    const prev = getItemRec(student.adm_key, item);
    const nextCleared = !prev.is_cleared;
    const now = new Date().toISOString();
    const nextRec = {
      adm_no: student.adm_key,
      class_name: student.class_name || '',
      item_name: item,
      is_cleared: nextCleared,
      amount_due: nextCleared ? 0 : (Number(prev.amount_due) || 0),
      remarks: prev.remarks || '',
      cleared_by: nextCleared ? (user?.name || 'Staff') : null,
      cleared_at: nextCleared ? now : null
    };
    setClearanceMap(m => ({ ...m, [key]: nextRec }));
    await supabase.from('exam_clearances').upsert(nextRec, { onConflict: 'adm_no,item_name' });
  }

  async function toggleAllForStudent(student) {
    if (!visibleItems.length) return;
    const allCleared = visibleItems.every(it => getItemRec(student.adm_key, it).is_cleared);
    const nextCleared = !allCleared;
    const now = new Date().toISOString();
    const updates = {};
    const rows = visibleItems.map(it => {
      const prev = getItemRec(student.adm_key, it);
      const rec = {
        adm_no: student.adm_key,
        class_name: student.class_name || '',
        item_name: it,
        is_cleared: nextCleared,
        amount_due: nextCleared ? 0 : (Number(prev.amount_due) || 0),
        remarks: prev.remarks || '',
        cleared_by: nextCleared ? (user?.name || 'Staff') : null,
        cleared_at: nextCleared ? now : null
      };
      updates[`${student.adm_key}|${it}`] = rec;
      return rec;
    });
    setClearanceMap(m => ({ ...m, ...updates }));
    await supabase.from('exam_clearances').upsert(rows, { onConflict: 'adm_no,item_name' });
  }

  async function updateDueOrRemark(student, item, field, value) {
    const key = `${student.adm_key}|${item}`;
    const prev = getItemRec(student.adm_key, item);
    const amount = field === 'amount_due' ? (Number(value) || 0) : (Number(prev.amount_due) || 0);
    const remarks = field === 'remarks' ? String(value || '').trim() : (prev.remarks || '');
    if (amount === (Number(prev.amount_due) || 0) && remarks === (prev.remarks || '')) return;

    const nextRec = {
      adm_no: student.adm_key,
      class_name: student.class_name || '',
      item_name: item,
      is_cleared: amount > 0 ? false : Boolean(prev.is_cleared),
      amount_due: amount,
      remarks,
      cleared_by: amount > 0 ? null : prev.cleared_by,
      cleared_at: amount > 0 ? null : prev.cleared_at
    };
    setClearanceMap(m => ({ ...m, [key]: nextRec }));
    await supabase.from('exam_clearances').upsert(nextRec, { onConflict: 'adm_no,item_name' });
  }

  async function handleBulkClear() {
    if (!visibleItems.length) return;
    const itemsToClear = bulkItem === 'ALL_ITEMS' ? visibleItems : [bulkItem];
    const scopeStudents = allowedStudents.filter(s => selectedClass === 'ALL' || s.class_name === selectedClass);
    const label = `${bulkItem === 'ALL_ITEMS' ? 'ALL assigned items' : bulkItem} for ${selectedClass === 'ALL' ? 'ALL visible students' : selectedClass}`;
    if (!window.confirm(`Clear ${label}?`)) return;

    const now = new Date().toISOString();
    const updates = {};
    const rows = [];
    scopeStudents.forEach(s => {
      itemsToClear.forEach(it => {
        const prev = getItemRec(s.adm_key, it);
        if (!prev.is_cleared) {
          const rec = {
            adm_no: s.adm_key,
            class_name: s.class_name || '',
            item_name: it,
            is_cleared: true,
            amount_due: 0,
            remarks: prev.remarks || '',
            cleared_by: user?.name || 'Staff',
            cleared_at: now
          };
          updates[`${s.adm_key}|${it}`] = rec;
          rows.push(rec);
        }
      });
    });

    if (!rows.length) { setMsg('All matching items are already cleared!'); return; }
    setClearanceMap(m => ({ ...m, ...updates }));
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from('exam_clearances').upsert(rows.slice(i, i + 200), { onConflict: 'adm_no,item_name' });
    }
    setMsg(`Cleared ${rows.length} items successfully!`);
  }

  async function saveStaffPerm(e) {
    e.preventDefault();
    if (!editStaffId) return;
    const st = staffList.find(x => String(x.staff_id) === String(editStaffId));
    const rec = {
      staff_id: String(editStaffId),
      staff_name: st?.name || '',
      assigned_items: editItems,
      assigned_classes: editClasses,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('exam_clearance_staff').upsert(rec, { onConflict: 'staff_id' });
    if (error) setMsg('Error: ' + error.message);
    else {
      setStaffPerms(p => ({ ...p, [rec.staff_id]: rec }));
      setMsg(`Saved clearance permissions for ${rec.staff_name}!`);
    }
  }

  function selectStaffToEdit(sid) {
    setEditStaffId(sid);
    const existing = staffPerms[String(sid)];
    setEditItems(existing?.assigned_items || []);
    setEditClasses(existing?.assigned_classes || []);
  }

  function downloadCSV(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  function exportMasterCSV(clsFilter = 'ALL') {
    const list = allowedStudents.filter(s => clsFilter === 'ALL' || s.class_name === clsFilter);
    const headers = ['Adm No', 'Name', 'Class', 'Status', 'Cleared', 'Total Due', ...ALL_ITEMS];
    const rows = list.map(s => {
      const st = getStats(s);
      const cols = ALL_ITEMS.map(it => {
        const c = getItemRec(s.adm_key, it);
        if (c.is_cleared) return 'CLEARED';
        return Number(c.amount_due) > 0 ? `DUE ${c.amount_due}` : 'PENDING';
      });
      return [s.adm_key, `"${s.name}"`, s.class_name, st.isApproved ? 'APPROVED' : 'PENDING', `${st.clearedCount}/14`, st.totalDue, ...cols];
    });
    downloadCSV(`exam_clearance_${clsFilter}.csv`, headers, rows);
  }

  function copyWhatsApp(clsFilter = 'ALL', duesOnly = false) {
    const list = allowedStudents.filter(s => {
      const mCls = clsFilter === 'ALL' || s.class_name === clsFilter;
      const st = getStats(s);
      return mCls && (duesOnly ? st.totalDue > 0 : !st.isApproved);
    });
    if (!list.length) return setMsg('No matching pending/due students found!');
    let text = duesOnly ? `*EXAM CLEARANCE - DUES LIST*\n` : `*EXAM CLEARANCE PENDING LIST*\n`;
    if (clsFilter !== 'ALL') text += `*Class: ${clsFilter}*\n`;
    text += `------------------------\n`;
    list.forEach((s, i) => {
      const items = ALL_ITEMS.filter(it => {
        const c = getItemRec(s.adm_key, it);
        return duesOnly ? Number(c.amount_due) > 0 : !c.is_cleared;
      }).map(it => {
        const c = getItemRec(s.adm_key, it);
        return Number(c.amount_due) > 0 ? `${it} (Rs.${c.amount_due})` : it;
      });
      text += `${i + 1}. *${s.name}* (${s.adm_key}${clsFilter === 'ALL' ? ' - ' + s.class_name : ''})\n   ${duesOnly ? 'Dues' : 'Pending'}: ${items.join(', ')}\n`;
    });
    navigator.clipboard.writeText(text).then(() => setMsg(`Copied WhatsApp list for ${list.length} students!`));
  }

  // Filtered students for clearance tab
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allowedStudents.filter(s => {
      if (selectedClass !== 'ALL' && s.class_name !== selectedClass) return false;
      if (q && !String(s.name || '').toLowerCase().includes(q) && !s.adm_key.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'ALL') {
        const { isApproved } = getStats(s);
        if (statusFilter === 'APPROVED' && !isApproved) return false;
        if (statusFilter === 'PENDING' && isApproved) return false;
      }
      return true;
    });
  }, [allowedStudents, selectedClass, search, statusFilter, clearanceMap]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStudents = filteredStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const summary = useMemo(() => {
    let approved = 0, due = 0;
    allowedStudents.forEach(s => {
      const st = getStats(s);
      if (st.isApproved) approved++;
      due += st.totalDue;
    });
    return { total: allowedStudents.length, approved, pending: allowedStudents.length - approved, due };
  }, [allowedStudents, clearanceMap]);

  // A4 Print Modal View
  if (printAdm) {
    const s = students.find(x => x.adm_key === printAdm);
    if (!s) { setPrintAdm(null); return null; }
    const st = getStats(s);
    return (
      <div style={{ maxWidth: 780, margin: '0 auto', padding: 20, background: '#fff', minHeight: '100vh' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setPrintAdm(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 700 }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>🖨️ Print A4 Form</button>
        </div>
        <div style={{ border: '2px solid #0f172a', padding: 20 }}>
          <h2 style={{ textAlign: 'center', margin: '0 0 4px', textTransform: 'uppercase', fontSize: 18 }}>Examination Hall Ticket Clearance Form</h2>
          <p style={{ textAlign: 'center', margin: '0 0 14px', fontSize: 12, color: '#475569' }}>Clearance of all dues listed below is compulsory for the issue of the Hall Ticket.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0', borderTop: '1px solid #0f172a', borderBottom: '1px solid #0f172a', marginBottom: 12, fontSize: 13 }}>
            <div><b>Name:</b> {s.name}</div>
            <div><b>Admission No:</b> {s.adm_key}</div>
            <div><b>Class:</b> {s.class_name}</div>
            <div><b>Status:</b> {st.isApproved ? 'APPROVED ✓' : 'PENDING'}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ border: '1px solid #0f172a', padding: 6 }}>Sl.</th>
                <th style={{ border: '1px solid #0f172a', padding: 6, textAlign: 'left' }}>Item</th>
                <th style={{ border: '1px solid #0f172a', padding: 6 }}>Due (₹)</th>
                <th style={{ border: '1px solid #0f172a', padding: 6 }}>Cleared</th>
                <th style={{ border: '1px solid #0f172a', padding: 6, textAlign: 'left' }}>Verified By / Remarks</th>
              </tr>
            </thead>
            <tbody>
              {ALL_ITEMS.map((item, idx) => {
                const c = getItemRec(s.adm_key, item);
                return (
                  <tr key={item}>
                    <td style={{ border: '1px solid #0f172a', padding: 5, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, fontWeight: 600 }}>{item}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, textAlign: 'center' }}>{c.amount_due || 0}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, textAlign: 'center', fontWeight: 700 }}>{c.is_cleared ? '✓' : '—'}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, fontSize: 11 }}>{c.cleared_by || ''} {c.remarks ? `(${c.remarks})` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
            <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, width: 140, textAlign: 'center' }}>Student Signature</div>
            <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, width: 140, textAlign: 'center' }}>Class Teacher</div>
            <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, width: 140, textAlign: 'center' }}>Academic Office</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 14, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 12 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Exam Clearance Portal</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>Fast, Paperless Hall Ticket Clearance • {user?.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAdmin && (
            <div style={{ display: 'flex', background: '#e2e8f0', padding: 3, borderRadius: 10, gap: 3 }}>
              {[
                { id: 'clearance', label: 'Clearance' },
                { id: 'reports', label: 'Reports' },
                { id: 'staff', label: 'Staff Access' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    background: activeTab === t.id ? '#fff' : 'transparent',
                    color: activeTab === t.id ? '#1d4ed8' : '#475569'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={loadAll} style={{ padding: '7px 11px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={13} /> Sync
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: '#065f46' }}>✕</button>
        </div>
      )}

      {/* Top Stats */}
      {!isStudent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Total Students</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{summary.total}</div>
          </div>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>Fully Approved</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{summary.approved}</div>
          </div>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #fde68a' }}>
            <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>Pending</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{summary.pending}</div>
          </div>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>Total Due</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>₹{summary.due}</div>
          </div>
        </div>
      )}

      {/* STUDENT SELF VIEW */}
      {isStudent && !loading && (
        allowedStudents.length === 0 ? (
          <div style={{ background: '#fff', padding: 24, borderRadius: 14, textAlign: 'center', color: '#64748b' }}>Student record not found.</div>
        ) : allowedStudents.map(s => {
          const st = getStats(s);
          return (
            <div key={s.adm_key} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{s.class_name} • {s.adm_key}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: st.isApproved ? '#dcfce7' : '#fef3c7', color: st.isApproved ? '#15803d' : '#b45309' }}>
                  {st.isApproved ? '✓ APPROVED' : `⏳ PENDING (${st.clearedCount}/14)`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {ALL_ITEMS.map(item => {
                  const c = getItemRec(s.adm_key, item);
                  return (
                    <div key={item} style={{ padding: 10, borderRadius: 10, border: `1px solid ${c.is_cleared ? '#bbf7d0' : '#fecaca'}`, background: c.is_cleared ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                      <span>{item}</span>
                      <span style={{ color: c.is_cleared ? '#15803d' : '#dc2626' }}>{c.is_cleared ? '✓' : (Number(c.amount_due) > 0 ? `₹${c.amount_due}` : 'Due')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* CLEARANCE TAB */}
      {!isStudent && activeTab === 'clearance' && (
        <>
          <div style={{ background: '#fff', padding: 12, borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search Name or Adm No..."
                style={{ flex: '1 1 180px', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
              />
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setPage(1); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="ALL">All Classes</option>
                {[...new Set(allowedStudents.map(s => s.class_name).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="ALL">All Status</option>
                <option value="APPROVED">Approved Only</option>
                <option value="PENDING">Pending Only</option>
              </select>
              <button onClick={() => copyWhatsApp(selectedClass, false)} style={{ padding: '8px 11px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>📋 WhatsApp Pending</button>
              <button onClick={() => exportMasterCSV(selectedClass)} style={{ padding: '8px 11px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>⬇ Excel</button>
            </div>

            {visibleItems.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#475569' }}>Bulk Clear ({selectedClass === 'ALL' ? 'All Visible' : selectedClass}):</span>
                <select value={bulkItem} onChange={e => setBulkItem(e.target.value)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                  {visibleItems.length > 1 && <option value="ALL_ITEMS">ALL ASSIGNED ITEMS ({visibleItems.length})</option>}
                  {visibleItems.map(it => <option key={it} value={it}>{it}</option>)}
                </select>
                <button onClick={handleBulkClear} style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ✓ Clear All {selectedClass === 'ALL' ? 'Visible' : selectedClass}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', padding: 8, borderRadius: 8 }}>
                No clearance items are assigned to you yet. Ask Admin to assign items in <b>Staff Access</b>.
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Loading students...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pageStudents.map(s => {
                const st = getStats(s);
                const allVisCleared = visibleItems.length > 0 && visibleItems.every(it => getItemRec(s.adm_key, it).is_cleared);
                return (
                  <div key={s.adm_key} style={{ background: st.isApproved ? '#f0fdf4' : '#fff', border: `1px solid ${st.isApproved ? '#86efac' : '#e2e8f0'}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{s.name}</span>
                        <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>{s.adm_key}</span>
                        <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{s.class_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {visibleItems.length > 1 && (
                          <button
                            onClick={() => toggleAllForStudent(s)}
                            style={{ padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: allVisCleared ? '#e2e8f0' : '#2563eb', color: allVisCleared ? '#334155' : '#fff' }}
                          >
                            {allVisCleared ? '↺ Uncheck All' : '✓ Select All'}
                          </button>
                        )}
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{st.clearedCount}/14 {st.totalDue > 0 ? `• Due: ₹${st.totalDue}` : ''}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: st.isApproved ? '#dcfce7' : '#fef3c7', color: st.isApproved ? '#15803d' : '#b45309' }}>
                          {st.isApproved ? '✓ APPROVED' : '⏳ PENDING'}
                        </span>
                        {isAdmin && (
                          <button onClick={() => setPrintAdm(s.adm_key)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 7 }}>
                      {visibleItems.map(item => {
                        const c = getItemRec(s.adm_key, item);
                        return (
                          <div key={item} style={{ border: `1px solid ${c.is_cleared ? '#bbf7d0' : '#e2e8f0'}`, background: c.is_cleared ? '#f0fdf4' : '#f8fafc', borderRadius: 9, padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
                              <input type="checkbox" checked={Boolean(c.is_cleared)} onChange={() => toggleItem(s, item)} style={{ marginTop: 1, accentColor: '#16a34a' }} />
                              <span style={{ lineHeight: 1.2 }}>{item}</span>
                            </label>
                            {c.is_cleared ? (
                              <div style={{ fontSize: 10, color: '#15803d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✓ {c.cleared_by || 'Cleared'}</div>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  placeholder="Due ₹"
                                  defaultValue={c.amount_due || ''}
                                  onBlur={e => updateDueOrRemark(s, item, 'amount_due', e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '3px 6px', fontSize: 11, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Remarks..."
                                  defaultValue={c.remarks || ''}
                                  onBlur={e => updateDueOrRemark(s, item, 'remarks', e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '3px 6px', fontSize: 10.5, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  <span>Page <b>{safePage}</b> of <b>{totalPages}</b> ({filteredStudents.length} students)</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>← Prev</button>
                    <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ADMIN REPORTS TAB */}
      {isAdmin && activeTab === 'reports' && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'class_summary', label: 'Class Summary' },
                { id: 'item_summary', label: 'Item-wise' },
                { id: 'approved_list', label: 'Hall Ticket Ready' },
                { id: 'dues_report', label: 'Financial Dues' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setReportTab(t.id)}
                  style={{ padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: reportTab === t.id ? '#2563eb' : '#f1f5f9', color: reportTab === t.id ? '#fff' : '#334155' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {reportTab !== 'class_summary' && (
                <select value={reportClass} onChange={e => setReportClass(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
                  <option value="ALL">All Classes</option>
                  {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button onClick={() => window.print()} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
            </div>
          </div>

          {reportTab === 'class_summary' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Class</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Total</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#15803d' }}>Approved</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#b45309' }}>Pending</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#dc2626' }}>Total Due (₹)</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {allClasses.map(cls => {
                    const list = students.filter(s => s.class_name === cls);
                    const app = list.filter(s => getStats(s).isApproved).length;
                    const due = list.reduce((sum, s) => sum + getStats(s).totalDue, 0);
                    return (
                      <tr key={cls}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 800 }}>{cls}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{list.length}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', color: '#15803d', fontWeight: 700 }}>{app}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', color: '#b45309', fontWeight: 700 }}>{list.length - app}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>₹{due}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>
                          <button onClick={() => copyWhatsApp(cls, false)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ecfdf5', color: '#047857', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>📋 Copy</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'item_summary' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Item</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#15803d' }}>Cleared</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#b45309' }}>Pending</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#dc2626' }}>Pending Due (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_ITEMS.map(item => {
                    const scoped = students.filter(s => reportClass === 'ALL' || s.class_name === reportClass);
                    let clr = 0, due = 0;
                    scoped.forEach(s => {
                      const c = getItemRec(s.adm_key, item);
                      if (c.is_cleared) clr++;
                      due += Number(c.amount_due) || 0;
                    });
                    return (
                      <tr key={item}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 700 }}>{item}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', color: '#15803d', fontWeight: 700 }}>{clr}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', color: '#b45309', fontWeight: 700 }}>{scoped.length - clr}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>₹{due}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {reportTab === 'approved_list' && (() => {
            const list = students.filter(s => (reportClass === 'ALL' || s.class_name === reportClass) && getStats(s).isApproved);
            return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Sl.</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Adm No</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Student Name</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Class</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s, i) => (
                      <tr key={s.adm_key}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8 }}>{s.adm_key}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 700 }}>{s.name}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, width: 120 }}></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {reportTab === 'dues_report' && (() => {
            const list = students.filter(s => (reportClass === 'ALL' || s.class_name === reportClass) && getStats(s).totalDue > 0)
              .sort((a, b) => getStats(b).totalDue - getStats(a).totalDue);
            return (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ marginBottom: 10 }}>
                  <button onClick={() => copyWhatsApp(reportClass, true)} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📋 Copy WhatsApp Dues List</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Adm No</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Name</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Class</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'left' }}>Breakdown</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#dc2626' }}>Total Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(s => (
                      <tr key={s.adm_key}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8 }}>{s.adm_key}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 700 }}>{s.name}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{s.class_name}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontSize: 11 }}>
                          {ALL_ITEMS.filter(it => Number(getItemRec(s.adm_key, it).amount_due) > 0).map(it => `${it}: ₹${getItemRec(s.adm_key, it).amount_due}`).join(' | ')}
                        </td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right', color: '#dc2626', fontWeight: 800 }}>₹{getStats(s).totalDue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ADMIN STAFF ACCESS TAB */}
      {isAdmin && activeTab === 'staff' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          <form onSubmit={saveStaffPerm} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Assign Clearance Items to Staff</h3>
            <select value={editStaffId} onChange={e => selectStaffToEdit(e.target.value)} required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
              <option value="">-- Select Staff Member --</option>
              {staffList.map(st => <option key={st.staff_id} value={st.staff_id}>{st.name}</option>)}
            </select>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                <span>Clearance Items ({editItems.length}/14)</span>
                <button type="button" onClick={() => setEditItems(editItems.length === ALL_ITEMS.length ? [] : [...ALL_ITEMS])} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Select / Clear All</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                {ALL_ITEMS.map(it => (
                  <label key={it} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editItems.includes(it)} onChange={e => setEditItems(prev => e.target.checked ? [...prev, it] : prev.filter(x => x !== it))} />
                    <span>{it}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                <span>Classes (Leave empty for ALL)</span>
                <button type="button" onClick={() => setEditClasses(editClasses.length === allClasses.length ? [] : [...allClasses])} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Select / Clear All</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                {allClasses.map(cls => (
                  <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editClasses.includes(cls)} onChange={e => setEditClasses(prev => e.target.checked ? [...prev, cls] : prev.filter(x => x !== cls))} />
                    <span>{cls}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" style={{ padding: 10, borderRadius: 9, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Permissions</button>
          </form>

          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Assigned Staff ({Object.keys(staffPerms).length})</h3>
            {Object.values(staffPerms).map(p => (
              <div key={p.staff_id} onClick={() => selectStaffToEdit(p.staff_id)} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, cursor: 'pointer', fontSize: 12 }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.staff_name}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}><b>Items:</b> {(p.assigned_items || []).join(', ') || 'None'}</div>
                <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}><b>Classes:</b> {(p.assigned_classes || []).length ? p.assigned_classes.join(', ') : 'All Classes'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
