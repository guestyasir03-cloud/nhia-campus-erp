import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Download, FileSpreadsheet, Plus,
  ShieldAlert, CheckCircle2, FileText, ClipboardList, BarChart3
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const ACADEMIC_YEAR = '2026-27';

// Official 7-Domain, 100-Mark Framework (Darul Huda Policy)
const DOMAINS = [
  {
    code: 'D1',
    title: 'Teaching, Learning & Learner Achievement',
    weight: 25,
    subdomains: [
      { code: 'T1', title: 'Curriculum & Lesson Planning', weight: 4 },
      { code: 'T2', title: 'Subject Knowledge & Academic Preparation', weight: 3 },
      { code: 'T3', title: 'Pedagogical Practice & Classroom Teaching', weight: 5 },
      { code: 'T4', title: 'Learner Engagement & Classroom Environment', weight: 3 },
      { code: 'T5', title: 'Assessment, Feedback & Remediation (CCE)', weight: 4 },
      { code: 'T6', title: 'Learner Progress & Achievement', weight: 4 },
      { code: 'T7', title: 'Academic Responsibility & Reliability', weight: 2 }
    ]
  },
  {
    code: 'D2',
    title: 'Student Mentoring, Wellbeing & Holistic Development',
    weight: 15,
    subdomains: [
      { code: 'M1', title: 'Knowing & Understanding Students', weight: 3 },
      { code: 'M2', title: 'Mentor-Student Relationship & Engagement', weight: 3 },
      { code: 'M3', title: 'Holistic Student Development', weight: 3 },
      { code: 'M4', title: 'Wellbeing, Care & Early Identification', weight: 2 },
      { code: 'M5', title: 'Guidance, Intervention & Follow-up', weight: 2 },
      { code: 'M6', title: 'Documentation, Reflection & Impact Cases', weight: 2 }
    ]
  },
  {
    code: 'D3',
    title: 'Campus Engagement & Institutional Responsibilities',
    weight: 15,
    subdomains: [
      { code: 'C1', title: 'Weekly Duties', weight: 3 },
      { code: 'C2', title: 'Preparation / Dars Monitoring', weight: 3 },
      { code: 'C3', title: 'Special Task / In-Charge Responsibility', weight: 3 },
      { code: 'C4', title: 'Programmes & Institutional Activities', weight: 2 },
      { code: 'C5', title: 'Coordination & Collective Responsibility', weight: 2 },
      { code: 'C6', title: 'Initiative & Improvement', weight: 2 }
    ]
  },
  {
    code: 'D4',
    title: 'Collaboration, Communication & Campus Community',
    weight: 10,
    subdomains: [
      { code: 'CO1', title: 'Collegial Collaboration & Teamwork', weight: 2 },
      { code: 'CO2', title: 'Communication & Information Sharing', weight: 2 },
      { code: 'CO3', title: 'Professional Relationships & Campus Conduct', weight: 2 },
      { code: 'CO4', title: 'Conflict Management & Constructive Interaction', weight: 2 },
      { code: 'CO5', title: 'Institutional Community & Collective Culture', weight: 2 }
    ]
  },
  {
    code: 'D5',
    title: 'Personal & Professional Development, TPD & Research',
    weight: 10,
    subdomains: [
      { code: 'PD1', title: 'Participation & Engagement in DH TPD', weight: 2 },
      { code: 'PD2', title: 'Response to TPD & Application of Learning', weight: 2 },
      { code: 'PD3', title: 'Continuous Personal & Professional Learning', weight: 2 },
      { code: 'PD4', title: 'Research, Writing & Knowledge Contribution', weight: 2 },
      { code: 'PD5', title: 'Reflection, Innovation & Professional Growth', weight: 2 }
    ]
  },
  {
    code: 'D6',
    title: 'Professionalism, Reliability & Institutional Responsibility',
    weight: 15,
    subdomains: [
      { code: 'PR1', title: 'Attendance, Presence & Time Management', weight: 3 },
      { code: 'PR2', title: 'Punctuality & Timeliness of Duties', weight: 3 },
      { code: 'PR3', title: 'Dress Code & Institutional Standards', weight: 2 },
      { code: 'PR4', title: 'Code of Conduct & Professional Ethics', weight: 3 },
      { code: 'PR5', title: 'HR & Institutional Procedure Compliance', weight: 2 },
      { code: 'PR6', title: 'Reliability, Accountability & Responsibility', weight: 2 }
    ]
  },
  {
    code: 'D7',
    title: 'Academic Leadership, Governance & Institutional Contribution',
    weight: 10,
    subdomains: [
      { code: 'AL1', title: 'Academic Committee & Governance Participation', weight: 2 },
      { code: 'AL2', title: 'Curriculum Development & Academic Planning', weight: 2 },
      { code: 'AL3', title: 'Academic Decision-Making & Policy Contribution', weight: 2 },
      { code: 'AL4', title: 'Academic Leadership & Institutional Initiatives', weight: 2 },
      { code: 'AL5', title: 'Special Academic Contribution (LMS/ERP/Innovation)', weight: 2 }
    ]
  }
];

const EVIDENCE_TYPES = [
  'Direct observation',
  'Documentary records',
  'Outputs / artefacts',
  'Feedback',
  'Impact evidence',
  'Reflection'
];

const SUPPORT_OPTIONS = [
  'Professional training',
  'Mentoring / coaching',
  'Teaching resources',
  'Technology support',
  'Additional academic guidance',
  'Workload / role clarification',
  'Research / PD opportunities'
];

function getPerformanceBand(score) {
  if (score >= 90) return { label: 'Exceptional', bg: '#dcfce7', color: '#15803d' };
  if (score >= 80) return { label: 'Strong', bg: '#dbeafe', color: '#1d4ed8' };
  if (score >= 60) return { label: 'Expected / Effective', bg: '#f1f5f9', color: '#334155' };
  if (score >= 40) return { label: 'Developing', bg: '#fef3c7', color: '#b45309' };
  return { label: 'Unsatisfactory', bg: '#fee2e2', color: '#dc2626' };
}

function calculateScores(ratings) {
  let totalWeighted = 0;
  let totalApplicableWeight = 0;
  const domainScores = {};

  DOMAINS.forEach(d => {
    let dScore = 0;
    let dMax = 0;
    d.subdomains.forEach(s => {
      const entry = ratings[s.code];
      if (!entry || entry.rating === 'NA') return;
      const r = Number(entry.rating) || 0;
      if (r > 0) {
        dScore += (r / 5) * s.weight;
        dMax += s.weight;
      }
    });
    domainScores[d.code] = { score: Number(dScore.toFixed(2)), max: dMax || d.weight };
    totalWeighted += dScore;
    totalApplicableWeight += dMax;
  });

  // Scale to 100 if any subdomain was marked N/A
  const normalizedTotal = totalApplicableWeight > 0
    ? Number(((totalWeighted / totalApplicableWeight) * 100).toFixed(2))
    : 0;

  return { domainScores, rawTotal: Number(totalWeighted.toFixed(2)), normalizedTotal };
}

export default function StaffAppraisalModule({ onBack, user }) {
  const isAuthority = ['admin', 'coordinator', 'appraisal_authority'].includes(user?.role);
  const [tab, setTab] = useState(isAuthority ? 'scorecard' : 'self'); // self | monitoring | scorecard | summary
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState(isAuthority ? '' : String(user?.id || ''));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // 1. Monitoring State
  const [monFreq, setMonFreq] = useState('Weekly');
  const [monDomain, setMonDomain] = useState('D1');
  const [monEvidence, setMonEvidence] = useState('Direct observation');
  const [monConfidence, setMonConfidence] = useState('Moderate');
  const [monNotes, setMonNotes] = useState('');
  const [monSubdomain, setMonSubdomain] = useState('T1');
const [monLevel, setMonLevel] = useState('On Track');
const [monFollowup, setMonFollowup] = useState('');
const [monFilter, setMonFilter] = useState('ALL');
  const [monLogs, setMonLogs] = useState([]);

  // 2. Self-Assessment State (Parts I - XIII)
  const [selfForm, setSelfForm] = useState({
    designation: '', department: '', qualification: '', classes_handled: '',
    teaching_resp: '', admin_resp: '', mentoring_resp: '',
    ach1: '', ach2: '', ach3: '',
    init1_title: '', init1_impact: '', init2_title: '', init2_impact: '',
    tpd_activities: '', tpd_applied: '',
    challenges: '', improvement_areas: '', student_impact: '',
    goal1: '', goal2: '', goal3: '',
    overall_reflection: '', overall_self_rating: '4',
    support_requests: [], declared: false
  });

  // 3. Evaluator Scorecard State
  const [openDomain, setOpenDomain] = useState('D1');
  const [ratings, setRatings] = useState({});
  const [evalConfidence, setEvalConfidence] = useState('Moderate');
  const [conductFlag, setConductFlag] = useState('No critical concern');
  const [reviewerComments, setReviewerComments] = useState('');
  const [committeeRemarks, setCommitteeRemarks] = useState('');
  const [staffResponse, setStaffResponse] = useState('');
  const [appealStatus, setAppealStatus] = useState('None');
  const [devPlan, setDevPlan] = useState([{ priority: '', action: '', support: '', target_date: '' }]);

  // 4. Campus Summary State
  const [summaryRows, setSummaryRows] = useState([]);

  useEffect(() => {
    if (isAuthority) {
      loadStaffList();
    } else if (user?.id) {
      loadStaffAppraisalData(String(user.id));
    }
  }, []);

  async function loadStaffList() {
    const { data } = await supabase.from('staff').select('staff_id, name, role').order('name');
    if (data) setStaffList(data);
  }

  const activeStaffObj = isAuthority
    ? staffList.find(s => String(s.staff_id) === String(selectedStaffId))
    : { staff_id: user?.id, name: user?.name, role: user?.role };

  async function loadStaffAppraisalData(staffId) {
    setSelectedStaffId(staffId);
    setMsg('');
    if (!staffId) return;
    setLoading(true);

    const [{ data: mData }, { data: sData }, { data: eData }] = await Promise.all([
      supabase.from('appraisal_monitoring').select('*').eq('staff_id', staffId).eq('academic_year', ACADEMIC_YEAR).order('created_at', { ascending: false }).limit(40),
      supabase.from('appraisal_self_assessments').select('*').eq('staff_id', staffId).eq('academic_year', ACADEMIC_YEAR).maybeSingle(),
      supabase.from('appraisal_evaluations').select('*').eq('staff_id', staffId).eq('academic_year', ACADEMIC_YEAR).maybeSingle()
    ]);

    setMonLogs(mData || []);

    if (sData?.form_data) {
      setSelfForm(prev => ({ ...prev, ...sData.form_data }));
    } else {
      setSelfForm({
        designation: '', department: '', qualification: '', classes_handled: '',
        teaching_resp: '', admin_resp: '', mentoring_resp: '',
        ach1: '', ach2: '', ach3: '',
        init1_title: '', init1_impact: '', init2_title: '', init2_impact: '',
        tpd_activities: '', tpd_applied: '',
        challenges: '', improvement_areas: '', student_impact: '',
        goal1: '', goal2: '', goal3: '',
        overall_reflection: '', overall_self_rating: '4',
        support_requests: [], declared: false
      });
    }

    if (eData) {
      setRatings(eData.ratings || {});
      setEvalConfidence(eData.evidence_confidence || 'Moderate');
      setConductFlag(eData.conduct_flag || 'No critical concern');
      setReviewerComments(eData.reviewer_comments || '');
      setCommitteeRemarks(eData.committee_remarks || '');
      setStaffResponse(eData.staff_response || '');
      setAppealStatus(eData.appeal_status || 'None');
      setDevPlan(Array.isArray(eData.dev_plan) && eData.dev_plan.length > 0 ? eData.dev_plan : [{ priority: '', action: '', support: '', target_date: '' }]);
    } else {
      setRatings({});
      setEvalConfidence('Moderate');
      setConductFlag('No critical concern');
      setReviewerComments('');
      setCommitteeRemarks('');
      setStaffResponse('');
      setAppealStatus('None');
      setDevPlan([{ priority: '', action: '', support: '', target_date: '' }]);
    }

    setLoading(false);
  }

  // Save Monitoring Log
  async function addMonitoringLog(e) {
  e.preventDefault();
  if (!selectedStaffId || !monNotes.trim()) return alert('Select staff and enter observation notes.');
  setLoading(true);
  setMsg('');

  const { error } = await supabase.from('appraisal_monitoring').insert({
    staff_id: selectedStaffId,
    staff_name: activeStaffObj?.name || 'Staff',
    academic_year: ACADEMIC_YEAR,
    frequency: monFreq,
    domain_code: monDomain,
    subdomain_code: monSubdomain,
    evidence_type: monEvidence,
    confidence: monConfidence,
    response_level: monLevel,
    followup_date: monFollowup || null,
    notes: monNotes.trim(),
    logged_by: user?.name || 'Supervisor'
  });

  setLoading(false);
  if (error) setMsg('Error: ' + error.message);
  else {
    setMonNotes('');
    setMonFollowup('');
    setMsg('Structured monitoring record logged.');
    loadStaffAppraisalData(selectedStaffId);
  }
}

  // Save Self-Assessment
  async function saveSelfAssessment(e) {
    e.preventDefault();
    if (!selfForm.declared) return alert('Please confirm the declaration before submitting.');
    setLoading(true);
    setMsg('');

    const { error } = await supabase.from('appraisal_self_assessments').upsert(
      {
        staff_id: selectedStaffId,
        staff_name: activeStaffObj?.name || user?.name || 'Staff',
        academic_year: ACADEMIC_YEAR,
        form_data: selfForm,
        submitted_at: new Date().toISOString()
      },
      { onConflict: 'staff_id,academic_year' }
    );

    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else setMsg('Self-Assessment & Professional Reflection Form saved.');
  }

  // Save Formal Evaluation Scorecard
  async function saveEvaluation() {
    if (!selectedStaffId) return alert('Select a staff member.');
    setLoading(true);
    setMsg('');

    const { normalizedTotal } = calculateScores(ratings);
    const band = getPerformanceBand(normalizedTotal).label;

    const { error } = await supabase.from('appraisal_evaluations').upsert(
      {
        staff_id: selectedStaffId,
        staff_name: activeStaffObj?.name || 'Staff',
        academic_year: ACADEMIC_YEAR,
        ratings,
        total_score: normalizedTotal,
        performance_band: band,
        evidence_confidence: evalConfidence,
        conduct_flag: conductFlag,
        dev_plan: devPlan,
        reviewer_comments: reviewerComments,
        committee_remarks: committeeRemarks,
        staff_response: staffResponse,
        appeal_status: appealStatus,
        evaluated_by: user?.name || 'Appraisal Authority',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'staff_id,academic_year' }
    );

    setLoading(false);
    if (error) setMsg('Error: ' + error.message);
    else setMsg(`Appraisal saved (${normalizedTotal} / 100 — ${band}).`);
  }

  // Load Campus Summary (Admin/Authority)
  async function loadCampusSummary() {
    setLoading(true);
    const [{ data: sf }, { data: ev }, { data: sa }] = await Promise.all([
      supabase.from('staff').select('staff_id, name, role').order('name'),
      supabase.from('appraisal_evaluations').select('*').eq('academic_year', ACADEMIC_YEAR),
      supabase.from('appraisal_self_assessments').select('staff_id, submitted_at').eq('academic_year', ACADEMIC_YEAR)
    ]);

    const evMap = {};
    (ev || []).forEach(e => { evMap[e.staff_id] = e; });
    const saSet = new Set((sa || []).map(s => s.staff_id));

    const rows = (sf || []).map(s => {
      const e = evMap[s.staff_id];
      return {
        staff_id: s.staff_id,
        name: s.name,
        role: s.role || 'teacher',
        selfSubmitted: saSet.has(s.staff_id),
        score: e ? Number(e.total_score) : null,
        band: e ? e.performance_band : 'Pending',
        flag: e ? e.conduct_flag : 'No critical concern',
        appeal: e ? e.appeal_status : 'None'
      };
    });

    setSummaryRows(rows);
    setLoading(false);
  }

  function downloadPDF(elId, filename) {
    const el = document.getElementById(elId);
    if (!el) return;
    html2pdf().set({
      margin: 8, filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }

  function downloadCSV(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { domainScores, normalizedTotal } = calculateScores(ratings);
  const currentBand = getPerformanceBand(normalizedTotal);

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Staff Appraisal</h2>
          <div style={{ fontSize: 11, color: '#64748b' }}>7-Domain Performance Framework • {ACADEMIC_YEAR}</div>
        </div>
      </div>

      {/* TOP TABS */}
      <div style={{ display: 'flex', background: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 14, gap: 3 }}>
        {[
          { id: 'self', label: 'Self-Form' },
          { id: 'monitoring', label: 'Monitoring' },
          { id: 'scorecard', label: 'Scorecard' },
          ...(isAuthority ? [{ id: 'summary', label: 'Summary' }] : [])
        ].map(t => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setMsg('');
              if (t.id === 'summary') loadCampusSummary();
            }}
            style={{
              flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2e44d2' : '#475569'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* STAFF SELECTOR (FOR AUTHORITY) */}
      {isAuthority && tab !== 'summary' && (
        <div style={{ marginBottom: 12 }}>
          <select
            value={selectedStaffId}
            onChange={e => loadStaffAppraisalData(e.target.value)}
            style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 13 }}
          >
            <option value="">Select Staff Member</option>
            {staffList.map(s => (
              <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.staff_id})</option>
            ))}
          </select>
        </div>
      )}

      {msg && (
        <div style={{ background: '#eff6ff', color: '#1e40af', padding: 11, borderRadius: 10, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 1: STAFF SELF-ASSESSMENT FORM (PARTS I-XIII)  */}
      {/* ================================================= */}
      {tab === 'self' && selectedStaffId && (
        <form onSubmit={saveSelfAssessment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2' }}>Part I & II: Staff Profile & Responsibilities</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={selfForm.designation} onChange={e => setSelfForm({ ...selfForm, designation: e.target.value })} placeholder="Designation" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input value={selfForm.department} onChange={e => setSelfForm({ ...selfForm, department: e.target.value })} placeholder="Department / Section" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input value={selfForm.qualification} onChange={e => setSelfForm({ ...selfForm, qualification: e.target.value })} placeholder="Qualifications" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <input value={selfForm.classes_handled} onChange={e => setSelfForm({ ...selfForm, classes_handled: e.target.value })} placeholder="Classes Handled" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            </div>
            <textarea rows={2} value={selfForm.teaching_resp} onChange={e => setSelfForm({ ...selfForm, teaching_resp: e.target.value })} placeholder="Academic / Teaching Responsibilities" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.admin_resp} onChange={e => setSelfForm({ ...selfForm, admin_resp: e.target.value })} placeholder="Administrative / Campus Responsibilities" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.mentoring_resp} onChange={e => setSelfForm({ ...selfForm, mentoring_resp: e.target.value })} placeholder="Student Support / Mentoring Responsibilities" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
          </div>

          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2' }}>Part IV & V: Major Achievements & Special Initiatives</div>
            <input value={selfForm.ach1} onChange={e => setSelfForm({ ...selfForm, ach1: e.target.value })} placeholder="Achievement 1" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input value={selfForm.ach2} onChange={e => setSelfForm({ ...selfForm, ach2: e.target.value })} placeholder="Achievement 2" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input value={selfForm.ach3} onChange={e => setSelfForm({ ...selfForm, ach3: e.target.value })} placeholder="Achievement 3" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input value={selfForm.init1_title} onChange={e => setSelfForm({ ...selfForm, init1_title: e.target.value })} placeholder="Special Initiative / Innovation 1 (Title)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.init1_impact} onChange={e => setSelfForm({ ...selfForm, init1_impact: e.target.value })} placeholder="Initiative 1 Outcome / Impact & Evidence" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
          </div>

          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2' }}>Part VI–VIII: TPD, Challenges & Student Learning Reflection</div>
            <textarea rows={2} value={selfForm.tpd_activities} onChange={e => setSelfForm({ ...selfForm, tpd_activities: e.target.value })} placeholder="Darul Huda TPD / Workshops Attended" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.tpd_applied} onChange={e => setSelfForm({ ...selfForm, tpd_applied: e.target.value })} placeholder="How was TPD learning applied in practice?" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.challenges} onChange={e => setSelfForm({ ...selfForm, challenges: e.target.value })} placeholder="Major challenges & areas requiring improvement" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea rows={2} value={selfForm.student_impact} onChange={e => setSelfForm({ ...selfForm, student_impact: e.target.value })} placeholder="Observed improvements in student learning/mentoring" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
          </div>

          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2e44d2' }}>Part IX–XII: Next-Cycle Goals, Self-Rating & Support</div>
            <input value={selfForm.goal1} onChange={e => setSelfForm({ ...selfForm, goal1: e.target.value })} placeholder="Goal 1 (with action plan)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input value={selfForm.goal2} onChange={e => setSelfForm({ ...selfForm, goal2: e.target.value })} placeholder="Goal 2 (with action plan)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <input value={selfForm.goal3} onChange={e => setSelfForm({ ...selfForm, goal3: e.target.value })} placeholder="Goal 3 (with action plan)" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Overall Self-Rating (1–5):</label>
              <select value={selfForm.overall_self_rating} onChange={e => setSelfForm({ ...selfForm, overall_self_rating: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700 }}>
                <option value="5">5 - Outstanding</option>
                <option value="4">4 - Very Good</option>
                <option value="3">3 - Satisfactory</option>
                <option value="2">2 - Needs Improvement</option>
                <option value="1">1 - Unsatisfactory</option>
              </select>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4 }}>Support Requested:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUPPORT_OPTIONS.map(opt => {
                const active = (selfForm.support_requests || []).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const curr = selfForm.support_requests || [];
                      const next = active ? curr.filter(x => x !== opt) : [...curr, opt];
                      setSelfForm({ ...selfForm, support_requests: next });
                    }}
                    style={{
                      padding: '5px 9px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: active ? '1px solid #2e44d2' : '1px solid #e2e8f0',
                      background: active ? '#2e44d2' : '#f8fafc',
                      color: active ? '#fff' : '#475569'
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#334155', marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selfForm.declared} onChange={e => setSelfForm({ ...selfForm, declared: e.target.checked })} />
              <span>Part XIII Declaration: I confirm that this self-assessment is an honest reflection of my professional performance and contributions.</span>
            </label>
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Save size={16} /> {loading ? 'Saving...' : 'Submit Self-Assessment'}
          </button>
        </form>
      )}

      {/* ================================================= */}
      {/* ================================================= */}
      {/* TAB 2: SYSTEMATIC MONITORING & EVIDENCE TRAIL     */}
      {/* ================================================= */}
      {tab === 'monitoring' && selectedStaffId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* WORKFLOW PROGRESS BAR */}
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
            <div style={{ padding: 6, borderRadius: 8, background: monLogs.length > 0 ? '#dcfce7' : '#f1f5f9' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>1. Monitoring</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: monLogs.length > 0 ? '#15803d' : '#475569' }}>{monLogs.length} Logs</div>
            </div>
            <div style={{ padding: 6, borderRadius: 8, background: selfForm.declared ? '#dcfce7' : '#fef3c7' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>2. Self-Form</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: selfForm.declared ? '#15803d' : '#b45309' }}>{selfForm.declared ? 'Submitted' : 'Pending'}</div>
            </div>
            <div style={{ padding: 6, borderRadius: 8, background: normalizedTotal > 0 ? '#dbeafe' : '#f1f5f9' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>3. Scorecard</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: normalizedTotal > 0 ? '#1d4ed8' : '#475569' }}>{normalizedTotal > 0 ? `${normalizedTotal}/100` : 'Not Rated'}</div>
            </div>
          </div>

          {isAuthority && (
            <form onSubmit={addMonitoringLog} style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Log Structured Monitoring Evidence</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Cycle</label>
                  <select value={monFreq} onChange={e => setMonFreq(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2 }}>
                    {['Weekly', 'Monthly', 'Quarterly', 'Term'].map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Domain</label>
                  <select
                    value={monDomain}
                    onChange={e => {
                      const dCode = e.target.value;
                      setMonDomain(dCode);
                      const dObj = DOMAINS.find(d => d.code === dCode);
                      if (dObj?.subdomains?.[0]) setMonSubdomain(dObj.subdomains[0].code);
                    }}
                    style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2 }}
                  >
                    {DOMAINS.map(d => <option key={d.code} value={d.code}>{d.code}: {d.title.slice(0, 20)}...</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Subdomain Indicator</label>
                <select value={monSubdomain} onChange={e => setMonSubdomain(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2 }}>
                  {(DOMAINS.find(d => d.code === monDomain)?.subdomains || []).map(s => (
                    <option key={s.code} value={s.code}>{s.code}: {s.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Evidence Type</label>
                  <select value={monEvidence} onChange={e => setMonEvidence(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2 }}>
                    {EVIDENCE_TYPES.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Confidence</label>
                  <select value={monConfidence} onChange={e => setMonConfidence(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2 }}>
                    <option value="High">High</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Limited">Limited</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Status / Feedback Level (Sec 14)</label>
                  <select value={monLevel} onChange={e => setMonLevel(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff', marginTop: 2, fontWeight: 700 }}>
                    <option value="On Track">On Track / Positive</option>
                    <option value="Level 1: Routine Feedback">L1: Routine Feedback</option>
                    <option value="Level 2: Repeated Concern">L2: Repeated Concern</option>
                    <option value="Level 3: Significant Concern">L3: Significant Concern</option>
                    <option value="Level 4: Critical Concern">L4: Critical Concern</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Follow-up Date (Optional)</label>
                  <input type="date" value={monFollowup} onChange={e => setMonFollowup(e.target.value)} style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, marginTop: 2 }} />
                </div>
              </div>

              <textarea required rows={2} value={monNotes} onChange={e => setMonNotes(e.target.value)} placeholder="Specific observed fact, artefact verified, or action agreed..." style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <button type="submit" disabled={loading} style={{ padding: 11, borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Save Monitoring Record
              </button>
            </form>
          )}

          {/* FILTERABLE EVIDENCE TRAIL */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Evidence Trail ({monLogs.filter(m => monFilter === 'ALL' || m.domain_code === monFilter).length})</div>
              <select value={monFilter} onChange={e => setMonFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 11, fontWeight: 700 }}>
                <option value="ALL">All Domains</option>
                {DOMAINS.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
              </select>
            </div>

            {monLogs.filter(m => monFilter === 'ALL' || m.domain_code === monFilter).length === 0 ? (
              <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 14 }}>No monitoring records logged for this filter.</p>
            ) : (
              monLogs
                .filter(m => monFilter === 'ALL' || m.domain_code === monFilter)
                .map(m => {
                  const isConcern = m.response_level && m.response_level !== 'On Track';
                  return (
                    <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#2e44d2' }}>
                          {m.frequency} • {m.domain_code}{m.subdomain_code ? ` (${m.subdomain_code})` : ''}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                          background: isConcern ? '#fee2e2' : '#dcfce7',
                          color: isConcern ? '#dc2626' : '#15803d'
                        }}>
                          {m.response_level || 'On Track'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#0f172a', marginBottom: 4 }}>{m.notes}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {m.evidence_type} ({m.confidence}) • {String(m.created_at).slice(0, 10)} • By: {m.logged_by}
                        {m.followup_date ? ` • Follow-up: ${m.followup_date}` : ''}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 3: 7-DOMAIN SCORECARD, SAFEGUARDS & DEV PLAN  */}
      {/* ================================================= */}
      {tab === 'scorecard' && selectedStaffId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* LIVE SCORE HEADER */}
          <div style={{ background: '#1e293b', color: '#fff', padding: 16, borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{activeStaffObj?.name}</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{normalizedTotal} <span style={{ fontSize: 13, fontWeight: 500 }}>/ 100</span></div>
            </div>
            <span style={{ padding: '6px 12px', borderRadius: 10, fontWeight: 800, fontSize: 12, background: currentBand.bg, color: currentBand.color }}>
              {currentBand.label}
            </span>
          </div>

          {/* 7-DOMAIN ACCORDION */}
          {DOMAINS.map(d => {
            const isOpen = openDomain === d.code;
            const ds = domainScores[d.code] || { score: 0, max: d.weight };
            return (
              <div key={d.code} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setOpenDomain(isOpen ? '' : d.code)}
                  style={{ width: '100%', padding: '12px 14px', border: 'none', background: isOpen ? '#eef2ff' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{d.code}: {d.title}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Weight: {d.weight} Marks</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#2e44d2' }}>
                    {ds.score} / {d.weight}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #e2e8f0' }}>
                    {d.subdomains.map(sub => {
                      const entry = ratings[sub.code] || { rating: '', note: '' };
                      const calc = entry.rating && entry.rating !== 'NA' ? ((Number(entry.rating) / 5) * sub.weight).toFixed(2) : '-';
                      return (
                        <div key={sub.code} style={{ paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                              {sub.code}. {sub.title} <span style={{ color: '#64748b', fontWeight: 500 }}>({sub.weight}m)</span>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#2e44d2' }}>{calc}</span>
                          </div>

                          <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                            {['1', '2', '3', '4', '5', 'NA'].map(val => {
                              const active = String(entry.rating) === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  disabled={!isAuthority}
                                  onClick={() => setRatings(prev => ({ ...prev, [sub.code]: { ...entry, rating: val } }))}
                                  style={{
                                    flex: 1, padding: '6px 2px', borderRadius: 7, fontSize: 11, fontWeight: 800,
                                    cursor: isAuthority ? 'pointer' : 'default',
                                    border: active ? '1px solid #2e44d2' : '1px solid #cbd5e1',
                                    background: active ? '#2e44d2' : '#f8fafc',
                                    color: active ? '#fff' : '#475569'
                                  }}
                                >
                                  {val}
                                </button>
                              );
                            })}
                          </div>

                          <input
                            disabled={!isAuthority}
                            value={entry.note || ''}
                            onChange={e => setRatings(prev => ({ ...prev, [sub.code]: { ...entry, note: e.target.value } }))}
                            placeholder="Evidence / Evaluator note..."
                            style={{ width: '100%', padding: 7, borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11 }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* SAFEGUARDS, CONFIDENCE & DEVELOPMENT PLAN */}
          <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Governance, Safeguards & Review</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Evidence Confidence</label>
                <select disabled={!isAuthority} value={evalConfidence} onChange={e => setEvalConfidence(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 3, fontSize: 12, background: '#fff' }}>
                  <option value="High">High</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Limited">Limited</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Critical Conduct Safeguard</label>
                <select disabled={!isAuthority} value={conductFlag} onChange={e => setConductFlag(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 3, fontSize: 12, background: '#fff', color: conductFlag === 'No critical concern' ? '#15803d' : '#dc2626', fontWeight: 700 }}>
                  <option value="No critical concern">No critical concern</option>
                  <option value="Review required">Review required</option>
                  <option value="Formal action">Formal action</option>
                </select>
              </div>
            </div>

            <textarea disabled={!isAuthority} rows={2} value={reviewerComments} onChange={e => setReviewerComments(e.target.value)} placeholder="Supervisor / Reviewer Comments & Key Strengths" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
            <textarea disabled={!isAuthority} rows={2} value={committeeRemarks} onChange={e => setCommitteeRemarks(e.target.value)} placeholder="Appraisal Committee / Management Remarks" style={{ padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />

            {/* STAFF RESPONSE & APPEAL */}
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 6 }}>Staff Response & Appeal (Section 18)</div>
              <textarea rows={2} value={staffResponse} onChange={e => setStaffResponse(e.target.value)} placeholder="Staff written response / clarification on appraisal..." style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, marginBottom: 6 }} />
              <select value={appealStatus} onChange={e => setAppealStatus(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}>
                <option value="None">Appeal Status: None</option>
                <option value="Discussion">Stage 1: Discussion</option>
                <option value="Written Response">Stage 2: Written Response Submitted</option>
                <option value="Under Review">Stage 3: Panel Review</option>
                <option value="Resolved">Stage 4: Final Decision Recorded</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
            <button onClick={saveEvaluation} disabled={loading} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Save size={15} /> {loading ? 'Saving...' : 'Save Appraisal'}
            </button>
            <button onClick={() => downloadPDF('nhia-appraisal-pdf', `Appraisal_${activeStaffObj?.name || selectedStaffId}_${ACADEMIC_YEAR}.pdf`)} style={{ padding: 13, borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={15} /> Official PDF
            </button>
          </div>

          {/* PRINTABLE OFFICIAL SCORECARD (HIDDEN ON SCREEN, USED FOR PDF) */}
          <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
            <div id="nhia-appraisal-pdf" style={{ width: 700, padding: 24, background: '#fff', color: '#000', fontFamily: 'Times New Roman, serif' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>NOORUL HIDAYA ISLAMIC ACADEMY, PATTAMBI</h2>
                <div style={{ fontSize: 12 }}>Affiliated to Darul Huda Islamic University • Staff Appraisal Report ({ACADEMIC_YEAR})</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12 }}>
                <div><b>Staff Name:</b> {activeStaffObj?.name}</div>
                <div><b>Staff ID:</b> {selectedStaffId}</div>
                <div><b>Final Score:</b> {normalizedTotal} / 100 ({currentBand.label})</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
                <thead>
                  <tr style={{ background: '#f2f2f2' }}>
                    <th style={{ border: '1px solid #000', padding: 6, textAlign: 'left' }}>Domain</th>
                    <th style={{ border: '1px solid #000', padding: 6 }}>Weight</th>
                    <th style={{ border: '1px solid #000', padding: 6 }}>Scored</th>
                  </tr>
                </thead>
                <tbody>
                  {DOMAINS.map(d => (
                    <tr key={d.code}>
                      <td style={{ border: '1px solid #000', padding: 6 }}>{d.code}: {d.title}</td>
                      <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center' }}>{d.weight}</td>
                      <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center', fontWeight: 'bold' }}>{domainScores[d.code]?.score || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 12, marginBottom: 8 }}><b>Evidence Confidence:</b> {evalConfidence} | <b>Conduct Safeguard:</b> {conductFlag}</div>
              <div style={{ fontSize: 12, marginBottom: 8 }}><b>Reviewer Comments:</b> {reviewerComments || '-'}</div>
              <div style={{ fontSize: 12, marginBottom: 8 }}><b>Committee Remarks:</b> {committeeRemarks || '-'}</div>
              <div style={{ fontSize: 12, marginBottom: 20 }}><b>Staff Response:</b> {staffResponse || '-'} ({appealStatus})</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 30 }}>
                <span>Staff Signature</span>
                <span>Supervisor Signature</span>
                <span>Principal / Authority</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* TAB 4: CAMPUS APPRAISAL SUMMARY (AUTHORITY)       */}
      {/* ================================================= */}
      {tab === 'summary' && isAuthority && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div id="nhia-appraisal-summary" style={{ background: '#fff', borderRadius: 14, border: '1px solid #cbd5e1', padding: 14, overflowX: 'auto' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>CAMPUS STAFF APPRAISAL SUMMARY ({ACADEMIC_YEAR})</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, whiteSpace: 'nowrap' }}>
              <thead style={{ background: '#1e293b', color: '#fff' }}>
                <tr>
                  <th style={{ padding: 7, textAlign: 'left' }}>Staff</th>
                  <th style={{ padding: 7 }}>Self-Form</th>
                  <th style={{ padding: 7 }}>Score</th>
                  <th style={{ padding: 7 }}>Band</th>
                  <th style={{ padding: 7 }}>Safeguard</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(r => (
                  <tr key={r.staff_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 7, fontWeight: 700 }}>{r.name}</td>
                    <td style={{ padding: 7, textAlign: 'center', color: r.selfSubmitted ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                      {r.selfSubmitted ? 'Submitted' : 'Pending'}
                    </td>
                    <td style={{ padding: 7, textAlign: 'center', fontWeight: 800, color: '#2e44d2' }}>
                      {r.score !== null ? `${r.score}/100` : '-'}
                    </td>
                    <td style={{ padding: 7, textAlign: 'center', fontWeight: 700 }}>{r.band}</td>
                    <td style={{ padding: 7, textAlign: 'center', color: r.flag === 'No critical concern' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                      {r.flag}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => downloadPDF('nhia-appraisal-summary', `Campus_Appraisal_Summary_${ACADEMIC_YEAR}.pdf`)} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={14} /> Download PDF
            </button>
            <button
              onClick={() => downloadCSV(
                `Campus_Appraisal_Summary_${ACADEMIC_YEAR}.csv`,
                ['Staff ID', 'Name', 'Role', 'Self-Assessment', 'Score (100)', 'Performance Band', 'Conduct Safeguard', 'Appeal Status'],
                summaryRows.map(r => [r.staff_id, r.name, r.role, r.selfSubmitted ? 'Submitted' : 'Pending', r.score ?? '-', r.band, r.flag, r.appeal])
              )}
              style={{ padding: 12, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <FileSpreadsheet size={14} /> Download Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}