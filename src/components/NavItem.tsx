import "./NavItem.css";

interface NavItemProps {
  icon: string;
  label: string;
  w: number;
  h: number;
  active?: boolean;
  onClick?: () => void;
}

export default function NavItem({ icon, label, w, h, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className={`nav-item${active ? " nav-item--active" : ""}`}
      onClick={onClick}
    >
      <span className="nav-item__icon">
        <img src={icon} width={w} height={h} alt="" />
      </span>
      <span className="nav-item__label">{label}</span>
    </button>
  );
}
