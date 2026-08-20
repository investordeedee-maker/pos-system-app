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
  order_items: OrderItem[];
  slip_image?: string;
}

interface BestSeller {
  name: string;
  totalQty: number;
  totalRevenue: number;
}

interface CustomWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

// 🔔 ฟังก์ชันเสียง (Beep)
let audioCtx: AudioContext | null = null;
const playBeep = () => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as CustomWindow).webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = "sine"; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } catch { }
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const todayStr = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (!profile?.store_id) return;

        const { data, error } = await supabase
          .from("orders")
          .select(`*, order_items(*, products(*))`)
          .eq("store_id", profile.store_id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (data && isMounted) {
          setOrders(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchOrders();
    return () => { isMounted = false; };
  }, [router]);

  const filteredOrders = orders.filter(order => {
    const orderDate = order.created_at.split("T")[0];
    return orderDate >= startDate && orderDate <= endDate;
  });

  const completedOrders = filteredOrders.filter(o => o.status === "completed");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalPending = filteredOrders.filter(o => o.status === "pending").reduce((sum, o) => sum + o.total_amount, 0);
  const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

  const productMap: { [name: string]: { qty: number; revenue: number } } = {};
  completedOrders.forEach(order => {
    order.order_items?.forEach(item => {
      const name = item.products?.name || "สินค้าไม่ระบุชื่อ";
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
      productMap[name].qty += item.qty;
      productMap[name].revenue += item.qty * item.unit_price;
    });
  });

  const bestSellers: BestSeller[] = Object.keys(productMap).map(name => ({
    name,
    totalQty: productMap[name].qty,
    totalRevenue: productMap[name].revenue,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูลแดชบอร์ด...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📊 แดชบอร์ดวิเคราะห์ยอดขายระดับมืออาชีพ</h1>
            <p className="text-xs text-gray-500 mt-0.5">วิเคราะห์ข้อมูลการขาย สินค้าขายดี และสถานะบิลตามช่วงเวลา</p>
          </div>
          <button onClick={() => { playBeep(); router.push("/pos"); }} className="cursor-pointer px-5 py-2.5 bg-gray-900 text-white font-bold rounded-xl shadow-md hover:bg-gray-800 transition-all">
            ← กลับหน้า POS
          </button>
        </div>

        {/* ตัวกรองวันที่ */}
        <div className="bg-white p-4 rounded-2xl shadow-sm flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-700">ตั้งแต่วันที่:</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border rounded-xl outline-none font-medium bg-gray-50" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-700">ถึงวันที่:</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border rounded-xl outline-none font-medium bg-gray-50" />
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => { playBeep(); setStartDate(todayStr); setEndDate(todayStr); }} className="cursor-pointer px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-xl text-xs">วันนี้</button>
            <button onClick={() => { playBeep(); setStartDate(firstDayOfMonth); setEndDate(todayStr); }} className="cursor-pointer px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-xl text-xs">เดือนนี้</button>
          </div>
        </div>

        {/* สรุปตัวเลข (KPI Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-green-500">
            <p className="text-xs font-bold text-gray-400 uppercase">ยอดขายสำเร็จรวม</p>
            <p className="text-3xl font-black text-green-600 mt-1">฿{totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-2">{completedOrders.length} บิลที่ชำระเงินแล้ว</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-blue-500">
            <p className="text-xs font-bold text-gray-400 uppercase">มูลค่าเฉลี่ยต่อบิล</p>
            <p className="text-3xl font-black text-blue-600 mt-1">฿{avgOrderValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-2">คำนวณจากบิลที่สำเร็จ</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-orange-500">
            <p className="text-xs font-bold text-gray-400 uppercase">ยอดค้างชำระทั้งหมด</p>
            <p className="text-3xl font-black text-orange-600 mt-1">฿{totalPending.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-2">{filteredOrders.filter(o => o.status === "pending").length} บิลรอดำเนินการ</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-purple-500">
            <p className="text-xs font-bold text-gray-400 uppercase">จำนวนบิลทั้งหมด</p>
            <p className="text-3xl font-black text-purple-600 mt-1">{filteredOrders.length} บิล</p>
            <p className="text-xs text-gray-500 mt-2">ในช่วงเวลาที่เลือก</p>
          </div>
        </div>

        {/* ตารางวิเคราะห์: สินค้าขายดี & ประวัติบิล */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* สินค้าขายดี */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-gray-900 text-white font-bold text-sm">🔥 สินค้าขายดีประจำช่วงเวลา</div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[400px] space-y-3">
              {bestSellers.length === 0 ? <p className="text-center text-gray-400 text-sm mt-10">ไม่มีข้อมูลการขายในช่วงเวลานี้</p> :
                bestSellers.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{idx + 1}. {item.name}</p>
                      <p className="text-xs text-gray-500">ขายได้: <span className="font-bold text-blue-600">{item.totalQty}</span> ชิ้น</p>
                    </div>
                    <p className="font-black text-gray-800 text-base">฿{item.totalRevenue.toLocaleString()}</p>
                  </div>
                ))
              }
            </div>
          </div>

          {/* รายการบิลทั้งหมด (คลิกดูรายละเอียดได้) */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-gray-800 text-white font-bold text-sm flex justify-between items-center">
              <span>📋 รายการบิลช่วงวันที่เลือก ({filteredOrders.length} บิล)</span>
              <span className="text-xs text-gray-300 font-normal">คลิกที่ &quot;ดูบิล&quot; เพื่อตรวจสอบรายการสินค้า</span>
            </div>
            <div className="overflow-x-auto flex-1 max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs border-b">
                    <th className="p-3">เลขที่บิล</th>
                    <th className="p-3">วันที่/เวลา</th>
                    <th className="p-3 text-right">ยอดสุทธิ</th>
                    <th className="p-3 text-center">สถานะ</th>
                    <th className="p-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">ไม่พบรายการบิลในช่วงเวลานี้</td></tr>
                  ) : (
                    filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-bold text-gray-800">{order.doc_no}</td>
                        <td className="p-3 text-gray-500 text-xs">{new Date(order.created_at).toLocaleString('th-TH')}</td>
                        <td className="p-3 text-right font-black text-blue-600">฿{order.total_amount.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {order.status === 'completed' ? 'ชำระแล้ว' : 'ค้างชำระ'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => { playBeep(); setSelectedOrder(order); }} className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold transition-colors">
                            🔍 ดูบิล
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

      </div>

      {/* --- Modal แสดงรายละเอียดบิลที่เลือก --- */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
              <h2 className="font-bold text-base">📄 รายละเอียดบิล: {selectedOrder.doc_no}</h2>
              <button onClick={() => { playBeep(); setSelectedOrder(null); }} className="cursor-pointer text-white font-bold text-xl">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-3">
              <p className="text-xs text-gray-500">วันที่ทำรายการ: {new Date(selectedOrder.created_at).toLocaleString('th-TH')}</p>
              <div className="border-t border-b border-dashed py-3 space-y-2">
                {selectedOrder.order_items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div>
                      <p className="font-bold text-gray-800">{item.qty} x {item.products?.name || "สินค้า"}</p>
                      {item.remark && <p className="text-xs text-orange-600">- หมายเหตุ: {item.remark}</p>}
                    </div>
                    <p className="font-bold text-gray-800">฿{(item.unit_price * item.qty).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-black text-lg text-blue-600 pt-2">
                <span>ยอดสุทธิรวม</span>
                <span>฿{selectedOrder.total_amount.toLocaleString()}</span>
              </div>
              
              {selectedOrder.slip_image && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 mb-2">สลิปที่แนบมา:</p>
                  <img src={selectedOrder.slip_image} alt="Slip" className="w-full rounded-lg object-contain max-h-64" />
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t">
              <button onClick={() => { playBeep(); setSelectedOrder(null); }} className="cursor-pointer w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl transition-colors">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}