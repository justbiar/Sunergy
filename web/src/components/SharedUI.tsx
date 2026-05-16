"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useI18n } from './I18nProvider';

// ─── Brand logo (mark + wordmark) ───
export function BrandLogo({ size = 22, showWord = true }) {
  return (
    <span className="brand">
      <span className="brand-mark" style={{ width: size, height: size }} />
      {showWord && <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>sunergy</span>}
    </span>
  );
}

// ─── Banner / notification bar ───
export function Banner() {
  const { t } = useI18n();
  return (
    <div className="banner">
      <div className="wrap banner-inner">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="tag-dot live" style={{ background: '#a0b5eb' }} />
          {t.banner_text}
        </span>
        <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t.banner_cta} <Arrow /></a>
      </div>
    </div>
  );
}

// ─── Nav ───
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';

export function Nav({ view, setView = () => {} }: any) {
  const { t, lang, setLang } = useI18n();
  const { address, isConnected } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);
  const router = useRouter();

  return (
    <>
    <header className="nav">
      <div className="wrap nav-inner">
        <div className="nav-left">
          <a onClick={() => router.push('/')} style={{ cursor: 'pointer' }}><BrandLogo /></a>
          {view === 'landing' && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <a className="nav-link" href="#protocol">{t.nav_protocol}</a>
              <a className="nav-link" href="#how">{t.nav_how}</a>
              <a className="nav-link" href="#docs">{t.nav_docs}</a>
            </nav>
          )}
        </div>
        <div className="nav-right">
          <button className="nav-link" onClick={() => setLang(lang === 'en' ? 'tr' : 'en')} title="Change language" style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {lang === 'en' ? 'EN · TR' : 'TR · EN'}
          </button>
          {view === 'landing' ? (
            <React.Fragment>
              <button className="btn btn-quiet" onClick={() => router.push('/app')}>{t.nav_dashboard}</button>
              {isConnected ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setWalletOpen(true)}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: '#1f8a5b', boxShadow: '0 0 0 3px rgba(31,138,91,0.18)' }} />
                  {address?.slice(0, 6) + '...' + address?.slice(-4)}
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setWalletOpen(true)}>{t.nav_connect}</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => router.push('/app')}>{t.nav_launch} <Arrow color="#f6f3f1" /></button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button className="btn btn-quiet" onClick={() => router.push('/')}>{t.nav_back_home}</button>
              {isConnected ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setWalletOpen(true)}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: '#1f8a5b', boxShadow: '0 0 0 3px rgba(31,138,91,0.18)' }} />
                  {address?.slice(0, 6) + '...' + address?.slice(-4)}
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setWalletOpen(true)}>{t.nav_connect}</button>
              )}
            </React.Fragment>
          )}
        </div>
      </div>
    </header>
    <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} isConnected={isConnected} />
    </>
  );
}

// ─── Arrow ───
export function Arrow({ color = 'currentColor', size = 12 }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ verticalAlign: 'middle' }}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Tag ───
export function Tag({ children, variant }: any) {
  return <span className={'tag' + (variant === 'soft' ? ' tag-soft' : '')}>{children}</span>;
}

// ─── Stat / KPI ───
export function Stat({ label, value, suffix, sub }: any) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}{suffix && <small>{suffix}</small>}</div>
      {sub && <div className="t-body-sm faint" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Animated counter ───
export function useCounter(target: number, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start: number;
    let raf: number;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CountUp({ to, decimals = 0, format }: any) {
  const v = useCounter(to);
  const n = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format ? format(v) : n}</span>;
}

// ─── Modal ───
export function Modal({ open, onClose, children, size }: any) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className={'modal' + (size === 'lg' ? ' modal-lg' : '')} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Wallet connect modal ───
import { useConnect, useDisconnect } from 'wagmi';

export function WalletModal({ open, onClose, isConnected }: any) {
  const { t } = useI18n();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = (connector: any) => {
    connect({ connector });
    onClose();
  };

  const wallets = [
    { key: 'metaMask', label: t.wallet_metamask, mark: '🦊', color: '#f6851b' },
    { key: 'walletConnect', label: t.wallet_walletconnect, mark: 'wc', color: '#3b99fc' },
    { key: 'rabby', label: t.wallet_rabby, mark: 'rb', color: '#7084ff' },
    { key: 'phantom', label: t.wallet_phantom, mark: '👻', color: '#ab9ff2' },
    { key: 'safe', label: t.wallet_safe, mark: '🔐', color: '#12ff80' },
  ];

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 className="font-serif" style={{ margin: 0, fontSize: 28, letterSpacing: '-0.02em' }}>
          {isConnected ? t.wallet_disconnect : t.wallet_title}
        </h3>
        <button className="btn btn-quiet" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="close">×</button>
      </div>
      <p className="t-body-sm muted" style={{ margin: '0 0 24px' }}>
        {isConnected ? 'Disconnect your wallet from Sunergy.' : t.wallet_sub}
      </p>
      
      {isConnected ? (
        <button 
          className="btn btn-primary" 
          onClick={() => { disconnect(); onClose(); }}
          style={{ width: '100%', padding: '16px' }}
        >
          {t.wallet_disconnect}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connectors.map((c) => {
            const w = wallets.find(w => c.name.toLowerCase().includes(w.key.toLowerCase())) || { key: c.id, label: c.name, mark: c.name[0], color: '#333' };
            return (
              <button key={c.uid} onClick={() => handleConnect(c)} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                border: '1px solid var(--color-hairline)', borderRadius: 18, background: 'transparent',
                font: 'inherit', cursor: 'pointer', textAlign: 'left',
              }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.03)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <span style={{
                  width: 32, height: 32, borderRadius: 10, background: w.color,
                  display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 600,
                }}>{w.mark}</span>
                <span style={{ flex: 1, fontSize: 15, letterSpacing: '-0.01em' }}>{w.label}</span>
                <Arrow />
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Footer ───
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer" style={{ background: 'var(--color-paper-canvas)' }}>
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <BrandLogo size={28} />
            <p className="t-body-sm muted" style={{ marginTop: 16, maxWidth: 280 }}>{t.footer_tag}</p>
          </div>
          <div>
            <h4>{t.footer_protocol}</h4>
            <ul>
              <li><a href="#">Whitepaper</a></li>
              <li><a href="#">SUN Tokenomics</a></li>
              <li><a href="#">Carbon Registry</a></li>
              <li><a href="#">Audits</a></li>
            </ul>
          </div>
          <div>
            <h4>{t.footer_resources}</h4>
            <ul>
              <li><a href="#">Documentation</a></li>
              <li><a href="#">Edge node spec</a></li>
              <li><a href="#">SP1 circuits</a></li>
              <li><a href="#">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4>{t.footer_community}</h4>
            <ul>
              <li><a href="#">Discord</a></li>
              <li><a href="#">Telegram</a></li>
              <li><a href="#">X (Twitter)</a></li>
              <li><a href="#">Forum</a></li>
            </ul>
          </div>
        </div>
        <div className="hr" style={{ margin: '48px 0 24px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span className="t-body-sm faint">{t.footer_legal}</span>
          <span className="t-body-sm faint" style={{ fontFamily: 'var(--font-mono)' }}>v0.9.4-alpha · monad-mainnet · sp1@4.0</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Sparkline (SVG) ───
export function Sparkline({ data, color = 'var(--color-off-black)', accent = 'var(--accent)', height = 36, width = 120 }: any) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v: number, i: number) => [i * (width / (data.length - 1)), height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p: number[], i: number) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dArea = d + ` L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={dArea} fill={accent} opacity="0.35" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />}
    </svg>
  );
}

// ─── Section header ───
export function SectionHead({ eyebrow, title, sub, align = 'left' }: any) {
  return (
    <div style={{ textAlign: align, maxWidth: align === 'center' ? 720 : 820, margin: align === 'center' ? '0 auto' : 0 }}>
      {eyebrow && <div className="t-caption faint" style={{ marginBottom: 16, fontFamily: 'var(--font-mono)' }}>· {eyebrow}</div>}
      <h2 className="font-serif" style={{ margin: 0, fontSize: 'clamp(36px, 4.5vw, 60px)', letterSpacing: '-0.03em' }}>{title}</h2>
      {sub && <p className="muted" style={{ marginTop: 28, fontSize: 17, letterSpacing: '-0.01em', maxWidth: 620 }}>{sub}</p>}
    </div>
  );
}
