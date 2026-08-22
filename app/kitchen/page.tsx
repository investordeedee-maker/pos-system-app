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
  status: string;
  order_items: OrderItem[];
}

export default function KitchenDisplayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        if (data && isMounted) {
          // กรองไม่ให้บิลออนไลน์ที่ยังไม่ได้ตรวจสลิป (status = pending) แสดงผล
          const validOrders = data.filter(o => o.status === 'completed' || (o.status === 'pending' && o.order_source !== 'ONLINE'));
          setOrders(validOrders);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { 
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

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
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-gray-400 font-bold text-xl gap-4">
      <div className="w-16 h-16 border-4 border-gray-800 border-t-orange-500 rounded-full animate-spin"></div>
      กำลังโหลดระบบห้องครัว...
    </div>
  );

  return (
    <div className="min-h-screen bg-[#121212] text-gray-100 p-4 md:p-6 font-sans overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-6 bg-[#1e1e1e] p-5 rounded-2xl border border-gray-800 shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-600 rounded-xl flex items-center justify-center text-3xl shadow-lg">
            👨‍🍳
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">Kitchen Display <span className="text-orange-500 hidden sm:inline">(KDS)</span></h1>
            <p className="text-gray-400 text-sm mt-0.5 font-medium">จัดการคิวอาหารและเครื่องดื่ม</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#121212] px-6 py-2.5 rounded-xl border border-gray-800 flex flex-col items-center justify-center min-w-[100px]">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">คิวรอทำ</p>
            <p className="text-2xl font-black text-orange-500 leading-none mt-1">{orders.length}</p>
          </div>
          <button onClick={toggleFullscreen} className="cursor-pointer bg-[#2a2a2a] hover:bg-gray-700 text-gray-300 w-14 h-14 rounded-xl font-bold transition-colors flex items-center justify-center text-2xl border border-gray-700">
            {isFullscreen ? "🗗" : "🖵"}
          </button>
          <button onClick={() => router.push("/")} className="cursor-pointer bg-[#2a2a2a] hover:bg-red-600 text-gray-300 hover:text-white w-14 h-14 rounded-xl font-bold transition-colors flex items-center justify-center text-2xl border border-gray-700">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8 pr-2 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {orders.length === 0 ? (
            <div className="col-span-full py-32 flex flex-col items-center justify-center text-gray-600 bg-[#1e1e1e]/50 rounded-[2rem] border border-gray-800 border-dashed">
              <div className="text-8xl mb-6 opacity-30 grayscale">🍳</div>
              <p className="text-3xl font-black tracking-tight text-gray-500">ไม่มีคิวอาหารในขณะนี้</p>
              <p className="text-gray-600 mt-2 font-medium">พร้อมรับออเดอร์ถัดไป</p>
            </div>
          ) : (
            orders.map((order) => {
              const orderTime = new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
              const isLate = (new Date().getTime() - new Date(order.created_at).getTime()) > 15 * 60 * 1000;
              const isUnpaid = order.status === "pending" && order.order_source !== "ONLINE";

              return (
                <div key={order.id} className={`flex flex-col bg-[#1e1e1e] rounded-[1.5rem] overflow-hidden border-2 shadow-lg transition-all duration-300 animate-fade-in-up ${isLate ? 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.15)]' : order.order_source === 'ONLINE' ? 'border-blue-600' : 'border-gray-700'}`}>
                  <div className="p-4 bg-[#252525] border-b border-gray-800 flex justify-between items-start shrink-0 relative">
                    <div className="relative z-10">
                      <h2 className="text-2xl font-black text-white tracking-tight">{order.doc_no}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider ${order.order_source === 'ONLINE' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                          {order.order_source === "ONLINE" ? "🌐 ออนไลน์" : "🏪 หน้าร้าน"}
                        </span>
                        
                        {isUnpaid && (
                          <span className="text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/50">
                            ⏳ ยังไม่ชำระเงิน
                          </span>
                        )}

                        {isLate && (
                          <span className="text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider bg-red-600 text-white animate-pulse">
                            ⏰ รอนาน
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`relative z-10 text-2xl font-black tabular-nums ${isLate ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                      {orderTime}
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-[#1a1a1a] min-h-[14rem]">
                    {order.order_items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-10 h-10 shrink-0 bg-[#2a2a2a] text-green-400 border border-gray-700 rounded-lg flex items-center justify-center font-black text-xl shadow-sm">
                          {item.qty}
                        </div>
                        <div className="pt-1 flex-1">
                          <span className="font-bold text-gray-200 text-lg leading-tight block">{item.products?.name || "สินค้า"}</span>
                          {item.remark && (
                            <div className="bg-red-950/30 border border-red-900/50 rounded p-2 mt-2 inline-block w-full">
                              <p className="text-sm font-bold text-red-400 leading-tight">💬 หมายเหตุ: {item.remark}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-[#252525] border-t border-gray-800 shrink-0">
                    <button onClick={() => markAsDone(order.id)} className="cursor-pointer w-full bg-green-700 hover:bg-green-600 text-white text-lg font-black py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md">
                      <span className="text-xl">✅</span> ทำเสร็จแล้ว
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