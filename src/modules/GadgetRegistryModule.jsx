import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, Smartphone, Search, PlusCircle, Clock,
  ShieldCheck, Printer, Download, Copy, Trash2, Eye, EyeOff,
  RefreshCw, Upload, BarChart3
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const GADGET_TYPES = [
  'Laptop', 'Tablet', 'Mobile phone', 'Camera',
  'Projector', 'Smart watch', 'Headphones', 'Other'
];

const CATEGORIES = [
  'Bidaya', 'Oola', 'Thaniya', 'Thanawiyya', 'Aaliya',
  'Kulliyya Junior', 'Kulliyya Senior', 'Department',
  'Nusha', 'General purpose', 'Others'
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function GadgetRegistryModule({ onBack, user }) {
  const isAdmin = ['admin', 'super_admin', 'superadmin', 'coordinator'].includes(String(user?.role || '').toLowerCase());

  const [tab, setTab] = useState('list');
  const [gadgets, setGadgets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showPassId, setShowPassId] = useState(null);

  // Add Request Form
  const [type, setType] = useState('Mobile phone');
  const [typeOther, setTypeOther] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [owner, setOwner] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [category, setCategory] = useState('Bidaya');
  const [catOther, setCatOther] = useState('');
  const [approver, setApprover] = useState('');
  const [custodian, setCustodian] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState('');

  // Remove Request Form
  const [rmId, setRmId] = useState('');
  const [rmNote, setRmNote] = useState('');
  const [rmContact, setRmContact] = useState('');

  // Admin Decision Notes
  const [adminNotes, setAdminNotes] = useState({});

  // Sticker Print Filters
  const [printCat, setPrintCat] = useState('');
  const [printActiveOnly, setPrintActiveOnly] = useState(true);
  const [printSearch, setPrintSearch] = useState('');
  const [selectedStickerIds, setSelectedStickerIds] = useState([]);
  const [customSeal, setCustomSeal] = useState(() => localStorage.getItem('nhia_gadget_seal') || '');

  async function loadAll() {
    setLoading(true);
    const [{ data: gData, error: gErr }, { data: rData, error: rErr }] = await Promise.all([
      supabase.from('gadgets').select('*').order('id', { ascending: false }),
      supabase.from('gadget_requests').select('*').order('created_at', { ascending: false })
    ]);
    setLoading(false);
    if (gErr || rErr) {
      setMsg('Error loading data: ' + (gErr?.message || rErr?.message));
      return;
    }
    setGadgets(gData || []);
    setRequests(rData || []);
  }

  useEffect(() => { loadAll(); }, []);

  // Unique categories from existing gadgets
  const existingCategories = useMemo(() => {
    const set = new Set();
    gadgets.forEach(g => { if (g.category) set.add(g.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [gadgets]);

  // Filtered Gadgets
  const filteredGadgets = useMemo(() => {
    const term = q.trim().toLowerCase();
    return gadgets.filter(g => {
      if (statusFilter && g.status !== statusFilter) return false;
      if (catFilter && g.category !== catFilter) return false;
      if (!term) return true;
      return [g.id, g.type, g.model, g.owner, g.owner_id, g.category, g.approver, g.custodian]
        .some(v => String(v || '').toLowerCase().includes(term));
    });
  }, [gadgets, q, statusFilter, catFilter]);

  // Live Summary (Category x Type)
  const summaryData = useMemo(() => {
    const map = {};
    let totAll = 0, totMob = 0, totLap = 0, totTab = 0, totOth = 0;

    gadgets.forEach(g => {
      const cat = (g.category || 'Uncategorized').trim();
      if (!map[cat]) map[cat] = { category: cat, total: 0, mobile: 0, laptop: 0, tablet: 0, others: 0 };
      const t = (g.type || '').trim().toLowerCase();
      map[cat].total += 1;
      totAll += 1;
      if (t === 'mobile phone' || t === 'mobile') { map[cat].mobile += 1; totMob += 1; }
      else if (t === 'laptop') { map[cat].laptop += 1; totLap += 1; }
      else if (t === 'tablet') { map[cat].tablet += 1; totTab += 1; }
      else { map[cat].others += 1; totOth += 1; }
    });

    const rows = Object.values(map).sort((a, b) => a.category.localeCompare(b.category));
    return { rows, totals: { total: totAll, mobile: totMob, laptop: totLap, tablet: totTab, others: totOth } };
  }, [gadgets]);

  const pendingRequests = useMemo(
    () => requests.filter(r => r.state === 'PENDING'),
    [requests]
  );

  // Normalize category spelling against existing gadgets
  function normalizeCategory(raw) {
    const clean = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'General purpose';
    const match = gadgets.find(g => (g.category || '').toLowerCase() === clean.toLowerCase());
    return match ? match.category : clean;
  }

  // Submit ADD Request
  async function handleSendAdd(e) {
    e.preventDefault();
    const finalType = type === 'Other' ? typeOther.trim() : type;
    const finalCat = category === 'Others' ? catOther.trim() : category;
    if (!finalType || !finalCat || !model.trim() || !owner.trim() || !approver.trim() || !custodian.trim()) {
      return setMsg('Please fill all required fields (*).');
    }

    setLoading(true);
    const reqObj = {
      req_id: 'R-' + Date.now(),
      kind: 'ADD',
      gadget_id: '',
      data: {
        type: finalType,
        model: model.trim(),
        serial: serial.trim(),
        owner: owner.trim(),
        owner_id: ownerId.trim(),
        category: finalCat,
        approver: approver.trim(),
        custodian: custodian.trim(),
        password: password.trim()
      },
      requested_by: owner.trim(),
      contact: contact.trim(),
      date: todayStr(),
      state: 'PENDING',
      note: '',
      decided_at: ''
    };

    const { error } = await supabase.from('gadget_requests').insert([reqObj]);
    setLoading(false);
    if (error) return setMsg('Error: ' + error.message);

    setModel(''); setSerial(''); setOwner(''); setOwnerId('');
    setApprover(''); setCustodian(''); setPassword(''); setContact('');
    setTypeOther(''); setCatOther('');
    setMsg('Add request sent! Waiting for Admin approval.');
    setTab('status');
    loadAll();
  }

  // Submit REMOVE Request
  async function handleSendRemove(e) {
    e.preventDefault();
    if (!rmId) return setMsg('Please select a gadget to remove.');
    const target = gadgets.find(g => g.id === rmId);
    setLoading(true);
    const reqObj = {
      req_id: 'R-' + Date.now(),
      kind: 'REMOVE',
      gadget_id: rmId,
      data: {},
      requested_by: target?.owner || user?.name || 'Staff',
      contact: rmContact.trim(),
      date: todayStr(),
      state: 'PENDING',
      note: rmNote.trim(),
      decided_at: ''
    };
    const { error } = await supabase.from('gadget_requests').insert([reqObj]);
    setLoading(false);
    if (error) return setMsg('Error: ' + error.message);

    setRmId(''); setRmNote(''); setRmContact('');
    setMsg('Removal request sent! Waiting for Admin approval.');
    setTab('status');
    loadAll();
  }

  // Admin: Approve or Reject Request
  async function handleDecide(req, approve) {
    if (!isAdmin) return;
    setLoading(true);
    const note = (adminNotes[req.req_id] || '').trim();

    if (approve) {
      if (req.kind === 'ADD') {
        const d = req.data || {};
        let mx = 0;
        gadgets.forEach(g => {
          const m = String(g.id || '').match(/(\d+)$/);
          if (m) mx = Math.max(mx, parseInt(m[1], 10));
        });
        const newId = 'G-' + String(mx + 1).padStart(4, '0');
        const { error: insErr } = await supabase.from('gadgets').insert([{
          id: newId,
          type: d.type || 'Other',
          model: d.model || '',
          serial: d.serial || '',
          owner: d.owner || '',
          owner_id: d.owner_id || '',
          category: normalizeCategory(d.category),
          approver: d.approver || '',
          custodian: d.custodian || '',
          status: 'active',
          date: todayStr(),
          password: d.password || ''
        }]);
        if (insErr) {
          setLoading(false);
          return setMsg('Failed to add gadget: ' + insErr.message);
        }
      } else if (req.kind === 'REMOVE' && req.gadget_id) {
        await supabase.from('gadgets').update({ status: 'inactive' }).eq('id', req.gadget_id);
      }
    }

    const { error } = await supabase
      .from('gadget_requests')
      .update({
        state: approve ? 'APPROVED' : 'REJECTED',
        note: note || req.note || '',
        decided_at: todayStr()
      })
      .eq('req_id', req.req_id);

    setLoading(false);
    if (error) return setMsg('Error updating request: ' + error.message);
    setMsg(approve ? 'Request Approved!' : 'Request Rejected.');
    loadAll();
  }

  // Admin: Toggle Active / Inactive
  async function handleToggleStatus(g) {
    if (!isAdmin) return;
    const nextStatus = g.status === 'active' ? 'inactive' : 'active';
    setLoading(true);
    const { error } = await supabase.from('gadgets').update({ status: nextStatus }).eq('id', g.id);
    setLoading(false);
    if (error) return setMsg('Error: ' + error.message);
    setGadgets(prev => prev.map(x => x.id === g.id ? { ...x, status: nextStatus } : x));
    setMsg(`${g.id} marked as ${nextStatus}.`);
  }

  // Admin: Delete Gadget
  async function handleDeleteGadget(g) {
    if (!isAdmin) return;
    if (!window.confirm(`Permanently delete ${g.id} (${g.model} — ${g.owner})?`)) return;
    setLoading(true);
    const { error } = await supabase.from('gadgets').delete().eq('id', g.id);
    setLoading(false);
    if (error) return setMsg('Delete failed: ' + error.message);
    setGadgets(prev => prev.filter(x => x.id !== g.id));
    setMsg(`Deleted ${g.id}.`);
  }

  // Admin: Single PNG Sticker Download (720x360)
  function downloadSingleSticker(g) {
    const c = document.createElement('canvas');
    c.width = 720; c.height = 360;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 720, 360);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 712, 352);

    const fit = (t, w) => {
      let s = String(t || '');
      while (s.length > 1 && ctx.measureText(s).width > w) s = s.slice(0, -2) + '…';
      return s;
    };

    const drawTextAndSave = () => {
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 40px Arial';
      ctx.fillText(fit(String(g.category || '').toUpperCase(), 390), 300, 38);
      ctx.font = 'bold 34px Arial';
      ctx.fillText(fit(g.owner, 390), 300, 102);
      ctx.font = '26px Arial';
      ctx.fillStyle = '#222';
      ctx.fillText(fit('Allowed by: ' + g.approver, 390), 300, 170);
      ctx.fillText(fit('C/o: ' + g.custodian, 390), 300, 218);
      ctx.font = 'bold 22px Arial';
      ctx.fillStyle = '#475569';
      ctx.fillText(fit(g.id + ' • ' + g.model, 390), 300, 275);

      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `${g.id}-sticker.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      const s = 250;
      const r = Math.min(s / im.width, s / im.height);
      ctx.drawImage(im, 24 + (s - im.width * r) / 2, 55 + (s - im.height * r) / 2, im.width * r, im.height * r);
      drawTextAndSave();
    };
    im.onerror = () => {
      ctx.strokeStyle = '#777'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(150, 180, 105, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#777'; ctx.font = 'bold 32px Arial'; ctx.fillText('NHIA', 112, 165);
      drawTextAndSave();
    };
    im.src = customSeal || '/logo.jpg';
  }

  // Copy Summary Report for WhatsApp
  function copySummaryWhatsApp() {
    const t = summaryData.totals;
    let text = `*NOORUL HIDAYA ISLAMIC ACADEMY*\n`;
    text += `*Campus Gadget Registry Summary*\n`;
    text += `Date: ${todayStr()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*TOTAL GADGETS:* ${t.total}\n`;
    text += `• Mobile: ${t.mobile} | Laptop: ${t.laptop}\n`;
    text += `• Tablet: ${t.tablet} | Others: ${t.others}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    summaryData.rows.forEach((r, i) => {
      text += `${i + 1}. *${r.category}* — Total: *${r.total}* (M:${r.mobile}, L:${r.laptop}, T:${r.tablet}, O:${r.others})\n`;
    });
    navigator.clipboard.writeText(text.trim());
    setMsg('Copied Gadget Summary Report for WhatsApp!');
  }

  // Download Formal A4 PDF Report
  function downloadRegistryPDF() {
    const t = summaryData.totals;
    const sumRows = summaryData.rows.map((r, i) => `<tr>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;">${i + 1}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;font-weight:700;">${r.category}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;font-weight:700;">${r.total}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;">${r.mobile}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;">${r.laptop}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;">${r.tablet}</td>
      <td style="border:1px solid #cbd5e1;padding:5px;text-align:center;">${r.others}</td>
    </tr>`).join('');

    const listRows = filteredGadgets.map(g => `<tr>
      <td style="border:1px solid #e2e8f0;padding:4px;font-weight:700;">${g.id}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;">${g.type} — ${g.model}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;">${g.owner}${g.owner_id ? ` (${g.owner_id})` : ''}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;">${g.category}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;">${g.approver}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;">${g.custodian}</td>
      <td style="border:1px solid #e2e8f0;padding:4px;text-align:center;color:${g.status === 'active' ? '#15803d' : '#dc2626'};font-weight:700;">${g.status.toUpperCase()}</td>
    </tr>`).join('');

    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding:18px;font-family:Arial,sans-serif;color:#0f172a;border:1.5px solid #0f172a;">
        <div style="position:relative;text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;min-height:50px;">
          <img src="/logo.jpg" style="position:absolute;left:4px;top:0;width:46px;height:46px;object-fit:contain;" />
          <div style="font-size:17px;font-weight:800;">NOORUL HIDAYA ISLAMIC ACADEMY, PATTAMBI</div>
          <div style="font-size:13px;font-weight:700;color:#334155;">Campus Gadget Registry Report</div>
          <div style="font-size:11px;color:#64748b;">Date: ${todayStr()} | Total Gadgets: ${t.total}</div>
        </div>
        <div style="font-size:12px;font-weight:800;margin-bottom:6px;">Category-wise Summary</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;">
          <thead>
            <tr style="background:#0f172a;color:#fff;">
              <th style="border:1px solid #0f172a;padding:6px;">#</th>
              <th style="border:1px solid #0f172a;padding:6px;text-align:left;">Category</th>
              <th style="border:1px solid #0f172a;padding:6px;">Total</th>
              <th style="border:1px solid #0f172a;padding:6px;">Mobile</th>
              <th style="border:1px solid #0f172a;padding:6px;">Laptop</th>
              <th style="border:1px solid #0f172a;padding:6px;">Tablet</th>
              <th style="border:1px solid #0f172a;padding:6px;">Others</th>
            </tr>
          </thead>
          <tbody>
            ${sumRows}
            <tr style="background:#e2e8f0;font-weight:800;">
              <td colspan="2" style="border:1px solid #cbd5e1;padding:6px;text-align:right;">GRAND TOTAL</td>
              <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${t.total}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${t.mobile}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${t.laptop}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${t.tablet}</td>
              <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${t.others}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size:12px;font-weight:800;margin-bottom:6px;">Registered Gadgets (${filteredGadgets.length})</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">ID</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">Gadget</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">Owner</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">Category</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">Allowed By</th>
              <th style="border:1px solid #cbd5e1;padding:5px;text-align:left;">In Care Of</th>
              <th style="border:1px solid #cbd5e1;padding:5px;">Status</th>
            </tr>
          </thead>
          <tbody>${listRows}</tbody>
        </table>
      </div>
    `;

    html2pdf().set({
      margin: 8,
      filename: `NHIA_Gadget_Registry_${todayStr()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save();
  }

  // Admin: Print A4 Sticker Sheet (27 per page, 3x9, 60mm x 30mm)
  const stickerGadgets = useMemo(() => {
    return gadgets
      .filter(g => (!printCat || g.category === printCat) && (!printActiveOnly || g.status === 'active'))
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.id).localeCompare(String(b.id)));
  }, [gadgets, printCat, printActiveOnly]);

  function handleSealUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setCustomSeal(dataUrl);
      try { localStorage.setItem('nhia_gadget_seal', dataUrl); } catch {}
      setMsg('Custom sticker logo updated!');
    };
    reader.readAsDataURL(file);
  }

  function resetSeal() {
    setCustomSeal('');
    localStorage.removeItem('nhia_gadget_seal');
    setMsg('Reset sticker logo to default.');
  }

  function toggleStickerId(id) {
    setSelectedStickerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const visibleStickerGadgets = useMemo(() => {
    const term = printSearch.trim().toLowerCase();
    if (!term) return stickerGadgets;
    return stickerGadgets.filter(g =>
      [g.id, g.owner, g.owner_id, g.model, g.category]
        .some(v => String(v || '').toLowerCase().includes(term))
    );
  }, [stickerGadgets, printSearch]);

  function printA4Stickers() {
    const listToPrint = selectedStickerIds.length > 0
      ? stickerGadgets.filter(g => selectedStickerIds.includes(g.id))
      : stickerGadgets;
    if (listToPrint.length === 0) return;

    const sealSrc = customSeal || (window.location.origin + '/logo.jpg');
    const pages = [];
    for (let i = 0; i < listToPrint.length; i += 27) {
      const slice = listToPrint.slice(i, i + 27);
      const cards = slice.map(g => `
        <div style="border:0.3mm dashed #64748b;display:flex;align-items:center;gap:2mm;padding:1.5mm;overflow:hidden;box-sizing:border-box;width:60mm;height:30mm;">
          <div style="flex:0 0 22mm;height:22mm;display:flex;align-items:center;justify-content:center;">
            <img src="${sealSrc}" style="max-width:22mm;max-height:22mm;object-fit:contain;" />
          </div>
          <div style="flex:1;min-width:0;overflow:hidden;line-height:1.2;font-family:Arial,sans-serif;color:#000;">
            <div style="font-weight:800;font-size:8.5pt;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.category}</div>
            <div style="font-weight:800;font-size:8.5pt;margin:0.5mm 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.owner}</div>
            <div style="font-size:7pt;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Allowed: ${g.approver}</div>
            <div style="font-size:7pt;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">C/o: ${g.custodian}</div>
          </div>
        </div>
      `).join('');
      pages.push(`<div style="display:grid;grid-template-columns:repeat(3,60mm);grid-template-rows:repeat(9,30mm);width:180mm;height:270mm;page-break-after:always;">${cards}</div>`);
    }

    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>NHIA Gadget Stickers</title><style>@page{size:A4;margin:10mm}body{margin:0;padding:0;}</style></head><body>${pages.join('')}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // Admin: Import CSV from old Google Sheet
  async function handleCSVImport(e) {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return setMsg('CSV file is empty.');

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      if (!cols[0] || !cols[2]) continue;
      rows.push({
        id: cols[0],
        type: cols[1] || 'Mobile phone',
        model: cols[2] || '',
        serial: cols[3] || '',
        owner: cols[4] || '',
        owner_id: cols[5] || '',
        category: cols[6] || 'General purpose',
        approver: cols[7] || '',
        custodian: cols[8] || '',
        status: (cols[9] || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
        date: cols[10] || todayStr(),
        password: cols[11] || ''
      });
    }
    if (rows.length === 0) return setMsg('No valid rows found in CSV.');
    setLoading(true);
    const { error } = await supabase.from('gadgets').upsert(rows, { onConflict: 'id' });
    setLoading(false);
    if (error) return setMsg('Import error: ' + error.message);
    setMsg(`Successfully imported ${rows.length} gadgets!`);
    loadAll();
  }

  const inputStyle = {
    width: '100%', padding: '9px 10px', borderRadius: 9,
    border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', background: '#fff'
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#e0e7ff', color: '#2e44d2', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#0f172a' }}>Gadget Registry</h2>
            <div style={{ fontSize: 11, color: '#64748b' }}>Campus Approved Devices & Stickers</div>
          </div>
        </div>
        <button onClick={loadAll} style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12.5, fontWeight: 700, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={{ border: 'none', background: 'transparent', color: '#1e40af', fontWeight: 800, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['list', `Gadgets (${gadgets.length})`, Smartphone],
          ['req', 'Send Request', PlusCircle],
          ['status', 'Requests', Clock],
          ['summary', 'Summary & PDF', BarChart3],
          ...(isAdmin ? [
            ['admin', `Approvals (${pendingRequests.length})`, ShieldCheck],
            ['stickers', 'A4 Stickers', Printer]
          ] : [])
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: '0 0 auto', padding: '8px 12px', borderRadius: 99, border: 'none',
              background: tab === k ? '#2e44d2' : '#f1f5f9',
              color: tab === k ? '#fff' : '#475569',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* TAB 1: GADGETS DIRECTORY */}
      {tab === 'list' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: '1 1 180px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search ID, model, owner, teacher..."
                style={{ ...inputStyle, paddingLeft: 30 }}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, flex: '1 1 110px' }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }}>
              <option value="">All Categories</option>
              {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', padding: 20 }}>Loading gadgets...</p>
          ) : filteredGadgets.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', padding: 20 }}>No gadgets found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredGadgets.map(g => (
                <div key={g.id} style={{ padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                        <span style={{ color: '#2e44d2' }}>{g.id}</span> • {g.type} — {g.model}
                      </div>
                      <div style={{ fontSize: 12, color: '#334155', marginTop: 3 }}>
                        <b>Owner:</b> {g.owner} {g.owner_id ? `(${g.owner_id})` : ''} &nbsp;|&nbsp; <b>Category:</b> {g.category}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                        Allowed by: <b>{g.approver}</b> &nbsp;•&nbsp; C/o: <b>{g.custodian}</b>
                      </div>
                      {isAdmin && g.password && (
                        <div style={{ fontSize: 11.5, color: '#0f172a', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b>Lock Code:</b>
                          <span>{showPassId === g.id ? g.password : '••••••'}</span>
                          <button
                            onClick={() => setShowPassId(showPassId === g.id ? null : g.id)}
                            style={{ border: 'none', background: 'transparent', color: '#2e44d2', cursor: 'pointer', padding: 0, display: 'flex' }}
                          >
                            {showPassId === g.id ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                      background: g.status === 'active' ? '#dcfce7' : '#fee2e2',
                      color: g.status === 'active' ? '#15803d' : '#dc2626'
                    }}>
                      {g.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                    {isAdmin && (
                      <>
                        <button onClick={() => downloadSingleSticker(g)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Download size={12} /> Sticker PNG
                        </button>
                        <button onClick={() => handleToggleStatus(g)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          {g.status === 'active' ? 'Make Inactive' : 'Make Active'}
                        </button>
                        <button onClick={() => handleDeleteGadget(g)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </>
                    )}
                    {g.status === 'active' && (
                      <button
                        onClick={() => { setRmId(g.id); setTab('req'); }}
                        style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Request Removal
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SEND REQUEST (ADD / REMOVE) */}
      {tab === 'req' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <form onSubmit={handleSendAdd} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', color: '#0f172a' }}>Request to ADD a Gadget</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Gadget Type *</label>
                <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                  {GADGET_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              {type === 'Other' && (
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Specify Type *</label>
                  <input value={typeOther} onChange={e => setTypeOther(e.target.value)} style={inputStyle} required />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Model *</label>
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g., Redmi Note 13" style={inputStyle} required />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Owner Name *</label>
                <input value={owner} onChange={e => setOwner(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Admission No.</label>
                <input value={ownerId} onChange={e => setOwnerId(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Allowed For (Category) *</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {category === 'Others' && (
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Specify Category *</label>
                  <input value={catOther} onChange={e => setCatOther(e.target.value)} style={inputStyle} required />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Allowed By (Teacher) *</label>
                <input value={approver} onChange={e => setApprover(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>In Care Of (Teacher) *</label>
                <input value={custodian} onChange={e => setCustodian(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Mobile Password (Admin Only)</label>
                <input value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Contact Phone</label>
                <input value={contact} onChange={e => setContact(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Send Add Request
            </button>
          </form>

          <form onSubmit={handleSendRemove} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', color: '#dc2626' }}>Request to REMOVE a Gadget</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Select Active Gadget *</label>
                <select value={rmId} onChange={e => setRmId(e.target.value)} style={inputStyle} required>
                  <option value="">-- Choose Gadget --</option>
                  {gadgets.filter(g => g.status === 'active').map(g => (
                    <option key={g.id} value={g.id}>{g.id} — {g.model} ({g.owner})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Reason</label>
                <input value={rmNote} onChange={e => setRmNote(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Your Contact</label>
                <input value={rmContact} onChange={e => setRmContact(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Send Remove Request
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: REQUEST STATUS */}
      {tab === 'status' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>All Requests</h3>
          {requests.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', padding: 16 }}>No requests yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {requests.map(r => {
                const d = r.data || {};
                return (
                  <div key={r.req_id} style={{ padding: 11, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: r.kind === 'ADD' ? '#2e44d2' : '#dc2626' }}>
                        {r.kind} • {r.date}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 800,
                        background: r.state === 'APPROVED' ? '#dcfce7' : r.state === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: r.state === 'APPROVED' ? '#15803d' : r.state === 'REJECTED' ? '#dc2626' : '#b45309'
                      }}>
                        {r.state}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>
                      {r.kind === 'ADD' ? `${d.type} — ${d.model} (${d.owner} • ${d.category})` : `Remove Gadget ${r.gadget_id}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      By: {r.requested_by} {r.note ? `• Note: ${r.note}` : ''}
                    </div>
                    {isAdmin && r.state === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <input
                          value={adminNotes[r.req_id] || ''}
                          onChange={e => setAdminNotes(prev => ({ ...prev, [r.req_id]: e.target.value }))}
                          placeholder="Admin note (optional)..."
                          style={{ ...inputStyle, flex: '1 1 140px', padding: '5px 8px', fontSize: 12 }}
                        />
                        <button onClick={() => handleDecide(r, true)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                          Approve
                        </button>
                        <button onClick={() => handleDecide(r, false)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LIVE SUMMARY & PDF */}
      {tab === 'summary' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Category-wise Summary</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={copySummaryWhatsApp} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Copy size={12} /> Copy
              </button>
              <button onClick={downloadRegistryPDF} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Download size={12} /> Download PDF
              </button>
              {isAdmin && (
                <label style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2e44d2', background: '#eff6ff', color: '#2e44d2', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Upload size={12} /> Import CSV
                  <input type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
                </label>
              )}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#fff' }}>
                  <th style={{ padding: 7, textAlign: 'left' }}>Category</th>
                  <th style={{ padding: 7 }}>Total</th>
                  <th style={{ padding: 7 }}>Mobile</th>
                  <th style={{ padding: 7 }}>Laptop</th>
                  <th style={{ padding: 7 }}>Tablet</th>
                  <th style={{ padding: 7 }}>Others</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.rows.map(r => (
                  <tr key={r.category} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 7, fontWeight: 700 }}>{r.category}</td>
                    <td style={{ padding: 7, textAlign: 'center', fontWeight: 800, color: '#2e44d2' }}>{r.total}</td>
                    <td style={{ padding: 7, textAlign: 'center' }}>{r.mobile}</td>
                    <td style={{ padding: 7, textAlign: 'center' }}>{r.laptop}</td>
                    <td style={{ padding: 7, textAlign: 'center' }}>{r.tablet}</td>
                    <td style={{ padding: 7, textAlign: 'center' }}>{r.others}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                  <td style={{ padding: 7 }}>GRAND TOTAL</td>
                  <td style={{ padding: 7, textAlign: 'center' }}>{summaryData.totals.total}</td>
                  <td style={{ padding: 7, textAlign: 'center' }}>{summaryData.totals.mobile}</td>
                  <td style={{ padding: 7, textAlign: 'center' }}>{summaryData.totals.laptop}</td>
                  <td style={{ padding: 7, textAlign: 'center' }}>{summaryData.totals.tablet}</td>
                  <td style={{ padding: 7, textAlign: 'center' }}>{summaryData.totals.others}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: ADMIN APPROVALS */}
      {tab === 'admin' && isAdmin && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Pending Approvals ({pendingRequests.length})</h3>
          {pendingRequests.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', padding: 16 }}>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingRequests.map(r => {
                const d = r.data || {};
                return (
                  <div key={r.req_id} style={{ padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: r.kind === 'ADD' ? '#2e44d2' : '#dc2626' }}>
                      {r.kind} REQUEST • {r.date}
                    </div>
                    {r.kind === 'ADD' ? (
                      <div style={{ fontSize: 12.5, marginTop: 4 }}>
                        <b>{d.type} — {d.model}</b><br />
                        Owner: {d.owner} {d.owner_id ? `(${d.owner_id})` : ''} • Category: {d.category}<br />
                        Allowed by: {d.approver} • C/o: {d.custodian}
                        {d.password && <><br />Lock Code: <b>{d.password}</b></>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, marginTop: 4 }}>
                        Remove Gadget: <b>{r.gadget_id}</b><br />
                        Reason: {r.note || 'Not specified'}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                      Requested by: {r.requested_by} {r.contact ? `(${r.contact})` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <input
                        value={adminNotes[r.req_id] || ''}
                        onChange={e => setAdminNotes(prev => ({ ...prev, [r.req_id]: e.target.value }))}
                        placeholder="Admin note (optional)..."
                        style={{ ...inputStyle, flex: '1 1 160px', padding: '6px 9px' }}
                      />
                      <button onClick={() => handleDecide(r, true)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Approve
                      </button>
                      <button onClick={() => handleDecide(r, false)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ADMIN A4 STICKER PRINT */}
      {tab === 'stickers' && isAdmin && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>A4 Sticker Print (6cm × 3cm • 27/Page)</h3>
              <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                Tick specific students below to print only their stickers.
              </div>
            </div>
            {/* Custom Seal / Logo Upload */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src={customSeal || '/logo.jpg'}
                alt="Seal"
                style={{ width: 34, height: 34, borderRadius: 6, border: '1px solid #cbd5e1', objectFit: 'contain', background: '#fff' }}
              />
              <label style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2e44d2', background: '#eff6ff', color: '#2e44d2', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Upload size={12} /> Change Logo
                <input type="file" accept="image/*" onChange={handleSealUpload} style={{ display: 'none' }} />
              </label>
              {customSeal && (
                <button onClick={resetSeal} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Filters & Print Button */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              value={printSearch}
              onChange={e => setPrintSearch(e.target.value)}
              placeholder="Search student, ID, model..."
              style={{ ...inputStyle, flex: '1 1 160px' }}
            />
            <select value={printCat} onChange={e => setPrintCat(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
              <option value="">All Categories</option>
              {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={printActiveOnly} onChange={e => setPrintActiveOnly(e.target.checked)} />
              Active Only
            </label>
          </div>

          {/* Select All / Clear / Print Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setSelectedStickerIds(visibleStickerGadgets.map(g => g.id))}
                style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Select All ({visibleStickerGadgets.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedStickerIds([])}
                style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >
                Clear
              </button>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#2e44d2', marginLeft: 4 }}>
                {selectedStickerIds.length > 0 ? `${selectedStickerIds.length} Selected` : `All ${stickerGadgets.length} Ready`}
              </span>
            </div>

            <button
              onClick={printA4Stickers}
              disabled={stickerGadgets.length === 0}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#2e44d2', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Printer size={14} />
              {selectedStickerIds.length > 0
                ? `Print Selected (${selectedStickerIds.length})`
                : `Print All (${stickerGadgets.length})`}
            </button>
          </div>

          {/* Student / Gadget Checklist */}
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
            {visibleStickerGadgets.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12.5, color: '#64748b', padding: 16 }}>No gadgets match your filter.</p>
            ) : (
              visibleStickerGadgets.map((g, idx) => {
                const checked = selectedStickerIds.includes(g.id);
                return (
                  <label
                    key={g.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      borderBottom: idx < visibleStickerGadgets.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: checked ? '#eff6ff' : '#fff', cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStickerId(g.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                        {g.owner} {g.owner_id ? `(${g.owner_id})` : ''} — <span style={{ color: '#2e44d2' }}>{g.id}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {g.category} • {g.type} ({g.model}) • C/o: {g.custodian}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
