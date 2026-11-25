import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Plus, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 25;

export default function ExamClearanceModule({ onBack, user }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'principal' || user?.role === 'coordinator';
  const isStudent = user?.role === 'student';

  const [activeTab, setActiveTab] = useState('clearance');
  const [reportTab, setReportTab] = useState('class_summary');
  const [reportClass, setReportClass] = useState('ALL');

  const [itemsList, setItemsList] = useState([]);
  const [students, setStudents] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [staffPerms, setStaffPerms] = useState({});
  const [clearanceMap, setClearanceMap] = useState({});
  const [customByAdm, setCustomByAdm] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bulkItem, setBulkItem] = useState('ALL_ITEMS');
  const [page, setPage] = useState(1);
  const [printAdm, setPrintAdm] = useState(null);

  // Per-student special due modal state
  const [specialStudent, setSpecialStudent] = useState(null);
  const [specialName, setSpecialName] = useState('');
  const [specialAmt, setSpecialAmt] = useState('');
  const [specialRemarks, setSpecialRemarks] = useState('');

  // Staff permission editor
  const [editStaffId, setEditStaffId] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [editClasses, setEditClasses] = useState([]);

  // Dynamic Item Manager state (Admin & Class Teachers)
  const [itemFormId, setItemFormId] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemIsCommon, setItemIsCommon] = useState(true);
  const [itemClasses, setItemClasses] = useState([]);
  const [itemAmtType, setItemAmtType] = useState('variable'); // 'variable' | 'fixed' | 'class_wise'
  const [itemFixedAmt, setItemFixedAmt] = useState('');
  const [itemClassAmounts, setItemClassAmounts] = useState({});

  async function loadAll() {
    setLoading(true);
    const [itRes, stRes, sfRes, permRes, clrRes] = await Promise.all([
      supabase.from('exam_clearance_items').select('*').order('sort_order').order('id'),
      supabase.from('students').select('*').order('class_name').order('name').limit(2000),
      supabase.from('staff').select('staff_id, name').order('name').limit(500),
      supabase.from('exam_clearance_staff').select('*').limit(500),
      supabase.from('exam_clearances').select('*').limit(10000)
    ]);

    setItemsList(itRes.data || []);

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
    const custMap = {};
    (clrRes.data || []).forEach(c => {
      cMap[`${c.adm_no}|${c.item_name}`] = c;
      if (c.is_custom) {
        if (!custMap[c.adm_no]) custMap[c.adm_no] = [];
        custMap[c.adm_no].push(c.item_name);
      }
    });
    setClearanceMap(cMap);
    setCustomByAdm(custMap);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const allClasses = useMemo(() => {
    return [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  }, [students]);

  const itemByName = useMemo(() => {
    const map = {};
    itemsList.forEach(it => { map[it.name] = it; });
    return map;
  }, [itemsList]);

  const myPerm = useMemo(() => {
    if (isAdmin) return { assigned_items: itemsList.map(i => i.name), assigned_classes: [] };
    const sid = String(user?.staff_id || user?.id || '').trim().toLowerCase();
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const uName = norm(user?.name);
    const list = Object.values(staffPerms);
    const found = list.find(p =>
      (sid && String(p.staff_id || '').trim().toLowerCase() === sid) ||
      (uName && norm(p.staff_name) && (norm(p.staff_name) === uName || norm(p.staff_name).includes(uName) || uName.includes(norm(p.staff_name))))
    );
    return found || { assigned_items: [], assigned_classes: [] };
  }, [isAdmin, user, staffPerms, itemsList]);

  // Class teacher = non-admin staff assigned to specific class(es)
  const isClassTeacher = !isAdmin && !isStudent && (myPerm.assigned_classes || []).length > 0;
  const canManageItems = isAdmin || isClassTeacher;
  const manageableClasses = isAdmin ? allClasses : (myPerm.assigned_classes || []);
  const myCreatorKey = String(user?.staff_id || user?.id || user?.name || '').trim().toLowerCase();

  useEffect(() => {
    if (isClassTeacher) {
      setItemIsCommon(false);
      setItemClasses(myPerm.assigned_classes || []);
    }
  }, [isClassTeacher, myPerm.assigned_classes]);

  const visibleItemNames = useMemo(() => {
    const activeNames = new Set(itemsList.map(i => i.name));
    if (isAdmin || isClassTeacher) return itemsList.map(i => i.name);
    return (myPerm.assigned_items || []).filter(n => activeNames.has(n));
  }, [isAdmin, isClassTeacher, myPerm, itemsList]);

  const allowedStudents = useMemo(() => {
    if (isStudent) {
      const myIds = [user?.adm_no, user?.admission_no, user?.student_id, user?.username, user?.id]
        .filter(Boolean)
        .map(v => String(v).trim().toLowerCase());
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const myName = norm(user?.name);
      const byId = students.filter(s => myIds.includes(s.adm_key.toLowerCase()) || myIds.includes(String(s.id || '').trim().toLowerCase()));
      if (byId.length > 0) return byId;
      return myName ? students.filter(s => norm(s.name) === myName) : [];
    }
    if (isAdmin) return students;
    const cls = myPerm.assigned_classes || [];
    if (!cls.length) return students;
    return students.filter(s => cls.includes(s.class_name));
  }, [students, isAdmin, isStudent, user, myPerm]);

  function getDefaultDueFor(itemNameStr, clsName) {
    const cfg = itemByName[itemNameStr];
    if (!cfg) return 0;
    if (cfg.amount_type === 'fixed') return Number(cfg.fixed_amount) || 0;
    if (cfg.amount_type === 'class_wise') return Number(cfg.class_amounts?.[clsName]) || 0;
    return 0;
  }

  function getItemsForClass(clsName) {
    return itemsList.filter(it => it.is_common || (it.target_classes || []).includes(clsName));
  }

  function getStudentAllItems(s) {
    const base = getItemsForClass(s.class_name).map(it => ({ ...it, is_custom: false }));
    const baseNames = new Set(base.map(b => b.name));
    const customs = (customByAdm[s.adm_key] || [])
      .filter(n => !baseNames.has(n))
      .map(n => ({ name: n, is_common: false, amount_type: 'variable', fixed_amount: 0, is_custom: true }));
    return [...base, ...customs];
  }

  function getItemRec(admKey, itemNameStr, clsName = '') {
    const existing = clearanceMap[`${admKey}|${itemNameStr}`];
    if (existing) return existing;
    const defaultDue = getDefaultDueFor(itemNameStr, clsName);
    return {
      adm_no: admKey,
      class_name: clsName,
      item_name: itemNameStr,
      is_cleared: false,
      amount_due: defaultDue,
      remarks: '',
      cleared_by: null,
      cleared_at: null,
      is_custom: false
    };
  }

  function getStats(s) {
    const applicable = getStudentAllItems(s);
    let clearedCount = 0;
    let totalDue = 0;
    for (let i = 0; i < applicable.length; i++) {
      const rec = getItemRec(s.adm_key, applicable[i].name, s.class_name);
      if (rec.is_cleared) clearedCount++;
      else totalDue += Number(rec.amount_due) || 0;
    }
    const totalItems = applicable.length;
    const isApproved = totalItems > 0 && clearedCount === totalItems && totalDue === 0;
    return { clearedCount, totalItems, totalDue, isApproved };
  }

  async function toggleItem(student, itemNameStr) {
    const key = `${student.adm_key}|${itemNameStr}`;
    const prev = getItemRec(student.adm_key, itemNameStr, student.class_name);
    const nextCleared = !prev.is_cleared;
    const now = new Date().toISOString();
    const defDue = getDefaultDueFor(itemNameStr, student.class_name);
    const fallbackDue = defDue > 0 ? defDue : (Number(prev.amount_due) || 0);

    const nextRec = {
      adm_no: student.adm_key,
      class_name: student.class_name || '',
      item_name: itemNameStr,
      is_cleared: nextCleared,
      amount_due: nextCleared ? 0 : fallbackDue,
      remarks: prev.remarks || '',
      cleared_by: nextCleared ? (user?.name || 'Staff') : null,
      cleared_at: nextCleared ? now : null,
      is_custom: Boolean(prev.is_custom)
    };
    setClearanceMap(m => ({ ...m, [key]: nextRec }));
    await supabase.from('exam_clearances').upsert(nextRec, { onConflict: 'adm_no,item_name' });
  }

  async function toggleAllForStudent(student, studentVisibleItems) {
    if (!studentVisibleItems.length) return;
    const allCleared = studentVisibleItems.every(it => getItemRec(student.adm_key, it.name, student.class_name).is_cleared);
    const nextCleared = !allCleared;
    const now = new Date().toISOString();
    const updates = {};
    const rows = studentVisibleItems.map(it => {
      const prev = getItemRec(student.adm_key, it.name, student.class_name);
      const defDue = getDefaultDueFor(it.name, student.class_name);
      const fallbackDue = defDue > 0 ? defDue : (Number(prev.amount_due) || 0);
      const rec = {
        adm_no: student.adm_key,
        class_name: student.class_name || '',
        item_name: it.name,
        is_cleared: nextCleared,
        amount_due: nextCleared ? 0 : fallbackDue,
        remarks: prev.remarks || '',
        cleared_by: nextCleared ? (user?.name || 'Staff') : null,
        cleared_at: nextCleared ? now : null,
        is_custom: Boolean(it.is_custom || prev.is_custom)
      };
      updates[`${student.adm_key}|${it.name}`] = rec;
      return rec;
    });
    setClearanceMap(m => ({ ...m, ...updates }));
    await supabase.from('exam_clearances').upsert(rows, { onConflict: 'adm_no,item_name' });
  }

  async function updateDueOrRemark(student, itemNameStr, field, value) {
    const key = `${student.adm_key}|${itemNameStr}`;
    const prev = getItemRec(student.adm_key, itemNameStr, student.class_name);
    const amount = field === 'amount_due' ? (Number(value) || 0) : (Number(prev.amount_due) || 0);
    const remarks = field === 'remarks' ? String(value || '').trim() : (prev.remarks || '');
    if (amount === (Number(prev.amount_due) || 0) && remarks === (prev.remarks || '')) return;

    const nextRec = {
      adm_no: student.adm_key,
      class_name: student.class_name || '',
      item_name: itemNameStr,
      is_cleared: amount > 0 ? false : Boolean(prev.is_cleared),
      amount_due: amount,
      remarks,
      cleared_by: amount > 0 ? null : prev.cleared_by,
      cleared_at: amount > 0 ? null : prev.cleared_at,
      is_custom: Boolean(prev.is_custom)
    };
    setClearanceMap(m => ({ ...m, [key]: nextRec }));
    await supabase.from('exam_clearances').upsert(nextRec, { onConflict: 'adm_no,item_name' });
  }

  // Add per-student special due
  async function saveSpecialDue(e) {
    e.preventDefault();
    if (!specialStudent) return;
    const cleanName = specialName.trim().toUpperCase();
    if (!cleanName) return;
    const rec = {
      adm_no: specialStudent.adm_key,
      class_name: specialStudent.class_name || '',
      item_name: cleanName,
      is_cleared: false,
      amount_due: Number(specialAmt) || 0,
      remarks: specialRemarks.trim(),
      cleared_by: null,
      cleared_at: null,
      is_custom: true,
      created_by: myCreatorKey
    };
    const { error } = await supabase.from('exam_clearances').upsert(rec, { onConflict: 'adm_no,item_name' });
    if (error) return setMsg('Error: ' + error.message);

    setClearanceMap(m => ({ ...m, [`${rec.adm_no}|${rec.item_name}`]: rec }));
    setCustomByAdm(prev => {
      const arr = prev[rec.adm_no] || [];
      return arr.includes(rec.item_name) ? prev : { ...prev, [rec.adm_no]: [...arr, rec.item_name] };
    });
    setMsg(`Added "${cleanName}" (₹${rec.amount_due}) for ${specialStudent.name}!`);
    setSpecialStudent(null);
    setSpecialName('');
    setSpecialAmt('');
    setSpecialRemarks('');
  }

  async function deleteSpecialDue(student, itemNameStr) {
    if (!window.confirm(`Remove special due "${itemNameStr}" from ${student.name}?`)) return;
    await supabase.from('exam_clearances').delete().eq('adm_no', student.adm_key).eq('item_name', itemNameStr);
    setClearanceMap(m => {
      const copy = { ...m };
      delete copy[`${student.adm_key}|${itemNameStr}`];
      return copy;
    });
    setCustomByAdm(prev => ({
      ...prev,
      [student.adm_key]: (prev[student.adm_key] || []).filter(n => n !== itemNameStr)
    }));
  }

  async function handleBulkClear() {
    if (!visibleItemNames.length) return;
    const itemsToClear = bulkItem === 'ALL_ITEMS' ? visibleItemNames : [bulkItem];
    const scopeStudents = allowedStudents.filter(s => selectedClass === 'ALL' || s.class_name === selectedClass);
    const label = `${bulkItem === 'ALL_ITEMS' ? 'ALL assigned items' : bulkItem} for ${selectedClass === 'ALL' ? 'ALL visible students' : selectedClass}`;
    if (!window.confirm(`Clear ${label}?`)) return;

    const now = new Date().toISOString();
    const updates = {};
    const rows = [];
    scopeStudents.forEach(s => {
      const applicableNames = new Set(getStudentAllItems(s).map(i => i.name));
      itemsToClear.forEach(itName => {
        if (!applicableNames.has(itName)) return;
        const prev = getItemRec(s.adm_key, itName, s.class_name);
        if (!prev.is_cleared) {
          const rec = {
            adm_no: s.adm_key,
            class_name: s.class_name || '',
            item_name: itName,
            is_cleared: true,
            amount_due: 0,
            remarks: prev.remarks || '',
            cleared_by: user?.name || 'Staff',
            cleared_at: now,
            is_custom: Boolean(prev.is_custom)
          };
          updates[`${s.adm_key}|${itName}`] = rec;
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

  // Admin & Class Teacher: Add / Edit / Delete Clearance Items
  async function saveItemConfig(e) {
    e.preventDefault();
    const cleanName = itemName.trim().toUpperCase();
    if (!cleanName) return;

    const finalIsCommon = isAdmin ? itemIsCommon : false;
    const finalClasses = finalIsCommon ? [] : (isAdmin ? itemClasses : itemClasses.filter(c => manageableClasses.includes(c)));
    if (!finalIsCommon && finalClasses.length === 0) {
      return setMsg('Please select at least one class.');
    }

    const cleanClassAmts = {};
    if (itemAmtType === 'class_wise') {
      const scopeCls = finalIsCommon ? allClasses : finalClasses;
      scopeCls.forEach(c => {
        const val = Number(itemClassAmounts[c]) || 0;
        if (val > 0) cleanClassAmts[c] = val;
      });
    }

    const payload = {
      name: cleanName,
      is_common: finalIsCommon,
      target_classes: finalClasses,
      amount_type: itemAmtType,
      fixed_amount: itemAmtType === 'fixed' ? (Number(itemFixedAmt) || 0) : 0,
      class_amounts: itemAmtType === 'class_wise' ? cleanClassAmts : {},
      sort_order: itemFormId ? undefined : (itemsList.length + 1),
      ...(itemFormId ? {} : { created_by: myCreatorKey, created_by_name: user?.name || 'Staff' })
    };

    let err;
    if (itemFormId) {
      ({ error: err } = await supabase.from('exam_clearance_items').update(payload).eq('id', itemFormId));
    } else {
      ({ error: err } = await supabase.from('exam_clearance_items').insert([payload]));
    }
    if (err) {
      setMsg('Error: ' + err.message);
    } else {
      setMsg(itemFormId ? `Updated "${cleanName}"!` : `Added "${cleanName}"!`);
      resetItemForm();
      loadAll();
    }
  }

  function startEditItem(it) {
    setItemFormId(it.id);
    setItemName(it.name);
    setItemIsCommon(isAdmin ? Boolean(it.is_common) : false);
    setItemClasses(it.target_classes || []);
    setItemAmtType(it.amount_type || 'variable');
    setItemFixedAmt(it.fixed_amount ? String(it.fixed_amount) : '');
    setItemClassAmounts(it.class_amounts || {});
  }

  function resetItemForm() {
    setItemFormId(null);
    setItemName('');
    setItemIsCommon(isAdmin);
    setItemClasses(isAdmin ? [] : manageableClasses);
    setItemAmtType('variable');
    setItemFixedAmt('');
    setItemClassAmounts({});
  }

  async function deleteItemConfig(it) {
    if (!window.confirm(`Remove "${it.name}" from Exam Clearance?`)) return;
    const { error } = await supabase.from('exam_clearance_items').delete().eq('id', it.id);
    if (error) setMsg('Error: ' + error.message);
    else {
      setMsg(`Removed "${it.name}"!`);
      setItemsList(prev => prev.filter(x => x.id !== it.id));
    }
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
    const itemNames = itemsList.map(i => i.name);
    const headers = ['Adm No', 'Name', 'Class', 'Status', 'Cleared', 'Total Due', ...itemNames, 'Special Dues'];
    const rows = list.map(s => {
      const st = getStats(s);
      const appSet = new Set(getItemsForClass(s.class_name).map(i => i.name));
      const cols = itemNames.map(it => {
        if (!appSet.has(it)) return 'N/A';
        const c = getItemRec(s.adm_key, it, s.class_name);
        if (c.is_cleared) return 'CLEARED';
        return Number(c.amount_due) > 0 ? `DUE ${c.amount_due}` : 'PENDING';
      });
      const customs = (customByAdm[s.adm_key] || []).map(n => {
        const c = getItemRec(s.adm_key, n, s.class_name);
        return `${n}:${c.is_cleared ? 'OK' : '₹' + (c.amount_due || 0)}`;
      }).join(' | ');
      return [s.adm_key, `"${s.name}"`, s.class_name, st.isApproved ? 'APPROVED' : 'PENDING', `${st.clearedCount}/${st.totalItems}`, st.totalDue, ...cols, `"${customs}"`];
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
      const applicable = getStudentAllItems(s);
      const items = applicable.filter(it => {
        const c = getItemRec(s.adm_key, it.name, s.class_name);
        return duesOnly ? (!c.is_cleared && Number(c.amount_due) > 0) : !c.is_cleared;
      }).map(it => {
        const c = getItemRec(s.adm_key, it.name, s.class_name);
        return Number(c.amount_due) > 0 ? `${it.name} (Rs.${c.amount_due})` : it.name;
      });
      text += `${i + 1}. *${s.name}* (${s.adm_key}${clsFilter === 'ALL' ? ' - ' + s.class_name : ''})\n   ${duesOnly ? 'Dues' : 'Pending'}: ${items.join(', ')}\n`;
    });
    navigator.clipboard.writeText(text).then(() => setMsg(`Copied WhatsApp list for ${list.length} students!`));
  }

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
  }, [allowedStudents, selectedClass, search, statusFilter, clearanceMap, itemsList, customByAdm]);

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
  }, [allowedStudents, clearanceMap, itemsList, customByAdm]);

  const reportClassesScope = isAdmin ? allClasses : manageableClasses;

  // A4 Print View
  if (printAdm) {
    const s = students.find(x => x.adm_key === printAdm);
    if (!s) { setPrintAdm(null); return null; }
    const st = getStats(s);
    const applicable = getStudentAllItems(s);
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
            <div><b>Status:</b> {st.isApproved ? 'APPROVED ✓' : `PENDING (${st.clearedCount}/${st.totalItems})`}</div>
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
              {applicable.map((it, idx) => {
                const c = getItemRec(s.adm_key, it.name, s.class_name);
                return (
                  <tr key={it.name}>
                    <td style={{ border: '1px solid #0f172a', padding: 5, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, fontWeight: 600 }}>{it.name} {it.is_custom ? '(Special)' : ''}</td>
                    <td style={{ border: '1px solid #0f172a', padding: 5, textAlign: 'center' }}>{c.is_cleared ? 0 : (c.amount_due || 0)}</td>
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
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {isAdmin ? 'Admin Overall Control' : isClassTeacher ? `Class Teacher Control (${manageableClasses.join(', ')})` : 'Staff Clearance'} • {user?.name}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canManageItems && (
            <div style={{ display: 'flex', background: '#e2e8f0', padding: 3, borderRadius: 10, gap: 3, flexWrap: 'wrap' }}>
              {[
                { id: 'clearance', label: 'Clearance' },
                { id: 'items', label: `Items & Fees (${itemsList.length})` },
                ...(isAdmin ? [{ id: 'staff', label: 'Staff Access' }] : []),
                { id: 'reports', label: 'Reports' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
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

      {/* PER-STUDENT SPECIAL DUE MODAL */}
      {specialStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 14 }}>
          <form onSubmit={saveSpecialDue} style={{ background: '#fff', borderRadius: 14, padding: 18, maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Add Special Due for {specialStudent.name}</h3>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>{specialStudent.class_name} • {specialStudent.adm_key} (Only for this student)</div>
            <input type="text" placeholder="Item Name (e.g. BOOK FINE, DAMAGE...)" value={specialName} onChange={e => setSpecialName(e.target.value)} required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <input type="number" placeholder="Amount Due (₹)" value={specialAmt} onChange={e => setSpecialAmt(e.target.value)} required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <input type="text" placeholder="Remarks (optional)" value={specialRemarks} onChange={e => setSpecialRemarks(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setSpecialStudent(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>+ Add Due</button>
            </div>
          </form>
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
          const applicable = getStudentAllItems(s);
          return (
            <div key={s.adm_key} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{s.class_name} • {s.adm_key} {st.totalDue > 0 ? `• Total Due: ₹${st.totalDue}` : ''}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: st.isApproved ? '#dcfce7' : '#fef3c7', color: st.isApproved ? '#15803d' : '#b45309' }}>
                  {st.isApproved ? '✓ APPROVED' : `⏳ PENDING (${st.clearedCount}/${st.totalItems})`}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {applicable.map(it => {
                  const c = getItemRec(s.adm_key, it.name, s.class_name);
                  return (
                    <div key={it.name} style={{ padding: 10, borderRadius: 10, border: `1px solid ${c.is_cleared ? '#bbf7d0' : '#fecaca'}`, background: c.is_cleared ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                      <span>{it.name}</span>
                      <span style={{ color: c.is_cleared ? '#15803d' : '#dc2626' }}>{c.is_cleared ? '✓' : (Number(c.amount_due) > 0 ? `₹${c.amount_due}` : 'Pending')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* ADMIN & CLASS TEACHER: ITEMS & FEES MANAGER */}
      {canManageItems && activeTab === 'items' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14 }}>
          <form onSubmit={saveItemConfig} style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{itemFormId ? 'Edit Clearance Item' : 'Add New Clearance Item'}</h3>
              {itemFormId && <button type="button" onClick={resetItemForm} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Cancel</button>}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Item Name</label>
              <input
                type="text"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                placeholder="e.g. DEPOSIT, EXAM FEE, CLASS FUND..."
                required
                style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Applicable Classes</label>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setItemIsCommon(true)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${itemIsCommon ? '#2563eb' : '#cbd5e1'}`, background: itemIsCommon ? '#eff6ff' : '#fff', color: itemIsCommon ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Common (All Classes)
                  </button>
                  <button type="button" onClick={() => setItemIsCommon(false)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${!itemIsCommon ? '#2563eb' : '#cbd5e1'}`, background: !itemIsCommon ? '#eff6ff' : '#fff', color: !itemIsCommon ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Specific Classes
                  </button>
                </div>
              )}
              {(!itemIsCommon || !isAdmin) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {manageableClasses.map(cls => (
                    <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={itemClasses.includes(cls)} onChange={e => setItemClasses(prev => e.target.checked ? [...prev, cls] : prev.filter(x => x !== cls))} />
                      <span>{cls}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Amount Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {[
                  { id: 'variable', label: 'Separate' },
                  { id: 'fixed', label: 'Same Fixed ₹' },
                  { id: 'class_wise', label: 'Class-wise ₹' }
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => setItemAmtType(opt.id)} style={{ padding: 7, borderRadius: 8, border: `1px solid ${itemAmtType === opt.id ? '#2563eb' : '#cbd5e1'}`, background: itemAmtType === opt.id ? '#eff6ff' : '#fff', color: itemAmtType === opt.id ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {itemAmtType === 'fixed' && (
                <input
                  type="number"
                  value={itemFixedAmt}
                  onChange={e => setItemFixedAmt(e.target.value)}
                  placeholder="Fixed Amount in ₹ (e.g. 2300)"
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              )}

              {itemAmtType === 'class_wise' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#f8fafc', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {(itemIsCommon && isAdmin ? allClasses : itemClasses).map(cls => (
                    <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, width: 34 }}>{cls}</span>
                      <input
                        type="number"
                        placeholder="₹"
                        value={itemClassAmounts[cls] || ''}
                        onChange={e => setItemClassAmounts(prev => ({ ...prev, [cls]: e.target.value }))}
                        style={{ flex: 1, width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" style={{ padding: 10, borderRadius: 9, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Plus size={15} /> {itemFormId ? 'Update Item' : 'Add Clearance Item'}
            </button>
          </form>

          <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Active Clearance Items ({itemsList.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 480, overflowY: 'auto' }}>
              {itemsList.filter(it => isAdmin || it.is_common || (it.target_classes || []).some(c => manageableClasses.includes(c))).map(it => {
                const canEditThis = isAdmin || (Boolean(it.created_by) && String(it.created_by).trim().toLowerCase() === myCreatorKey);
                return (
                  <div key={it.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{it.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: it.is_common ? '#eff6ff' : '#fef3c7', color: it.is_common ? '#1d4ed8' : '#b45309' }}>
                          {it.is_common ? 'Common (All)' : `Classes: ${(it.target_classes || []).join(', ')}`}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: it.amount_type !== 'variable' ? '#dcfce7' : '#f1f5f9', color: it.amount_type !== 'variable' ? '#15803d' : '#475569' }}>
                          {it.amount_type === 'fixed'
                            ? `Fixed: ₹${it.fixed_amount}`
                            : it.amount_type === 'class_wise'
                              ? Object.entries(it.class_amounts || {}).map(([c, v]) => `${c}:₹${v}`).join(' • ') || 'Class-wise'
                              : 'Separate Amount'}
                        </span>
                      </div>
                    </div>
                    {canEditThis && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => startEditItem(it)} style={{ padding: 6, borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', color: '#2563eb' }} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => deleteItemConfig(it)} style={{ padding: 6, borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }} title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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

            {visibleItemNames.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#475569' }}>Bulk Clear ({selectedClass === 'ALL' ? 'All Visible' : selectedClass}):</span>
                <select value={bulkItem} onChange={e => setBulkItem(e.target.value)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                  {visibleItemNames.length > 1 && <option value="ALL_ITEMS">ALL ASSIGNED ITEMS ({visibleItemNames.length})</option>}
                  {visibleItemNames.map(it => <option key={it} value={it}>{it}</option>)}
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
                const applicableForStudent = getStudentAllItems(s).filter(it => it.is_custom || visibleItemNames.includes(it.name));
                const allVisCleared = applicableForStudent.length > 0 && applicableForStudent.every(it => getItemRec(s.adm_key, it.name, s.class_name).is_cleared);
                return (
                  <div key={s.adm_key} style={{ background: st.isApproved ? '#f0fdf4' : '#fff', border: `1px solid ${st.isApproved ? '#86efac' : '#e2e8f0'}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{s.name}</span>
                        <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>{s.adm_key}</span>
                        <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{s.class_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {canManageItems && (
                          <button onClick={() => setSpecialStudent(s)} style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            + Special Due
                          </button>
                        )}
                        {applicableForStudent.length > 1 && (
                          <button
                            onClick={() => toggleAllForStudent(s, applicableForStudent)}
                            style={{ padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: allVisCleared ? '#e2e8f0' : '#2563eb', color: allVisCleared ? '#334155' : '#fff' }}
                          >
                            {allVisCleared ? '↺ Uncheck All' : '✓ Select All'}
                          </button>
                        )}
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{st.clearedCount}/{st.totalItems} {st.totalDue > 0 ? `• Due: ₹${st.totalDue}` : ''}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: st.isApproved ? '#dcfce7' : '#fef3c7', color: st.isApproved ? '#15803d' : '#b45309' }}>
                          {st.isApproved ? '✓ APPROVED' : '⏳ PENDING'}
                        </span>
                        {canManageItems && (
                          <button onClick={() => setPrintAdm(s.adm_key)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 7 }}>
                      {applicableForStudent.map(it => {
                        const c = getItemRec(s.adm_key, it.name, s.class_name);
                        const defDue = getDefaultDueFor(it.name, s.class_name);
                        return (
                          <div key={it.name} style={{ border: `1px solid ${c.is_cleared ? '#bbf7d0' : it.is_custom ? '#fca5a5' : '#e2e8f0'}`, background: c.is_cleared ? '#f0fdf4' : it.is_custom ? '#fff1f2' : '#f8fafc', borderRadius: 9, padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
                                <input type="checkbox" checked={Boolean(c.is_cleared)} onChange={() => toggleItem(s, it.name)} style={{ marginTop: 1, accentColor: '#16a34a' }} />
                                <span style={{ lineHeight: 1.2 }}>
                                  {it.name}
                                  {defDue > 0 && !c.is_cleared && (
                                    <span style={{ display: 'block', fontSize: 9.5, color: '#dc2626', fontWeight: 800 }}>Fixed: ₹{defDue}</span>
                                  )}
                                  {it.is_custom && <span style={{ display: 'block', fontSize: 9, color: '#be123c' }}>Special Due</span>}
                                </span>
                              </label>
                              {it.is_custom && (isAdmin || (Boolean(c.created_by) && String(c.created_by).trim().toLowerCase() === myCreatorKey)) && (
                                <button onClick={() => deleteSpecialDue(s, it.name)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 800 }} title="Remove">✕</button>
                              )}
                            </div>
                            {c.is_cleared ? (
                              <div style={{ fontSize: 10, color: '#15803d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✓ {c.cleared_by || 'Cleared'}</div>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  placeholder="Due ₹"
                                  key={`${s.adm_key}|${it.name}|${c.amount_due}`}
                                  defaultValue={c.amount_due || ''}
                                  onBlur={e => updateDueOrRemark(s, it.name, 'amount_due', e.target.value)}
                                  style={{ width: '100%', boxSizing: 'border-box', padding: '3px 6px', fontSize: 11, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff' }}
                                />
                                <input
                                  type="text"
                                  placeholder="Remarks..."
                                  defaultValue={c.remarks || ''}
                                  onBlur={e => updateDueOrRemark(s, it.name, 'remarks', e.target.value)}
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

      {/* ADMIN & CLASS TEACHER REPORTS TAB */}
      {canManageItems && activeTab === 'reports' && (
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
                  <option value="ALL">All Allowed Classes</option>
                  {reportClassesScope.map(c => <option key={c} value={c}>{c}</option>)}
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
                  {reportClassesScope.map(cls => {
                    const list = allowedStudents.filter(s => s.class_name === cls);
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
                    <th style={{ border: '1px solid #e2e8f0', padding: 8 }}>Applicable</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#15803d' }}>Cleared</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#b45309' }}>Pending</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: 8, color: '#dc2626' }}>Pending Due (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsList.map(it => {
                    const scoped = allowedStudents.filter(s =>
                      (reportClass === 'ALL' || s.class_name === reportClass) &&
                      (it.is_common || (it.target_classes || []).includes(s.class_name))
                    );
                    if (scoped.length === 0) return null;
                    let clr = 0, due = 0;
                    scoped.forEach(s => {
                      const c = getItemRec(s.adm_key, it.name, s.class_name);
                      if (c.is_cleared) clr++;
                      else due += Number(c.amount_due) || 0;
                    });
                    return (
                      <tr key={it.name}>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, fontWeight: 700 }}>{it.name}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{scoped.length}</td>
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
            const list = allowedStudents.filter(s => (reportClass === 'ALL' || s.class_name === reportClass) && getStats(s).isApproved);
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
            const list = allowedStudents.filter(s => (reportClass === 'ALL' || s.class_name === reportClass) && getStats(s).totalDue > 0)
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
                          {getStudentAllItems(s).filter(it => !getItemRec(s.adm_key, it.name, s.class_name).is_cleared && Number(getItemRec(s.adm_key, it.name, s.class_name).amount_due) > 0).map(it => `${it.name}: ₹${getItemRec(s.adm_key, it.name, s.class_name).amount_due}`).join(' | ')}
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
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Assign Clearance Access to Staff</h3>
            <select value={editStaffId} onChange={e => selectStaffToEdit(e.target.value)} required style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
              <option value="">-- Select Staff Member --</option>
              {staffList.map(st => <option key={st.staff_id} value={st.staff_id}>{st.name}</option>)}
            </select>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                <span>Clearance Items ({editItems.length}/{itemsList.length})</span>
                <button type="button" onClick={() => setEditItems(editItems.length === itemsList.length ? [] : itemsList.map(i => i.name))} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Select / Clear All</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                {itemsList.map(it => (
                  <label key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editItems.includes(it.name)} onChange={e => setEditItems(prev => e.target.checked ? [...prev, it.name] : prev.filter(x => x !== it.name))} />
                    <span>{it.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                <span>Assign Classes (Class Teacher gets full control for selected classes)</span>
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
