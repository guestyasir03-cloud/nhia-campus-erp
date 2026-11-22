import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ChangePasswordBox({ user }) {
  const [open, setOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleChange(e) {
    e.preventDefault();
    setStatus(null);

    if (!navigator.onLine) {
      return setStatus({ type: 'err', text: 'പാസ്‌വേഡ് മാറ്റാൻ ഇന്റർനെറ്റ് ആവശ്യമാണ്!' });
    }
    if (newPin.trim().length < 4) {
      return setStatus({ type: 'err', text: 'പുതിയ PIN / പാസ്‌വേഡിന് കുറഞ്ഞത് 4 അക്ഷരങ്ങൾ വേണം.' });
    }
    if (newPin.trim() !== confirmPin.trim()) {
      return setStatus({ type: 'err', text: 'പുതിയ പാസ്‌വേഡുകൾ തമ്മിൽ യോജിക്കുന്നില്ല!' });
    }

    setSaving(true);
    try {
      const table = user.type === 'staff' ? 'staff' : 'students';
      const idCol = user.type === 'staff' ? 'staff_id' : 'adm_no';

      // Verify current PIN
      const { data: existing, error: fetchErr } = await supabase
        .from(table)
        .select('pin')
        .eq(idCol, user.id)
        .eq('pin', oldPin.trim())
        .maybeSingle();

      if (fetchErr || !existing) {
        throw new Error('നിലവിലെ PIN / പാസ്‌വേഡ് തെറ്റാണ്!');
      }

      // Update to new PIN
      const { error: updErr } = await supabase
        .from(table)
        .update({ pin: newPin.trim() })
        .eq(idCol, user.id);

      if (updErr) throw updErr;

      // Update offline login cache too
      try {
        const creds = JSON.parse(localStorage.getItem('nhia_offline_creds') || '{}');
        const key = `${user.type}_${user.id}`;
        if (creds[key]) {
          creds[key].pin = newPin.trim();
          localStorage.setItem('nhia_offline_creds', JSON.stringify(creds));
        }
      } catch {}

      setStatus({ type: 'ok', text: 'പാസ്‌വേഡ് വിജയകരമായി മാറ്റി!' });
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setStatus({ type: 'err', text: err.message || 'പാസ്‌വേഡ് മാറ്റാൻ കഴിഞ്ഞില്ല.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setStatus(null); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: 11, borderRadius: 12,
          border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b',
          fontWeight: 700, cursor: 'pointer', fontSize: 14
        }}
      >
        <KeyRound size={16} /> {open ? 'Cancel Password Change' : 'Change Password / PIN'}
      </button>

      {open && (
        <form onSubmit={handleChange} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="password"
            placeholder="Current PIN / Password"
            value={oldPin}
            onChange={(e) => setOldPin(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="New PIN / Password (min 4 chars)"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="Confirm New PIN / Password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
          />

          {status && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              color: status.type === 'ok' ? '#15803d' : '#dc2626'
            }}>
              {status.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{status.text}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: 11, borderRadius: 10, border: 'none',
              background: '#2563eb', color: '#fff', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Updating...' : 'Save New Password'}
          </button>
        </form>
      )}
    </div>
  );
}