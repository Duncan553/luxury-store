import './Marquee.css';

const TEXT = 'KAMILI · LUXURY REDEFINED · NAIROBI · EST. 2024 · HANDPICKED · EXCLUSIVE · ';

export default function Marquee({ inverted = false }) {
  const track = TEXT.repeat(6);
  return (
    <div className={`marquee${inverted ? ' marquee--inv' : ''}`} aria-hidden="true">
      <div className="marquee__track">{track}</div>
      <div className="marquee__track marquee__track--offset">{track}</div>
    </div>
  );
}
