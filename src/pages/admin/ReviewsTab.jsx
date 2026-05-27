// ReviewsTab — pending reviews only.
// Approved reviews live on the About page; admin only sees what needs action.
import { supabase } from '../../lib/supabase';

export default function ReviewsTab({ reviews, refetch }) {
  async function approve(id) {
    await supabase.from('reviews').update({ status: 'approved' }).eq('id', id);
    refetch();
  }

  async function remove(id) {
    if (!window.confirm('Delete this review?')) return;
    await supabase.from('reviews').delete().eq('id', id);
    refetch();
  }

  if (reviews.length === 0) {
    return <p className="admin-empty" style={{ padding: '32px 0' }}>No pending reviews — all caught up.</p>;
  }

  return (
    <div className="reviews-list">
      {reviews.map(r => (
        <div key={r.id} className="admin-review">
          <div className="admin-review__meta">
            <span className="admin-review__stars" style={{ color: 'var(--gold)' }}>
              {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
            </span>
            <span className="admin-review__author">{r.name || 'Anonymous'}</span>
            <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 'auto' }}>
              {r.created_at ? new Date(r.created_at).toLocaleDateString('en-KE') : ''}
            </span>
          </div>
          <p className="admin-review__text">"{r.text}"</p>
          <div className="admin-review__actions">
            <button className="btn btn-gold"
              style={{ height: 36, padding: '0 16px', fontSize: 12 }}
              onClick={() => approve(r.id)}>
              ✓ Approve
            </button>
            <button className="btn btn-danger"
              style={{ height: 36, padding: '0 16px', fontSize: 12 }}
              onClick={() => remove(r.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
