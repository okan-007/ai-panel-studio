import { Link, useLocation } from "react-router-dom";
import styles from "./Header.module.css";

export default function Header() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <header className={styles.header} data-testid="header">
      <div className={styles.inner}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoIcon}>🎙️</span>
          <span className={styles.logoText}>AI Panel Studio</span>
        </Link>

        <nav className={styles.nav}>
          <Link
            to="/"
            className={`${styles.navLink} ${isHome ? styles.navLinkActive : ""}`}
          >
            讨论列表
          </Link>
        </nav>
      </div>
    </header>
  );
}
