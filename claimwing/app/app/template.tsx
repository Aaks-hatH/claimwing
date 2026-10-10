/** Re-mounts on every navigation inside the app, so each page eases in. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
