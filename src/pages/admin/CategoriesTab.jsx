// CategoriesTab — list + add modal.
// The add form is hidden behind a button so it doesn't dominate the view.
import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { handleImgSelect, uploadCover } from '../../lib/imageUpload';

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
      // uploadCover, not uploadImage: a cover also needs its 380w and
      // 760w versions, or the deck serves phones the full-size file.
      if (imgFile) coverUrl = await uploadCover(imgFile, slug);
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
    // The old wording said the products "become uncategorised", which isn't
    // what happens. Deleting the row leaves each product still labelled with
    // this category name, but with nothing pointing at it: no nav link, no
    // card on the homepage or About deck. They're not uncategorised, they're
    // unreachable — findable only by typing the URL. Say that, because the
    // fix (move them first) is different from what the old message implied.
    const msg   = count > 0
      ? `Delete "${name}"?\n\n${count} product(s) are in it. They will NOT be deleted, but they will stop being reachable — the category disappears from the menu and the homepage, and nothing will link to them.\n\nMove them to another category first if you want to keep them visible.`
      : `Delete "${name}"? It has no products.`;
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
