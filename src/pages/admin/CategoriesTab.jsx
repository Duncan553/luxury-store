// CategoriesTab — list + add modal.
// The add form is hidden behind a button so it doesn't dominate the view.
import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { handleImgSelect, uploadImage } from '../../lib/imageUpload';

export default function CategoriesTab({ categories, products, refetch }) {
  const [showModal, setShowModal] = useState(false);
  const [catName,   setCatName]   = useState('');
  const [imgFile,   setImgFile]   = useState(null);
  const [preview,   setPreview]   = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const fileRef = useRef(null);

  function resetForm() {
    setCatName(''); setImgFile(null); setPreview(''); setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (!catName.trim()) { setError('Category name is required.'); return; }
    const slug = catName.trim().toLowerCase().replace(/\s+/g, '-');
    if (categories.some(c => c.slug === slug)) {
      setError('A category with this name already exists.'); return;
    }
    setSaving(true);
    try {
      let coverUrl = null;
      if (imgFile) coverUrl = await uploadImage(imgFile, 'categories');
      await supabase.from('categories').insert({
        name: catName.trim(), slug, cover_url: coverUrl,
        created_at: new Date().toISOString(),
      });
      resetForm();
      setShowModal(false);
      refetch();
    } catch (err) {
      setError(err.message || 'Failed to add category.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id, name) {
    const count = products.filter(p => p.category === name).length;
    const msg   = count > 0
      ? `Delete "${name}"? It has ${count} product(s) — they'll become uncategorised.`
      : `Delete "${name}"?`;
    if (!window.confirm(msg)) return;
    await supabase.from('categories').delete().eq('id', id);
    refetch();
  }

  return (
    <div>
      <div className="tab-header-row">
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        </span>
        <button className="btn btn-gold" style={{ height: 38, padding: '0 18px', fontSize: 12 }}
          onClick={() => { resetForm(); setShowModal(true); }}>
          + Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="admin-empty">No categories yet. Add one to start organising products.</p>
      ) : (
        <div className="cat-list">
          {categories.map(c => (
            <div key={c.id} className="cat-row">
              <div className="cat-row__thumb">
                {c.cover_url
                  ? <img src={c.cover_url} alt={c.name} className="img-cover" />
                  : <div className="cat-row__thumb-empty" />}
              </div>
              <div className="cat-row__info">
                <span className="cat-row__name">{c.name}</span>
                <span className="cat-row__meta">
                  /category/{c.slug} · {products.filter(p => p.category === c.name).length} products
                </span>
              </div>
              <button className="btn btn-danger"
                style={{ height: 32, padding: '0 12px', fontSize: 11 }}
                onClick={() => deleteCategory(c.id, c.name)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add category modal ────────────────────────────────────────── */}
      {showModal && (
        <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h3>Add Category</h3>
              <button className="admin-modal__close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder="e.g. Shoes, Scarves, Sunglasses" autoFocus />
              </div>

              <div className="form-group">
                <label className="form-label">Cover Image (optional)</label>
                <div className="img-upload img-upload--sm" onClick={() => fileRef.current?.click()}>
                  {preview
                    ? <img src={preview} alt="Cover" className="img-cover" style={{ width: '100%', height: '100%' }} />
                    : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Tap to upload</span>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => handleImgSelect(e, {
                    onFile: setImgFile, onPreview: setPreview, onInfo: () => {}, onError: setError,
                  })} />
              </div>

              {error && <p className="form-error">{error}</p>}

              <div className="admin-modal__footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-gold" disabled={saving}>
                  {saving ? 'Adding…' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
