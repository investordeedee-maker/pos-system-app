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
    const interval = setInterval(fetchOrders, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const markAsDone = async (orderId: string) => {
    try {
      await supabase.from("orders").update({ kitchen_status: "ready" }).eq("id", orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white font-bold text-xl">กำลังโหลดระบบห้องครัว...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6 font-sans">
      <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-2xl border border-gray-700">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-orange-500">👨‍🍳 จอรายการอาหาร (Kitchen Display)</h1>
          <p className="text-gray-400 text-sm mt-1">ออเดอร์จะแสดงอัตโนมัติ เรียงตามคิวก่อน-หลัง</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-gray-700 px-4 py-2 rounded-xl text-center">
            <p className="text-xs text-gray-400 font-bold">คิวรอทำ</p>
            <p className="text-2xl font-black text-white">{orders.length}</p>
          </div>
          <button onClick={() => router.push("/")} className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl font-bold transition-colors">
            🏠 ออก
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-full py-20 text-center text-gray-500">
            <span className="text-6xl mb-4 block">☕</span>
            <p className="text-2xl font-bold">ไม่มีคิวอาหารในขณะนี้</p>
          </div>
        ) : (
          orders.map((order) => {
            const orderTime = new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const isLate = (new Date().getTime() - new Date(order.created_at).getTime()) > 15 * 60 * 1000;

            return (
              <div key={order.id} className={`flex flex-col bg-gray-800 rounded-2xl overflow-hidden border-t-4 ${isLate ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : order.order_source === 'ONLINE' ? 'border-blue-500' : 'border-orange-500'}`}>
                <div className="p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-start shrink-0">
                  <div>
                    <h2 className="text-xl font-black text-white">{order.doc_no}</h2>
                    <p className="text-xs font-bold px-2 py-0.5 rounded bg-gray-700 mt-1 inline-block">
                      {order.order_source === "ONLINE" ? "🌐 ออนไลน์" : "🏪 หน้าร้าน"}
                    </p>
                  </div>
                  <div className={`text-xl font-black ${isLate ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>
                    {orderTime}
                  </div>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-gray-800/50">
                  {order.order_items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-lg">
                      <div className="flex gap-3">
                        <span className="font-black text-orange-400">{item.qty}</span>
                        <div>
                          <span className="font-bold text-gray-100">{item.products?.name || "สินค้า"}</span>
                          {item.remark && <p className="text-sm font-bold text-red-400 mt-0.5 ml-1">↳ {item.remark}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-gray-800 border-t border-gray-700 shrink-0">
                  <button onClick={() => markAsDone(order.id)} className="cursor-pointer w-full bg-green-600 hover:bg-green-500 text-white text-lg font-black py-4 rounded-xl shadow-lg transition-all active:scale-95">
                    ✅ ทำเสร็จแล้ว (พร้อมเสิร์ฟ)
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}