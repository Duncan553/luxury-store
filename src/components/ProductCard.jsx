import { useCart } from '../context/CartContext';
import './ProductCard.css';

export default function ProductCard({ product, onOpen }) {
  const { addItem, vacationMode } = useCart();
  const { id, name, price, image_url, status, category } = product;

  const isUnavailable = status === 'Out of Stock';
  const isPreOrder    = status === 'Pre-Order';

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
      <div className="pcard__img aspect-portrait"
        style={{ cursor: onOpen ? 'pointer' : 'default' }}
        onClick={onOpen ? () => onOpen(product) : undefined}>
        {image_url
          ? <img src={image_url} alt={name} className="img-cover" loading="lazy" />
          : <div className="pcard__img-placeholder" />
        }
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
              onClick={(e) => { e.stopPropagation(); addItem({ id, name, price, image_url, status, category }); }}
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
                onClick={() => addItem({ id, name, price, image_url, status, category })}>
                {addShort}
              </button>
          }
        </div>
      </div>
    </article>
  );
}
