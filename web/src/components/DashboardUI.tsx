"use client";

import React, { useState, useMemo } from 'react';
import { useAccount, useReadContracts, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { CONTRACTS, FARM_REGISTRY_ABI, REWARDS_ABI, ERC20_ABI } from "@/lib/contracts";

import { useI18n } from './I18nProvider';
import { Nav, Footer, Tag, Arrow, CountUp, Modal, Sparkline, WalletModal } from './SharedUI';

export function Dashboard() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const [walletOpen, setWalletOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimTarget, setClaimTarget] = useState<string | null>(null);

  const { data: globalData } = useReadContracts({
    contracts: [
      { address: CONTRACTS.farmRegistry, abi: FARM_REGISTRY_ABI, functionName: "totalFarms"       },
      { address: CONTRACTS.farmRegistry, abi: FARM_REGISTRY_ABI, functionName: "activeFarms"      },
      { address: CONTRACTS.rewards,      abi: REWARDS_ABI,       functionName: "totalVerifiedKwh" },
      { address: CONTRACTS.rewards,      abi: REWARDS_ABI,       functionName: "totalSnrMinted"   },
      { address: CONTRACTS.rewards,      abi: REWARDS_ABI,       functionName: "snrPerKwh"        },
    ],
  });

  const { data: snrBalance } = useReadContract({
    address: CONTRACTS.snrToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: myFarms } = useReadContract({
    address: CONTRACTS.farmRegistry,
    abi: FARM_REGISTRY_ABI,
    functionName: "getOperatorFarms",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Mocking the lifetime and pending since we only get a list of IDs right now.
  // Ideally, we'd do a multicall to get each farm's details.
  const totals = useMemo(() => ({
    lifetime: Number(globalData?.[2]?.result || 0),
    pending: 0, // Mocked for now
    pendingCarbon: 0,
    snrEarned: Number(globalData?.[3]?.result ? formatEther(globalData[3].result as bigint) : 0),
  }), [globalData]);

  // Mock activity
  const activity = useMemo(() => [
    { kind: 'proof', farm: 'Konya Field 07', kwh: 12.4, time: '2 min ago', hash: '0x7f2c…a01b' },
    { kind: 'proof', farm: 'Murcia 12', kwh: 8.1, time: '6 min ago', hash: '0x9d31…bc42' },
    { kind: 'register', farm: 'Antalya 02', time: '3 days ago', hash: '0x1ee0…02cd' },
  ], []);

  const openClaim = (id: string) => { setClaimTarget(id); setClaimOpen(true); };
  const onConnect = () => setWalletOpen(true);

  if (!isConnected) {
    return (
      <div className="wrap" style={{ padding: '120px 0', display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <Tag variant="soft"><span className="tag-dot" style={{ background: '#1f8a5b' }} />Sunergy app</Tag>
          <h1 className="font-serif" style={{ fontSize: 56, letterSpacing: '-0.03em', margin: '24px 0 16px' }}>
            Connect to see your farms.
          </h1>
          <p className="muted" style={{ fontSize: 16, }}>
            Use any EVM-compatible wallet. Sunergy is non-custodial — your farms, your keys, your kWh.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 32 }} onClick={onConnect}>{t.nav_connect} <Arrow color="#f6f3f1" /></button>
        </div>
        <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} isConnected={isConnected} />
      </div>
    );
  }

  return (
    <div className="wrap" style={{ padding: '40px 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <div className="t-caption faint" style={{ marginBottom: 8 }}>{t.dash_welcome}</div>
          <h1 className="font-serif" style={{ fontSize: 48, letterSpacing: '-0.03em', margin: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setRegisterOpen(true)}>{t.dash_register} <span style={{ fontSize: 16, lineHeight: 0 }}>+</span></button>
          <button className="btn btn-primary" onClick={() => openClaim('all')} disabled={totals.pending === 0}>
            {t.dash_claim_all} · {totals.pending.toFixed(1)} SNR <Arrow color="#f6f3f1" />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label={t.dash_total} value={<CountUp to={totals.lifetime} format={(v: number) => Math.round(v).toLocaleString('en-US')} />} suffix="kWh" />
        <KpiCard label={t.dash_snr} value={<CountUp to={snrBalance ? Number(formatEther(snrBalance as bigint)) : 0} format={(v: number) => v.toFixed(1)} />} suffix="SNR" />
        <KpiCard label={t.dash_pending} value={<CountUp to={totals.pending} format={(v: number) => v.toFixed(1)} />} suffix="SNR" highlight />
        <KpiCard label={t.dash_carbon} value={<CountUp to={totals.pendingCarbon} format={(v: number) => v.toFixed(2)} />} suffix="MWh" />
      </div>

      <div className="dash-hero" style={{ marginBottom: 32 }}>
        <ProductionChart />
        <ActivityFeed activity={activity} />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="font-serif" style={{ fontSize: 32, letterSpacing: '-0.02em', margin: 0 }}>{t.dash_farms}</h2>
        <span className="t-body-sm faint">{myFarms ? (myFarms as string[]).length : 0} farms</span>
      </div>

      <div className="farm-grid">
        {(myFarms as string[])?.map((farmId) => (
          <FarmCardNode key={farmId} farmId={farmId} onClaim={() => openClaim(farmId)} />
        ))}
        <AddFarmCard onClick={() => setRegisterOpen(true)} />
      </div>

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} target={claimTarget} totals={totals} />
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} isConnected={isConnected} />
    </div>
  );
}

function KpiCard({ label, value, suffix, highlight }: any) {
  return (
    <div style={{
      border: '1px solid var(--color-hairline)',
      background: highlight ? 'var(--accent, var(--color-atmosphere-wash))' : 'transparent',
      borderRadius: 24, padding: 24,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div className="kpi-label">{label}</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1, letterSpacing: '-0.025em' }}>
        {value}<small style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', marginLeft: 8, color: 'var(--color-pale-stone)' }}>{suffix}</small>
      </div>
    </div>
  );
}

function FarmCardNode({ farmId, onClaim }: any) {
  const { t } = useI18n();

  const { data: state } = useReadContract({
    address: CONTRACTS.farmRegistry,
    abi: FARM_REGISTRY_ABI,
    functionName: "getFarmState",
    args: [farmId],
  });

  const { data: rewardsData } = useReadContracts({
    contracts: [
      { address: CONTRACTS.rewards, abi: REWARDS_ABI, functionName: "lifetimeKwh", args: [farmId] },
      { address: CONTRACTS.rewards, abi: REWARDS_ABI, functionName: "pendingSnr",  args: [farmId] },
    ],
  });

  const lifetime = rewardsData?.[0]?.result ? Number(rewardsData[0].result as bigint) : 0;
  const pending = rewardsData?.[1]?.result ? Number(formatEther(rewardsData[1].result as bigint)) : 0;

  const status = state?.status === 1 ? 'ok' : 'off';
  const healthLabel = status === 'ok' ? t.farm_status_ok : t.farm_status_off;
  const healthColor = status === 'ok' ? '#1f8a5b' : '#c14b4b';

  return (
    <div style={{
      border: '1px solid var(--color-hairline)',
      borderRadius: 24, padding: 24,
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="t-caption faint" style={{ marginBottom: 6 }}>{farmId.slice(0, 10)}...{farmId.slice(-6)}</div>
          <h3 className="font-serif" style={{ fontSize: 28, letterSpacing: '-0.025em', margin: 0 }}>Farm Node</h3>
          <div className="t-body-sm muted" style={{ marginTop: 4 }}>Registered</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: healthColor, boxShadow: `0 0 0 3px ${healthColor}20` }} />
          {healthLabel}
        </span>
      </div>

      <Sparkline data={[12, 18, 22, 19, 24, 28, 30, 26, 32, 38, 42, 40, 45, 52, 56, 58, 62, 68, 72, 76]} width={520} height={48} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="kpi-label">{t.farm_lifetime}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: '-0.025em', lineHeight: 1 }}>
            {lifetime.toLocaleString('en-US')}<small style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 6, color: 'var(--color-pale-stone)' }}>kWh</small>
          </div>
        </div>
        <div>
          <div className="kpi-label">{t.farm_pending}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: '-0.025em', lineHeight: 1 }}>
            {pending.toFixed(1)}<small style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginLeft: 6, color: 'var(--color-pale-stone)' }}>SNR</small>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}>{t.farm_view}</button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={onClaim} disabled={pending === 0}>{t.dash_claim} <Arrow color="#f6f3f1" /></button>
      </div>
    </div>
  );
}

function AddFarmCard({ onClick }: any) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} style={{
      border: '1px dashed var(--color-hairline-strong)',
      background: 'transparent', borderRadius: 24, padding: 24,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      minHeight: 320, cursor: 'pointer', color: 'var(--color-off-black)',
      font: 'inherit',
    }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '1px solid var(--color-hairline-strong)', display: 'grid', placeItems: 'center', fontSize: 20 }}>+</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, letterSpacing: '-0.02em' }}>{t.dash_register}</div>
      <div className="t-body-sm faint" style={{ textAlign: 'center', maxWidth: 220 }}>Pair an Edge ZK Node and pin its key.</div>
    </button>
  );
}

function ProductionChart() {
  const { t } = useI18n();
  const data = useMemo(() => Array.from({ length: 7 * 24 }, (_, i) => {
    const hour = i % 24;
    const solar = Math.max(0, Math.sin((hour - 6) / 18 * Math.PI)) ** 1.3;
    const noise = 0.6 + Math.random() * 0.4;
    return solar * noise;
  }), []);
  const max = Math.max(...data) || 1;
  return (
    <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 280 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 className="font-serif" style={{ fontSize: 26, letterSpacing: '-0.025em', margin: 0, }}>{t.dash_chart_title}</h3>
          <p className="t-body-sm muted" style={{ margin: '6px 0 0' }}>{t.dash_chart_sub}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-quiet btn-sm">24h</button>
          <button className="btn btn-quiet btn-sm" style={{ background: 'rgba(0,0,0,0.06)' }}>7d</button>
          <button className="btn btn-quiet btn-sm">30d</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', minHeight: 140 }}>
        {data.map((v, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(2, (v / max) * 100)}%`,
            background: i >= data.length - 24 ? 'var(--accent, var(--color-atmosphere-wash))' : 'var(--color-off-black)',
            opacity: i >= data.length - 24 ? 1 : 0.85,
            borderRadius: 2,
            minWidth: 2,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--color-faint-text)', textTransform: 'uppercase' }}>
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun · today</span>
      </div>
    </div>
  );
}

function ActivityFeed({ activity }: any) {
  const { t } = useI18n();
  const labelFor = (k: string) => k === 'proof' ? t.activity_proof : k === 'claim' ? t.activity_claim : t.activity_register;
  const colorFor = (k: string) => k === 'proof' ? '#1f8a5b' : k === 'claim' ? '#a0b5eb' : '#d4a017';
  return (
    <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 280 }}>
      <div>
        <h3 className="font-serif" style={{ fontSize: 26, letterSpacing: '-0.025em', margin: 0, }}>{t.activity_title}</h3>
        <p className="t-body-sm muted" style={{ margin: '6px 0 0' }}>{t.activity_sub}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 240, overflowY: 'auto', margin: '0 -8px' }}>
        {activity.slice(0, 8).map((a: any, i: number) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center',
            padding: '12px 8px', borderBottom: i < 7 ? '1px solid var(--color-hairline)' : 'none',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: colorFor(a.kind), boxShadow: `0 0 0 3px ${colorFor(a.kind)}20` }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, letterSpacing: '-0.01em' }}>{labelFor(a.kind)} · <span className="muted">{a.farm}</span></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-faint-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.hash}{a.kwh ? ` · ${a.kwh} kWh` : ''}{a.snr ? ` · ${a.snr.toFixed(1)} SNR` : ''}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-faint-text)' }}>{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegisterModal({ open, onClose }: any) {
  const { t } = useI18n();
  const { address } = useAccount();

  const [form, setForm] = useState({
    deviceSerial:  "",
    equipmentCert: "",
    lat:           "",
    lon:           "",
    capacityKw:    "",
    countryCode:   "840",
  });

  const { data: bondAmount } = useReadContract({
    address: CONTRACTS.farmRegistry,
    abi: FARM_REGISTRY_ABI,
    functionName: "operatorBond",
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const onSubmit = () => {
    if (!bondAmount) return;
    const deviceFp  = keccak256(new TextEncoder().encode(form.deviceSerial));
    const equipCert = keccak256(new TextEncoder().encode(form.equipmentCert));
    const locationH = keccak256(
      encodeAbiParameters(parseAbiParameters("int256,int256"), [
        BigInt(Math.round(parseFloat(form.lat || "0") * 1e7)),
        BigInt(Math.round(parseFloat(form.lon || "0") * 1e7)),
      ])
    );
    const capacityW = Math.round(parseFloat(form.capacityKw || "0") * 1000);

    writeContract({
      address: CONTRACTS.farmRegistry,
      abi: FARM_REGISTRY_ABI,
      functionName: "registerFarm",
      args: [deviceFp, equipCert, locationH, capacityW, parseInt(form.countryCode)],
      value: bondAmount,
    });
  };

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 className="font-serif" style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>{t.reg_title}</h3>
        <button className="btn btn-quiet" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="close">×</button>
      </div>
      <p className="t-body-sm muted" style={{ margin: '0 0 24px' }}>{t.reg_sub}</p>

      {!isSuccess ? (
        <React.Fragment>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label={t.reg_name} placeholder={t.reg_name_p} value={form.deviceSerial} onChange={(v: string) => set("deviceSerial", v)} />
            <Field label={t.reg_capacity} placeholder={t.reg_capacity_p} value={form.capacityKw} onChange={(v: string) => set("capacityKw", v)} suffix="kWp" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Latitude" placeholder="37.7749" value={form.lat} onChange={(v: string) => set("lat", v)} />
            <Field label="Longitude" placeholder="-122.4194" value={form.lon} onChange={(v: string) => set("lon", v)} />
          </div>
          <div style={{ border: '1px solid var(--color-hairline)', borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <span className="t-caption faint">{t.reg_node}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Bond: {bondAmount ? formatEther(bondAmount as bigint) : "..."} ETH</span>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>{t.reg_cancel}</button>
            <button className="btn btn-primary btn-sm" onClick={onSubmit} disabled={isPending || isConfirming || !address}>
              {isPending || isConfirming ? 'Sending...' : t.reg_submit} <Arrow color="#f6f3f1" />
            </button>
          </div>
        </React.Fragment>
      ) : (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginTop: 24, padding: 16, background: 'var(--accent, var(--color-atmosphere-wash))', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--color-ink)', color: 'var(--color-paper-canvas)', display: 'grid', placeItems: 'center', fontSize: 14 }}>✓</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, letterSpacing: '-0.02em' }}>{t.reg_done}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="btn btn-primary btn-sm" onClick={onClose}>{t.common_close}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, placeholder, value, onChange, suffix }: any) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="t-caption faint">{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-hairline)', borderRadius: 16, padding: '12px 14px', background: 'transparent' }}>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
          border: 0, outline: 'none', background: 'transparent', flex: 1, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--color-ink)',
        }} />
        {suffix && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-faint-text)' }}>{suffix}</span>}
      </span>
    </label>
  );
}

function ProgressStep({ done, active, label, mono }: any) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 14, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--color-hairline)' }}>
      <span style={{
        width: 22, height: 22, borderRadius: 99,
        background: done ? 'var(--color-ink)' : 'transparent',
        border: '1px solid ' + (done || active ? 'var(--color-ink)' : 'var(--color-hairline-strong)'),
        color: 'var(--color-paper-canvas)',
        display: 'grid', placeItems: 'center', fontSize: 12,
      }}>{done ? '✓' : active ? <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--color-ink)', animation: 'pulse 1.2s infinite' }} /> : ''}</span>
      <span style={{ fontSize: 14, color: done || active ? 'var(--color-ink)' : 'var(--color-faint-text)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-faint-text)' }}>{mono}</span>
    </div>
  );
}

function ClaimModal({ open, onClose, target, totals }: any) {
  const { t } = useI18n();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const snr = totals.pending;
  const carbon = totals.pendingCarbon;

  const confirm = () => {
    if (!target) return;
    writeContract({
      address: CONTRACTS.rewards,
      abi: REWARDS_ABI,
      functionName: "claimRewards",
      args: [target as `0x${string}`],
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 className="font-serif" style={{ margin: 0, fontSize: 28, letterSpacing: '-0.02em' }}>{t.claim_title}</h3>
        <button className="btn btn-quiet" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="close">×</button>
      </div>
      <p className="t-body-sm muted" style={{ margin: '0 0 24px' }}>{t.claim_sub}{target ? ` · ${target.slice(0,6)}` : ''}</p>

      <div style={{ border: '1px solid var(--color-hairline)', borderRadius: 18, overflow: 'hidden', marginBottom: 16 }}>
        <ClaimRow label={t.claim_snr} value={`${snr.toFixed(1)} SNR`} />
        <ClaimRow label={t.claim_carbon} value={`${carbon.toFixed(2)} MWh · ERC-1155`} />
        <ClaimRow label={t.claim_gas} value={t.claim_gas_v} mono />
      </div>

      {!isPending && !isConfirming && !isSuccess && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t.claim_close}</button>
          <button className="btn btn-primary btn-sm" onClick={confirm}>{t.claim_confirm} <Arrow color="#f6f3f1" /></button>
        </div>
      )}
      {(isPending || isConfirming) && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: 99, border: '2px solid var(--color-ink)', borderTopColor: 'transparent', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
          <div className="t-body-sm muted" style={{ marginTop: 12 }}>Submitting to Monad…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {isSuccess && (
        <div style={{ padding: 16, background: 'var(--accent, var(--color-atmosphere-wash))', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--color-ink)', color: 'var(--color-paper-canvas)', display: 'grid', placeItems: 'center', fontSize: 14 }}>✓</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, letterSpacing: '-0.02em' }}>Claim settled</span>
        </div>
      )}
    </Modal>
  );
}

function ClaimRow({ label, value, mono }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--color-hairline)' }}>
      <span className="t-caption faint">{label}</span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-serif)', fontSize: mono ? 14 : 22, letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  );
}
