import Link from "next/link";
import styles from "./Pill.module.css";

type Variant = "filled" | "ghost";

type Props = {
  children: React.ReactNode;
  href?: string;
  variant?: Variant;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  external?: boolean;
  className?: string;
};

/**
 * The only button in the product. Filled carries a soft bloom; ghost is a
 * hairline outline. Press scales to 0.98 — transform only, never layout.
 */
export default function Pill({
  children, href, variant = "ghost", type = "button",
  onClick, disabled, external, className = "",
}: Props) {
  const cls = `${styles.pill} ${styles[variant]} ${className}`.trim();

  if (href) {
    if (external) {
      return (
        <a className={cls} href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      );
    }
    return <Link className={cls} href={href}>{children}</Link>;
  }

  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
