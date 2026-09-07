import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { supabase } from '../../lib/supabase';
import { handleImgSelect, detectBackground, uploadProductPhoto } from '../../lib/imageUpload';
import PhotosModal from './PhotosModal';
import { galleryOf } from '../../lib/gallery';
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
  // An ordered LIST, not one file: a product should be swipeable the moment
  // it is created, rather than added with one photo and then reopened to
  // become a gallery. photos[0] is the cover.
  const [photos,   setPhotos]   = useState([]);   // [{ file, preview, kind }]
  const [imgInfo,  setImgInfo]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  // OFF by default, and it stays off until the admin ticks it. It used to
  // default ON, which meant every upload was silently re-cut by the model:
  // most product shots already arrive on white, so it was work for nothing,
  // and on a real photo it costs actual picture quality — the model softens
  // and nibbles edges, and the result is re-encoded on top. Adding a white
  // background is a decision about the product, so the person who knows the
  // product makes it.
  const [removeBg,   setRemoveBg]   = useState(false);
  const [bgStatus,   setBgStatus]   = useState('');   // progress text while processing
  // The hint describes the whole batch. Only when EVERY picked photo is
  // already on a clean backdrop is there truly nothing to remove; one real
  // photo in the set and the toggle is worth offering.
  const bgKind = photos.length === 0 ? 'photo'
    : photos.every(p => p.kind === 'transparent') ? 'transparent'
    : photos.every(p => p.kind === 'white' || p.kind === 'transparent') ? 'white'
    : 'photo';
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const movePhoto = (from, to) => setPhotos(prev => {
    if (to < 0 || to >= prev.length) return prev;
    const next = prev.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  });

  // Revoke the object URL as the thumbnail goes. These hold the whole file
  // in memory, and an admin trying shots out on a phone would otherwise
  // accumulate every photo they picked until the tab was closed.
  const removePhoto = (i) => setPhotos(prev => {
    URL.revokeObjectURL(prev[i].preview);
    return prev.filter((_, n) => n !== i);
  });

  // Same reason, for whatever is still on screen when the modal closes.
  // photosRef, not photos, so the cleanup sees the final list rather than
  // the empty one this effect closed over on mount.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach(x => URL.revokeObjectURL(x.preview)), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim())     { setError('Product name is required.');   return; }
    if (!form.price)           { setError('Price is required.');          return; }
    if (isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setError('Enter a valid price.'); return;
    }
    // products.category is NOT NULL in the database, but this form offered
    // "— None —" and sent null for it, so adding a product without picking a
    // category failed with a raw Postgres constraint error the owner could
    // do nothing with. It failed AFTER the photos had uploaded, too, so every
    // attempt left orphaned files in storage. Checked here, before any upload
    // starts. Required is also the right answer on its own terms: the shop is
    // browsed by category, so a product without one is unreachable.
    if (!form.category) {
      setError('Pick a category — the shop is browsed by category, so a product without one has nowhere to appear.');
      return;
    }
    setSaving(true);
    try {
      // Upload in the order they were picked, so images[0] really is the
      // cover the admin saw first. Sequential rather than parallel on
      // purpose: this runs on Kenyan mobile data, where four uploads racing
      // each other finish slower than four in a row and give the admin no
      // honest progress to watch.
      const urls = [];
      for (let i = 0; i < photos.length; i++) {
        setBgStatus(photos.length > 1 ? `Photo ${i + 1} of ${photos.length}…` : 'Uploading…');
        urls.push(await uploadProductPhoto(photos[i].file, {
          removeBg,
          onStatus: (msg) => setBgStatus(photos.length > 1 ? `Photo ${i + 1} of ${photos.length} — ${msg}` : msg),
        }));
      }
      const image_url = urls[0] ?? null;
      const qty = form.quantity === '' ? null : Number(form.quantity);
      const status = form.status === 'Available' || form.status === 'Low Stock'
        ? statusFromQty(qty ?? 999)
        : form.status;
      const row = {
        name:      form.name.trim(),
        price:     Number(form.price),
        category:  form.category || null,
        status,
        image_url,
        // The trigger mirrors images[0] back into image_url, so these can
        // never disagree; both are sent so the row is correct even if the
        // trigger is missing on some other database.
        images: urls,
        created_at: new Date().toISOString(),
      };
      // quantity is `int not null default 0` in the database, but a blank
      // stock box produced null here and Postgres rejected the whole insert
      // — so adding a product without typing a stock count failed with a
      // raw constraint error, after the photos had already uploaded. The key
      // is omitted rather than forced to 0 so the column's own default
      // stands: "not counted yet" is the database's decision to define, not
      // this form's to invent.
      if (qty !== null) row.quantity = qty;

      const colours = parseColours(form.colours);
      if (colours) row.colours = colours;
      // Set when the colours column had to be dropped, so the success
      // message can say so. A local flag, not the toast state — `toast`
      // lives in ProductsTab, not in this modal, and reading it here threw
      // a ReferenceError.
      let noteColoursSkipped = false;
      let noteGallerySkipped = false;

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
      // Same rescue for the gallery column: on a database without migration
      // 20260907000000 the whole insert is rejected for one unknown key.
      // Save the product with its cover rather than lose it — the extra
      // photos are already in storage and can be re-attached later.
      if (err && (err.code === 'PGRST204' || /images/i.test(err.message || ''))) {
        delete row.images;
        ({ data, error: err } = await supabase.from('products').insert(row).select().single());
        if (!err) noteGallerySkipped = true;
      }
      if (err) throw err;
      onAdded(data);
      showToast(
        noteColoursSkipped
          ? 'Product added — colours need the database migration first.'
          : noteGallerySkipped
            ? 'Product added with its cover — extra photos need the database migration first.'
            : urls.length > 1
              ? `Product added with ${urls.length} photos.`
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
            <label className="form-label">
              Product Photos
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted2)', fontSize: 12, marginLeft: 6 }}>
                pick several — the first is the cover, the rest swipe
              </span>
            </label>

            {/* Same grid as the Photos manager, so adding photos looks and
                behaves identically whether the product exists yet or not. */}
            <ul className="photo-grid">
              {photos.map((ph, i) => (
                <li key={ph.preview} className={`photo-cell${i === 0 ? ' photo-cell--cover' : ''}`}>
                  <img src={ph.preview} alt={`Photo ${i + 1}`} />
                  {i === 0 && <span className="photo-cell__tag">Cover</span>}
                  <div className="photo-cell__bar">
                    <button type="button" title="Move left" disabled={i === 0 || saving}
                      onClick={() => movePhoto(i, i - 1)}>‹</button>
                    <button type="button" title="Move right" disabled={i === photos.length - 1 || saving}
                      onClick={() => movePhoto(i, i + 1)}>›</button>
                    <button type="button" title="Remove" className="photo-cell__del" disabled={saving}
                      onClick={() => removePhoto(i)}>✕</button>
                  </div>
                </li>
              ))}
              <li className="photo-cell photo-cell--add" onClick={() => !saving && fileRef.current?.click()}>
                <span>{photos.length ? '+ Add more' : '+ Add photos'}</span>
              </li>
            </ul>
            {imgInfo && <p className="form-hint">{imgInfo}</p>}
            {/* multiple: pick all four shots of one bag in one go. Each file
                still goes through handleImgSelect, so the type and size
                checks are exactly the ones a single pick always had. */}
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => {
                const picked = [];
                for (const f of e.target.files) {
                  handleImgSelect({ target: { files: [f] } }, {
                    onFile: (good) => picked.push(good),
                    onError: setError,
                  });
                }
                e.target.value = '';        // let the same file be picked again
                if (!picked.length) return;
                const added = picked.map(file => ({
                  file, preview: URL.createObjectURL(file),
                  kind: 'photo',            // until the detector says otherwise
                }));
                setPhotos(prev => [...prev, ...added]);
                setImgInfo(`${(picked.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)} MB selected`);
                // Read each photo's edges in the background. It drives the
                // hint and the storage folder — never the toggle, which is
                // the admin's to tick.
                added.forEach(entry => detectBackground(entry.file).then(kind =>
                  setPhotos(prev => prev.map(x => (x.preview === entry.preview ? { ...x, kind } : x)))));
              }} />

            {photos.length > 0 && (
              <label className="bg-removal-toggle">
                <input type="checkbox" checked={removeBg}
                  onChange={e => setRemoveBg(e.target.checked)} disabled={saving} />
                <span>
                  Remove background &amp; apply the white-stage look
                  <span className="form-hint" style={{ marginTop: 2 }}>
                    {bgKind === 'white'
                      ? 'Already on white — leave this off, there is nothing to add.'
                      : bgKind === 'transparent'
                        ? 'Already cutouts — leave this off, there is nothing to remove.'
                        : 'Only for a photo with a background you want gone. It runs in your browser and re-cuts the picture, which costs some quality — leave it off if the shot is already good.'}
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
                <option value="">— Choose —</option>
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
  const [photosFor,      setPhotosFor]      = useState(null);   // product whose gallery is open
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Photo count doubles as the label — the owner can see
                          at a glance which products still have only one shot. */}
                      <button className="btn btn-outline"
                        style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                        onClick={() => setPhotosFor(p)}>
                        Photos ({galleryOf(p).length})
                      </button>
                      <button className="btn btn-danger"
                        style={{ height: 30, padding: '0 10px', fontSize: 11 }}
                        onClick={() => deleteProduct(p.id, p.name)}>
                        Delete
                      </button>
                    </div>
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

      {photosFor && (
        <PhotosModal
          product={photosFor}
          onClose={() => setPhotosFor(null)}
          // Keep the open modal AND the table row on the same data, so the
          // count in the button and the thumbnail update as photos land.
          onSaved={(updated) => {
            setPhotosFor(updated);
            setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
          }}
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
