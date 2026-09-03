// SettingsTab — store contact details, vacation mode, renewal dates, admin profile.
// C2: vacation_mode + vacation_message — shows banner on storefront, changes cart CTA.
// D3: domain/hosting/SSL renewal dates — dashboard warns 30 days before expiry.
import { supabase } from '../../lib/supabase';
import { BLANK_SETTINGS } from '../../lib/adminUtils';

export default function SettingsTab({
  settings, setSettings, saving, setSaving, msg, setMsg, user, onLogout,
}) {
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const { error } = await supabase.from('store_settings').upsert(
        { id: 'singleton', ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
      if (error) throw error;
      setMsg('Saved!');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (key, label, type = 'text', placeholder = '') => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={settings[key] ?? ''}
        onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div style={{ maxWidth: 640 }}>

      {/* ── Store details ─────────────────────────────────────────────── */}
      <h3 className="settings-section-title">Store Details</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Shown on the About page so customers can reach you.
      </p>

      <form className="product-form" onSubmit={handleSave}>
        <div className="pf-row">
          {field('whatsapp',  'WhatsApp Number', 'text',  '0712 345 678')}
          {field('phone',     'Phone',           'text',  '+254 712 345 678')}
          {field('email',     'Email',           'email', 'hello@kamili.co.ke')}
        </div>
        <div className="pf-row">
          {field('instagram', 'Instagram Handle', 'text', '@kamili.nairobi')}
          {field('hours',     'Business Hours',   'text', 'Mon–Sat 9am–6pm')}
        </div>
        {field('location', 'Location / Address', 'text', 'Westlands, Nairobi')}

        <div className="form-group">
          <label className="form-label">
            Short Tagline
            <span style={{ color: 'var(--muted2)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              (optional)
            </span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Bags, jewellery & watches, Nairobi. DM to order."
            value={settings.tagline ?? ''}
            onChange={e => setSettings(s => ({ ...s, tagline: e.target.value }))}
          />
        </div>

        <div className="settings-divider" />

        {/* ── C2: Vacation mode ─────────────────────────────────────── */}
        <h3 className="settings-section-title">Vacation Mode</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          While on, a banner shows on the storefront and the Add to Cart button reads
          "Pre-order — will dispatch when we reopen". Orders still come in.
        </p>

        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Vacation Mode</label>
          <input
            type="checkbox"
            checked={!!settings.vacation_mode}
            onChange={e => setSettings(s => ({ ...s, vacation_mode: e.target.checked }))}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: settings.vacation_mode ? '#fbbf24' : 'var(--muted2)' }}>
            {settings.vacation_mode ? 'ON — storefront shows vacation banner' : 'OFF'}
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Vacation Message</label>
          <textarea
            rows={2}
            placeholder="e.g. Closed Dec 24–26, back Dec 27. WhatsApp orders will be processed on return."
            value={settings.vacation_message ?? ''}
            onChange={e => setSettings(s => ({ ...s, vacation_message: e.target.value }))}
          />
        </div>

        <div className="settings-divider" />

        {/* ── D3: Renewal dates ─────────────────────────────────────── */}
        <h3 className="settings-section-title">Renewal Dates</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Dashboard shows a red banner 30 days before any expiry. Leave blank if N/A.
        </p>
        <div className="pf-row">
          {field('domain_renewal_date',  'Domain Renewal',  'date')}
          {field('hosting_renewal_date', 'Hosting Renewal', 'date')}
          {field('ssl_renewal_date',     'SSL Cert Renewal', 'date')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          <button type="submit" className="btn btn-gold" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#ef4444' : '#4ade80' }}>
              {msg}
            </span>
          )}
        </div>
      </form>

      <div className="settings-divider" />

      {/* ── Admin profile ─────────────────────────────────────────────── */}
      <h3 className="settings-section-title">Admin Account</h3>
      <div className="settings-profile">
        <div className="settings-profile__email">{user?.email}</div>
        <button className="btn btn-outline" style={{ height: 36, padding: '0 16px', fontSize: 12 }}
          onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
