export function DecorativeSprig({ placement = 'heading' }) {
  return <img className={`decorative-sprig decorative-sprig--${placement}`} src="/assets/botanical-sprig.png" alt="" aria-hidden="true" />;
}
