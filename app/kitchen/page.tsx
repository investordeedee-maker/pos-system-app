"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface OrderItem {
  id: string;
  qty: number;
  unit_price: number;
  remark?: string;
  products?: { name: string };
}

interface Order {
  id: string;
  doc_no: string;
  created_at: string;
  order_source: string;
  kitchen_status: string;
  order_items: OrderItem[];
}

export default function KitchenDisplayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // โหลดข้อมูลออเดอร์
  useEffect(() => {
    let isMounted = true;
    
    const fetchOrders = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).single();
        if (!profile?.store_id) return;

        const today = new Date().toISOString().split("T")[0];
        const { data, error } = await supabase
          .from("orders")
          .select(`*, order_items(*, products(name))`)
          .eq("store_id", profile.store_id)
          .eq("kitchen_status", "pending")
          .gte("created_at", today)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (data && isMounted) setOrders(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    // รีเฟรชข้อมูลอัตโนมัติทุกๆ 3 วินาที
    const interval = setInterval(fetchOrders, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // ตรวจสอบสถานะ Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { 
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // ฟังก์ชันสลับ Fullscreen (เปิด/ปิด)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const markAsDone = async (orderId: string) => {
    try {
      await supabase.from("orders").update({ kitchen_status: "ready" }).eq("id", orderId);
      // นำออเดอร์ที่เสร็จแล้วออกจากหน้าจอทันที
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-slate-400 font-bold text-xl gap-4">
      <div className="w-16 h-16 border-4 border-slate-600 border-t-orange-500 rounded-full animate-spin"></div>
      กำลังโหลดระบบห้องครัว...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-4 md:p-6 font-sans overflow-hidden flex flex-col">
      
      {/* Header ควบคุมระบบ */}
      <div className="flex justify-between items-center mb-6 bg-slate-800/80 backdrop-blur-md p-5 rounded-3xl border border-slate-700 shadow-lg shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-orange-500/20">
            👨‍🍳
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">จอรายการอาหาร <span className="text-orange-500 hidden sm:inline">(KDS)</span></h1>
            <p className="text-slate-400 text-sm mt-0.5 font-medium">ออเดอร์แสดงผลเรียงตามคิวอัตโนมัติ</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 px-5 py-2.5 rounded-2xl border border-slate-700 shadow-inner flex flex-col items-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">คิวรอทำ</p>
            <p className="text-2xl font-black text-orange-400 leading-none mt-1">{orders.length}</p>
          </div>
          <button onClick={toggleFullscreen} className="cursor-pointer bg-slate-700 hover:bg-slate-600 w-14 h-14 rounded-2xl font-bold transition-colors flex items-center justify-center text-2xl shadow-sm border border-slate-600">
            {isFullscreen ? "🗗" : "🖵"}
          </button>
          <button onClick={() => router.push("/")} className="cursor-pointer bg-slate-700 hover:bg-red-500 hover:text-white w-14 h-14 rounded-2xl font-bold transition-colors flex items-center justify-center text-2xl shadow-sm border border-slate-600">
            ✕
          </button>
        </div>
      </div>

      {/* พื้นที่แสดงการ์ดออเดอร์ */}
      <div className="flex-1 overflow-y-auto pb-8 pr-2 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {orders.length === 0 ? (
            <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-500 bg-slate-800/30 rounded-[3rem] border border-slate-800 border-dashed">
              <div className="text-8xl mb-6 opacity-40 grayscale">☕</div>
              <p className="text-3xl font-black tracking-tight text-slate-400">ไม่มีคิวอาหารในขณะนี้</p>
              <p className="text-slate-500 mt-2 font-medium">พร้อมรับออเดอร์ถัดไป...</p>
            </div>
          ) : (
            orders.map((order) => {
              const orderTime = new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
              const isLate = (new Date().getTime() - new Date(order.created_at).getTime()) > 15 * 60 * 1000;

              return (
                <div key={order.id} className={`flex flex-col bg-slate-800 rounded-[2rem] overflow-hidden border-t-4 shadow-xl transition-all duration-300 animate-fade-in-up ${isLate ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : order.order_source === 'ONLINE' ? 'border-blue-500' : 'border-orange-500'}`}>
                  
                  {/* หัวการ์ดบิล */}
                  <div className="p-5 bg-slate-800/90 border-b border-slate-700 flex justify-between items-start shrink-0 relative overflow-hidden">
                    {isLate && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl rounded-full"></div>}
                    <div className="relative z-10">
                      <h2 className="text-2xl font-black text-white tracking-tight">{order.doc_no}</h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${order.order_source === 'ONLINE' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                          {order.order_source === "ONLINE" ? "🌐 ออนไลน์" : "🏪 หน้าร้าน"}
                        </span>
                        {isLate && <span className="text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">⏰ รอนาน</span>}
                      </div>
                    </div>
                    <div className={`relative z-10 text-2xl font-black tabular-nums ${isLate ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                      {orderTime}
                    </div>
                  </div>
                  
                  {/* รายการอาหาร */}
                  <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-slate-900/40 min-h-[12rem]">
                    {order.order_items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-10 h-10 shrink-0 bg-slate-700/50 text-orange-400 border border-slate-600 rounded-xl flex items-center justify-center font-black text-xl shadow-inner">
                          {item.qty}
                        </div>
                        <div className="pt-1 flex-1">
                          <span className="font-bold text-slate-100 text-lg leading-tight block">{item.products?.name || "สินค้า"}</span>
                          {item.remark && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-1.5 inline-block w-full">
                              <p className="text-sm font-bold text-red-400 leading-tight">💬 {item.remark}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ปุ่มทำเสร็จแล้ว */}
                  <div className="p-4 bg-slate-800 border-t border-slate-700 shrink-0">
                    <button onClick={() => markAsDone(order.id)} className="cursor-pointer w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-xl font-black py-5 rounded-[1.5rem] shadow-lg shadow-emerald-900/50 transition-all active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/30">
                      <span className="text-2xl">✅</span> ทำเสร็จแล้ว
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}