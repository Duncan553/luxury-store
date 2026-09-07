import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { galleryOf } from '../../lib/gallery';
import {
  handleImgSelect, uploadImage, removeBackground, detectBackground, findTrimBox,
} from '../../lib/imageUpload';

// Manage every photo on one product: add more, drop one, choose which is the
// cover. Deliberately ONE screen for both new and old products — the Add
// Product form still takes a single photo (the cover), and everything after
// that happens here, so there is exactly one place to learn.
//
// The gallery order IS the data: images[0] is the cover, and the database
// trigger mirrors it into image_url. So "Make cover" is just a move to the
// front — no separate flag to keep in step.
export default function PhotosModal({ product, onClose, onSaved, showToast }) {
  const [images, setImages] = useState(galleryOf(product));
  const [busy,   setBusy]   = useState('');      // progress text, '' when idle
  const [error,  setError]  = useState('');
  const fileRef = useRef(null);

  // Every change writes straight to the database. A staged "save later" list
  // would let the admin close the tab believing photos were uploaded when
  // only the local array had changed — the files are already in storage by
  // then, so the row is the only thing that can still be wrong.
  async function persist(next) {
    const before = images;
    setImages(next);                                    // optimistic
    const { error: err } = await supabase
      .from('products').update({ images: next }).eq('id', product.id);
    if (err) {
      setImages(before);                                // put it back
      // The column only exists after migration 20260907000000. Say so plainly
      // instead of showing a raw PostgREST error nobody can act on.
      const missing = /column|schema cache/i.test(err.message);
      setError(missing
        ? 'The products.images column is missing — run migration 20260907000000_product_images.sql, then try again.'
        : `Could not save: ${err.message}`);
      return false;
    }
    setError('');
    // image_url is what the cards and cart read; the trigger has just set it
    // to images[0], so hand the same value back to the table's row.
    onSaved?.({ ...product, images: next, image_url: next[0] ?? null });
    return true;
  }

  async function addFiles(files) {
    setError('');
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const kind = await detectBackground(file);
        // Same rule as the add form: the model only runs when a human asks
        // for it. Here nobody has, so a photo is uploaded as shot — trimmed
        // of its empty margin when it has one, never re-cut.
        const crop = await findTrimBox(file, kind);
        const clean = kind === 'white' || kind === 'transparent';
        urls.push(await uploadImage(file, 'products', {
          isCutout: clean, hasAlpha: kind === 'transparent', crop,
        }));
      } catch (e) {
        setError(e.message);
        break;                                          // keep whatever landed
      }
    }
    setBusy('');
    if (urls.length) {
      const ok = await persist([...images, ...urls]);
      if (ok) showToast?.(`${urls.length} photo${urls.length > 1 ? 's' : ''} added.`, 'success');
    }
  }

  const move = (from, to) => {
    if (to < 0 || to >= images.length) return;
    const next = images.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    persist(next);
  };

  // No window.confirm here: removing a photo from the list is one click to
  // undo (re-add it), unlike deleting the product itself. The file stays in
  // storage, so nothing is destroyed by this button.
  const remove = (i) => persist(images.filter((_, n) => n !== i));

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--lg" onClick={e => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h3>Photos — {product.name}</h3>
          <button className="admin-modal__close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
        <p className="form-hint" style={{ marginBottom: 14 }}>
          The first photo is the cover — it is what shows on the shop grid and
          in the cart. The rest become the swipeable gallery.
        </p>

        <ul className="photo-grid">
          {images.map((url, i) => (
            <li key={url} className={`photo-cell${i === 0 ? ' photo-cell--cover' : ''}`}>
              <img src={url} alt={`${product.name} ${i + 1}`} />
              {i === 0 && <span className="photo-cell__tag">Cover</span>}
              <div className="photo-cell__bar">
                <button title="Move left"  onClick={() => move(i, i - 1)} disabled={i === 0}>‹</button>
                <button title="Move right" onClick={() => move(i, i + 1)} disabled={i === images.length - 1}>›</button>
                <button title="Remove" className="photo-cell__del" onClick={() => remove(i)}>✕</button>
              </div>
            </li>
          ))}

          <li className="photo-cell photo-cell--add" onClick={() => !busy && fileRef.current?.click()}>
            <span>{busy || '+ Add photos'}</span>
          </li>
        </ul>

        {/* multiple: the whole point — pick the four shots of one bag at once. */}
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => {
            // handleImgSelect validates ONE file (type + size) and is what the
            // rest of admin uses; run it per file so a 30MB video renamed .jpg
            // is caught here exactly as it is on the add form.
            const picked = [...e.target.files];
            const ok = [];
            for (const f of picked) {
              handleImgSelect({ target: { files: [f] } }, {
                onFile: (good) => ok.push(good),
                onError: setError,
              });
            }
            e.target.value = '';                        // allow re-picking the same file
            if (ok.length) addFiles(ok);
          }} />

        {error && <p className="form-error">{error}</p>}
        </div>

        <div className="admin-modal__footer">
          <button className="btn btn-outline" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
