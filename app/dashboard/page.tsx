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
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  slip_image?: string;
  order_items: OrderItem[];
}

interface BestSeller {
  name: string;
  totalQty: number;
  totalRevenue: number;
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

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const todayStr = new Date().toISOString().split("T")[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewFullScreenImage, setViewFullScreenImage] = useState<string | null>(null);

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
        if (data && isMounted) setOrders(data);
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
    name, totalQty: productMap[name].qty, totalRevenue: productMap[name].revenue,
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const confirmPaymentForOnlineOrder = async (orderId: string) => {
    if (!confirm("คุณตรวจสอบสลิปและต้องการยืนยันการรับเงินใช่หรือไม่?")) return;
    try {
      await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "completed" } : o));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: "completed" });
      }
      playBeep();
      alert("ยืนยันรับเงินสำเร็จ!");
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center font-bold text-gray-500">กำลังโหลดข้อมูลแดชบอร์ด...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-800">📊 แดชบอร์ดวิเคราะห์ยอดขาย</h1>
            <p className="text-xs text-gray-500 mt-0.5">ตรวจสอบออเดอร์หน้าร้าน และยืนยันออเดอร์ออนไลน์</p>
          </div>
          <button onClick={() => { playBeep(); router.push("/"); }} className="cursor-pointer px-5 py-2.5 bg-gray-900 text-white font-bold rounded-xl shadow-md hover:bg-gray-800 transition-all">
            🏠 กลับหน้าหลัก (Home)
          </button>
        </div>

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
            <p className="text-xs font-bold text-gray-400 uppercase">ยอดรอยืนยัน / ค้างชำระ</p>
            <p className="text-3xl font-black text-orange-600 mt-1">฿{totalPending.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-2">{filteredOrders.filter(o => o.status === "pending").length} บิลรอดำเนินการ</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-purple-500">
            <p className="text-xs font-bold text-gray-400 uppercase">จำนวนบิลทั้งหมด</p>
            <p className="text-3xl font-black text-purple-600 mt-1">{filteredOrders.length} บิล</p>
            <p className="text-xs text-gray-500 mt-2">ออฟไลน์ + ออนไลน์</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-gray-900 text-white font-bold text-sm">🔥 สินค้าขายดีประจำช่วงเวลา</div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[400px] space-y-3">
              {bestSellers.length === 0 ? <p className="text-center text-gray-400 text-sm mt-10">ไม่มีข้อมูลการขาย</p> :
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

          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-gray-800 text-white font-bold text-sm flex justify-between items-center">
              <span>📋 รายการบิลทั้งหมด ({filteredOrders.length} บิล)</span>
            </div>
            <div className="overflow-x-auto flex-1 max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs border-b">
                    <th className="p-3">เลขที่บิล / ลูกค้า</th>
                    <th className="p-3">ช่องทาง</th>
                    <th className="p-3 text-right">ยอดสุทธิ</th>
                    <th className="p-3 text-center">สถานะ</th>
                    <th className="p-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">ไม่พบรายการบิล</td></tr>
                  ) : (
                    filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3">
                          <p className="font-bold text-gray-800">{order.doc_no}</p>
                          {order.customer_name && <p className="text-xs text-blue-600 font-medium">👤 {order.customer_name}</p>}
                          <p className="text-[10px] text-gray-400">{new Date(order.created_at).toLocaleString('th-TH')}</p>
                        </td>
                        <td className="p-3 text-xs font-bold text-gray-500">
                          {order.order_source === "ONLINE" ? "🌐 ออนไลน์" : "🏪 หน้าร้าน"}
                        </td>
                        <td className="p-3 text-right font-black text-blue-600">฿{order.total_amount.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700 animate-pulse'}`}>
                            {order.status === 'completed' ? 'ชำระแล้ว' : 'รอยืนยัน/ค้างชำระ'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => { playBeep(); setSelectedOrder(order); }} className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            รายละเอียด
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

      {/* --- Modal รายละเอียดบิล --- */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold text-base flex items-center gap-2">
                📄 รายละเอียดบิล: {selectedOrder.doc_no}
                {selectedOrder.status === 'pending' && <span className="bg-orange-500 text-xs px-2 py-0.5 rounded-full">รอยืนยัน</span>}
              </h2>
              <button onClick={() => { playBeep(); setSelectedOrder(null); }} className="cursor-pointer text-white font-bold text-xl">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              
              {/* ข้อมูลลูกค้า (ถ้ามี) */}
              {(selectedOrder.customer_name || selectedOrder.customer_phone || selectedOrder.delivery_address) && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-gray-700 space-y-2">
                  <h3 className="font-bold text-blue-800 mb-2 border-b border-blue-200 pb-1">ข้อมูลลูกค้า / การจัดส่ง</h3>
                  {selectedOrder.customer_name && <p><strong>👤 ชื่อผู้รับ:</strong> {selectedOrder.customer_name}</p>}
                  {selectedOrder.customer_phone && <p><strong>📞 เบอร์ติดต่อ:</strong> {selectedOrder.customer_phone}</p>}
                  {selectedOrder.delivery_address && (
                    <div>
                      <strong>📍 ที่อยู่จัดส่ง/พิกัด:</strong>
                      <p className="mt-1 whitespace-pre-wrap text-xs bg-white p-2 rounded border border-blue-100">{selectedOrder.delivery_address}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="border border-gray-200 rounded-xl p-4">
                <h3 className="font-bold text-gray-800 mb-2 border-b pb-1 text-sm">รายการสินค้า</h3>
                <div className="space-y-2 text-sm">
                  {selectedOrder.order_items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-700">{item.qty} x {item.products?.name || "สินค้า"}</p>
                        {item.remark && <p className="text-xs text-orange-600 bg-orange-50 inline-block px-1 mt-0.5 rounded">- {item.remark}</p>}
                      </div>
                      <p className="font-bold text-gray-800">฿{(item.unit_price * item.qty).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-lg text-blue-600 pt-3 mt-3 border-t border-dashed">
                  <span>ยอดสุทธิรวม</span>
                  <span>฿{selectedOrder.total_amount.toLocaleString()}</span>
                </div>
              </div>
              
              {/* สลิปโอนเงิน (คลิกเพื่อดูเต็มจอ) */}
              {selectedOrder.slip_image && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 mb-2 flex justify-between items-center">
                    <span>หลักฐานการโอนเงิน (สลิป):</span>
                    <span className="text-blue-600 cursor-pointer" onClick={() => setViewFullScreenImage(selectedOrder.slip_image!)}>🔍 ขยายเต็มจอ</span>
                  </p>
                  <img 
                    src={selectedOrder.slip_image} 
                    alt="Slip" 
                    className="w-full rounded-lg object-contain max-h-64 cursor-pointer hover:opacity-80 transition-opacity border bg-white" 
                    onClick={() => { playBeep(); setViewFullScreenImage(selectedOrder.slip_image!); }}
                  />
                  {selectedOrder.status === "pending" && (
                    <button onClick={() => confirmPaymentForOnlineOrder(selectedOrder.id)} className="cursor-pointer w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-md transition-all">
                      ✅ ตรวจสอบสลิปถูกต้อง / ยืนยันรับเงิน
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Full Screen Image Viewer --- */}
      {viewFullScreenImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewFullScreenImage(null)}>
          <div className="w-full flex justify-end mb-4 max-w-3xl">
             <button className="cursor-pointer text-white text-4xl font-bold bg-gray-800 hover:bg-gray-700 w-12 h-12 rounded-full flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setViewFullScreenImage(null); }}>✕</button>
          </div>
          <img src={viewFullScreenImage} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" alt="Full screen slip" />
          <p className="text-gray-400 mt-4 text-sm font-medium animate-pulse">แตะที่ใดก็ได้เพื่อปิด</p>
        </div>
      )}

    </div>
  );
}