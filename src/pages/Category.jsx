import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ProductCard from '../components/ProductCard';
import Lightbox from '../components/Lightbox';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useSeo, productListJsonLd } from '../lib/seo';
import './Category.css';

export default function Category() {
  const { name }                  = useParams();
  const [products, setProducts]   = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState(null);
  const [lbIndex,  setLbIndex]    = useState(null);
  const label = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const openLightbox  = useCallback((product) => {
    const idx = filtered.findIndex(p => p.id === product.id);
    setLbIndex(idx >= 0 ? idx : 0);
  }, [filtered]);
  const closeLightbox = useCallback(() => setLbIndex(null), []);
  const prevProduct   = useCallback(() => setLbIndex(i => Math.max(0, i - 1)), []);
  const nextProduct   = useCallback(() => setLbIndex(i => Math.min(filtered.length - 1, i + 1)), [filtered.length]);

  // Long-tail, high-intent title: the category, the city, and the two words
  // people actually search for in Kenyan resale ("authentic", "pre-loved").
  // The ItemList JSON-LD hands Google the names and prices on this page.
  useSeo({
    title: `${label} in Nairobi — Authentic & Pre-loved`,
    description: `Shop ${filtered.length || ''} ${label.toLowerCase()} at Kamili Nairobi. Delivered across Kenya, ordered on WhatsApp.`.replace('  ', ' '),
    path: `/category/${name}`,
    image: filtered[0]?.image_url,
    jsonLd: productListJsonLd(filtered, label),
  });

  useScrollReveal();

  useEffect(() => {
    setLoading(true); setError(null);

    supabase.from('products')
      .select('*')
      .eq('category', label)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError('Failed to load products.'); }
        else { setProducts(data || []); setFiltered(data || []); }
        setLoading(false);
      });
  }, [name]);

  return (
    <div className="category-page">
      <div className="cat-hero">
        <div className="container">
          <span className="section-eyebrow">Kamili / {label}</span>
          <h1 className="cat-hero__title">{label}</h1>
          {/* Sub-headline carries the keywords a bare noun H1 can't. */}
          <p className="cat-hero__blurb">
            Authentic &amp; pre-loved {label.toLowerCase()} in Nairobi
          </p>
          <p className="cat-hero__count">
            {loading ? '' : `${filtered.length} ${filtered.length === 1 ? 'piece' : 'pieces'}`}
          </p>
        </div>
      </div>

      <div className="container">
        {loading ? (
          <div className="products-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-img" />
                <div className="skeleton-text" />
                <div className="skeleton-text skeleton-text--short" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="empty-state">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No products in this category yet.</p>
        ) : (
          <div className="products-grid">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={openLightbox} />
            ))}
          </div>
        )}
      </div>

      <Lightbox
        product={lbIndex !== null ? filtered[lbIndex] : null}
        onClose={closeLightbox}
        onPrev={prevProduct}
        onNext={nextProduct}
        hasPrev={lbIndex > 0}
        hasNext={lbIndex !== null && lbIndex < filtered.length - 1}
      />
    </div>
  );
}
