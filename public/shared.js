export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => (n == null ? '?' : `₹${Math.round(n).toLocaleString('en-IN')}`);

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

export function confetti(count = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#8a63f0', '#ff6b5e', '#16a47a', '#ffc23d', '#ff9ecb'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
    c.style.setProperty('--r', `${Math.random() * 720}deg`);
    c.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}
