import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { handleImgSelect, uploadImage, removeBackground } from '../../lib/imageUpload';
import { STATUSES, BLANK_PRODUCT, statusFromQty, fmt, parseColours } from '../../lib/adminUtils';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div className={`admin-toast admin-toast--${type}`}>{msg}</div>
  );
}

// ── CSV import modal ──────────────────────────────────────────────────────────
// Expected columns: name*, price*, category, status, quantity, image_url
// (* = required). category must already exist. image_url is optional.
// Invalid rows are shown in a report and can be downloaded as CSV.
function ImportCsvModal({ categories, onClose, onImported, showToast }) {
  const [step,      setStep]      = useState('upload'); // 'upload'|'preview'|'importing'|'done'
  const [validRows, setValidRows] = useState([]);
  const [badRows,   setBadRows]   = useState([]);  // [{row, name, reasons:[]}]
  const [results,   setResults]   = useState(null);
  const [parseErr,  setParseErr]  = useState('');
  const fileRef = useRef(null);

  const catSet = new Set(categories.map(c => c.name.toLowerCase()));

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParseErr('');

    Papa.parse(file, {
      header:          true,
      skipEmptyLines:  true,
      transformHeader: h => h.trim().toLowerCase(),
      complete({ data, errors: pErrs }) {
        if (pErrs.length) {
          setParseErr(`CSV parse error: ${pErrs[0].message}`);
          return;
        }
        validate(data);
      },
    });
  }

  function validate(raw) {
    const valid = [], bad = [];
    raw.forEach((r, i) => {
      const rowNum = i + 2; // account for header row
      const errs = [];
      if (!r.name?.trim())                                    errs.push('name is required');
      if (!r.price || isNaN(Number(r.price)) || Number(r.price) <= 0)
                                                              errs.push('price must be a positive number');
      if (r.category && !catSet.has(r.category.trim().toLowerCase()))
                                                              errs.push(`category "${r.category}" not found — add it in Categories tab first`);
      if (r.status && !STATUSES.includes(r.status.trim()))   errs.push(`invalid status "${r.status}"`);

      if (errs.length) {
        bad.push({ row: rowNum, name: r.name || '—', reasons: errs });
      } else {
        const qty = r.quantity ? Number(r.quantity) : 0;
        valid.push({
          name:       r.name.trim(),
          price:      Number(r.price),
          category:   r.category?.trim() || null,
          status:     r.status?.trim() || statusFromQty(qty),
          quantity:   qty,
          image_url:  r.image_url?.trim() || null,
          created_at: new Date().toISOString(),
        });
      }
    });
    setValidRows(valid);
    setBadRows(bad);
    setStep('preview');
  }

  async function handleImport() {
    if (!validRows.length) return;
    setStep('importing');
    const { data, error } = await supabase.from('products').insert(validRows).select();
    if (error) {
      showToast(`Import failed: ${error.message}`, 'error');
      setStep('preview');
      return;
    }
    onImported(data);
    setResults({ imported: data.length, failed: badRows.length });
    setStep('done');
  }

  function downloadErrorReport() {
    const lines = [
      'Row,Name,Reason',
      ...badRows.map(e => `${e.row},"${e.name.replace(/"/g,'""')}","${e.reasons.join('; ')}"`)
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `import-errors-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--lg" onClick={e => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h3>Import Products from CSV</h3>
          <button className="admin-modal__close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>

          {/* Step: upload ──────────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
                CSV must have columns: <code>name</code>, <code>price</code> (required) +
                optional <code>category</code>, <code>status</code>, <code>quantity</code>, <code>image_url</code>.
                First row must be a header.
              </p>
              <div className="img-upload" style={{ minHeight: 100 }}
                onClick={() => fileRef.current?.click()}>
                <div className="img-upload__placeholder">
                  <span>Click to choose .csv file</span>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={handleFile} />
              {parseErr && <p className="form-error" style={{ marginTop: 8 }}>{parseErr}</p>}
            </>
          )}

          {/* Step: preview ─────────────────────────────────────────── */}
          {step === 'preview' && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ color: '#4ade80', fontSize: 13 }}>✓ {validRows.length} rows ready to import</span>
                {badRows.length > 0 && (
                  <span style={{ color: '#f87171', fontSize: 13 }}>
                    ✕ {badRows.length} rows have errors
                    {' '}
                    <button className="ac-btn ac-btn--delete" style={{ marginLeft: 4 }}
                      onClick={downloadErrorReport}>
                      Download error report
                    </button>
                  </span>
                )}
              </div>

              {validRows.length > 0 && (
                <div className="tbl-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table className="admin-tbl">
                    <thead>
                      <tr><th>Name</th><th>Price</th><th>Category</th><th>Status</th><th>Qty</th></tr>
                    </thead>
                    <tbody>
                      {validRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td>{fmt(r.price)}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.category || '—'}</td>
                          <td><span className="status-pill status-pill--available" style={{ fontSize: 9 }}>{r.status}</span></td>
                          <td>{r.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {badRows.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: '#f87171', cursor: 'pointer' }}>
                    Show {badRows.length} error{badRows.length !== 1 ? 's' : ''}
                  </summary>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {badRows.map((e, i) => (
                      <p key={i} style={{ fontSize: 11, color: '#f87171', margin: 0 }}>
                        Row {e.row} — {e.name}: {e.reasons.join('; ')}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {/* Step: importing ───────────────────────────────────────── */}
          {step === 'importing' && (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Importing {validRows.length} products…</p>
          )}

          {/* Step: done ────────────────────────────────────────────── */}
          {step === 'done' && (
            <div>
              <p style={{ color: '#4ade80', fontSize: 14 }}>
                ✓ {results.imported} products imported successfully.
              </p>
              {results.failed > 0 && (
                <p style={{ color: '#f87171', fontSize: 13, marginTop: 6 }}>
                  {results.failed} rows skipped due to validation errors.{' '}
                  <button className="ac-btn ac-btn--delete" onClick={downloadErrorReport}>
                    Download report
                  </button>
                </p>
              )}
            </div>
          )}

        </div>

        <div className="admin-modal__footer">
          <button className="btn btn-outline" onClick={onClose}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'preview' && validRows.length > 0 && (
            <button className="btn btn-gold" onClick={handleImport}>
              Import {validRows.length} product{validRows.length !== 1 ? 's' : ''}
            </button>
          )}
          {step === 'upload' && (
            <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              Choose file
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add-product modal ─────────────────────────────────────────────────────────
function AddProductModal({ categories, onClose, onAdded, showToast }) {
  const [form,     setForm]     = useState(BLANK_PRODUCT);
  const [imgFile,  setImgFile]  = useState(null);
  const [preview,  setPreview]  = useState('');
  const [imgInfo,  setImgInfo]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  // On by default — "every photo I post" gets the white-stage/3D treatment
  // unless the admin explicitly turns it off for a shot that shouldn't have
  // its background touched (already-styled flat-lay, a graphic, etc).
  const [removeBg,   setRemoveBg]   = useState(true);
  const [bgStatus,   setBgStatus]   = useState('');   // progress text while processing
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim())     { setError('Product name is required.');   return; }
    if (!form.price)           { setError('Price is required.');          return; }
    if (isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setError('Enter a valid price.'); return;
    }
    setSaving(true);
    try {
      let image_url = null;
      if (imgFile && removeBg) {
        // Background removal is a local, on-device step (nothing leaves the
        // browser) — but it can take real time on a first use (the model
        // downloads once, then is cached). If it fails for any reason, fall
        // back to the original photo rather than block adding the product —
        // a plain photo beats no product at all.
        try {
          setBgStatus('Removing background… 0%');
          const cutout = await removeBackground(imgFile, pct => setBgStatus(`Removing background… ${pct}%`));
          setBgStatus('Background removed ✓ uploading…');
          image_url = await uploadImage(cutout, 'products', { isCutout: true });
        } catch (bgErr) {
          console.warn('[background removal]', bgErr.message);
          setBgStatus('Background removal failed — uploading original photo instead.');
          image_url = await uploadImage(imgFile, 'products');
        }
      } else if (imgFile) {
        image_url = await uploadImage(imgFile, 'products');
      }
      const qty = form.quantity === '' ? null : Number(form.quantity);
      const status = form.status === 'Available' || form.status === 'Low Stock'
        ? statusFromQty(qty ?? 999)
        : form.status;
      const row = {
        name:      form.name.trim(),
        price:     Number(form.price),
        category:  form.category || null,
        status,
        quantity:  qty,
        image_url,
        created_at: new Date().toISOString(),
      };
      const colours = parseColours(form.colours);
      if (colours) row.colours = colours;
      // Set when the colours column had to be dropped, so the success
      // message can say so. A local flag, not the toast state — `toast`
      // lives in ProductsTab, not in this modal, and reading it here threw
      // a ReferenceError.
      let noteColoursSkipped = false;

      let { data, error: err } = await supabase.from('products').insert(row).select().single();

      // The colours column arrives with a migration that may not have been
      // applied yet. Sending a key PostgREST doesn't know rejects the WHOLE
      // insert with PGRST204 — which broke Add Product outright, not just
      // the colours part of it. So if that's the failure, drop the column
      // and save the product anyway: losing the colour list is a nuisance,
      // losing the ability to add stock is not.
      if (err && (err.code === 'PGRST204' || /colours/i.test(err.message || ''))) {
        delete row.colours;
        ({ data, error: err } = await supabase.from('products').insert(row).select().single());
        if (!err) noteColoursSkipped = true;
      }
      if (err) throw err;
      onAdded(data);
      showToast(
        noteColoursSkipped
          ? 'Product added — colours need the database migration first.'
          : 'Product added.',
        'success'
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add product.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--lg" onClick={e => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h3>Add Product</h3>
          <button className="admin-modal__close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Image */}
          <div className="form-group">
            <label className="form-label">Product Image</label>
            <div className="img-upload" onClick={() => fileRef.current?.click()}>
              {preview
                ? <img src={preview} alt="Preview" className="img-cover" style={{ width: '100%', height: '100%' }} />
                : <div className="img-upload__placeholder"><span>Tap to upload</span></div>}
            </div>
            {imgInfo && <p className="form-hint">{imgInfo}</p>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleImgSelect(e, {
                onFile: setImgFile, onPreview: setPreview, onInfo: setImgInfo, onError: setError,
              })} />

            {imgFile && (
              <label className="bg-removal-toggle">
                <input type="checkbox" checked={removeBg}
                  onChange={e => setRemoveBg(e.target.checked)} disabled={saving} />
                <span>
                  Remove background &amp; apply the white-stage look
                  <span className="form-hint" style={{ marginTop: 2 }}>
                    Runs in your browser, takes a few seconds. Turn off for a photo
                    that's already styled the way you want it.
                  </span>
                </span>
              </label>
            )}
            {bgStatus && <p className="form-hint" style={{ color: 'var(--gold)' }}>{bgStatus}</p>}
          </div>

          <div className="pf-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Name</label>
              <input type="text" value={form.name} autoFocus
                onChange={e => set('name', e.target.value)} placeholder="Product name" />
            </div>
            <div className="form-group">
              <label className="form-label">Price (Ksh)</label>
              <input type="number" min="0" value={form.price}
                onChange={e => set('price', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="pf-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input type="number" min="0" value={form.quantity}
                onChange={e => set('quantity', e.target.value)} placeholder="Stock count" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* One plain text box rather than a colour picker or a tag widget:
              the owner types what they'd say on WhatsApp ("Black, Tan") and
              it becomes swatches on the storefront. Left empty, the product
              simply shows no colour row — nothing to undo, nothing to get
              wrong. */}
          <div className="form-group">
            <label className="form-label" htmlFor="p-colours">
              Colours
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted2)', fontSize: 12, marginLeft: 6 }}>
                optional — separate with commas
              </span>
            </label>
            <input id="p-colours" type="text" value={form.colours}
              onChange={e => set('colours', e.target.value)}
              placeholder="e.g. Black, Tan, Cream" />
            {parseColours(form.colours) && (
              <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6 }}>
                Shows as {parseColours(form.colours).length} colour
                {parseColours(form.colours).length !== 1 ? 's' : ''}: {parseColours(form.colours).join(' · ')}
              </p>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="admin-modal__footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Adding…' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ProductsTab({ products, categories, setProducts }) {
  const [showModal,      setShowModal]      = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [toast,          setToast]          = useState({ msg: '', type: 'success' });
  const toastTimer = useRef(null);

  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
  }

  function handleAdded(newProduct) {
    setProducts(prev => [newProduct, ...prev]);
  }

  function handleImported(newProducts) {
    setProducts(prev => [...newProducts, ...prev]);
  }

  async function adjustStock(product, delta) {
    const newQty = Math.max(0, (product.quantity ?? 0) + delta);
    // Was its own hand-copied ladder here too (a third copy of the same
    // logic, alongside AdminDashboard.jsx's — see adminUtils.js for why
    // that's worth collapsing to one place).
    const newStatus = product.status === 'Pre-Order' ? product.status : statusFromQty(newQty);

    const snapshot = products;
    setProducts(prev => prev.map(p =>
      p.id === product.id ? { ...p, quantity: newQty, status: newStatus } : p
    ));

    const { error } = await supabase.from('products')
      .update({ quantity: newQty, status: newStatus })
      .eq('id', product.id);

    if (error) {
      setProducts(snapshot);
      showToast('Failed to update stock — reverted.', 'error');
    }
  }

  async function handleFieldChange(product, field, value) {
    const snapshot = products;
    const update = { [field]: field === 'price' ? Number(value) : value };

    setProducts(prev => prev.map(p =>
      p.id === product.id ? { ...p, ...update } : p
    ));

    const { error } = await supabase.from('products')
      .update(update)
      .eq('id', product.id);

    if (error) {
      setProducts(snapshot);
      showToast(`Failed to update ${field} — reverted.`, 'error');
    }
  }

  async function deleteProduct(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const snapshot = products;
    setProducts(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      setProducts(snapshot);
      showToast('Delete failed — reverted.', 'error');
    } else {
      showToast(`"${name}" deleted.`, 'success');
    }
  }

  const pillClass = s => {
    if (s === 'Available')  return 'status-pill status-pill--available';
    if (s === 'Low Stock')  return 'status-pill status-pill--low-stock';
    if (s === 'Pre-Order')  return 'status-pill status-pill--pre-order';
    return 'status-pill status-pill--out-of-stock';
  };

  return (
    <div>
      <Toast msg={toast.msg} type={toast.type} />

      <div className="tab-header-row">
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" style={{ height: 38, padding: '0 14px', fontSize: 12 }}
            onClick={() => setShowImportModal(true)}
            title="Bulk-import products from a CSV file">
            Import CSV
          </button>
          <button className="btn btn-gold" style={{ height: 38, padding: '0 18px', fontSize: 12 }}
            onClick={() => setShowModal(true)}>
            + Add Product
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="admin-empty">No products yet. Add your first product above.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="admin-tbl">
            <thead>
              <tr>
                <th style={{ width: 52 }}></th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="prod-thumb">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="img-cover" />
                        : <div className="prod-thumb--empty" />}
                    </div>
                  </td>
                  <td>
                    <span className="sale-name">{p.name}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {p.category || '—'}
                  </td>
                  <td>
                    {/* Currency label beside the field: the column showed a
                        bare number in a box, which reads as a quantity as
                        easily as a price. */}
                    <span className="price-cell">
                      <span className="price-cell__cur">Ksh</span>
                      <input
                        type="number"
                        className="inline-edit"
                        aria-label={`Price for ${p.name} in Kenyan shillings`}
                        value={p.price ?? ''}
                        min="0"
                        onChange={e => handleFieldChange(p, 'price', e.target.value)}
                        onBlur={e => handleFieldChange(p, 'price', e.target.value)}
                      />
                    </span>
                  </td>
                  <td>
                    <div className="stock-ctrl">
                      <button className="stock-btn" onClick={() => adjustStock(p, -1)}
                        disabled={p.status === 'Pre-Order'}>−</button>
                      <span className="stock-val">{p.quantity ?? '—'}</span>
                      <button className="stock-btn" onClick={() => adjustStock(p, +1)}>+</button>
                    </div>
                  </td>
                  <td>
                    <select
                      className="inline-select"
                      value={p.status}
                      onChange={e => handleFieldChange(p, 'status', e.target.value)}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-danger"
                      style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                      onClick={() => deleteProduct(p.id, p.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddProductModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
          showToast={showToast}
        />
      )}

      {showImportModal && (
        <ImportCsvModal
          categories={categories}
          onClose={() => setShowImportModal(false)}
          onImported={handleImported}
          showToast={showToast}
        />
      )}
    </div>
  );
}
