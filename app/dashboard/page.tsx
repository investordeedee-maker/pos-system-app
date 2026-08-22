"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface OrderItem {
  id: string;
  qty: number;
  unit_price: number;
  remark?: string;
  products?: { name: string; is_vat_exempt: boolean };
}

interface Order {
  id: string;
  doc_no: string;
  created_at: string;
  total_amount: number;
  status: string;
  payment_method: string;
  order_source: string;
  kitchen_status: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  slip_image?: string;
  order_items: OrderItem[];
}

interface CustomWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const playBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as CustomWindow).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    }
  } catch { }
};

const exportToCSV = (filename: string, rows: string[][]) => {
  const csvContent = "\uFEFF" + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename + ".csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function DashboardPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  const [currentView, setCurrentView] = useState<"main" | "date_report" | "doc_report" | "product_report" | "revenue_report">("main");
  
  // ระบบคิวรอดำเนินการ 3 ส่วน
  const [activeQueueTab, setActiveQueueTab] = useState<"online" | "store" | "kitchen">("online");
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewFullScreenImage, setViewFullScreenImage] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  const [startDoc, setStartDoc] = useState("");
  const [endDoc, setEndDoc] = useState("");
  const [startProduct, setStartProduct] = useState("");
  const [endProduct, setEndProduct] = useState("");

  const [reportOrders, setReportOrders] = useState<Order[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // คำนวณสรุปยอดรวม (สำหรับรายงาน)
  let revenueTotalCash = 0;
  let revenueTotalTransfer = 0;
  let revenueTotalPending = 0;
  let revenueTotalAll = 0;
  let reportTotalNet = 0;
  let productTotalQty = 0;
  let productTotalRev = 0;
  const pMap: { [key: string]: { qty: number, rev: number } } = {};

  if (currentView === "revenue_report") {
    reportOrders.forEach(o => {
      const cash = o.status === 'completed' && o.payment_method === 'cash' ? o.total_amount : 0;
      const transfer = o.status === 'completed' && o.payment_method === 'transfer' ? o.total_amount : 0;
      const pending = o.status !== 'completed' && o.status !== 'cancelled' ? o.total_amount : 0;
      revenueTotalCash += cash;
      revenueTotalTransfer += transfer;
      revenueTotalPending += pending;
      revenueTotalAll += o.total_amount;
    });
  } else if (currentView === "product_report") {
    reportOrders.forEach(o => o.order_items.forEach(i => {
      const name = i.products?.name || "ไม่ระบุ";
      if((!startProduct || name >= startProduct) && (!endProduct || name <= endProduct)) {
        if(!pMap[name]) pMap[name] = {qty:0, rev:0};
        pMap[name].qty += i.qty; 
        pMap[name].rev += (i.qty * i.unit_price);
        productTotalQty += i.qty;
        productTotalRev += (i.qty * i.unit_price);
      }
    }));
  } else if (currentView === "date_report" || currentView === "doc_report") {
    reportTotalNet = reportOrders.reduce((sum, o) => sum + o.total_amount, 0);
  }

  // อ่านค่า Tab จาก URL (ใช้ setTimeout เพื่อแก้ปัญหา ESLint cascading renders)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get("tab");
        if (tabParam === "online" || tabParam === "store" || tabParam === "kitchen") {
          setActiveQueueTab(tabParam);
          // ลบ parameter ออกหลังจากอ่านเสร็จ เพื่อให้ URL สะอาดขึ้น
          window.history.replaceState(null, '', '/dashboard');
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initFetch = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (!profile?.store_id) return;
        
        if (isMounted) setStoreId(profile.store_id);

        // ดึงบิลที่ค้างทั้งหมด
        const { data, error } = await supabase
          .from("orders")
          .select(`*, order_items(*, products(*))`)
          .eq("store_id", profile.store_id)
          .or("status.eq.pending,kitchen_status.eq.pending")
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (data && isMounted) setActiveOrders(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    initFetch();
    return () => { isMounted = false; };
  }, [router]);

  // แยกคิว 3 ส่วน
  const onlineQueue = activeOrders.filter(o => o.order_source === 'ONLINE' && o.status === 'pending');
  const storeQueue = activeOrders.filter(o => o.order_source !== 'ONLINE' && o.status === 'pending');
  const kitchenQueue = activeOrders.filter(o => o.kitchen_status === 'pending' && (o.status === 'completed' || (o.status === 'pending' && o.order_source !== 'ONLINE')));

  const handleUpdateStatus = async (orderId: string, currentSource: string, currentStatus: string, tab: string) => {
    try {
      let updateData: { status?: string; kitchen_status?: string } = {};
      let alertMsg = "";

      if (tab === "online") {
        if (!confirm("ตรวจสอบสลิปถูกต้องแล้ว ต้องการส่งออเดอร์ให้ห้องครัวใช่หรือไม่?")) return;
        updateData = { status: "completed" }; // อนุมัติสลิปเปลี่ยนสถานะเป็น completed
        alertMsg = "อนุมัติสลิปสำเร็จ ส่งออเดอร์เข้าห้องครัวแล้ว!";
      } else if (tab === "store") {
        if (!confirm("ลูกค้ายืนยันชำระเงินเรียบร้อยแล้วใช่หรือไม่?")) return;
        updateData = { status: "completed" };
        alertMsg = "บันทึกรับเงินหน้าร้านสำเร็จ!";
      } else if (tab === "kitchen") {
        if (!confirm("ห้องครัวทำออเดอร์นี้เสร็จสิ้นแล้วใช่หรือไม่?")) return;
        updateData = { kitchen_status: "ready" };
        alertMsg = "อัปเดตสถานะห้องครัวสำเร็จ!";
      }

      const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);
      
      if (error) throw error; 
      
      setActiveOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          return { ...o, ...updateData };
        }
        return o;
      }));
      
      setSelectedOrder(null);
      playBeep();
      alert(alertMsg);
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert("เกิดข้อผิดพลาดในการอัปเดตข้อมูล: " + err.message);
      }
    }
  };

  const fetchDateReport = async () => {
    setIsSearching(true); setReportOrders([]);
    try {
      const { data } = await supabase.from("orders").select(`*, order_items(*, products(*))`).eq("store_id", storeId).gte("created_at", `${startDate}T00:00:00`).lte("created_at", `${endDate}T23:59:59`).order("created_at", { ascending: false });
      if (data) setReportOrders(data);
    } catch (err) { console.error(err); } finally { setIsSearching(false); }
  };

  const fetchDocReport = async () => {
    if(!startDoc || !endDoc) return alert("กรุณากรอกเลขที่เอกสารเริ่มต้นและสิ้นสุด");
    setIsSearching(true); setReportOrders([]);
    try {
      const { data } = await supabase.from("orders").select(`*, order_items(*, products(*))`).eq("store_id", storeId).gte("doc_no", startDoc.trim().toUpperCase()).lte("doc_no", endDoc.trim().toUpperCase()).order("doc_no", { ascending: true });
      if (data) setReportOrders(data);
    } catch (err) { console.error(err); } finally { setIsSearching(false); }
  };

  const fetchProductReport = async () => {
    setIsSearching(true); setReportOrders([]);
    try {
      const { data } = await supabase.from("orders").select(`*, order_items(*, products(*))`).eq("store_id", storeId).eq("status", "completed").gte("created_at", `${startDate}T00:00:00`).lte("created_at", `${endDate}T23:59:59`);
      if (data) setReportOrders(data);
    } catch (err) { console.error(err); } finally { setIsSearching(false); }
  };

  const fetchRevenueReport = async () => {
    setIsSearching(true); setReportOrders([]);
    try {
      const { data } = await supabase.from("orders").select(`*`).eq("store_id", storeId).gte("created_at", `${startDate}T00:00:00`).lte("created_at", `${endDate}T23:59:59`).order("created_at", { ascending: false });
      if (data) setReportOrders(data);
    } catch (err) { console.error(err); } finally { setIsSearching(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดระบบ...</div>;

  if (currentView !== "main") {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 border border-gray-100">
            <h2 className="text-xl font-black text-blue-900 flex items-center gap-2">
              {currentView === "date_report" && "📅 รายงานยอดขายตามช่วงวันที่"}
              {currentView === "doc_report" && "📄 รายงานตามช่วงเลขที่เอกสาร"}
              {currentView === "product_report" && "🔥 รายงานสินค้าขายดี"}
              {currentView === "revenue_report" && "💰 รายงานสรุปรายรับ (เงินสด/โอน)"}
            </h2>
            <button onClick={() => { setReportOrders([]); setCurrentView("main"); }} className="cursor-pointer bg-blue-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-blue-800 transition-all active:scale-95 text-sm">
              ← กลับหน้าแดชบอร์ดหลัก
            </button>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            {currentView !== "doc_report" && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">วันที่เริ่มต้น:</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm font-medium" /></div>
                <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">ถึงวันที่:</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm font-medium" /></div>
              </div>
            )}
            {currentView === "doc_report" && (
              <div className="flex flex-wrap items-center gap-4">
                 <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">เลขที่เริ่มต้น:</label><input type="text" placeholder="เช่น ABB2608-0001" value={startDoc} onChange={e => setStartDoc(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm font-bold uppercase" /></div>
                <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">เลขที่สิ้นสุด:</label><input type="text" placeholder="เช่น ABB2608-0099" value={endDoc} onChange={e => setEndDoc(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm font-bold uppercase" /></div>
              </div>
            )}
            {currentView === "product_report" && (
              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">ชื่อสินค้า (ตั้งแต่):</label><input type="text" placeholder="ก (เว้นว่างคือทั้งหมด)" value={startProduct} onChange={e => setStartProduct(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm" /></div>
                <div className="flex items-center gap-2"><label className="text-sm font-bold text-gray-700">ชื่อสินค้า (ถึง):</label><input type="text" placeholder="ฮ (เว้นว่างคือทั้งหมด)" value={endProduct} onChange={e => setEndProduct(e.target.value)} className="px-3 py-2 border rounded-xl bg-gray-50 text-sm" /></div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => {
                  if(currentView === 'date_report') fetchDateReport();
                  if(currentView === 'doc_report') fetchDocReport();
                  if(currentView === 'product_report') fetchProductReport();
                  if(currentView === 'revenue_report') fetchRevenueReport();
                }}
                disabled={isSearching}
                className="cursor-pointer bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2.5 px-8 rounded-xl shadow-md transition-all active:scale-95 text-sm"
              >
                {isSearching ? "⏳ กำลังประมวลผล..." : "🔍 ค้นหาข้อมูล"}
              </button>
              
              {reportOrders.length > 0 && (
                <button 
                  onClick={() => {
                    let csvData: string[][] = [];
                    if(currentView === 'revenue_report') {
                      csvData = [
                        ["วันที่", "เลขที่บิล", "เงินสด", "เงินโอน", "ค้างชำระ", "ยอดรวม"],
                        ...reportOrders.map(o => {
                          const cash = o.status === 'completed' && o.payment_method === 'cash' ? o.total_amount : 0;
                          const transfer = o.status === 'completed' && o.payment_method === 'transfer' ? o.total_amount : 0;
                          const pending = o.status !== 'completed' && o.status !== 'cancelled' ? o.total_amount : 0;
                          return [o.created_at.split('T')[0], o.doc_no, cash.toString(), transfer.toString(), pending.toString(), o.total_amount.toString()];
                        }),
                        ["", "ยอดรวมทั้งหมด", revenueTotalCash.toString(), revenueTotalTransfer.toString(), revenueTotalPending.toString(), revenueTotalAll.toString()]
                      ];
                    } else if (currentView === 'product_report') {
                      csvData = [
                        ["ชื่อสินค้า", "จำนวนที่ขายได้", "ยอดขายรวม"],
                        ...Object.keys(pMap).map(k => [k, pMap[k].qty.toString(), pMap[k].rev.toString()]),
                        ["ยอดรวมทั้งหมด", productTotalQty.toString(), productTotalRev.toString()]
                      ];
                    } else {
                      csvData = [
                         ["เลขที่บิล", "วันที่", "ลูกค้า", "สถานะ", "ยอดสุทธิ"],
                         ...reportOrders.map(o => [o.doc_no, o.created_at.split('T')[0], o.customer_name || "-", o.status, o.total_amount.toString()]),
                         ["", "", "", "ยอดสุทธิรวม", reportTotalNet.toString()]
                      ];
                    }
                    exportToCSV(`Report_${currentView}_${todayStr}`, csvData);
                  }}
                  className="cursor-pointer bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all active:scale-95 text-sm flex items-center gap-2"
                >
                  📥 Export CSV
                </button>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 min-h-[400px]">
             {!isSearching && reportOrders.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full py-20 text-gray-400">
                 <span className="text-6xl mb-4 opacity-50 block">📊</span>
                 <p className="text-lg font-bold">ระบุเงื่อนไขด้านบน แล้วกด &quot;ค้นหาข้อมูล&quot;</p>
               </div>
             ) : (
               <div className="overflow-x-auto">
                 {currentView === "revenue_report" && (
                   <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                      <thead>
                        <tr className="bg-blue-900 text-white text-xs">
                          <th className="p-3 rounded-tl-lg">เลขที่บิล</th>
                          <th className="p-3">วันที่</th>
                          <th className="p-3 text-right">เงินสด</th>
                          <th className="p-3 text-right">เงินโอน</th>
                          <th className="p-3 text-right">ค้างชำระ</th>
                          <th className="p-3 text-right rounded-tr-lg">ยอดรวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reportOrders.map(o => {
                          const cash = o.status === 'completed' && o.payment_method === 'cash' ? o.total_amount : 0;
                          const transfer = o.status === 'completed' && o.payment_method === 'transfer' ? o.total_amount : 0;
                          const pending = o.status !== 'completed' && o.status !== 'cancelled' ? o.total_amount : 0;
                          return (
                            <tr key={o.id} className="hover:bg-gray-50">
                              <td className="p-3 font-bold">{o.doc_no}</td>
                              <td className="p-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('th-TH')}</td>
                              <td className="p-3 text-right font-medium text-green-600">{cash > 0 ? `฿${cash.toLocaleString()}` : "-"}</td>
                              <td className="p-3 text-right font-medium text-blue-600">{transfer > 0 ? `฿${transfer.toLocaleString()}` : "-"}</td>
                              <td className="p-3 text-right font-medium text-orange-500">{pending > 0 ? `฿${pending.toLocaleString()}` : "-"}</td>
                              <td className="p-3 text-right font-black text-gray-800">฿{o.total_amount.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-blue-50 text-blue-900 text-sm border-t-2 border-blue-200">
                         <tr>
                           <td className="p-3 font-black text-right rounded-bl-lg" colSpan={2}>รวมทั้งสิ้น</td>
                           <td className="p-3 font-black text-right text-green-700">฿{revenueTotalCash.toLocaleString()}</td>
                           <td className="p-3 font-black text-right text-blue-700">฿{revenueTotalTransfer.toLocaleString()}</td>
                           <td className="p-3 font-black text-right text-orange-600">฿{revenueTotalPending.toLocaleString()}</td>
                           <td className="p-3 font-black text-right rounded-br-lg">฿{revenueTotalAll.toLocaleString()}</td>
                         </tr>
                      </tfoot>
                   </table>
                 )}

                 {currentView === "product_report" && (
                   <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-blue-900 text-white text-xs">
                          <th className="p-3 rounded-tl-lg">อันดับ</th>
                          <th className="p-3">ชื่อสินค้า</th>
                          <th className="p-3 text-center">ขายได้ (ชิ้น)</th>
                          <th className="p-3 text-right rounded-tr-lg">ยอดขายรวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.keys(pMap).sort((a,b) => pMap[b].rev - pMap[a].rev).map((name, idx) => (
                           <tr key={name} className="hover:bg-gray-50">
                             <td className="p-3">{idx+1}</td>
                             <td className="p-3 font-bold">{name}</td>
                             <td className="p-3 text-center text-blue-600 font-bold">{pMap[name].qty}</td>
                             <td className="p-3 text-right font-black">฿{pMap[name].rev.toLocaleString()}</td>
                           </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 text-blue-900 text-sm border-t-2 border-blue-200">
                        <tr>
                          <td className="p-3 font-black text-right rounded-bl-lg" colSpan={2}>รวมยอดจำหน่าย</td>
                          <td className="p-3 font-black text-center text-blue-700">{productTotalQty.toLocaleString()} ชิ้น</td>
                          <td className="p-3 font-black text-right rounded-br-lg">฿{productTotalRev.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                   </table>
                 )}

                 {(currentView === "date_report" || currentView === "doc_report") && (
                   <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-blue-900 text-white text-xs">
                          <th className="p-3 rounded-tl-lg">วันที่</th>
                          <th className="p-3">เลขที่บิล</th>
                          <th className="p-3">ลูกค้า</th>
                          <th className="p-3 text-center">สถานะ</th>
                          <th className="p-3 text-right rounded-tr-lg">ยอดสุทธิ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reportOrders.map(o => (
                          <tr key={o.id} className="hover:bg-gray-50">
                            <td className="p-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleString('th-TH')}</td>
                            <td className="p-3 font-bold">{o.doc_no}</td>
                            <td className="p-3">{o.customer_name || "-"}</td>
                            <td className="p-3 text-center"><span className={`px-2 py-1 text-xs rounded-lg font-bold ${o.status==='completed'?'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}`}>{o.status}</span></td>
                            <td className="p-3 text-right font-black text-blue-600">฿{o.total_amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 text-blue-900 text-sm border-t-2 border-blue-200">
                        <tr>
                          <td className="p-3 font-black text-right rounded-bl-lg" colSpan={4}>ยอดสุทธิรวมทั้งสิ้น</td>
                          <td className="p-3 font-black text-right text-blue-700 rounded-br-lg">฿{reportTotalNet.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                   </table>
                 )}
               </div>
             )}
          </div>
        </div>
      </div>
    );
  }

  // --- เลือกลิสต์ข้อมูลตาม Tab ที่ใช้งาน ---
  const displayQueue = activeQueueTab === "online" ? onlineQueue : activeQueueTab === "store" ? storeQueue : kitchenQueue;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-5 rounded-3xl shadow-sm border border-gray-100 gap-4">
          <div>
            <h1 className="text-2xl font-black text-blue-900 flex items-center gap-2">📊 แดชบอร์ดวิเคราะห์ยอดขาย</h1>
            <p className="text-sm font-medium text-gray-500 mt-1">เลือกระบบรายงานที่ต้องการด้านล่าง</p>
          </div>
          <button onClick={() => { playBeep(); router.push("/"); }} className="cursor-pointer px-6 py-3 bg-blue-900 text-white font-bold rounded-xl shadow-md hover:bg-blue-800 transition-all active:scale-95 text-sm">
            🏠 กลับหน้าหลัก (Home)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button onClick={() => setCurrentView("date_report")} className="cursor-pointer bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-300 transition-all text-left flex flex-col group">
            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform block">📅</span>
            <h3 className="font-black text-gray-800 text-lg">1. รายงานตามวันที่</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">ดูบิลยอดขายตามช่วงวันที่เริ่มต้น-สิ้นสุด</p>
          </button>
          
          <button onClick={() => setCurrentView("doc_report")} className="cursor-pointer bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-300 transition-all text-left flex flex-col group">
            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform block">📄</span>
            <h3 className="font-black text-gray-800 text-lg">2. รายงานตามเลขที่บิล</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">ค้นหาบิลตั้งแต่เลขที่ - ถึงเลขที่เอกสาร</p>
          </button>

          <button onClick={() => setCurrentView("product_report")} className="cursor-pointer bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-red-300 transition-all text-left flex flex-col group">
            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform block">🔥</span>
            <h3 className="font-black text-gray-800 text-lg">3. รายงานสินค้าขายดี</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">สรุปยอดขายจัดอันดับตามสินค้าที่เลือก</p>
          </button>

          <button onClick={() => setCurrentView("revenue_report")} className="cursor-pointer bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md hover:border-green-300 transition-all text-left flex flex-col group">
            <span className="text-4xl mb-3 group-hover:scale-110 transition-transform block">💰</span>
            <h3 className="font-black text-gray-800 text-lg">4. รายงานสรุปรายรับ</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">แยกประเภทการชำระเงินสด/เงินโอน/ค้างชำระ</p>
          </button>
        </div>

        {/* ส่วนที่ 3: ระบบตรวจสอบสถานะ 3 คิว */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col mt-8">
          <div className="flex bg-gray-100 p-2 gap-2 overflow-x-auto scrollbar-hide">
            <button 
              onClick={() => setActiveQueueTab("online")} 
              className={`cursor-pointer flex-1 py-3 px-4 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${activeQueueTab === 'online' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              1. ออนไลน์รอตรวจสลิป ({onlineQueue.length})
            </button>
            <button 
              onClick={() => setActiveQueueTab("store")} 
              className={`cursor-pointer flex-1 py-3 px-4 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${activeQueueTab === 'store' ? 'bg-yellow-500 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              2. หน้าร้านรอชำระเงิน ({storeQueue.length})
            </button>
            <button 
              onClick={() => setActiveQueueTab("kitchen")} 
              className={`cursor-pointer flex-1 py-3 px-4 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${activeQueueTab === 'kitchen' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              3. ห้องครัวค้างทำ ({kitchenQueue.length})
            </button>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto p-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-100">
                  <th className="p-4 font-bold uppercase tracking-wider">เลขที่บิล / เวลา</th>
                  <th className="p-4 font-bold uppercase tracking-wider">ช่องทาง</th>
                  <th className="p-4 text-right font-bold uppercase tracking-wider">ยอดสุทธิ</th>
                  <th className="p-4 text-center font-bold uppercase tracking-wider">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {displayQueue.length === 0 ? (
                  <tr><td colSpan={4} className="p-16 text-center text-gray-400 font-bold">🎉 ไม่มีคิวค้างในหมวดหมู่นี้</td></tr>
                ) : (
                  displayQueue.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <p className="font-black text-gray-800 text-base">{order.doc_no}</p>
                        {order.customer_name && <p className="text-xs text-blue-600 font-bold mt-0.5">👤 {order.customer_name}</p>}
                        <p className="text-[10px] font-medium text-gray-400 mt-1">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                      </td>
                      <td className="p-4 text-xs font-bold text-gray-500">
                        {order.order_source === "ONLINE" ? "🌐 ออนไลน์" : order.order_source === "KIOSK" ? "🤖 ตู้คีออส" : "🏪 แคชเชียร์"}
                      </td>
                      <td className="p-4 text-right font-black text-blue-600 text-lg">฿{order.total_amount.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <button onClick={() => { playBeep(); setSelectedOrder(order); }} className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-5 py-2 rounded-xl text-xs font-bold transition-all border border-blue-200 shadow-sm active:scale-95">
                          ดูรายละเอียด / ดำเนินการ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- Modal รายละเอียดบิลและจัดการสถานะ --- */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 animate-fade-in-up">
            <div className="p-5 bg-blue-900 text-white flex justify-between items-center shrink-0">
              <h2 className="font-black text-lg flex items-center gap-2">
                📄 รหัสบิล: {selectedOrder.doc_no}
              </h2>
              <button onClick={() => { playBeep(); setSelectedOrder(null); }} className="cursor-pointer text-white font-black text-xl hover:scale-110 transition-transform">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-gray-50/50">
              {(selectedOrder.customer_name || selectedOrder.customer_phone || selectedOrder.delivery_address) && (
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-sm text-gray-700 space-y-2">
                  <h3 className="font-black text-blue-900 mb-2 border-b border-gray-100 pb-2">ข้อมูลการจัดส่ง</h3>
                  {selectedOrder.customer_name && <p><strong className="text-gray-500">ชื่อผู้รับ:</strong> {selectedOrder.customer_name}</p>}
                  {selectedOrder.customer_phone && <p><strong className="text-gray-500">เบอร์ติดต่อ:</strong> {selectedOrder.customer_phone}</p>}
                  {selectedOrder.delivery_address && (
                    <div className="pt-2">
                      <strong className="text-gray-500 block mb-1">ที่อยู่จัดส่ง:</strong>
                      <p className="whitespace-pre-wrap text-xs bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium leading-relaxed">{selectedOrder.delivery_address}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <h3 className="font-black text-blue-900 mb-3 border-b border-gray-100 pb-2 text-sm">รายการสินค้า</h3>
                <div className="space-y-3 text-sm">
                  {selectedOrder.order_items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="font-bold text-gray-800"><span className="text-blue-600 mr-1">{item.qty} x</span>{item.products?.name || "สินค้า"}</p>
                        {item.remark && <p className="text-[10px] font-bold text-orange-600 bg-orange-50 inline-block px-1.5 py-0.5 mt-1 rounded-md border border-orange-100">- {item.remark}</p>}
                      </div>
                      <p className="font-black text-gray-800">฿{(item.unit_price * item.qty).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-end font-black text-blue-900 pt-4 mt-2 border-t-2 border-dashed border-gray-200">
                  <span className="text-sm">ยอดสุทธิรวม</span>
                  <span className="text-2xl">฿{selectedOrder.total_amount.toLocaleString()}</span>
                </div>
              </div>
              
              {selectedOrder.slip_image && (
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-xs font-bold text-gray-500 mb-3 flex justify-between items-center">
                    <span>หลักฐานการโอนเงิน (สลิป)</span>
                    <span className="text-blue-600 cursor-pointer hover:underline" onClick={() => setViewFullScreenImage(selectedOrder.slip_image!)}>🔍 ขยายเต็มจอ</span>
                  </p>
                  <img 
                    src={selectedOrder.slip_image} 
                    alt="Slip" 
                    className="w-full rounded-xl object-contain max-h-64 cursor-pointer hover:opacity-80 transition-opacity border border-gray-100 bg-gray-50" 
                    onClick={() => { playBeep(); setViewFullScreenImage(selectedOrder.slip_image!); }}
                  />
                </div>
              )}

              {/* ปุ่มจัดการสถานะแปรผันตามคิว */}
              <button 
                onClick={() => handleUpdateStatus(selectedOrder.id, selectedOrder.order_source, selectedOrder.status, activeQueueTab)} 
                className="cursor-pointer w-full mt-4 bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
              >
                {activeQueueTab === "online" && "✅ ตรวจสอบสลิปถูกต้อง & ส่งเข้าครัว"}
                {activeQueueTab === "store" && "💵 ยืนยันลูกค้าชำระเงินแล้ว"}
                {activeQueueTab === "kitchen" && "👨‍🍳 ห้องครัวทำเสร็จเรียบร้อย"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewFullScreenImage && (
        <div className="fixed inset-0 z-[100] bg-blue-950/95 flex flex-col items-center justify-center p-4 backdrop-blur-md" onClick={() => setViewFullScreenImage(null)}>
          <div className="w-full flex justify-end mb-4 max-w-3xl">
             <button className="cursor-pointer text-white text-3xl font-black bg-white/20 hover:bg-white/30 w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all" onClick={(e) => { e.stopPropagation(); setViewFullScreenImage(null); }}>✕</button>
          </div>
          <img src={viewFullScreenImage} className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10" alt="Full screen slip" />
        </div>
      )}
    </div>
  );
}