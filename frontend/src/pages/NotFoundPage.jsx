import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-8xl font-black text-gradient">404</h1>
      <h2 className="text-2xl font-bold">Page not found</h2>
      <p className="text-[var(--text-secondary)] max-w-sm">
        Sorry, we couldn't find the page you're looking for.
      </p>
      <Link to="/" className="btn-primary px-8 py-3 rounded-xl text-base">
        Go back home
      </Link>
    </div>
  );
}
