import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Award, ClipboardList, GraduationCap, LayoutDashboard,
  Plus, Gift, BarChart3, Download, Search, Printer, Trash2, RefreshCw, Zap, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const CYCLE = '2026-2027';
const WORK_SHARE = 0.5;
const BONUS_SUB = 'AL6';
const BONUS_CAP = 10;

const RAW_DOMAINS = [
  { code: 'D1', name: 'Teaching, Learning & Learner Achievement', weight: 25, color: '#2563eb', subs: [
    ['T1', 'Curriculum & Lesson Planning', 4], ['T2', 'Subject Knowledge & Academic Preparation', 4], ['T3', 'Pedagogical Practice & Classroom Teaching', 5],
    ['T4', 'Learner Engagement & Classroom Environment', 4], ['T5', 'Assessment, Feedback & Remediation (CCE)', 4], ['T6', 'Learner Progress & Achievement', 4]] },
  { code: 'D2', name: 'Student Mentoring, Wellbeing & Holistic Development', weight: 15, color: '#7c3aed', subs: [
    ['M1', 'Knowing & Understanding Students', 3], ['M2', 'Mentor–Student Relationship & Engagement', 3], ['M3', 'Holistic Student Development', 3],
    ['M4', 'Wellbeing, Care & Early Identification', 2], ['M5', 'Guidance, Intervention & Follow-up', 2], ['M6', 'Documentation, Reflection & Impact', 2]] },
  { code: 'D3', name: 'Campus Engagement & Institutional Responsibilities', weight: 15, color: '#d97706', subs: [
    ['C1', 'Weekly Duties', 3], ['C2', 'Preparation / Dars Monitoring', 3], ['C3', 'Special Task / In-Charge Responsibility', 3],
    ['C4', 'Programmes & Institutional Activities', 2], ['C5', 'Coordination & Collective Responsibility', 2], ['C6', 'Initiative & Improvement', 2]] },
  { code: 'D4', name: 'Collaboration, Communication & Campus Community', weight: 10, color: '#0d9488', subs: [
    ['CO1', 'Collegial Collaboration & Teamwork', 2], ['CO2', 'Communication & Information Sharing', 2], ['CO3', 'Professional Relationships & Campus Conduct', 2],
    ['CO4', 'Conflict Management & Constructive Interaction', 2], ['CO5', 'Institutional Community & Collective Culture', 2]] },
  { code: 'D5', name: 'Personal & Professional Development, TPD & Research', weight: 10, color: '#db2777', subs: [
    ['PD1', 'Participation & Engagement in DH TPD', 2], ['PD2', 'Response to TPD & Application of Learning', 2], ['PD3', 'Continuous Personal & Professional Learning', 2],
    ['PD4', 'Research, Writing & Knowledge Contribution', 2], ['PD5', 'Reflection, Innovation & Professional Growth', 2]] },
  { code: 'D6', name: 'Professionalism, Reliability & Institutional Responsibility', weight: 15, color: '#16a34a', subs: [
    ['PR1', 'Attendance, Presence & Time Management', 3], ['PR2', 'Punctuality & Timeliness of Duties', 3], ['PR3', 'Dress Code & Institutional Standards', 2],
    ['PR4', 'Code of Conduct & Professional Ethics', 3], ['PR5', 'HR & Institutional Procedure Compliance', 2], ['PR6', 'Reliability, Accountability & Responsibility', 2]] },
  { code: 'D7', name: 'Academic Leadership, Governance & Institutional Contribution', weight: 10, color: '#4f46e5', subs: [
    ['AL1', 'Academic Committee & Governance Participation', 2], ['AL2', 'Curriculum Development & Academic Planning', 2], ['AL3', 'Academic Decision-Making & Policy Contribution', 2],
    ['AL4', 'Academic Leadership & Institutional Initiatives', 2], ['AL5', 'Special Academic Contribution', 2], ['AL6', 'Bonus Points & Special Achievements', 2]] }
];

const DOMAINS = RAW_DOMAINS.map(d => ({ ...d, subs: d.subs.map(([code, name, weight]) => ({ code, name, weight, domain: d.code, color: d.color })) }));
const SUBS = DOMAINS.flatMap(d => d.subs);
const SUB = Object.fromEntries(SUBS.map(s => [s.code, s]));
const RATING_LABEL = { 5: 'Exceptional', 4: 'Strong', 3: 'Expected', 2: 'Developing', 1: 'Unsatisfactory', 0: 'N/A' };

const KINDS = {
  cce: { label: 'CCE Works', one: 'CCE', def: 'T5' },
  midterm: { label: 'Midterm Exams', one: 'Midterm', def: 'T5' },
  lesson: { label: 'Lesson Plans', one: 'Lesson Plan', def: 'T1' },
  duty: { label: 'Weekly Duties', one: 'Duty', def: 'C1' },
  task: { label: 'Special Tasks', one: 'Task', def: 'AL4' }
};

const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const lastDayOf = (month) => { const [y, m] = month.split('-').map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

function downloadCSV(filename, headers, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function workMap(items, today = todayStr()) {
  const m = {};
  (items || []).forEach(i => {
    if (!i.sub_code || i.status === 'Submitted') return;
    const done = i.status === 'Completed';
    const pastDue = i.due_date && i.due_date < today;
    if (!done && !pastDue) return;
    const e = (m[i.sub_code] = m[i.sub_code] || { assigned: 0, earned: 0, n: 0, done: 0 });
    const max = Number(i.marks) || 0;
    e.assigned += max; e.n++;
    if (done) { e.earned += Math.min(max, Number(i.awarded ?? i.marks) || 0); e.done++; }
  });
  return m;
}

function withBonus(wm, entries) {
  const newWm = { ...wm };
  (entries || []).filter(e => e.status === 'Approved').forEach(e => {
    const sub = e.sub_code || BONUS_SUB;
    const pts = Number(e.points_approved) || 0;
    if (pts <= 0) return;
    if (!newWm[sub]) newWm[sub] = { assigned: BONUS_CAP, earned: 0, n: 0, done: 0, bonus: 0 };
    newWm[sub].assigned = Math.max(newWm[sub].assigned, BONUS_CAP);
    newWm[sub].earned = Math.min(newWm[sub].assigned, newWm[sub].earned + pts);
    newWm[sub].bonus = (newWm[sub].bonus || 0) + pts;
    newWm[sub].n += 1;
    newWm[sub].done += 1;
  });
  return newWm;
}

function computeScores(ratings, work) {
  const subs = {}; const per = {}; let sum = 0, max = 0, totalExtraPoints = 0;
  DOMAINS.forEach(d => {
    let dEarn = 0, dExcluded = 0;
    d.subs.forEach(s => {
      const r = ratings[s.code]; const wk = work[s.code];
      const rp = r >= 1 ? r / 5 : null;
      let wp = null, extraPoints = 0;
      if (wk && wk.assigned > 0) {
        wp = Math.min(1, wk.earned / wk.assigned);
        if (wk.earned >= wk.assigned && wk.done > 1) { extraPoints = (wk.done - 1) * 2; totalExtraPoints += extraPoints; }
      } else if (wk && wk.earned > 0) {
        wp = 1;
        if (wk.done > 1) { extraPoints = (wk.done - 1) * 2; totalExtraPoints += extraPoints; }
      }
      if (r === 0 && wp === null) { subs[s.code] = { na: true, score: 0, extraPoints: 0 }; dExcluded += s.weight; return; }
      let pct = 0;
      if (rp !== null && wp !== null) pct = WORK_SHARE * wp + (1 - WORK_SHARE) * rp;
      else if (wp !== null) pct = wp;
      else if (rp !== null) pct = rp;
      subs[s.code] = { na: false, score: pct * s.weight, pct, extraPoints };
      dEarn += pct * s.weight;
    });
    const dMax = Math.max(0, d.weight - dExcluded);
    if (!dMax) per[d.code] = { na: true, score: 0, max: 0 };
    else { const sc = Math.min(dMax, dEarn); per[d.code] = { na: false, score: sc, max: dMax }; sum += sc; max += dMax; }
  });
  const baseScore = max ? (sum / max) * 100 : 0;
  return { subs, per, total: Math.min(100, baseScore + totalExtraPoints), baseScore, totalExtraPoints };
}

export default function StaffAppraisalModule({ onBack, user }) {
  const role = String(user?.role || 'teacher').toLowerCase();
  const isAdmin = role === 'admin' || role === 'principal';
  const isCoordinator = role === 'coordinator';
  const canManage = isAdmin || isCoordinator;
  const isRater = isAdmin || role === 'appraisal_authority';
  const myStaffId = String(user?.staff_id || user?.id || '').trim();

  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [staffList, setStaffList] = useState([]);
  const [workItems, setWorkItems] = useState([]);
  const [bonusRows, setBonusRows] = useState([]);
  const [appraisals, setAppraisals] = useState([]);
  const [subAssignments, setSubAssignments] = useState([]);

  // Leaderboard modal
  const [breakdownStaff, setBreakdownStaff] = useState(null);
  const [lbSearch, setLbSearch] = useState('');

  // Work tab state
  const [workKind, setWorkKind] = useState('cce');
  const [workSearch, setWorkSearch] = useState('');
  const [workStatusF, setWorkStatusF] = useState('all');
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWork, setNewWork] = useState({ title: '', staff_id: 'ALL', sub_code: 'T5', marks: 2, due_date: lastDayOf(todayStr().slice(0, 7)), late_pct: 50, month: todayStr().slice(0, 7) });
  const [syncingExams, setSyncingExams] = useState(false);

  // Bonus tab state
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusForm, setBonusForm] = useState({ staff_id: myStaffId, title: '', reason: '', sub_code: BONUS_SUB, points: 2, mode: 'request' });

  // Appraisal Scoring tab state
  const [selectedStaffId, setSelectedStaffId] = useState(isRater ? '' : myStaffId);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [remarks, setRemarks] = useState('');
  const [openDomains, setOpenDomains] = useState({ D1: true });
  const [savingAppr, setSavingAppr] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [stRes, wkRes, bpRes, apRes, saRes] = await Promise.all([
      supabase.from('staff').select('staff_id, name, department, designation, role').order('name').limit(500),
      supabase.from('appraisal_work_items').select('*').eq('cycle', CYCLE).order('due_date', { ascending: false }).limit(5000),
      supabase.from('appraisal_bonus_points').select('*').eq('cycle', CYCLE).order('created_at', { ascending: false }).limit(2000),
      supabase.from('staff_appraisals_v2').select('*, staff_appraisal_ratings(*)').eq('cycle', CYCLE).limit(500),
      supabase.from('subject_assignments').select('*').limit(1000)
    ]);
    setStaffList((stRes.data || []).map(s => ({ ...s, id: String(s.staff_id).trim() })));
    setWorkItems(wkRes.data || []);
    setBonusRows(bpRes.data || []);
    setAppraisals(apRes.data || []);
    setSubAssignments(saRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const staffMap = useMemo(() => Object.fromEntries(staffList.map(s => [s.id, s])), [staffList]);

  // Compute live scores for every staff member
  const leaderboard = useMemo(() => {
    const list = staffList.map(s => {
      const a = appraisals.find(x => String(x.staff_id) === s.id);
      const rm = {};
      let hasRatings = false;
      if (a && (isRater || a.status === 'Approved')) {
        (a.staff_appraisal_ratings || []).forEach(r => {
          if (r.rating !== null && r.rating !== undefined) { rm[r.sub_code] = r.rating; hasRatings = true; }
        });
      }
      const myWorks = workItems.filter(w => String(w.staff_id) === s.id);
      const myBonus = bonusRows.filter(b => String(b.staff_id) === s.id);
      const wm = withBonus(workMap(myWorks), myBonus);
      const computed = (a?.status === 'Approved' && !hasRatings)
        ? { total: Number(a.final_score) || 0, baseScore: Number(a.final_score) || 0, totalExtraPoints: 0, per: {}, subs: {} }
        : computeScores(rm, wm);
      return {
        ...s,
        appraisal: a || null,
        works: myWorks,
        bonus: myBonus,
        breakdown: computed,
        score: Math.min(100, computed.total),
        finalised: a?.status === 'Approved'
      };
    });
    list.sort((a, b) => b.score - a.score);
    list.forEach((x, i) => { x.rank = i + 1; });
    return list;
  }, [staffList, workItems, bonusRows, appraisals, isRater]);

  // Load selected staff into Appraisal Scoring form
  useEffect(() => {
    if (!selectedStaffId) return;
    const a = appraisals.find(x => String(x.staff_id) === String(selectedStaffId));
    const R = {}, C = {};
    (a?.staff_appraisal_ratings || []).forEach(r => {
      if (r.rating !== null && r.rating !== undefined) R[r.sub_code] = r.rating;
      C[r.sub_code] = r.reviewer_comment || '';
    });
    setRatings(R);
    setComments(C);
    setRemarks(a?.authority_remarks || '');
  }, [selectedStaffId, appraisals]);

  // AUTO-SYNC CCE/MIDTERM FROM EXAMS MODULE (marks + subject_assignments)
  async function syncFromExamsModule() {
    setSyncingExams(true);
    try {
      const { data: marksData, error } = await supabase
        .from('marks')
        .select('class_name, subject, updated_at, created_at')
        .limit(10000);
      if (error) throw error;

      // Build map of class|subject -> latest mark entry date
      const enteredMap = {};
      (marksData || []).forEach(m => {
        const key = `${String(m.class_name || '').trim().toUpperCase()}|${String(m.subject || '').trim().toUpperCase()}`;
        const dt = String(m.updated_at || m.created_at || todayStr()).slice(0, 10);
        if (!enteredMap[key] || dt > enteredMap[key]) enteredMap[key] = dt;
      });

      const pendingExamWorks = workItems.filter(w => (w.kind === 'cce' || w.kind === 'midterm') && w.status !== 'Completed');
      let updatedCount = 0;

      for (const w of pendingExamWorks) {
        // Match by class_name + subject_name OR by teacher's subject_assignments
        const teacherSubs = subAssignments.filter(sa =>
          String(sa.staff_id || sa.teacher_id || '').trim() === String(w.staff_id) ||
          String(sa.teacher_name || '').trim().toLowerCase() === String(staffMap[w.staff_id]?.name || '').trim().toLowerCase()
        );
        let matchedDate = null;
        if (w.class_name && w.subject_name) {
          matchedDate = enteredMap[`${w.class_name.toUpperCase()}|${w.subject_name.toUpperCase()}`];
        }
        if (!matchedDate && teacherSubs.length > 0) {
          for (const sa of teacherSubs) {
            const k = `${String(sa.class_name || '').trim().toUpperCase()}|${String(sa.subject || sa.subject_name || '').trim().toUpperCase()}`;
            if (enteredMap[k] && (!w.subject_name || String(sa.subject || sa.subject_name || '').toLowerCase().includes(w.subject_name.toLowerCase()))) {
              matchedDate = enteredMap[k];
              break;
            }
          }
        }

        if (matchedDate) {
          const isLate = Boolean(w.due_date && matchedDate > w.due_date);
          const awarded = isLate ? Math.round((Number(w.marks) * Number(w.late_pct ?? 50) / 100) * 100) / 100 : Number(w.marks);
          await supabase.from('appraisal_work_items').update({
            status: 'Completed',
            submitted_on: matchedDate,
            awarded,
            submission_note: 'Auto-verified from Exams Module'
          }).eq('id', w.id);
          updatedCount++;
        }
      }

      setMsg(updatedCount > 0
        ? `Auto-synced ${updatedCount} CCE/Midterm works from Exams Module!`
        : 'Checked Exams Module: No new completed pending works found.');
      if (updatedCount > 0) loadAll();
    } catch (err) {
      setMsg('Sync error: ' + err.message);
    } finally {
      setSyncingExams(false);
    }
  }

  // Generate CCE/Midterm works directly from subject_assignments
  async function generateFromAssignments() {
    if (!subAssignments.length) return setMsg('No subject assignments found in Exams module.');
    const month = newWork.month || todayStr().slice(0, 7);
    const due = newWork.due_date || lastDayOf(month);
    if (!window.confirm(`Generate ${KINDS[workKind].one} works for ${subAssignments.length} assigned subjects (Deadline: ${due})?`)) return;

    const existingKeys = new Set(workItems.filter(w => w.kind === workKind && w.month === month).map(w => `${w.staff_id}|${w.class_name}|${w.subject_name}`));
    const rows = [];
    subAssignments.forEach(sa => {
      const sid = String(sa.staff_id || sa.teacher_id || '').trim() ||
        staffList.find(st => st.name.toLowerCase() === String(sa.teacher_name || '').trim().toLowerCase())?.id;
      const subName = String(sa.subject || sa.subject_name || '').trim();
      const clsName = String(sa.class_name || '').trim();
      if (!sid || !subName) return;
      if (existingKeys.has(`${sid}|${clsName}|${subName}`)) return;
      rows.push({
        cycle: CYCLE,
        kind: workKind,
        staff_id: sid,
        title: `${KINDS[workKind].one} – ${subName} (${clsName}) – ${month}`,
        subject_name: subName,
        class_name: clsName,
        month,
        domain_code: SUB[newWork.sub_code]?.domain || 'D1',
        sub_code: newWork.sub_code || 'T5',
        marks: Number(newWork.marks) || 2,
        late_pct: Number(newWork.late_pct) || 50,
        due_date: due,
        status: 'Pending',
        created_by: myStaffId
      });
    });
    if (!rows.length) return setMsg('All assigned subjects already have works for this month.');
    const { error } = await supabase.from('appraisal_work_items').insert(rows);
    if (error) setMsg('Error: ' + error.message);
    else { setMsg(`Generated ${rows.length} ${KINDS[workKind].one} works!`); setShowAddWork(false); loadAll(); }
  }

  async function saveNewWork(e) {
    e.preventDefault();
    const targets = newWork.staff_id === 'ALL' ? staffList.map(s => s.id) : [newWork.staff_id];
    const rows = targets.map(sid => ({
      cycle: CYCLE,
      kind: workKind,
      staff_id: sid,
      title: newWork.title.trim(),
      month: newWork.month || todayStr().slice(0, 7),
      domain_code: SUB[newWork.sub_code]?.domain || 'D1',
      sub_code: newWork.sub_code,
      marks: Number(newWork.marks) || 1,
      late_pct: Number(newWork.late_pct) || 50,
      due_date: newWork.due_date || null,
      status: 'Pending',
      created_by: myStaffId
    }));
    const { error } = await supabase.from('appraisal_work_items').insert(rows);
    if (error) setMsg('Error: ' + error.message);
    else { setMsg(`Assigned to ${rows.length} staff!`); setShowAddWork(false); setNewWork(w => ({ ...w, title: '' })); loadAll(); }
  }

  async function updateWorkStatus(w, nextStatus, extra = {}) {
    const { error } = await supabase.from('appraisal_work_items').update({ status: nextStatus, ...extra }).eq('id', w.id);
    if (error) setMsg('Error: ' + error.message);
    else loadAll();
  }

  async function saveBonus(e) {
    e.preventDefault();
    const isAward = bonusForm.mode === 'award' && canManage;
    const pts = Number(bonusForm.points) || 0;
    if (pts <= 0) return;
    const payload = {
      cycle: CYCLE,
      staff_id: isAward ? bonusForm.staff_id : myStaffId,
      title: bonusForm.title.trim(),
      reason: bonusForm.reason.trim(),
      domain_code: SUB[bonusForm.sub_code]?.domain || 'D7',
      sub_code: bonusForm.sub_code,
      points_requested: pts,
      points_approved: isAward ? pts : 0,
      status: isAward ? 'Approved' : 'Pending'
    };
    const { error } = await supabase.from('appraisal_bonus_points').insert([payload]);
    if (error) setMsg('Error: ' + error.message);
    else { setMsg(isAward ? 'Bonus points awarded!' : 'Bonus request submitted!'); setShowBonusModal(false); loadAll(); }
  }

  async function saveAppraisal(newStatus) {
    if (!selectedStaffId) return;
    setSavingAppr(true);
    try {
      const myWorks = workItems.filter(w => String(w.staff_id) === String(selectedStaffId));
      const myBonus = bonusRows.filter(b => String(b.staff_id) === String(selectedStaffId));
      const computed = computeScores(ratings, withBonus(workMap(myWorks), myBonus));

      const { data: ap, error } = await supabase.from('staff_appraisals_v2').upsert({
        staff_id: String(selectedStaffId),
        cycle: CYCLE,
        status: newStatus,
        final_score: Number(computed.total.toFixed(2)),
        authority_remarks: remarks || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'staff_id,cycle' }).select().single();
      if (error) throw error;

      const ratingRows = SUBS.map(s => ({
        appraisal_id: ap.id,
        domain_code: s.domain,
        sub_code: s.code,
        rating: ratings[s.code] ?? null,
        reviewer_comment: comments[s.code] || ''
      }));
      const { error: e2 } = await supabase.from('staff_appraisal_ratings').upsert(ratingRows, { onConflict: 'appraisal_id,sub_code' });
      if (e2) throw e2;

      setMsg(newStatus === 'Approved' ? 'Appraisal Finalised & Locked!' : 'Draft saved!');
      loadAll();
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSavingAppr(false);
    }
  }

  const today = todayStr();
  const visibleWorks = workItems.filter(w => {
    if (!canManage && String(w.staff_id) !== myStaffId) return false;
    if (w.kind !== workKind) return false;
    if (workStatusF !== 'all' && w.status !== workStatusF) return false;
    const q = workSearch.trim().toLowerCase();
    if (q && !`${w.title} ${staffMap[w.staff_id]?.name || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const selectedApprRec = appraisals.find(a => String(a.staff_id) === String(selectedStaffId));
  const isLocked = selectedApprRec?.status === 'Approved';
  const canRateNow = isRater && !isLocked;
  const selectedComputed = useMemo(() => {
    if (!selectedStaffId) return null;
    const myWorks = workItems.filter(w => String(w.staff_id) === String(selectedStaffId));
    const myBonus = bonusRows.filter(b => String(b.staff_id) === String(selectedStaffId));
    return computeScores(isRater || isLocked ? ratings : {}, withBonus(workMap(myWorks), myBonus));
  }, [selectedStaffId, ratings, workItems, bonusRows, isRater, isLocked]);

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: 14, paddingBottom: 50 }}>
      {/* Top Bar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 12 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Staff Appraisal System</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>Cycle {CYCLE} • 7 Policy Domains (100 Marks) • {user?.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#e2e8f0', padding: 3, borderRadius: 10, gap: 3, flexWrap: 'wrap' }}>
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'leaderboard', label: 'Leaderboard', icon: Award },
              { id: 'work', label: 'Work & CCE', icon: ClipboardList },
              { id: 'bonus', label: 'Bonus Points', icon: Gift },
              { id: 'appraisal', label: 'Scoring', icon: GraduationCap },
              ...(canManage ? [{ id: 'reports', label: 'Reports', icon: BarChart3 }] : [])
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#1d4ed8' : '#475569' }}>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={loadAll} style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={13} /> Sync
          </button>
        </div>
      </div>

      {msg && (
        <div className="no-print" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, color: '#065f46' }}>✕</button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading appraisal data...</div> : (
        <>
          {/* 1. DASHBOARD */}
          {tab === 'dashboard' && (() => {
            const scopedWorks = canManage ? workItems : workItems.filter(w => String(w.staff_id) === myStaffId);
            const pending = scopedWorks.filter(w => w.status === 'Pending').length;
            const submitted = scopedWorks.filter(w => w.status === 'Submitted').length;
            const completed = scopedWorks.filter(w => w.status === 'Completed').length;
            const overdue = scopedWorks.filter(w => w.status === 'Pending' && w.due_date && w.due_date < today).length;
            const approvedApprs = appraisals.filter(a => a.status === 'Approved').length;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <div style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Active Staff</div><div style={{ fontSize: 24, fontWeight: 800 }}>{staffList.length}</div></div>
                  <div onClick={() => setTab('work')} style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #fde68a', cursor: 'pointer' }}><div style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>Pending Works</div><div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{pending}</div>{overdue > 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>{overdue} overdue</div>}</div>
                  <div onClick={() => setTab('work')} style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #ddd6fe', cursor: 'pointer' }}><div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 700 }}>Awaiting Approval</div><div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>{submitted}</div></div>
                  <div style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #bbf7d0' }}><div style={{ fontSize: 11, color: '#15803d', fontWeight: 700 }}>Completed Works</div><div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{completed}</div></div>
                  <div onClick={() => setTab('appraisal')} style={{ background: '#fff', padding: 14, borderRadius: 12, border: '1px solid #bfdbfe', cursor: 'pointer' }}><div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>Appraisals Finalised</div><div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{approvedApprs}/{staffList.length}</div></div>
                </div>
                {canManage && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ fontSize: 13, color: '#1e3a8a' }}><b>Exams Module Auto-Sync:</b> Automatically mark teachers' CCE / Midterm works as Completed when marks are entered in Exams.</div>
                    <button disabled={syncingExams} onClick={syncFromExamsModule} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Zap size={14} /> {syncingExams ? 'Syncing...' : 'Sync from Exams Module'}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 2. LIVE LEADERBOARD */}
          {tab === 'leaderboard' && (() => {
            const filtered = leaderboard.filter(s => s.name.toLowerCase().includes(lbSearch.toLowerCase()));
            const top3 = lbSearch ? [] : filtered.slice(0, 3);
            const rest = lbSearch ? filtered : filtered.slice(3);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <input value={lbSearch} onChange={e => setLbSearch(e.target.value)} placeholder="Search staff..." style={{ flex: '1 1 200px', padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', fontSize: 13 }} />
                  <button onClick={() => downloadCSV(`Staff_Leaderboard_${CYCLE}.csv`, ['Rank', 'Name', 'Department', 'Score'], filtered.map(r => [r.rank, r.name, r.department || '-', r.score.toFixed(2)]))} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Download size={14} /> Export CSV
                  </button>
                </div>

                {top3.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                    {top3.map((p, idx) => {
                      const medals = ['🥇 Rank #1', '🥈 Rank #2', '🥉 Rank #3'];
                      const borders = ['#f59e0b', '#94a3b8', '#d97706'];
                      return (
                        <div key={p.id} onClick={() => setBreakdownStaff(p)} style={{ background: '#fff', border: `2px solid ${borders[idx]}`, borderRadius: 16, padding: 18, width: 220, textAlign: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: borders[idx], marginBottom: 8 }}>{medals[idx]}</div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>{p.department || 'Faculty'}</div>
                          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>{p.score.toFixed(1)}<span style={{ fontSize: 12, color: '#94a3b8' }}>/100</span></div>
                          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>Click for breakdown →</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {rest.map(r => (
                    <div key={r.id} onClick={() => setBreakdownStaff(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, border: r.id === myStaffId ? '2px solid #2563eb' : '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Rank #{r.rank} • {r.department || 'Faculty'}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 17, color: '#2563eb' }}>{r.score.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* SCORE BREAKDOWN MODAL */}
          {breakdownStaff && (
            <div onClick={() => setBreakdownStaff(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 14 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 18, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Score Breakdown: {breakdownStaff.name}</h3>
                  <button onClick={() => setBreakdownStaff(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14, textAlign: 'center' }}>
                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8 }}><div style={{ fontSize: 11, color: '#64748b' }}>Base Score</div><b>{(breakdownStaff.breakdown.baseScore || 0).toFixed(2)}</b></div>
                  <div style={{ background: '#ecfdf5', padding: 10, borderRadius: 8 }}><div style={{ fontSize: 11, color: '#047857' }}>Extra Points</div><b style={{ color: '#059669' }}>+{(breakdownStaff.breakdown.totalExtraPoints || 0).toFixed(1)}</b></div>
                  <div style={{ background: '#eff6ff', padding: 10, borderRadius: 8 }}><div style={{ fontSize: 11, color: '#1d4ed8' }}>Final Total</div><b style={{ color: '#2563eb' }}>{breakdownStaff.score.toFixed(2)} / 100</b></div>
                </div>
                {DOMAINS.map(d => {
                  const pd = breakdownStaff.breakdown.per?.[d.code];
                  return (
                    <div key={d.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                      <span><b style={{ color: d.color }}>{d.code}</b> {d.name}</span>
                      <b>{!pd || pd.na ? 'N/A' : `${pd.score.toFixed(1)} / ${pd.max}`}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. WORK & CCE TAB */}
          {tab === 'work' && (
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(KINDS).map(([k, v]) => (
                    <button key={k} onClick={() => { setWorkKind(k); setNewWork(nw => ({ ...nw, sub_code: v.def })); }} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: workKind === k ? '#2563eb' : '#f1f5f9', color: workKind === k ? '#fff' : '#334155' }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(workKind === 'cce' || workKind === 'midterm') && (
                      <button disabled={syncingExams} onClick={syncFromExamsModule} style={{ padding: '7px 11px', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Zap size={14} /> {syncingExams ? 'Syncing...' : 'Auto-Sync Exams'}
                      </button>
                    )}
                    <button onClick={() => setShowAddWork(true)} style={{ padding: '7px 11px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Plus size={14} /> Assign {KINDS[workKind].one}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={workSearch} onChange={e => setWorkSearch(e.target.value)} placeholder="Search work or staff..." style={{ flex: '1 1 180px', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
                <select value={workStatusF} onChange={e => setWorkStatusF(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}>
                  <option value="all">All Status</option><option>Pending</option><option>Submitted</option><option>Completed</option>
                </select>
              </div>

              {showAddWork && (
                <form onSubmit={saveNewWork} style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: 13 }}>Assign {KINDS[workKind].one}</b>
                    {(workKind === 'cce' || workKind === 'midterm') && (
                      <button type="button" onClick={generateFromAssignments} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                        ⚡ Auto-Generate for All Assigned Subjects ({subAssignments.length})
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                    <input required placeholder="Work Title" value={newWork.title} onChange={e => setNewWork({ ...newWork, title: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                    <select value={newWork.staff_id} onChange={e => setNewWork({ ...newWork, staff_id: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                      <option value="ALL">All Staff ({staffList.length})</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={newWork.sub_code} onChange={e => setNewWork({ ...newWork, sub_code: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                      {SUBS.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
                    </select>
                    <input type="number" step="0.5" value={newWork.marks} onChange={e => setNewWork({ ...newWork, marks: e.target.value })} placeholder="Points" style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                    <input type="date" value={newWork.due_date} onChange={e => setNewWork({ ...newWork, due_date: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Assign Work</button>
                    <button type="button" onClick={() => setShowAddWork(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {canManage && <th style={{ padding: 8, textAlign: 'left' }}>Staff</th>}
                      <th style={{ padding: 8, textAlign: 'left' }}>Work</th>
                      <th style={{ padding: 8 }}>Sub</th>
                      <th style={{ padding: 8 }}>Deadline</th>
                      <th style={{ padding: 8 }}>Points</th>
                      <th style={{ padding: 8 }}>Status</th>
                      <th style={{ padding: 8 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorks.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {canManage && <td style={{ padding: 8, fontWeight: 600 }}>{staffMap[w.staff_id]?.name || w.staff_id}</td>}
                        <td style={{ padding: 8 }}>
                          <b>{w.title}</b>
                          {w.submission_note && <div style={{ fontSize: 11, color: '#0d9488' }}>{w.submission_note}</div>}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}><span style={{ background: SUB[w.sub_code]?.color || '#64748b', color: '#fff', padding: '2px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 700 }}>{w.sub_code}</span></td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{fmtDate(w.due_date)}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 700 }}>{w.status === 'Completed' ? `${w.awarded ?? w.marks}/${w.marks}` : w.marks}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 700, color: w.status === 'Completed' ? '#16a34a' : w.status === 'Submitted' ? '#7c3aed' : '#d97706' }}>{w.status}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                            {String(w.staff_id) === myStaffId && w.status === 'Pending' && (
                              <button onClick={() => updateWorkStatus(w, 'Submitted', { submitted_on: today })} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Submit</button>
                            )}
                            {canManage && w.status !== 'Completed' && (
                              <button onClick={() => {
                                const isLate = Boolean(w.due_date && (w.submitted_on || today) > w.due_date);
                                const pts = isLate ? Math.round((Number(w.marks) * Number(w.late_pct ?? 50) / 100) * 100) / 100 : Number(w.marks);
                                updateWorkStatus(w, 'Completed', { awarded: pts, submitted_on: w.submitted_on || today });
                              }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                            )}
                            {canManage && (
                              <button onClick={async () => { if (window.confirm('Delete work?')) { await supabase.from('appraisal_work_items').delete().eq('id', w.id); loadAll(); } }} style={{ padding: 4, borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. BONUS POINTS TAB */}
          {tab === 'bonus' && (
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12.5, color: '#64748b' }}>{BONUS_CAP} approved bonus points = full marks for the selected sub-domain.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setBonusForm({ staff_id: myStaffId, title: '', reason: '', sub_code: BONUS_SUB, points: 2, mode: 'request' }); setShowBonusModal(true); }} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+ Request Points</button>
                  {canManage && <button onClick={() => { setBonusForm({ staff_id: staffList[0]?.id || '', title: '', reason: '', sub_code: BONUS_SUB, points: 2, mode: 'award' }); setShowBonusModal(true); }} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🎁 Award Points</button>}
                </div>
              </div>

              {showBonusModal && (
                <form onSubmit={saveBonus} style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  {bonusForm.mode === 'award' && (
                    <select value={bonusForm.staff_id} onChange={e => setBonusForm({ ...bonusForm, staff_id: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  <input required placeholder="Achievement / Title" value={bonusForm.title} onChange={e => setBonusForm({ ...bonusForm, title: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                  <select value={bonusForm.sub_code} onChange={e => setBonusForm({ ...bonusForm, sub_code: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }}>
                    {SUBS.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
                  </select>
                  <input required type="number" step="0.5" placeholder="Points" value={bonusForm.points} onChange={e => setBonusForm({ ...bonusForm, points: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                  <input placeholder="Reason / Details" value={bonusForm.reason} onChange={e => setBonusForm({ ...bonusForm, reason: e.target.value })} style={{ padding: 8, borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="submit" style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                    <button type="button" onClick={() => setShowBonusModal(false)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </form>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}><th style={{ padding: 8, textAlign: 'left' }}>Staff</th><th style={{ padding: 8, textAlign: 'left' }}>Title</th><th style={{ padding: 8 }}>Sub</th><th style={{ padding: 8 }}>Points</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Action</th></tr></thead>
                  <tbody>
                    {bonusRows.filter(b => canManage || String(b.staff_id) === myStaffId).map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{staffMap[b.staff_id]?.name || b.staff_id}</td>
                        <td style={{ padding: 8 }}><b>{b.title}</b>{b.reason && <div style={{ fontSize: 11, color: '#64748b' }}>{b.reason}</div>}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{b.sub_code}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 700, color: '#ea580c' }}>+{b.status === 'Approved' ? b.points_approved : b.points_requested}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 700 }}>{b.status}</td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          {canManage && b.status === 'Pending' && (
                            <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                              <button onClick={async () => { await supabase.from('appraisal_bonus_points').update({ status: 'Approved', points_approved: b.points_requested }).eq('id', b.id); loadAll(); }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                              <button onClick={async () => { await supabase.from('appraisal_bonus_points').update({ status: 'Rejected', points_approved: 0 }).eq('id', b.id); loadAll(); }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. APPRAISAL SCORING TAB */}
          {tab === 'appraisal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <select disabled={!isRater} value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 220 }}>
                    <option value="">-- Select Staff Member --</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {selectedStaffId && (
                    <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: isLocked ? '#dcfce7' : '#fef3c7', color: isLocked ? '#15803d' : '#b45309' }}>
                      {isLocked ? '✓ FINALISED' : 'DRAFT'}
                    </span>
                  )}
                </div>
                {selectedStaffId && selectedComputed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="no-print" onClick={() => { const all = {}; DOMAINS.forEach(d => { all[d.code] = true; }); setOpenDomains(all); setTimeout(() => window.print(), 250); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Printer size={14} /> Print
                    </button>
                    <div style={{ background: '#eff6ff', padding: '6px 14px', borderRadius: 10, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700 }}>TOTAL SCORE</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{(isLocked ? Number(selectedApprRec.final_score) : selectedComputed.total).toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </div>

              {selectedStaffId && selectedComputed && DOMAINS.map(d => {
                const pd = selectedComputed.per[d.code];
                const isOpen = !!openDomains[d.code];
                return (
                  <div key={d.code} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div onClick={() => setOpenDomains(o => ({ ...o, [d.code]: !o[d.code] }))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}><span style={{ background: d.color, color: '#fff', padding: '2px 8px', borderRadius: 99, fontSize: 11, marginRight: 8 }}>{d.code}</span>{d.name} {isOpen ? '▲' : '▼'}</div>
                      <b style={{ color: pd.na ? '#94a3b8' : d.color }}>{pd.na ? 'N/A' : `${pd.score.toFixed(1)} / ${pd.max}`}</b>
                    </div>
                    {isOpen && d.subs.map(s => {
                      const x = selectedComputed.subs[s.code];
                      const r = ratings[s.code];
                      return (
                        <div key={s.code} style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9', marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ fontSize: 13 }}><b style={{ color: d.color }}>{s.code}</b> {s.name} <span style={{ fontSize: 11, color: '#64748b' }}>({s.weight}m)</span></div>
                            <b style={{ fontSize: 14 }}>{x.na ? 'N/A' : x.score.toFixed(2)}</b>
                          </div>
                          {(canRateNow || isLocked) && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                              {[1, 2, 3, 4, 5, 0].map(v => (
                                <button key={v} type="button" disabled={!canRateNow} onClick={() => setRatings(p => ({ ...p, [s.code]: r === v && v === 0 ? undefined : v }))} style={{ padding: '4px 9px', borderRadius: 6, border: r === v ? `2px solid ${d.color}` : '1px solid #cbd5e1', background: r === v ? `${d.color}18` : '#fff', color: r === v ? d.color : '#475569', fontWeight: 700, fontSize: 12, cursor: canRateNow ? 'pointer' : 'default' }}>
                                  {v === 0 ? 'N/A' : v}
                                </button>
                              ))}
                              {r >= 1 && <span style={{ fontSize: 11, color: '#64748b' }}>{RATING_LABEL[r]}</span>}
                            </div>
                          )}
                          {canRateNow && (
                            <input placeholder="Comment / evidence (optional)" value={comments[s.code] || ''} onChange={e => setComments(p => ({ ...p, [s.code]: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: 7, marginTop: 6, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {selectedStaffId && canRateNow && (
                <div className="no-print" style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Principal / Authority overall remarks..." style={{ width: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', minHeight: 65, fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button disabled={savingAppr} onClick={() => saveAppraisal('Draft')} style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', background: '#64748b', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Draft</button>
                    <button disabled={savingAppr} onClick={() => { if (window.confirm('Finalise and lock this appraisal?')) saveAppraisal('Approved'); }} style={{ flex: 2, padding: 11, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Finalise & Lock</button>
                  </div>
                </div>
              )}

              {selectedStaffId && isLocked && isAdmin && (
                <div className="no-print" style={{ textAlign: 'center' }}>
                  <button onClick={() => saveAppraisal('Draft')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reopen Appraisal for Editing</button>
                </div>
              )}
            </div>
          )}

          {/* 6. REPORTS TAB */}
          {tab === 'reports' && canManage && (
            <div style={{ background: '#fff', padding: 16, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Domain-wise Score Matrix ({CYCLE})</h3>
                <button onClick={() => downloadCSV(`Appraisal_Matrix_${CYCLE}.csv`, ['Staff', 'Dept', ...DOMAINS.map(d => d.code), 'Total', 'Status'], leaderboard.map(r => [r.name, r.department || '-', ...DOMAINS.map(d => r.breakdown.per?.[d.code]?.na ? 'N/A' : (r.breakdown.per?.[d.code]?.score || 0).toFixed(1)), r.score.toFixed(1), r.finalised ? 'Finalised' : 'Draft']))} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Download size={14} /> Export Matrix CSV
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: 8, textAlign: 'left' }}>Staff</th>
                      {DOMAINS.map(d => <th key={d.code} style={{ padding: 8 }}>{d.code} ({d.weight})</th>)}
                      <th style={{ padding: 8, color: '#2563eb' }}>Total</th>
                      <th style={{ padding: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 8, fontWeight: 700 }}>{r.name}</td>
                        {DOMAINS.map(d => <td key={d.code} style={{ padding: 8, textAlign: 'center' }}>{r.breakdown.per?.[d.code]?.na ? 'N/A' : (r.breakdown.per?.[d.code]?.score || 0).toFixed(1)}</td>)}
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>{r.score.toFixed(1)}</td>
                        <td style={{ padding: 8, textAlign: 'center', fontWeight: 700, color: r.finalised ? '#16a34a' : '#64748b' }}>{r.finalised ? 'Finalised' : 'Draft'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
