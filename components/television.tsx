"use client";
import { useEffect, useState } from "react";
import { emptyTv, TV_POLL_MS, tvDelayed, tvDifference, tvPercent, validateTv, type TvSnapshot } from "@/lib/tv";

function Progress({value}: {value: number | null}) {
  return <div className="tv-progress" aria-hidden="true"><i style={{width: `${value === null ? 0 : Math.min(100, Math.max(0, value * 100))}%`}} /></div>;
}
function Rate({value}: {value: number | null}) { return <strong className={value === null ? "tv-missing" : ""}>{tvPercent(value)}</strong>; }
export default function Television() {
  const [data, setData] = useState<TvSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    async function poll() {
      if (active) return;
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 20000);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/tv-snapshot.json?t=${Date.now()}`, {cache: "no-store", signal: active.signal});
        if (!response.ok) throw Error("Snapshot unavailable");
        const snapshot = validateTv(await response.json());
        if (!disposed) {
          setData(previous => previous?.fetchedAt && snapshot.fetchedAt && Date.parse(previous.fetchedAt) > Date.parse(snapshot.fetchedAt) ? previous : snapshot);
          setFailed(false);
        }
      } catch { if (!disposed) setFailed(true); }
      finally { clearTimeout(timeout); active = null; if (!disposed) setNow(Date.now()); }
    }
    setNow(Date.now());
    void poll();
    const timer = setInterval(() => void poll(), TV_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    const resume = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { disposed = true; clearInterval(timer); clearInterval(clock); active?.abort(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, []);
  const snapshot = data || emptyTv();
  const company = snapshot.q4[0];
  return <main className="tv-screen">
    <header className="tv-header"><h1>2026 Q4旺季经营战报</h1><span><i />每小时自动更新</span></header>
    <section className="tv-hero" aria-label="公司核心指标">
      {[{title: "销售额完成率", value: company.sales, advanced: company.salesAdvanced}, {title: "利润完成率", value: company.profit, advanced: company.profitAdvanced}].map(metric => <article className="tv-card tv-core" key={metric.title}>
        <h2>公司 · {metric.title}</h2><div className="tv-primary"><span>准目标</span><Rate value={metric.value} /></div>
        <Progress value={metric.value} /><div className="tv-secondary"><span>进阶目标</span><Rate value={metric.advanced} /></div>
      </article>)}
      <article className="tv-card tv-history"><h2>公司 · 去年同期进度</h2><Rate value={company.previous} /><div className="tv-history-rule" /><span>Q4 同期经营节奏</span></article>
    </section>
    <div className="tv-bottom">
      <section className="tv-card tv-groups"><div className="tv-section-title"><h2>Q4 运营组进度</h2><span>节奏差额：准目标 − 去年同期</span></div>
        <div className="tv-group-head"><span>运营组 / 去年同期</span><span>销售额完成率</span><span>利润完成率</span></div>
        {snapshot.q4.slice(1).map(row => <article className="tv-group-row" key={row.name}>
          <div className="tv-group-name"><h3>{row.name}</h3><span>去年同期</span><Rate value={row.previous} /></div>
          {[{value: row.sales, advanced: row.salesAdvanced}, {value: row.profit, advanced: row.profitAdvanced}].map((metric, index) => <div className="tv-group-metric" key={index}>
            <div className="tv-target"><span>准目标</span><Rate value={metric.value} /></div><Progress value={metric.value} />
            <div className="tv-advanced"><span>进阶目标</span><Rate value={metric.advanced} /></div>
            <div className="tv-delta"><span>节奏差额</span><b>{tvDifference(metric.value, row.previous)}</b></div>
          </div>)}
        </article>)}
      </section>
      <section className="tv-card tv-campaign"><div className="tv-section-title"><h2>黑五网一战报</h2><span>全员冲刺</span></div>
        <div className="tv-campaign-head"><span>团队</span><span>销售额</span><span>利润</span></div>
        {snapshot.campaign.map(row => <article className="tv-campaign-row" key={row.name}><h3>{row.name === "公司总" ? "公司" : row.name}</h3>{[row.sales, row.profit].map((value, index) => <div key={index}>{value === null ? <span className="tv-pending">进度待更新</span> : <Rate value={value} />}</div>)}</article>)}
      </section>
    </div>
    <footer className="tv-footer"><span>{snapshot.fetchedAt ? `最近成功同步 ${new Date(snapshot.fetchedAt).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai", hour12: false})}` : "暂无成功同步记录"}</span><strong role="status">{now > 0 && tvDelayed(data, now, failed) ? "数据更新延迟" : ""}</strong></footer>
  </main>;
}
