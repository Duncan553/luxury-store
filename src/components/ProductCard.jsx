import { useCart } from '../context/CartContext';
import { galleryOf, isCutoutUrl } from '../lib/gallery';
import './ProductCard.css';

export default function ProductCard({ product, onOpen }) {
  const { addItem, vacationMode } = useCart();
  // quantity has to travel into the cart snapshot — without it, the cart's
  // stock cap (CartContext.jsx) has nothing to check against and silently
  // allows unlimited quantity of anything added from this card.
  const { id, name, price, image_url, status, category, quantity } = product;

  const isUnavailable = status === 'Out of Stock';
  const isPreOrder    = status === 'Pre-Order';
  // The card shows ONE photo — the cover — and says how many more there are.
  // The gallery itself is swipeable in Quick View: a card that swipes would
  // fight the tap that opens the product, and on a grid of twelve cards it
  // would mean twelve scroll containers competing with the page's own
  // vertical scroll on a phone.
  const photos = galleryOf(product);
  const cover  = photos[0] ?? image_url;
  // White-stage treatment is decided per photo, from the storage path the
  // uploader wrote — no DB column, so it needed no migration.
  const isCutout = isCutoutUrl(cover);

  // C2: during vacation mode, available products show a pre-order message instead
  // of "Add to Cart". Items still go into the cart and can be paid for — they just
  // dispatch after the store reopens. Never disable; always capture the intent.
  const addLabel  = vacationMode && !isPreOrder
    ? 'Pre-order — dispatches on reopen'
    : isPreOrder ? 'Pre-Order' : 'Add to Cart';
  // Was a bare '+' glyph — meant nothing to a first-time visitor and was
  // the ONLY mobile add-to-cart control before the hover-overlay fix above.
  const addShort  = vacationMode && !isPreOrder
    ? 'Pre-order'
    : isPreOrder ? 'Pre-Order' : 'Add to Cart';

  return (
    <article className={`pcard${isUnavailable ? ' pcard--oos' : ''}`}>
      <div className={`pcard__img aspect-portrait${isCutout ? ' pcard__img--cutout' : ''}`}
        style={{ cursor: onOpen ? 'pointer' : 'default' }}
        onClick={onOpen ? () => onOpen(product) : undefined}>
        {cover
          ? <img src={cover} alt={name} className="img-cover" loading="lazy" />
          : <div className="pcard__img-placeholder" />
        }
        {/* Only worth showing when there IS more to see. Sits opposite the
            status badge so the two never collide. */}
        {photos.length > 1 && (
          <span className="pcard__count" aria-label={`${photos.length} photos`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" aria-hidden="true">
              <rect x="8" y="8" width="13" height="13" rx="1" />
              <path d="M4 16V4a1 1 0 0 1 1-1h11" />
            </svg>
            {photos.length}
          </span>
        )}
        {isPreOrder    && <span className="pcard__badge">Pre-Order</span>}
        {isUnavailable && <span className="pcard__badge pcard__badge--oos">Out of Stock</span>}
        {vacationMode && !isPreOrder && !isUnavailable &&
          <span className="pcard__badge pcard__badge--vacation">Vacation</span>}

        <div className="pcard__overlay">
          {onOpen && (
            <button className="pcard__overlay-btn pcard__overlay-btn--view"
              onClick={(e) => { e.stopPropagation(); onOpen(product); }}>
              Quick View
            </button>
          )}
          {!isUnavailable && (
            <button
              className="pcard__overlay-btn"
              onClick={(e) => { e.stopPropagation(); addItem({ id, name, price, image_url, status, category, quantity }); }}
            >
              {addLabel}
            </button>
          )}
        </div>
      </div>

      <div className="pcard__body">
        <p className="pcard__cat">{category}</p>
        <h3 className="pcard__name">{name}</h3>
        <div className="pcard__footer">
          <p className="pcard__price">Ksh {Number(price).toLocaleString('en-KE')}</p>
          {isUnavailable
            ? <button className="pcard__btn pcard__btn--oos" disabled>Sold Out</button>
            : <button className="pcard__btn"
                onClick={() => addItem({ id, name, price, image_url, status, category, quantity })}>
                {addShort}
              </button>
          }
        </div>
      </div>
    </article>
  );
}
