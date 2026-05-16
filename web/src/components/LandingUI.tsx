"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from './I18nProvider';
import { Tag, Arrow, CountUp, SectionHead, Sparkline } from './SharedUI';
import { useRouter } from 'next/navigation';

export function HeroOrb() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div style={{ position: 'relative', padding: '80px 0 100px', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-10%', right: '-8%', width: '62%', aspectRatio: '1',
        background: 'var(--gradient-sunset-violet)',
        filter: 'blur(8px)', borderRadius: '50%', opacity: 0.85, zIndex: 0,
        animation: 'glow-pan 14s ease-in-out infinite',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: '4%', right: '6%', width: '42%', aspectRatio: '1',
        background: 'var(--gradient-sky-mint)',
        filter: 'blur(2px)', borderRadius: '50%', opacity: 0.55, zIndex: 0,
        mixBlendMode: 'multiply',
        animation: 'glow-pan 18s ease-in-out -3s infinite',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: '18%', right: '14%', width: '24%', aspectRatio: '1',
        background: 'var(--color-paper-canvas)', borderRadius: '50%', opacity: 0.8, zIndex: 0,
      }} />

      <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
        <Tag variant="soft"><span className="tag-dot" style={{ background: '#1f8a5b' }} />{t.hero_eyebrow}</Tag>
        <h1 className="font-serif" style={{
          margin: '32px 0 40px',
          fontSize: 'clamp(52px, 6.6vw, 96px)',
          letterSpacing: '-0.035em',
          maxWidth: 1100,
        }}>{t.hero_title_a}</h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: 560, letterSpacing: '-0.01em', margin: '0 0 36px' }}>
          {t.hero_sub}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => router.push('/app')}>{t.hero_cta_primary} <Arrow color="#f6f3f1" /></button>
          <button className="btn btn-ghost">{t.hero_cta_secondary}</button>
        </div>

        <div style={{ marginTop: 80, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, maxWidth: 880 }}>
          <LiveCaption label={t.hero_caption_live} value="block #4,812,991" status />
          <LiveCaption label={t.hero_caption_proof} value="0x7f2c…a01b" mono />
          <LiveCaption label={t.hero_caption_kwh} value={<CountUp to={184221} />} />
        </div>
      </div>
    </div>
  );
}

function LiveCaption({ label, value, status, mono }: any) {
  return (
    <div style={{
      border: '1px solid var(--color-hairline)', borderRadius: 18, padding: '14px 18px',
      background: 'rgba(246,243,241,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span className="t-caption faint" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {status && <span className="tag-dot live" />}{label}
      </span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-serif)', fontSize: mono ? 15 : 24, letterSpacing: '-0.02em' }}>
        {value}
      </span>
    </div>
  );
}

export function StatsSection() {
  const { t } = useI18n();
  return (
    <section id="protocol" className="section">
      <div className="wrap">
        <SectionHead eyebrow={t.stats_eyebrow} title={t.stats_title} sub={t.stats_sub} />
        <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <StatCard label={t.stat_farms} value={<CountUp to={3284} />} hint="+128 this week" />
          <StatCard label={t.stat_kwh} value={<CountUp to={28471920} format={(v: number) => Math.round(v).toLocaleString('en-US')} />} hint="≈ 11,890 tCO₂ avoided" />
          <StatCard label={t.stat_credits} value={<CountUp to={11890} />} hint="ERC-1155 · retroactive retire" />
        </div>
        <div className="t-caption faint" style={{ marginTop: 24, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="tag-dot live" />{t.stats_updated}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, hint }: any) {
  return (
    <div style={{ borderRadius: 'var(--radius-card)', border: '1px solid var(--color-hairline)', padding: 32, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 220, justifyContent: 'space-between' }}>
      <div className="t-caption faint">{label}</div>
      <div className="font-serif" style={{ fontSize: 'clamp(40px, 5vw, 72px)', lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
      <div className="t-body-sm muted">{hint}</div>
    </div>
  );
}

export function HowSection() {
  const { t } = useI18n();
  const steps = [
    { num: '01', tag: t.step1_tag, title: t.step1_title, body: t.step1_body, icon: <IconInverter /> },
    { num: '02', tag: t.step2_tag, title: t.step2_title, body: t.step2_body, icon: <IconZK /> },
    { num: '03', tag: t.step3_tag, title: t.step3_title, body: t.step3_body, icon: <IconGas /> },
    { num: '04', tag: t.step4_tag, title: t.step4_title, body: t.step4_body, icon: <IconChain /> },
  ];
  return (
    <section id="how" className="section">
      <div className="wrap">
        <SectionHead eyebrow={t.how_eyebrow} title={t.how_title} sub={t.how_sub} />
        <div className="step-grid" style={{ marginTop: 64 }}>
          {steps.map((s, i) => (
            <div className="step" key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="step-num">{s.num}</span>
                <span style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--color-hairline)', display: 'grid', placeItems: 'center' }}>{s.icon}</span>
              </div>
              <div className="step-title">{s.title}</div>
              <div className="step-body">{s.body}</div>
              <div style={{ marginTop: 'auto' }}><Tag variant="soft">{s.tag}</Tag></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function IconInverter() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10v4M12 9v6M17 11v2" /></svg>);
}
function IconZK() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" /><path d="M8 12 L11 15 L16 9" /></svg>);
}
function IconGas() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 3h10v18H5z" /><path d="M15 7l4 2v8a2 2 0 0 1-2 2" /><path d="M9 9h2" /></svg>);
}
function IconChain() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="9" width="6" height="6" rx="1" /><rect x="15" y="9" width="6" height="6" rx="1" /><path d="M9 12h6" /></svg>);
}

export function ArchSection() {
  const { t } = useI18n();
  return (
    <section className="section">
      <div className="wrap">
        <SectionHead eyebrow={t.arch_eyebrow} title={t.arch_title} />
        <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <div className="card-wash" style={{ minHeight: 360, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Tag>{t.arch_card1_title}</Tag>
              <h3 className="font-serif" style={{ fontSize: 36, letterSpacing: '-0.025em', margin: '24px 0 12px' }}>
                {t.arch_card1_title}
              </h3>
              <p className="muted t-body" style={{ maxWidth: 360 }}>{t.arch_card1_body}</p>
            </div>
            <MonadGrid />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ArchCard title={t.arch_card2_title} body={t.arch_card2_body} dark />
            <ArchCard title={t.arch_card3_title} body={t.arch_card3_body} />
          </div>
          <div className="card" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center', minHeight: 280 }}>
            <div>
              <Tag variant="soft">ERC-1155</Tag>
              <h3 className="font-serif" style={{ fontSize: 36, letterSpacing: '-0.025em', margin: '20px 0 12px' }}>
                {t.arch_card4_title}
              </h3>
              <p className="muted t-body" style={{ maxWidth: 460 }}>{t.arch_card4_body}</p>
            </div>
            <CarbonStrip />
          </div>
        </div>
      </div>
    </section>
  );
}

function ArchCard({ title, body, dark }: any) {
  return (
    <div className={dark ? 'card-ink' : 'card'} style={{ minHeight: 172, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
      <Tag variant="soft" style={{ color: dark ? '#cfdaf5' : undefined }}>{title}</Tag>
      <div>
        <h3 className="font-serif" style={{ fontSize: 28, letterSpacing: '-0.025em', margin: '0 0 8px' }}>{title}</h3>
        <p className="t-body-sm" style={{ color: dark ? '#cfdaf5' : 'var(--color-pale-stone)', maxWidth: 360 }}>{body}</p>
      </div>
    </div>
  );
}

function MonadGrid() {
  const cells = useMemo(() => Array.from({ length: 64 }, (_, i) => i), []);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => (p + 1) % 64), 90);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ position: 'absolute', right: -40, bottom: -60, width: 380, height: 380, opacity: 0.45, pointerEvents: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, transform: 'rotate(-8deg) skewX(-6deg)' }}>
        {cells.map(i => {
          const dist = Math.abs(i - pulse);
          const active = dist < 6;
          return (
            <div key={i} style={{
              aspectRatio: '1',
              borderRadius: 6,
              background: active ? `rgba(0,0,0,${0.7 - dist * 0.1})` : 'rgba(255,255,255,0.6)',
              transition: 'background 200ms',
            }} />
          );
        })}
      </div>
    </div>
  );
}

function CarbonStrip() {
  const tokens = [
    { id: '#0421', mwh: '1.0', region: 'TR' },
    { id: '#0420', mwh: '1.0', region: 'ES' },
    { id: '#0419', mwh: '1.0', region: 'IN' },
    { id: '#0418', mwh: '1.0', region: 'TR' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {tokens.map((tk, i) => (
        <div key={i} style={{
          aspectRatio: '3/4',
          borderRadius: 16,
          background: i % 2 === 0 ? 'var(--gradient-sunset-violet)' : 'var(--gradient-sky-mint)',
          padding: 12,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          color: '#000',
          border: '1px solid rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>CCNFT</div>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1 }}>{tk.id}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 4, opacity: 0.7 }}>{tk.mwh} MWh · {tk.region}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CtaSection({ goDash }: any) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <section className="section" id="docs">
      <div className="wrap">
        <div style={{ borderRadius: 'var(--radius-card)', background: 'var(--color-ink)', color: 'var(--color-paper-canvas)', padding: '72px 56px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', alignItems: 'center', gap: 40 }}>
          <div>
            <Tag variant="soft" style={{ color: '#cfdaf5', borderColor: 'rgba(207,218,245,0.4)' }}>Edge ZK Node v1</Tag>
            <h2 className="font-serif" style={{ fontSize: 'clamp(36px, 4.5vw, 60px)', letterSpacing: '-0.03em', margin: '24px 0 20px' }}>
              {t.cta_title}
            </h2>
            <p style={{ opacity: 0.7, fontSize: 16, maxWidth: 460, }}>{t.cta_sub}</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button className="btn" style={{ background: 'var(--color-paper-canvas)', color: 'var(--color-ink)' }}>{t.cta_primary} <Arrow /></button>
              <button className="btn btn-ghost" style={{ borderColor: 'var(--color-paper-canvas)', color: 'var(--color-paper-canvas)' }} onClick={() => router.push('/app')}>{t.cta_secondary}</button>
            </div>
          </div>
          <div className="data-window" style={{ background: '#000', boxShadow: '0 0 0 1px rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#444' }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#444' }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#444' }} />
            </div>
            <div><span className="c">{`# ssh edge.local`}</span></div>
            <div><span className="k">$</span> sunergy proof --interval 5m</div>
            <div><span className="c">{`> reading modbus tcp://192.168.1.42`}</span></div>
            <div><span className="c">{`> sp1 prove --input gen.bin`}</span></div>
            <div><span className="ok">✓</span> proof <span className="v">0x7f2c…a01b</span></div>
            <div><span className="ok">✓</span> relayed via pimlico</div>
            <div><span className="ok">✓</span> verified <span className="v">block #4,812,991</span></div>
            <div><span className="k">+</span> credited <span className="v">12.4 SNR</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TickerStrip() {
  const items = ['Modbus TCP', 'SP1 zkVM', 'EIP-4337', 'Monad parallel EVM', 'ERC-1155', 'Pimlico paymaster', 'Proof-of-generation', 'DePIN'];
  const items2 = [...items, ...items];
  return (
    <div style={{ padding: '40px 0', borderTop: '1px solid var(--color-hairline)', borderBottom: '1px solid var(--color-hairline)' }}>
      <div className="ticker-wrap">
        <div className="ticker">
          {items2.map((it, i) => (
            <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '0.04em', color: 'var(--color-pale-stone)', display: 'inline-flex', alignItems: 'center', gap: 16 }}>
              {it}
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--color-faint-text)' }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
