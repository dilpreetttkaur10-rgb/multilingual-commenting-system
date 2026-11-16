"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://multilingual-commenting-system-b16w.onrender.com")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const API = `${API_BASE}/api`;

type Plan = {
  id: number; name: string; price: number | string; durationDays: number;
  validity: string; downloads: { limit: number; maxFileSizeMB: number };
  features: {
    premiumVideoAccess: boolean; streamingQuality: string;
    watchTime: string; offlineDownloads: boolean; adFreeViewing: boolean;
    priorityContent: boolean; exclusiveCourses: boolean;
  };
};
type Payment = {
  id: number; invoiceNumber: string | null; amount: number | string;
  currency: string; status: string; createdAt: string;
  plan?: { name: string }; subscription?: { startDate: string; endDate: string; isActive: boolean } | null;
};
type Download = {
  id: number; videoTitle?: string | null; fileName?: string | null;
  fileSizeMB?: number | null; status: string; createdAt: string; videoUrl: string;
};
type Subscription = {
  id: number; plan: { id: number; name: string; price: number | string };
  startDate: string; endDate: string; remainingDays: number;
  cancelAtPeriodEnd: boolean;
  downloads: { limit: number; used: number; remaining: number; resetAt: string; period: string; maxFileSizeMB: number };
  features?: Record<string, unknown>;
};
type Invoice = {
  invoiceNumber: string; invoiceDate: string; paymentId: number; customerId: number;
  plan: string; amount: number | string; currency: string; paymentStatus: string;
  paymentReference: string | null; subscription: { startDate: string; endDate: string } | null;
};

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSizeMB, setFileSizeMB] = useState("");

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const planResponse = await fetch(`${API}/subscriptions/plans`);
      const planData = await planResponse.json();
      if (planResponse.ok) setPlans(planData.plans || []);

      if (!token) {
        setSubscription(null);
        setPayments([]);
        setDownloads([]);
        return;
      }

      const [subRes, payRes, downRes] = await Promise.all([
        fetch(`${API}/subscriptions/current`, { headers: authHeaders() }),
        fetch(`${API}/payments/history`, { headers: authHeaders() }),
        fetch(`${API}/downloads`, { headers: authHeaders() }),
      ]);
      const [subData, payData, downData] = await Promise.all([
        subRes.json(), payRes.json(), downRes.json(),
      ]);
      setSubscription(subRes.ok ? subData.subscription : null);
      setPayments(payRes.ok ? payData.payments || [] : []);
      setDownloads(downRes.ok ? downData.downloads || [] : []);
      if (!subRes.ok && subRes.status !== 404 && subRes.status !== 403) {
        setMessage(subData.message || "Could not load subscription details.");
      }
      if (!payRes.ok || !downRes.ok) setMessage("Some account information could not be loaded. Please refresh.");
    } catch {
      setMessage("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    setToken(localStorage.getItem("token") || "");
  }, []);

  useEffect(() => {
    if (token !== "") void loadData();
    else if (typeof window !== "undefined") void loadData();
  }, [token, loadData]);

  const buyPlan = async (plan: Plan) => {
    if (!token) {
      setMessage("Please log in before choosing a subscription.");
      return;
    }
    if (plan.name.toUpperCase() === "FREE") {
      setMessage("The FREE plan is available as the default account tier; no payment is needed.");
      return;
    }
    if (!window.confirm(`Create a payment order for the ${plan.name} plan (₹${plan.price})? The current server is configured for mock payments unless Razorpay is enabled.`)) return;
    setBusy(true);
    setMessage("");
    setInvoice(null);
    try {
      const orderRes = await fetch(`${API}/payments/orders`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ planId: plan.id }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.message || "Could not create payment order.");

      if (orderData.mode !== "mock") {
        setMessage("A Razorpay order was created, but this page does not collect card/UPI details. Please use the configured Razorpay checkout flow; no payment has been completed here.");
        return;
      }

      const verifyRes = await fetch(`${API}/payments/verify`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          razorpayOrderId: orderData.order.id,
          razorpayPaymentId: `mock_payment_${orderData.payment.id}`,
          razorpaySignature: "mock_signature",
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.message || "Mock payment verification failed.");
      setMessage(`Mock payment successful. ${plan.name} subscription activated. No real money was charged.`);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const requestDownload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) { setMessage("Please log in to request a download."); return; }
    if (!videoUrl.trim()) { setMessage("Enter a video URL."); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/downloads`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          ...(videoTitle.trim() ? { videoTitle: videoTitle.trim() } : {}),
          ...(fileName.trim() ? { fileName: fileName.trim() } : {}),
          ...(fileSizeMB ? { fileSizeMB: Number(fileSizeMB) } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Download request was rejected.");
      setMessage(data.message || "Download request recorded.");
      setVideoUrl(""); setVideoTitle(""); setFileName(""); setFileSizeMB("");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create download request.");
    } finally {
      setBusy(false);
    }
  };

  const showInvoice = async (paymentId: number) => {
    if (!token) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API}/invoices/${paymentId}`, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Invoice is not available.");
      setInvoice(data.invoice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load invoice.");
    } finally { setBusy(false); }
  };

  const updateDownloadStatus = async (id: number, status: string) => {
    setBusy(true);
    try {
      const response = await fetch(`${API}/downloads/${id}/status`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update download status.");
      setMessage(data.message || "Download status updated.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update status.");
    } finally { setBusy(false); }
  };

  const money = (value: number | string, currency = "INR") =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
  const date = (value: string) => new Date(value).toLocaleString();

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><a href="/" className="text-sm font-medium text-blue-700 hover:underline">← Back to Home</a>
            <h1 className="mt-2 text-3xl font-bold">Subscription & Downloads</h1>
            <p className="mt-1 text-gray-600">Manage your plan, payment records, invoices and download requests.</p>
          </div>
          <div className="flex gap-2">
            {!token && <a href="/login" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Login / Register</a>}
            <button onClick={() => void loadData()} className="rounded-lg border bg-white px-4 py-2 font-medium">Refresh</button>
          </div>
        </div>

        {message && <div role="status" className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">{message}</div>}
        {loading ? <div className="rounded-xl bg-white p-6 shadow">Loading subscription information…</div> : <>
          {subscription && <section className="mb-7 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Your Current Plan</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-sm text-gray-500">Plan</p><p className="text-2xl font-bold">{subscription.plan.name}</p></div>
              <div><p className="text-sm text-gray-500">Valid until</p><p className="font-semibold">{date(subscription.endDate)}</p></div>
              <div><p className="text-sm text-gray-500">Days remaining</p><p className="text-2xl font-bold">{subscription.remainingDays}</p></div>
              <div><p className="text-sm text-gray-500">Downloads remaining</p><p className="text-2xl font-bold">{subscription.downloads.remaining} / {subscription.downloads.limit}</p></div>
            </div>
            <p className="mt-3 text-sm text-gray-600">Quota resets: {date(subscription.downloads.resetAt)} ({subscription.downloads.period.toLowerCase()}). Maximum file size: {subscription.downloads.maxFileSizeMB} MB.</p>
            {subscription.cancelAtPeriodEnd && <p className="mt-2 text-sm font-medium text-amber-700">Cancellation is scheduled at the end of this plan period.</p>}
          </section>}

          <section className="mb-7">
            <h2 className="mb-3 text-xl font-bold">Available Plans</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map(plan => <article key={plan.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="mt-2 text-3xl font-bold">{money(plan.price)}<span className="text-sm font-normal text-gray-500"> / {plan.validity}</span></p>
                <p className="mt-3 text-sm text-gray-600">{plan.downloads.limit} downloads per {plan.name === "FREE" ? "day" : "month"}</p>
                <p className="text-sm text-gray-600">Max file size: {plan.downloads.maxFileSizeMB} MB</p>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-gray-700">
                  <li>Streaming: {plan.features.streamingQuality}</li>
                  <li>Watch time: {plan.features.watchTime}</li>
                  <li>{plan.features.offlineDownloads ? "Offline downloads" : "No offline downloads"}</li>
                  <li>{plan.features.adFreeViewing ? "Ad-free viewing" : "Ads may be shown"}</li>
                </ul>
                <button disabled={busy || plan.name === "FREE"} onClick={() => void buyPlan(plan)} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  {plan.name === "FREE" ? "Default Plan" : busy ? "Please wait…" : "Choose Plan"}
                </button>
              </article>)}
            </div>
          </section>

          <section className="mb-7 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Request a Download</h2>
            <p className="mt-1 text-sm text-gray-600">This submits a download request and checks your plan quota and file-size limit. It records the request; it does not fetch or transfer the video file itself.</p>
            {!token ? <p className="mt-3 text-sm text-amber-700">Log in to submit a download request.</p> : <form onSubmit={requestDownload} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Video URL *<input required type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://example.com/video" className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
              <label className="text-sm font-medium">Video title<input value={videoTitle} onChange={e => setVideoTitle(e.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
              <label className="text-sm font-medium">File name<input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="video.mp4" className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
              <label className="text-sm font-medium">File size (MB)<input type="number" min="1" step="1" value={fileSizeMB} onChange={e => setFileSizeMB(e.target.value)} className="mt-1 w-full rounded-lg border p-3 font-normal" /></label>
              <div className="sm:col-span-2"><button disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white disabled:bg-gray-400">{busy ? "Submitting…" : "Submit Download Request"}</button></div>
            </form>}
          </section>

          <section className="mb-7 rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Payment History & Invoices</h2>
            {!token ? <p className="mt-3 text-sm text-gray-600">Log in to view your payment history.</p> : payments.length === 0 ? <p className="mt-3 text-sm text-gray-600">No payment records found.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
              <thead><tr className="border-b text-gray-500"><th className="p-3">Date</th><th className="p-3">Plan</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Invoice</th></tr></thead>
              <tbody>{payments.map(payment => <tr key={payment.id} className="border-b last:border-0"><td className="p-3">{date(payment.createdAt)}</td><td className="p-3">{payment.plan?.name || "—"}</td><td className="p-3">{money(payment.amount, payment.currency)}</td><td className="p-3">{payment.status}</td><td className="p-3">{payment.status === "SUCCESS" ? <button onClick={() => void showInvoice(payment.id)} className="font-semibold text-blue-700 hover:underline">View invoice</button> : "—"}</td></tr>)}</tbody>
            </table></div>}
            {invoice && <div className="mt-5 rounded-lg border border-gray-300 bg-gray-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Invoice {invoice.invoiceNumber}</h3><button onClick={() => window.print()} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold print:hidden">Print / Save as PDF</button></div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>Invoice date: {date(invoice.invoiceDate)}</p><p>Payment ID: {invoice.paymentId}</p>
                <p>Customer ID: {invoice.customerId}</p><p>Plan: {invoice.plan}</p>
                <p>Amount: {money(invoice.amount, invoice.currency)}</p><p>Status: {invoice.paymentStatus}</p>
                <p>Payment reference: {invoice.paymentReference || "—"}</p>
                {invoice.subscription && <p>Subscription: {date(invoice.subscription.startDate)} – {date(invoice.subscription.endDate)}</p>}
              </div>
              <p className="mt-3 text-xs text-gray-500">This invoice is displayed from the server's invoice record. Use Print / Save as PDF to keep a copy.</p>
            </div>}
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="text-xl font-bold">Download History</h2>
            {!token ? <p className="mt-3 text-sm text-gray-600">Log in to view download requests.</p> : downloads.length === 0 ? <p className="mt-3 text-sm text-gray-600">No download requests found.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm">
              <thead><tr className="border-b text-gray-500"><th className="p-3">Title / File</th><th className="p-3">Size</th><th className="p-3">Requested</th><th className="p-3">Status</th><th className="p-3">Update status</th></tr></thead>
              <tbody>{downloads.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-3">{item.videoTitle || item.fileName || item.videoUrl}</td><td className="p-3">{item.fileSizeMB ? `${item.fileSizeMB} MB` : "—"}</td><td className="p-3">{date(item.createdAt)}</td><td className="p-3">{item.status}</td><td className="p-3"><select disabled={busy} value={item.status} onChange={e => void updateDownloadStatus(item.id, e.target.value)} className="rounded border p-2"><option>PENDING</option><option>DOWNLOADING</option><option>COMPLETED</option><option>FAILED</option><option>CANCELLED</option></select></td></tr>)}</tbody>
            </table></div>}
          </section>
        </>}
      </div>
    </main>
  );
}
